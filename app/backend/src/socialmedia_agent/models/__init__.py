"""ORM 模型注册：import 后 Base.metadata 才会包含全部表。"""

from socialmedia_agent.database.base import Base

from . import account, content, metric, observation, topic
from .account import AccountModel
from .content import ContentModel
from .metric import MetricModel
from .observation import MetricObservationModel, TopicObservationModel
from .topic import TopicModel

__all__ = [
    "Base",
    "AccountModel",
    "ContentModel",
    "MetricModel",
    "MetricObservationModel",
    "TopicModel",
    "TopicObservationModel",
]
