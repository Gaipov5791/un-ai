"""Lazy KaniTTS loader. torch and kani-tts are imported on first use."""

from __future__ import annotations

import threading
from typing import Any

from config import SAMPLE_RATE, KaniSettings, public_error


def select_speaker(voice: str, status: str | None, speakers: list[str] | None) -> str | None:
    """Pass speaker_id only for the multispeaker Kyrgyz checkpoint.

    A single-speaker model still accepts the argument and then prefixes the
    text with the name, which changes the utterance. Skip it in that case.
    """
    if status != "multispeaker":
        return None
    names = [str(item).strip() for item in (speakers or []) if str(item).strip()]
    requested = voice.strip()
    if requested and requested in names:
        return requested
    return names[0] if names else None


class EnginePool:
    def __init__(self, settings: KaniSettings) -> None:
        self.settings = settings
        self._engine: Any = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()
        self.state = "idle"
        self.detail = ""
        self.device_actual = settings.device
        self.sample_rate = SAMPLE_RATE

    def snapshot(self) -> dict[str, str]:
        return {
            "status": self.public_status(),
            "service": "un-ai-kani",
            "model": self.settings.model,
            "device": self.device_actual,
            "voice": self.settings.voice,
            "ready": "yes" if self.state == "ok" else "no",
            "detail": self.detail,
        }

    def public_status(self) -> str:
        if self.state == "ok":
            return "ok"
        if self.state == "loading":
            return "loading"
        if self.state == "missing":
            return "missing_kani_tts"
        if self.state == "error":
            return "error"
        return "idle"

    def preload_async(self) -> None:
        if self.state == "ok":
            return
        threading.Thread(target=self._load_safe, name="kani-preload", daemon=True).start()

    def _load_safe(self) -> None:
        try:
            self.load()
        except Exception as exc:
            if self.state not in {"missing", "error"}:
                self.state = "error"
                self.detail = public_error(exc)

    def load(self) -> Any:
        with self._load_lock:
            if self._engine is not None:
                return self._engine
            self.state = "loading"
            self.detail = ""
            try:
                engine = self._build()
            except ImportError as exc:
                self.state = "missing"
                self.detail = public_error(exc)
                raise
            except Exception as exc:
                self.state = "error"
                self.detail = public_error(exc)
                raise
            self._engine = engine
            rate = getattr(engine, "sample_rate", SAMPLE_RATE)
            self.sample_rate = int(rate or SAMPLE_RATE)
            self.state = "ok"
            return engine

    def _build(self) -> Any:
        import torch
        from kani_tts import KaniTTS

        if self.settings.device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("KANI_DEVICE=cuda, но CUDA недоступна")
        engine = KaniTTS(
            self.settings.model,
            device_map=self.settings.device_map,
            show_info=True,
            suppress_logs=True,
        )
        if self.settings.device == "cpu" or not torch.cuda.is_available():
            self.device_actual = "cpu"
        else:
            self.device_actual = "cuda"
        return engine

    def speak(self, text: str, voice: str) -> tuple[Any, str]:
        engine = self.load()
        speaker = select_speaker(
            voice,
            getattr(engine, "status", None),
            list(getattr(engine, "speaker_list", []) or []),
        )
        with self._infer_lock:
            if speaker:
                return engine(text, speaker_id=speaker)
            return engine(text)
