import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use ipcRenderer
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultPath: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, data: Buffer) => ipcRenderer.invoke('file:write', filePath, data),

  // PDF operations
  getPDFInfo: (filePath: string) => ipcRenderer.invoke('pdf:getInfo', filePath),
  mergePDFs: (filePaths: string[], outputPath: string) => ipcRenderer.invoke('pdf:mergePDFs', filePaths, outputPath),
  splitPDF: (filePath: string, pageRanges: number[][], outputDir: string) => ipcRenderer.invoke('pdf:splitPDF', filePath, pageRanges, outputDir),
  deletePage: (filePath: string, pageNumber: number, outputPath: string) => ipcRenderer.invoke('pdf:deletePage', filePath, pageNumber, outputPath),
  extractPages: (filePath: string, pageNumbers: number[], outputPath: string) => ipcRenderer.invoke('pdf:extractPages', filePath, pageNumbers, outputPath),
  reorderPages: (filePath: string, newPageOrder: number[], outputPath: string) => ipcRenderer.invoke('pdf:reorderPages', filePath, newPageOrder, outputPath),
  rotatePage: (filePath: string, pageNumber: number, rotation: number, outputPath: string) => ipcRenderer.invoke('pdf:rotatePage', filePath, pageNumber, rotation, outputPath),
  addTextToPDF: (filePath: string, pageNumber: number, text: string, x: number, y: number, options: any, outputPath: string) => ipcRenderer.invoke('pdf:addTextToPDF', filePath, pageNumber, text, x, y, options, outputPath),
  addImageToPDF: (filePath: string, pageNumber: number, imageData: string, x: number, y: number, width: number, height: number, outputPath: string) => ipcRenderer.invoke('pdf:addImageToPDF', filePath, pageNumber, imageData, x, y, width, height, outputPath),
  exportToImage: (filePath: string, pageNumber: number, format: string, dpi: number) => ipcRenderer.invoke('pdf:exportToImage', filePath, pageNumber, format, dpi),
  extractText: (filePath: string) => ipcRenderer.invoke('pdf:extractText', filePath),

  getPageStructuredText: (filePath: string, pageNumber: number) =>
    ipcRenderer.invoke('pdf:getPageStructuredText', filePath, pageNumber),

  // Annotations
  saveAnnotations: (filePath: string, annotations: any) => ipcRenderer.invoke('annotations:save', filePath, annotations),
  loadAnnotations: (filePath: string) => ipcRenderer.invoke('annotations:load', filePath),

  // Bake committed text edits into a temp PDF and return the modified bytes.
  // The renderer feeds these back into pdf.js so committed edits render natively
  // (matches the original PDF font/spacing) instead of relying on the overlay.
  bakeTextEdits: (filePath: string, textEdits: unknown) =>
    ipcRenderer.invoke('pdf:bakeTextEdits', filePath, textEdits),

  // Phase 4a — locate the content-stream operator(s) producing a given line.
  // Read-only diagnostic; used by TextEditLayer to log which Tj/TJ a click maps to.
  locateTextEdit: (
    filePath: string,
    pageNumber: number,
    target: { bbox: { x: number; y: number; w: number; h: number }; text: string; fontSize?: number }
  ) => ipcRenderer.invoke('pdf:locateTextEdit', filePath, pageNumber, target),

  // Apply all modifications
  applyModifications: (filePath: string, modifications: any, outputPath: string) => ipcRenderer.invoke('pdf:applyModifications', filePath, modifications, outputPath),

  // OCR (PaddleOCR-backed, main-process utilityProcess)
  recognizePageImage: (pageNumber: number, imageBuffer: ArrayBuffer | Uint8Array) =>
    ipcRenderer.invoke('ocr:recognizePageImage', pageNumber, imageBuffer),
  cancelOCR: () => ipcRenderer.invoke('ocr:cancel'),
  saveOCRSidecar: (pdfPath: string, results: unknown) =>
    ipcRenderer.invoke('ocr:saveSidecar', pdfPath, results),
  loadOCRSidecar: (pdfPath: string) => ipcRenderer.invoke('ocr:loadSidecar', pdfPath),
  saveTextFile: (defaultPath: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('dialog:saveTextFile', defaultPath, filters),
  exportOCRPDF: (outputPath: string, text: string) =>
    ipcRenderer.invoke('ocr:exportPDF', outputPath, text),
  writeTextFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:writeText', filePath, content),

  // LLM — local-only backend, streams chunks via on* subscriptions.
  llmGenerate: (prompt: string, options: unknown) =>
    ipcRenderer.invoke('llm:generate', prompt, options),
  llmCancel: () => ipcRenderer.invoke('llm:cancel'),
  onLLMChunk: (cb: (payload: { requestId: string; chunk: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string; chunk: string }) => cb(payload);
    ipcRenderer.on('llm:chunk', handler);
    return () => ipcRenderer.removeListener('llm:chunk', handler);
  },
  onLLMDone: (cb: (payload: { requestId: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string }) => cb(payload);
    ipcRenderer.on('llm:done', handler);
    return () => ipcRenderer.removeListener('llm:done', handler);
  },
  onLLMError: (cb: (payload: { requestId: string; message: string }) => void) => {
    const handler = (_: unknown, payload: { requestId: string; message: string }) => cb(payload);
    ipcRenderer.on('llm:error', handler);
    return () => ipcRenderer.removeListener('llm:error', handler);
  },

  // Mobile companion — control the LAN HTTP server from settings.
  companionStatus: () => ipcRenderer.invoke('companion:status'),
  companionEnable: () => ipcRenderer.invoke('companion:enable'),
  companionDisable: () => ipcRenderer.invoke('companion:disable'),
  companionRotateToken: () => ipcRenderer.invoke('companion:rotateToken'),
  companionPickLibrary: () => ipcRenderer.invoke('companion:pickLibrary'),
  companionGetLanUrls: () => ipcRenderer.invoke('companion:getLanUrls'),
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<any>;
      saveFile: (defaultPath: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<Buffer | Uint8Array>;
      writeFile: (filePath: string, data: Buffer | Uint8Array) => Promise<void>;
      getPDFInfo: (filePath: string) => Promise<any>;
      mergePDFs: (filePaths: string[], outputPath: string) => Promise<void>;
      splitPDF: (filePath: string, pageRanges: number[][], outputDir: string) => Promise<string[]>;
      deletePage: (filePath: string, pageNumber: number, outputPath: string) => Promise<void>;
      extractPages: (filePath: string, pageNumbers: number[], outputPath: string) => Promise<void>;
      reorderPages: (filePath: string, newPageOrder: number[], outputPath: string) => Promise<void>;
      rotatePage: (filePath: string, pageNumber: number, rotation: number, outputPath: string) => Promise<void>;
      addTextToPDF: (filePath: string, pageNumber: number, text: string, x: number, y: number, options: any, outputPath: string) => Promise<void>;
      addImageToPDF: (filePath: string, pageNumber: number, imageData: string, x: number, y: number, width: number, height: number, outputPath: string) => Promise<void>;
      exportToImage: (filePath: string, pageNumber: number, format: string, dpi: number) => Promise<string>;
      extractText: (filePath: string) => Promise<string>;
      getPageStructuredText: (filePath: string, pageNumber: number) => Promise<{
        text: string;
        bbox: { x: number; y: number; w: number; h: number };
        font: { name: string; family: string; weight: string; style: string; size: number };
        color: string;
      }[]>;
      saveAnnotations: (filePath: string, annotations: any) => Promise<string>;
      loadAnnotations: (filePath: string) => Promise<any>;
      bakeTextEdits: (filePath: string, textEdits: unknown) => Promise<Uint8Array>;
      locateTextEdit: (
        filePath: string,
        pageNumber: number,
        target: { bbox: { x: number; y: number; w: number; h: number }; text: string; fontSize?: number }
      ) => Promise<{
        runs: Array<{
          text: string;
          operator: 'Tj' | 'TJ' | "'" | '"';
          opStart: number;
          opEnd: number;
          operandStart?: number;
          operandEnd?: number;
          isHex?: boolean;
          fontResourceName: string;
          fontSize: number;
          fillColor: { r: number; g: number; b: number };
          strokeColor: { r: number; g: number; b: number };
          inXObject: boolean;
          tjArray?: Array<
            | { kind: 'string'; text: string; operandStart: number; operandEnd: number; isHex: boolean }
            | { kind: 'kern'; value: number }
          >;
        }>;
        confidence: number;
        reason?: string;
        contentStreamSize: number;
        pageWidth: number;
        pageHeight: number;
      } | null>;
      applyModifications: (filePath: string, modifications: any, outputPath: string) => Promise<boolean>;
      recognizePageImage: (
        pageNumber: number,
        imageBuffer: ArrayBuffer | Uint8Array
      ) => Promise<{
        pageNumber: number;
        text: string;
        confidence: number;
        words: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
      cancelOCR: () => Promise<boolean>;
      saveOCRSidecar: (pdfPath: string, results: unknown) => Promise<string>;
      loadOCRSidecar: (pdfPath: string) => Promise<
        Array<{
          pageNumber: number;
          text: string;
          confidence: number;
          words: Array<{
            text: string;
            confidence: number;
            bbox: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }> | null
      >;
      saveTextFile: (
        defaultPath: string,
        filters: { name: string; extensions: string[] }[]
      ) => Promise<string | null>;
      exportOCRPDF: (outputPath: string, text: string) => Promise<void>;
      writeTextFile: (filePath: string, content: string) => Promise<void>;
      llmGenerate: (
        prompt: string,
        options: {
          model?: string;
          temperature?: number;
          maxTokens?: number;
          system?: string;
        }
      ) => Promise<{ requestId: string }>;
      llmCancel: () => Promise<boolean>;
      onLLMChunk: (
        cb: (payload: { requestId: string; chunk: string }) => void
      ) => () => void;
      onLLMDone: (cb: (payload: { requestId: string }) => void) => () => void;
      onLLMError: (
        cb: (payload: { requestId: string; message: string }) => void
      ) => () => void;
      companionStatus: () => Promise<{
        enabled: boolean;
        running: boolean;
        port: number;
        token: string;
        libraryPath: string | null;
        lanUrls: { iface: string; url: string }[];
      }>;
      companionEnable: () => Promise<{
        port: number;
        token: string;
        libraryPath: string;
        lanUrls: { iface: string; url: string }[];
      }>;
      companionDisable: () => Promise<boolean>;
      companionRotateToken: () => Promise<{ token: string }>;
      companionPickLibrary: () => Promise<string | null>;
      companionGetLanUrls: () => Promise<{ iface: string; url: string }[]>;
      companionMode?: boolean;
    };
  }
}
