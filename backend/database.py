import os
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./stocks.db")
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


def create_db() -> None:
    SQLModel.metadata.create_all(engine)
    # Migrate existing stock table — add group_id if not present
    if "sqlite" in DATABASE_URL:
        with engine.connect() as conn:
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(stock)"))]
            if "group_id" not in cols:
                conn.execute(text(
                    "ALTER TABLE stock ADD COLUMN group_id INTEGER REFERENCES stockgroup(id)"
                ))
                conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
