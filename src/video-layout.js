// Geometry shared by the capture worker and regression tests.
export function outputSize(settings = {}, quality = '1080') {
  if (quality === '720') return { width: 1280, height: 720 };
  if (quality !== 'original') return { width: 1920, height: 1080 };
  const sourceWidth = Number(settings.width) || 1920;
  const sourceHeight = Number(settings.height) || 1080;
  const scale = Math.min(1, 3840 / sourceWidth, 2160 / sourceHeight);
  return {
    width: Math.max(2, Math.floor((sourceWidth * scale) / 2) * 2),
    height: Math.max(2, Math.floor((sourceHeight * scale) / 2) * 2),
  };
}

export function containRect(sourceWidth, sourceHeight, width, height) {
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('Fotograma sin dimensiones.');
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}
