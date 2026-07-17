const STORAGE_KEY = 'screencribe.apiBaseUrl';

export function normalizeApiUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

export function getApiBaseUrl() {
  return normalizeApiUrl(localStorage.getItem(STORAGE_KEY) ?? '');
}

export function saveApiBaseUrl(value) {
  const normalized = normalizeApiUrl(value);
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
  return normalized;
}

async function parseError(response) {
  try {
    const payload = await response.json();
    return payload.detail || payload.message || `Error HTTP ${response.status}`;
  } catch {
    return `Error HTTP ${response.status}`;
  }
}

export async function healthCheck(baseUrl, signal) {
  const response = await fetch(`${normalizeApiUrl(baseUrl)}/health`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export function createJob(baseUrl, file, options, onProgress) {
  const url = `${normalizeApiUrl(baseUrl)}/api/jobs`;
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('language', options.language || '');
  form.append('initial_prompt', options.initialPrompt || '');
  form.append('create_transcript', String(options.createTranscript));
  form.append('create_mp4', String(options.createMp4));
  form.append('create_mp3', String(options.createMp3));

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'json';
    request.timeout = 10 * 60 * 1000;

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response);
      } else {
        reject(new Error(request.response?.detail || `Error HTTP ${request.status}`));
      }
    });
    request.addEventListener('error', () => reject(new Error('No se pudo conectar con el servidor.')));
    request.addEventListener('timeout', () => reject(new Error('La carga tardó demasiado tiempo.')));
    request.send(form);
  });
}

export async function getJob(baseUrl, jobId, signal) {
  const response = await fetch(`${normalizeApiUrl(baseUrl)}/api/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export function artifactUrl(baseUrl, jobId, artifactName) {
  return `${normalizeApiUrl(baseUrl)}/api/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(artifactName)}`;
}

export async function deleteJob(baseUrl, jobId) {
  await fetch(`${normalizeApiUrl(baseUrl)}/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => undefined);
}
