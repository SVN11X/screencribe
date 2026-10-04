# Arquitectura

## Captura

GitHub Pages sirve HTML, CSS y módulos JavaScript. La página no requiere compilación ni un backend.

1. `getDisplayMedia()` obtiene video y audio compartido; `getUserMedia()` obtiene el micrófono opcional.
2. En Chromium compatible, `MediaStreamTrackProcessor` extrae fotogramas de una copia de la pista.
3. Un worker usa `OffscreenCanvas` para ajustar cada fotograma a dimensiones fijas, conservando proporciones y rellenando márgenes.
4. `MediaStreamTrackGenerator` entrega la pista normalizada; se conservan timestamps y se cierran los fotogramas para liberar memoria.
5. Web Audio mezcla micrófono y audio compartido con margen de ganancia.
6. `MediaRecorder` prioriza WebM VP8/Opus. Primero se recibe el fragmento final y luego se liberan pistas, worker y audio.
7. El original se revisa y descarga localmente.

La normalización recibe fotogramas sin `requestAnimationFrame` ni un bucle de dibujo temporizado de la página. Si faltan las APIs necesarias, se captura directamente y se avisa.

## Conversión local

`src/local-converter.js` usa el wrapper MIT de `@ffmpeg/ffmpeg` 0.12.15 incluido en `assets/vendor/ffmpeg/`. El núcleo de un solo hilo `@ffmpeg/core` 0.12.10 está incluido en `assets/vendor/ffmpeg-core/` y se carga al pulsar Convertir. Las URLs se calculan respecto al módulo para funcionar también bajo `/screencribe/` en GitHub Pages. No se solicita código a un CDN ni se envían medios del usuario.

- El código y WebAssembly se cargan automáticamente desde el mismo origen, se convierten a URLs Blob y se reutilizan mientras la página siga abierta.
- Un worker de módulos ejecuta FFmpeg.wasm. No se requieren `SharedArrayBuffer`, COOP, COEP ni service workers.
- WORKERFS monta un `File` de entrada para leer fragmentos sin copiar el archivo completo a la memoria de WebAssembly.
- FFprobe inspecciona las pistas y la duración. No confía únicamente en la extensión.
- `src/conversion-plan.js` selecciona pistas reales, omite carátulas como fuente de video y calcula dimensiones pares, sin ampliar y con un máximo Full HD. Considera la rotación.
- FFmpeg crea MP4 H.264/AAC con `ultrafast`, CRF 23, escala proporcional, padding, timestamps variables hasta 60 fps y `faststart`, o MP3 estéreo de 192 kbps a 44.1 kHz.
- Si falta audio o video, se omite el formato correspondiente y se explica. Si no puede producir ningún resultado, se muestra un error.
- El avance de conversión es aproximado. Si no se conoce la duración, la barra es indeterminada.
- La extensión `readFileAsBlob` del wrapper lee la salida en bloques de 1 MiB y crea partes Blob dentro del worker. El hilo principal recibe un Blob mediante clonación estructurada; se evita leer y copiar otro ArrayBuffer del tamaño del resultado completo. La salida del motor sigue en MEMFS hasta eliminarla; el uso de RAM no es constante.
- Los resultados son Blobs con enlaces de descarga locales; quitar resultados revoca sus URLs y libera referencias.
- Al finalizar o cancelar se termina el worker, para liberar la memoria del núcleo y los archivos temporales. El original permanece disponible.
- No se fija un máximo de entrada ni duración en la app. Se comprueba que el tamaño pueda representarse exactamente en JavaScript (`Number.isSafeInteger`). La carga del motor tiene un límite de 2 minutos. FFprobe y la conversión no tienen un tiempo máximo fijo; el usuario puede terminar el worker con Cancelar. Los fallos del worker rechazan operaciones pendientes y restauran los controles. El navegador y la memoria disponible siguen imponiendo límites reales.
- El FAQ de ffmpeg.wasm documenta 2 GB como límite convencional de entrada. WORKERFS evita copiar toda la entrada al heap: las pruebas con este núcleo pasan con archivos válidos de 2 y 8 GiB, leyendo un clip breve y saltando relleno mediante offsets de 64 bits. Es evidencia de lectura de archivos grandes, no de conversión garantizada de cualquier medio de ese tamaño. La salida sigue utilizando MEMFS y el procesamiento utiliza memoria de WebAssembly.
- Los binarios no se modificaron. Se conservan sus licencias y los archivos de fuentes/build de terceros; `manifest.json` registra versiones, commits y SHA-256. Las fuentes no se cargan al utilizar el conversor.

No hay solicitudes a una API de conversión, cola remota, subida de videos ni funciones de transcripción.

## Referencias técnicas

- [ffmpeg.wasm: instalación](https://ffmpegwasm.netlify.app/docs/getting-started/installation/).
- [ffmpeg.wasm: conversión con un solo hilo](https://ffmpegwasm.netlify.app/docs/getting-started/usage/).
- [Emscripten: WORKERFS y lectura de File/Blob sin copia completa](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs).
- [Chrome: Insertable streams](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing).
- [W3C: MediaStreamTrack Insertable Media Processing](https://www.w3.org/TR/mediacapture-transform/).

Las implementaciones del navegador difieren; las capacidades se detectan antes de utilizarlas.
