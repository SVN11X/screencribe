import type { AppSettings } from './types';

const STORAGE_KEY = 'captura-ia-studio:settings:v2';

export const defaultSettings: AppSettings = {
  fileBaseName: 'grabacion',
  captureMicrophone: true,
  captureSystemAudio: true,
  microphoneGain: 1,
  systemAudioGain: 1,
  resolution: '1080p',
  frameRate: 30,
  mp4Quality: 'balanced',
  language: 'es',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
