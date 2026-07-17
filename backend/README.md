---
title: Screencribe API
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Screencribe API

Backend Docker para convertir grabaciones a MP4/MP3 y transcribirlas con **Whisper Large v3 Turbo**.

## Variables recomendadas

- `ALLOWED_ORIGINS=https://TU-USUARIO.github.io`
- `MAX_UPLOAD_MB=300`
- `JOB_TTL_SECONDS=7200`
- `MAX_JOBS_PER_HOUR=5`
- `WHISPER_COMPUTE_TYPE=int8`
- `WHISPER_CPU_THREADS=2`

El almacenamiento es temporal. Los trabajos se eliminan al expirar y también desaparecen cuando el Space se reinicia.
