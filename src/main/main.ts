import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PDFService } from './services/pdf-service';
import { FileService } from './services/file-service';
import { MarkItDownService } from './services/markitdown-service';

let mainWindow: BrowserWindow | null = null;
const pdfService = new PDFService();
const fileService = new FileService();
const markItDownService = new MarkItDownService();

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

  // Start MarkItDown service
  try {
    await markItDownService.start();
    console.log('[Main] MarkItDown service started successfully');
  } catch (error) {
    console.error('[Main] Failed to start MarkItDown service:', error);
    // Continue without MarkItDown - app can still work with Tesseract fallback
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

app.on('before-quit', async (event) => {
  // Prevent quit until cleanup is done
  if (markItDownService.isServiceRunning()) {
    event.preventDefault();
    console.log('[Main] Shutting down MarkItDown service...');

    try {
      await markItDownService.stop();
      console.log('[Main] MarkItDown service stopped successfully');
    } catch (error) {
      console.error('[Main] Error stopping MarkItDown service:', error);
    } finally {
      // Now allow quit
      app.exit();
    }
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

  // MarkItDown operations
  ipcMain.handle('document:convert', async (_, request: { filePath: string; fileType?: string; options?: any }) => {
    try {
      if (!markItDownService.isServiceRunning()) {
        throw new Error('MarkItDown service is not running');
      }

      const result = await markItDownService.convertDocument(request);
      return result;
    } catch (error) {
      console.error('Document conversion error:', error);
      return {
        success: false,
        markdown: '',
        error: String(error),
      };
    }
  });

  ipcMain.handle('markitdown:health', async () => {
    try {
      const status = markItDownService.getStatus();
      const health = markItDownService.getHealthStatus();

      return {
        ...status,
        health,
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        isRunning: false,
        port: 0,
        uptime: 0,
        restartAttempts: 0,
        health: null,
        error: String(error),
      };
    }
  });
}
