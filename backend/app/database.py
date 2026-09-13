from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

IS_SQLITE = settings.database_url.startswith("sqlite")

# sqlite needs a special flag for use across threads; Postgres does not.
connect_args = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


if IS_SQLITE:
    # SQLite ignores ON DELETE CASCADE unless foreign keys are switched on
    # per connection. Postgres enforces them by default.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fks(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """Create missing tables and add missing columns.

    create_all() only creates tables that don't exist; it never alters existing
    ones. This lightweight migration adds any column that exists on a model but
    not in the database, which is enough for the additive changes this project
    makes (no renames/drops). Swap for Alembic if the schema gets complex.
    """
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                col_type = col.type.compile(engine.dialect)
                ddl = f'ALTER TABLE {table.name} ADD COLUMN "{col.name}" {col_type}'
                if col.default is not None and getattr(col.default, "is_scalar", False):
                    ddl += f" DEFAULT {_sql_literal(col.default.arg)}"
                conn.execute(text(ddl))
                print(f"[schema] added column {table.name}.{col.name}")


def _sql_literal(value) -> str:
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)
