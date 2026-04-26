import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PDFService } from './services/pdf-service';
import { FileService } from './services/file-service';
import { OCRService } from './services/ocr-service';
import { LLMService, type LLMGenerateOptions } from './services/llm-service';
import { companionConfigStore } from './services/companion-config';
import { companionServer } from './services/companion-server';
import { locateTextEdit } from './services/text-editing';

let mainWindow: BrowserWindow | null = null;
const pdfService = new PDFService();
const fileService = new FileService();
const ocrService = new OCRService();
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

app.whenReady().then(async () => {
  createWindow();
  setupIPCHandlers();

  // Auto-start companion server if previously enabled.
  try {
    const config = await companionConfigStore.load();
    if (config.enabled && config.libraryPath) {
      await companionServer.start({ pdfService, fileService });
    }
  } catch (error) {
    console.error('Companion auto-start failed:', error);
  }

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

  ipcMain.handle('pdf:bakeTextEdits', async (_, filePath: string, textEdits: any[], engineMode = 'auto') => {
    const { bytes, outcomes } = await pdfService.bakeTextEdits(filePath, textEdits, engineMode as 'auto' | 'strict' | 'legacy-only');
    // ipcMain.handle serializes Buffers transparently; renderer receives Uint8Array for bytes.
    return { bytes, outcomes };
  });

  // Phase 4a read-only locator: map a structured-text line to the content
  // stream operator that produced it. Used by the renderer to log diagnostics
  // before the editing engine ships in Phase 4b.
  ipcMain.handle(
    'pdf:locateTextEdit',
    async (
      _,
      filePath: string,
      pageNumber: number,
      target: { bbox: { x: number; y: number; w: number; h: number }; text: string; fontSize?: number }
    ) => {
      try {
        return await locateTextEdit(filePath, pageNumber, target);
      } catch (err) {
        console.warn('[locateTextEdit] failed:', err);
        return null;
      }
    }
  );

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

  ipcMain.handle(
    'dialog:saveTextFile',
    async (_, defaultPath: string, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showSaveDialog({ defaultPath, filters });
      return result.canceled ? null : result.filePath;
    }
  );

  ipcMain.handle('file:writeText', async (_, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('ocr:exportPDF', async (_, outputPath: string, text: string) => {
    const { PDFDocument: LibDoc, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await LibDoc.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const margin = 50;
    const lineHeight = fontSize * 1.4;
    const pageWidth = 595;
    const pageHeight = 842;
    const lines = wrapText(text, font, fontSize, pageWidth - margin * 2);
    let y = pageHeight - margin;
    let page = doc.addPage([pageWidth, pageHeight]);
    for (const line of lines) {
      if (y < margin) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, font, size: fontSize, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
    const bytes = await doc.save();
    await fs.writeFile(outputPath, bytes);
  });

  // LLM —
  ipcMain.handle('llm:generate', async (event, prompt: string, options: LLMGenerateOptions) => {
    return llmService.generate(event.sender, prompt, options ?? {});
  });

  ipcMain.handle('llm:cancel', async () => {
    llmService.cancelCurrent();
    return true;
  });

  // Mobile companion — desktop hosts an HTTP server so a phone on the same LAN
  // can use the renderer remotely. v1 supports view + annotate + save.
  ipcMain.handle('companion:status', async () => {
    const config = await companionConfigStore.load();
    const port = companionServer.getActivePort() ?? config.port;
    return {
      enabled: config.enabled,
      running: companionServer.isRunning(),
      port,
      token: config.token,
      libraryPath: config.libraryPath,
      lanUrls: companionConfigStore.getLanUrls(port),
    };
  });

  ipcMain.handle('companion:enable', async () => {
    const config = await companionConfigStore.load();
    if (!config.libraryPath) throw new Error('Library folder not selected');
    if (!companionServer.isRunning()) {
      await companionServer.start({ pdfService, fileService });
    }
    await companionConfigStore.save({ enabled: true });
    const port = companionServer.getActivePort()!;
    return {
      port,
      token: config.token,
      libraryPath: config.libraryPath,
      lanUrls: companionConfigStore.getLanUrls(port),
    };
  });

  ipcMain.handle('companion:disable', async () => {
    await companionServer.stop();
    await companionConfigStore.save({ enabled: false });
    // Rotate token on disable so any leaked QR/token can't reattach later.
    await companionConfigStore.rotateToken();
    return true;
  });

  ipcMain.handle('companion:rotateToken', async () => {
    const next = await companionConfigStore.rotateToken();
    return { token: next.token };
  });

  ipcMain.handle('companion:pickLibrary', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Companion library folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const libraryPath = result.filePaths[0];
    await companionConfigStore.save({ libraryPath });
    return libraryPath;
  });

  ipcMain.handle('companion:getLanUrls', async () => {
    const config = await companionConfigStore.load();
    const port = companionServer.getActivePort() ?? config.port;
    return companionConfigStore.getLanUrls(port);
  });
}

app.on('before-quit', () => {
  companionServer.stop().catch(() => undefined);
  ocrService.shutdown().catch(() => undefined);
  llmService.cancelCurrent();
  llmService.shutdown().catch(() => undefined);
});

function wrapText(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, fontSize: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    out.push(current);
  }
  return out;
}

