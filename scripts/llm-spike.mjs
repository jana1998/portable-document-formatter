#!/usr/bin/env node
// Spike: verify @huggingface/transformers can run a small instruct model
// end-to-end with streaming. If this passes we use it for the `local` LLM
// backend; otherwise we fall back to node-llama-cpp.

import { pipeline, TextStreamer } from '@huggingface/transformers';

const MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

console.log('Loading', MODEL, '— first run downloads ~360MB…');
const t0 = Date.now();
const generator = await pipeline('text-generation', MODEL, {
  dtype: 'q4',
});
console.log('Loaded in', Date.now() - t0, 'ms');

const messages = [
  { role: 'system', content: 'You are a concise assistant. Answer in one sentence.' },
  { role: 'user', content: 'What is the capital of France?' },
];

const streamer = new TextStreamer(generator.tokenizer, {
  skip_prompt: true,
  skip_special_tokens: true,
});

const t1 = Date.now();
const output = await generator(messages, {
  max_new_tokens: 80,
  do_sample: false,
  streamer,
});
console.log('\n\n[timing]', Date.now() - t1, 'ms');

const answer = Array.isArray(output) ? output[0] : output;
console.log('[output.generated_text length]', answer?.generated_text?.length ?? 'N/A');
console.log('\n[SPIKE PASS]');
