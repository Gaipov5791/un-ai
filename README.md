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

3. Голосовой агент (второй терминал). На Windows сейчас рабочий рантайм — Node:

```powershell
cd apps/agent-node
npm install
npm run dev
```

Python-агент в `apps/agent` остаётся по ТЗ, но `livekit-agents` на этой машине падает при импорте.

4. Страница звонка (третий терминал):

```powershell
cd apps/web
npm install
npm run dev
```

Откройте http://localhost:5173, выберите язык звонка и нажмите «Позвонить». Страница берёт токен с API на порту 8000.

Без ключей LiveKit страница откроется, но звонок не стартует — так и задумано: платные API только после ваших ключей.

## Кыргызский голос (KaniTTS)

Русский звонок идёт через Cartesia. Кыргызский — **KaniTTS 400m-ky** на бесплатном GPU (Kaggle или Colab). На этой Windows-машине GPU нет.

**Kaggle.** GPU часто скрыт, пока не подтверждён телефон: аватар → **Settings → Phone Verification**. После SMS обновите ноутбук: Session options → GPU T4 (или P100) и Internet On.

**Если Accelerator остаётся None — Colab.** [colab.research.google.com](https://colab.research.google.com) → Upload `apps/kani-server/kaggle_un_ai_kani.ipynb` → **Runtime → Change runtime type → T4 GPU** → Run All.

Из последней ячейки скопируйте `KANI_BASE_URL=https://….trycloudflare.com/v1` в корневой `.env`, перезапустите `apps/agent-node`, позвоните **Кыргызча**. Вкладку ноутбука не закрывайте.

## Роли

Руководитель проекта утверждает ТЗ и вехи.  
Проект-менеджер держит последовательность и состав агентов.

## Чего нет в MVP

WhatsApp, исходящие обзвоны, своя CRM, омниканал-suite.
