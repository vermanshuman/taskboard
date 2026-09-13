"""Seed a demo user + sample board so the live demo is never empty.

Run inside the backend container:  python -m app.seed
Idempotent: re-running won't duplicate the demo data.
"""
from datetime import datetime, timedelta

from .database import SessionLocal, ensure_schema
from . import models
from .security import hash_password

DEMO_EMAIL = "demo@taskboard.dev"
DEMO_PASSWORD = "demo1234"


def run() -> None:
    ensure_schema()
    db = SessionLocal()
    try:
        if db.query(models.User).filter_by(email=DEMO_EMAIL).first():
            print("Demo data already present; skipping.")
            return

        user = models.User(
            email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD)
        )
        db.add(user)
        db.flush()

        board = models.Board(name="Product Roadmap", owner_id=user.id)
        db.add(board)
        db.flush()
        db.add(
            models.BoardMembership(board_id=board.id, user_id=user.id, role="owner")
        )

        columns = {
            "Backlog": [
                ("Research competitors", 0),
                ("Draft Q3 OKRs", 0),
            ],
            "In Progress": [
                ("Build auth flow", 0),
                ("Design board UI", 0),
            ],
            "Done": [
                ("Set up CI/CD", 1),
                ("Write project spec", 1),
            ],
        }
        for li, (col_name, cards) in enumerate(columns.items(), start=1):
            lst = models.List(name=col_name, board_id=board.id, position=li)
            db.add(lst)
            db.flush()
            for ci, (title, completed) in enumerate(cards, start=1):
                db.add(
                    models.Card(
                        title=title,
                        description="",
                        list_id=lst.id,
                        position=ci,
                        completed=completed,
                        due_date=datetime.utcnow() + timedelta(days=ci),
                    )
                )

        db.commit()
        print(f"Seeded demo user {DEMO_EMAIL} / {DEMO_PASSWORD} and a sample board.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
