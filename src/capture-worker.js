import { containRect } from './video-layout.js?v=native-1';

// Driven by captured frames, never requestAnimationFrame or background timers.
self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'start') return;
  const { readable, writable, width, height } = data;
  let reader;
  let writer;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('No se pudo crear el lienzo de captura.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    reader = readable.getReader();
    writer = writable.getWriter();
    self.postMessage({ type: 'ready' });
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      let normalized;
      try {
        const rect = containRect(frame.displayWidth, frame.displayHeight, width, height);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);
        context.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
        const init = { timestamp: frame.timestamp, alpha: 'discard' };
        if (frame.duration != null) init.duration = frame.duration;
        normalized = new VideoFrame(canvas, init);
        await writer.write(normalized);
      } finally {
        frame.close();
        normalized?.close();
      }
    }
    await writer.close();
    self.postMessage({ type: 'ended' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message || 'Se interrumpió el ajuste del video.',
    });
    await reader?.cancel().catch(() => undefined);
    await writer?.abort().catch(() => undefined);
  } finally {
    reader?.releaseLock();
    writer?.releaseLock();
  }
});
