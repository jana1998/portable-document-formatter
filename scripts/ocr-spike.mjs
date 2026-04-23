#!/usr/bin/env node
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const testImagePath = path.join(os.tmpdir(), 'ocr-spike-test.png');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240">
  <rect width="100%" height="100%" fill="white"/>
  <text x="24" y="60" font-family="Helvetica, Arial" font-size="36" fill="black">Portable Document Formatter</text>
  <text x="24" y="120" font-family="Helvetica, Arial" font-size="28" fill="black">The quick brown fox jumps over the lazy dog.</text>
  <text x="24" y="180" font-family="Helvetica, Arial" font-size="24" fill="black">OCR spike: verifying PaddleOCR via @gutenye/ocr-node</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(testImagePath);
console.log('Test image written to', testImagePath);

const started = Date.now();
const { default: Ocr } = await import('@gutenye/ocr-node');
const ocr = await Ocr.create();
console.log('Ocr.create() took', Date.now() - started, 'ms');

const t = Date.now();
const lines = await ocr.detect(testImagePath);
console.log('\nOCR result (', Date.now() - t, 'ms):');
for (const line of lines) {
  console.log(`  "${line.text}"  mean=${line.mean?.toFixed(3)}`);
}

if (lines.length === 0) {
  console.error('\n[SPIKE FAIL] no lines detected');
  process.exit(1);
}
console.log(`\n[SPIKE PASS] detected ${lines.length} line(s)`);
