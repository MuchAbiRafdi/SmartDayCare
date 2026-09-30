from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, require_auth
from ..serialize import build_state, public_summary

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
def state(auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    return build_state(db, auth.user)


@router.get("/public")
def public(db: Session = Depends(get_db)) -> dict:
    return public_summary(db)


@router.get("/health")
def health() -> dict:
    return {"ok": True}
