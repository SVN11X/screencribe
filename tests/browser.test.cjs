const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const qa =
  process.env.SCREENCRIBE_QA_DIR ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'screencribe-native-'));
const port = Number(process.env.SCREENCRIBE_QA_PORT || 5500);
const base = `http://127.0.0.1:${port}/${path.basename(root)}/`;
fs.mkdirSync(qa, { recursive: true });
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe = (file) =>
  JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      file,
    ]),
  );
async function fixture(page) {
  await page.evaluate((base) => {
    window.fixtureContexts = [];
    const audio = (frequency) => {
      const context = new AudioContext();
      window.fixtureContexts.push(context);
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      const destination = context.createMediaStreamDestination();
      tone.connect(destination);
      tone.start();
      return destination.stream.getAudioTracks();
    };
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const generated = new MediaStreamTrackGenerator({ kind: 'video' });
      window.fixtureTrack = generated;
      window.captureFixture = new Worker(
        new URL('tests/fixtures/capture-source.js', base),
        { type: 'module' },
      );
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Fixture timeout')),
          5000,
        );
        window.captureFixture.onerror = (event) =>
          reject(new Error(event.message));
        window.captureFixture.onmessage = () => {
          clearTimeout(timeout);
          resolve();
        };
        window.captureFixture.postMessage(
          { type: 'start', writable: generated.writable },
          [generated.writable],
        );
      });
      return new MediaStream([generated, ...(options.audio ? audio(440) : [])]);
    };
    navigator.mediaDevices.getUserMedia = async () =>
      new MediaStream(audio(660));
  }, base);
}
async function start(page) {
  await page.locator('#startRecording').click();
  await page.waitForFunction(
    () =>
      document
        .getElementById('recordingStatus')
        .textContent.includes('Grabando') ||
      !document.getElementById('errorBox').classList.contains('hidden'),
  );
  assert.equal(await page.locator('#errorBox').isVisible(), false);
}
async function stop(page) {
  await page.locator('#stopRecording').click();
  await page.waitForFunction(
    () => !document.getElementById('downloadOriginal').disabled,
  );
}
async function download(page, id, file) {
  const ready = page.waitForEvent('download');
  await page.locator(id).click();
  const event = await ready;
  await event.saveAs(file);
  assert.equal(await event.failure(), null);
  return event.suggestedFilename();
}
(async () => {
  const http = spawn(
    process.env.SCREENCRIBE_PYTHON || 'python3',
    ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: path.dirname(root), stdio: 'ignore' },
  );
  let browser;
  const errors = [];
  const requests = [];
  try {
    await delay(600);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: [
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        ...JSON.parse(process.env.SCREENCRIBE_BROWSER_ARGS || '[]'),
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
    });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:/.test(url)) {
        requests.push(url);
        if (!url.startsWith(base)) return route.abort();
      }
      return route.continue();
    });
    const newPage = async () => {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await fixture(page);
      return page;
    };
    const page = await newPage();
    console.log('Browser: ' + browser.version());
    console.log(
      'Native codecs: ' +
        JSON.stringify(
          await page.evaluate(() =>
            [
              'video/mp4;codecs=avc1,mp4a.40.2',
              'video/mp4;codecs=avc1,opus',
              'video/mp4',
              'audio/mpeg',
              'audio/mp4',
              'audio/webm;codecs=opus',
            ].map((type) => [type, MediaRecorder.isTypeSupported(type)]),
          ),
        ),
    );
    await page.locator('#quality').selectOption('720');
    await page.locator('input[name="surface"][value="window"]').check();
    await start(page);
    await delay(1200);
    assert.match(
      await page.locator('#captureMeta').textContent(),
      /1280 × 720/,
    );
    await page.evaluate(() =>
      window.captureFixture.postMessage({
        type: 'resize',
        width: 1920,
        height: 1080,
      }),
    );
    await delay(800);
    await page.locator('#pauseRecording').click();
    const clock = await page.locator('#recordingTimer').textContent();
    await delay(1100);
    assert.equal(await page.locator('#recordingTimer').textContent(), clock);
    assert.equal(await page.locator('#pausedOverlay').isVisible(), true);
    await page.locator('#pauseRecording').click();
    await page.evaluate(() =>
      window.captureFixture.postMessage({
        type: 'resize',
        width: 500,
        height: 900,
      }),
    );
    await delay(900);
    const background = await context.newPage();
    await background.goto('about:blank');
    await background.bringToFront();
    await delay(1000);
    await page.bringToFront();
    await background.close();
    await stop(page);
    const expectedMp4 = await page.evaluate(() =>
      MediaRecorder.isTypeSupported('video/mp4'),
    );
    const extension = expectedMp4 ? 'mp4' : 'webm';
    const output = path.join(qa, `native-recording.${extension}`);
    assert.equal(await page.locator('#downloadAudio').isDisabled(), false);
    const requestsBeforeDownload = requests.length;
    const filename = await download(page, '#downloadOriginal', output);
    assert.ok(filename.endsWith('.' + extension));
    const native = probe(output);
    const video = native.streams.find(
      (stream) => stream.codec_type === 'video',
    );
    const audio = native.streams.find(
      (stream) => stream.codec_type === 'audio',
    );
    assert.equal(video.width, 1280);
    assert.equal(video.height, 720);
    assert.ok(audio);
    assert.ok(Number(native.format.duration) > 2);
    assert.match(native.format.format_name, expectedMp4 ? /mp4/ : /webm/);
    const frames = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_frames',
        '-show_entries',
        'frame=width,height,best_effort_timestamp_time',
        '-of',
        'json',
        output,
      ]),
    );
    assert.ok(frames.frames.length >= 20);
    assert.ok(
      frames.frames.every(
        (frame) => frame.width === 1280 && frame.height === 720,
      ),
    );
    const times = frames.frames.map((frame) =>
      Number(frame.best_effort_timestamp_time),
    );
    assert.ok(
      times.every((time, index) => index === 0 || time > times[index - 1]),
    );
    const audioFormat = (
      await page.locator('#audioFormat').textContent()
    ).toLowerCase();
    const audioOutput = path.join(qa, `native-audio.${audioFormat}`);
    assert.ok(
      (await download(page, '#downloadAudio', audioOutput)).endsWith(
        '.' + audioFormat,
      ),
    );
    const separate = probe(audioOutput);
    assert.equal(separate.streams.length, 1);
    assert.equal(separate.streams[0].codec_type, 'audio');
    assert.ok(Number(separate.format.duration) > 2);
    assert.ok(
      Math.abs(
        Number(separate.format.duration) - Number(native.format.duration),
      ) < 0.7,
    );
    assert.equal(
      requests.length,
      requestsBeforeDownload,
      'download must not request any HTTP resources',
    );
    await page.evaluate(async () => {
      const video = document.getElementById('videoPreview');
      video.muted = true;
      await video.play();
    });
    await page.waitForFunction(
      () => document.getElementById('videoPreview').currentTime > 0.1,
    );
    await page.evaluate(() => document.getElementById('videoPreview').pause());
    console.log(
      `PASS real native ${extension.toUpperCase()} (${video.codec_name}/${audio.codec_name}), stable frames, pause/resume, mixed audio and separate ${audioFormat.toUpperCase()}, no requests on download`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(qa, 'desktop.png'),
      fullPage: true,
    });

    // Uploads are byte-for-byte downloads; neither renamed nor transcoded.
    await page.locator('#fileInput').setInputFiles(output);
    const uploadedCopy = path.join(qa, `uploaded-copy.${extension}`);
    await download(page, '#downloadOriginal', uploadedCopy);
    assert.equal(hash(output), hash(uploadedCopy));
    assert.equal(await page.locator('#downloadAudio').isDisabled(), true);
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      };
    });
    await page.locator('#recordTab').click();
    await page.locator('#startRecording').click();
    await page.waitForFunction(
      () => !document.getElementById('errorBox').classList.contains('hidden'),
    );
    assert.equal(await page.locator('#downloadOriginal').isDisabled(), false);
    console.log(
      'PASS imported file bytes preserved, permission denial keeps previous file',
    );

    const silent = await newPage();
    await silent.locator('#includeMic').uncheck();
    await silent.locator('#includeSystemAudio').uncheck();
    await silent.locator('#saveAudioSeparately').uncheck();
    await silent.locator('#quality').selectOption('720');
    await start(silent);
    await delay(1500);
    await stop(silent);
    const silentExt = (
      await silent.locator('#videoFormat').textContent()
    ).toLowerCase();
    const silentPath = path.join(qa, `silent.${silentExt}`);
    await download(silent, '#downloadOriginal', silentPath);
    assert.equal(
      probe(silentPath).streams.filter(
        (stream) => stream.codec_type === 'audio',
      ).length,
      0,
    );
    assert.equal(await silent.locator('#downloadAudio').isDisabled(), true);
    console.log('PASS silent native recording has no fake audio');

    const fallback = await newPage();
    await fallback.evaluate(() => {
      const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
      MediaRecorder.isTypeSupported = (type) =>
        !type.includes('mp4') && supported(type);
    });
    await fallback.locator('#includeMic').uncheck();
    await fallback.locator('#quality').selectOption('720');
    await start(fallback);
    await delay(1400);
    // Stop while paused: both final buffers must still be retained.
    await fallback.locator('#pauseRecording').click();
    await stop(fallback);
    assert.equal(await fallback.locator('#videoFormat').textContent(), 'WEBM');
    assert.match(await fallback.locator('#noticeBox').textContent(), /WebM/);
    const webm = path.join(qa, 'fallback.webm');
    assert.match(
      await download(fallback, '#downloadOriginal', webm),
      /\.webm$/,
    );
    assert.match(probe(webm).format.format_name, /webm/);
    assert.equal(await fallback.locator('#audioFormat').textContent(), 'WEBM');
    await download(
      fallback,
      '#downloadAudio',
      path.join(qa, 'fallback-audio.webm'),
    );
    await fallback.locator('#fileInput').setInputFiles(webm);
    assert.equal(
      await fallback.locator('#downloadLabel').textContent(),
      'Descargar WEBM',
    );
    assert.equal(await fallback.locator('#processFile').count(), 0);
    console.log(
      'PASS native MP4 unavailable: honest WebM, stopping while paused, legacy WebM unchanged',
    );

    const disabledAudio = await newPage();
    await disabledAudio.locator('#saveAudioSeparately').uncheck();
    await disabledAudio.locator('#quality').selectOption('720');
    await start(disabledAudio);
    await delay(1200);
    await disabledAudio.evaluate(() => {
      window.fixtureTrack.stop();
      window.fixtureTrack.dispatchEvent(new Event('ended'));
    });
    await disabledAudio.waitForFunction(
      () => !document.getElementById('downloadOriginal').disabled,
    );
    assert.equal(
      await disabledAudio.locator('#downloadAudio').isDisabled(),
      true,
    );
    const disabledExt = (
      await disabledAudio.locator('#videoFormat').textContent()
    ).toLowerCase();
    const disabledPath = path.join(qa, `audio-option-off.${disabledExt}`);
    await download(disabledAudio, '#downloadOriginal', disabledPath);
    assert.ok(
      probe(disabledPath).streams.some(
        (stream) => stream.codec_type === 'audio',
      ),
    );
    console.log(
      'PASS stopping shared source retains video audio even with separate audio disabled',
    );

    const mp3 = path.join(qa, 'uploaded.mp3');
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      mp3,
    ]);
    await silent.locator('#fileInput').setInputFiles(mp3);
    assert.equal(
      await silent.locator('#downloadLabel').textContent(),
      'Descargar MP3',
    );
    const mp3copy = path.join(qa, 'uploaded-copy.mp3');
    await download(silent, '#downloadOriginal', mp3copy);
    assert.equal(hash(mp3), hash(mp3copy));
    await silent.locator('#fileInput').setInputFiles({
      name: 'empty.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.alloc(0),
    });
    assert.match(await silent.locator('#errorBox').textContent(), /vacío/);
    console.log('PASS existing MP3 preserved and empty files rejected');

    await fallback.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await fallback.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await fallback.evaluate(() => window.scrollTo(0, 0));
    await fallback.screenshot({
      path: path.join(qa, 'mobile.png'),
      fullPage: true,
    });
    await page.locator('#fileInput').setInputFiles(output);
    await page.locator('#themeToggle').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(qa, 'dark.png'), fullPage: true });
    await page.keyboard.press('Tab');
    assert.ok(
      await page.evaluate(() => document.activeElement !== document.body),
    );
    assert.equal(await page.locator('a[href="./LICENSE"]').count(), 1);
    assert.equal(
      (await context.request.get(new URL('LICENSE', base).href)).status(),
      200,
    );

    // Includes initial loading, capture workers, uploads and all downloads.
    assert.ok(
      requests.every((url) => url.startsWith(base)),
      'all resources must stay on the site',
    );
    assert.ok(
      requests.every(
        (url) => !/vendor|ffmpeg|\.wasm|cdn|unpkg|jsdelivr/i.test(url),
      ),
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(qa, 'verification.json'),
      JSON.stringify(
        {
          browser: browser.version(),
          video: {
            codec: video.codec_name,
            audio: audio.codec_name,
            format: extension,
            frames: frames.frames.length,
          },
          separateAudio: audioFormat,
          requests,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS desktop/mobile/dark/keyboard; no FFmpeg, WASM, CDN or third-party requests',
    );
    console.log('QA artifacts: ' + qa);
  } finally {
    if (browser) await browser.close();
    http.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
