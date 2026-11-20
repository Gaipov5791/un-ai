"""Synthesize one Kyrgyz line with the same settings as the sidecar."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from audio import to_wav_bytes
from config import load_settings, prepare_process_device
from engine import EnginePool


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Speak one Kyrgyz line with KaniTTS")
    parser.add_argument("text", help="Text to synthesize")
    parser.add_argument("-o", "--output", default="ky-sample.wav", help="WAV path")
    args = parser.parse_args(argv)
    text = args.text.strip()
    if not text:
        print("empty text", file=sys.stderr)
        return 2
    settings = load_settings()
    prepare_process_device(settings.device)
    pool = EnginePool(settings)
    print(f"model={settings.model} device={settings.device} voice={settings.voice}", flush=True)
    audio, _generated = pool.speak(text, settings.voice)
    path = Path(args.output)
    path.write_bytes(to_wav_bytes(audio, pool.sample_rate))
    print(f"wrote {path} ({path.stat().st_size} bytes, {pool.sample_rate} Hz, {pool.device_actual})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
