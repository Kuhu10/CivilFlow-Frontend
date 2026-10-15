from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder


def success(request: Request, data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata: dict[str, Any] = {"request_id": getattr(request.state, "request_id", "unknown")}
    if meta:
        metadata.update(meta)
    return {"data": jsonable_encoder(data), "meta": metadata}
