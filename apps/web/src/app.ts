import { MediaConverter, type ConversionStatus } from './lib/converter';
import { downloadBlob, textBlob } from './lib/download';
import { decodeAudioForWhisper, estimateAudioMemoryBytes } from './lib/audio';
import { dateSuffix, formatBytes, formatDuration, sanitizeFilename } from './lib/format';
import { LocalWhisperEngine, type WhisperProgress } from './lib/local-transcription';
import { ScreenRecorder } from './lib/recorder';
import { loadSettings, saveSettings } from './lib/storage';
import {
  segmentsToSrt,
  segmentsToVtt,
  transcriptionToMarkdown,
  transcriptionToTxt,
} from './lib/subtitles';
import type { AppSettings, RecordingState, TranscriptionResponse } from './lib/types';
import { WHISPER_MODEL_LABEL } from './lib/whisper-protocol';

const MAX_BROWSER_CONVERSION_BYTES = 1_200 * 1024 * 1024;

export class App {
  private readonly recorder = new ScreenRecorder();
  private readonly converter = new MediaConverter();
  private readonly whisper = new LocalWhisperEngine();
  private settings: AppSettings = loadSettings();
  private state: RecordingState = 'idle';
  private sourceBlob: Blob | null = null;
  private sourceFilename = '';
  private sourceObjectUrl: string | null = null;
  private mp4Blob: Blob | null = null;
  private mp3Blob: Blob | null = null;
  private transcript: TranscriptionResponse | null = null;
  private timerId: number | null = null;
  private liveStartedAt = 0;
  private livePausedAt = 0;
  private livePausedDuration = 0;
  private transcriptionAbort: AbortController | null = null;
  private modelLoading = false;

  constructor(private readonly root: HTMLElement) {}

  mount(): void {
    this.root.innerHTML = this.template();
    this.populateSettings();
    this.bindEvents();
    this.updateCapabilityNotice();
    this.updateState('idle');
  }

