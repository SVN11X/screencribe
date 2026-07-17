from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

APP_NAME = "Screencribe API"
MODEL_ID = os.getenv("WHISPER_MODEL", "dropbox-dash/faster-whisper-large-v3-turbo")
MODEL_PATH = os.getenv("WHISPER_MODEL_PATH", "/models/whisper")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", "2"))
WORK_DIR = Path(os.getenv("SCREENCRIBE_WORK_DIR", "/tmp/screencribe"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "300"))
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "7200"))
MAX_JOBS_PER_HOUR = int(os.getenv("MAX_JOBS_PER_HOUR", "5"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://svn11x.github.io,http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
]

WORK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title=APP_NAME,
    version="3.0.0",
    docs_url="/docs",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)


@dataclass
class Job:
    id: str
    directory: Path
    input_path: Path
    original_name: str
    create_transcript: bool
    create_mp4: bool
    create_mp3: bool
    language_requested: str | None
    initial_prompt: str | None
    status: str = "queued"
    status_label: str = "En cola"
    progress: int = 2
    message: str = "El archivo fue recibido."
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    error: str | None = None
    detected_language: str | None = None
    transcript: dict[str, Any] | None = None
    artifacts: dict[str, Path] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    cancel_requested: bool = False


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.RLock()
RATE_LIMITS: dict[str, deque[float]] = defaultdict(deque)
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="screencribe-job")
MODEL: WhisperModel | None = None
MODEL_LOCK = threading.Lock()


def now() -> float:
    return time.time()


def update_job(job: Job, **changes: Any) -> None:
    with JOBS_LOCK:
        for key, value in changes.items():
            setattr(job, key, value)
        job.updated_at = now()


def run_command(command: list[str], error_message: str) -> None:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "sin detalle"
        raise RuntimeError(f"{error_message}: {detail}")


