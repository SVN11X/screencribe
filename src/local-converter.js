import { FFmpeg } from '../assets/vendor/ffmpeg/index.js';
import { makeConversionPlan } from './conversion-plan.js';
import { formatBytes, safeBaseName } from './exporters.js';

// Pinned, single-thread core: works on GitHub Pages without isolation headers.
// Load the bundled engine from this site's origin, including under a repo subpath.
const CORE_BASE = new URL('../assets/vendor/ffmpeg-core/', import.meta.url);
const LOAD_TIMEOUT_MS = 120_000;

async function downloadResource(url, type, signal, onBytes) {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new Error(
      'No se pudo cargar el motor de conversión. Revisa tu conexión y comprueba que assets/vendor/ffmpeg-core/ esté publicado completo.',
    );
  const total = Number(response.headers.get('content-length'));
  if (!response.body)
    return URL.createObjectURL(
      new Blob([await response.arrayBuffer()], { type }),
    );
  const reader = response.body.getReader();
  const parts = [];
  let loaded = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.byteLength;
      onBytes(loaded, total);
    }
    signal.throwIfAborted();
    return URL.createObjectURL(new Blob(parts, { type }));
  } finally {
    reader.releaseLock();
  }
}

export class LocalConverter {
  #resources = null;
  #engine = null;
  #controller = null;
  #busy = false;

  get supported() {
    return typeof WebAssembly === 'object' && typeof Worker === 'function';
  }

  async #loadResources(signal, onProgress) {
    if (this.#resources) return this.#resources;
    const created = [];
    try {
      const coreURL = await downloadResource(
        new URL('ffmpeg-core.js', CORE_BASE),
        'text/javascript',
        signal,
        () => {},
      );
      created.push(coreURL);
      const wasmURL = await downloadResource(
        new URL('ffmpeg-core.wasm', CORE_BASE),
        'application/wasm',
        signal,
        (loaded, total) => {
          onProgress({
            percent: total > 0 ? Math.min(8, (loaded / total) * 8) : null,
            title: 'Preparando el conversor gratuito',
            message: `Cargando el motor de esta página: ${formatBytes(loaded)}${total > 0 ? ` de ${formatBytes(total)}` : ''}. No necesitas instalar nada.`,
          });
        },
      );
      created.push(wasmURL);
      signal.throwIfAborted();
      this.#resources = { coreURL, wasmURL };
      return this.#resources;
    } catch (error) {
      created.forEach((url) => URL.revokeObjectURL(url));
      throw error;
    }
  }

