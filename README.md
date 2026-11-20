# un-ai

Голосовой ИИ-ресепшен для бизнеса в Кыргызстане. Главная фишка — ассистент на кыргызском, с русским и смесью ky/ru.

Это новый продукт. Не ветка `smart-crm`. Не копия [fonio.ai](https://www.fonio.ai).

## Статус

- **ТЗ-01. Процесс** — утверждено 5 сентября 2026
- **ТЗ-02. Продукт MVP** — утверждено 5 сентября 2026, саммари пилота: Telegram
- Текущая веха: **B — слышимый диалог** (раздельные звонки ky/ru; смесь не входит в B)

## Документы

- [ТЗ-01. Рабочий процесс](docs/TZ-01-PROCESS.md)
- [ТЗ-02. Продукт MVP](docs/TZ-02-PRODUCT-MVP.md)

## Как запустить тестовый звонок

1. Скопируйте `.env.example` в `.env` и заполните ключи LiveKit Cloud.
2. API токенов:

```powershell
cd apps/api
python -m pip install -e .
python -m uvicorn src.main:app --reload --port 8000
```

3. Кыргызский голос, если нужен звук, а не текст на экране (см. ниже). Русский звонок этот процесс не использует.

4. Голосовой агент. На Windows сейчас рабочий рантайм — Node:

```powershell
cd apps/agent-node
npm install
npm run dev
```

Python-агент в `apps/agent` остаётся по ТЗ, но `livekit-agents` на этой машине падает при импорте.

5. Страница звонка:

```powershell
cd apps/web
npm install
npm run dev
```

Откройте http://localhost:5173, выберите язык звонка и нажмите «Позвонить». Страница берёт токен с API на порту 8000.

Без ключей LiveKit страница откроется, но звонок не стартует — так и задумано: платные API только после ваших ключей.

## Кыргызский голос (KaniTTS)

Русский звонок говорит через Cartesia Sonic-3 (`language: ru`) в LiveKit Inference. Эти переменные его не меняют.

Кыргызский звук — отдельный процесс `apps/kani-server`: официальный чекпоинт [nineninesix/kani-tts-400m-ky](https://huggingface.co/nineninesix/kani-tts-400m-ky) (Apache-2.0, 400M, 22.05 kHz, голоса `elina` и `syimyk`). Агент ходит в него как в OpenAI TTS: `POST /v1/audio/speech`. Пока `/health` не отвечает `"status": "ok"`, кыргызская реплика остаётся текстом на экране — это прежний путь, Cartesia для ky не подключается.

Почему выбран этот чекпоинт, а не соседние:

- `kani-tts-400m-ky` — кыргызский файнтюн NineNineSix, два голоса, его же крутит Space KaniTTS-Kyrgyz.
- `kani-tts-400m-ky-kani` — тот же размер, без выбора голоса. Можно подставить через `KANI_MODEL`, по умолчанию не используется.
- `kani-tts-400m-0.3-pt` перечисляет кыргызский среди языков предобучения, но заточен под английский.
- KaniTTS-2 в опубликованных тегах языков кыргызский не показывает. Для ky он бы снова читал текст чужим голосом.

### Переменные

| Переменная | Кто читает | Смысл |
|---|---|---|
| `KANI_BASE_URL` | агент Node | URL сервиса, с `/v1` или без |
| `KANI_API_KEY` | оба | пусто или `not-needed` — без проверки; иначе `Authorization: Bearer` |
| `KANI_MODEL` | оба | Hugging Face id, по умолчанию `nineninesix/kani-tts-400m-ky` |
| `KANI_DEVICE` | только сервис | `auto`, `cpu` или `cuda` (`gpu` = `cuda`) |
| `KANI_VOICE` | оба | `elina` (ресепшен) или `syimyk` |
| `KANI_HOST` / `KANI_PORT` | сервис | по умолчанию `0.0.0.0:8090` |
| `KANI_PRELOAD` | сервис | `1` — грузить веса при старте. `/health` станет `ok` только после загрузки |
| `KANI_READY_TIMEOUT_MS` | агент | сколько ждать `loading` в начале звонка, по умолчанию 8000. Дальше — текст на экране |
| `KANI_TIMEOUT_MS` | агент | таймаут одной фразы, по умолчанию 60000. Ошибка фразы — тишина, звонок не рвётся |

### Железо и задержка

Веса около 0.8 GB плюс кодек NVIDIA NanoCodec. На GPU практичный минимум — около 8 GB VRAM для этого runtime на transformers. Карточка модели для отдельного vLLM-сервера указывает около 16 GB и RTF ~0.2 на RTX 5090; наш процесс — обычный PyTorch, на T4 фраза в пару секунд часто занимает сопоставимое время, не «мгновенно».

CPU работает (`KANI_DEVICE=cpu`). Когда веса уже в памяти, короткая фраза может занять несколько секунд; первая загрузка и ответ длиннее — заметно дольше. Для живого звонка нужен GPU: таймаут одной фразы в агенте 60 секунд.

Дольше ~15 секунд речи модель на карточке деградирует. Агент и так просит 1–3 предложения.

`kani-tts` 1.0.1 при видимой CUDA всегда шлёт тензоры на GPU. `KANI_DEVICE=cpu` поэтому прячет CUDA от процесса. MPS не поддерживается.

### Локально

```bash
cd apps/kani-server
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
bash install.sh
python speak.py "Саламатсызбы! Мен сизге кантип жардам бере алам?" -o ky-sample.wav
python -m uvicorn server:app --host 0.0.0.0 --port 8090
```

Дождитесь `curl http://127.0.0.1:8090/health` с `"status": "ok"`. В корневой `.env`:

```
KANI_BASE_URL=http://127.0.0.1:8090/v1
KANI_MODEL=nineninesix/kani-tts-400m-ky
KANI_DEVICE=auto
KANI_VOICE=elina
```

Перезапустите `apps/agent-node` и позвоните **Кыргызча**.

`install.sh` ставит torch (CPU-индекс, если torch ещё нет), `nemo-toolkit==2.4.0` без extra `[tts]`, `kani-tts==1.0.1`, `transformers==4.57.1`, `accelerate` и пакеты, без которых импорт кодека падает (`lightning==2.4.0`, `huggingface-hub` 0.x). Extra `[tts]` тянет `transformers<=4.52` и на чистом venv заставляет pip долго перебирать зависимости, а LFM2 этого чекпоинта стартует на 4.57.1.

Проверка без весов: `python -m unittest test_server.py` из `apps/kani-server`.

### Docker

Из `apps/kani-server`:

```bash
docker compose up --build
```

Образ по умолчанию ставит CPU-колёса PyTorch: они видеокарту не видят. Для NVIDIA пересоберите с индексом CUDA, подходящим к драйверу, и `KANI_DEVICE=cuda`:

```bash
TORCH_INDEX=https://download.pytorch.org/whl/cu124 KANI_DEVICE=cuda docker compose up --build
```

Кэш Hugging Face лежит в томе `kani-cache`. Пока веса качаются, health не `ok` — агент держит текстовый fallback.

Где крутить GPU для пилота, в репозитории не выбрано: бесплатный T4 в ноутбуке ниже, своя машина с Docker, или арендованный GPU. Платный хост отсюда не подставлялся.

### Kaggle или Colab

На машине без GPU можно поднять тот же сервис на бесплатном T4.

**Kaggle.** GPU часто скрыт, пока не подтверждён телефон: аватар → **Settings → Phone Verification**. После SMS обновите ноутбук: Session options → GPU T4 (или P100) и Internet On.

**Если Accelerator остаётся None — Colab.** [colab.research.google.com](https://colab.research.google.com) → Upload `apps/kani-server/kaggle_un_ai_kani.ipynb` → **Runtime → Change runtime type → T4 GPU** → Run All.

Ячейка печатает `KANI_BASE_URL` сразу, а строку «можно звонить» — когда `/health` станет `ok` (первая загрузка 1–3 минуты). Вставьте URL в корневой `.env`, перезапустите `apps/agent-node`, позвоните **Кыргызча**. Вкладку не закрывайте: туннель умрёт вместе с сессией. Для пилота это не хостинг.

## Роли

Руководитель проекта утверждает ТЗ и вехи.  
Проект-менеджер держит последовательность и состав агентов.

## Чего нет в MVP

WhatsApp, исходящие обзвоны, своя CRM, омниканал-suite.
