// Only browser APIs. These lists never import or download encoders.
export function videoMimeCandidates(hasAudio = true) {
  return [
    ...(hasAudio
      ? [
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1,opus',
        ]
      : ['video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.42E01E']),
    'video/mp4',
    hasAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8',
    hasAudio ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9',
    'video/webm',
  ];
}

export const AUDIO_MIME_CANDIDATES = [
  'audio/mpeg',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function supportedVideoMime(
  hasAudio = true,
  Recorder = globalThis.MediaRecorder,
) {
  return (
    videoMimeCandidates(hasAudio).find((type) =>
      Recorder?.isTypeSupported(type),
    ) || ''
  );
}

export function extensionForMime(mimeType) {
  const type = String(mimeType).split(';')[0].trim().toLowerCase();
  return (
    {
      'video/mp4': 'mp4',
      'audio/mp4': 'm4a',
      'video/webm': 'webm',
      'audio/webm': 'webm',
      'video/ogg': 'ogv',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'video/x-matroska': 'mkv',
      'audio/x-matroska': 'mka',
    }[type] || 'bin'
  );
}

// isTypeSupported is a hint, not a guarantee. Try construction AND start,
// keeping the listeners installed before the first chunk can arrive.
export function startNativeRecorder(
  stream,
  options,
  candidates,
  handlers,
  Recorder = globalThis.MediaRecorder,
) {
  let lastError;
  for (const mimeType of [
    ...candidates.filter((type) => Recorder.isTypeSupported(type)),
    '',
  ]) {
    let recorder;
    try {
      recorder = new Recorder(stream, {
        ...options,
        ...(mimeType ? { mimeType } : {}),
      });
      for (const [event, listener] of Object.entries(handlers))
        recorder.addEventListener(event, listener);
      recorder.start(1000);
      return recorder;
    } catch (error) {
      lastError = error;
      if (recorder)
        for (const [event, listener] of Object.entries(handlers))
          recorder.removeEventListener(event, listener);
    }
  }
  throw lastError || new Error('El navegador no pudo iniciar la grabación.');
}

export function recordedBlob(recorder, chunks) {
  // The emitted bytes decide the container. Never rename WebM to MP4.
  const mimeType =
    chunks.find((chunk) => chunk.size && chunk.type)?.type || recorder.mimeType;
  return new Blob(chunks, { type: mimeType });
}