  private template(): string {
    return `
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">●</span>
          <div>
            <strong>Captura IA Studio</strong>
            <span>Grabación, conversión y transcripción</span>
          </div>
        </div>
        <div class="privacy-chip" title="Las conversiones se ejecutan en este dispositivo">
          <span aria-hidden="true">◆</span> Procesamiento local
        </div>
      </header>

      <main id="main-content" class="app-shell">
        <section class="hero" aria-labelledby="hero-title">
          <div>
            <p class="eyebrow">ESTUDIO DE CAPTURA EN EL NAVEGADOR</p>
            <h1 id="hero-title">Graba con claridad. Entrega en cualquier formato.</h1>
            <p>
              Captura pantalla, audio del sistema y micrófono. Descarga WebM, MP4 y MP3,
              y genera transcripciones privadas con Whisper Large v3, sin API key ni pagos por minuto.
            </p>
          </div>
          <div class="hero-metrics" aria-label="Características principales">
            <div><strong>1080p</strong><span>Captura recomendada</span></div>
            <div><strong>Local</strong><span>Conversión privada</span></div>
            <div><strong>Large v3</strong><span>Whisper local</span></div>
          </div>
        </section>

        <div id="capabilityNotice" class="notice notice-warning" hidden></div>

        <section class="workspace-grid">
          <article class="card recorder-card" aria-labelledby="record-title">
            <div class="card-heading">
              <div>
                <p class="step-label">PASO 1</p>
                <h2 id="record-title">Configura y graba</h2>
              </div>
              <span id="statusBadge" class="status-badge status-idle">Listo</span>
            </div>

            <div class="preview-wrap">
              <video id="preview" playsinline muted controls hidden></video>
              <div id="previewEmpty" class="preview-empty">
                <div class="preview-icon" aria-hidden="true">▣</div>
                <strong>La vista previa aparecerá aquí</strong>
                <span>El navegador te pedirá elegir una pantalla, ventana o pestaña.</span>
              </div>
              <div id="recordingIndicator" class="recording-indicator" hidden>
                <span></span> REC
              </div>
              <output id="timer" class="timer" aria-live="polite">00:00:00</output>
            </div>

            <div class="settings-grid">
              <label class="toggle-row">
                <span>
                  <strong>Micrófono</strong>
                  <small>Tu voz con reducción de ruido</small>
                </span>
                <input id="captureMicrophone" type="checkbox" />
                <span class="toggle" aria-hidden="true"></span>
              </label>

              <label class="toggle-row">
                <span>
                  <strong>Audio del sistema</strong>
                  <small>Depende del navegador y lo compartido</small>
                </span>
                <input id="captureSystemAudio" type="checkbox" />
                <span class="toggle" aria-hidden="true"></span>
              </label>

              <label class="field">
                <span>Resolución</span>
                <select id="resolution">
                  <option value="720p">720p — ligera</option>
                  <option value="1080p">1080p — recomendada</option>
                  <option value="native">Nativa — máxima</option>
                </select>
              </label>

              <label class="field">
                <span>Fotogramas por segundo</span>
                <select id="frameRate">
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                </select>
              </label>

              <label class="field range-field">
                <span>Volumen del micrófono <output id="microphoneGainValue">100%</output></span>
                <input id="microphoneGain" type="range" min="0" max="2" step="0.05" />
              </label>

              <label class="field range-field">
                <span>Volumen del sistema <output id="systemAudioGainValue">100%</output></span>
                <input id="systemAudioGain" type="range" min="0" max="2" step="0.05" />
              </label>
            </div>

            <div class="record-actions">
              <button id="startButton" class="button button-primary" type="button">
                <span aria-hidden="true">●</span> Iniciar grabación
              </button>
              <button id="pauseButton" class="button button-secondary" type="button" disabled>
                Pausar
              </button>
              <button id="stopButton" class="button button-danger" type="button" disabled>
                Detener
              </button>
            </div>

            <p class="helper-text">
              Para capturar sonido de una pestaña, marca “Compartir audio de la pestaña” en el selector del navegador.
            </p>
          </article>

          <aside class="side-stack">
            <article class="card" aria-labelledby="file-title">
              <div class="card-heading compact">
                <div>
                  <p class="step-label">ALTERNATIVA</p>
                  <h2 id="file-title">Usar un archivo existente</h2>
                </div>
              </div>
              <label class="drop-zone" for="existingFile">
                <span class="drop-icon" aria-hidden="true">＋</span>
                <strong>Seleccionar audio o video</strong>
                <small>WebM, MP4, MP3, WAV, M4A y formatos compatibles</small>
              </label>
              <input id="existingFile" class="visually-hidden" type="file" accept="audio/*,video/*" />
              <p id="selectedFileLabel" class="selected-file" hidden></p>
            </article>

            <article class="card trust-card">
              <p class="step-label">PRIVACIDAD</p>
              <h2>Diseñada para proteger tus archivos</h2>
              <ul class="feature-list">
                <li><span>✓</span> Grabación y conversiones en tu navegador.</li>
                <li><span>✓</span> Sin subida automática ni almacenamiento.</li>
                <li><span>✓</span> Whisper se ejecuta localmente, sin API key.</li>
              </ul>
            </article>
          </aside>
        </section>

        <section id="exportSection" class="card results-card" aria-labelledby="export-title" hidden>
          <div class="card-heading">
            <div>
              <p class="step-label">PASO 2</p>
              <h2 id="export-title">Exporta tu grabación</h2>
            </div>
            <div id="sourceMeta" class="source-meta"></div>
          </div>

          <label class="field filename-field">
            <span>Nombre base de los archivos</span>
            <input id="fileBaseName" type="text" maxlength="80" autocomplete="off" />
          </label>

          <div class="export-grid">
            <button id="downloadOriginalButton" class="export-option" type="button">
              <span class="format-icon">WEBM</span>
              <span><strong>Original</strong><small>Descarga inmediata, sin conversión</small></span>
              <span aria-hidden="true">↓</span>
            </button>

            <div class="export-option-wrap">
              <button id="convertMp4Button" class="export-option" type="button">
                <span class="format-icon format-video">MP4</span>
                <span><strong>Video compatible</strong><small>H.264 + AAC para reproducción amplia</small></span>
                <span aria-hidden="true">↓</span>
              </button>
              <select id="mp4Quality" aria-label="Calidad de conversión MP4">
                <option value="fast">Rápida</option>
                <option value="balanced">Equilibrada</option>
                <option value="quality">Alta calidad</option>
              </select>
            </div>

            <button id="convertMp3Button" class="export-option" type="button">
              <span class="format-icon format-audio">MP3</span>
              <span><strong>Solo audio</strong><small>128 kbps para escuchar o compartir</small></span>
              <span aria-hidden="true">↓</span>
            </button>
          </div>

          <div id="conversionPanel" class="progress-panel" hidden>
            <div><span id="conversionMessage">Preparando…</span><strong id="conversionPercent">0%</strong></div>
            <progress id="conversionProgress" max="1" value="0"></progress>
          </div>
        </section>

        <section class="card transcript-card" aria-labelledby="transcript-title">
          <div class="card-heading">
            <div>
              <p class="step-label">PASO 3</p>
              <h2 id="transcript-title">Transcribe gratis con Whisper Large</h2>
            </div>
            <span class="cost-chip cost-free">Sin API · Sin costo</span>
          </div>

          <div class="local-ai-intro">
            <div class="model-card">
              <span class="model-badge">MODELO LOCAL</span>
              <div>
                <strong>Whisper Large v3 cuantizado</strong>
                <small>Máxima familia Whisper, ejecutada con WebGPU dentro de tu navegador.</small>
              </div>
            </div>
            <p>
              La primera ejecución descarga varios gigabytes desde Hugging Face y los guarda en la
              caché del navegador. El audio nunca se envía a un servicio de transcripción.
            </p>
          </div>

          <div class="transcript-settings">
            <label class="field">
              <span>Idioma del audio</span>
              <select id="language">
                <option value="auto">Detectar automáticamente</option>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="pt">Portugués</option>
                <option value="fr">Francés</option>
                <option value="de">Alemán</option>
                <option value="it">Italiano</option>
              </select>
              <small>Elegir el idioma suele mejorar la precisión.</small>
            </label>

            <div class="field hardware-field">
              <span>Requisitos del equipo</span>
              <strong id="hardwareStatus">Comprobando WebGPU…</strong>
              <small id="hardwareHelp">Chrome o Edge de escritorio con GPU compatible.</small>
            </div>
          </div>

          <div id="modelProgressPanel" class="progress-panel model-progress-panel" hidden>
            <div><span id="modelProgressMessage">Preparando modelo…</span><strong id="modelProgressPercent"></strong></div>
            <progress id="modelProgress" max="1"></progress>
          </div>

          <div class="transcript-actions">
            <button id="prepareModelButton" class="button button-secondary" type="button">
              Preparar Whisper Large
            </button>
            <button id="transcribeButton" class="button button-primary" type="button" disabled>
              Generar transcripción
            </button>
            <button id="cancelTranscriptionButton" class="button button-secondary" type="button" hidden>
              Cancelar
            </button>
            <span id="transcriptionStatus" class="inline-status" aria-live="polite"></span>
          </div>

          <div id="transcriptOutput" class="transcript-output" hidden>
            <div class="output-heading">
              <div>
                <strong>Transcripción editable</strong>
                <span id="transcriptMeta"></span>
              </div>
              <button id="copyTranscriptButton" class="text-button" type="button">Copiar texto</button>
            </div>
            <textarea id="transcriptText" rows="14" spellcheck="true"></textarea>
            <div class="download-row">
              <button id="downloadTxtButton" class="button button-small" type="button">TXT</button>
              <button id="downloadMdButton" class="button button-small" type="button">Markdown</button>
              <button id="downloadJsonButton" class="button button-small" type="button">JSON</button>
              <button id="downloadSrtButton" class="button button-small" type="button">SRT</button>
              <button id="downloadVttButton" class="button button-small" type="button">VTT</button>
            </div>
          </div>
        </section>

        <section class="info-strip">
          <div><strong>Navegador recomendado</strong><span>Chrome o Edge de escritorio con WebGPU habilitado.</span></div>
          <div><strong>Primera carga</strong><span>Whisper Large descarga varios GB; luego reutiliza la caché local.</span></div>
          <div><strong>Archivos extensos</strong><span>La velocidad depende de la GPU, memoria y duración del audio.</span></div>
        </section>
      </main>

      <footer>
        <span>Captura IA Studio · Código abierto · Sin almacenamiento de archivos</span>
      </footer>

      <div id="toastRegion" class="toast-region" aria-live="polite" aria-atomic="true"></div>
    `;
  }

