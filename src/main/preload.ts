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
  rotatePage: (filePath: string, pageNumber: number, rotation: number, outputPath: string) => ipcRenderer.invoke('pdf:rotatePage', filePath, pageNumber, rotation, outputPath),
  addTextToPDF: (filePath: string, pageNumber: number, text: string, x: number, y: number, options: any, outputPath: string) => ipcRenderer.invoke('pdf:addTextToPDF', filePath, pageNumber, text, x, y, options, outputPath),
  addImageToPDF: (filePath: string, pageNumber: number, imageData: string, x: number, y: number, width: number, height: number, outputPath: string) => ipcRenderer.invoke('pdf:addImageToPDF', filePath, pageNumber, imageData, x, y, width, height, outputPath),
  exportToImage: (filePath: string, pageNumber: number, format: string, dpi: number) => ipcRenderer.invoke('pdf:exportToImage', filePath, pageNumber, format, dpi),
  extractText: (filePath: string) => ipcRenderer.invoke('pdf:extractText', filePath),

  // Annotations
  saveAnnotations: (filePath: string, annotations: any) => ipcRenderer.invoke('annotations:save', filePath, annotations),
  loadAnnotations: (filePath: string) => ipcRenderer.invoke('annotations:load', filePath),

  // Apply all modifications
  applyModifications: (filePath: string, modifications: any, outputPath: string) => ipcRenderer.invoke('pdf:applyModifications', filePath, modifications, outputPath),
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<any>;
      saveFile: (defaultPath: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<Buffer>;
      writeFile: (filePath: string, data: Buffer) => Promise<void>;
      getPDFInfo: (filePath: string) => Promise<any>;
      mergePDFs: (filePaths: string[], outputPath: string) => Promise<void>;
      splitPDF: (filePath: string, pageRanges: number[][], outputDir: string) => Promise<string[]>;
      deletePage: (filePath: string, pageNumber: number, outputPath: string) => Promise<void>;
      extractPages: (filePath: string, pageNumbers: number[], outputPath: string) => Promise<void>;
      rotatePage: (filePath: string, pageNumber: number, rotation: number, outputPath: string) => Promise<void>;
      addTextToPDF: (filePath: string, pageNumber: number, text: string, x: number, y: number, options: any, outputPath: string) => Promise<void>;
      addImageToPDF: (filePath: string, pageNumber: number, imageData: string, x: number, y: number, width: number, height: number, outputPath: string) => Promise<void>;
      exportToImage: (filePath: string, pageNumber: number, format: string, dpi: number) => Promise<string>;
      extractText: (filePath: string) => Promise<string>;
      saveAnnotations: (filePath: string, annotations: any) => Promise<string>;
      loadAnnotations: (filePath: string) => Promise<any>;
      applyModifications: (filePath: string, modifications: any, outputPath: string) => Promise<boolean>;
    };
  }
}
