from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    avatar_color = Column(String(7), nullable=False, default="#5546e1")
    full_name = Column(String(255), nullable=True, default="Anonymous User")
    memberships = relationship(
        "BoardMembership", back_populates="user", cascade="all, delete-orphan"
    )


class Board(Base):
    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
    memberships = relationship(
        "BoardMembership", back_populates="board", cascade="all, delete-orphan"
    )
    # Lists are ordered by position; deleting a board deletes its lists.
    lists = relationship(
        "List",
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="List.position",
    )
    # Added relationship hook for active audit logs
    activity_logs = relationship(
        "ActivityLog",
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="ActivityLog.created_at.desc()",
    )


class BoardMembership(Base):
    """Links users to boards. role is 'owner' or 'member'."""

    __tablename__ = "board_memberships"
    __table_args__ = (UniqueConstraint("board_id", "user_id", name="uq_board_user"),)

    id = Column(Integer, primary_key=True, index=True)
    board_id = Column(Integer, ForeignKey("boards.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False, default="member")

    board = relationship("Board", back_populates="memberships")
    user = relationship("User", back_populates="memberships")


class List(Base):
    __tablename__ = "lists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    board_id = Column(Integer, ForeignKey("boards.id"), nullable=False)

    board = relationship("Board", back_populates="lists")
    cards = relationship(
        "Card",
        back_populates="list",
        cascade="all, delete-orphan",
        order_by="Card.position",
    )


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    position = Column(Integer, nullable=False, default=0)
    due_date = Column(DateTime, nullable=True)
    labels = Column(String(500), default="")  # comma-separated label names
    attachment_path = Column(String(500), nullable=True)
    completed = Column(Integer, default=0)  # 0/1; used by the stats view
    reminder_sent = Column(Integer, default=0)  # 0/1; used by the reminder job
    list_id = Column(Integer, ForeignKey("lists.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    list = relationship("List", back_populates="cards")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    board_id = Column(Integer, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    user_email = Column(String(255), nullable=False)
    action_text = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    board = relationship("Board", back_populates="activity_logs")