import {
  artifactUrl,
  createJob,
  deleteJob,
  getApiBaseUrl,
  getJob,
  healthCheck,
  saveApiBaseUrl,
} from './api.js';
import {
  downloadBlob,
  downloadText,
  formatBytes,
  formatClock,
  safeBaseName,
  segmentsToSrt,
  segmentsToVtt,
} from './exporters.js';
import { ScreenRecorder } from './recorder.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  apiBadge: $('#apiBadge'),
  openSettings: $('#openSettings'),
  settingsDialog: $('#settingsDialog'),
  apiUrl: $('#apiUrl'),
  testApi: $('#testApi'),
  saveSettings: $('#saveSettings'),
  settingsStatus: $('#settingsStatus'),
  includeMic: $('#includeMic'),
  includeSystemAudio: $('#includeSystemAudio'),
  startRecording: $('#startRecording'),
  pauseRecording: $('#pauseRecording'),
  stopRecording: $('#stopRecording'),
  recordingTimer: $('#recordingTimer'),
  fileInput: $('#fileInput'),
  sourceInfo: $('#sourceInfo'),
  sourceName: $('#sourceName'),
  sourceSize: $('#sourceSize'),
  clearSource: $('#clearSource'),
  previewPlaceholder: $('#previewPlaceholder'),
  videoPreview: $('#videoPreview'),
  audioPreview: $('#audioPreview'),
  downloadOriginal: $('#downloadOriginal'),
  wantTranscript: $('#wantTranscript'),
  wantMp4: $('#wantMp4'),
  wantMp3: $('#wantMp3'),
  language: $('#language'),
  prompt: $('#prompt'),
  processFile: $('#processFile'),
  cancelJob: $('#cancelJob'),
  progressBox: $('#progressBox'),
  progressTitle: $('#progressTitle'),
  progressPercent: $('#progressPercent'),
  progressBar: $('#progressBar'),
  progressMessage: $('#progressMessage'),
  errorBox: $('#errorBox'),
  resultsSection: $('#resultsSection'),
  downloadGrid: $('#downloadGrid'),
  transcriptPanel: $('#transcriptPanel'),
  transcriptEditor: $('#transcriptEditor'),
  detectedLanguage: $('#detectedLanguage'),
  exportTxt: $('#exportTxt'),
  exportSrt: $('#exportSrt'),
  exportVtt: $('#exportVtt'),
  exportJson: $('#exportJson'),
};

const recorder = new ScreenRecorder();

function timeoutSignal(milliseconds) {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}
let selectedFile = null;
let previewUrl = '';
let timerHandle = null;
let pollingController = null;
let currentJobId = '';
let transcriptData = null;

function showError(message) {
  elements.errorBox.textContent = message;
  elements.errorBox.classList.remove('hidden');
}

function clearError() {
  elements.errorBox.textContent = '';
  elements.errorBox.classList.add('hidden');
}

function setApiBadge(state, text) {
  elements.apiBadge.className = `badge badge-${state}`;
  elements.apiBadge.textContent = text;
}

async function refreshApiStatus() {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    setApiBadge('neutral', 'Servidor sin configurar');
    updateProcessButton();
    return false;
  }
  setApiBadge('neutral', 'Comprobando servidor…');
  try {
    const response = await healthCheck(baseUrl, timeoutSignal(90_000));
    const model = response.model ? ` · ${response.model}` : '';
    setApiBadge('success', `Servidor disponible${model}`);
    updateProcessButton();
    return true;
  } catch {
    setApiBadge('warning', 'Servidor no disponible');
    updateProcessButton();
    return false;
  }
}

function updateProcessButton() {
  const anyOutput = elements.wantTranscript.checked || elements.wantMp4.checked || elements.wantMp3.checked;
  elements.processFile.disabled = !selectedFile || !getApiBaseUrl() || !anyOutput || Boolean(currentJobId);
}

function revokePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
  elements.videoPreview.pause();
  elements.audioPreview.pause();
  elements.videoPreview.removeAttribute('src');
  elements.audioPreview.removeAttribute('src');
}

