"""Auth routes: register, login, get current user."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import User
from services.auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(body: AuthRequest, db: Session = Depends(get_db)):
    """Create a new user account. Returns JWT token."""
    username = body.username.strip()
    password = body.password.strip()

    if not username or len(username) < 2:
        raise HTTPException(status_code=400, detail="用户名至少 2 个字符")
    if not password or len(password) < 4:
        raise HTTPException(status_code=400, detail="密码至少 4 个字符")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="用户名已存在")

    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return {"token": token, "user": {"id": user.id, "username": user.username}}


@router.post("/login")
def login(body: AuthRequest, db: Session = Depends(get_db)):
    """Login and return JWT token."""
    username = body.username.strip()
    password = body.password.strip()

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token(user.id)
    return {"token": token, "user": {"id": user.id, "username": user.username}}


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    """Return current logged-in user info."""
    return {"id": user.id, "username": user.username}
