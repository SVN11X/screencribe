import type { RecordingOptions, RecordingResult } from './types';

interface ExtendedDisplayMediaStreamOptions extends DisplayMediaStreamOptions {
  monitorTypeSurfaces?: 'include' | 'exclude';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function getPreferredMimeType(): string {
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function resolutionConstraints(resolution: RecordingOptions['resolution']): MediaTrackConstraints {
  switch (resolution) {
    case '720p':
      return { width: { ideal: 1280 }, height: { ideal: 720 } };
    case '1080p':
      return { width: { ideal: 1920 }, height: { ideal: 1080 } };
    case 'native':
      return {};
  }
}

function videoBitrate(resolution: RecordingOptions['resolution'], frameRate: number): number {
  const base = resolution === '720p' ? 3_500_000 : resolution === '1080p' ? 6_000_000 : 8_000_000;
  return frameRate === 60 ? Math.round(base * 1.6) : base;
}

export class ScreenRecorder {
  private displayStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedAt = 0;
  private pausedDuration = 0;
  private stopPromise: Promise<RecordingResult> | null = null;
  private resolveStop: ((result: RecordingResult) => void) | null = null;
  private rejectStop: ((reason: unknown) => void) | null = null;

  get state(): RecordingState {
    return this.mediaRecorder?.state ?? 'inactive';
  }

  async start(options: RecordingOptions, onDisplayEnded?: () => void): Promise<MediaStream> {
    const mediaDevices = (navigator as unknown as { mediaDevices?: Partial<MediaDevices> })
      .mediaDevices;
    if (
      typeof mediaDevices?.getDisplayMedia !== 'function' ||
      typeof mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      throw new Error('Este navegador no admite grabación de pantalla con MediaRecorder.');
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      throw new Error('Ya existe una grabación activa.');
    }

    this.chunks = [];
    this.pausedDuration = 0;
    this.pausedAt = 0;

    const displayOptions: ExtendedDisplayMediaStreamOptions = {
      video: {
        ...resolutionConstraints(options.resolution),
        frameRate: { ideal: options.frameRate, max: options.frameRate },
      },
      audio: options.captureSystemAudio,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: options.captureSystemAudio ? 'include' : 'exclude',
      monitorTypeSurfaces: 'include',
    };

    try {
      this.displayStream = await mediaDevices.getDisplayMedia(displayOptions);

      if (options.captureMicrophone) {
        this.microphoneStream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        });
      }

      this.mixedStream = await this.createMixedStream(options);
      const mimeType = getPreferredMimeType();
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: videoBitrate(options.resolution, options.frameRate),
        audioBitsPerSecond: 160_000,
      };
      if (mimeType) recorderOptions.mimeType = mimeType;

      this.mediaRecorder = new MediaRecorder(this.mixedStream, recorderOptions);
      this.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
        this.resolveStop = resolve;
        this.rejectStop = reject;
      });

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      });
      this.mediaRecorder.addEventListener('error', (event) => {
        this.rejectStop?.(event.error);
        void this.cleanup();
      });
      this.mediaRecorder.addEventListener('stop', () => {
        const durationMs = Math.max(0, performance.now() - this.startedAt - this.pausedDuration);
        const blob = new Blob(this.chunks, {
          type: this.mediaRecorder?.mimeType || mimeType || 'video/webm',
        });
        this.resolveStop?.({
          blob,
          mimeType: blob.type,
          durationMs,
          createdAt: new Date(),
        });
        void this.cleanup();
      });

      const videoTrack = this.displayStream.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', () => {
        if (this.mediaRecorder?.state !== 'inactive') onDisplayEnded?.();
      });

      this.startedAt = performance.now();
      this.mediaRecorder.start(1_000);
      return this.mixedStream;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  pause(): void {
    if (this.mediaRecorder?.state !== 'recording') return;
    this.mediaRecorder.pause();
    this.pausedAt = performance.now();
  }

  resume(): void {
    if (this.mediaRecorder?.state !== 'paused') return;
    this.mediaRecorder.resume();
    if (this.pausedAt > 0) this.pausedDuration += performance.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  async stop(): Promise<RecordingResult> {
    if (!this.mediaRecorder || !this.stopPromise) {
      throw new Error('No hay una grabación activa.');
    }

    if (this.mediaRecorder.state === 'paused') this.resume();
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.requestData();
      this.mediaRecorder.stop();
    }

    return this.stopPromise;
  }

  private async createMixedStream(options: RecordingOptions): Promise<MediaStream> {
    if (!this.displayStream) throw new Error('No se obtuvo el flujo de pantalla.');

    const videoTracks = this.displayStream.getVideoTracks();
    const systemTracks = this.displayStream.getAudioTracks();
    const microphoneTracks = this.microphoneStream?.getAudioTracks() ?? [];

    if (systemTracks.length === 0 && microphoneTracks.length === 0) {
      return new MediaStream(videoTracks);
    }

    this.audioContext = new AudioContext({ sampleRate: 48_000 });
    await this.audioContext.resume();
    const destination = this.audioContext.createMediaStreamDestination();

    if (systemTracks.length > 0) {
      const source = this.audioContext.createMediaStreamSource(new MediaStream(systemTracks));
      const gain = this.audioContext.createGain();
      gain.gain.value = options.systemAudioGain;
      source.connect(gain).connect(destination);
    }

    if (microphoneTracks.length > 0) {
      const source = this.audioContext.createMediaStreamSource(new MediaStream(microphoneTracks));
      const gain = this.audioContext.createGain();
      gain.gain.value = options.microphoneGain;
      source.connect(gain).connect(destination);
    }

    return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
  }

  private async cleanup(): Promise<void> {
    for (const stream of [this.displayStream, this.microphoneStream, this.mixedStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    this.displayStream = null;
    this.microphoneStream = null;
    this.mixedStream = null;
    this.audioContext = null;
    this.mediaRecorder = null;
    this.resolveStop = null;
    this.rejectStop = null;
  }
}
