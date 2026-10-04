# Limitaciones conocidas

- La captura requiere permisos explícitos, HTTPS o localhost y un navegador compatible.
- La estabilización requiere `MediaStreamTrackProcessor`, `MediaStreamTrackGenerator`, streams transferibles, `OffscreenCanvas` y `VideoFrame`. Está orientada a Chrome/Edge en computador. Si falta alguna capacidad, se avisa y se captura directamente.
- Cambiar de tamaño puede añadir bandas negras; se conserva la imagen completa y su proporción.
- Una ventana minimizada, cerrada o suspendida puede dejar de entregar fotogramas. La app no puede recuperar contenido que el sistema operativo no entregue.
- Cambiar de pestaña dentro de una ventana comparte el contenido de esa ventana. Cambiar a otra ventana no selecciona una fuente nueva automáticamente.
- La preferencia Pestaña/Ventana/Pantalla puede ser ignorada por el selector del navegador.
- El audio compartido depende del navegador, del sistema operativo y de marcar «Compartir audio». Las ventanas no siempre incluyen sonido.
- El original se almacena en memoria hasta quitarlo o cerrar la página. Las sesiones largas o de alta resolución pueden agotar recursos. Elegir 720p/30 fps reduce el consumo.
- La conversión gratuita se ejecuta en el navegador y requiere WebAssembly y workers. No hay procesamiento externo.
- La biblioteca está en el repositorio y se carga automáticamente desde la propia página, unos 31 MB la primera vez. No hay instalación manual ni servicio externo de conversión. Si faltan esos archivos o la conexión se interrumpe, puedes grabar y descargar el original, pero quizá no convertir. No se garantiza funcionamiento sin internet tras recargar.
- No se impone un máximo fijo de entrada ni duración, ni el anterior corte de 45 minutos. La entrada se lee por fragmentos; se probaron archivos de 2 y 8 GiB con contenido breve y relleno válido. Esto no garantiza convertir varias horas de video: la RAM necesaria depende de los codecs, resolución y resultados. La salida todavía ocupa memoria del motor, aunque se evita una copia completa adicional al recogerla. Un equipo modesto puede agotar memoria con archivos mucho menores; la conversión puede ser considerablemente más lenta que FFmpeg nativo.
- El MP4 convertido tiene dimensiones pares, conserva proporciones y no supera Full HD. Para conservar la resolución de una captura 4K, descarga el original.
- MP3 requiere una pista de audio. Una captura silenciosa no puede convertirse en voz.
- La conversión no recupera cuadros perdidos ni repara daños previos. Los archivos cifrados, dañados o con codecs no incluidos pueden fallar.
- La vista previa depende de los codecs del navegador; un archivo sin vista previa puede convertirse si el motor lo admite.
- Los porcentajes de conversión son aproximados; si no se conoce la duración, la barra es indeterminada.
- Cerrar o recargar pierde originales y resultados sin descargar. No hay recuperación automática ni historial.
- Cancelar termina el worker; quitar resultados revoca enlaces en memoria. Las descargas ya guardadas en el computador permanecen allí.
