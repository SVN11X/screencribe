# Verificación de la entrega

## Comprobaciones ejecutadas

| Área                                                                                                                           | Resultado                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sintaxis JavaScript                                                                                                            | Sin errores en los módulos propios y los módulos incluidos del wrapper.                                                                                                         |
| Geometría, utilidades y planificación                                                                                          | 7 pruebas Node pasan: encuadre sin distorsión, dimensiones pares y límites 4K/Full HD, rotación, formato, pistas silenciosas y carátulas de audio.                              |
| Captura Chromium 153                                                                                                           | Un WebM real conserva 1280 × 720 en todos sus fotogramas aunque la fuente sintética pase por 640 × 480, 1920 × 1080 y 500 × 900.                                                |
| Audio                                                                                                                          | La grabación incluye una sola pista que mezcla micrófono y sonido compartido.                                                                                                   |
| Conversión local real                                                                                                          | FFmpeg.wasm en el navegador genera MP4 H.264/AAC y MP3 estéreo de 192 kbps a 44.1 kHz. Se descargan mediante URLs Blob y se inspeccionan con FFprobe nativo.                    |
| Alojamiento estático                                                                                                           | La conversión funciona sin backend ni aislamiento (`crossOriginIsolated` es `false`), tanto en la raíz como bajo `/screencribe/`. La página de licencias abre con 19 fuentes.   |
| Privacidad de red                                                                                                              | MP4 y MP3 funcionan con conexiones externas bloqueadas. Solo hay GET al mismo origen para la página y su núcleo incluido. No hay POST, subida de medios ni API de conversión.   |
| Reutilización                                                                                                                  | Una segunda conversión WAV → MP3 funciona bloqueando nuevas cargas de los archivos del núcleo. La biblioteca se conserva durante la sesión.                                     |
| Salida por fragmentos                                                                                                          | Se recoge un archivo de 3 MiB + 17 bytes como Blob en bloques y su SHA-256 coincide con la entrada. Se verifica la integridad al cruzar los límites de los bloques.             |
| Entradas grandes                                                                                                               | MP4 válidos de 2 y 8 GiB se convierten a MP4 H.264. Contienen un clip breve y un átomo `free` con tamaño de 64 bits; comprueba lectura por fragmentos sin topes de 200 MB/2 GB. |
| Video silencioso                                                                                                               | Una entrada WebM de 321 × 241 produce MP4 de 320 × 240, sin audio inventado, y explica por qué no hay MP3.                                                                      |
| Cadencia                                                                                                                       | El MP4 mantiene timestamps variables y no duplica fotogramas hasta los 1000 fps que puede declarar un WebM de MediaRecorder; se limita a 60 fps.                                |
| Cancelación                                                                                                                    | Se cancela durante la conversión y durante la carga automática de la biblioteca; se conservan el original y los controles. Se completa otra conversión después.                 |
| Eliminación                                                                                                                    | Quitar resultados revoca los enlaces Blob; dejan de responder.                                                                                                                  |
| Errores                                                                                                                        | Archivo dañado, tipo no permitido y núcleo incluido no disponible muestran mensajes y conservan el original.                                                                    |
| Controles y permisos                                                                                                           | Pausa/reanudación, detención, reinicio, captura cancelada, micrófono denegado y captura directa sin estabilización verificados.                                                 |
| Diseño                                                                                                                         | Sin desbordamiento horizontal a 320, 390, 768, 1024 y 1440 px. Revisión visual de escritorio, móvil y tema oscuro.                                                              |
| Teclado                                                                                                                        | Pestañas del flujo seleccionables con flechas.                                                                                                                                  |
| Accesibilidad automática                                                                                                       | Axe-core no detecta infracciones WCAG 2 A/AA y 2.1 A/AA en inicio, carga, tema oscuro, móvil y licencias. No sustituye una auditoría manual completa.                           |
| La integridad SHA-256 de los dos binarios y los 19 archivos de fuentes coincide con `assets/vendor/ffmpeg-core/manifest.json`. |

## Alcance

La captura usa `MediaRecorder`, workers, `OffscreenCanvas`, `VideoFrame` y generadores de pistas reales. Solo se simula la ventana de origen para variar sus dimensiones de forma reproducible. La conversión usa el núcleo WebAssembly real; FFmpeg nativo se utiliza únicamente para crear entradas de prueba e inspeccionar descargas.

El navegador sin interfaz gráfica mantuvo `document.visibilityState` en `visible` al cambiar entre páginas de la prueba. **No se afirma haber probado una pestaña realmente oculta ni una ventana minimizada en Windows/macOS.** Comprueba esos casos en tu computador siguiendo `ACTUALIZACION.md`.

Las pruebas usaron medios cortos. Los archivos de 2 y 8 GiB tienen relleno válido que FFmpeg puede saltar; **no equivale a convertir ese tamaño de contenido audiovisual ni prueba grabaciones de varias horas**. Confirma que no se copia toda la entrada a la memoria de WebAssembly y que la app permite superar 2 GB mediante WORKERFS. No se garantiza suficiente memoria ni rapidez para cualquier archivo grande, dispositivo móvil o grabación prolongada. No se ha publicado el cambio en GitHub Pages desde esta entrega.

## Repetir las pruebas

```bash
node --test tests/*.test.mjs
```

Para la regresión completa, instala las herramientas de desarrollo indicadas en `README.md` y ejecuta `node tests/browser.test.cjs`. La publicación y el uso de la página no requieren estas herramientas.