  private bindEvents(): void {
    this.el<HTMLButtonElement>('startButton').addEventListener(
      'click',
      () => void this.startRecording(),
    );
    this.el<HTMLButtonElement>('pauseButton').addEventListener('click', () => this.togglePause());
    this.el<HTMLButtonElement>('stopButton').addEventListener(
      'click',
      () => void this.stopRecording(),
    );
    this.el<HTMLInputElement>('existingFile').addEventListener('change', (event) => {
      const input = event.currentTarget;
      if (input instanceof HTMLInputElement && input.files?.[0])
        this.useExistingFile(input.files[0]);
    });
    this.el<HTMLButtonElement>('downloadOriginalButton').addEventListener('click', () =>
      this.downloadOriginal(),
    );
    this.el<HTMLButtonElement>('convertMp4Button').addEventListener(
      'click',
      () => void this.convertAndDownloadMp4(),
    );
    this.el<HTMLButtonElement>('convertMp3Button').addEventListener(
      'click',
      () => void this.convertAndDownloadMp3(),
    );
    this.el<HTMLButtonElement>('prepareModelButton').addEventListener(
      'click',
      () => void this.prepareWhisperModel(),
    );
    this.el<HTMLButtonElement>('transcribeButton').addEventListener(
      'click',
      () => void this.startTranscription(),
    );
    this.el<HTMLButtonElement>('cancelTranscriptionButton').addEventListener('click', () => {
      this.transcriptionAbort?.abort();
      this.whisper.cancel();
    });
    this.el<HTMLButtonElement>('copyTranscriptButton').addEventListener(
      'click',
      () => void this.copyTranscript(),
    );
    this.el<HTMLButtonElement>('downloadTxtButton').addEventListener('click', () =>
      this.downloadTranscript('txt'),
    );
    this.el<HTMLButtonElement>('downloadMdButton').addEventListener('click', () =>
      this.downloadTranscript('md'),
    );
    this.el<HTMLButtonElement>('downloadJsonButton').addEventListener('click', () =>
      this.downloadTranscript('json'),
    );
    this.el<HTMLButtonElement>('downloadSrtButton').addEventListener('click', () =>
      this.downloadTranscript('srt'),
    );
    this.el<HTMLButtonElement>('downloadVttButton').addEventListener('click', () =>
      this.downloadTranscript('vtt'),
    );

    const settingsIds = [
      'captureMicrophone',
      'captureSystemAudio',
      'resolution',
      'frameRate',
      'microphoneGain',
      'systemAudioGain',
      'fileBaseName',
      'mp4Quality',
      'language',
    ];
    for (const id of settingsIds) {
      this.el<HTMLElement>(id).addEventListener('input', () => this.readAndSaveSettings());
      this.el<HTMLElement>(id).addEventListener('change', () => this.readAndSaveSettings());
    }
  }

