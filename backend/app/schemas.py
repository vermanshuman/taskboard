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
    attachment_name: str | None
    completed: int
    completed_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
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
    is_done: bool = False  # name matches a "done" synonym; cards here count as finished
    cards: list[CardOut] = []


# ---- audit log ----
class ActivityLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_email: str
    action_text: str
    created_at: datetime


# ---- members ----
class MemberAdd(BaseModel):
    email: EmailStr


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    email: EmailStr
    full_name: str | None
    avatar_color: str
    role: str


# ---- boards ----
class BoardCreate(BaseModel):
    name: str


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    owner_id: int
    role: str = "member"  # the requesting user's role on this board


class BoardDetail(BoardOut):
    lists: list[ListOut] = []
    members: list[MemberOut] = []
    activity_logs: list[ActivityLogOut] = []  # most recent ACTIVITY_PREVIEW only; page via /activity


class ActivityPage(BaseModel):
    items: list[ActivityLogOut]
    next_before_id: int | None  # pass as ?before_id= to get the next (older) page; null = end


# ---- semantic search ----
class SemanticSearchRequest(BaseModel):
    query: str


class SemanticSearchResult(BaseModel):
    card_id: int
    title: str
    description: str
    list_id: int
    list_name: str
    score: float


class SemanticSearchResponse(BaseModel):
    results: list[SemanticSearchResult]