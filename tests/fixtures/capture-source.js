// Deterministic moving source for browser regression tests; not used by the app.
let size = { width: 640, height: 480 };
self.addEventListener('message', async ({ data }) => {
  if (data.type === 'resize') {
    size = { width: data.width, height: data.height };
    return;
  }
  if (data.type !== 'start') return;
  const writer = data.writable.getWriter();
  let index = 0;
  self.postMessage({ type: 'ready' });
  try {
    while (true) {
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#26744e';
      context.fillRect(0, 0, size.width, size.height);
      context.fillStyle = '#e6efc6';
      context.fillRect(size.width / 4, size.height / 4, size.width / 2, size.height / 2);
      context.fillStyle = '#a53548';
      context.beginPath();
      context.arc(
        size.width / 2,
        size.height / 2,
        Math.min(size.width, size.height) / 7,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.fillStyle = '#fff';
      context.font = '24px sans-serif';
      context.fillText(`Window ${size.width}x${size.height} - ${index++}`, 12, 32);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(performance.now() * 1000) });
      try {
        await writer.write(frame);
      } finally {
        frame.close();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    /* Closing the generated track is the expected end of the fixture. */
  } finally {
    await writer.abort().catch(() => undefined);
  }
});
