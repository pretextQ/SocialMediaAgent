"""周报读取接口（前端 P7 依赖的后端小改动）。

GET /api/v1/reports          列出周报目录下的 *.md（按修改时间倒序）
GET /api/v1/reports/{name}   读取单篇周报正文（UTF-8）

背景：周报此前只由 APScheduler 落盘为 Markdown，**没有任何 HTTP 读取入口**
（见 docs/plan-frontend.md 第五节）。目录取自配置 `SMA_REPORT_DIR`（config.report_dir），
与 GET /system/status 的 report_dir 是同一来源。

安全：`{name}` 只接受「单个普通文件名」——拒绝空、"."、".."、路径分隔符与盘符，
解析后再次校验父目录必须是 report_dir 本身，防止目录穿越。
非法名与不存在的文件**一律返回 404**（刻意不区分：不泄露目录结构，也不给出「存在但拒绝」的信号）。
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from socialmedia_agent.config import Settings, get_settings

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportSummary(BaseModel):
    name: str
    size: int
    modified_at: str


class ReportListResponse(BaseModel):
    reports: list[ReportSummary]


class ReportDetailResponse(BaseModel):
    name: str
    content: str


def _report_base(settings: Settings) -> Path:
    return Path(settings.report_dir).resolve()


def _resolve_report(settings: Settings, name: str) -> Path:
    """把 {name} 安全解析为 report_dir 内的文件路径；非法名或不存在抛 404（不越界）。"""
    base = _report_base(settings)
    # 只允许单个普通文件名：这一段同时挡住 "", ".", "..", "a/b", "a\\b", "C:\\x"
    if not name or name in {".", ".."} or Path(name).name != name:
        raise HTTPException(status_code=404, detail="report not found")
    if "/" in name or "\\" in name or ":" in name:
        raise HTTPException(status_code=404, detail="report not found")

    candidate = (base / name).resolve()
    if candidate.parent != base or not candidate.is_file():
        raise HTTPException(status_code=404, detail="report not found")
    return candidate


def _modified_at(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


@router.get(
    "",
    response_model=ReportListResponse,
    summary="周报列表",
    description="列出周报目录下的 *.md，按修改时间倒序；目录不存在时返回空数组（不报错）。",
)
def list_reports(settings: Settings = Depends(get_settings)) -> ReportListResponse:
    base = _report_base(settings)
    if not base.is_dir():
        return ReportListResponse(reports=[])

    files = [p for p in base.iterdir() if p.is_file() and p.suffix == ".md"]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return ReportListResponse(
        reports=[
            ReportSummary(name=p.name, size=p.stat().st_size, modified_at=_modified_at(p))
            for p in files
        ]
    )


@router.get(
    "/{name}",
    response_model=ReportDetailResponse,
    summary="读取单篇周报",
    description="按文件名读取周报正文（UTF-8）。文件名必须位于周报目录内，非法名或不存在返回 404。",
)
def get_report(
    name: str, settings: Settings = Depends(get_settings)
) -> ReportDetailResponse:
    path = _resolve_report(settings, name)
    return ReportDetailResponse(name=path.name, content=path.read_text(encoding="utf-8"))
