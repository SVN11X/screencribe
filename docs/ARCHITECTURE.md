# Arquitectura

## Frontend

GitHub Pages sirve HTML, CSS y JavaScript estáticos. No utiliza Vite, npm, FFmpeg.wasm, WebGPU ni modelos descargados en el navegador.

La captura usa APIs nativas del navegador:

1. `getDisplayMedia()` para pantalla, ventana o pestaña.
2. `getUserMedia()` para micrófono.
3. Web Audio API para mezclar audio compartido y micrófono.
4. `MediaRecorder` para crear el archivo original.

## Backend

El backend Docker usa:

- FastAPI para recepción, estado y descargas.
- FFmpeg del sistema para MP4, MP3 y normalización del audio.
- faster-whisper con Whisper Large v3 Turbo en CPU e INT8.
- Trabajos asíncronos en una cola de un proceso.
- Directorios temporales por trabajo.

## Flujo

Navegador → carga del archivo → backend → FFmpeg/Whisper → descargas → eliminación temporal.

El servidor puede desplegarse en Hugging Face Spaces o en cualquier proveedor que ejecute Docker.
