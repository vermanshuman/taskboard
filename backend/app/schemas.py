from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr


# ---- auth ----
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = "Anonymous User"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    avatar_color: str
    full_name: str | None

# Add this new class mapping near your auth schemas block
class ProfileUpdate(BaseModel):
    avatar_color: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- cards ----
class CardCreate(BaseModel):
    title: str
    description: str = ""
    due_date: datetime | None = None
    labels: str = ""


class CardUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    labels: str | None = None
    completed: int | None = None


class CardMove(BaseModel):
    list_id: int
    position: int


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str
    position: int
    due_date: datetime | None
    labels: str
    attachment_path: str | None
    completed: int
    list_id: int


# ---- lists ----
class ListCreate(BaseModel):
    name: str


class ListUpdate(BaseModel):
    name: str | None = None
    position: int | None = None


class ListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    position: int
    board_id: int
    cards: list[CardOut] = []


# ---- audit log ----
class ActivityLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_email: str
    action_text: str
    created_at: datetime


# ---- boards ----
class BoardCreate(BaseModel):
    name: str


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    owner_id: int


class BoardDetail(BoardOut):
    lists: list[ListOut] = []
    activity_logs: list[ActivityLogOut] = []  # Added active audit history log layer


# ---- agent ----
class AgentPromptRequest(BaseModel):
    prompt: str