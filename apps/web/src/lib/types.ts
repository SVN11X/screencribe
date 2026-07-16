export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopping' | 'ready';

export type Resolution = '720p' | '1080p' | 'native';
export type Mp4Quality = 'fast' | 'balanced' | 'quality';
export type TranscriptionLanguage = 'auto' | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it';

export interface RecordingOptions {
  captureMicrophone: boolean;
  captureSystemAudio: boolean;
  microphoneGain: number;
  systemAudioGain: number;
  resolution: Resolution;
  frameRate: 24 | 30 | 60;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: Date;
}

export interface DiarizedSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker: string;
  type?: string;
}

export interface TranscriptionResponse {
  text: string;
  duration: number;
  language: string;
  task: 'transcribe';
  model: string;
  segments: DiarizedSegment[];
}

export interface TranscriptionOptions {
  language: TranscriptionLanguage;
}

export interface AppSettings extends RecordingOptions, TranscriptionOptions {
  fileBaseName: string;
  mp4Quality: Mp4Quality;
}
