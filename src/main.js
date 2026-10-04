import { LocalConverter } from './local-converter.js';
import { downloadBlob, formatBytes, formatClock } from './exporters.js';
import { ScreenRecorder } from './recorder.js';

const $ = (id) => document.getElementById(id);
const elements = Object.fromEntries(
  [
    'converterBadge',
    'themeToggle',
    'recordTab',
    'uploadTab',
    'recordPanel',
    'uploadPanel',
    'quality',
    'frameRate',
    'includeMic',
    'includeSystemAudio',
    'startRecording',
    'startLabel',
    'pauseRecording',
    'stopRecording',
    'recordingTimer',
    'recordingStatus',
    'timerDot',
    'captureMeta',
    'fileInput',
    'fileDrop',
    'uploadLimit',
    'sourceInfo',
    'sourceName',
    'sourceSize',
    'clearSource',
    'previewPlaceholder',
    'previewTitle',
    'videoPreview',
    'audioPreview',
    'audioStage',
    'previewStage',
    'pausedOverlay',
    'expandPreview',
    'downloadOriginal',
    'wantMp4',
    'wantMp3',
    'processFile',
    'processLabel',
    'cancelJob',
    'progressBox',
    'progressTitle',
    'progressPercent',
    'progressBar',
    'progressMessage',
    'noticeBox',
    'errorBox',
    'resultsSection',
    'downloadGrid',
    'resultWarnings',
    'deleteResults',
    'privacyText',
    'exportHint',
    'reviewStep',
    'exportStep',
  ].map((id) => [id, $(id)]),
);
const recorder = new ScreenRecorder();
const converter = new LocalConverter();
const MEDIA_EXTENSIONS =
  /\.(webm|mp4|m4v|m4a|mp3|wav|ogg|oga|ogv|mov|mkv|aac|flac|opus|avi)$/i;
const AUDIO_EXTENSIONS = /\.(m4a|mp3|wav|oga|aac|flac|opus)$/i;
let selectedFile = null;
let unsavedRecording = false;
let sourceHasAudio = null;
let previewUrl = '';
let timerHandle = null;
let recording = false;
let preparing = false;
let converting = false;
let conversionController = null;
let resultJob = null;
let resultUrls = [];
let sourceDurationSeconds = 0;
const undownloadedResults = new Set();
let notices = [];

function hide(element, value = true) {
  element.classList.toggle('hidden', value);
}
function showError(message) {
  elements.errorBox.textContent = message;
  hide(elements.errorBox, false);
  elements.errorBox.focus({ preventScroll: true });
}
function clearError() {
  elements.errorBox.textContent = '';
  hide(elements.errorBox);
}
function addNotice(message) {
  if (!message || notices.includes(message)) return;
  notices.push(message);
  elements.noticeBox.textContent = notices.join(' ');
  hide(elements.noticeBox, false);
}
function clearNotices() {
  notices = [];
  elements.noticeBox.textContent = '';
  hide(elements.noticeBox);
}
function badge(element, state, label) {
  element.className = `badge badge-${state}`;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  element.replaceChildren(dot, document.createTextNode(label));
}

