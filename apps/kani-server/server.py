"""OpenAI-compatible KaniTTS sidecar for Kyrgyz replies.

The Node agent POSTs /v1/audio/speech. Russian stays on Cartesia and never
calls this process. If the model is not ready, /health is not "ok" and the
agent keeps the existing on-screen Kyrgyz reply.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from audio import to_wav_bytes
from config import accepts_api_key, load_settings, prepare_process_device, public_error
from engine import EnginePool

logger = logging.getLogger("un-ai.kani")

settings = load_settings()
prepare_process_device(settings.device)
pool = EnginePool(settings)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.preload:
        logger.info("loading %s on %s", settings.model, settings.device)
        pool.preload_async()
    yield


app = FastAPI(title="un-ai kani-tts", lifespan=lifespan)


class SpeechRequest(BaseModel):
    input: str
    model: Optional[str] = None
    voice: Optional[str] = Field(default=None)
    response_format: Optional[str] = "wav"


@app.get("/health")
def health() -> dict[str, str]:
    return pool.snapshot()


@app.post("/v1/audio/speech")
def speech(body: SpeechRequest, request: Request) -> Response:
    if not accepts_api_key(settings.api_key, request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="invalid api key")
    text = body.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty input")
    if body.model and body.model not in {settings.model, "tts-1", "tts-1-hd"}:
        logger.warning("request model %s ignored; loaded %s", body.model, settings.model)
    voice = (body.voice or settings.voice).strip() or settings.voice
    try:
        audio, _generated = pool.speak(text, voice)
        wav = to_wav_bytes(audio, pool.sample_rate)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"KaniTTS: {public_error(exc)}") from exc
    return Response(
        content=wav,
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(pool.sample_rate),
            "X-Voice": voice,
            "X-Model": settings.model,
            "X-Device": pool.device_actual,
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )
