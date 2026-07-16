# Seguridad

## Principios

- No existen API keys ni secretos de servidor.
- La aplicación no acepta HTML externo ni ejecuta código proporcionado por el usuario.
- Grabaciones y transcripciones no se almacenan remotamente.
- El procesamiento intensivo se aísla en Web Workers.
- Los archivos se validan como audio o video antes de procesarlos.
- Los nombres de descarga se normalizan.
- Las dependencias se fijan mediante `package-lock.json`.
- GitHub Actions ejecuta formato, tipos, lint, pruebas y compilación.

## Riesgos que permanecen

- La aplicación descarga el modelo y recursos de ejecución desde dependencias externas.
- Un archivo multimedia malformado puede provocar errores en el decodificador del navegador o en ffmpeg.wasm.
- Archivos muy grandes pueden agotar memoria.
- WebGPU y los controladores gráficos forman parte de la superficie de ataque del navegador.

Mantén actualizado el navegador y las dependencias. Revisa los cambios de `package-lock.json` antes de fusionarlos.

## Reportar una vulnerabilidad

No publiques datos personales, grabaciones ni detalles explotables en un issue público. Contacta al propietario del repositorio mediante un canal privado.
