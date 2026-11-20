"""WAV encoder for KaniTTS waveforms. The model returns 22.05 kHz mono floats."""

from __future__ import annotations

import io
import struct
import wave

from config import SAMPLE_RATE


def mono_floats(audio: object) -> list[float]:
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()  # type: ignore[union-attr]
    if hasattr(audio, "ndim") and getattr(audio, "ndim", None) == 2:
        shape = tuple(getattr(audio, "shape", ()))
        if 1 in shape:
            audio = audio.reshape(-1)  # type: ignore[union-attr]
    if hasattr(audio, "tolist"):
        data = audio.tolist()  # type: ignore[union-attr]
    else:
        data = list(audio)  # type: ignore[arg-type]
    if data and isinstance(data[0], (list, tuple)):
        raise ValueError("KaniTTS вернул неожиданную форму аудио")
    return [float(sample) for sample in data]


def to_wav_bytes(audio: object, sample_rate: int = SAMPLE_RATE) -> bytes:
    samples = mono_floats(audio)
    if not samples:
        raise ValueError("KaniTTS вернул пустое аудио")
    if sample_rate <= 0:
        raise ValueError("sample rate must be positive")
    pcm = bytearray()
    for sample in samples:
        clipped = max(-1.0, min(1.0, sample))
        pcm += struct.pack("<h", int(round(clipped * 32767)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm)
    return buf.getvalue()
