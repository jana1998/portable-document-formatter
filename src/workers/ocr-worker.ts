import { createWorker } from 'tesseract.js';

let worker: any = null;

async function initializeWorker() {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
}

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, data } = e.data;

  try {
    switch (type) {
      case 'recognize': {
        const ocrWorker = await initializeWorker();
        const result = await ocrWorker.recognize(data.imageData);

        self.postMessage({
          type: 'result',
          data: {
            text: result.data.text,
            confidence: result.data.confidence,
            words: result.data.words.map((word: any) => ({
              text: word.text,
              confidence: word.confidence,
              bbox: word.bbox,
            })),
          },
        });
        break;
      }

      case 'terminate': {
        if (worker) {
          await worker.terminate();
          worker = null;
        }
        self.postMessage({ type: 'terminated' });
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      error: error.message,
    });
  }
});
