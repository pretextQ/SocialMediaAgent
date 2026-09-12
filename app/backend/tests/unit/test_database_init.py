from sqlalchemy import inspect, text

from socialmedia_agent.database.engine import create_db_engine, get_database_url
from socialmedia_agent.database.session import Database
from socialmedia_agent.models import Base


def test_all_core_tables_created(tmp_path):
    engine = create_db_engine(f"sqlite:///{tmp_path / 'db.sqlite'}")
    Base.metadata.create_all(engine)
    tables = set(inspect(engine).get_table_names())
    assert {"accounts", "contents", "metrics", "topics"} <= tables
    engine.dispose()


def test_database_create_all_and_session(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'sma.db'}")
    db.create_all()
    with db.session() as session:
        assert session.execute(text("SELECT 1")).scalar() == 1
    db.engine.dispose()


def test_default_database_url_is_sqlite_file():
    url = get_database_url()
    assert url.startswith("sqlite:///")
    assert url.endswith("sma.db")


def test_in_memory_database_works():
    engine = create_db_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tables = set(inspect(engine).get_table_names())
    assert "accounts" in tables
    engine.dispose()
