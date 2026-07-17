function pad(number, width = 2) {
  return String(number).padStart(width, '0');
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function subtitleTime(seconds, separator) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(ms, 3)}`;
}

export function segmentsToSrt(segments) {
  return segments
    .map((segment, index) => `${index + 1}\n${subtitleTime(segment.start, ',')} --> ${subtitleTime(segment.end, ',')}\n${segment.text.trim()}\n`)
    .join('\n');
}

export function segmentsToVtt(segments) {
  const body = segments
    .map((segment) => `${subtitleTime(segment.start, '.')} --> ${subtitleTime(segment.end, '.')}\n${segment.text.trim()}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeBaseName(filename) {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  return withoutExtension.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '-').replace(/^-+|-+$/g, '') || 'grabacion';
}
