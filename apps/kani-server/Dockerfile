FROM python:3.12-slim-bookworm

ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TORCH_INDEX=${TORCH_INDEX} \
    KANI_PRELOAD=1 \
    KANI_HOST=0.0.0.0 \
    KANI_PORT=8090 \
    KANI_MODEL=nineninesix/kani-tts-400m-ky \
    KANI_DEVICE=auto \
    KANI_VOICE=elina

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt install.sh ./
RUN chmod +x install.sh && ./install.sh

COPY config.py audio.py engine.py server.py speak.py ./

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=3 \
    CMD python -c "import urllib.request,sys; body=urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).read(); sys.exit(0 if b'\"ok\"' in body else 1)"

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8090"]
