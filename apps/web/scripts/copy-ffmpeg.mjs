import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(currentDir, '..');
const rootDir = join(appDir, '..', '..');
const source = join(rootDir, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const target = join(appDir, 'public', 'ffmpeg');

await mkdir(target, { recursive: true });
for (const filename of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(join(source, filename), join(target, filename));
}

console.log('FFmpeg core copiado a public/ffmpeg.');
