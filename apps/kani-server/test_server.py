import os
import unittest
import wave
from io import BytesIO

os.environ["KANI_PRELOAD"] = "0"
os.environ.setdefault("KANI_DEVICE", "cpu")

from fastapi.testclient import TestClient

import server
from audio import mono_floats, to_wav_bytes
from config import accepts_api_key, load_settings, normalize_device, prepare_process_device, public_error
from engine import select_speaker


class ConfigTests(unittest.TestCase):
    def test_defaults_to_kyrgyz_checkpoint(self) -> None:
        settings = load_settings({}, read_files=False)
        self.assertEqual(settings.model, "nineninesix/kani-tts-400m-ky")
        self.assertEqual(settings.voice, "elina")
        self.assertEqual(settings.device, "auto")
        self.assertEqual(settings.device_map, "auto")
        self.assertEqual(settings.port, 8090)
        self.assertTrue(settings.preload)
        self.assertEqual(settings.api_key, "")

    def test_env_overrides(self) -> None:
        settings = load_settings(
            {
                "KANI_MODEL": "nineninesix/kani-tts-400m-ky-kani",
                "KANI_DEVICE": "GPU",
                "KANI_VOICE": "syimyk",
                "KANI_PORT": "8765",
                "KANI_PRELOAD": "0",
                "KANI_API_KEY": "not-needed",
                "KANI_HOST": "127.0.0.1",
            },
            read_files=False,
        )
        self.assertEqual(settings.model, "nineninesix/kani-tts-400m-ky-kani")
        self.assertEqual(settings.device, "cuda")
        self.assertEqual(settings.device_map, "cuda")
        self.assertEqual(settings.voice, "syimyk")
        self.assertEqual(settings.port, 8765)
        self.assertFalse(settings.preload)
        self.assertEqual(settings.api_key, "")
        self.assertEqual(settings.host, "127.0.0.1")

    def test_rejects_unknown_device(self) -> None:
        with self.assertRaises(ValueError):
            normalize_device("mps")

    def test_cpu_hides_cuda_devices(self) -> None:
        previous = os.environ.get("CUDA_VISIBLE_DEVICES")
        try:
            prepare_process_device("cpu")
            self.assertEqual(os.environ.get("CUDA_VISIBLE_DEVICES"), "")
            prepare_process_device("auto")
            self.assertEqual(os.environ.get("CUDA_VISIBLE_DEVICES"), "")
        finally:
            if previous is None:
                os.environ.pop("CUDA_VISIBLE_DEVICES", None)
            else:
                os.environ["CUDA_VISIBLE_DEVICES"] = previous

    def test_api_key(self) -> None:
        self.assertTrue(accepts_api_key("", None))
        self.assertTrue(accepts_api_key("not-needed", None))
        self.assertTrue(accepts_api_key("secret", "Bearer secret"))
        self.assertFalse(accepts_api_key("secret", "Bearer other"))

    def test_public_error_hides_tokens(self) -> None:
        self.assertEqual(public_error(RuntimeError("bad hf_abc token=")), "model load failed")
        self.assertEqual(public_error(RuntimeError("CUDA нет")), "CUDA нет")


class AudioTests(unittest.TestCase):
    def test_wav_is_mono_pcm16(self) -> None:
        wav = to_wav_bytes([0.0, 0.5, -1.0, 2.0], 22050)
        with wave.open(BytesIO(wav), "rb") as handle:
            self.assertEqual(handle.getnchannels(), 1)
            self.assertEqual(handle.getsampwidth(), 2)
            self.assertEqual(handle.getframerate(), 22050)
            self.assertEqual(handle.getnframes(), 4)
        self.assertEqual(mono_floats([0.25, -0.25]), [0.25, -0.25])

    def test_rejects_stereo(self) -> None:
        with self.assertRaises(ValueError):
            to_wav_bytes([[0.1, 0.2], [0.3, 0.4]])


class SpeakerTests(unittest.TestCase):
    def test_elina_on_multispeaker(self) -> None:
        self.assertEqual(select_speaker("elina", "multispeaker", ["syimyk", "elina"]), "elina")

    def test_unknown_voice_uses_first_speaker(self) -> None:
        self.assertEqual(select_speaker("ashley", "multispeaker", ["syimyk", "elina"]), "syimyk")

    def test_single_speaker_does_not_prefix(self) -> None:
        self.assertIsNone(select_speaker("elina", "singlspeaker", []))


class HttpTests(unittest.TestCase):
    def setUp(self) -> None:
        server.pool.state = "ok"
        server.pool.detail = ""
        server.pool.sample_rate = 22050
        server.pool.device_actual = "cpu"
        self._speak = server.pool.speak

    def tearDown(self) -> None:
        server.pool.speak = self._speak

    def test_health_reports_configured_model(self) -> None:
        server.pool.state = "idle"
        with TestClient(server.app) as client:
            body = client.get("/health").json()
        self.assertEqual(body["status"], "idle")
        self.assertEqual(body["ready"], "no")
        self.assertEqual(body["model"], server.settings.model)
        self.assertEqual(body["service"], "un-ai-kani")

    def test_speech_returns_wav_without_loading_weights(self) -> None:
        server.pool.speak = lambda text, voice: ([0.0, 0.5, -0.5, 0.25], text)
        with TestClient(server.app) as client:
            response = client.post(
                "/v1/audio/speech",
                json={
                    "input": "Саламатсызбы! Мен сизге кантип жардам бере алам?",
                    "model": "nineninesix/kani-tts-400m-ky",
                    "voice": "elina",
                    "response_format": "wav",
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("audio/wav"))
        self.assertEqual(response.headers["x-model"], server.settings.model)
        with wave.open(BytesIO(response.content), "rb") as handle:
            self.assertEqual(handle.getframerate(), 22050)
            self.assertEqual(handle.getnchannels(), 1)
            self.assertGreater(handle.getnframes(), 0)

    def test_empty_input_is_rejected(self) -> None:
        with TestClient(server.app) as client:
            response = client.post("/v1/audio/speech", json={"input": "  "})
        self.assertEqual(response.status_code, 400)

    def test_engine_failure_is_http_500(self) -> None:
        def explode(text: str, voice: str):
            raise RuntimeError("weights missing")

        server.pool.speak = explode
        with TestClient(server.app) as client:
            response = client.post("/v1/audio/speech", json={"input": "Салам"})
        self.assertEqual(response.status_code, 500)
        self.assertIn("weights missing", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
