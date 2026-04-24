import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PDFService } from './services/pdf-service';
import { FileService } from './services/file-service';
import { OCRService } from './services/ocr-service';
import { EmbeddingsService, type PageTextInput } from './services/embeddings-service';
import { LLMService, type LLMBackend, type LLMGenerateOptions } from './services/llm-service';

let mainWindow: BrowserWindow | null = null;
const pdfService = new PDFService();
const fileService = new FileService();
const ocrService = new OCRService();
const embeddingsService = new EmbeddingsService();
const llmService = new LLMService();

function createWindow() {
  // Determine icon path based on environment
  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../public/icon.svg')
    : path.join(__dirname, '../renderer/icon.svg');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIPCHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIPCHandlers() {
  // File operations
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    return fileService.getFileInfo(filePath);
  });

  ipcMain.handle('dialog:saveFile', async (_, defaultPath: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('file:read', async (_, filePath: string) => {
    return fileService.readFile(filePath);
  });

  ipcMain.handle('file:write', async (_, filePath: string, data: Buffer) => {
    return fileService.writeFile(filePath, data);
  });

  // PDF operations
  ipcMain.handle('pdf:getInfo', async (_, filePath: string) => {
    return pdfService.getDocumentInfo(filePath);
  });

  ipcMain.handle('pdf:mergePDFs', async (_, filePaths: string[], outputPath: string) => {
    return pdfService.mergePDFs(filePaths, outputPath);
  });

  ipcMain.handle('pdf:splitPDF', async (_, filePath: string, pageRanges: number[][], outputDir: string) => {
    return pdfService.splitPDF(filePath, pageRanges, outputDir);
  });

  ipcMain.handle('pdf:deletePage', async (_, filePath: string, pageNumber: number, outputPath: string) => {
    return pdfService.deletePage(filePath, pageNumber, outputPath);
  });

  ipcMain.handle('pdf:extractPages', async (_, filePath: string, pageNumbers: number[], outputPath: string) => {
    return pdfService.extractPages(filePath, pageNumbers, outputPath);
  });

  ipcMain.handle('pdf:reorderPages', async (_, filePath: string, newPageOrder: number[], outputPath: string) => {
    return pdfService.reorderPages(filePath, newPageOrder, outputPath);
  });

  ipcMain.handle('pdf:rotatePage', async (_, filePath: string, pageNumber: number, rotation: number, outputPath: string) => {
    return pdfService.rotatePage(filePath, pageNumber, rotation, outputPath);
  });

  ipcMain.handle('pdf:addTextToPDF', async (_, filePath: string, pageNumber: number, text: string, x: number, y: number, options: any, outputPath: string) => {
    return pdfService.addTextToPDF(filePath, pageNumber, text, x, y, options, outputPath);
  });

  ipcMain.handle('pdf:addImageToPDF', async (_, filePath: string, pageNumber: number, imageData: string, x: number, y: number, width: number, height: number, outputPath: string) => {
    return pdfService.addImageToPDF(filePath, pageNumber, imageData, x, y, width, height, outputPath);
  });

  ipcMain.handle('pdf:exportToImage', async (_, filePath: string, pageNumber: number, format: string, dpi: number) => {
    return pdfService.exportPageToImage(filePath, pageNumber, format, dpi);
  });

  ipcMain.handle('pdf:extractText', async (_, filePath: string) => {
    return pdfService.extractText(filePath);
  });

  ipcMain.handle('pdf:getPageStructuredText', async (_, filePath: string, pageNumber: number) => {
    return pdfService.getPageStructuredText(filePath, pageNumber);
  });

  // Annotations operations
  ipcMain.handle('annotations:save', async (_, filePath: string, annotations: any) => {
    const annotationsPath = filePath.replace('.pdf', '.annotations.json');
    await fs.writeFile(annotationsPath, JSON.stringify(annotations, null, 2));
    return annotationsPath;
  });

  ipcMain.handle('annotations:load', async (_, filePath: string) => {
    const annotationsPath = filePath.replace('.pdf', '.annotations.json');
    try {
      const data = await fs.readFile(annotationsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle('pdf:applyModifications', async (_, filePath: string, modifications: any, outputPath: string) => {
    try {
      await pdfService.applyModificationsToPDF(filePath, modifications, outputPath);
      return true;
    } catch (error) {
      console.error('Apply modifications error:', error);
      throw error;
    }
  });

  // OCR operations — new PaddleOCR-backed pipeline.
  // Renderer rasterizes each page and ships PNG bytes; text-layer short-circuit
  // also lives in the renderer (pdfjs-dist is renderer-only).
  let currentOcrAbort: AbortController | null = null;

  ipcMain.handle(
    'ocr:recognizePageImage',
    async (_, pageNumber: number, imageBuffer: Buffer | Uint8Array) => {
      const bytes = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
      currentOcrAbort?.abort();
      currentOcrAbort = new AbortController();
      try {
        return await ocrService.recognizePageImage(pageNumber, bytes, {
          signal: currentOcrAbort.signal,
        });
      } finally {
        if (currentOcrAbort && !currentOcrAbort.signal.aborted) currentOcrAbort = null;
      }
    }
  );

  ipcMain.handle('ocr:cancel', async () => {
    currentOcrAbort?.abort();
    currentOcrAbort = null;
    return true;
  });

  ipcMain.handle('ocr:saveSidecar', async (_, pdfPath: string, results: any[]) => {
    return ocrService.saveSidecar(pdfPath, results);
  });

  ipcMain.handle('ocr:loadSidecar', async (_, pdfPath: string) => {
    return ocrService.loadSidecar(pdfPath);
  });

  // Embeddings (all-MiniLM-L6-v2 via @huggingface/transformers, utilityProcess)
  ipcMain.handle(
    'embeddings:embedDocument',
    async (_, _pdfPath: string, pages: PageTextInput[]) => {
      return embeddingsService.embedDocument(pages);
    }
  );

  ipcMain.handle('embeddings:embedText', async (_, text: string) => {
    const [vec] = await embeddingsService.embedTexts([text]);
    return vec ?? null;
  });

  ipcMain.handle(
    'embeddings:saveSidecar',
    async (_, pdfPath: string, embeddings: any[]) => {
      return embeddingsService.saveSidecar(pdfPath, embeddings);
    }
  );

  ipcMain.handle('embeddings:loadSidecar', async (_, pdfPath: string) => {
    return embeddingsService.loadSidecar(pdfPath);
  });

  // LLM (Anthropic / OpenAI cloud; local node-llama-cpp scaffolded for v1.1)
  ipcMain.handle('llm:generate', async (event, prompt: string, options: LLMGenerateOptions) => {
    return llmService.generate(event.sender, prompt, options ?? {});
  });

  ipcMain.handle('llm:cancel', async () => {
    llmService.cancelCurrent();
    return true;
  });

  ipcMain.handle('llm:hasApiKey', async (_, backend: 'anthropic' | 'openai') => {
    return llmService.hasApiKey(backend);
  });

  ipcMain.handle(
    'llm:setApiKey',
    async (_, backend: 'anthropic' | 'openai', key: string | null) => {
      await llmService.setApiKey(backend, key);
      return true;
    }
  );

  ipcMain.handle('llm:testBackend', async (_, backend: 'anthropic' | 'openai') => {
    return llmService.testBackend(backend);
  });
}

app.on('before-quit', () => {
  ocrService.shutdown().catch(() => undefined);
  embeddingsService.shutdown().catch(() => undefined);
  llmService.cancelCurrent();
  llmService.shutdown().catch(() => undefined);
});

// TypeScript: LLMBackend is re-exported only for convenience elsewhere.
export type { LLMBackend };
