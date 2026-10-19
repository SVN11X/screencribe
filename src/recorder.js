import { outputSize } from './video-layout.js?v=native-1';
import {
  AUDIO_MIME_CANDIDATES,
  extensionForMime,
  recordedBlob,
  startNativeRecorder,
  videoMimeCandidates,
} from './recording-formats.js?v=native-1';

export class ScreenRecorder extends EventTarget {
  #mediaRecorder = null;
  #audioRecorder = null;
  #displayStream = null;
  #microphoneStream = null;
  #mixedStream = null;
  #audioContext = null;
  #worker = null;
  #processorTrack = null;
  #outputTrack = null;
  #chunks = [];
  #startedAt = 0;
  #stoppedAt = 0;
  #pausedAt = 0;
  #totalPausedMs = 0;
  #starting = false;
  #stopping = false;
  #lastHasAudio = false;

  get state() {
    return this.#mediaRecorder?.state ?? 'inactive';
  }
  get elapsedMs() {
    if (!this.#startedAt) return 0;
    const end =
      this.#stoppedAt ||
      (this.state === 'paused' ? this.#pausedAt : performance.now());
    return Math.max(0, end - this.#startedAt - this.#totalPausedMs);
  }
  #warn(message) {
    this.dispatchEvent(new CustomEvent('warning', { detail: message }));
  }

  async start({
    includeMicrophone = true,
    includeSystemAudio = true,
    surface = 'browser',
    quality = '1080',
    frameRate = 30,
    saveAudioSeparately = true,
  } = {}) {
    if (this.#starting || this.state !== 'inactive' || this.#stopping)
      throw new Error('Ya hay una captura en curso.');
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      throw new Error(
        'La captura de pantalla requiere un navegador compatible y HTTPS. Prueba Chrome o Edge en computador.',
      );
    }
    this.#starting = true;
    try {
      // Call before another await would lose the user's activation.
      this.#displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: Number(frameRate), max: Number(frameRate) },
          displaySurface: surface,
        },
        audio: includeSystemAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: includeSystemAudio ? 'include' : 'exclude',
      });
      const displayTrack = this.#displayStream.getVideoTracks()[0];
      if (!displayTrack || displayTrack.readyState === 'ended')
        throw new Error(
          'La ventana dejó de compartirse. Vuelve a seleccionarla.',
        );
      displayTrack.contentHint = 'detail';
      const warnings = [];
      if (includeMicrophone) {
        try {
          this.#microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch {
          warnings.push(
            'No se pudo acceder al micrófono. La captura continúa sin tu voz.',
          );
        }
      }
      if (includeSystemAudio && !this.#displayStream.getAudioTracks().length) {
        warnings.push(
          'No se compartió audio. Para grabarlo, elige una pestaña y activa «Compartir audio» en el navegador.',
        );
      }
      const dimensions = outputSize(displayTrack.getSettings(), quality);
      const stableTrack = await this.#stabilizeVideo(displayTrack, dimensions);
      const stabilized = stableTrack !== displayTrack;
      if (!stabilized)
        warnings.push(
          'Este navegador no admite el ajuste estable del video. Usa Chrome o Edge para redimensionar la ventana durante la captura.',
        );
      if (displayTrack.readyState === 'ended')
        throw new Error('La captura se cerró antes de iniciar.');
      this.#mixedStream = await this.#composeStream(stableTrack);
      const pixels = dimensions.width * dimensions.height;
      const options = {
        videoBitsPerSecond: Math.round(
          Math.max(4_000_000, Math.min(20_000_000, pixels * 4)) *
            (Number(frameRate) / 30),
        ),
        audioBitsPerSecond: 192_000,
      };
      this.#chunks = [];
      this.#lastHasAudio = this.#mixedStream.getAudioTracks().length > 0;
      let audioStopped = Promise.resolve(null);
      let resolveStopped;
      let rejectStopped;
      const stopped = new Promise((resolve, reject) => {
        resolveStopped = resolve;
        rejectStopped = reject;
      });
      let recordingError = null;
      this.#startedAt = performance.now();
      this.#stoppedAt = 0;
      this.#pausedAt = 0;
      this.#totalPausedMs = 0;
      const mediaRecorder = startNativeRecorder(
        this.#mixedStream,
        options,
        videoMimeCandidates(this.#lastHasAudio),
        {
          dataavailable: (event) => {
            if (event.data?.size) this.#chunks.push(event.data);
          },
          error: (event) => {
            recordingError =
              event.error || new Error('La grabación se interrumpió.');
            this.#warn(
              'El navegador interrumpió la captura. Se conservará el video recibido hasta ese momento.',
            );
          },
          stop: async (event) => {
            this.#freezeClock();
            if (this.#audioRecorder?.state !== 'inactive')
              this.#audioRecorder?.stop();
            const blob = recordedBlob(event.target, this.#chunks);
            this.#chunks = [];
            // Preserve both final chunks before releasing the shared audio tracks.
            const audio = await audioStopped;
            this.#cleanupTracks();
            this.#stopping = false;
            if (!blob.size)
              rejectStopped(
                recordingError ||
                  new Error(
                    'La grabación está vacía. Mantén la ventana visible e inténtalo nuevamente.',
                  ),
              );
            else
              resolveStopped({
                blob,
                mimeType: blob.type,
                extension: extensionForMime(blob.type),
                durationMs: this.elapsedMs,
                hasAudio: this.#lastHasAudio,
                audio,
              });
          },
        },
      );
      this.#mediaRecorder = mediaRecorder;
      if (saveAudioSeparately && this.#lastHasAudio)
        audioStopped = this.#startAudioRecording(warnings);
      if (!mediaRecorder.mimeType.toLowerCase().startsWith('video/mp4'))
        warnings.push(
          'Esta captura se guardará en el formato nativo del navegador. Si es WebM, se descargará como WebM. Para obtener MP4 directo, usa un navegador y equipo que admitan ese formato.',
        );
      displayTrack.addEventListener('ended', () => this.stop(), { once: true });
      displayTrack.addEventListener('mute', () =>
        this.#warn(
          'La ventana dejó de enviar imagen. Mantén la ventana abierta y evita minimizarla; el sistema puede suspender la captura.',
        ),
      );
      return {
        stopped,
        stream: this.#mixedStream,
        stabilized,
        dimensions,
        warnings,
        hasAudio: this.#lastHasAudio,
        mimeType: mediaRecorder.mimeType,
        surface: displayTrack.getSettings().displaySurface || surface,
      };
    } catch (error) {
      this.#cleanupTracks();
      throw error;
    } finally {
      this.#starting = false;
    }
  }

  pause() {
    if (this.state !== 'recording' || this.#stopping) return;
    this.#mediaRecorder.pause();
    if (this.#audioRecorder?.state === 'recording') this.#audioRecorder.pause();
    this.#pausedAt = performance.now();
  }
  resume() {
    if (this.state !== 'paused' || this.#stopping) return;
    this.#mediaRecorder.resume();
    if (this.#audioRecorder?.state === 'paused') this.#audioRecorder.resume();
    this.#totalPausedMs += performance.now() - this.#pausedAt;
    this.#pausedAt = 0;
  }
  #freezeClock() {
    if (!this.#stoppedAt) this.#stoppedAt = this.#pausedAt || performance.now();
  }
  stop() {
    if (this.state === 'inactive' || this.#stopping) return;
    this.#freezeClock();
    this.#stopping = true;
    this.#mediaRecorder.stop();
    if (this.#audioRecorder && this.#audioRecorder.state !== 'inactive')
      this.#audioRecorder.stop();
    // Cleanup after BOTH MediaRecorders emit their final chunks and stop events.
  }

  #startAudioRecording(warnings) {
    const chunks = [];
    let finish;
    const stopped = new Promise((resolve) => {
      finish = resolve;
    });
    try {
      this.#audioRecorder = startNativeRecorder(
        new MediaStream(this.#mixedStream.getAudioTracks()),
        { audioBitsPerSecond: 192_000 },
        AUDIO_MIME_CANDIDATES,
        {
          dataavailable: (event) => {
            if (event.data?.size) chunks.push(event.data);
          },
          error: () =>
            this.#warn(
              'El navegador interrumpió el audio separado. El video sigue disponible con el audio que pudo grabarse.',
            ),
          stop: (event) => {
            const blob = recordedBlob(event.target, chunks);
            chunks.length = 0;
            if (!blob.size)
              this.#warn(
                'No se pudo guardar el audio separado. Descarga el video.',
              );
            finish(
              blob.size
                ? { blob, extension: extensionForMime(blob.type) }
                : null,
            );
          },
        },
      );
    } catch {
      this.#audioRecorder = null;
      warnings.push(
        'No se pudo iniciar el audio separado. El video conservará su pista de audio.',
      );
      finish(null);
    }
    return stopped;
  }

  async #stabilizeVideo(displayTrack, dimensions) {
    if (
      typeof MediaStreamTrackProcessor === 'undefined' ||
      typeof MediaStreamTrackGenerator === 'undefined' ||
      typeof Worker === 'undefined' ||
      typeof OffscreenCanvas === 'undefined' ||
      typeof VideoFrame === 'undefined'
    )
      return displayTrack;
    try {
      this.#processorTrack = displayTrack.clone();
      const processor = new MediaStreamTrackProcessor({
        track: this.#processorTrack,
        maxBufferSize: 2,
      });
      this.#outputTrack = new MediaStreamTrackGenerator({ kind: 'video' });
      this.#outputTrack.contentHint = 'detail';
      const worker = new Worker(
        new URL('./capture-worker.js?v=native-1', import.meta.url),
        {
          type: 'module',
        },
      );
      this.#worker = worker;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('El ajuste de video no respondió.')),
          5000,
        );
        const finish = (error) => {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          error ? reject(error) : resolve();
        };
        const onMessage = ({ data }) => {
          if (data.type === 'ready') finish();
          else if (data.type === 'error') finish(new Error(data.message));
        };
        const onError = () =>
          finish(new Error('No se pudo iniciar el ajuste de video.'));
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(
          {
            type: 'start',
            readable: processor.readable,
            writable: this.#outputTrack.writable,
            ...dimensions,
          },
          [processor.readable, this.#outputTrack.writable],
        );
      });
      const interrupted = () => {
        if (this.state !== 'inactive' && !this.#stopping) {
          this.#warn(
            'Se interrumpió el ajuste de video. Se guardará lo grabado hasta este momento.',
          );
          this.stop();
        }
      };
      worker.addEventListener('message', ({ data }) => {
        if (data.type === 'error' || data.type === 'ended') interrupted();
      });
      worker.addEventListener('error', interrupted);
      return this.#outputTrack;
    } catch {
      this.#worker?.terminate();
      this.#processorTrack?.stop();
      this.#outputTrack?.stop();
      this.#worker = null;
      this.#processorTrack = null;
      this.#outputTrack = null;
      return displayTrack;
    }
  }

