# Limitaciones conocidas

- Ninguna aplicación web puede evitar el diálogo de autorización de pantalla y micrófono.
- Las políticas de una institución pueden bloquear captura, audio compartido o subida de archivos.
- El audio del sistema varía según navegador, sistema operativo y superficie compartida.
- El backend gratuito de Hugging Face puede entrar en reposo y su primera respuesta puede tardar.
- Whisper Large v3 Turbo en CPU es preciso, pero puede tardar más que la duración del audio.
- Los archivos grandes dependen de los límites de red y del proveedor donde se despliegue Docker.
- No se incluye diarización fiable de hablantes porque suele requerir modelos adicionales, más recursos o credenciales externas.
