# Contribuir

1. Crea una rama desde `main`.
2. Mantén el frontend estático y la grabación nativa. No agregues librerías de conversión, CDN, descarga de codecs, secretos ni servicios de pago.
3. Comprueba la sintaxis JavaScript y ejecuta `node --test tests/*.test.mjs` con Node.js 22 o posterior.
4. Para cambios de captura o descarga, ejecuta la regresión Playwright de `README.md`. Las herramientas instaladas para pruebas no deben formar parte del sitio publicado.
5. Revisa escritorio, móvil, teclado y tema oscuro.
6. Prueba una ventana real redimensionada, cambio de pestaña, pausa/reanudación y permisos denegados. La fuente sintética de las pruebas no sustituye la validación del selector y captura del sistema operativo de destino.
7. Conserva el formato real y los bytes de descargas; no cambies WebM por una extensión MP4 ni prometas codecs que el navegador no genere.
8. Describe los límites de memoria, compatibilidad y tiempo de escritura en disco.
