# screencribe

Aplicación web estática para grabar pantalla, audio del sistema y micrófono; descargar WebM, convertir localmente a MP4 o MP3 y crear transcripciones gratuitas con **Whisper Large v3**, sin API key y sin subir el audio a un servidor de transcripción.

## Funcionalidades

- Captura de pantalla, ventana o pestaña.
- Micrófono opcional con cancelación de eco y reducción de ruido.
- Mezcla del micrófono con el audio compartido.
- Pausa, reanudación, temporizador y vista previa.
- Carga de archivos de audio o video existentes.
- Descarga del archivo original.
- Conversión local a MP4 H.264/AAC y MP3 mediante ffmpeg.wasm.
- Transcripción local con `onnx-community/whisper-large-v3-ONNX`.
- Ejecución WebGPU en un Web Worker para no bloquear la interfaz.
- Modelo cuantizado en 4 bits para reducir descarga y uso de memoria.
- Procesamiento del audio en mono a 16 kHz y bloques con solapamiento.
- Idioma explícito o detección automática.
- Exportación de transcripción en TXT, Markdown, JSON, SRT y VTT.
- Interfaz adaptable, accesible y sin base de datos.

## Lo más importante

La transcripción **no necesita OpenAI, Cloudflare, Supabase ni otra API**. El navegador descarga los archivos del modelo desde Hugging Face la primera vez y normalmente los reutiliza desde su caché en las siguientes sesiones.

Whisper Large v3 es exigente. La aplicación requiere WebGPU para la transcripción y está pensada principalmente para Chrome o Edge de escritorio con una GPU moderna. Se recomiendan 16 GB de RAM o más y espacio libre suficiente para la caché del navegador.

## Arquitectura

```text
Pantalla + micrófono
        ↓
MediaRecorder → WebM original
        ↓
ffmpeg.wasm → MP4 / MP3
        ↓
Web Audio API → mono Float32, 16 kHz
        ↓
Web Worker + Transformers.js + WebGPU
        ↓
Whisper Large v3 cuantizado
        ↓
TXT / Markdown / JSON / SRT / VTT
```

Todo el proyecto puede publicarse en GitHub Pages porque no necesita backend.

## Requisitos de desarrollo

- Node.js 22 o superior.
- npm.
- Chrome o Edge actualizado para probar WebGPU y captura de pantalla.
- HTTPS para la versión publicada.

## Ejecutar localmente

```bash
npm install --ignore-scripts
npm run dev
```

Vite mostrará la dirección local. La captura de pantalla funciona en `localhost`, que el navegador considera un contexto seguro.

## Publicar en GitHub Pages

1. Crea un repositorio de GitHub.
2. Copia el contenido del proyecto y súbelo a la rama `main`.
3. Abre **Settings → Pages**.
4. En **Source**, selecciona **GitHub Actions**.
5. El workflow `.github/workflows/pages.yml` compilará y publicará la aplicación.

La opción `base: './'` permite usar tanto un repositorio de proyecto como un sitio `usuario.github.io`.

## Verificar el proyecto

```bash
npm run format:check
npm run check
npm run build
```

## Limitaciones reales

- La primera preparación de Whisper Large descarga varios gigabytes y puede tardar según la conexión.
- El modelo puede no caber en GPUs o equipos con poca memoria.
- La cuantización reduce recursos, pero puede producir una pequeña pérdida de precisión frente a los pesos completos.
- El navegador puede eliminar la caché del modelo si necesita liberar almacenamiento.
- Firefox, Safari y dispositivos móviles pueden no ofrecer WebGPU compatible o suficiente memoria.
- La captura del audio del sistema depende del navegador, sistema operativo y elemento compartido.
- Las grabaciones largas consumen memoria durante la decodificación y la transcripción.
- Whisper no identifica hablantes en esta implementación.
- Ningún sistema automático garantiza una transcripción perfecta; revisa nombres propios, cifras y terminología crítica.

## Privacidad y consentimiento

La grabación, conversión y transcripción se realizan en el dispositivo. Los archivos del modelo se descargan desde Hugging Face, pero el audio seleccionado no se envía allí. Antes de grabar o transcribir a otras personas, obtén las autorizaciones que correspondan.

Consulta [Arquitectura](docs/ARCHITECTURE.md), [IA local](docs/LOCAL_AI.md), [Privacidad](docs/PRIVACY.md) y [Seguridad](SECURITY.md).

## Licencia

El código de esta aplicación se distribuye bajo licencia MIT. Las dependencias y el modelo conservan sus licencias respectivas.
