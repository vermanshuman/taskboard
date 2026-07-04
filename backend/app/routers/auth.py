import uuid
import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import httpx

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, hash_password, verify_password
from ..config import settings  # Secure configuration mapping

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ProfileUpdatePayload(BaseModel):
    avatar_color: str
    full_name: str | None = None


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter_by(email=payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name or payload.email.split("@")[0]
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.Token(
        access_token=create_access_token(user.id), user=schemas.UserOut.model_validate(user)
    )


@router.post("/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(email=form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return schemas.Token(
        access_token=create_access_token(user.id), user=schemas.UserOut.model_validate(user)
    )


# --- LIVE GOOGLE OAUTH CHANNELS TIER (SECURED VIA ENV) ---

@router.get("/google/login")
def google_login():
    """Redirects the client browser directly to Google's authorization prompt window."""
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_client_id}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&redirect_uri={urllib.parse.quote(settings.google_redirect_uri, safe='')}"
    )
    return RedirectResponse(auth_url)


@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    """Receives code handshakes, verifies context from resource endpoints, and logs users in."""
    async with httpx.AsyncClient() as client:
        # 1. Exchange the secure string code for profile access tokens
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            },
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to retrieve token credentials from Google.")

        token_data = token_res.json()
        access_token = token_data.get("access_token")

        # 2. Extract verified profile metrics
        profile_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if profile_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to pull profile metrics from userinfo server.")

        google_user = profile_res.json()
        email = google_user.get("email")
        full_name = google_user.get("name", "Google User")

    if not email:
        raise HTTPException(status_code=400, detail="Google target profile lacks a verified email asset.")

    # 3. Handle data records checking/auto-provision logic paths
    user = db.query(models.User).filter_by(email=email).first()
    if not user:
        random_fallback_pass = hash_password(str(uuid.uuid4()))
        user = models.User(
            email=email,
            hashed_password=random_fallback_pass,
            full_name=full_name,
            avatar_color="#1ba9a0"  # Distinct color signature for social sign-ins
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 4. Generate local application JWT session authorization layer
    local_jwt = create_access_token(user.id)

    # 5. Route back to client app layout embedding token state inside URI queries
    encoded_name = urllib.parse.quote(user.full_name)
    frontend_redirect_url = f"http://localhost:5173/login?token={local_jwt}&email={user.email}&name={encoded_name}"
    return RedirectResponse(frontend_redirect_url)


@router.put("/profile", response_model=schemas.UserOut)
def update_profile(
        payload: ProfileUpdatePayload,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    if not payload.avatar_color.startswith("#") or len(payload.avatar_color) != 7:
        raise HTTPException(status_code=400, detail="Invalid hex color format sequence.")

    current_user.avatar_color = payload.avatar_color
    if payload.full_name and payload.full_name.strip():
        current_user.full_name = payload.full_name.strip()

    db.commit()
    db.refresh(current_user)
    return current_user