import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Bundle the worker with the renderer so packaged Electron builds do not rely on a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export class PDFRenderer {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private renderTasks: Map<number, pdfjsLib.RenderTask> = new Map();

  async loadDocument(data: ArrayBuffer): Promise<void> {
    try {
      const loadingTask = pdfjsLib.getDocument({ data });
      this.pdfDocument = await loadingTask.promise;
    } catch (error) {
      throw new Error(`Failed to load PDF document: ${error}`);
    }
  }

  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
    rotation: number = 0
  ): Promise<void> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    try {
      // Cancel any existing render task for this page
      const existingTask = this.renderTasks.get(pageNumber);
      if (existingTask) {
        existingTask.cancel();
        this.renderTasks.delete(pageNumber);
      }

      const page = await this.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale, rotation });

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // Support high DPI displays
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: context,
        viewport,
        transform: transform as any,
      };

      const renderTask = page.render(renderContext);
      this.renderTasks.set(pageNumber, renderTask);

      await renderTask.promise;
      this.renderTasks.delete(pageNumber);
    } catch (error: any) {
      if (error.name === 'RenderingCancelledException') {
        console.log(`Rendering cancelled for page ${pageNumber}`);
      } else {
        throw new Error(`Failed to render page ${pageNumber}: ${error}`);
      }
    }
  }

  async getPageDimensions(pageNumber: number, scale: number = 1.0): Promise<{ width: number; height: number }> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    return {
      width: viewport.width,
      height: viewport.height,
    };
  }

  async getTextContent(pageNumber: number): Promise<any> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    const page = await this.pdfDocument.getPage(pageNumber);
    return await page.getTextContent();
  }

  async searchText(query: string, pageNumber?: number): Promise<any[]> {
    if (!this.pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    const results: any[] = [];
    const startPage = pageNumber || 1;
    const endPage = pageNumber || this.pdfDocument.numPages;

    for (let i = startPage; i <= endPage; i++) {
      const page = await this.pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });

      // Search through each text item
      textContent.items.forEach((item: any) => {
        if (!item.str) return;

        const regex = new RegExp(query, 'gi');
        let match;

        while ((match = regex.exec(item.str)) !== null) {
          // Get position from transform matrix
          const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
          const x = transform[4];
          const y = viewport.height - transform[5]; // Flip Y coordinate

          // Estimate width and height
          const fontSize = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]);
          const width = item.width || match[0].length * fontSize * 0.5;
          const height = item.height || fontSize;

          results.push({
            pageNumber: i,
            matchIndex: match.index,
            text: match[0],
            position: {
              x,
              y: y - height, // Adjust for text baseline
              width,
              height,
            },
          });
        }
      });
    }

    return results;
  }

  getPageCount(): number {
    return this.pdfDocument?.numPages || 0;
  }

  async destroy(): Promise<void> {
    // Cancel all render tasks
    this.renderTasks.forEach((task) => task.cancel());
    this.renderTasks.clear();

    if (this.pdfDocument) {
      await this.pdfDocument.destroy();
      this.pdfDocument = null;
    }
  }
}
