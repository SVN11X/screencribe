# Contribuir

1. Crea una rama desde `main`.
2. Mantén el frontend estático, la conversión local y el motor incluido con la página; evita dependencias de servicios externos.
3. No agregues secretos, tokens ni servicios de pago al flujo de la app.
4. Verifica la sintaxis JavaScript y ejecuta `node --test tests/*.test.mjs` con Node.js 22 o posterior.
5. Para cambios de conversión o captura, ejecuta la regresión Playwright indicada en `README.md`. FFmpeg nativo se utiliza solo para generar e inspeccionar los medios de prueba.
6. Revisa escritorio, móvil, teclado y tema oscuro.
7. Prueba una ventana real redimensionada, una pestaña en segundo plano, pausa/reanudación y permisos denegados. La fuente sintética de las pruebas no sustituye la validación en el sistema operativo de destino.
8. Conserva las versiones fijadas, avisos de licencia, fuentes correspondientes y el manifiesto de las dependencias. Al actualizar el núcleo, actualiza también las fuentes, checksums y scripts de compilación.
9. Describe los cambios y las limitaciones de memoria, rendimiento y privacidad.
