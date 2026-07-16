const WHISPER_SAMPLE_RATE = 16_000;

export interface DecodedAudio {
  samples: Float32Array;
  durationSeconds: number;
}

/**
 * Decodifica cualquier audio aceptado por el navegador y lo convierte a mono, 16 kHz,
 * que es el formato de entrada esperado por Whisper.
 */
export async function decodeAudioForWhisper(blob: Blob): Promise<DecodedAudio> {
  const audioContext = new AudioContext();
  try {
    const encoded = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(encoded.slice(0));
    const outputLength = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, outputLength, WHISPER_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const channel = rendered.getChannelData(0);
    const samples = new Float32Array(channel.length);
    samples.set(channel);
    return { samples, durationSeconds: rendered.duration };
  } finally {
    await audioContext.close();
  }
}

export function estimateAudioMemoryBytes(durationSeconds: number): number {
  return Math.ceil(durationSeconds * WHISPER_SAMPLE_RATE * Float32Array.BYTES_PER_ELEMENT);
}
