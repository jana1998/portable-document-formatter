// Renderer-side orchestration for building/loading the per-page embedding
// index. Opens the PDF (pdfjs), gathers text per page (preferring OCR when
// available), ships pages to main, hydrates the store, and persists a sidecar.

import { PDFRenderer } from '@/services/pdf-renderer';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { OCRResult } from '@renderer/types';

interface PageText {
  pageNumber: number;
  text: string;
}

async function gatherPageTexts(
  renderer: PDFRenderer,
  totalPages: number,
  ocrResults: Map<number, OCRResult>
): Promise<PageText[]> {
  const out: PageText[] = [];
  for (let p = 1; p <= totalPages; p++) {
    const ocr = ocrResults.get(p);
    if (ocr && ocr.text && ocr.text.trim().length > 0) {
      out.push({ pageNumber: p, text: ocr.text });
      continue;
    }

    try {
      const content = await renderer.getTextContent(p);
      const items = (content.items ?? []) as Array<{ str?: string }>;
      const text = items
        .map((i) => (typeof i.str === 'string' ? i.str : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text.length > 0) out.push({ pageNumber: p, text });
    } catch {
      // Page has no text layer; skip. OCR (if run later) will fill the gap.
    }
  }
  return out;
}

export async function ensureEmbeddingsForDocument(pdfPath: string): Promise<void> {
  const store = usePDFStore.getState();
  const doc = store.currentDocument;
  if (!doc || doc.path !== pdfPath) return;

  // Fast path: sidecar present → hydrate and bail.
  try {
    const sidecar = await window.electronAPI.loadEmbeddingsSidecar(pdfPath);
    if (sidecar && sidecar.length > 0) {
      store.hydratePageEmbeddings(sidecar);
      return;
    }
  } catch (err) {
    console.warn('embeddings sidecar load failed:', err);
  }

  // Background build. Non-blocking; UI flag in `isIndexingEmbeddings`.
  store.setIsIndexingEmbeddings(true);
  const renderer = new PDFRenderer();

  try {
    const data = await window.electronAPI.readFile(pdfPath);
    const arrayBuffer =
      data instanceof ArrayBuffer
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await renderer.loadDocument(arrayBuffer);

    const total = renderer.getPageCount();
    const pages = await gatherPageTexts(renderer, total, usePDFStore.getState().ocrResults);
    if (pages.length === 0) return;

    const embeddings = await window.electronAPI.embedDocument(pdfPath, pages);
    if (!embeddings || embeddings.length === 0) return;

    store.hydratePageEmbeddings(embeddings);
    try {
      await window.electronAPI.saveEmbeddingsSidecar(pdfPath, embeddings);
    } catch (saveErr) {
      console.warn('embeddings sidecar write failed:', saveErr);
    }
  } catch (err) {
    console.warn('embedding build failed:', err);
  } finally {
    store.setIsIndexingEmbeddings(false);
    await renderer.destroy().catch(() => undefined);
  }
}

function cosine(a: number[], b: number[]): number {
  // MiniLM vectors come back already normalized; dot product suffices,
  // but guard against external callers.
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function rankPagesBySimilarity(
  queryVec: number[],
  pageEmbeddings: Map<number, number[]>,
  topK = 20
): Array<{ pageNumber: number; score: number }> {
  const scored: Array<{ pageNumber: number; score: number }> = [];
  pageEmbeddings.forEach((vec, pageNumber) => {
    scored.push({ pageNumber, score: cosine(queryVec, vec) });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
