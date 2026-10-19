import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_MIME_CANDIDATES,
  extensionForMime,
  recordedBlob,
  startNativeRecorder,
  supportedVideoMime,
  videoMimeCandidates,
} from '../src/recording-formats.js';

test('MP4 is preferred when available, including video-only codecs for a silent recording', () => {
  const supported = {
    isTypeSupported: (type) => type === 'video/mp4;codecs=avc1',
  };
  assert.equal(supportedVideoMime(false, supported), 'video/mp4;codecs=avc1');
  assert.equal(supportedVideoMime(true, supported), '');
  assert.equal(
    supportedVideoMime(true, { isTypeSupported: () => true }),
    videoMimeCandidates(true)[0],
  );
});

test('a browser without native MP4 falls back honestly to WebM', () => {
  const supported = {
    isTypeSupported: (type) => type.startsWith('video/webm'),
  };
  assert.match(supportedVideoMime(true, supported), /^video\/webm/);
  assert.equal(extensionForMime('video/webm;codecs=vp8,opus'), 'webm');
  assert.equal(extensionForMime('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.equal(extensionForMime('audio/mpeg'), 'mp3');
  assert.equal(extensionForMime('application/unknown'), 'bin');
  assert.ok(AUDIO_MIME_CANDIDATES.includes('audio/webm;codecs=opus'));
});

test('a rejected MP4 encoder can fall back before capture starts, with no orphan listeners', () => {
  const attempts = [];
  class Recorder extends EventTarget {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      super();
      this.mimeType = options.mimeType;
      attempts.push(this);
    }
    start() {
      if (this.mimeType.startsWith('video/mp4'))
        throw new DOMException('Unavailable encoder', 'NotSupportedError');
      this.state = 'recording';
    }
  }
  let calls = 0;
  const recorder = startNativeRecorder(
    {},
    {},
    ['video/mp4', 'video/webm'],
    {
      dataavailable: () => calls++,
    },
    Recorder,
  );
  attempts[0].dispatchEvent(new Event('dataavailable'));
  assert.equal(calls, 0);
  recorder.dispatchEvent(new Event('dataavailable'));
  assert.equal(calls, 1);
  assert.equal(recorder.mimeType, 'video/webm');
});

test('the emitted type and final bytes are preserved without conversion or extension spoofing', async () => {
  const blob = recordedBlob({ mimeType: 'video/mp4' }, [
    new Blob(['first'], { type: 'video/webm' }),
    new Blob(['final'], { type: 'video/webm' }),
  ]);
  assert.equal(blob.type, 'video/webm');
  assert.equal(extensionForMime(blob.type), 'webm');
  assert.equal(await blob.text(), 'firstfinal');
});
