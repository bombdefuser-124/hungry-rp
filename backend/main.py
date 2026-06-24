from __future__ import annotations

import base64
import json
import os
import struct
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urljoin

import httpx
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.environ.get("HUNGRY_RP_CONFIG", PROJECT_ROOT / "config.yaml")).expanduser().resolve()


def config_section(config: dict[str, Any], name: str) -> dict[str, Any]:
    section = config.get(name)
    return section if isinstance(section, dict) else {}


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise RuntimeError(f"Missing config file: {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        loaded = yaml.safe_load(file) or {}
    if not isinstance(loaded, dict):
        loaded = {}
    return {
        "proxy_url": loaded.get("proxy_url") or "",
        "frontend": config_section(loaded, "frontend"),
        "backend": config_section(loaded, "backend"),
        "provider": config_section(loaded, "provider"),
    }


def required_backend_config(config: dict[str, Any]) -> tuple[str, int]:
    backend = config_section(config, "backend")
    host = backend.get("host")
    port = backend.get("port")
    if not host or not port:
        raise RuntimeError("backend.host and backend.port must be set in config.yaml")
    return str(host), int(port)


runtime_config = load_config()
backend_config = config_section(runtime_config, "backend")
frontend_config = config_section(runtime_config, "frontend")
configured_origins = backend_config.get("cors_origins") or []
cors_origins = [str(origin) for origin in configured_origins if origin]
frontend_url = frontend_config.get("url")
if frontend_url and frontend_url not in cors_origins:
    cors_origins.append(str(frontend_url))

app = FastAPI(title="hungry-rp proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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


class SillyTavernScanRequest(BaseModel):
    path: str = Field(..., min_length=1)


class SillyTavernImportRequest(SillyTavernScanRequest):
    user: str = ""
    characters: list[str] = Field(default_factory=list)
    personas: list[str] = Field(default_factory=list)
    presets: list[str] = Field(default_factory=list)


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
    provider = config_section(loaded, "provider")
    frontend = config_section(loaded, "frontend")
    return {
        "proxyUrl": loaded.get("proxy_url") or "",
        "frontendUrl": frontend.get("url") or "",
        "provider": {
            "baseUrl": provider.get("base_url") or "",
            "apiKey": provider.get("api_key") or "",
            "model": provider.get("model") or "",
        },
    }


def sillytavern_root(raw_path: str) -> Path:
    root = Path(raw_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=400, detail="SillyTavern path does not exist or is not a directory")
    data = root / "data"
    if not data.exists() or not data.is_dir():
        raise HTTPException(status_code=400, detail="Could not find SillyTavern data directory")
    return root


def sillytavern_users(root: Path) -> list[Path]:
    data = root / "data"
    return sorted([item for item in data.iterdir() if item.is_dir() and not item.name.startswith("_")], key=lambda item: item.name.lower())


def user_data_dir(root: Path, user: str) -> Path:
    users = {item.name: item for item in sillytavern_users(root)}
    if user and user not in users:
        raise HTTPException(status_code=400, detail=f"SillyTavern profile not found: {user}")
    selected = users.get(user) if user else next(iter(users.values()), None)
    if not selected:
        raise HTTPException(status_code=400, detail="No SillyTavern userdata directories found")
    return selected


def list_files(base: Path, directory: Path, extensions: set[str], recursive: bool = True) -> list[dict[str, str]]:
    if not directory.exists():
        return []
    items = []
    iterator = directory.rglob("*") if recursive else directory.iterdir()
    for item in sorted(iterator):
        if not item.is_file() or item.suffix.lower() not in extensions:
            continue
        rel = item.relative_to(base).as_posix()
        items.append({"id": rel, "label": item.stem, "path": rel})
    return items


def safe_user_file(user_dir: Path, rel_path: str) -> Path:
    path = (user_dir / rel_path).resolve()
    if not path.is_file() or not path.is_relative_to(user_dir.resolve()):
        raise HTTPException(status_code=400, detail=f"Invalid userdata file selection: {rel_path}")
    return path


def read_json_file(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def data_url(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".") or "png"
    mime = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/{mime};base64,{encoded}"


def png_text_chunks(path: Path) -> dict[str, str]:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return {}
    chunks: dict[str, str] = {}
    offset = 8
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        start = offset + 8
        end = start + length
        if end > len(data):
            break
        if chunk_type == b"tEXt":
            chunk = data[start:end]
            if b"\x00" in chunk:
                key, value = chunk.split(b"\x00", 1)
                chunks[key.decode("latin1", errors="replace")] = value.decode("latin1", errors="replace")
        offset = end + 4
    return chunks


def read_character_file(path: Path) -> dict[str, Any] | None:
    if path.suffix.lower() == ".json":
        card = read_json_file(path)
        if card:
            return {"sourceName": path.name, "card": card, "image": None}
    if path.suffix.lower() in {".png", ".apng"}:
        chunks = png_text_chunks(path)
        encoded = chunks.get("ccv3") or chunks.get("chara")
        if not encoded:
            return None
        try:
            card = json.loads(base64.b64decode(encoded).decode("utf-8"))
            return {"sourceName": path.name, "card": card, "image": data_url(path)}
        except Exception:
            return None
    return None


@app.post("/api/sillytavern/scan")
async def scan_sillytavern(request: SillyTavernScanRequest) -> dict[str, Any]:
    root = sillytavern_root(request.path)
    users = sillytavern_users(root)
    result = []
    for user_dir in users:
        persona_items = list_files(user_dir, user_dir / "User Avatars", {".png", ".jpg", ".jpeg", ".webp"}, recursive=False)
        persona_items.extend(list_files(user_dir, user_dir / "user", {".json"}, recursive=False))
        result.append({
            "name": user_dir.name,
            "characters": list_files(user_dir, user_dir / "characters", {".json", ".png", ".apng"}, recursive=False),
            "personas": persona_items,
            "presets": list_files(user_dir, user_dir / "OpenAI Settings", {".json"}),
        })
    return {"root": str(root), "users": result}


@app.post("/api/sillytavern/import")
async def import_sillytavern(request: SillyTavernImportRequest) -> dict[str, Any]:
    root = sillytavern_root(request.path)
    user_dir = user_data_dir(root, request.user)
    result: dict[str, Any] = {"user": user_dir.name, "characters": [], "personas": [], "presets": []}

    for rel_path in request.characters:
        path = safe_user_file(user_dir, rel_path)
        if path.suffix.lower() not in {".json", ".png", ".apng"}:
            continue
        character = read_character_file(path)
        if character:
            result["characters"].append(character)

    for rel_path in request.personas:
        path = safe_user_file(user_dir, rel_path)
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            result["personas"].append({"name": path.stem, "description": "", "image": data_url(path), "sourceName": path.name})
            continue
        if path.suffix.lower() == ".json":
            payload = read_json_file(path)
            if isinstance(payload, dict):
                result["personas"].append({
                    "name": payload.get("name") or payload.get("display_name") or path.stem,
                    "description": payload.get("description") or payload.get("persona") or payload.get("content") or "",
                    "image": None,
                    "sourceName": path.name,
                })

    for rel_path in request.presets:
        path = safe_user_file(user_dir, rel_path)
        if path.suffix.lower() != ".json":
            continue
        payload = read_json_file(path)
        if isinstance(payload, dict) and isinstance(payload.get("prompts"), list):
            result["presets"].append({"sourceName": path.name, "preset": payload})

    return result


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


if __name__ == "__main__":
    import uvicorn

    host, port = required_backend_config(load_config())
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
