"""Authentication for the SaaS app: password hashing, JWT session cookies, a
FastAPI current-user dependency, and a small user store on top of HasuraStore.

Self-contained (no third-party auth provider). Sessions are stateless JWTs
carried in an httpOnly cookie; the secret comes from JWT_SECRET (falls back to
API_TOKEN so existing deploys keep working, but set a dedicated JWT_SECRET).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from .hasura_store import HasuraStore

JWT_SECRET = (os.getenv("JWT_SECRET") or os.getenv("API_TOKEN") or "").strip()
JWT_ALG = "HS256"
SESSION_DAYS = 7
COOKIE_NAME = "lp_session"

# Fields we read back for a user (never expose password_hash to callers).
_USER_FIELDS = ("id email name plan monthly_quota usage_count usage_period "
                "is_active created_at")


# --- password hashing (bcrypt; max 72 bytes, so truncate) -------------------
def hash_password(password: str) -> str:
    pw = (password or "").encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw((password or "").encode("utf-8")[:72],
                              (password_hash or "").encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --- JWT session tokens -----------------------------------------------------
def create_session_token(user_id: str, email: str) -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET (or API_TOKEN) must be set to sign sessions")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=SESSION_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_session_token(token: str) -> Optional[Dict[str, Any]]:
    if not JWT_SECRET:
        return None
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# --- user store -------------------------------------------------------------
def get_user_by_email(store: HasuraStore, email: str) -> Optional[Dict[str, Any]]:
    """Includes password_hash (for login verification only)."""
    data = store.execute(
        "query($e:String!){users(where:{email:{_eq:$e}},limit:1)"
        "{id email name password_hash plan monthly_quota usage_count "
        "usage_period is_active}}",
        {"e": email.strip().lower()})
    rows = data.get("users") or []
    return rows[0] if rows else None


def get_user_by_id(store: HasuraStore, user_id: str) -> Optional[Dict[str, Any]]:
    data = store.execute(
        "query($id:uuid!){users_by_pk(id:$id){%s}}" % _USER_FIELDS,
        {"id": user_id})
    return data.get("users_by_pk")


def create_user(store: HasuraStore, email: str, password: str,
                name: str = "") -> Dict[str, Any]:
    """Insert a new user. Raises ValueError('email_taken') on duplicate email."""
    email = email.strip().lower()
    if get_user_by_email(store, email):
        raise ValueError("email_taken")
    try:
        return store.insert_one("users", {
            "email": email,
            "password_hash": hash_password(password),
            "name": name.strip() or None,
        }, returning=_USER_FIELDS)
    except RuntimeError as e:
        # Unique-constraint race -> normalize to the same error.
        if "Uniqueness violation" in str(e) or "duplicate key" in str(e):
            raise ValueError("email_taken") from e
        raise


# --- FastAPI dependencies ---------------------------------------------------
def _user_from_request(request: Request) -> Optional[Dict[str, Any]]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    payload = decode_session_token(token)
    if not payload:
        return None
    return {"id": payload.get("sub"), "email": payload.get("email")}


def current_user(request: Request) -> Dict[str, Any]:
    """Require a logged-in user; raise 401 otherwise. Returns {id, email}."""
    user = _user_from_request(request)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="not authenticated")
    return user


def optional_user(request: Request) -> Optional[Dict[str, Any]]:
    """Like current_user but returns None instead of raising (for public pages
    that render differently when logged in)."""
    return _user_from_request(request)


def set_session_cookie(response, token: str) -> None:
    """httpOnly session cookie. secure=True so it only rides HTTPS (Render is
    HTTPS); SameSite=Lax is fine for same-site form posts."""
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, secure=True,
        samesite="lax", max_age=SESSION_DAYS * 24 * 3600, path="/")


def clear_session_cookie(response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
