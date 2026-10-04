# Privacidad

Grabar, abrir un archivo, revisar, convertir a MP4/MP3 y descargar ocurren en el navegador. **Screencribe no sube videos ni audios a un servidor.**

Al iniciar la primera conversión se carga automáticamente el código JavaScript y WebAssembly de `@ffmpeg/core` **desde el mismo origen que la página**. La biblioteca está incluida en el repositorio. No hay solicitudes a jsDelivr ni a servicios de conversión. GitHub Pages sirve los archivos estáticos y recibe datos habituales de conexión, como la dirección IP, según su política; no recibe tus grabaciones. Las cargas del núcleo omiten credenciales y la cabecera de referencia.

Los medios y resultados permanecen temporalmente como archivos/Blobs locales del navegador; el motor también utiliza memoria. El navegador puede gestionar su almacenamiento temporal internamente. No hay historial, guardado automático de medios por la app, analítica, publicidad ni transcripción. El motor lee fragmentos del archivo seleccionado dentro de un worker.

Al terminar o cancelar una conversión se termina el worker y se liberan los archivos de su sistema virtual. El original y los resultados elegidos siguen disponibles en la página hasta quitarlos o cerrar. **Quitar resultados** revoca sus enlaces y libera las referencias a esos Blobs; los archivos que ya descargaste se conservan en tu computador.

Cerrar o recargar pierde el material que no hayas descargado. Se avisa al salir cuando hay grabación, conversión o archivos generados pendientes de descarga. Al limpiar un archivo o iniciar otra captura/conversión, se sustituyen los resultados anteriores.

Esta versión guarda solamente la preferencia de tema en `localStorage`, cuando está disponible. Las direcciones de servicios guardadas por versiones antiguas se ignoran. La biblioteca de conversión puede quedar en la caché del navegador, pero no se guardan los medios en ella.
