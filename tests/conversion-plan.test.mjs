import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConversionPlan, conversionSize } from '../src/conversion-plan.js';

test('conversion preserves portrait orientation, rotation and even dimensions within Full HD', () => {
  assert.deepEqual(conversionSize({ width: 321, height: 241 }), {
    width: 320,
    height: 240,
  });
  assert.deepEqual(conversionSize({ width: 3840, height: 2160 }), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(conversionSize({ width: 2160, height: 3840 }), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(
    conversionSize({
      width: 1920,
      height: 1080,
      side_data_list: [{ rotation: -90 }],
    }),
    { width: 1080, height: 1920 },
  );
});

test('silent videos can produce MP4, while MP3 gives an explicit missing-audio warning', () => {
  const plan = makeConversionPlan(
    { streams: [{ index: 0, codec_type: 'video', width: 321, height: 241 }] },
    { createMp4: true, createMp3: true },
  );
  assert.equal(plan.outputs.length, 1);
  assert.equal(plan.outputs[0].name, 'mp4');
  assert.ok(plan.outputs[0].args.includes('-an'));
  assert.match(plan.warnings.join(' '), /no tiene audio/);
  assert.throws(
    () =>
      makeConversionPlan(
        {
          streams: [{ index: 0, codec_type: 'video', width: 320, height: 240 }],
        },
        { createMp3: true },
      ),
    /no tiene audio/,
  );
});

test('audio cover art is not treated as a movie and the actual audio stream is selected', () => {
  const plan = makeConversionPlan(
    {
      streams: [
        {
          index: 0,
          codec_type: 'video',
          width: 100,
          height: 100,
          disposition: { attached_pic: 1 },
        },
        { index: 2, codec_type: 'audio' },
      ],
    },
    { createMp4: true, createMp3: true },
  );
  assert.equal(plan.outputs.length, 1);
  assert.equal(plan.outputs[0].name, 'mp3');
  assert.ok(plan.outputs[0].args.includes('0:2'));
  assert.match(plan.warnings.join(' '), /no tiene una pista de video/);
});
