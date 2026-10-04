# Screencribe

Estudio web para **grabar pantalla, ventana o pestaña**, revisar el resultado y convertir a **MP4 o MP3 en el navegador**. Funciona con HTML, CSS, JavaScript y WebAssembly. No requiere backend, Hugging Face, tokens, suscripciones ni instalaciones para el usuario.

## Funciones

- Interfaz adaptable, tema claro/oscuro y controles accesibles con teclado.
- Captura con micrófono y audio compartido, según el navegador y el sistema operativo.
- Vista previa en vivo, pausa/reanudación y descarga del original.
- Resolución de captura fija en 720p, 1080p o tamaño inicial hasta 4K.
- Ajuste proporcional de la ventana al redimensionarla, sin estirar ni recortar la imagen.
- Procesamiento de fotogramas en un worker, sin animaciones ni temporizadores de dibujo de la página.
- Selección o arrastre de archivos de video y audio.
- Conversión local a MP4 H.264/AAC, hasta Full HD, y MP3 de 192 kbps.
- Cancelación que detiene el worker y conserva el original; eliminación de resultados en memoria.
- Avisos de audio ausente, formatos incompatibles y archivos que exceden el límite.

## Coste y recursos

La página puede alojarse en **GitHub Pages con un repositorio público y GitHub Free**. **La biblioteca completa está en el repositorio**: el wrapper en `assets/vendor/ffmpeg/` y el núcleo JavaScript/WebAssembly en `assets/vendor/ffmpeg-core/`. No se conecta a un CDN ni a un servicio de conversión. Las versiones están fijadas.

El navegador carga automáticamente unos **31 MB** del mismo sitio al iniciar la primera conversión, igual que carga HTML y JavaScript. **No hay descargas manuales ni instalaciones para usar la herramienta.** El motor se reutiliza durante la sesión. La caché puede reducir cargas posteriores, pero no se garantiza funcionamiento sin internet después de recargar.

**Los archivos no se suben a ningún servidor.** Se leen por fragmentos y se convierten en tu computador. GitHub Pages solo sirve los archivos de la página y la biblioteca.

La app **no impone un tope fijo al tamaño de entrada ni a la duración**. Se retiraron el límite de 200 MB y el corte de 45 minutos; la conversión continúa hasta terminar o cancelarla. WORKERFS lee fragmentos del archivo seleccionado, sin copiarlo completo a WebAssembly. Las pruebas pasan incluso con archivos de entrada válidos de 2 y 8 GiB con un clip breve y relleno; no equivalen a convertir varias horas de video.

El límite práctico depende del navegador, la memoria disponible, los codecs y el tamaño del resultado, que todavía se genera en el sistema virtual del motor. La salida se recoge como Blob en bloques de 1 MiB para evitar una copia completa adicional en el hilo de la página. No se promete procesar cualquier archivo grande: en equipos modestos usa archivos cortos y **720p a 30 fps**. El original sigue disponible si la conversión falla. El MP4 convertido no supera Full HD; el original conserva la resolución grabada.

## Publicar en GitHub Pages

Copia los archivos de esta entrega a la raíz de tu repositorio y sigue [ACTUALIZACION.md](docs/ACTUALIZACION.md) para retirar los archivos antiguos. Después:

```powershell
git add .
git commit -m "Convierte MP4 y MP3 gratis en el navegador; mejora captura y frontend"
git push origin main
```

En GitHub: **Settings → Pages → Source → GitHub Actions**. El workflow `.github/workflows/pages.yml` publica `index.html`, `404.html`, `assets/`, `src/` e `icons/`.

Dirección: <https://svn11x.github.io/screencribe/>.

No necesitas ejecutar `npm install` ni `npm run build` para publicar. Conserva completos **ambos directorios `assets/vendor/ffmpeg/` y `assets/vendor/ffmpeg-core/`**, con sus licencias y fuentes de terceros. El workflow los copia automáticamente. Esta versión usa un solo hilo y no necesita encabezados COOP/COEP ni `SharedArrayBuffer`.

El archivo WebAssembly pesa unos 31 MB; para actualizar el repositorio usa Git, como en las instrucciones anteriores. El formulario web de GitHub tiene un límite de 25 MiB por archivo. Esto solo afecta a quien publica los cambios, no a los usuarios de la página.

## Capturar una ventana

Elige **Ventana** y selecciona la ventana en el diálogo del navegador. En Chrome/Edge compatibles, Screencribe fija el encuadre al iniciar y adapta proporcionalmente los fotogramas si cambia el tamaño. Pueden aparecer bandas negras.

Cambiar de pestaña dentro de la ventana capturada comparte el contenido de esa ventana. Cambiar a otra ventana no cambia automáticamente la fuente. **No minimices la ventana capturada:** el navegador o el sistema operativo pueden suspender sus fotogramas; la app no puede recuperar imagen que no recibe.

Si las APIs de estabilización no están disponibles, se usa la captura directa y aparece un aviso. Para sonido de una página, comparte una **pestaña** y marca **Compartir audio** en el selector. Las ventanas no siempre permiten capturar sonido.

## Desarrollo y pruebas

Para probar la página localmente, desde la raíz del repositorio:

```bash
python -m http.server 5500
```

Abre <http://localhost:5500>. No abras `index.html` con `file://`: módulos y workers requieren HTTP local o HTTPS. Este servidor solo sirve archivos estáticos; no procesa conversiones.

Pruebas con Node.js 22 o posterior:

```bash
node --test tests/*.test.mjs
```

La regresión del navegador usa **Playwright y FFmpeg/FFprobe nativos únicamente para las pruebas**: genera medios de entrada e inspecciona las descargas que produjo el motor WebAssembly real.

```bash
npm install --no-save playwright@1.62.1
npx playwright install chromium
node tests/browser.test.cjs
```

Requiere Python para servir la página, FFmpeg/FFprobe en el PATH y el puerto 5500 disponible. `SCREENCRIBE_PYTHON` permite escoger el ejecutable Python y `SCREENCRIBE_QA_DIR` conservar las descargas/capturas de prueba. No se necesitan estas herramientas para usar o publicar Screencribe.

Consulta [verificación](docs/VERIFICACION.md), [limitaciones](docs/LIMITATIONS.md), [privacidad](docs/PRIVACY.md), [arquitectura](docs/ARCHITECTURE.md) y [licencias de terceros](THIRD_PARTY_NOTICES.md).

## Licencia

MIT para el código propio. Las dependencias conservan sus licencias; consulta los avisos de terceros.