  private populateSettings(): void {
    this.el<HTMLInputElement>('captureMicrophone').checked = this.settings.captureMicrophone;
    this.el<HTMLInputElement>('captureSystemAudio').checked = this.settings.captureSystemAudio;
    this.el<HTMLSelectElement>('resolution').value = this.settings.resolution;
    this.el<HTMLSelectElement>('frameRate').value = String(this.settings.frameRate);
    this.el<HTMLInputElement>('microphoneGain').value = String(this.settings.microphoneGain);
    this.el<HTMLInputElement>('systemAudioGain').value = String(this.settings.systemAudioGain);
    this.el<HTMLInputElement>('fileBaseName').value = this.settings.fileBaseName;
    this.el<HTMLSelectElement>('mp4Quality').value = this.settings.mp4Quality;
    this.el<HTMLSelectElement>('language').value = this.settings.language;
    this.updateGainLabels();
  }

  private readAndSaveSettings(): void {
    this.settings = {
      captureMicrophone: this.el<HTMLInputElement>('captureMicrophone').checked,
      captureSystemAudio: this.el<HTMLInputElement>('captureSystemAudio').checked,
      resolution: this.el<HTMLSelectElement>('resolution').value as AppSettings['resolution'],
      frameRate: Number(this.el<HTMLSelectElement>('frameRate').value) as AppSettings['frameRate'],
      microphoneGain: Number(this.el<HTMLInputElement>('microphoneGain').value),
      systemAudioGain: Number(this.el<HTMLInputElement>('systemAudioGain').value),
      fileBaseName: this.el<HTMLInputElement>('fileBaseName').value,
      mp4Quality: this.el<HTMLSelectElement>('mp4Quality').value as AppSettings['mp4Quality'],
      language: this.el<HTMLSelectElement>('language').value as AppSettings['language'],
    };
    saveSettings(this.settings);
    this.updateGainLabels();
    this.updateTranscribeButton();
  }

  private async startRecording(): Promise<void> {
    try {
      this.readAndSaveSettings();
      this.resetOutputs();
      this.updateState('recording');
      const stream = await this.recorder.start(this.settings, () => {
        void this.stopRecording();
      });
      this.setPreviewStream(stream);
      this.liveStartedAt = performance.now();
      this.livePausedDuration = 0;
      this.livePausedAt = 0;
      this.startTimer();
      this.toast('Grabación iniciada.');
    } catch (error) {
      this.updateState('idle');
      this.showError(error, 'No fue posible iniciar la grabación.');
    }
  }

  private togglePause(): void {
    if (this.state === 'recording') {
      this.recorder.pause();
      this.livePausedAt = performance.now();
      this.updateState('paused');
      return;
    }
    if (this.state === 'paused') {
      this.recorder.resume();
      this.livePausedDuration += performance.now() - this.livePausedAt;
      this.livePausedAt = 0;
      this.updateState('recording');
    }
  }

