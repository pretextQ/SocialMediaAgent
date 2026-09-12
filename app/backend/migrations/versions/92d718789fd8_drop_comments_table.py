"""drop comments table

Revision ID: 92d718789fd8
Revises: 4ba5ff8d031c
Create Date: 2026-09-12 16:49:27.740322

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# Custom column types (e.g. UTCDateTime) are rendered fully-qualified by
# autogenerate, so this import must be present or the migration raises NameError.
import socialmedia_agent.database.base  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = '92d718789fd8'
down_revision: Union[str, Sequence[str], None] = '4ba5ff8d031c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """删除 Comment 模型后遗留的 comments 表。

    存在才删——全新库上这条迁移应为空操作（baseline 里本就没有该表）。
    """
    bind = op.get_bind()
    if "comments" in sa.inspect(bind).get_table_names():
        op.drop_table("comments")


def downgrade() -> None:
    """不重建。

    Comment 模型已从代码中移除；重建一张没有 ORM 映射、没有 repo/API 的表没有意义。
    """
    pass
