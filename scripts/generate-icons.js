import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const svgPath = path.join(here, 'logo.svg');
const outDir = path.join(root, 'public', 'icons');

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
];

await mkdir(outDir, { recursive: true });

for (const { file, size } of targets) {
  await sharp(svgPath).resize(size, size).png().toFile(path.join(outDir, file));
}

// Maskable icon needs the artwork inset so it survives the safe-zone crop.
await sharp(svgPath)
  .resize(320, 320)
  .extend({ top: 96, bottom: 96, left: 96, right: 96, background: '#0f2c50' })
  .png()
  .toFile(path.join(outDir, 'icon-maskable-512.png'));

console.log('Icons generated in public/icons');
