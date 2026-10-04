# Actualizar Screencribe

La entrega parte de `main` en el commit **8d8bc68** de `SVN11X/screencribe`. Incluye el proyecto completo y un parche del código propio y el wrapper. El núcleo y sus fuentes se incluyen en la carpeta `screencribe/assets/vendor/ffmpeg-core/` del ZIP, sin duplicarlos dentro del parche. No se ha publicado ni enviado ningún cambio a GitHub desde esta entrega.

## Aplicar los archivos

1. Descomprime `screencribe_mejorado.zip`.
2. Copia el contenido de `screencribe/` a la raíz de tu repositorio local, reemplazando los archivos correspondientes.
3. Elimina la carpeta antigua `backend/`, el archivo `src/api.js` y el workflow `.github/workflows/deploy-backend.yml`. Ya no se utilizan. Si aplicas el parche, estas eliminaciones se incluyen automáticamente.
4. Revisa `git diff` y sube tu versión a GitHub.

No copies una carpeta `screencribe` dentro de otra: `index.html`, `src/`, `assets/` e `icons/` deben quedar en la raíz. Conserva completos **`assets/vendor/ffmpeg/` y `assets/vendor/ffmpeg-core/`**, incluidas licencias y fuentes de terceros. La biblioteca está incluida; no tienes que obtenerla ni instalarla por separado.

Como alternativa, desde una copia limpia del commit base, copia primero **`screencribe/assets/vendor/ffmpeg-core/` del ZIP a `assets/vendor/ffmpeg-core/`** y aplica el parche del resto:

```powershell
git apply --check ..\SCREENCRIBE_CAMBIOS.patch
git apply ..\SCREENCRIBE_CAMBIOS.patch
```

Si `--check` encuentra conflictos, revisa los archivos antes de aplicar el parche. Conserva tus modificaciones propias.

## Publicar

```powershell
git add .
git commit -m "Convierte MP4 y MP3 gratis en el navegador; mejora captura y frontend"
git push origin main
```

En **Settings → Pages**, selecciona **GitHub Actions**. El workflow de Pages publica la página estática con el motor de conversión. Esta versión **no necesita configurar Hugging Face, un backend, secretos ni una URL de conversión**. Si antes habías configurado `HF_TOKEN` o `HF_SPACE_ID` en GitHub, ya no se utilizan. Como no tenías un servicio externo, no necesitas retirar ni reconstruir un servidor antiguo.

Usa Git para subir el proyecto completo: `ffmpeg-core.wasm` supera los 25 MiB permitidos por el formulario web de GitHub. No se requiere Git ni ninguna instalación para que los usuarios utilicen la página publicada.

Abre <https://svn11x.github.io/screencribe/>. Si ves la interfaz anterior, recarga con **Ctrl + F5**.

## Comprobar el resultado

1. Comparte una ventana en 720p o 1080p y graba con ella abierta.
2. Cambia de pestaña dentro de esa ventana y redimensiónala varias veces.
3. Cambia a otra pestaña donde no esté la app y deja la captura unos segundos.
4. Regresa, pausa/reanuda y detén la grabación.
5. Descarga el original; pulsa **Convertir en mi equipo** y descarga MP4 y MP3.
6. Para capturar sonido, comparte una pestaña y activa «Compartir audio» en el selector.

La primera conversión carga automáticamente el motor incluido en la página, de unos 31 MB. No requiere descargas manuales, instalaciones ni conexiones a otros servicios. El archivo permanece en tu navegador. Puedes cancelar y volver a intentar. **No hay un tope fijo de entrada ni de duración impuesto por la app**, ni un corte a los 45 minutos. El límite práctico depende de la memoria disponible, el navegador y el resultado generado. Si la conversión falla, el original sigue disponible. El MP4 convertido no supera Full HD.

La estabilización conserva un encuadre fijo si el navegador admite las APIs utilizadas. Pueden aparecer bandas negras. No minimices la ventana capturada: el sistema operativo puede suspender sus fotogramas.

Consulta [VERIFICACION.md](VERIFICACION.md) para conocer las comprobaciones ejecutadas y su alcance.
