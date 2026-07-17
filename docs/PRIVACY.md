# Privacidad

Screencribe necesita enviar la grabación al backend para convertirla y transcribirla sin descargar modelos en el dispositivo.

La implementación incluida:

- No conserva un historial permanente.
- Guarda cada trabajo en un directorio temporal.
- Elimina trabajos expirados según `JOB_TTL_SECONDS`.
- Pierde todos los archivos temporales cuando el contenedor se reinicia.
- No incluye analítica ni publicidad.

El administrador del servidor debe informar a los usuarios sobre el tratamiento de grabaciones, obtener autorización de las personas grabadas y cumplir la normativa aplicable.
