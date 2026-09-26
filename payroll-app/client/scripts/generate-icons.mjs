/**
 * PWA アイコン生成スクリプト
 *
 * public/logo-icon.svg から以下を生成する:
 *   - logo-icon-192.png      (192x192, purpose: any)
 *   - logo-icon-512.png      (512x512, purpose: any)
 *   - logo-icon-maskable.png (512x512, purpose: maskable —
 *     全面ベタ塗り背景 + セーフゾーン(80%)内にロゴを配置)
 *
 * 実行: node scripts/generate-icons.mjs
 * アイコンデザイン変更時に再実行して public/ の PNG を更新する。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const svg = readFileSync(resolve(publicDir, 'logo-icon.svg'), 'utf8');

// maskable 用: 角丸を外して全面ベタ塗りにし、中身を 80% に縮小して
// セーフゾーン内に収める（マスク形状でロゴが欠けないように）
const maskableSvg = svg
  .replace('rx="28"', 'rx="0"')
  .replace(
    /<g transform="translate\(34, 30\)">/,
    '<g transform="translate(12.8, 12.8) scale(0.8)"><g transform="translate(34, 30)">',
  )
  .replace(/<\/g>\s*<\/svg>/, '</g></g></svg>');

async function render(input, size, filename) {
  const buf = await sharp(Buffer.from(input), { density: 300 }).resize(size, size).png().toBuffer();
  writeFileSync(resolve(publicDir, filename), buf);
  console.log(`generated ${filename} (${size}x${size}, ${buf.length} bytes)`);
}

await render(svg, 192, 'logo-icon-192.png');
await render(svg, 512, 'logo-icon-512.png');
await render(maskableSvg, 512, 'logo-icon-maskable.png');