function setSelectedFile(file) {
  revokePreview();
  selectedFile = file;
  clearError();
  elements.resultsSection.classList.add('hidden');
  elements.sourceInfo.classList.toggle('hidden', !file);
  elements.downloadOriginal.disabled = !file;

  if (!file) {
    elements.sourceName.textContent = '';
    elements.sourceSize.textContent = '';
    elements.previewPlaceholder.classList.remove('hidden');
    elements.videoPreview.classList.add('hidden');
    elements.audioPreview.classList.add('hidden');
    elements.fileInput.value = '';
    updateProcessButton();
    return;
  }

  elements.sourceName.textContent = file.name;
  elements.sourceSize.textContent = formatBytes(file.size);
  previewUrl = URL.createObjectURL(file);
  const isAudioOnly = file.type.startsWith('audio/');
  elements.previewPlaceholder.classList.add('hidden');
  elements.videoPreview.classList.toggle('hidden', isAudioOnly);
  elements.audioPreview.classList.toggle('hidden', !isAudioOnly);
  if (isAudioOnly) elements.audioPreview.src = previewUrl;
  else elements.videoPreview.src = previewUrl;
  updateProcessButton();
}

function setRecordingUi(isRecording) {
  elements.startRecording.disabled = isRecording;
  elements.pauseRecording.disabled = !isRecording;
  elements.stopRecording.disabled = !isRecording;
  elements.fileInput.disabled = isRecording;
  elements.clearSource.disabled = isRecording;
  elements.includeMic.disabled = isRecording;
  elements.includeSystemAudio.disabled = isRecording;
}

function startTimer() {
  stopTimer();
  elements.recordingTimer.textContent = '00:00:00';
  timerHandle = window.setInterval(() => {
    elements.recordingTimer.textContent = formatClock(recorder.elapsedMs);
  }, 250);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

async function beginRecording() {
  clearError();
  try {
    const session = await recorder.start({
      includeMicrophone: elements.includeMic.checked,
      includeSystemAudio: elements.includeSystemAudio.checked,
    });
    setRecordingUi(true);
    startTimer();
    elements.pauseRecording.textContent = 'Pausar';

    session.stopped
      .then(({ blob, extension }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `screencribe-${timestamp}.${extension}`, { type: blob.type });
        setSelectedFile(file);
      })
      .catch((error) => showError(error.message || 'La grabación no pudo completarse.'))
      .finally(() => {
        stopTimer();
        setRecordingUi(false);
        elements.pauseRecording.textContent = 'Pausar';
      });
  } catch (error) {
    setRecordingUi(false);
    showError(error.name === 'NotAllowedError'
      ? 'La captura fue cancelada o bloqueada por los permisos del navegador.'
      : error.message || 'No se pudo iniciar la grabación.');
  }
}

function togglePause() {
  if (recorder.state === 'recording') {
    recorder.pause();
    elements.pauseRecording.textContent = 'Reanudar';
  } else if (recorder.state === 'paused') {
    recorder.resume();
    elements.pauseRecording.textContent = 'Pausar';
  }
}

function updateProgress(value, title, message) {
  const bounded = Math.max(0, Math.min(100, Number(value) || 0));
  elements.progressBox.classList.remove('hidden');
  elements.progressBar.value = bounded;
  elements.progressPercent.textContent = `${Math.round(bounded)}%`;
  elements.progressTitle.textContent = title;
  elements.progressMessage.textContent = message;
}

async function pollJob(baseUrl, jobId) {
  pollingController = new AbortController();
  elements.cancelJob.classList.remove('hidden');

  while (!pollingController.signal.aborted) {
    const job = await getJob(baseUrl, jobId, pollingController.signal);
    updateProgress(job.progress, job.status_label || 'Procesando', job.message || 'Trabajando…');

    if (job.status === 'completed') {
      renderResults(baseUrl, job);
      return;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'El servidor no pudo procesar el archivo.');
    }
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 1800);
      pollingController.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Cancelado', 'AbortError'));
      }, { once: true });
    });
  }
}

async function processSelectedFile() {
  if (!selectedFile) return;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    elements.settingsDialog.showModal();
    return;
  }

  clearError();
  elements.resultsSection.classList.add('hidden');
  currentJobId = 'uploading';
  updateProcessButton();
  updateProgress(0, 'Subiendo archivo', 'Enviando la grabación al servidor seguro…');

  try {
    const created = await createJob(
      baseUrl,
      selectedFile,
      {
        language: elements.language.value,
        initialPrompt: elements.prompt.value.trim(),
        createTranscript: elements.wantTranscript.checked,
        createMp4: elements.wantMp4.checked,
        createMp3: elements.wantMp3.checked,
      },
      (percent) => updateProgress(Math.min(20, percent * 0.2), 'Subiendo archivo', `${percent}% enviado`),
    );

    currentJobId = created.id;
    await pollJob(baseUrl, currentJobId);
  } catch (error) {
    if (error.name !== 'AbortError') showError(error.message || 'No se pudo procesar el archivo.');
  } finally {
    pollingController = null;
    currentJobId = '';
    elements.cancelJob.classList.add('hidden');
    updateProcessButton();
  }
}

