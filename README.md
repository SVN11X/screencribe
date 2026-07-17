# Screencribe

Aplicación web para grabar pantalla y audio, convertir a **MP4/MP3** y generar transcripciones con **Whisper Large v3 Turbo**, sin instalar Node.js, FFmpeg, WebGPU ni modelos de IA en los computadores que la utilizan.

## La solución incluida

Screencribe está dividida en dos partes:

1. **Página estática en GitHub Pages**: captura pantalla, audio compartido y micrófono.
2. **Servidor Docker**: recibe temporalmente la grabación, genera MP4/MP3 y transcribe con Whisper Large v3 Turbo.

El repositorio no usa Vite ni npm para publicar la página. GitHub Pages copia directamente los archivos estáticos, evitando los problemas anteriores con `node_modules`, Google Drive y `package-lock.json`.

## Funciones

- Grabación de pantalla, ventana o pestaña.
- Micrófono opcional.
- Audio de pestaña o sistema cuando el navegador lo permite.
- Mezcla de micrófono y audio compartido.
- Pausar, reanudar y detener.
- Cargar grabaciones existentes.
- Descargar el archivo original.
- Conversión en servidor a MP4 H.264/AAC.
- Extracción en servidor a MP3.
- Transcripción con Whisper Large v3 Turbo.
- Detección o selección del idioma.
- Vocabulario de apoyo para nombres propios y tecnicismos.
- Exportación TXT, JSON, SRT y VTT.
- Eliminación temporal de archivos.
- Diseño adaptable y modo oscuro automático.

## Requisitos para quien usa la página

Solo necesita:

- Un navegador actualizado.
- Conexión al servidor de procesamiento.
- Permiso para compartir pantalla y/o micrófono.

No necesita instalar nada ni proporcionar una API key.

## 1. Publicar la página en GitHub Pages

Sube el contenido de este repositorio a `https://github.com/SVN11X/screencribe` y ejecuta:

```powershell
git add .
git commit -m "Nueva arquitectura sin descargas locales"
git push origin main
```

Luego entra en:

`GitHub → Settings → Pages → Source → GitHub Actions`

El workflow `.github/workflows/pages.yml` publicará únicamente:

- `index.html`
- `404.html`
- `assets/`
- `src/`
- `icons/`

La dirección será:

`https://svn11x.github.io/screencribe/`

No debes ejecutar `npm install` ni `npm run build`.

## 2. Crear el backend gratuito en Hugging Face Spaces

### Crear la cuenta y el Space

1. Crea una cuenta en Hugging Face.
2. Crea un Space nuevo llamado, por ejemplo, `screencribe-api`.
3. Selecciona **Docker** como SDK.
4. Déjalo público para que GitHub Pages pueda conectarse.

### Método recomendado: desplegar desde GitHub Actions

En Hugging Face crea un token con permiso de escritura.

En GitHub abre:

`Settings → Secrets and variables → Actions`

Crea:

- **Secret:** `HF_TOKEN` con el token de Hugging Face.
- **Variable:** `HF_SPACE_ID` con un valor como `SVN11X/screencribe-api`.

Luego entra en:

`Actions → Deploy backend to Hugging Face → Run workflow`

El workflow subirá solamente la carpeta `backend/` al Space.

### Configurar el origen permitido

En el Space abre `Settings → Variables and secrets` y agrega:

```text
ALLOWED_ORIGINS=https://svn11x.github.io
```

También puedes configurar:

```text
MAX_UPLOAD_MB=300
JOB_TTL_SECONDS=7200
MAX_JOBS_PER_HOUR=5
WHISPER_CPU_THREADS=2
WHISPER_COMPUTE_TYPE=int8
```

Espera a que el Space indique **Running**. Su URL tendrá una forma parecida a:

```text
https://svn11x-screencribe-api.hf.space
```

Usa la URL exacta que muestre Hugging Face.

## 3. Conectar la página con el servidor

1. Abre `https://svn11x.github.io/screencribe/`.
2. Presiona **Configurar servidor**.
3. Pega la URL terminada en `.hf.space`.
4. Presiona **Probar conexión**.
5. Guarda la configuración.

La URL queda guardada en el navegador. No es una contraseña ni una API key.

## Funcionamiento de los archivos

1. El navegador crea una grabación usando `MediaRecorder`.
2. El usuario elige los resultados que necesita.
3. La grabación se carga al backend.
4. FFmpeg genera MP4 y MP3.
5. Whisper Large v3 Turbo genera la transcripción.
6. El navegador descarga los resultados.
7. El backend elimina los archivos al expirar el trabajo.

## Compatibilidad

Chrome y Edge en computador suelen ofrecer la mayor compatibilidad con audio del sistema. La captura de pantalla requiere HTTPS y una autorización explícita del usuario.

Ninguna página puede garantizar funcionamiento en todas las instituciones: una política administrada puede bloquear la captura, el micrófono o las cargas. Esta arquitectura evita la descarga de modelos y ejecutables en el equipo, lo que mejora considerablemente la compatibilidad frente a Whisper ejecutado en el navegador.

## Rendimiento del servidor gratuito

El hardware CPU gratuito puede tardar en despertar y Whisper Large v3 Turbo puede procesar lentamente grabaciones extensas. El mismo contenedor puede desplegarse posteriormente en un proveedor Docker con CPU más potente o GPU sin modificar el frontend.

## Privacidad

La grabación sí se envía al servidor, porque la conversión y la IA ya no se ejecutan en el dispositivo. Consulta `docs/PRIVACY.md` antes de utilizar la aplicación con datos personales o grabaciones de otras personas.

## Desarrollo opcional

Para revisar el frontend localmente puedes usar cualquier servidor estático. No es necesario para GitHub Pages.

Para ejecutar el backend con Docker:

```bash
docker build -t screencribe-api ./backend
docker run --rm -p 7860:7860 \
  -e ALLOWED_ORIGINS=http://localhost:5500 \
  screencribe-api
```

## Estructura

```text
screencribe/
├── index.html
├── assets/
├── src/
├── icons/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/main.py
├── docs/
└── .github/workflows/
```

## Licencia

MIT.
