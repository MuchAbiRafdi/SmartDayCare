from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..deps import Auth, require_auth
from ..events import air, broadcaster

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events")
async def events(request: Request, auth: Auth = Depends(require_auth)) -> StreamingResponse:
    """Aliran peristiwa (SSE): perubahan catatan, pengaturan, dan pembacaan udara."""

    async def gen() -> AsyncIterator[str]:
        q = broadcaster.subscribe()
        try:
            yield "retry: 3000\n\n"
            yield f"event: air\ndata: {json.dumps(air.snapshot(), ensure_ascii=False)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20)
                    yield msg
                except TimeoutError:
                    yield ": ping\n\n"
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
