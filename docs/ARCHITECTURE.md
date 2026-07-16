# Arquitectura

## Aplicación estática

El proyecto se compila con Vite y TypeScript y se publica en GitHub Pages. No incluye servidor, cuentas, base de datos ni secretos.

## Grabación

1. `getDisplayMedia()` solicita pantalla, ventana o pestaña.
2. `getUserMedia()` solicita el micrófono cuando está habilitado.
3. Web Audio API mezcla micrófono y audio compartido con ganancias independientes.
4. `MediaRecorder` genera el archivo compatible con el navegador, normalmente WebM.
5. Las pistas se detienen y los recursos se liberan al finalizar.

## Conversión multimedia

`ffmpeg.wasm` se carga bajo demanda y se ejecuta en el navegador:

- MP4: H.264 + AAC.
- MP3: audio a 128 kbps.

El archivo no se envía a un servidor. El límite práctico depende de la memoria disponible.

## Preparación de audio para Whisper

1. Web Audio API decodifica el archivo seleccionado.
2. `OfflineAudioContext` mezcla canales y remuestrea a mono, 16 kHz.
3. El resultado se representa como `Float32Array`.
4. El búfer se transfiere, sin copiar, a un Web Worker.

## Transcripción

El Web Worker utiliza Transformers.js y WebGPU para cargar `onnx-community/whisper-large-v3-ONNX` con encoder y decoder cuantizados en 4 bits.

El audio se divide en bloques de 28 segundos con 2 segundos de solapamiento. Después de cada bloque:

- Se desplazan las marcas de tiempo al punto correcto del audio completo.
- Se descartan segmentos duplicados de la zona solapada.
- Se informa progreso a la interfaz.
- Se consolidan texto y segmentos para exportar subtítulos.

## Flujo de datos

```text
Archivo local
   ├── descarga directa
   ├── ffmpeg.wasm → MP4/MP3 → descarga
   └── Web Audio API → Float32 16 kHz
                           ↓ transferencia
                    Web Worker / WebGPU
                           ↓
                  Whisper Large v3 q4
                           ↓
                  texto + timestamps
```

## Caché

Transformers.js usa la caché del navegador para reutilizar los archivos descargados del modelo. La aplicación no controla cuánto tiempo se conservarán: el usuario o el navegador pueden eliminarlos.
