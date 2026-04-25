#!/usr/bin/env node
// Spike: verify @huggingface/transformers + all-MiniLM-L6-v2 works end-to-end.
// Embeds two sentences, reports cosine similarity, and prints the download
// cache path so we know where models land.

import { pipeline, env } from '@huggingface/transformers';

console.log('cacheDir:', env.cacheDir);
console.log('localModelPath:', env.localModelPath);

const t0 = Date.now();
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
console.log('pipeline() took', Date.now() - t0, 'ms');

async function embed(text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

const t1 = Date.now();
const a = await embed('The quick brown fox jumps over the lazy dog.');
const b = await embed('A fast auburn fox leaps above a sleepy canine.');
const c = await embed('The quarterly earnings report exceeded expectations.');
console.log('three embeddings took', Date.now() - t1, 'ms');

function cos(x, y) {
  let dot = 0;
  for (let i = 0; i < x.length; i++) dot += x[i] * y[i];
  return dot; // already normalized
}

console.log('\nembedding dim:', a.length);
console.log('sim(fox, auburn fox):', cos(a, b).toFixed(4), '(expect high)');
console.log('sim(fox, earnings):  ', cos(a, c).toFixed(4), '(expect low)');

if (a.length !== 384) {
  console.error('[SPIKE FAIL] expected 384-dim vectors');
  process.exit(1);
}
if (cos(a, b) <= cos(a, c)) {
  console.error('[SPIKE FAIL] semantic ranking wrong');
  process.exit(1);
}
console.log('\n[SPIKE PASS]');