def probe_media(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            str(path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("El archivo no pudo ser leído como audio o video.")
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams", [])
    duration_value = payload.get("format", {}).get("duration")
    try:
        duration = float(duration_value or 0)
    except (TypeError, ValueError):
        duration = 0.0
    return {
        "duration": duration,
        "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
        "has_video": any(stream.get("codec_type") == "video" for stream in streams),
    }


def get_model() -> WhisperModel:
    global MODEL
    if MODEL is not None:
        return MODEL
    with MODEL_LOCK:
        if MODEL is None:
            local_model = Path(MODEL_PATH)
            model_source = str(local_model) if local_model.exists() else MODEL_ID
            MODEL = WhisperModel(
                model_source,
                device="cpu",
                compute_type=COMPUTE_TYPE,
                cpu_threads=CPU_THREADS,
                num_workers=1,
            )
    return MODEL


def subtitle_timestamp(seconds: float, separator: str) -> str:
    total_ms = max(0, round(seconds * 1000))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}{separator}{milliseconds:03}"


def make_srt(segments: list[dict[str, Any]]) -> str:
    blocks = []
    for index, segment in enumerate(segments, start=1):
        start = subtitle_timestamp(float(segment["start"]), ",")
        end = subtitle_timestamp(float(segment["end"]), ",")
        blocks.append(f"{index}\n{start} --> {end}\n{segment['text'].strip()}\n")
    return "\n".join(blocks)


def make_vtt(segments: list[dict[str, Any]]) -> str:
    blocks = ["WEBVTT\n"]
    for segment in segments:
        start = subtitle_timestamp(float(segment["start"]), ".")
        end = subtitle_timestamp(float(segment["end"]), ".")
        blocks.append(f"{start} --> {end}\n{segment['text'].strip()}\n")
    return "\n".join(blocks)


def check_cancelled(job: Job) -> None:
    if job.cancel_requested:
        raise InterruptedError("El procesamiento fue cancelado.")


def transcribe(job: Job, wav_path: Path, duration: float) -> None:
    update_job(
        job,
        status="processing",
        status_label="Cargando Whisper",
        progress=48,
        message="Preparando Whisper Large v3 Turbo en el servidor…",
    )
    model = get_model()
    check_cancelled(job)

    update_job(
        job,
        status_label="Transcribiendo",
        progress=52,
        message="Whisper está analizando el audio.",
    )
    segments_generator, info = model.transcribe(
        str(wav_path),
        language=job.language_requested,
        task="transcribe",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        initial_prompt=job.initial_prompt or None,
        condition_on_previous_text=True,
        word_timestamps=False,
        temperature=0.0,
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
    )

    segments: list[dict[str, Any]] = []
    for segment in segments_generator:
        check_cancelled(job)
        item = {
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": segment.text.strip(),
        }
        if item["text"]:
            segments.append(item)
        if duration > 0:
            fraction = min(1.0, float(segment.end) / duration)
            update_job(
                job,
                progress=52 + int(fraction * 40),
                message=f"Transcribiendo: {int(fraction * 100)}% del audio analizado.",
            )

    text = " ".join(segment["text"] for segment in segments).strip()
    job.detected_language = info.language
    job.transcript = {
        "text": text,
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "duration": round(duration, 3),
        "segments": segments,
        "model": "Whisper Large v3 Turbo",
    }

    txt_path = job.directory / "transcripcion.txt"
    srt_path = job.directory / "subtitulos.srt"
    vtt_path = job.directory / "subtitulos.vtt"
    json_path = job.directory / "transcripcion.json"
    txt_path.write_text(f"{text}\n", encoding="utf-8")
    srt_path.write_text(make_srt(segments), encoding="utf-8")
    vtt_path.write_text(make_vtt(segments), encoding="utf-8")
    json_path.write_text(json.dumps(job.transcript, ensure_ascii=False, indent=2), encoding="utf-8")
    job.artifacts.update(
        {
            "transcript_txt": txt_path,
            "transcript_srt": srt_path,
            "transcript_vtt": vtt_path,
            "transcript_json": json_path,
        }
    )


def process_job(job_id: str) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return

    try:
        update_job(job, status="processing", status_label="Analizando archivo", progress=8, message="Revisando pistas y duración.")
        media = probe_media(job.input_path)
        check_cancelled(job)

        if not media["has_audio"] and (job.create_transcript or job.create_mp3):
            job.warnings.append("El archivo no contiene una pista de audio; no se generaron MP3 ni transcripción.")
            job.create_transcript = False
            job.create_mp3 = False

        if job.create_mp4:
            update_job(job, status_label="Generando MP4", progress=15, message="Convirtiendo el archivo a MP4 compatible.")
            mp4_path = job.directory / "screencribe.mp4"
            command = ["ffmpeg", "-y", "-i", str(job.input_path)]
            if media["has_video"]:
                command += ["-map", "0:v:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]
            if media["has_audio"]:
                command += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k"]
            command += ["-movflags", "+faststart", str(mp4_path)]
            run_command(command, "No se pudo generar el MP4")
            job.artifacts["mp4"] = mp4_path
            check_cancelled(job)

        if job.create_mp3:
            update_job(job, status_label="Generando MP3", progress=30, message="Extrayendo y convirtiendo la pista de audio.")
            mp3_path = job.directory / "screencribe.mp3"
            run_command(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(job.input_path),
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-ar",
                    "44100",
                    "-ac",
                    "2",
                    "-b:a",
                    "192k",
                    str(mp3_path),
                ],
                "No se pudo generar el MP3",
            )
            job.artifacts["mp3"] = mp3_path
            check_cancelled(job)

        if job.create_transcript:
            update_job(job, status_label="Preparando audio", progress=42, message="Normalizando el audio para Whisper.")
            wav_path = job.directory / "audio-16khz.wav"
            run_command(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(job.input_path),
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "pcm_s16le",
                    str(wav_path),
                ],
                "No se pudo preparar el audio para la transcripción",
            )
            transcribe(job, wav_path, float(media["duration"]))
            wav_path.unlink(missing_ok=True)

        check_cancelled(job)
        update_job(
            job,
            status="completed",
            status_label="Completado",
            progress=100,
            message="Los resultados están listos para descargar.",
        )
    except InterruptedError as error:
        update_job(job, status="cancelled", status_label="Cancelado", progress=0, message=str(error), error=str(error))
    except Exception as error:  # noqa: BLE001
        update_job(
            job,
            status="failed",
            status_label="Error",
            message="El procesamiento no pudo completarse.",
            error=str(error),
        )


def cleanup_expired_jobs() -> None:
    cutoff = now() - JOB_TTL_SECONDS
    expired: list[Job] = []
    with JOBS_LOCK:
        for job_id, job in list(JOBS.items()):
            if job.updated_at < cutoff and job.status not in {"queued", "processing"}:
                expired.append(JOBS.pop(job_id))
    for job in expired:
        shutil.rmtree(job.directory, ignore_errors=True)