function renderResults(baseUrl, job) {
  elements.resultsSection.classList.remove('hidden');
  elements.downloadGrid.replaceChildren();
  elements.detectedLanguage.textContent = job.language ? `Idioma: ${job.language}` : '';
  elements.detectedLanguage.classList.toggle('hidden', !job.language);

  const labels = {
    mp4: ['Video MP4', 'Compatible con reproductores y plataformas comunes.'],
    mp3: ['Audio MP3', 'Solo la pista de audio.'],
    transcript_txt: ['Transcripción TXT', 'Texto simple generado por Whisper.'],
    transcript_srt: ['Subtítulos SRT', 'Subtítulos con marcas de tiempo.'],
    transcript_vtt: ['Subtítulos VTT', 'Formato de subtítulos para la web.'],
  };

  for (const artifact of job.artifacts || []) {
    const [title, description] = labels[artifact.name] || [artifact.name, 'Archivo generado.'];
    const card = document.createElement('article');
    card.className = 'download-card';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const text = document.createElement('span');
    text.textContent = description;
    const link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = artifactUrl(baseUrl, job.id, artifact.name);
    link.textContent = 'Descargar';
    card.append(heading, text, link);
    elements.downloadGrid.append(card);
  }

  transcriptData = job.transcript || null;
  const hasTranscript = transcriptData?.text != null;
  elements.transcriptPanel.classList.toggle('hidden', !hasTranscript);
  if (hasTranscript) elements.transcriptEditor.value = transcriptData.text;
  elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportTranscript(format) {
  if (!transcriptData || !selectedFile) return;
  const base = safeBaseName(selectedFile.name);
  const editedText = elements.transcriptEditor.value.trim();
  if (format === 'txt') downloadText(`${base}.txt`, `${editedText}\n`);
  if (format === 'srt') downloadText(`${base}.srt`, segmentsToSrt(transcriptData.segments || []));
  if (format === 'vtt') downloadText(`${base}.vtt`, segmentsToVtt(transcriptData.segments || []), 'text/vtt;charset=utf-8');
  if (format === 'json') {
    downloadText(
      `${base}.json`,
      JSON.stringify({ ...transcriptData, text: editedText }, null, 2),
      'application/json;charset=utf-8',
    );
  }
}

async function testSettingsConnection() {
  const url = elements.apiUrl.value.trim();
  if (!url) {
    elements.settingsStatus.textContent = 'Ingresa una URL.';
    return;
  }
  elements.settingsStatus.textContent = 'Probando conexión…';
  try {
    const response = await healthCheck(url, timeoutSignal(90_000));
    elements.settingsStatus.textContent = `Conexión correcta. Modelo: ${response.model || 'configurado'}.`;
  } catch (error) {
    elements.settingsStatus.textContent = `No se pudo conectar: ${error.message}`;
  }
}

elements.openSettings.addEventListener('click', () => {
  elements.apiUrl.value = getApiBaseUrl();
  elements.settingsStatus.textContent = '';
  elements.settingsDialog.showModal();
});
elements.testApi.addEventListener('click', testSettingsConnection);
elements.saveSettings.addEventListener('click', (event) => {
  event.preventDefault();
  saveApiBaseUrl(elements.apiUrl.value);
  elements.settingsDialog.close();
  refreshApiStatus();
});
elements.startRecording.addEventListener('click', beginRecording);
elements.pauseRecording.addEventListener('click', togglePause);
elements.stopRecording.addEventListener('click', () => recorder.stop());
elements.fileInput.addEventListener('change', () => setSelectedFile(elements.fileInput.files?.[0] ?? null));
elements.clearSource.addEventListener('click', () => setSelectedFile(null));
elements.downloadOriginal.addEventListener('click', () => {
  if (selectedFile) downloadBlob(selectedFile.name, selectedFile);
});
elements.processFile.addEventListener('click', processSelectedFile);
elements.cancelJob.addEventListener('click', () => {
  pollingController?.abort();
  const baseUrl = getApiBaseUrl();
  if (baseUrl && currentJobId && currentJobId !== 'uploading') deleteJob(baseUrl, currentJobId);
});
for (const checkbox of [elements.wantTranscript, elements.wantMp4, elements.wantMp3]) {
  checkbox.addEventListener('change', updateProcessButton);
}
elements.exportTxt.addEventListener('click', () => exportTranscript('txt'));
elements.exportSrt.addEventListener('click', () => exportTranscript('srt'));
elements.exportVtt.addEventListener('click', () => exportTranscript('vtt'));
elements.exportJson.addEventListener('click', () => exportTranscript('json'));
window.addEventListener('beforeunload', () => revokePreview());

refreshApiStatus();
