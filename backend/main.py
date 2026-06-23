from __future__ import annotations

from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urljoin

import httpx
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


CONFIG_PATH = Path(__file__).with_name("config.yaml")


def load_config() -> dict[str, Any]:
    default = {
        "proxy_url": "http://localhost:8025",
        "provider": {"base_url": "http://localhost:5000/v1", "api_key": "", "model": ""},
    }
    if not CONFIG_PATH.exists():
        return default
    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        loaded = yaml.safe_load(file) or {}
    provider = {**default["provider"], **(loaded.get("provider") or {})}
    return {**default, **loaded, "provider": provider}


app = FastAPI(title="hungry-rp proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProviderConfig(BaseModel):
    baseUrl: str = Field(..., min_length=1)
    apiKey: str = ""


class ModelRequest(ProviderConfig):
    pass


class ChatStreamRequest(ProviderConfig):
    model: str = Field(..., min_length=1)
    messages: list[dict[str, Any]]
    temperature: float | None = 0.7
    top_p: float | None = 0.9
    max_tokens: int | None = None


def normalize_base_url(base_url: str) -> str:
    base = base_url.strip().rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="baseUrl is required")
    return f"{base}/"


def provider_url(base_url: str, path: str) -> str:
    return urljoin(normalize_base_url(base_url), path.lstrip("/"))


def headers(api_key: str) -> dict[str, str]:
    result = {"Accept": "application/json"}
    if api_key:
        result["Authorization"] = f"Bearer {api_key}"
    return result


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
async def config() -> dict[str, Any]:
    loaded = load_config()
    provider = loaded.get("provider") or {}
    return {
        "proxyUrl": loaded.get("proxy_url") or "http://localhost:8025",
        "provider": {
            "baseUrl": provider.get("base_url") or "http://localhost:5000/v1",
            "apiKey": provider.get("api_key") or "",
            "model": provider.get("model") or "",
        },
    }


@app.post("/api/models")
async def models(request: ModelRequest) -> dict[str, Any]:
    url = provider_url(request.baseUrl, "models")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers(request.apiKey))
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


async def stream_provider(request: ChatStreamRequest) -> AsyncIterator[bytes]:
    payload: dict[str, Any] = {
        "model": request.model,
        "messages": request.messages,
        "stream": True,
        "temperature": request.temperature,
        "top_p": request.top_p,
    }

    if request.max_tokens is not None and request.max_tokens > 0:
        payload["max_tokens"] = request.max_tokens

    url = provider_url(request.baseUrl, "chat/completions")
    request_headers = headers(request.apiKey)
    request_headers["Accept"] = "text/event-stream"
    request_headers["Content-Type"] = "application/json"

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, json=payload, headers=request_headers) as response:
                if response.status_code >= 400:
                    detail = await response.aread()
                    yield f"event: error\ndata: {detail.decode('utf-8', errors='replace')}\n\n".encode()
                    return

                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
    except httpx.HTTPError as exc:
        yield f"event: error\ndata: {str(exc)}\n\n".encode()


@app.post("/api/chat/stream")
async def chat_stream(request: ChatStreamRequest) -> StreamingResponse:
    return StreamingResponse(stream_provider(request), media_type="text/event-stream")
