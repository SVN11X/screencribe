import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { Mp4Quality } from './types';

export interface ConversionStatus {
  progress: number;
  message: string;
}

type ProgressHandler = (status: ConversionStatus) => void;

const MP4_PRESETS: Record<Mp4Quality, { preset: string; crf: string }> = {
  fast: { preset: 'ultrafast', crf: '25' },
  balanced: { preset: 'superfast', crf: '22' },
  quality: { preset: 'veryfast', crf: '19' },
};

export class MediaConverter {
  private readonly ffmpeg = new FFmpeg();
  private loaded = false;
  private currentProgress: ProgressHandler | null = null;

  constructor() {
    this.ffmpeg.on('progress', ({ progress }) => {
      this.currentProgress?.({
        progress: Math.max(0, Math.min(1, progress)),
        message: 'Procesando multimedia…',
      });
    });
    this.ffmpeg.on('log', ({ message }) => {
      if (/error|invalid|failed/i.test(message)) console.warn(`[ffmpeg] ${message}`);
    });
  }

  async load(onProgress?: ProgressHandler): Promise<void> {
    if (this.loaded) return;
    onProgress?.({ progress: 0, message: 'Cargando motor de conversión…' });

    const coreURL = new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href;
    const wasmURL = new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href;
    await this.ffmpeg.load({ coreURL, wasmURL });
    this.loaded = true;
    onProgress?.({ progress: 1, message: 'Motor de conversión listo.' });
  }

  async toMp4(source: Blob, quality: Mp4Quality, onProgress?: ProgressHandler): Promise<Blob> {
    await this.load(onProgress);
    this.currentProgress = onProgress ?? null;
    const input = this.uniqueName('input', 'webm');
    const output = this.uniqueName('output', 'mp4');
    const preset = MP4_PRESETS[quality];

    try {
      onProgress?.({ progress: 0, message: 'Preparando conversión a MP4…' });
      await this.ffmpeg.writeFile(input, await fetchFile(source));
      await this.ffmpeg.exec([
        '-i',
        input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        preset.preset,
        '-crf',
        preset.crf,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart',
        output,
      ]);
      const data = await this.ffmpeg.readFile(output);
      if (typeof data === 'string') throw new Error('FFmpeg devolvió un formato inesperado.');
      onProgress?.({ progress: 1, message: 'MP4 terminado.' });
      const bytes = new Uint8Array(data.byteLength);
      bytes.set(data);
      return new Blob([bytes.buffer], { type: 'video/mp4' });
    } finally {
      this.currentProgress = null;
      await this.safeDelete(input);
      await this.safeDelete(output);
    }
  }

  async toMp3(source: Blob, onProgress?: ProgressHandler): Promise<Blob> {
    return this.extractMp3(source, '128k', '44100', '2', onProgress);
  }

  async toSpeechMp3(source: Blob, onProgress?: ProgressHandler): Promise<Blob> {
    return this.extractMp3(source, '64k', '16000', '1', onProgress);
  }

  terminate(): void {
    this.ffmpeg.terminate();
    this.loaded = false;
    this.currentProgress = null;
  }

  private async extractMp3(
    source: Blob,
    bitrate: string,
    sampleRate: string,
    channels: string,
    onProgress?: ProgressHandler,
  ): Promise<Blob> {
    await this.load(onProgress);
    this.currentProgress = onProgress ?? null;
    const input = this.uniqueName('input', 'webm');
    const output = this.uniqueName('audio', 'mp3');

    try {
      onProgress?.({ progress: 0, message: 'Extrayendo audio…' });
      await this.ffmpeg.writeFile(input, await fetchFile(source));
      await this.ffmpeg.exec([
        '-i',
        input,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        bitrate,
        '-ar',
        sampleRate,
        '-ac',
        channels,
        output,
      ]);
      const data = await this.ffmpeg.readFile(output);
      if (typeof data === 'string') throw new Error('FFmpeg devolvió un formato inesperado.');
      onProgress?.({ progress: 1, message: 'Audio MP3 terminado.' });
      const bytes = new Uint8Array(data.byteLength);
      bytes.set(data);
      return new Blob([bytes.buffer], { type: 'audio/mpeg' });
    } finally {
      this.currentProgress = null;
      await this.safeDelete(input);
      await this.safeDelete(output);
    }
  }

  private uniqueName(prefix: string, extension: string): string {
    return `${prefix}-${crypto.randomUUID()}.${extension}`;
  }

  private async safeDelete(filename: string): Promise<void> {
    try {
      await this.ffmpeg.deleteFile(filename);
    } catch {
      // El archivo puede no haberse creado si la conversión falló temprano.
    }
  }
}
