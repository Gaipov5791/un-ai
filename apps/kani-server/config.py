"""Environment for the KaniTTS sidecar. No torch import here."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MODEL = "nineninesix/kani-tts-400m-ky"
DEFAULT_VOICE = "elina"
SAMPLE_RATE = 22050
ALLOWED_DEVICES = ("auto", "cpu", "cuda")


@dataclass(frozen=True)
class KaniSettings:
    model: str
    voice: str
    device: str
    device_map: str
    host: str
    port: int
    preload: bool
    api_key: str


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    if not key:
        return None
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    return key, value


def load_env_file(path: Path, override: bool) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if override or key not in os.environ:
            os.environ[key] = value


def load_repo_env() -> None:
    root = repo_root()
    load_env_file(root / ".env", override=False)
    load_env_file(root / ".env.local", override=True)


def _flag(value: str | None, default: bool) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def normalize_device(raw: str | None) -> str:
    device = (raw or "auto").strip().lower()
    if device == "gpu":
        device = "cuda"
    if device not in ALLOWED_DEVICES:
        allowed = ", ".join(ALLOWED_DEVICES)
        raise ValueError(f"KANI_DEVICE must be {allowed}, got {raw!r}")
    return device


def load_settings(env: dict[str, str] | None = None, *, read_files: bool = True) -> KaniSettings:
    if env is None:
        if read_files:
            load_repo_env()
        env = dict(os.environ)
    device = normalize_device(env.get("KANI_DEVICE"))
    api_key = (env.get("KANI_API_KEY") or "").strip()
    if api_key == "not-needed":
        api_key = ""
    port_raw = (env.get("KANI_PORT") or "8090").strip()
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"KANI_PORT must be an integer, got {port_raw!r}") from exc
    if port <= 0 or port > 65535:
        raise ValueError(f"KANI_PORT out of range: {port}")
    model = (env.get("KANI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    voice = (env.get("KANI_VOICE") or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    host = (env.get("KANI_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    return KaniSettings(
        model=model,
        voice=voice,
        device=device,
        device_map="auto" if device == "auto" else device,
        host=host,
        port=port,
        preload=_flag(env.get("KANI_PRELOAD"), True),
        api_key=api_key,
    )


def prepare_process_device(device: str) -> None:
    """kani-tts 1.0.1 sends tensors to CUDA whenever it is visible.

    Hiding the devices is the only way KANI_DEVICE=cpu stays on CPU.
    Call this before the first torch import in the process.
    """
    if device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""


def accepts_api_key(expected: str, authorization: str | None) -> bool:
    if not expected or expected == "not-needed":
        return True
    return authorization == f"Bearer {expected}"


def public_error(exc: BaseException) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    lowered = text.lower()
    if "hf_" in lowered or "authorization" in lowered or "api_key" in lowered or "token=" in lowered:
        return "model load failed"
    return text[:500]
