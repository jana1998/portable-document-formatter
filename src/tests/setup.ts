import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver (needed by Radix UI components)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock HTMLCanvasElement.getContext (skipped under Node-environment tests)
if (typeof HTMLCanvasElement !== 'undefined') {
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
});
}

// Mock Electron API (only in browser-like environments)
if (typeof window !== 'undefined') {
(global.window as any).electronAPI = {
  openFile: vi.fn(),
  saveFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  getPDFInfo: vi.fn(),
  mergePDFs: vi.fn(),
  splitPDF: vi.fn(),
  deletePage: vi.fn(),
  extractPages: vi.fn(),
  rotatePage: vi.fn(),
  addTextToPDF: vi.fn(),
  addImageToPDF: vi.fn(),
  exportToImage: vi.fn(),
  extractText: vi.fn(),
  saveAnnotations: vi.fn(),
  loadAnnotations: vi.fn(),
};
}

// Mock pdf.js
vi.mock('pdfjs-dist', () => ({
  version: '3.11.174',
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 10,
      getPage: vi.fn((pageNum) =>
        Promise.resolve({
          getViewport: vi.fn(() => ({
            width: 600,
            height: 800,
          })),
          render: vi.fn(() => ({
            promise: Promise.resolve(),
            cancel: vi.fn(),
          })),
          getTextContent: vi.fn(() =>
            Promise.resolve({
              items: [{ str: 'Sample text' }],
            })
          ),
        })
      ),
      destroy: vi.fn(() => Promise.resolve()),
    }),
  })),
}));