def enforce_rate_limit(request: Request) -> None:
    client_ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")
    timestamps = RATE_LIMITS[client_ip]
    cutoff = now() - 3600
    while timestamps and timestamps[0] < cutoff:
        timestamps.popleft()
    if len(timestamps) >= MAX_JOBS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Se alcanzó el límite temporal de trabajos para esta conexión.")
    timestamps.append(now())


def public_job(job: Job) -> dict[str, Any]:
    artifacts = [
        {"name": name, "filename": path.name, "size": path.stat().st_size if path.exists() else 0}
        for name, path in job.artifacts.items()
        if path.exists()
    ]
    return {
        "id": job.id,
        "status": job.status,
        "status_label": job.status_label,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "language": job.detected_language,
        "transcript": job.transcript if job.status == "completed" else None,
        "artifacts": artifacts,
        "warnings": job.warnings,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@app.get("/health")
def health() -> dict[str, Any]:
    cleanup_expired_jobs()
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": app.version,
        "model": "Whisper Large v3 Turbo",
        "max_upload_mb": MAX_UPLOAD_MB,
        "job_ttl_seconds": JOB_TTL_SECONDS,
    }


@app.post("/api/jobs", status_code=202)
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form(""),
    initial_prompt: str = Form(""),
    create_transcript: bool = Form(True),
    create_mp4: bool = Form(True),
    create_mp3: bool = Form(True),
) -> dict[str, Any]:
    cleanup_expired_jobs()
    enforce_rate_limit(request)
    if not any((create_transcript, create_mp4, create_mp3)):
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un resultado.")
    if len(initial_prompt) > 1000:
        raise HTTPException(status_code=400, detail="El vocabulario de apoyo supera los 1000 caracteres.")

    job_id = uuid.uuid4().hex
    job_dir = WORK_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    suffix = Path(file.filename or "grabacion.bin").suffix[:12]
    input_path = job_dir / f"original{suffix or '.bin'}"
    maximum_bytes = MAX_UPLOAD_MB * 1024 * 1024
    written = 0

    try:
        with input_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > maximum_bytes:
                    raise HTTPException(status_code=413, detail=f"El archivo supera el límite de {MAX_UPLOAD_MB} MB.")
                destination.write(chunk)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    if written == 0:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    normalized_language = language.strip().lower() or None
    if normalized_language and (len(normalized_language) > 10 or not normalized_language.replace("-", "").isalpha()):
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="El código de idioma no es válido.")

    job = Job(
        id=job_id,
        directory=job_dir,
        input_path=input_path,
        original_name=file.filename or "grabacion",
        create_transcript=create_transcript,
        create_mp4=create_mp4,
        create_mp3=create_mp3,
        language_requested=normalized_language,
        initial_prompt=initial_prompt.strip() or None,
    )
    with JOBS_LOCK:
        JOBS[job_id] = job
    EXECUTOR.submit(process_job, job_id)
    return public_job(job)


@app.get("/api/jobs/{job_id}")
def read_job(job_id: str) -> dict[str, Any]:
    cleanup_expired_jobs()
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="El trabajo no existe o ya expiró.")
    return public_job(job)


@app.get("/api/jobs/{job_id}/files/{artifact_name}")
def download_artifact(job_id: str, artifact_name: str) -> FileResponse:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="El trabajo no existe o ya expiró.")
    path = job.artifacts.get(artifact_name)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="El archivo solicitado no está disponible.")
    media_types = {
        ".mp4": "video/mp4",
        ".mp3": "audio/mpeg",
        ".txt": "text/plain; charset=utf-8",
        ".srt": "application/x-subrip; charset=utf-8",
        ".vtt": "text/vtt; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }
    return FileResponse(path, filename=path.name, media_type=media_types.get(path.suffix, "application/octet-stream"))


@app.delete("/api/jobs/{job_id}", status_code=202)
def delete_job(job_id: str) -> dict[str, str]:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return {"status": "not_found"}
        if job.status in {"queued", "processing"}:
            job.cancel_requested = True
            return {"status": "cancelling"}
        JOBS.pop(job_id, None)
    shutil.rmtree(job.directory, ignore_errors=True)
    return {"status": "deleted"}
