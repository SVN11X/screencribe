import { env, pipeline } from '@huggingface/transformers';
import type { TranscriptionLanguage, TranscriptionResponse } from '../lib/types';
import {
  WHISPER_MODEL_ID,
  WHISPER_SAMPLE_RATE,
  type WhisperRequest,
  type WhisperResponse,
} from '../lib/whisper-protocol';

interface AsrChunk {
  timestamp: [number, number];
  text: string;
}

interface AsrOutput {
  text: string;
  chunks?: AsrChunk[];
}

interface Transcriber {
  (
    audio: Float32Array,
    options: {
      language?: string;
      task: 'transcribe';
      return_timestamps: true;
    },
  ): Promise<AsrOutput>;
  dispose(): Promise<void> | void;
}

interface WorkerScope {
  postMessage(message: WhisperResponse): void;
  onmessage: ((event: MessageEvent<WhisperRequest>) => void) | null;
}

interface ModelLoadProgress {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

const scope = globalThis as unknown as WorkerScope;
const CHUNK_SECONDS = 28;
const OVERLAP_SECONDS = 2;
const STEP_SECONDS = CHUNK_SECONDS - OVERLAP_SECONDS;

const LANGUAGE_NAMES: Record<Exclude<TranscriptionLanguage, 'auto'>, string> = {
  es: 'spanish',
  en: 'english',
  pt: 'portuguese',
  fr: 'french',
  de: 'german',
  it: 'italian',
};

let transcriberPromise: Promise<Transcriber> | null = null;

env.allowLocalModels = false;
env.useBrowserCache = true;

scope.onmessage = (event): void => {
  void handleRequest(event.data);
};

async function handleRequest(request: WhisperRequest): Promise<void> {
  try {
    switch (request.type) {
      case 'prepare':
        await getTranscriber();
        scope.postMessage({ type: 'model-ready' });
        break;
      case 'transcribe': {
        const result = await transcribeAudio(request.audio, request.language);
        scope.postMessage({ type: 'result', result });
        break;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Whisper Large no pudo procesar el audio.';
    scope.postMessage({ type: 'error', message });
  }
}

async function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
      device: 'webgpu',
      dtype: {
        encoder_model: 'q4',
        decoder_model_merged: 'q4',
      },
      progress_callback: (data: ModelLoadProgress) => {
        scope.postMessage(normalizeLoadProgress(data));
      },
    });
  }
  return transcriberPromise;
}

async function transcribeAudio(
  audio: Float32Array,
  language: TranscriptionLanguage,
): Promise<TranscriptionResponse> {
  const transcriber = await getTranscriber();
  const chunkSamples = CHUNK_SECONDS * WHISPER_SAMPLE_RATE;
  const stepSamples = STEP_SECONDS * WHISPER_SAMPLE_RATE;
  const starts: number[] = [];

  for (let start = 0; start < audio.length; start += stepSamples) {
    starts.push(start);
    if (start + chunkSamples >= audio.length) break;
  }

  const segments: TranscriptionResponse['segments'] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const startSample = starts[index] ?? 0;
    const endSample = Math.min(audio.length, startSample + chunkSamples);
    const chunk = audio.slice(startSample, endSample);
    const languageName = language === 'auto' ? undefined : LANGUAGE_NAMES[language];
    const output = await transcriber(chunk, {
      ...(languageName ? { language: languageName } : {}),
      task: 'transcribe',
      return_timestamps: true,
    });

    const offsetSeconds = startSample / WHISPER_SAMPLE_RATE;
    const overlapCutoff = index === 0 ? 0 : offsetSeconds + OVERLAP_SECONDS / 2;
    for (const item of output.chunks ?? []) {
      const start = offsetSeconds + item.timestamp[0];
      const end = offsetSeconds + item.timestamp[1];
      if (end <= overlapCutoff || !item.text.trim()) continue;
      segments.push({
        id: crypto.randomUUID(),
        start: Math.max(start, overlapCutoff),
        end,
        text: item.text.trim(),
        speaker: '',
      });
    }

    scope.postMessage({
      type: 'transcription-progress',
      completed: index + 1,
      total: starts.length,
    });
  }

  const text = segments
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    text,
    duration: audio.length / WHISPER_SAMPLE_RATE,
    language,
    task: 'transcribe',
    model: WHISPER_MODEL_ID,
    segments,
  };
}

function normalizeLoadProgress(data: ModelLoadProgress): WhisperResponse {
  const filename = data.file?.split('/').at(-1);
  const message = filename
    ? `Descargando ${filename}…`
    : data.status === 'ready'
      ? 'Whisper Large v3 está listo.'
      : 'Preparando Whisper Large v3…';
  const progress = normalizeProgress(data.progress);
  return {
    type: 'model-progress',
    message,
    ...(progress === undefined ? {} : { progress }),
    ...(data.loaded === undefined ? {} : { loaded: data.loaded }),
    ...(data.total === undefined ? {} : { total: data.total }),
  };
}

function normalizeProgress(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}
