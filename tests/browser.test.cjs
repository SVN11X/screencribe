const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const qa =
  process.env.SCREENCRIBE_QA_DIR ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'screencribe-qa-'));
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const http = spawn(
    process.env.SCREENCRIBE_PYTHON || 'python',
    ['-m', 'http.server', '5500', '--bind', '127.0.0.1'],
    { cwd: root, stdio: 'ignore' },
  );
  let browser;
  try {
    await delay(700);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: JSON.parse(process.env.SCREENCRIBE_BROWSER_ARGS || '[]'),
      proxy: process.env.SCREENCRIBE_BROWSER_PROXY
        ? JSON.parse(process.env.SCREENCRIBE_BROWSER_PROXY)
        : undefined,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
      colorScheme: 'light',
    });
    // Conversion must work with the bundled core and no external service.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:/.test(url) && !url.startsWith('http://127.0.0.1:5500/'))
        return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5500');
    await page.locator('#quality').selectOption('720');
    await page.locator('input[name="surface"][value="window"]').check();
    await page.evaluate(() => {
      window.fixtureContexts = [];
      function audio(frequency) {
        const ctx = new AudioContext();
        window.fixtureContexts.push(ctx);
        const tone = ctx.createOscillator();
        tone.frequency.value = frequency;
        const dest = ctx.createMediaStreamDestination();
        tone.connect(dest);
        tone.start();
        return dest.stream.getAudioTracks();
      }
      navigator.mediaDevices.getDisplayMedia = async (options) => {
        const generated = new MediaStreamTrackGenerator({ kind: 'video' });
        window.captureFixture = new Worker(
          '/tests/fixtures/capture-source.js',
          { type: 'module' },
        );
        await new Promise((resolve, reject) => {
          setTimeout(
            () => reject(new Error('Fixture worker ready timeout')),
            5000,
          );
          window.captureFixture.onerror = (event) =>
            reject(new Error(event.message));
          window.captureFixture.onmessage = () => resolve();
          window.captureFixture.postMessage(
            { type: 'start', writable: generated.writable },
            [generated.writable],
          );
        });
        return new MediaStream([
          generated,
          ...(options.audio ? audio(440) : []),
        ]);
      };
      navigator.mediaDevices.getUserMedia = async () =>
        new MediaStream(audio(660));
    });
    await page.locator('#startRecording').click();
    await delay(1000);
    await page.waitForFunction(
      () =>
        document
          .getElementById('recordingStatus')
          .textContent.includes('Grabando') ||
        !document.getElementById('errorBox').classList.contains('hidden'),
    );
    assert.equal(await page.locator('#errorBox').isVisible(), false);
    assert.match(
      await page.locator('#captureMeta').textContent(),
      /1280 × 720/,
    );
    console.log('PASS worker stabilization active with mixed audio');
    await delay(650);
    await page.evaluate(() =>
      window.captureFixture.postMessage({
        type: 'resize',
        width: 1920,
        height: 1080,
      }),
    );
    await delay(750);
    const before = await page.locator('#recordingTimer').textContent();
    await page.locator('#pauseRecording').click();
    await delay(1100);
    assert.equal(await page.locator('#recordingTimer').textContent(), before);
    assert.equal(await page.locator('#pausedOverlay').isVisible(), true);
    await page.locator('#pauseRecording').click();
    await page.evaluate(() =>
      window.captureFixture.postMessage({
        type: 'resize',
        width: 500,
        height: 900,
      }),
    );
    await delay(750);
    const background = await context.newPage();
    await background.goto('about:blank');
    await background.bringToFront();
    const visibility = await page.evaluate(() => document.visibilityState);
    console.log(
      'TAB CHECK document.visibilityState=' +
        visibility +
        '; a headless browser may keep tabs visible.',
    );
    await delay(1600);
    await page.bringToFront();
    await background.close();
    await page.locator('#stopRecording').click();
    await page.waitForFunction(
      () => !document.getElementById('sourceInfo').classList.contains('hidden'),
    );
    assert.equal(await page.locator('#wantMp3').isDisabled(), false);
    assert.equal(await page.locator('#errorBox').isVisible(), false);
    const recordingDownload = page.waitForEvent('download');
    await page.locator('#downloadOriginal').click();
    await (await recordingDownload).saveAs(qa + '/resized-window.webm');
    const frames = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_frames',
        '-show_entries',
        'frame=width,height',
        '-of',
        'json',
        qa + '/resized-window.webm',
      ]),
    );
    assert.ok(frames.frames.length >= 20);
    assert.ok(
      frames.frames.every(
        (frame) => frame.width === 1280 && frame.height === 720,
      ),
    );
    const result = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-of',
        'json',
        qa + '/resized-window.webm',
      ]),
    );
    assert.equal(
      result.streams.filter((stream) => stream.codec_type === 'audio').length,
      1,
    );
    console.log(
      'PASS actual recording: fixed 1280x720 across 640x480,1920x1080,500x900; pause/resume; one mixed audio track; ' +
        frames.frames.length +
        ' frames',
    );
    await page.screenshot({ path: qa + '/recorded.png', fullPage: true });
    assert.equal(await page.locator('#openSettings').count(), 0);
    assert.equal(await page.evaluate(() => crossOriginIsolated), false);
    const requests = [];
    page.on('request', (request) =>
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
      }),
    );
    const waitForResult = () =>
      page.waitForFunction(
        () =>
          !document
            .getElementById('resultsSection')
            .classList.contains('hidden') ||
          !document.getElementById('errorBox').classList.contains('hidden'),
        {},
        { timeout: 180000 },
      );
    async function downloadResult(name, target) {
      const event = page.waitForEvent('download');
      const link = page.getByRole('link', { name: `Descargar ${name}` });
      assert.match(await link.getAttribute('href'), /^blob:/);
      await link.click();
      await (await event).saveAs(target);
      return JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          target,
        ]),
      );
    }
    await page.locator('#processFile').click();
    await waitForResult();
    assert.equal(
      await page.locator('#errorBox').isVisible(),
      false,
      await page.locator('#errorBox').textContent(),
    );
    assert.equal(await page.locator('#downloadGrid .download-card').count(), 2);
    const mp3 = await downloadResult('MP3', qa + '/converted.mp3');
    const mp4 = await downloadResult('MP4', qa + '/converted.mp4');
    assert.equal(mp3.streams[0].codec_name, 'mp3');
    assert.equal(mp3.streams[0].sample_rate, '44100');
    assert.equal(mp3.streams[0].channels, 2);
    assert.equal(Number(mp3.streams[0].bit_rate), 192000);
    assert.equal(
      mp4.streams.find((stream) => stream.codec_type === 'video').codec_name,
      'h264',
    );
    assert.equal(
      mp4.streams.find((stream) => stream.codec_type === 'audio').codec_name,
      'aac',
    );
    assert.equal(
      mp4.streams.find((stream) => stream.codec_type === 'video').width,
      1280,
    );
    assert.equal(
      mp4.streams.find((stream) => stream.codec_type === 'video').height,
      720,
    );
    const convertedVideo = mp4.streams.find(
      (stream) => stream.codec_type === 'video',
    );
    assert.ok(
      Number(convertedVideo.nb_frames) <=
        Math.ceil(Number(convertedVideo.duration) * 60) + 2,
    );
    console.log(
      'PASS actual local MP4 H.264/AAC + MP3 192 kbps; no backend or isolation headers',
    );
    await page.screenshot({ path: qa + '/results.png', fullPage: true });
    const resultUrl = await page
      .getByRole('link', { name: 'Descargar MP3' })
      .getAttribute('href');
    await page.locator('#deleteResults').click();
    assert.equal(await page.locator('#resultsSection').isVisible(), false);
    assert.equal(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return true;
        } catch {
          return false;
        }
      }, resultUrl),
      false,
    );
    console.log('PASS removing results revokes local download URLs');
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/assets/vendor/ffmpeg/index.js');
      const engine = new FFmpeg();
      try {
        await engine.load();
        const data = new Uint8Array(3 * 1024 * 1024 + 17);
        for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 251;
        const expected = await crypto.subtle.digest('SHA-256', data);
        await engine.writeFile('chunks.bin', data);
        const blob = await engine.readFileAsBlob(
          'chunks.bin',
          'application/octet-stream',
        );
        const actual = await crypto.subtle.digest(
          'SHA-256',
          await blob.arrayBuffer(),
        );
        if (
          blob.size !== 3 * 1024 * 1024 + 17 ||
          blob.type !== 'application/octet-stream' ||
          new Uint8Array(expected).some(
            (byte, i) => byte !== new Uint8Array(actual)[i],
          )
        )
          throw new Error('Chunked output differs from original data');
      } finally {
        engine.terminate();
      }
    });
    console.log(
      'PASS bounded-chunk Blob output preserves all bytes across chunk boundaries',
    );
    const remote = requests.filter(
      (request) =>
        /^https?:/.test(request.url) &&
        !request.url.startsWith('http://127.0.0.1:5500/'),
    );
    assert.equal(remote.length, 0);
    assert.ok(
      requests.some((request) =>
        request.url.endsWith('/assets/vendor/ffmpeg-core/ffmpeg-core.wasm'),
      ),
    );
    assert.ok(
      requests.every((request) => request.method === 'GET' && !request.body),
    );
    console.log(
      'PASS MP4/MP3 conversion with external connections blocked; all requests are same-origin GETs',
    );
    // Cached resources work for new workers without another core request.
    await page.route('**/assets/vendor/ffmpeg-core/*', (route) =>
      route.abort(),
    );
    await page.locator('#uploadTab').click();
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '0.5',
      qa + '/voice.wav',
    ]);
    await page.locator('#fileInput').setInputFiles(qa + '/voice.wav');
    assert.equal(await page.locator('#wantMp4').isDisabled(), true);
    assert.equal(await page.locator('#wantMp3').isChecked(), true);
    assert.equal(await page.locator('#audioStage').isVisible(), true);
    await page.locator('#processFile').click();
    await waitForResult();
    assert.equal(
      await page.locator('#errorBox').isVisible(),
      false,
      await page.locator('#errorBox').textContent(),
    );
    assert.equal(await page.locator('#downloadGrid .download-card').count(), 1);
    await downloadResult('MP3', qa + '/voice.mp3');
    console.log(
      'PASS audio-only WAV to real MP3; engine resources reused with new core requests blocked',
    );

    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=321x241:rate=12',
      '-t',
      '0.8',
      '-c:v',
      'libvpx',
      '-pix_fmt',
      'yuv420p',
      '-an',
      qa + '/silent.webm',
    ]);
    await page.locator('#fileInput').setInputFiles(qa + '/silent.webm');
    await page.locator('#processFile').click();
    await waitForResult();
    assert.equal(
      await page.locator('#errorBox').isVisible(),
      false,
      await page.locator('#errorBox').textContent(),
    );
    assert.equal(await page.locator('#downloadGrid .download-card').count(), 1);
    assert.match(
      await page.locator('#resultWarnings').textContent(),
      /no tiene audio/,
    );
    const silent = await downloadResult('MP4', qa + '/silent.mp4');
    const silentVideo = silent.streams.find(
      (stream) => stream.codec_type === 'video',
    );
    assert.equal(silentVideo.width, 320);
    assert.equal(silentVideo.height, 240);
    assert.equal(
      silent.streams.filter((stream) => stream.codec_type === 'audio').length,
      0,
    );
    console.log(
      'PASS odd dimensions become even; silent video produces MP4 and explains missing MP3',
    );

    // A valid short MP4 plus a seekable 64-bit `free` atom crosses the old
    // 200 MB and conventional 2 GB boundaries without copying the full input.
    for (const size of [2 * 1024 ** 3, 8 * 1024 ** 3]) {
      const inputSize = await page.evaluate(
        ({ base, size }) => {
          const header = new Uint8Array(16);
          new DataView(header.buffer).setUint32(0, 1);
          header.set([102, 114, 101, 101], 4); // MP4 `free` atom
          new DataView(header.buffer).setBigUint64(
            8,
            BigInt(size - base.length),
          );
          const fill = size - base.length - header.length;
          const chunk = new Blob([new Uint8Array(1024 * 1024)]);
          const file = new File(
            [
              Uint8Array.from(base),
              header,
              ...Array(Math.floor(fill / chunk.size)).fill(chunk),
              chunk.slice(0, fill % chunk.size),
            ],
            'large-valid.mp4',
            { type: 'video/mp4' },
          );
          const data = new DataTransfer();
          data.items.add(file);
          const input = document.getElementById('fileInput');
          input.files = data.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return file.size;
        },
        { base: [...fs.readFileSync(qa + '/silent.mp4')], size },
      );
      assert.equal(inputSize, size);
      await page.locator('#processFile').click();
      await waitForResult();
      assert.equal(
        await page.locator('#errorBox').isVisible(),
        false,
        await page.locator('#errorBox').textContent(),
      );
      const converted = await downloadResult(
        'MP4',
        qa + '/large-' + size + '.mp4',
      );
      const video = converted.streams.find(
        (stream) => stream.codec_type === 'video',
      );
      assert.equal(video.width, 320);
      assert.equal(video.height, 240);
      assert.ok(Number(converted.format.duration) > 0.5);
      console.log(
        'PASS valid ' +
          inputSize +
          '-byte input converts through WORKERFS; padding is not long-duration media',
      );
    }

    await page.locator('#fileInput').setInputFiles(qa + '/resized-window.webm');
    await page.locator('#processFile').click();
    await page.waitForFunction(
      () =>
        document
          .getElementById('progressTitle')
          .textContent.includes('Creando MP4'),
      {},
      { timeout: 60000 },
    );
    await page.locator('#cancelJob').click();
    await page.waitForFunction(
      () =>
        document.getElementById('progressTitle').textContent ===
        'Conversión cancelada',
    );
    assert.equal(await page.locator('#clearSource').isDisabled(), false);
    assert.equal(await page.locator('#downloadOriginal').isDisabled(), false);
    assert.equal(await page.locator('#resultsSection').isVisible(), false);
    await page.locator('#fileInput').setInputFiles(qa + '/voice.wav');
    await page.locator('#processFile').click();
    await waitForResult();
    assert.equal(await page.locator('#errorBox').isVisible(), false);
    assert.equal(await page.locator('#downloadGrid .download-card').count(), 1);
    console.log(
      'PASS cancellation terminates the conversion worker, keeps original and allows a new conversion',
    );

    await page.locator('#fileInput').setInputFiles({
      name: 'broken.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a real video'),
    });
    await page.locator('#processFile').click();
    await waitForResult();
    assert.equal(await page.locator('#errorBox').isVisible(), true);
    assert.match(
      await page.locator('#errorBox').textContent(),
      /leer el archivo/,
    );
    assert.equal(await page.locator('#downloadOriginal').isDisabled(), false);
    console.log('PASS corrupt input reports error and retains original');

    // A fresh page has not downloaded the core yet: verify failure and cancellation.
    const failure = await context.newPage();
    await failure.goto('http://127.0.0.1:5500');
    await failure.route('**/assets/vendor/ffmpeg-core/*', (route) =>
      route.fulfill({ status: 503, body: 'unavailable' }),
    );
    await failure.locator('#fileInput').setInputFiles(qa + '/voice.wav');
    await failure.locator('#processFile').click();
    await failure.waitForFunction(
      () => !document.getElementById('errorBox').classList.contains('hidden'),
    );
    assert.match(
      await failure.locator('#errorBox').textContent(),
      /cargar el motor|cargar el conversor/,
    );
    assert.equal(await failure.locator('#processFile').isDisabled(), false);
    await failure.unroute('**/assets/vendor/ffmpeg-core/*');
    await failure.route('**/assets/vendor/ffmpeg-core/*', async (route) => {
      await delay(1500);
      await route.abort().catch(() => {});
    });
    await failure.locator('#processFile').click();
    await failure.locator('#cancelJob').click();
    await failure.waitForFunction(
      () =>
        document.getElementById('progressTitle').textContent ===
        'Conversión cancelada',
    );
    assert.equal(
      await failure.locator('#downloadOriginal').isDisabled(),
      false,
    );
    await failure.close();
    console.log(
      'PASS missing bundled core and cancellation during automatic loading keep input and restore controls',
    );

    await page.locator('#clearSource').click();
    assert.equal(await page.locator('#processFile').isDisabled(), true);
    await page.locator('#fileInput').setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bad'),
    });
    assert.equal(await page.locator('#errorBox').isVisible(), true);
    console.log('PASS invalid file feedback and reset');
    await page.locator('#recordTab').click();
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('denied', 'NotAllowedError');
      };
    });
    await page.locator('#startRecording').click();
    await page.waitForFunction(() =>
      document
        .getElementById('recordingStatus')
        .textContent.includes('Grabando'),
    );
    assert.match(await page.locator('#noticeBox').textContent(), /micrófono/);
    await page.waitForFunction(
      () => document.getElementById('videoPreview').videoWidth > 0,
    );
    await delay(800);
    await page.locator('#stopRecording').click();
    await page.waitForFunction(
      () => !document.getElementById('sourceInfo').classList.contains('hidden'),
    );
    console.log('PASS denied microphone still records shared video and audio');
    await page.locator('#clearSource').click();
    await page.evaluate(() => {
      window.MediaStreamTrackProcessor = undefined;
    });
    await page.locator('#includeMic').uncheck();
    await page.locator('#includeSystemAudio').uncheck();
    await page.locator('#startRecording').click();
    await page.waitForFunction(() =>
      document
        .getElementById('recordingStatus')
        .textContent.includes('Grabando'),
    );
    assert.match(
      await page.locator('#noticeBox').textContent(),
      /ajuste estable/,
    );
    await page.waitForFunction(
      () => document.getElementById('videoPreview').videoWidth > 0,
    );
    await delay(800);
    await page.locator('#stopRecording').click();
    await page.waitForFunction(
      () => !document.getElementById('sourceInfo').classList.contains('hidden'),
    );
    assert.equal(await page.locator('#wantMp3').isDisabled(), true);
    assert.equal(await page.locator('#wantMp4').isDisabled(), false);
    console.log(
      'PASS unsupported stabilization falls back; silent capture disables MP3',
    );
    await page.locator('#clearSource').click();
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException('denied', 'NotAllowedError');
      };
    });
    await page.locator('#startRecording').click();
    await page.waitForFunction(
      () => !document.getElementById('errorBox').classList.contains('hidden'),
    );
    assert.equal(await page.locator('#startRecording').isDisabled(), false);
    console.log('PASS cancelled screen permission restores start control');

    await page.locator('#recordTab').click();
    await page.locator('#uploadTab').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(
      await page.locator('#recordTab').getAttribute('aria-selected'),
      'true',
    );
    console.log('PASS keyboard tabs');
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
        'overflow at ' + width,
      );
    }
    assert.deepEqual(errors, []);
    if (process.env.SCREENCRIBE_QA_DIR) {
      await page.reload();
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.evaluate(() => document.activeElement?.blur());
      await page.screenshot({ path: qa + '/escritorio.png', fullPage: true });
      await page.locator('#themeToggle').click();
      await delay(400);
      await page.screenshot({ path: qa + '/tema-oscuro.png', fullPage: true });
      await page.locator('#themeToggle').click();
      await page.setViewportSize({ width: 390, height: 844 });
      await delay(400);
      await page.screenshot({ path: qa + '/movil.png', fullPage: true });
    }
    console.log('PASS no JS errors; responsive widths 320–1440');
    await page.evaluate(() => {
      window.captureFixture?.terminate();
      window.fixtureContexts?.forEach((ctx) => ctx.close());
    });
  } finally {
    await browser?.close();
    http.kill('SIGTERM');
    if (!process.env.SCREENCRIBE_QA_DIR)
      fs.rmSync(qa, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
