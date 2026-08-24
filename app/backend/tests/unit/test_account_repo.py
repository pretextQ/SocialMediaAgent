from sqlalchemy import func, select

from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import OwnerType, Platform
from socialmedia_agent.models import AccountModel
from socialmedia_agent.repositories.account_repo import AccountRepository


def test_insert_and_get(db_session):
    repo = AccountRepository(db_session)
    acc = Account(platform=Platform.BILIBILI, platform_id="12345", nickname="up")
    model = repo.upsert(acc)
    assert model.id
    got = repo.get(model.id)
    assert got.canonical_id == "bilibili:12345"
    assert got.nickname == "up"


def test_upsert_is_idempotent_by_canonical_id(db_session):
    repo = AccountRepository(db_session)
    a1 = Account(platform=Platform.BILIBILI, platform_id="12345", nickname="up")
    a2 = Account(platform=Platform.BILIBILI, platform_id="12345", nickname="renamed")
    m1 = repo.upsert(a1)
    m2 = repo.upsert(a2)
    assert m1.id == m2.id
    count = db_session.scalar(select(func.count()).select_from(AccountModel))
    assert count == 1
    assert m2.nickname == "renamed"


def test_to_domain_roundtrip(db_session):
    repo = AccountRepository(db_session)
    acc = Account(
        platform=Platform.DOUYIN,
        platform_id="abc",
        owner_type=OwnerType.OWNER,
        extra={"tags": ["美食"]},
    )
    repo.upsert(acc)
    got = repo.get(repo.list()[0].id)
    back = got.to_domain()
    assert back.platform == Platform.DOUYIN
    assert back.platform_id == "abc"
    assert back.owner_type == OwnerType.OWNER
    assert back.extra == {"tags": ["美食"]}
    assert back.canonical_id == "douyin:abc"


def test_list_with_platform_filter(db_session):
    repo = AccountRepository(db_session)
    repo.upsert(Account(platform=Platform.BILIBILI, platform_id="1"))
    repo.upsert(Account(platform=Platform.DOUYIN, platform_id="2"))
    got = repo.list(platform="douyin")
    assert len(got) == 1
    assert got[0].platform == "douyin"


def test_delete(db_session):
    repo = AccountRepository(db_session)
    model = repo.upsert(Account(platform=Platform.BILIBILI, platform_id="1"))
    repo.delete(model)
    assert repo.get(model.id) is None
