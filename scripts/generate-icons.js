import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const svgPath = join(rootDir, 'packages', 'web', 'public', 'icon.svg');
const outDir = join(rootDir, 'packages', 'web', 'public');

const sizes = [
  { size: 16,  name: 'favicon-16.png' },
  { size: 32,  name: 'favicon-32.png' },
  { size: 48,  name: 'favicon-48.png' },
  { size: 96,  name: 'icon-96.png' },
  { size: 128, name: 'icon-128.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 256, name: 'icon-256.png' },
  { size: 512, name: 'icon-512.png' },
];

for (const { size, name } of sizes) {
  const outPath = join(outDir, name);
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`Generated ${name} (${size}x${size})`);
}

console.log('All PNG sizes generated successfully.');
