import type { TranscriptionLanguage, TranscriptionResponse } from './types';
import type { WhisperRequest, WhisperResponse } from './whisper-protocol';

export type WhisperProgress =
  | { kind: 'model'; message: string; progress?: number; loaded?: number; total?: number }
  | { kind: 'transcription'; completed: number; total: number };

type ProgressHandler = (progress: WhisperProgress) => void;

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  onProgress?: ProgressHandler;
}

export class LocalWhisperEngine {
  private worker: Worker | null = null;
  private pending: PendingRequest<unknown> | null = null;
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  async prepare(onProgress?: ProgressHandler): Promise<void> {
    if (this.ready) return;
    await this.run<undefined>({ type: 'prepare' }, onProgress);
    this.ready = true;
  }

  async transcribe(
    audio: Float32Array,
    language: TranscriptionLanguage,
    onProgress?: ProgressHandler,
    signal?: AbortSignal,
  ): Promise<TranscriptionResponse> {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError');

    const onAbort = (): void => this.cancel();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const request: WhisperRequest = { type: 'transcribe', audio, language };
      return await this.run<TranscriptionResponse>(request, onProgress, [audio.buffer]);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  cancel(): void {
    if (this.pending) {
      this.pending.reject(new DOMException('Operación cancelada.', 'AbortError'));
      this.pending = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  dispose(): void {
    this.cancel();
  }

  private run<T>(
    request: WhisperRequest,
    onProgress?: ProgressHandler,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.pending) {
      return Promise.reject(new Error('Whisper ya está procesando otra operación.'));
    }

    const worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending = {
        resolve: resolve as (value: unknown) => void,
        reject,
        ...(onProgress ? { onProgress } : {}),
      };
      worker.postMessage(request, transfer);
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
      type: 'module',
      name: 'whisper-large-v3',
    });
    worker.addEventListener('message', (event: MessageEvent<WhisperResponse>) => {
      this.handleMessage(event.data);
    });
    worker.addEventListener('error', (event) => {
      this.fail(new Error(event.message || 'El proceso local de Whisper se detuvo.'));
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: WhisperResponse): void {
    const pending = this.pending;
    if (!pending) return;

    switch (message.type) {
      case 'model-progress':
        pending.onProgress?.({
          kind: 'model',
          message: message.message,
          ...(message.progress === undefined ? {} : { progress: message.progress }),
          ...(message.loaded === undefined ? {} : { loaded: message.loaded }),
          ...(message.total === undefined ? {} : { total: message.total }),
        });
        break;
      case 'transcription-progress':
        pending.onProgress?.({
          kind: 'transcription',
          completed: message.completed,
          total: message.total,
        });
        break;
      case 'model-ready':
        this.ready = true;
        this.pending = null;
        pending.resolve(undefined);
        break;
      case 'result':
        this.pending = null;
        pending.resolve(message.result);
        break;
      case 'error':
        this.fail(new Error(message.message));
        break;
    }
  }

  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    pending?.reject(error);
  }
}
