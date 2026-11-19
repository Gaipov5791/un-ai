"""OpenAI-compatible KaniTTS for a test GPU (Kaggle T4). Wraps kani-tts, no custom vocoder."""

from __future__ import annotations

import io
import os
import threading
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

SAMPLE_RATE = 22050
MODEL_ID = os.getenv("KANI_MODEL", "nineninesix/kani-tts-400m-ky")
DEFAULT_VOICE = os.getenv("KANI_VOICE", "elina")

app = FastAPI(title="un-ai kani-tts")
_lock = threading.Lock()
_engine = None


class SpeechRequest(BaseModel):
    input: str
    model: Optional[str] = None
    voice: Optional[str] = Field(default=None)
    response_format: Optional[str] = "wav"


def _load_engine():
    global _engine
    if _engine is not None:
        return _engine
    from kani_tts import KaniTTS

    _engine = KaniTTS(MODEL_ID, show_info=True, suppress_logs=True)
    return _engine


def _to_wav_bytes(audio) -> bytes:
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    wave = np.asarray(audio).squeeze()
    if wave.ndim != 1:
        raise HTTPException(status_code=500, detail="KaniTTS вернул неожиданную форму аудио")
    buf = io.BytesIO()
    sf.write(buf, wave, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _speak(text: str, voice: str):
    engine = _load_engine()
    with _lock:
        try:
            return engine(text, speaker_id=voice)
        except TypeError:
            return engine(text)


@app.get("/health")
def health() -> dict[str, str]:
    try:
        import kani_tts  # noqa: F401
        installed = "yes"
    except ImportError:
        installed = "no"
    return {
        "status": "ok" if installed == "yes" else "missing_kani_tts",
        "service": "un-ai-kani",
        "model": MODEL_ID,
        "kani_tts": installed,
        "ready": "yes" if _engine is not None else "no",
    }


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest) -> Response:
    text = request.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty input")
    voice = (request.voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    try:
        audio, _generated = _speak(text, voice)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"KaniTTS: {exc}") from exc
    return Response(
        content=_to_wav_bytes(audio),
        media_type="audio/wav",
        headers={"X-Sample-Rate": str(SAMPLE_RATE), "X-Voice": voice},
    )
