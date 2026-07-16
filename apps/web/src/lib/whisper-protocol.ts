import type { TranscriptionLanguage, TranscriptionResponse } from './types';

export const WHISPER_MODEL_ID = 'onnx-community/whisper-large-v3-ONNX';
export const WHISPER_MODEL_LABEL = 'Whisper Large v3';
export const WHISPER_SAMPLE_RATE = 16_000;

export type WhisperRequest =
  | { type: 'prepare' }
  | {
      type: 'transcribe';
      audio: Float32Array;
      language: TranscriptionLanguage;
    };

export type WhisperResponse =
  | {
      type: 'model-progress';
      message: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }
  | { type: 'model-ready' }
  | { type: 'transcription-progress'; completed: number; total: number }
  | { type: 'result'; result: TranscriptionResponse }
  | { type: 'error'; message: string };
