"""Agent 内部 Tool 基础契约。

Tool 是对「可被 LangGraph 节点调用的能力」的统一封装：
- name/description：供 LLM 工具选择
- args_schema：Pydantic 参数校验
- fn：实现函数（注入依赖，见 ToolContext）

架构约束：Agent 只能通过 Tool/Service 获取数据，禁止直接访问数据库或第三方内部实现。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Type

from pydantic import BaseModel

from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag.retriever import Retriever


@dataclass
class ToolContext:
    """Tool 运行所需的依赖集合（Repository 走 database session 惰性创建）。"""

    database: Database
    retriever: Retriever | None = None
    memory_store: SQLAlchemyMemoryStore | None = None
    summarizer: Summarizer | None = None


class Tool:
    def __init__(
        self,
        name: str,
        description: str,
        args_schema: Type[BaseModel],
        fn: Callable[..., Any],
    ):
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self.fn = fn

    def invoke(self, **kwargs: Any) -> Any:
        validated = self.args_schema(**kwargs)
        return self.fn(**validated.model_dump())