  private async stopRecording(): Promise<void> {
    if (!['recording', 'paused'].includes(this.state)) return;
    try {
      this.updateState('stopping');
      const result = await this.recorder.stop();
      this.stopTimer();
      this.setSource(result.blob, `grabacion-${dateSuffix(result.createdAt)}.webm`);
      this.el<HTMLOutputElement>('timer').value = formatDuration(result.durationMs);
      this.updateState('ready');
      this.toast('Grabación terminada y lista para descargar.');
    } catch (error) {
      this.stopTimer();
      this.updateState('idle');
      this.showError(error, 'No se pudo finalizar la grabación.');
    }
  }

  private useExistingFile(file: File): void {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      this.toast('Selecciona un archivo de audio o video válido.', 'error');
      return;
    }
    this.resetOutputs();
    this.setSource(file, file.name);
    const label = this.el<HTMLParagraphElement>('selectedFileLabel');
    label.hidden = false;
    label.textContent = `${file.name} · ${formatBytes(file.size)}`;
    this.updateState('ready');
    this.toast('Archivo cargado para exportación o transcripción.');
  }

  private setSource(blob: Blob, filename: string): void {
    this.sourceBlob = blob;
    this.sourceFilename = filename;
    this.mp4Blob = null;
    this.mp3Blob = null;
    this.transcript = null;
    this.el<HTMLElement>('transcriptOutput').hidden = true;

    if (this.sourceObjectUrl) URL.revokeObjectURL(this.sourceObjectUrl);
    this.sourceObjectUrl = URL.createObjectURL(blob);
    const preview = this.el<HTMLVideoElement>('preview');
    preview.srcObject = null;
    preview.src = this.sourceObjectUrl;
    preview.muted = false;
    preview.controls = true;
    preview.hidden = false;
    this.el<HTMLElement>('previewEmpty').hidden = true;

    this.el<HTMLElement>('exportSection').hidden = false;
    this.el<HTMLElement>('sourceMeta').textContent =
      `${formatBytes(blob.size)} · ${blob.type || 'multimedia'}`;
    if (!this.settings.fileBaseName || this.settings.fileBaseName === 'grabacion') {
      this.settings.fileBaseName = sanitizeFilename(filename.replace(/\.[^.]+$/, ''));
      this.el<HTMLInputElement>('fileBaseName').value = this.settings.fileBaseName;
      saveSettings(this.settings);
    }
    this.updateTranscribeButton();
    this.el<HTMLElement>('exportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private setPreviewStream(stream: MediaStream): void {
    const preview = this.el<HTMLVideoElement>('preview');
    if (this.sourceObjectUrl) {
      URL.revokeObjectURL(this.sourceObjectUrl);
      this.sourceObjectUrl = null;
    }
    preview.removeAttribute('src');
    preview.srcObject = stream;
    preview.muted = true;
    preview.controls = false;
    preview.hidden = false;
    this.el<HTMLElement>('previewEmpty').hidden = true;
    void preview.play().catch(() => undefined);
  }

  private downloadOriginal(): void {
    if (!this.sourceBlob) return;
    const extension = this.extensionFromSource();
    downloadBlob(this.sourceBlob, `${this.baseFilename()}.${extension}`);
  }

  private async convertAndDownloadMp4(): Promise<void> {
    if (!this.sourceBlob || !this.canConvert(this.sourceBlob)) return;
    try {
      this.setConversionBusy(true);
      if (!this.mp4Blob) {
        this.mp4Blob = await this.converter.toMp4(
          this.sourceBlob,
          this.settings.mp4Quality,
          (status) => this.updateConversionProgress(status),
        );
      }
      downloadBlob(this.mp4Blob, `${this.baseFilename()}.mp4`);
      this.toast('MP4 listo para descargar.');
    } catch (error) {
      this.showError(
        error,
        'La conversión a MP4 falló. Prueba la opción rápida o un archivo más pequeño.',
      );
    } finally {
      this.setConversionBusy(false);
    }
  }

  private async convertAndDownloadMp3(): Promise<void> {
    if (!this.sourceBlob || !this.canConvert(this.sourceBlob)) return;
    try {
      this.setConversionBusy(true);
      if (!this.mp3Blob) {
        this.mp3Blob = await this.converter.toMp3(this.sourceBlob, (status) =>
          this.updateConversionProgress(status),
        );
      }
      downloadBlob(this.mp3Blob, `${this.baseFilename()}.mp3`);
      this.updateTranscribeButton();
      this.toast('MP3 listo para descargar.');
    } catch (error) {
      this.showError(error, 'No se pudo extraer el audio MP3.');
    } finally {
      this.setConversionBusy(false);
    }
  }

  private async prepareWhisperModel(): Promise<void> {
    if (!this.hasWebGpu() || this.modelLoading || this.whisper.isReady()) return;
    this.modelLoading = true;
    this.updateTranscribeButton();
    this.el<HTMLButtonElement>('prepareModelButton').disabled = true;
    this.setModelProgress({ kind: 'model', message: 'Iniciando descarga de Whisper Large v3…' });

    try {
      await this.whisper.prepare((progress) => this.setModelProgress(progress));
      this.setModelReadyUi();
      this.toast('Whisper Large v3 está preparado y almacenado en la caché local.');
    } catch (error) {
      this.showError(
        error,
        'No fue posible cargar Whisper Large. Revisa WebGPU, espacio disponible y conexión.',
      );
      this.el<HTMLElement>('modelProgressPanel').hidden = true;
    } finally {
      this.modelLoading = false;
      this.el<HTMLButtonElement>('prepareModelButton').disabled =
        !this.hasWebGpu() || this.whisper.isReady();
      this.updateTranscribeButton();
    }
  }

  private async startTranscription(): Promise<void> {
    if (!this.sourceBlob || !this.hasWebGpu()) return;
    this.readAndSaveSettings();
    this.transcriptionAbort = new AbortController();
    const cancel = this.el<HTMLButtonElement>('cancelTranscriptionButton');
    cancel.hidden = false;
    this.updateTranscribeButton();

    try {
      if (!this.whisper.isReady()) await this.prepareWhisperModel();
      if (!this.whisper.isReady()) return;

      this.setTranscriptionStatus('Decodificando y convirtiendo el audio a mono, 16 kHz…');
      const decoded = await decodeAudioForWhisper(this.sourceBlob);
      const memory = estimateAudioMemoryBytes(decoded.durationSeconds);
      this.setTranscriptionStatus(
        `Audio preparado: ${formatDuration(decoded.durationSeconds * 1000)} · ${formatBytes(memory)} en memoria.`,
      );

      const result = await this.whisper.transcribe(
        decoded.samples,
        this.settings.language,
        (progress) => this.setWhisperProgress(progress),
        this.transcriptionAbort.signal,
      );
      this.transcript = result;
      this.showTranscript(result);
      this.setTranscriptionStatus('Transcripción local terminada.');
      this.toast('Transcripción generada con Whisper Large v3.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.setTranscriptionStatus(
          'Transcripción cancelada. El modelo se descargará desde la caché al reintentar.',
        );
      } else {
        this.setTranscriptionStatus('');
        this.showError(error, 'No se pudo generar la transcripción local.');
      }
    } finally {
      this.transcriptionAbort = null;
      cancel.hidden = true;
      this.modelLoading = false;
      this.updateTranscribeButton();
      this.el<HTMLButtonElement>('prepareModelButton').disabled =
        !this.hasWebGpu() || this.whisper.isReady();
    }
  }

  private showTranscript(result: TranscriptionResponse): void {
    const text = result.segments.length ? transcriptionToTxt(result) : result.text;
    this.el<HTMLTextAreaElement>('transcriptText').value = text.trim();
    const metaParts: string[] = [];
    if (result.duration) metaParts.push(formatDuration(result.duration * 1000));
    if (result.segments.length) metaParts.push(`${result.segments.length} segmentos`);
    metaParts.push(WHISPER_MODEL_LABEL);
    this.el<HTMLElement>('transcriptMeta').textContent = metaParts.join(' · ');
    const hasSegments = Boolean(result.segments.length);
    this.el<HTMLButtonElement>('downloadSrtButton').disabled = !hasSegments;
    this.el<HTMLButtonElement>('downloadVttButton').disabled = !hasSegments;
    const output = this.el<HTMLElement>('transcriptOutput');
    output.hidden = false;
    output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private async copyTranscript(): Promise<void> {
    const value = this.el<HTMLTextAreaElement>('transcriptText').value;
    await navigator.clipboard.writeText(value);
    this.toast('Transcripción copiada.');
  }

  private downloadTranscript(format: 'txt' | 'md' | 'json' | 'srt' | 'vtt'): void {
    if (!this.transcript) return;
    const base = `${this.baseFilename()}-transcripcion`;
    const editedText = this.el<HTMLTextAreaElement>('transcriptText').value;

    switch (format) {
      case 'txt':
        downloadBlob(textBlob(`${editedText.trim()}\n`), `${base}.txt`);
        break;
      case 'md': {
        const content = this.transcript.segments.length
          ? transcriptionToMarkdown(this.transcript)
          : `# Transcripción\n\n${editedText.trim()}\n`;
        downloadBlob(textBlob(content, 'text/markdown;charset=utf-8'), `${base}.md`);
        break;
      }
      case 'json':
        downloadBlob(
          textBlob(JSON.stringify(this.transcript, null, 2), 'application/json;charset=utf-8'),
          `${base}.json`,
        );
        break;
      case 'srt':
        downloadBlob(textBlob(segmentsToSrt(this.transcript.segments)), `${base}.srt`);
        break;
      case 'vtt':
        downloadBlob(
          textBlob(segmentsToVtt(this.transcript.segments), 'text/vtt;charset=utf-8'),
          `${base}.vtt`,
        );
        break;
    }
  }

  private updateState(state: RecordingState): void {
    this.state = state;
    const start = this.el<HTMLButtonElement>('startButton');
    const pause = this.el<HTMLButtonElement>('pauseButton');
    const stop = this.el<HTMLButtonElement>('stopButton');
    const badge = this.el<HTMLElement>('statusBadge');
    const indicator = this.el<HTMLElement>('recordingIndicator');

    start.disabled = state !== 'idle' && state !== 'ready';
    pause.disabled = state !== 'recording' && state !== 'paused';
    stop.disabled = state !== 'recording' && state !== 'paused';
    pause.textContent = state === 'paused' ? 'Reanudar' : 'Pausar';
    indicator.hidden = state !== 'recording';

    const labels: Record<RecordingState, string> = {
      idle: 'Listo',
      recording: 'Grabando',
      paused: 'En pausa',
      stopping: 'Finalizando',
      ready: 'Archivo listo',
    };
    badge.textContent = labels[state];
    badge.className = `status-badge status-${state}`;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      const pausedNow = this.livePausedAt ? performance.now() - this.livePausedAt : 0;
      const elapsed = performance.now() - this.liveStartedAt - this.livePausedDuration - pausedNow;
      this.el<HTMLOutputElement>('timer').value = formatDuration(elapsed);
    }, 250);
  }

  private stopTimer(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId);
    this.timerId = null;
  }

  private resetOutputs(): void {
    this.sourceBlob = null;
    this.sourceFilename = '';
    this.mp4Blob = null;
    this.mp3Blob = null;
    this.transcript = null;
    this.el<HTMLElement>('exportSection').hidden = true;
    this.el<HTMLElement>('transcriptOutput').hidden = true;
    this.el<HTMLParagraphElement>('selectedFileLabel').hidden = true;
    this.el<HTMLOutputElement>('timer').value = '00:00:00';
    if (this.sourceObjectUrl) URL.revokeObjectURL(this.sourceObjectUrl);
    this.sourceObjectUrl = null;
    const preview = this.el<HTMLVideoElement>('preview');
    preview.pause();
    preview.srcObject = null;
    preview.removeAttribute('src');
    preview.hidden = true;
    this.el<HTMLElement>('previewEmpty').hidden = false;
  }

  private canConvert(blob: Blob): boolean {
    if (blob.size <= MAX_BROWSER_CONVERSION_BYTES) return true;
    this.toast(
      `El archivo pesa ${formatBytes(blob.size)}. Para evitar agotar la memoria, usa el original o procesa el archivo con FFmpeg de escritorio.`,
      'error',
    );
    return false;
  }

  private setConversionBusy(busy: boolean): void {
    this.el<HTMLElement>('conversionPanel').hidden = !busy;
    for (const id of ['convertMp4Button', 'convertMp3Button', 'downloadOriginalButton']) {
      this.el<HTMLButtonElement>(id).disabled = busy;
    }
    if (!busy) {
      this.el<HTMLProgressElement>('conversionProgress').value = 0;
      this.el<HTMLElement>('conversionPercent').textContent = '0%';
    }
  }

  private updateConversionProgress(status: ConversionStatus): void {
    this.el<HTMLElement>('conversionPanel').hidden = false;
    this.el<HTMLProgressElement>('conversionProgress').value = status.progress;
    this.el<HTMLElement>('conversionMessage').textContent = status.message;
    this.el<HTMLElement>('conversionPercent').textContent = `${Math.round(status.progress * 100)}%`;
  }

  private setTranscriptionStatus(message: string): void {
    this.el<HTMLElement>('transcriptionStatus').textContent = message;
  }

  private updateGainLabels(): void {
    const mic = Number(this.el<HTMLInputElement>('microphoneGain').value || 1);
    const system = Number(this.el<HTMLInputElement>('systemAudioGain').value || 1);
    this.el<HTMLOutputElement>('microphoneGainValue').value = `${Math.round(mic * 100)}%`;
    this.el<HTMLOutputElement>('systemAudioGainValue').value = `${Math.round(system * 100)}%`;
  }

  private updateTranscribeButton(): void {
    const button = this.el<HTMLButtonElement>('transcribeButton');
    button.disabled =
      !this.sourceBlob ||
      !this.hasWebGpu() ||
      Boolean(this.transcriptionAbort) ||
      this.modelLoading;
  }

  private updateCapabilityNotice(): void {
    const notice = this.el<HTMLElement>('capabilityNotice');
    const missing: string[] = [];
    if (!window.isSecureContext) missing.push('HTTPS');
    const mediaDevices = (navigator as unknown as { mediaDevices?: Partial<MediaDevices> })
      .mediaDevices;
    if (typeof mediaDevices?.getDisplayMedia !== 'function') missing.push('captura de pantalla');
    if (typeof MediaRecorder === 'undefined') missing.push('MediaRecorder');
    if (!this.hasWebGpu()) missing.push('WebGPU para Whisper Large');

    const hardwareStatus = this.el<HTMLElement>('hardwareStatus');
    const hardwareHelp = this.el<HTMLElement>('hardwareHelp');
    const prepare = this.el<HTMLButtonElement>('prepareModelButton');
    if (this.hasWebGpu()) {
      hardwareStatus.textContent = 'WebGPU disponible';
      hardwareStatus.classList.add('hardware-ok');
      const deviceMemory = this.deviceMemory();
      hardwareHelp.textContent = deviceMemory
        ? `${deviceMemory} GB de memoria declarada. Se recomiendan 16 GB o más.`
        : 'Se recomiendan 16 GB de RAM y una GPU moderna.';
    } else {
      hardwareStatus.textContent = 'WebGPU no disponible';
      hardwareStatus.classList.add('hardware-error');
      hardwareHelp.textContent = 'Whisper Large no se habilitará en este navegador o dispositivo.';
      prepare.disabled = true;
    }

    if (missing.length) {
      notice.hidden = false;
      notice.textContent = `Funciones no disponibles: ${missing.join(', ')}. Abre la página mediante HTTPS en Chrome o Edge de escritorio actualizado.`;
    }
  }

  private hasWebGpu(): boolean {
    return 'gpu' in navigator;
  }

  private deviceMemory(): number | null {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof memory === 'number' ? memory : null;
  }

  private setModelReadyUi(): void {
    this.el<HTMLElement>('modelProgressPanel').hidden = false;
    this.el<HTMLElement>('modelProgressMessage').textContent =
      'Whisper Large v3 listo en este navegador.';
    this.el<HTMLElement>('modelProgressPercent').textContent = '100%';
    const progress = this.el<HTMLProgressElement>('modelProgress');
    progress.value = 1;
    this.el<HTMLButtonElement>('prepareModelButton').textContent = 'Modelo preparado';
    this.el<HTMLButtonElement>('prepareModelButton').disabled = true;
  }

  private setModelProgress(progress: WhisperProgress): void {
    if (progress.kind !== 'model') return;
    const panel = this.el<HTMLElement>('modelProgressPanel');
    panel.hidden = false;
    this.el<HTMLElement>('modelProgressMessage').textContent = progress.message;
    const progressElement = this.el<HTMLProgressElement>('modelProgress');
    const percent = this.el<HTMLElement>('modelProgressPercent');
    if (progress.progress === undefined) {
      progressElement.removeAttribute('value');
      percent.textContent = '';
    } else {
      progressElement.value = progress.progress;
      percent.textContent = `${Math.round(progress.progress * 100)}%`;
    }
  }

  private setWhisperProgress(progress: WhisperProgress): void {
    if (progress.kind === 'model') {
      this.setModelProgress(progress);
      return;
    }
    const ratio = progress.total > 0 ? progress.completed / progress.total : 0;
    this.setTranscriptionStatus(
      `Transcribiendo bloque ${progress.completed} de ${progress.total} · ${Math.round(ratio * 100)}%`,
    );
  }

  private baseFilename(): string {
    const input = this.el<HTMLInputElement>('fileBaseName').value;
    return `${sanitizeFilename(input)}-${dateSuffix()}`;
  }

  private extensionFromSource(): string {
    const byName = this.sourceFilename.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (byName) return byName;
    if (this.sourceBlob?.type.includes('mp4')) return 'mp4';
    if (this.sourceBlob?.type.includes('mpeg')) return 'mp3';
    return 'webm';
  }

  private showError(error: unknown, fallback: string): void {
    console.error(error);
    const message = error instanceof Error && error.message ? error.message : fallback;
    this.toast(message, 'error');
  }

  private toast(message: string, type: 'success' | 'error' = 'success'): void {
    const region = this.el<HTMLElement>('toastRegion');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    region.append(toast);
    window.setTimeout(() => toast.remove(), 5_000);
  }

  private el<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`No se encontró el elemento #${id}.`);
    return element as T;
  }
}
