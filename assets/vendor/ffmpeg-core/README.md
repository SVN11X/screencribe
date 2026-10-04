# Núcleo de conversión incluido

**`@ffmpeg/core` 0.12.10**, JavaScript ESM y WebAssembly de un solo hilo, obtenido del paquete oficial. Los dos binarios no se modificaron. El navegador los carga automáticamente desde esta página; no hay instalación manual ni descarga de fuentes para usar la app.

El paquete declara **GPL-2.0-or-later**, no MIT. Contiene FFmpeg 5.1.4 con `--enable-gpl`, codecs y bibliotecas adicionales. Consulta `COPYING.GPLv2`, `COPYING.GPLv3`, `COPYING.LGPLv2.1` y los avisos originales dentro de cada archivo de fuentes. El wrapper independiente conserva MIT.

## Fuentes correspondientes

Los archivos de `sources/` conservan el código y las licencias originales. Se sirven junto a los binarios, sin cargarse al convertir. [Índice de fuentes y licencias](licenses.html). [Versiones, commits, rutas y SHA-256](manifest.json).

| Componente  | Referencia de compilación                  | Commit         | Archivo de fuentes                                |
| ----------- | ------------------------------------------ | -------------- | ------------------------------------------------- |
| x264        | `4-cores`                                  | `33cac6b77d5b` | [tar.gz](sources/x264-33cac6b77d5b.tar.gz)        |
| x265        | `3.4`                                      | `2bb5520e9596` | [tar.gz](sources/x265-2bb5520e9596.tar.gz)        |
| libvpx      | `v1.13.1`                                  | `10b9492dcf05` | [tar.gz](sources/libvpx-10b9492dcf05.tar.gz)      |
| lame        | `master`                                   | `2badea1974ae` | [tar.gz](sources/lame-2badea1974ae.tar.gz)        |
| ogg         | `v1.3.4`                                   | `bada45718453` | [tar.gz](sources/ogg-bada45718453.tar.gz)         |
| theora      | `v1.1.1`                                   | `7ffd8b2ecfc2` | [tar.gz](sources/theora-7ffd8b2ecfc2.tar.gz)      |
| opus        | `v1.3.1`                                   | `e85ed7726db5` | [tar.gz](sources/opus-e85ed7726db5.tar.gz)        |
| vorbis      | `v1.3.3`                                   | `779816404319` | [tar.gz](sources/vorbis-779816404319.tar.gz)      |
| zlib        | `v1.2.11`                                  | `cacf7f1d4e3d` | [tar.gz](sources/zlib-cacf7f1d4e3d.tar.gz)        |
| libwebp     | `v1.3.2`                                   | `ca332209cb55` | [tar.gz](sources/libwebp-ca332209cb55.tar.gz)     |
| freetype2   | `VER-2-10-4`                               | `6a2b3e4007e7` | [tar.gz](sources/freetype2-6a2b3e4007e7.tar.gz)   |
| fribidi     | `v1.0.9`                                   | `f9e8e71a6fbf` | [tar.gz](sources/fribidi-f9e8e71a6fbf.tar.gz)     |
| harfbuzz    | `5.2.0`                                    | `4a1d891c6317` | [tar.gz](sources/harfbuzz-4a1d891c6317.tar.gz)    |
| libass      | `0.15.0`                                   | `d149636f502f` | [tar.gz](sources/libass-d149636f502f.tar.gz)      |
| zimg        | `release-3.0.5`                            | `e5b0de6bebbc` | [tar.gz](sources/zimg-e5b0de6bebbc.tar.gz)        |
| ffmpeg      | `n5.1.4`                                   | `4729204c17f7` | [tar.gz](sources/ffmpeg-4729204c17f7.tar.gz)      |
| ffmpeg-wasm | `71aa99d37c02a7b4c435275ca9ef50e612f6efa1` | `71aa99d37c02` | [tar.gz](sources/ffmpeg-wasm-71aa99d37c02.tar.gz) |
| sdl2        | `release-2.24.2`                           | `55b03c7493a7` | [tar.gz](sources/sdl2-55b03c7493a7.tar.gz)        |
| emscripten  | `3.1.40`                                   | `5c27e79dd0a9` | [tar.gz](sources/emscripten-5c27e79dd0a9.tar.gz)  |

## Compilación de upstream

La receta corresponde a `ffmpegwasm/ffmpeg.wasm` en el commit `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`, que publica el core 0.12.10. Su archivo de fuentes incluye el Dockerfile, Makefile, scripts `build/*.sh`, bindings JavaScript y las modificaciones C en `src/fftools/`.

- Toolchain: Emscripten 3.1.40; la receta parte de `emscripten/emsdk:3.1.40`.
- Comando de upstream para un solo hilo: `make prd`; activa `FFMPEG_ST=yes`, `-O3` y `-msimd128`.
- El Dockerfile especifica las bibliotecas enlazadas y opciones `--enable-*`; el manifiesto fija los commits de sus fuentes. Para reproducir con archivos locales usa estas fuentes en las etapas correspondientes del Dockerfile, en lugar de referencias de rama que puedan cambiar.
- `build/ffmpeg-wasm.sh` usa `WORKERFS`, memoria inicial de 32 MB con crecimiento, `-sUSE_SDL=2` y los bindings de FFmpeg/FFprobe. SDL2 2.24.2 corresponde al puerto de Emscripten 3.1.40.
- El submódulo `testdata` de ffmpeg.wasm y GoogleTest de zimg se usan en pruebas de upstream, no en el núcleo distribuido. No están incluidos.

No se ha recompilado el núcleo en esta entrega ni se afirma una reproducción binaria bit a bit. Se distribuyen los binarios oficiales y sus fuentes de versión con sus instrucciones originales. No hace falta Docker, Node, Python ni FFmpeg nativo para usar o publicar la página.

## Integridad y actualizaciones

No cambies versiones ni archivos sueltos sin actualizar fuentes, licencias, manifiesto y pruebas. `manifest.json` registra el SHA-256 de cada binario y archivo de fuentes. Conserva todo este directorio al publicar o redistribuir.

Origen del paquete: <https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10>. Explicación de licencias: <https://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm>.
