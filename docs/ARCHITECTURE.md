# Arquitectura

Frontend estático sin dependencias de terceros ni backend.

## Captura

1. `src/main.js` gestiona permisos, opciones, estado, vista previa y descargas.
2. `src/recorder.js` solicita `getDisplayMedia` dentro de la acción del usuario y, opcionalmente, `getUserMedia` para el micrófono.
3. `src/capture-worker.js` recibe fotogramas con streams transferibles y normaliza sus dimensiones mediante `OffscreenCanvas` y `VideoFrame`. El worker es código propio; no contiene ni solicita bibliotecas. Si estas APIs faltan, se conserva la pista original con un aviso.
4. Web Audio mezcla micrófono y audio compartido con margen de ganancia.
5. `src/recording-formats.js` prioriza MP4 nativo. Para video con audio intenta H.264/AAC, H.264/Opus y MP4 elegido por el navegador. Si no funciona, intenta WebM y finalmente la elección nativa. Comprueba `isTypeSupported` y maneja fallos síncronos de construcción/inicio.
6. Un `MediaRecorder` graba el video. Si se activó audio separado, otro `MediaRecorder` graba las mismas pistas de audio mientras transcurre la captura. Pausa, reanudación y parada se coordinan.
7. La finalización espera los fragmentos finales de ambos recorders antes de liberar las pistas, el worker y el contexto de audio. La extensión se deduce del MIME real de los fragmentos; no se simula MP4 cambiando el nombre de un WebM.

## Descarga

`src/exporters.js` crea una URL Blob del archivo ya generado y activa un enlace con `download`. No transforma el contenido ni realiza solicitudes de red. La URL temporal se revoca después de un margen de 30 segundos; la vista previa tiene su propia URL y ciclo de vida.

Las importaciones se previsualizan cuando el navegador puede decodificarlas y se descargan sin modificar los bytes. No se extrae audio de videos importados.

Se retiraron `src/local-converter.js`, `src/conversion-plan.js` y `assets/vendor/`. No hay precarga, caché de motores, WebAssembly, importaciones remotas, CDN ni service worker. Los codecs usados pertenecen al navegador/sistema operativo.

## Límites

La grabación se codifica en tiempo real. Los fragmentos y resultados se mantienen en memoria; no se impone un máximo fijo de duración o tamaño ni se garantiza capacidad ilimitada. MP4 nativo puede ser fragmentado y usar codecs distintos de H.264/AAC. No se repara ni remultiplexa después de grabar.

## Referencias primarias

- [MediaStream Recording, W3C](https://www.w3.org/TR/mediastream-recording/).
- [Implementación de MediaRecorder en Chromium](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/modules/mediarecorder).
- [Muxers y codecs de Chromium](https://chromium.googlesource.com/chromium/src/+/main/media/muxers/).