  async convert(
    file,
    options,
    { signal, onProgress = () => {}, durationSeconds = 0 } = {},
  ) {
    if (this.#busy) throw new Error('Ya hay una conversión en curso.');
    if (!this.supported)
      throw new Error(
        'Este navegador no admite la conversión local. Usa una versión actual de Chrome, Edge o Firefox.',
      );
    if (!file?.size) throw new Error('El archivo está vacío.');
    if (!Number.isSafeInteger(file.size))
      throw new Error(
        'El navegador no puede representar con precisión el tamaño de este archivo.',
      );
    signal?.throwIfAborted();
    this.#busy = true;
    const controller = new AbortController();
    this.#controller = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const engine = new FFmpeg();
    this.#engine = engine;
    controller.signal.addEventListener('abort', () => engine.terminate(), {
      once: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LOAD_TIMEOUT_MS);
    const logs = [];
    engine.on('log', ({ message }) => {
      logs.push(message);
      if (logs.length > 30) logs.shift();
    });
    try {
      onProgress({
        percent: null,
        title: 'Preparando el conversor gratuito',
        message: this.#resources
          ? 'Iniciando la conversión en tu equipo.'
          : 'Cargando el motor incluido en esta página, de unos 31 MB. No necesitas cuentas, pagos ni instalaciones.',
      });
      const resources = await this.#loadResources(
        controller.signal,
        onProgress,
      );
      controller.signal.throwIfAborted();
      await engine.load(resources);
      controller.signal.throwIfAborted();
      clearTimeout(timer);
      onProgress({
        percent: 10,
        title: 'Revisando el archivo',
        message: 'Comprobando las pistas de video y audio en tu navegador.',
      });
      // WORKERFS reads Blob chunks instead of copying the entire input into WASM memory.
      await engine.createDir('/input');
      const mounted = await engine.mount(
        'WORKERFS',
        { files: [new File([file], 'source', { type: file.type })] },
        '/input',
      );
      if (!mounted)
        throw new Error('No se pudo abrir el archivo en el conversor local.');
      const code = await engine.ffprobe(
        [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          '/input/source',
          '-o',
          'probe.json',
        ],
        -1,
      );
      controller.signal.throwIfAborted();
      // Core 0.12.10 can return -1 after a successful ffprobe; validate its JSON too.
      let metadata;
      try {
        metadata = JSON.parse(await engine.readFile('probe.json', 'utf8'));
        if (
          ![0, -1].includes(code) ||
          !metadata.format?.format_name ||
          !metadata.streams?.length
        )
          throw new Error('Invalid probe');
      } catch (error) {
        controller.signal.throwIfAborted();
        throw new Error(
          'No se pudo leer el archivo. Puede estar dañado o usar un formato no compatible.',
        );
      }
      // Successful ffprobe may emit a harmless "Aborted()" in this core.
      // Do not carry it into diagnosis of a later conversion failure.
      logs.length = 0;
      const plan = makeConversionPlan(metadata, options);
      const duration = plan.durationSeconds || durationSeconds;
      const artifacts = [];
      for (let i = 0; i < plan.outputs.length; i++) {
        const output = plan.outputs[i];
        controller.signal.throwIfAborted();
        const start = 15 + (i / plan.outputs.length) * 80;
        let lastProgress = start;
        const title = `Creando ${output.name.toUpperCase()} en tu equipo`;
        const message =
          'Puedes cancelar. Mantén esta página abierta; el tiempo depende del tamaño del archivo y tu computador.';
        const progress = ({ time }) => {
          if (controller.signal.aborted) return;
          const ratio =
            duration > 0
              ? Math.max(0, Math.min(0.99, time / 1_000_000 / duration))
              : null;
          if (ratio !== null)
            lastProgress = Math.max(
              lastProgress,
              start + (ratio / plan.outputs.length) * 80,
            );
          onProgress({
            percent: ratio === null ? null : lastProgress,
            title,
            message,
          });
        };
        engine.on('progress', progress);
        onProgress({ percent: duration > 0 ? start : null, title, message });
        let exitCode;
        try {
          // Large inputs may take longer than 45 minutes. User cancellation
          // terminates the worker; no arbitrary conversion timeout is imposed.
          exitCode = await engine.exec(output.args);
        } finally {
          engine.off('progress', progress);
        }
        controller.signal.throwIfAborted();
        if (exitCode !== 0) {
          plan.warnings.push(
            `No se pudo crear ${output.name.toUpperCase()}. Prueba un archivo más corto o de menor resolución.`,
          );
          continue;
        }
        const blob = await engine.readFileAsBlob(output.path, output.mimeType);
        controller.signal.throwIfAborted();
        if (!blob.size)
          throw new Error('La conversión produjo un archivo vacío.');
        artifacts.push({
          name: output.name,
          filename: `${safeBaseName(file.name)}.${output.name}`,
          blob,
          size: blob.size,
        });
        await engine.deleteFile(output.path);
      }
      if (!artifacts.length)
        throw new Error(
          plan.warnings.join(' ') || 'No se pudo completar la conversión.',
        );
      onProgress({
        percent: 100,
        title: 'Conversión terminada',
        message: 'Descarga los resultados antes de cerrar esta página.',
      });
      return { artifacts, warnings: plan.warnings };
    } catch (error) {
      if (signal?.aborted || (controller.signal.aborted && !timedOut))
        throw new DOMException('Cancelado', 'AbortError');
      if (timedOut)
        throw new Error(
          'La biblioteca tardó demasiado en cargar. Comprueba tu conexión y vuelve a intentarlo.',
        );
      const detail = `${String(error?.message || error)} ${logs.join(' ')}`;
      if (/memory|out of bounds|allocation/i.test(detail))
        throw new Error(
          'El navegador no tiene memoria suficiente para este archivo. Prueba un archivo más pequeño o graba en 720p a 30 fps. El original sigue disponible.',
        );
      if (/fetch|network|import|load/i.test(String(error?.message || error)))
        throw new Error(
          'No se pudo cargar el conversor gratuito. Revisa tu conexión a internet y vuelve a intentarlo.',
        );
      throw error instanceof Error
        ? error
        : new Error(
            'No se pudo convertir el archivo. Prueba un formato compatible como WebM, MP4, MP3 o WAV.',
          );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      engine.terminate();
      this.#engine = null;
      this.#controller = null;
      this.#busy = false;
    }
  }

  dispose() {
    this.#controller?.abort();
    this.#engine?.terminate();
    if (this.#resources)
      Object.values(this.#resources).forEach((url) => URL.revokeObjectURL(url));
    this.#resources = null;
  }
}
