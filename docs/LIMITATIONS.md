# Limitaciones conocidas

- Capturar pantalla requiere permiso, HTTPS o localhost y un navegador compatible. El navegador puede ignorar la preferencia Pestaña/Ventana/Pantalla.
- MP4 directo depende del soporte nativo, los recursos del navegador y los codecs del equipo. Si no se puede iniciar ese formato, se intenta un formato alternativo. No hay conversión ni descarga de encoders para suplirlo.
- MP4 puede ser fragmentado o usar codecs como Opus/VP9 cuando no están disponibles AAC/H.264. Algunos reproductores externos pueden no admitirlos o no mostrar bien la duración. No se promete compatibilidad universal ni se fuerza faststart.
- No se convierte WebM a MP4, no se extrae audio de videos importados y no se genera MP3 mediante una librería. El audio separado se graba durante la captura en un formato nativo disponible. Un MP3 cargado se conserva.
- La estabilización requiere `MediaStreamTrackProcessor`, `MediaStreamTrackGenerator`, streams transferibles, `OffscreenCanvas` y `VideoFrame`. Si falta soporte, se avisa y se captura directamente; no se garantiza encuadre fijo al redimensionar en ese caso.
- Una ventana minimizada, cerrada o suspendida puede dejar de entregar fotogramas. La app no puede recuperar imágenes que no recibe. Cambiar a otra ventana no cambia automáticamente la fuente.
- El audio compartido depende del navegador, el sistema operativo y marcar «Compartir audio» en el diálogo. Las ventanas no siempre incluyen sonido. Una grabación silenciosa no produce un archivo de audio ficticio.
- El audio separado añade otra codificación nativa y memoria. Puedes desactivarlo antes de grabar; el video conserva su pista de audio.
- Los fragmentos se conservan en memoria. No hay un tope fijo de duración o tamaño en la app, pero sesiones largas pueden agotar la RAM. Un archivo grande puede tardar en finalizarse o guardarse en disco.
- Una respuesta positiva de `isTypeSupported` no garantiza recursos suficientes; fallos posteriores al inicio pueden interrumpir la captura. Se conserva la parte recibida si existe.
- La vista previa depende de la decodificación del navegador. Un archivo sin vista previa puede descargarse sin cambios.
- Cerrar o recargar pierde las grabaciones sin descargar. No hay historial ni recuperación automática.
- No se garantiza recargar sin conexión. La página carga sus propios archivos estáticos; no necesita descargar librerías de conversión después.