  async #composeStream(videoTrack) {
    const displayAudio = this.#displayStream.getAudioTracks();
    const micAudio = this.#microphoneStream?.getAudioTracks() || [];
    if (!displayAudio.length || !micAudio.length)
      return new MediaStream([videoTrack, ...displayAudio, ...micAudio]);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.#audioContext = new AudioContextClass();
    await this.#audioContext.resume();
    const destination = this.#audioContext.createMediaStreamDestination();
    // Two full-scale sources sum below 1.0, leaving headroom for the mix.
    for (const tracks of [displayAudio, micAudio]) {
      const source = this.#audioContext.createMediaStreamSource(
        new MediaStream(tracks),
      );
      const gain = this.#audioContext.createGain();
      gain.gain.value = 0.45;
      source.connect(gain).connect(destination);
    }
    return new MediaStream([
      videoTrack,
      ...destination.stream.getAudioTracks(),
    ]);
  }

  #cleanupTracks() {
    this.#worker?.terminate();
    this.#processorTrack?.stop();
    this.#outputTrack?.stop();
    for (const stream of [
      this.#displayStream,
      this.#microphoneStream,
      this.#mixedStream,
    ])
      stream?.getTracks().forEach((track) => track.stop());
    this.#audioContext?.close().catch(() => undefined);
    this.#worker = null;
    this.#processorTrack = null;
    this.#outputTrack = null;
    this.#displayStream = null;
    this.#microphoneStream = null;
    this.#mixedStream = null;
    this.#audioContext = null;
    this.#audioRecorder = null;
  }
}
