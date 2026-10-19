# Verificación de la entrega

Comprobaciones ejecutadas el **7 de octubre de 2026** sobre la versión basada en `dd342d0` y los cambios incluidos en esta entrega.

| Comprobación | Resultado |
| --- | --- |
| Sintaxis y selección de formatos | Sintaxis JavaScript correcta y **8 pruebas unitarias aprobadas**: proporciones, resolución, nombres, selección nativa, fallback si falla el inicio y conservación de bytes. |
| Navegador | Regresión completa aprobada con **Chromium 138.0.7204.0 headless** y APIs reales de grabación. |
| MP4 nativo | Descarga de un **MP4 H.264/Opus**, sin conversión. FFprobe identifica el contenedor, codecs, dimensiones y fotogramas. El navegador reproduce el archivo descargable. |
| Captura con cambios de tamaño | Salida fija de **1280 × 720** ante una fuente sintética de 640 × 480, 1920 × 1080 y 500 × 900. Los timestamps de los fotogramas aumentan. |
| Audio | Micrófono y audio compartido se mezclan en una pista; se obtiene además un **M4A con audio Opus** por un segundo MediaRecorder. La pausa/reanudación de ambos mantiene duraciones próximas. |
| Descarga y red | **Cero solicitudes HTTP nuevas al pulsar los botones de descarga**. En toda la sesión de prueba no aparecen solicitudes a FFmpeg, `.wasm`, `vendor`, CDN ni terceros. |
| Formato alternativo | Al simular que MP4 no está disponible, se descarga WebM real, identificado por FFprobe, con extensión y botón correctos. Se conserva el último fragmento al detener estando en pausa. |
| Grabación sin audio | Archivo de video sin pista de audio; descarga de audio separado deshabilitada. |
| Audio separado desactivado | El video sigue incluyendo su pista de audio. Se conserva al simular el fin de la fuente compartida. |
| Importaciones | MP4 y MP3 de entrada y salida tienen el mismo SHA-256. Un WebM importado conserva su formato. Los archivos vacíos se rechazan. |
| Permisos denegados | La interfaz muestra el error y mantiene disponible el archivo anterior. |
| Presentación | Capturas de escritorio, móvil de 390 px y tema oscuro; sin desbordamiento horizontal en móvil. Navegación con teclado comprobada. |
| Publicación estática | Se preparó el mismo conjunto de archivos del workflow de Pages: enlaces y módulos resuelven bajo una subruta. **88.188 bytes de archivos estáticos**, sin vendor ni WebAssembly. |

## Alcance y límites

La fuente de pantalla se simula con un worker que entrega imágenes móviles y cambia de dimensiones. El audio de prueba usa tonos; `MediaRecorder`, Web Audio, el worker de estabilización, los codecs, los archivos y las descargas son reales. El selector de pantalla del sistema operativo y los permisos se simulan para automatizar la prueba.

El navegador de prueba no admite AAC ni MP3 como encoders nativos; produjo H.264/Opus en MP4 y Opus en M4A. No se presenta eso como H.264/AAC ni como audio MP3. La selección H.264/AAC se comprueba en las pruebas de preferencia y se utiliza solo cuando el navegador de destino la admite.

No se han probado sesiones de horas, falta de RAM, todos los reproductores externos, Safari, Firefox ni el selector de ventanas de Windows del usuario. La ausencia de un motor de conversión elimina su descarga y recodificación, pero no elimina el tiempo de escritura en disco de un archivo grande ni garantiza codecs universales.

Los archivos siguen locales y los cambios **no se han publicado en GitHub Pages** desde esta entrega.

Previsualizaciones: `docs/previews/escritorio.png`, `docs/previews/movil.png` y `docs/previews/tema-oscuro.png`.
