"""Topic Repository 测试（TDD，P4-2）。

覆盖：
- upsert 按 keyword 幂等（重复 upsert 更新 post_count 不产生重复行）
- list 按 platform 过滤（platforms JSON 数组包含匹配）
- list 按 since（last_seen 在周期内）过滤
"""

from datetime import datetime, timedelta, timezone

from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.repositories.topic_repo import TopicRepository

NOW = datetime(2026, 8, 24, 12, 0, 0, tzinfo=timezone.utc)


def _topic(keyword: str, platform: Platform, last_seen: datetime, post_count: int) -> Topic:
    return Topic(keyword=keyword, platforms=[platform], last_seen=last_seen, post_count=post_count)


def test_topic_upsert_dedupes_by_keyword(db_session):
    repo = TopicRepository(db_session)
    repo.upsert(_topic("AI 绘画", Platform.BILIBILI, NOW, 10))
    repo.upsert(_topic("AI 绘画", Platform.BILIBILI, NOW, 30))
    rows = repo.list()
    assert len(rows) == 1
    assert rows[0].post_count == 30


def test_topic_list_filters_platform_and_since(db_session):
    repo = TopicRepository(db_session)
    repo.upsert(_topic("AI 绘画", Platform.BILIBILI, NOW, 30))
    repo.upsert(_topic("职场效率", Platform.BILIBILI, NOW - timedelta(days=30), 5))
    repo.upsert(_topic("美食探店", Platform.XIAOHONGSHU, NOW, 50))

    since = NOW - timedelta(days=7)
    rows = repo.list(platform="bilibili", since=since)
    assert [r.keyword for r in rows] == ["AI 绘画"]
    assert rows[0].post_count == 30

    rows_all = repo.list()
    assert len(rows_all) == 3
