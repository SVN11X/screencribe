import test from 'node:test';
import assert from 'node:assert/strict';
import { outputSize, containRect } from '../src/video-layout.js';
import { formatClock, safeBaseName } from '../src/exporters.js';

test('a maximized and a tall window fit the same output without distortion or cropping', () => {
  for (const [sourceWidth, sourceHeight] of [
    [640, 480],
    [1920, 1080],
    [500, 1200],
    [3840, 2160],
  ]) {
    const rect = containRect(sourceWidth, sourceHeight, 1920, 1080);
    assert.ok(
      Math.abs(rect.width / rect.height - sourceWidth / sourceHeight) < 1e-9,
    );
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= 1920 && rect.y + rect.height <= 1080);
  }
});
test('odd native dimensions become even and 8K is capped without changing its aspect ratio', () => {
  assert.deepEqual(outputSize({ width: 1365, height: 767 }, 'original'), {
    width: 1364,
    height: 766,
  });
  assert.deepEqual(outputSize({ width: 7680, height: 4320 }, 'original'), {
    width: 3840,
    height: 2160,
  });
  assert.deepEqual(outputSize({}, '720'), { width: 1280, height: 720 });
});
test('a 4:3 window gets equal side padding in a 16:9 frame', () => {
  assert.deepEqual(containRect(640, 480, 1280, 720), {
    x: 160,
    y: 0,
    width: 960,
    height: 720,
  });
});
test('formatting preserves long recordings and creates safe output names', () => {
  assert.equal(formatClock(3661000), '01:01:01');
  assert.equal(
    safeBaseName('Mi clase de Ciencias.mp4'),
    'Mi-clase-de-Ciencias',
  );
});
