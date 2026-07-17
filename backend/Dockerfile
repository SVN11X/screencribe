FROM python:3.11-slim-bookworm

ARG WHISPER_MODEL=dropbox-dash/faster-whisper-large-v3-turbo
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WHISPER_MODEL=${WHISPER_MODEL} \
    WHISPER_MODEL_PATH=/models/whisper \
    WHISPER_COMPUTE_TYPE=int8 \
    WHISPER_CPU_THREADS=2 \
    SCREENCRIBE_WORK_DIR=/tmp/screencribe \
    PORT=7860

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# El modelo se incorpora a la imagen del servidor. Los usuarios de la página no lo descargan.
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('${WHISPER_MODEL}', local_dir='/models/whisper')"

COPY app ./app
RUN useradd --create-home --uid 1000 screencribe \
    && mkdir -p /tmp/screencribe \
    && chown -R screencribe:screencribe /app /tmp/screencribe /models
USER screencribe

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=8)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
