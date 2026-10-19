# Screencribe

Graba pantalla, ventana o pestaña y **descarga el archivo directamente**, sin cargar librerías de conversión. Sitio estático de HTML, CSS y JavaScript propio, compatible con GitHub Pages. No necesita backend, cuentas, tokens, servicios de pago ni instalaciones para visitantes.

## Qué cambió

La versión anterior priorizaba WebM y cargaba aproximadamente 31 MB de FFmpeg/WebAssembly para convertir a MP4. Esta versión **graba directamente con `MediaRecorder`**, prioriza MP4 cuando el navegador lo admite y elimina FFmpeg, sus workers, binarios y fuentes. Descargar utiliza los bytes ya grabados: no ejecuta una conversión ni solicita dependencias.

El navegador sigue cargando el HTML, CSS y los pequeños módulos propios del sitio. El worker que estabiliza la imagen también es código propio. No hay bibliotecas de terceros, WebAssembly, CDN, instalación automática de codecs ni precarga oculta de motores.

## Funciones

- Captura de pantalla, ventana o pestaña con permisos explícitos.
- MP4 nativo cuando está disponible; formato nativo alternativo, normalmente WebM, cuando no lo está.
- Preferencia por H.264/AAC en MP4, seguida por las combinaciones disponibles. Los codecs dependen del navegador y del equipo.
- Micrófono y audio compartido, mezclados en una pista cuando ambos existen.
- Audio separado opcional: se graba al mismo tiempo y se descarga como M4A, WebM, Ogg o el formato nativo disponible.
- Pausa/reanudación coordinada de video y audio, vista previa y descarga directa.
- Resolución fija en 720p, 1080p o tamaño inicial hasta 4K; ajuste proporcional al redimensionar la ventana.
- Selección o arrastre de archivos para revisarlos y descargarlos sin modificar sus bytes.
- Diseño adaptable, tema claro/oscuro y controles con teclado.

## Formatos y límites

**Un archivo WebM no se renombra a MP4.** El botón muestra el formato real de la grabación. Comprueba el aviso antes de grabar; el soporte se determina con `MediaRecorder.isTypeSupported`, y se reintenta con otro formato si el constructor o `start()` rechazan el encoder. Un error posterior puede conservar solo la parte recibida.

Para obtener MP4 directo necesitas un navegador y equipo que lo puedan grabar. Si no lo admiten, esta versión mantiene el original en WebM. No convierte grabaciones antiguas ni videos importados a MP4.

**La conversión general a MP3 está desactivada** para cumplir la condición de no cargar librerías. El audio separado conserva el formato que genera el navegador; si este admite `audio/mpeg` de forma nativa se utiliza, sin prometerlo. Un MP3 cargado puede previsualizarse y descargarse sin cambios. El audio de un video cargado no se extrae: activa «Guardar audio aparte» antes de iniciar una nueva grabación.

MP4 nativo puede ser fragmentado y puede contener Opus o VP9 si H.264/AAC no están disponibles. La extensión MP4 no garantiza que todos los reproductores externos admitan sus codecs o indiquen correctamente su duración. No se fuerza `faststart` ni se remultiplexa el resultado.

La app no impone un límite fijo de duración o tamaño. Los fragmentos se almacenan en memoria; el límite práctico depende de la RAM, el navegador y los codecs. El disco y el navegador todavía pueden tardar en guardar un archivo grande. La corrección elimina la carga del motor y la recodificación posterior, sin prometer guardado instantáneo de cualquier tamaño. Para reducir consumo, usa 720p a 30 fps y desactiva el audio separado si no lo necesitas.

Las grabaciones no se suben a servidores ni se recuperan después de cerrar o recargar. Descarga video y audio antes de salir.

## Actualizar y publicar

Sigue [docs/ACTUALIZACION.md](docs/ACTUALIZACION.md). Copia el contenido de `screencribe/` del ZIP a la raíz del repositorio, incluidas `.github/` y las nuevas fuentes, y elimina las rutas obsoletas indicadas. No copies una carpeta `screencribe` dentro de otra.

En GitHub: **Settings → Pages → Source → GitHub Actions**. El workflow `.github/workflows/pages.yml` publica `index.html`, `404.html`, `LICENSE`, `assets/`, `src/` e `icons/`. No hay `npm install` ni build para publicar o usar la página.

Dirección: <https://svn11x.github.io/screencribe/>.

## Capturar una ventana

Elige Ventana y selecciona la ventana en el diálogo del navegador. Cuando están disponibles las APIs de estabilización, el encuadre se fija al iniciar y los fotogramas se ajustan proporcionalmente; pueden aparecer bandas negras.

Cambiar de pestaña dentro de la ventana capturada comparte el contenido de esa ventana. Cambiar a otra ventana no cambia automáticamente la fuente. Evita minimizar la ventana capturada: el sistema puede suspender sus fotogramas. Si faltan las APIs de estabilización, se avisa y se graba directamente.

Para sonido de una página, comparte una pestaña y activa «Compartir audio» en el selector. El audio compartido de ventanas o pantallas depende del navegador y del sistema operativo.

## Desarrollo y pruebas

Servidor local para la página:

```bash
python3 -m http.server 5500
```

Abre <http://localhost:5500>. Los módulos y workers requieren HTTP local o HTTPS.

Pruebas unitarias con Node.js 22 o posterior:

```bash
node --test tests/*.test.mjs
```

Prueba de navegador, **solo para desarrollo/CI**:

```bash
npm install --no-save playwright@1.62.1
npx playwright install chromium
node tests/browser.test.cjs
```

Requiere Python, FFmpeg/FFprobe nativos y el puerto 5500 disponible. Playwright solo controla el navegador de prueba; FFmpeg genera un MP3 de prueba y FFprobe inspecciona las descargas. Estas herramientas no forman parte de la página publicada ni se cargan a visitantes.

Variables opcionales: `SCREENCRIBE_PYTHON`, `SCREENCRIBE_QA_DIR`, `SCREENCRIBE_QA_PORT`, `CHROMIUM_EXECUTABLE` y `SCREENCRIBE_BROWSER_ARGS`.

Consulta [verificación](docs/VERIFICACION.md), [limitaciones](docs/LIMITATIONS.md), [privacidad](docs/PRIVACY.md) y [arquitectura](docs/ARCHITECTURE.md).

## Licencia

MIT para el código propio. Esta entrega no incluye bibliotecas de conversión de terceros.
