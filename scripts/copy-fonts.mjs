#!/usr/bin/env bun
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dst = join(root, 'public', 'fonts');

const pairs = [
  ['@fontsource/geist/files/geist-latin-400-normal.woff2',           'geist-400.woff2'],
  ['@fontsource/geist/files/geist-latin-500-normal.woff2',           'geist-500.woff2'],
  ['@fontsource/geist/files/geist-latin-600-normal.woff2',           'geist-600.woff2'],
  ['@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2', 'geist-mono-400.woff2'],
  ['@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2', 'geist-mono-500.woff2'],
  ['@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff2', 'geist-mono-600.woff2'],
];

await mkdir(dst, { recursive: true });

for (const [pkgPath, outName] of pairs) {
  const src = join(root, 'node_modules', pkgPath);
  try { await stat(src); } catch {
    console.error(`copy-fonts: missing source ${src}`);
    process.exit(1);
  }
  await copyFile(src, join(dst, outName));
}
console.log(`copy-fonts: wrote ${pairs.length} files to ${dst}`);
