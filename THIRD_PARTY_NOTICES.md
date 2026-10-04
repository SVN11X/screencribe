# Avisos de terceros

## Wrapper de ffmpeg.wasm

Se incluyen los módulos ESM de **`@ffmpeg/ffmpeg` 0.12.15** en `assets/vendor/ffmpeg/`. Su licencia **MIT**, copyright de Jerome Wu, se conserva completa en [assets/vendor/ffmpeg/LICENSE](assets/vendor/ffmpeg/LICENSE).

Cambios de Screencribe sobre el wrapper: se retiraron espacios finales de tres líneas en `classes.js`; se fijó el núcleo local 0.12.10 en `const.js`; se añadió `READ_FILE_BLOB`/`readFileAsBlob` en `const.js`, `classes.js` y `worker.js` para recoger la salida en bloques de 1 MiB; se añadieron manejadores de errores del worker en `classes.js`. Estos cambios son código fuente legible incluido, bajo MIT. No se presentan como una versión oficial sin modificaciones.

- Proyecto y código fuente: <https://github.com/ffmpegwasm/ffmpeg.wasm>.
- Paquete: <https://www.npmjs.com/package/@ffmpeg/ffmpeg/v/0.12.15>.

## Núcleo y codecs

Se incluyen **`@ffmpeg/core` 0.12.10**, JavaScript ESM y WebAssembly de un solo hilo, en `assets/vendor/ffmpeg-core/`. Los binarios oficiales no se modificaron y se sirven desde el mismo origen de la página. El paquete declara **GPL-2.0-or-later**; contiene FFmpeg 5.1.4 compilado con `--enable-gpl`, libx264, libx265 y las demás bibliotecas especificadas en el Dockerfile de upstream. La licencia MIT del código propio no sustituye las licencias del núcleo ni las de sus componentes.

Se conservan las licencias GPL/LGPL de FFmpeg junto a los binarios. Los archivos comprimidos en **`assets/vendor/ffmpeg-core/sources/`** contienen las fuentes de FFmpeg, ffmpeg.wasm, codecs, bibliotecas y herramientas correspondientes, con sus avisos originales. El [manifiesto](assets/vendor/ffmpeg-core/manifest.json) registra commits, referencias de compilación, rutas, URLs de origen y SHA-256. La [guía del núcleo](assets/vendor/ffmpeg-core/README.md) explica la compilación y el acceso a las fuentes. El workflow de Pages publica también estas fuentes; no se cargan al convertir.

- Paquete y versión: <https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10>.
- [Explicación oficial de las licencias](https://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm).
- [Código y herramientas de la versión incluida](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1).
- [Licencias de FFmpeg](https://ffmpeg.org/legal.html).

Conserva los avisos, licencias y fuentes al redistribuir esta entrega. Si actualizas un binario, actualiza también sus fuentes, recetas de compilación y manifiesto.

El resto de la interfaz utiliza APIs nativas, iconos propios y una fuente del sistema.
