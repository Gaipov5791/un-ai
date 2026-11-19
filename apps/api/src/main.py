from __future__ import annotations

import json
import os
import time
from typing import Optional

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.protobuf.json_format import ParseDict
from livekit import api
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest, RoomAgentDispatch
from livekit.protocol.room import CreateRoomRequest, RoomConfiguration
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")
load_dotenv()

AGENT_NAME = os.getenv("UNAI_AGENT_NAME", "un-ai-receptionist")

app = FastAPI(title="un-ai api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex="http://(localhost|127\\.0\\.0\\.1):5173",
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class TokenRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    room_name: Optional[str] = Field(default=None, alias="roomName")
    participant_identity: Optional[str] = Field(default=None, alias="participantIdentity")
    participant_name: Optional[str] = Field(default=None, alias="participantName")
    participant_metadata: Optional[str] = Field(default=None, alias="participantMetadata")
    participant_attributes: Optional[dict[str, str]] = Field(default=None, alias="participantAttributes")
    room_config: Optional[dict] = Field(default=None, alias="roomConfig")


def _as_language(value: object) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if raw in ("ky", "ru"):
        return raw
    if raw.startswith("{"):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        lang = str(parsed.get("language") or "").strip().lower()
        if lang in ("ky", "ru"):
            return lang
    return None


def extract_language(request: TokenRequest) -> str:
    agents = (request.room_config or {}).get("agents") or []
    if agents and isinstance(agents[0], dict):
        found = _as_language(agents[0].get("metadata") or agents[0].get("agentMetadata"))
        if found:
            return found
    attrs = request.participant_attributes or {}
    found = _as_language(attrs.get("language") or attrs.get("lang"))
    if found:
        return found
    found = _as_language(request.participant_metadata)
    return found or "ru"


def build_room_config(raw: Optional[dict], language: str) -> RoomConfiguration:
    config = RoomConfiguration()
    if raw:
        try:
            ParseDict(raw, config, ignore_unknown_fields=True)
        except Exception:
            config = RoomConfiguration()
    if not any(agent.agent_name == AGENT_NAME for agent in config.agents):
        config.agents.append(RoomAgentDispatch(agent_name=AGENT_NAME, metadata=language))
    for agent in config.agents:
        agent.metadata = language
    return config


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "un-ai-api"}


@app.post("/api/token", status_code=201)
async def get_token(request: TokenRequest) -> dict[str, str]:
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    server_url = os.getenv("LIVEKIT_URL")
    if not all([api_key, api_secret, server_url]):
        raise HTTPException(
            status_code=503,
            detail="Нет LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Скопируйте .env.example в .env",
        )

    room_name = request.room_name or f"un-ai-{int(time.time())}"
    identity = request.participant_identity or f"caller-{int(time.time())}"
    name = request.participant_name or "Клиент"
    language = extract_language(request)
    room_config = build_room_config(request.room_config, language)
    agent_names = [agent.agent_name for agent in room_config.agents]
    attributes = dict(request.participant_attributes or {})
    attributes["language"] = language

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(name)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room_create=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .with_room_config(room_config)
        .with_metadata(request.participant_metadata or language)
        .with_attributes(attributes)
    )

    dispatch_id = ""
    lkapi = api.LiveKitAPI(server_url, api_key, api_secret)
    try:
        await lkapi.room.create_room(CreateRoomRequest(name=room_name))
        dispatch = await lkapi.agent_dispatch.create_dispatch(
            CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room_name,
                metadata=language,
            )
        )
        dispatch_id = dispatch.id
    except Exception as exc:
        print(f"un-ai: dispatch failed room={room_name} error={exc}", flush=True)
    finally:
        await lkapi.aclose()

    print(
        f"un-ai: token room={room_name} language={language} agents={agent_names} dispatch={dispatch_id or 'none'}",
        flush=True,
    )

    return {
        "server_url": server_url,
        "participant_token": token.to_jwt(),
    }
