import {
  downloadBlob,
  formatBytes,
  formatClock,
} from './exporters.js?v=native-1';
import {
  extensionForMime,
  supportedVideoMime,
} from './recording-formats.js?v=native-1';
import { ScreenRecorder } from './recorder.js?v=native-1';

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
    'saveAudioSeparately',
    'nativeFormatHint',
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
    'downloadLabel',
    'downloadAudio',
    'audioDownloadLabel',
    'videoFormat',
    'videoExportTitle',
    'videoExportInfo',
    'audioFormat',
    'audioExportInfo',
    'noticeBox',
    'errorBox',
    'exportHint',
    'reviewStep',
    'exportStep',
  ].map((id) => [id, document.getElementById(id)]),
);
const recorder = new ScreenRecorder();
const captureSupported = Boolean(
  navigator.mediaDevices?.getDisplayMedia && globalThis.MediaRecorder,
);
const MEDIA_EXTENSIONS =
  /\.(webm|mp4|m4v|m4a|mp3|wav|ogg|oga|ogv|mov|mkv|aac|flac|opus|avi)$/i;
const AUDIO_EXTENSIONS = /\.(m4a|mp3|wav|oga|aac|flac|opus)$/i;
let selectedFile = null;
let selectedAudioFile = null;
let unsavedRecording = false;
let unsavedAudio = false;
let previewUrl = '';
let timerHandle = null;
let recording = false;
let preparing = false;
let finishing = false;
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
function isAudioFile(file) {
  return Boolean(
    file &&
      (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name)),
  );
}
function fileFormat(file) {
  return (
    file?.name.match(/\.([a-z0-9]+)$/i)?.[1] || extensionForMime(file?.type)
  ).toUpperCase();
}
function updateUi() {
  const locked = recording || preparing || finishing;
  elements.startRecording.disabled = locked || !captureSupported;
  elements.startLabel.textContent = preparing
    ? 'Preparando captura…'
    : finishing
      ? 'Guardando grabación…'
      : recording
        ? 'Grabación en curso'
        : 'Iniciar grabación';
  elements.pauseRecording.disabled = !recording || finishing;
  elements.stopRecording.disabled = !recording || finishing;
  hide(elements.pauseRecording, !recording);
  hide(elements.stopRecording, !recording);
  for (const element of [
    elements.includeMic,
    elements.includeSystemAudio,
    elements.saveAudioSeparately,
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
  elements.downloadOriginal.disabled = !selectedFile || locked;
  elements.downloadAudio.disabled = !selectedAudioFile || locked;
  elements.expandPreview.disabled = !selectedFile && !recording;
  elements.reviewStep.classList.toggle(
    'active',
    Boolean(selectedFile || recording),
  );
  elements.exportStep.classList.toggle(
    'active',
    Boolean(selectedFile && !locked),
  );
  elements.fileDrop.setAttribute('aria-disabled', String(locked));

  const expected = supportedVideoMime(
    elements.includeMic.checked || elements.includeSystemAudio.checked,
  );
  elements.nativeFormatHint.textContent = expected.startsWith('video/mp4')
    ? 'MP4 directo disponible. El formato final depende de los recursos del navegador.'
    : 'Este navegador grabará en su formato nativo, normalmente WebM. MP4 directo no está disponible.';
  const audioOnly = isAudioFile(selectedFile);
  const format = selectedFile ? fileFormat(selectedFile) : 'VIDEO';
  elements.videoFormat.textContent = format;
  elements.videoExportTitle.textContent = audioOnly
    ? 'Tu archivo de audio'
    : 'Tu video';
  elements.videoExportInfo.textContent = selectedFile
    ? `${formatBytes(selectedFile.size)} · Conserva el formato y la calidad originales`
    : 'Detén la grabación o carga un archivo para descargarlo.';
  elements.downloadLabel.textContent = selectedFile
    ? `Descargar ${format}`
    : 'Descargar video';
  const audioFormat = selectedAudioFile
    ? fileFormat(selectedAudioFile)
    : 'AUDIO';
  elements.audioFormat.textContent = audioFormat;
  elements.audioDownloadLabel.textContent = selectedAudioFile
    ? `Descargar audio ${audioFormat}`
    : 'Descargar audio';
  elements.audioExportInfo.textContent = selectedAudioFile
    ? `${formatBytes(selectedAudioFile.size)} · Grabado por separado, listo para descargar`
    : audioOnly
      ? 'Usa la descarga del archivo de audio a la izquierda.'
      : 'Activa «Guardar audio aparte» antes de grabar. No se convierte a MP3.';
  elements.exportHint.textContent = selectedFile
    ? 'Tu archivo está listo. La descarga conserva sus bytes, sin conversiones ni cargas adicionales.'
    : 'MP4 cuando tu navegador lo permita; WebM como alternativa. Los archivos se crean mientras grabas.';
}
function setMode(mode) {
  if (recording || preparing || finishing) return;
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
function revokePreview() {
  for (const media of [elements.videoPreview, elements.audioPreview]) {
    media.onloadedmetadata = null;
    media.onerror = null;
    media.pause();
    media.removeAttribute('src');
  }
  elements.videoPreview.srcObject = null;
  elements.videoPreview.load();
  elements.audioPreview.load();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
}
function setSelectedFile(
  file,
  {
    durationMs = null,
    fromRecording = false,
    audioFile = null,
    audioNeedsSaving = fromRecording,
  } = {},
) {
  revokePreview();
  selectedFile = file;
  selectedAudioFile = audioFile;
  unsavedRecording = Boolean(file && fromRecording);
  unsavedAudio = Boolean(audioFile && audioNeedsSaving);
  clearError();
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
  const audioOnly = isAudioFile(file);
  elements.sourceName.textContent = file.name;
  elements.sourceSize.textContent = `${formatBytes(file.size)} · ${audioOnly ? 'Audio' : 'Video'} ${fileFormat(file)}`;
  previewUrl = URL.createObjectURL(file);
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
  elements.captureMeta.textContent = `${audioOnly ? 'Audio' : 'Video'} ${fileFormat(file)} · ${formatBytes(file.size)}`;
  elements.recordingTimer.textContent =
    durationMs != null ? formatClock(durationMs) : '00:00:00';
  badge(elements.recordingStatus, 'success', 'Listo para descargar');
  media.onloadedmetadata = () => {
    if (selectedFile === file && Number.isFinite(media.duration))
      elements.recordingTimer.textContent = formatClock(media.duration * 1000);
  };
  media.onerror = () => {
    if (selectedFile === file)
      addNotice(
        'El navegador no puede previsualizar este formato. Puedes descargar el archivo original.',
      );
  };
  updateUi();
}
function acceptFile(file) {
  if (recording || preparing || finishing || !file) return;
  clearError();
  clearNotices();
  if (!file.size) return showError('El archivo está vacío. Selecciona otro.');
  if (
    !file.type.startsWith('video/') &&
    !file.type.startsWith('audio/') &&
    !MEDIA_EXTENSIONS.test(file.name)
  )
    return showError(
      'Selecciona un archivo de video o audio, como MP4, WebM, MOV, MP3 o WAV.',
    );
  setMode('upload');
  setSelectedFile(file);
  addNotice(
    'Los archivos cargados conservan su formato. Esta versión no convierte WebM a MP4 ni extrae MP3.',
  );
}
function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}
async function beginRecording() {
  if (recording || preparing || finishing) return;
  clearError();
  clearNotices();
  preparing = true;
  updateUi();
  try {
    const session = await recorder.start({
      includeMicrophone: elements.includeMic.checked,
      includeSystemAudio: elements.includeSystemAudio.checked,
      saveAudioSeparately: elements.saveAudioSeparately.checked,
      surface: document.querySelector('input[name="surface"]:checked').value,
      quality: elements.quality.value,
      frameRate: Number(elements.frameRate.value),
    });
    preparing = false;
    recording = true;
    revokePreview();
    hide(elements.sourceInfo);
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
    const format = extensionForMime(session.mimeType).toUpperCase();
    elements.captureMeta.textContent = `${surface} · ${
      session.stabilized
        ? `${session.dimensions.width} × ${session.dimensions.height}`
        : 'Captura directa'
    } · ${format}`;
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
      .then(({ blob, extension, durationMs, hasAudio, audio }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        recording = false;
        finishing = false;
        setSelectedFile(
          new File([blob], `screencribe-${timestamp}.${extension}`, {
            type: blob.type,
          }),
          {
            durationMs,
            fromRecording: true,
            audioFile: audio
              ? new File(
                  [audio.blob],
                  `screencribe-${timestamp}-audio.${audio.extension}`,
                  { type: audio.blob.type },
                )
              : null,
          },
        );
        if (!hasAudio)
          addNotice(
            'Esta grabación no tiene pista de audio. El video está listo para descargar.',
          );
      })
      .catch((error) => {
        recording = false;
        finishing = false;
        // A previous completed recording remains available if this capture failed.
        setSelectedFile(selectedFile, {
          fromRecording: unsavedRecording,
          audioFile: selectedAudioFile,
          audioNeedsSaving: unsavedAudio,
        });
        showError(error.message || 'No se pudo completar la grabación.');
      })
      .finally(() => {
        recording = false;
        finishing = false;
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
  if (finishing) return;
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
  finishing = true;
  badge(elements.recordingStatus, 'neutral', 'Guardando…');
  updateUi();
  recorder.stop();
});
elements.fileInput.addEventListener('change', () => {
  acceptFile(elements.fileInput.files?.[0]);
  elements.fileInput.value = '';
});
for (const name of ['dragenter', 'dragover'])
  elements.fileDrop.addEventListener(name, (event) => {
    event.preventDefault();
    if (!recording && !preparing && !finishing)
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
for (const name of ['dragover', 'drop'])
  window.addEventListener(name, (event) => {
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
elements.downloadAudio.addEventListener('click', () => {
  if (selectedAudioFile) {
    downloadBlob(selectedAudioFile.name, selectedAudioFile);
    unsavedAudio = false;
  }
});
for (const checkbox of [elements.includeMic, elements.includeSystemAudio])
  checkbox.addEventListener('change', updateUi);
elements.expandPreview.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await elements.previewStage.requestFullscreen();
  } catch {
    addNotice('Este navegador no permite ampliar la vista previa.');
  }
});
recorder.addEventListener('warning', (event) => addNotice(event.detail));
window.addEventListener('beforeunload', (event) => {
  if (recording || preparing || finishing || unsavedRecording || unsavedAudio) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  if (recorder.state !== 'inactive') recorder.stop();
  stopTimer();
  revokePreview();
  selectedFile = null;
  selectedAudioFile = null;
});
if (!captureSupported) {
  setMode('upload');
  addNotice(
    'Para capturar pantalla, usa un navegador compatible en computador mediante HTTPS. Puedes previsualizar archivos y descargarlos en su formato original.',
  );
}
elements.uploadLimit.textContent =
  'Sin tope fijo de tamaño. Sujeto a memoria disponible.';
badge(elements.converterBadge, 'success', 'Grabación nativa · Gratis');
updateUi();