function updateUi() {
  const locked = recording || preparing || converting;
  elements.startRecording.disabled = locked;
  elements.startLabel.textContent = preparing
    ? 'Preparando captura…'
    : recording
      ? 'Grabación en curso'
      : converting
        ? 'Conversión en curso'
        : 'Iniciar grabación';
  elements.pauseRecording.disabled = !recording;
  elements.stopRecording.disabled = !recording;
  hide(elements.pauseRecording, !recording);
  hide(elements.stopRecording, !recording);
  for (const element of [
    elements.includeMic,
    elements.includeSystemAudio,
    elements.quality,
    elements.frameRate,
    elements.fileInput,
    elements.clearSource,
    elements.recordTab,
    elements.uploadTab,
  ])
    element.disabled = locked;
  for (const input of document.querySelectorAll('input[name="surface"]'))
    input.disabled = locked;
  elements.wantMp4.disabled =
    locked || !selectedFile || isAudioFile(selectedFile);
  elements.wantMp3.disabled =
    locked || !selectedFile || sourceHasAudio === false;
  const hasOutput =
    (elements.wantMp4.checked && !elements.wantMp4.disabled) ||
    (elements.wantMp3.checked && !elements.wantMp3.disabled);
  elements.processFile.disabled =
    locked || !selectedFile || !hasOutput || !converter.supported;
  elements.processLabel.textContent = converting
    ? 'Convirtiendo…'
    : 'Convertir en mi equipo';
  elements.downloadOriginal.disabled = !selectedFile || recording || preparing;
  elements.expandPreview.disabled = !selectedFile && !recording;
  elements.reviewStep.classList.toggle(
    'active',
    Boolean(selectedFile || recording),
  );
  elements.exportStep.classList.toggle('active', Boolean(resultJob));
  elements.fileDrop.setAttribute('aria-disabled', String(locked));
}
function setMode(mode) {
  if (recording || preparing || converting) return;
  const isRecord = mode === 'record';
  for (const [tab, active] of [
    [elements.recordTab, isRecord],
    [elements.uploadTab, !isRecord],
  ]) {
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  hide(elements.recordPanel, !isRecord);
  hide(elements.uploadPanel, isRecord);
}
function isAudioFile(file) {
  return (
    file && (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name))
  );
}
function revokePreview() {
  elements.videoPreview.onloadedmetadata = null;
  elements.audioPreview.onloadedmetadata = null;
  elements.videoPreview.onerror = null;
  elements.audioPreview.onerror = null;
  elements.videoPreview.pause();
  elements.audioPreview.pause();
  elements.videoPreview.srcObject = null;
  elements.videoPreview.removeAttribute('src');
  elements.audioPreview.removeAttribute('src');
  elements.videoPreview.load();
  elements.audioPreview.load();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
}
function resetResults() {
  resultUrls.forEach((url) => URL.revokeObjectURL(url));
  resultUrls = [];
  undownloadedResults.clear();
  hide(elements.resultsSection);
  elements.downloadGrid.replaceChildren();
  resultJob = null;
}
function setSelectedFile(
  file,
  { durationMs = null, hasAudio = null, fromRecording = false } = {},
) {
  revokePreview();
  selectedFile = file;
  sourceHasAudio = hasAudio;
  sourceDurationSeconds = Math.max(0, Number(durationMs) || 0) / 1000;
  unsavedRecording = Boolean(file && fromRecording);
  clearError();
  resetResults();
  hide(elements.progressBox);
  hide(elements.sourceInfo, !file);
  hide(elements.pausedOverlay);
  if (!file) {
    elements.fileInput.value = '';
    elements.sourceName.textContent = '';
    elements.sourceSize.textContent = '';
    hide(elements.previewPlaceholder, false);
    hide(elements.videoPreview);
    hide(elements.audioStage);
    elements.previewTitle.textContent = 'Un espacio para tus ideas';
    elements.captureMeta.textContent = 'Sin archivo todavía';
    elements.recordingTimer.textContent = '00:00:00';
    badge(elements.recordingStatus, 'neutral', 'En espera');
    updateUi();
    return;
  }
  elements.sourceName.textContent = file.name;
  elements.sourceSize.textContent = `${formatBytes(file.size)} · ${isAudioFile(file) ? 'Audio' : 'Video'}`;
  previewUrl = URL.createObjectURL(file);
  const audioOnly = isAudioFile(file);
  if (audioOnly) {
    elements.wantMp4.checked = false;
    elements.wantMp3.checked = true;
  } else {
    elements.wantMp4.checked = true;
    elements.wantMp3.checked = hasAudio !== false;
  }
  if (hasAudio === false)
    addNotice(
      'Esta grabación no tiene pista de audio. Puedes descargar el video original o convertirlo a MP4.',
    );
  hide(elements.previewPlaceholder);
  hide(elements.videoPreview, audioOnly);
  hide(elements.audioStage, !audioOnly);
  const media = audioOnly ? elements.audioPreview : elements.videoPreview;
  if (!audioOnly) {
    media.controls = true;
    media.muted = false;
  }
  media.src = previewUrl;
  elements.previewTitle.textContent = 'Revisa antes de compartir';
  elements.captureMeta.textContent = `${audioOnly ? 'Audio' : 'Video'} · ${formatBytes(file.size)}`;
  elements.recordingTimer.textContent =
    durationMs != null ? formatClock(durationMs) : '00:00:00';
  badge(elements.recordingStatus, 'success', 'Listo');
  media.onloadedmetadata = () => {
    if (selectedFile !== file) return;
    if (Number.isFinite(media.duration)) {
      sourceDurationSeconds = media.duration;
      elements.recordingTimer.textContent = formatClock(media.duration * 1000);
    }
  };
  media.onerror = () => {
    if (selectedFile === file)
      addNotice(
        'El navegador no puede previsualizar este formato. Puedes descargar el original o intentar convertirlo.',
      );
  };
  updateUi();
}
function acceptFile(file) {
  if (recording || preparing || converting || !file) return;
  clearError();
  clearNotices();
  if (!file.size) {
    showError('El archivo está vacío. Selecciona otro.');
    return;
  }
  if (
    !file.type.startsWith('video/') &&
    !file.type.startsWith('audio/') &&
    !MEDIA_EXTENSIONS.test(file.name)
  ) {
    showError(
      'Selecciona un archivo de video o audio, como MP4, WebM, MOV, MP3 o WAV.',
    );
    return;
  }
  setMode('upload');
  setSelectedFile(file);
}
function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}
async function beginRecording() {
  if (recording || preparing || converting) return;
  clearError();
  clearNotices();
  preparing = true;
  updateUi();
  try {
    const session = await recorder.start({
      includeMicrophone: elements.includeMic.checked,
      includeSystemAudio: elements.includeSystemAudio.checked,
      surface: document.querySelector('input[name="surface"]:checked').value,
      quality: elements.quality.value,
      frameRate: Number(elements.frameRate.value),
    });
    preparing = false;
    recording = true;
    revokePreview();
    resetResults();
    hide(elements.sourceInfo);
    hide(elements.progressBox);
    hide(elements.previewPlaceholder);
    hide(elements.audioStage);
    hide(elements.videoPreview, false);
    elements.videoPreview.controls = false;
    elements.videoPreview.muted = true;
    elements.videoPreview.srcObject = session.stream;
    elements.videoPreview
      .play()
      .catch(() =>
        addNotice('La vista previa no pudo reproducirse. La captura continúa.'),
      );
    elements.previewTitle.textContent = 'Tu captura, en directo';
    const surface =
      { browser: 'Pestaña', window: 'Ventana', monitor: 'Pantalla' }[
        session.surface
      ] || 'Captura';
    elements.captureMeta.textContent = `${surface} · ${session.stabilized ? `${session.dimensions.width} × ${session.dimensions.height}` : 'Captura directa'}`;
    badge(elements.recordingStatus, 'recording', 'Grabando');
    elements.timerDot.className = 'timer-dot recording';
    elements.pauseRecording.textContent = 'Pausar';
    elements.recordingTimer.textContent = '00:00:00';
    stopTimer();
    timerHandle = setInterval(() => {
      elements.recordingTimer.textContent = formatClock(recorder.elapsedMs);
    }, 250);
    session.warnings.forEach(addNotice);
    updateUi();
    session.stopped
      .then(({ blob, extension, durationMs, hasAudio }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        recording = false;
        setSelectedFile(
          new File([blob], `screencribe-${timestamp}.${extension}`, {
            type: blob.type,
          }),
          { durationMs, hasAudio, fromRecording: true },
        );
      })
      .catch((error) => {
        recording = false;
        setSelectedFile(selectedFile);
        showError(error.message || 'No se pudo completar la grabación.');
      })
      .finally(() => {
        recording = false;
        stopTimer();
        elements.timerDot.className = 'timer-dot';
        hide(elements.pausedOverlay);
        updateUi();
      });
  } catch (error) {
    preparing = false;
    updateUi();
    showError(
      error.name === 'NotAllowedError'
        ? 'La captura fue cancelada o no tiene permiso. Pulsa Iniciar grabación para volver a intentarlo.'
        : error.message || 'No se pudo iniciar la captura.',
    );
  }
}
function togglePause() {
  const pause = recorder.state === 'recording';
  if (pause) recorder.pause();
  else recorder.resume();
  elements.pauseRecording.textContent = pause ? 'Reanudar' : 'Pausar';
  elements.timerDot.className = `timer-dot ${pause ? 'paused' : 'recording'}`;
  badge(
    elements.recordingStatus,
    pause ? 'warning' : 'recording',
    pause ? 'En pausa' : 'Grabando',
  );
  hide(elements.pausedOverlay, !pause);
}
function updateProgress(value, title, message) {
  hide(elements.progressBox, false);
  if (value == null) {
    elements.progressBar.removeAttribute('value');
    elements.progressPercent.textContent = 'En curso';
  } else {
    const progress = Math.max(0, Math.min(100, Number(value) || 0));
    elements.progressBar.value = progress;
    elements.progressPercent.textContent = `${Math.round(progress)}%`;
  }
  elements.progressTitle.textContent = title;
  elements.progressMessage.textContent = message;
}
async function processSelectedFile() {
  if (!selectedFile || converting || recording || preparing) return;
  const options = {
    createMp4: elements.wantMp4.checked && !elements.wantMp4.disabled,
    createMp3: elements.wantMp3.checked && !elements.wantMp3.disabled,
  };
  if (!options.createMp4 && !options.createMp3) return;
  clearError();
  resetResults();
  converting = true;
  conversionController = new AbortController();
  const controller = conversionController;
  hide(elements.cancelJob, false);
  badge(elements.converterBadge, 'neutral', 'Convirtiendo en tu equipo');
  updateUi();
  try {
    const result = await converter.convert(selectedFile, options, {
      signal: controller.signal,
      durationSeconds: sourceDurationSeconds,
      onProgress: ({ percent, title, message }) =>
        updateProgress(percent, title, message),
    });
    renderResults(result);
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError')
      updateProgress(
        0,
        'Conversión cancelada',
        'Tu archivo original sigue disponible.',
      );
    else {
      updateProgress(
        0,
        'No se completó la conversión',
        'Tu archivo original sigue disponible. Puedes volver a intentarlo.',
      );
      showError(error.message || 'No se pudo convertir el archivo.');
    }
  } finally {
    converting = false;
    conversionController = null;
    badge(elements.converterBadge, 'success', 'Conversión local · Gratis');
    hide(elements.cancelJob);
    updateUi();
  }
}
function icon(symbol, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symbol}`);
  svg.append(use);
  return svg;
}
function renderResults(job) {
  resultJob = job;
  elements.downloadGrid.replaceChildren();
  for (const artifact of job.artifacts || []) {
    if (!['mp4', 'mp3'].includes(artifact.name)) continue;
    const card = document.createElement('article');
    card.className = 'download-card';
    const type = document.createElement('span');
    type.className = `format-icon ${artifact.name === 'mp3' ? 'audio' : ''}`;
    type.textContent = artifact.name.toUpperCase();
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent =
      artifact.name === 'mp4' ? 'Tu video en MP4' : 'Tu audio en MP3';
    const size = document.createElement('small');
    size.textContent = `${formatBytes(artifact.size)} · Listo para descargar`;
    copy.append(title, size);
    const link = document.createElement('a');
    link.className = 'button button-primary button-small';
    link.href = URL.createObjectURL(artifact.blob);
    resultUrls.push(link.href);
    undownloadedResults.add(artifact.name);
    link.addEventListener('click', () =>
      undownloadedResults.delete(artifact.name),
    );
    link.setAttribute('download', artifact.filename);
    link.setAttribute('aria-label', `Descargar ${artifact.name.toUpperCase()}`);
    link.append(icon('i-download'), document.createTextNode('Descargar'));
    card.append(type, copy, link);
    elements.downloadGrid.append(card);
  }
  elements.resultWarnings.textContent = (job.warnings || []).join(' ');
  hide(elements.resultWarnings, !job.warnings?.length);
  hide(elements.resultsSection, false);
  elements.resultsSection.focus({ preventScroll: true });
  elements.resultsSection.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
    block: 'nearest',
  });
  updateUi();
}
function cancelConversion() {
  conversionController?.abort();
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute(
    'aria-label',
    `Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}`,
  );
}
let theme;
try {
  theme = localStorage.getItem('screencribe.theme');
} catch {
  /* Use system preference. */
}
applyTheme(
  theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
);
elements.themeToggle.addEventListener('click', () => {
  const theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try {
    localStorage.setItem('screencribe.theme', theme);
  } catch {
    /* Session only. */
  }
});
elements.recordTab.addEventListener('click', () => setMode('record'));
elements.uploadTab.addEventListener('click', () => setMode('upload'));
for (const tab of [elements.recordTab, elements.uploadTab])
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === 'Home'
        ? elements.recordTab
        : event.key === 'End'
          ? elements.uploadTab
          : tab === elements.recordTab
            ? elements.uploadTab
            : elements.recordTab;
    setMode(target === elements.recordTab ? 'record' : 'upload');
    target.focus();
  });
elements.startRecording.addEventListener('click', beginRecording);
elements.pauseRecording.addEventListener('click', togglePause);
elements.stopRecording.addEventListener('click', () => {
  elements.stopRecording.disabled = true;
  elements.pauseRecording.disabled = true;
  recorder.stop();
});
elements.fileInput.addEventListener('change', () => {
  acceptFile(elements.fileInput.files?.[0]);
  elements.fileInput.value = '';
});
for (const name of ['dragenter', 'dragover'])
  elements.fileDrop.addEventListener(name, (event) => {
    event.preventDefault();
    if (!recording && !preparing && !converting)
      elements.fileDrop.classList.add('dragging');
  });
elements.fileDrop.addEventListener('dragleave', () =>
  elements.fileDrop.classList.remove('dragging'),
);
elements.fileDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  elements.fileDrop.classList.remove('dragging');
  acceptFile(event.dataTransfer.files?.[0]);
});
window.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
elements.clearSource.addEventListener('click', () => {
  clearNotices();
  setSelectedFile(null);
});
elements.downloadOriginal.addEventListener('click', () => {
  if (selectedFile) {
    downloadBlob(selectedFile.name, selectedFile);
    unsavedRecording = false;
  }
});
elements.expandPreview.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await elements.previewStage.requestFullscreen();
  } catch {
    addNotice('Este navegador no permite ampliar la vista previa.');
  }
});
elements.processFile.addEventListener('click', processSelectedFile);
elements.cancelJob.addEventListener('click', cancelConversion);
for (const checkbox of [elements.wantMp4, elements.wantMp3])
  checkbox.addEventListener('change', updateUi);
elements.deleteResults.addEventListener('click', () => {
  resetResults();
  hide(elements.progressBox);
  addNotice(
    'Se liberaron los resultados de esta página. Tu archivo original sigue disponible.',
  );
  updateUi();
});
recorder.addEventListener('warning', (event) => addNotice(event.detail));
window.addEventListener('beforeunload', (event) => {
  if (
    recording ||
    preparing ||
    converting ||
    unsavedRecording ||
    undownloadedResults.size
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  if (recorder.state !== 'inactive') recorder.stop();
  revokePreview();
  resetResults();
  converter.dispose();
});
if (
  !navigator.mediaDevices?.getDisplayMedia ||
  typeof MediaRecorder === 'undefined'
) {
  setMode('upload');
  addNotice(
    'Este navegador permite cargar y convertir archivos. Para capturar pantalla, usa Chrome o Edge en computador mediante HTTPS.',
  );
}
elements.uploadLimit.textContent =
  'Sin tope fijo de tamaño. Sujeto a memoria disponible.';
badge(
  elements.converterBadge,
  converter.supported ? 'success' : 'warning',
  converter.supported
    ? 'Conversión local · Gratis'
    : 'Conversión no compatible',
);
if (!converter.supported)
  addNotice(
    'Este navegador permite descargar el original, pero no admite la conversión local. Usa una versión actual de Chrome, Edge o Firefox.',
  );
updateUi();
