const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function chooseMimeType() {
  return VIDEO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionForMime(mimeType) {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export class ScreenRecorder {
  #mediaRecorder = null;
  #displayStream = null;
  #microphoneStream = null;
  #mixedStream = null;
  #audioContext = null;
  #chunks = [];
  #startedAt = 0;
  #pausedAt = 0;
  #totalPausedMs = 0;

  get state() {
    return this.#mediaRecorder?.state ?? 'inactive';
  }

  get elapsedMs() {
    if (!this.#startedAt) return 0;
    const now = this.state === 'paused' ? this.#pausedAt : performance.now();
    return Math.max(0, now - this.#startedAt - this.#totalPausedMs);
  }

  async start({ includeMicrophone, includeSystemAudio }) {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador no permite capturar la pantalla mediante getDisplayMedia().');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Este navegador no permite grabar mediante MediaRecorder.');
    }

    this.#displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
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

    try {
      if (includeMicrophone) {
        this.#microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

      this.#mixedStream = await this.#composeStream();
      const mimeType = chooseMimeType();
      const options = {
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 160_000,
      };
      if (mimeType) options.mimeType = mimeType;

      this.#chunks = [];
      this.#mediaRecorder = new MediaRecorder(this.#mixedStream, options);
      this.#mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) this.#chunks.push(event.data);
      });

      const stopped = new Promise((resolve, reject) => {
        this.#mediaRecorder.addEventListener('stop', () => {
          const finalType = this.#mediaRecorder?.mimeType || mimeType || 'video/webm';
          const blob = new Blob(this.#chunks, { type: finalType });
          resolve({ blob, mimeType: finalType, extension: extensionForMime(finalType) });
        }, { once: true });
        this.#mediaRecorder.addEventListener('error', (event) => {
          reject(event.error ?? new Error('La grabación se interrumpió.'));
        }, { once: true });
      });

      this.#displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (this.state !== 'inactive') this.stop();
      });

      this.#startedAt = performance.now();
      this.#pausedAt = 0;
      this.#totalPausedMs = 0;
      this.#mediaRecorder.start(1000);
      return { stopped, mimeType: this.#mediaRecorder.mimeType || mimeType || 'video/webm' };
    } catch (error) {
      this.#cleanupTracks();
      throw error;
    }
  }

  pause() {
    if (this.state !== 'recording') return;
    this.#mediaRecorder.pause();
    this.#pausedAt = performance.now();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.#mediaRecorder.resume();
    this.#totalPausedMs += performance.now() - this.#pausedAt;
    this.#pausedAt = 0;
  }

  stop() {
    if (this.state === 'inactive') return;
    this.#mediaRecorder.stop();
    this.#cleanupTracks();
  }

  async #composeStream() {
    const videoTracks = this.#displayStream.getVideoTracks();
    const displayAudioTracks = this.#displayStream.getAudioTracks();
    const microphoneAudioTracks = this.#microphoneStream?.getAudioTracks() ?? [];

    if (!displayAudioTracks.length && !microphoneAudioTracks.length) {
      return new MediaStream(videoTracks);
    }
    if (!displayAudioTracks.length) {
      return new MediaStream([...videoTracks, ...microphoneAudioTracks]);
    }
    if (!microphoneAudioTracks.length) {
      return new MediaStream([...videoTracks, ...displayAudioTracks]);
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.#audioContext = new AudioContextClass();
    await this.#audioContext.resume();

    const destination = this.#audioContext.createMediaStreamDestination();
    const systemSource = this.#audioContext.createMediaStreamSource(
      new MediaStream(displayAudioTracks),
    );
    const micSource = this.#audioContext.createMediaStreamSource(
      new MediaStream(microphoneAudioTracks),
    );

    systemSource.connect(destination);
    micSource.connect(destination);
    return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
  }

  #cleanupTracks() {
    for (const stream of [this.#displayStream, this.#microphoneStream, this.#mixedStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    this.#audioContext?.close().catch(() => undefined);
    this.#displayStream = null;
    this.#microphoneStream = null;
    this.#mixedStream = null;
    this.#audioContext = null;
  }
}
