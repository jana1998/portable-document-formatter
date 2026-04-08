import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

// mupdf is an ESM-only package; load it lazily via dynamic import so that
// Node.js CommonJS can consume it. TypeScript cannot statically resolve it
// under moduleResolution:node, so we type it as `any` and rely on runtime
// correctness validated by the mupdf docs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mupdf: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMupdf(): Promise<any> {
  if (_mupdf === null) {
    // Function() trick avoids TypeScript static-import analysis on ESM-only packages
    // while still working correctly at Node.js runtime (dynamic import from CJS).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod: { default?: unknown } = await (new Function('return import("mupdf")')() as Promise<{ default?: unknown }>);
    _mupdf = (mod.default ?? mod) as ReturnType<typeof getMupdf>;
  }
  return _mupdf;
}

export class PDFService {
  async getDocumentInfo(filePath: string) {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();
      const title = pdfDoc.getTitle() || '';
      const author = pdfDoc.getAuthor() || '';
      const subject = pdfDoc.getSubject() || '';

      return {
        pageCount,
        title,
        author,
        subject,
      };
    } catch (error) {
      throw new Error(`Failed to get PDF info: ${error}`);
    }
  }

  async mergePDFs(filePaths: string[], outputPath: string): Promise<void> {
    try {
      const mergedPdf = await PDFDocument.create();

      for (const filePath of filePaths) {
        const pdfBytes = await fs.readFile(filePath);
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      await fs.writeFile(outputPath, mergedPdfBytes);
    } catch (error) {
      throw new Error(`Failed to merge PDFs: ${error}`);
    }
  }

  async splitPDF(filePath: string, pageRanges: number[][], outputDir: string): Promise<string[]> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const outputPaths: string[] = [];

      for (let i = 0; i < pageRanges.length; i++) {
        const newPdf = await PDFDocument.create();
        const range = pageRanges[i];

        for (const pageIndex of range) {
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
          newPdf.addPage(copiedPage);
        }

        const outputPath = `${outputDir}/split_${i + 1}.pdf`;
        const newPdfBytes = await newPdf.save();
        await fs.writeFile(outputPath, newPdfBytes);
        outputPaths.push(outputPath);
      }

      return outputPaths;
    } catch (error) {
      throw new Error(`Failed to split PDF: ${error}`);
    }
  }

  async deletePage(filePath: string, pageNumber: number, outputPath: string): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      pdfDoc.removePage(pageNumber - 1); // Convert to 0-based index

      const pdfBytesModified = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytesModified);
    } catch (error) {
      throw new Error(`Failed to delete page: ${error}`);
    }
  }

  async extractPages(filePath: string, pageNumbers: number[], outputPath: string): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const newPdf = await PDFDocument.create();

      const pageIndices = pageNumbers.map((num) => num - 1); // Convert to 0-based
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      await fs.writeFile(outputPath, newPdfBytes);
    } catch (error) {
      throw new Error(`Failed to extract pages: ${error}`);
    }
  }

  async reorderPages(filePath: string, newPageOrder: number[], outputPath: string): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const newPdf = await PDFDocument.create();

      // Copy pages in the new order (convert to 0-based indices)
      const pageIndices = newPageOrder.map((num) => num - 1);
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      await fs.writeFile(outputPath, newPdfBytes);
    } catch (error) {
      throw new Error(`Failed to reorder pages: ${error}`);
    }
  }

  async rotatePage(filePath: string, pageNumber: number, rotation: number, outputPath: string): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);

      page.setRotation(degrees(rotation));

      const pdfBytesModified = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytesModified);
    } catch (error) {
      throw new Error(`Failed to rotate page: ${error}`);
    }
  }

  async addTextToPDF(
    filePath: string,
    pageNumber: number,
    text: string,
    x: number,
    y: number,
    options: { fontSize?: number; color?: { r: number; g: number; b: number } },
    outputPath: string
  ): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const fontSize = options.fontSize || 12;
      const color = options.color || { r: 0, g: 0, b: 0 };

      page.drawText(text, {
        x,
        y: page.getHeight() - y, // Flip Y coordinate
        size: fontSize,
        font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
      });

      const pdfBytesModified = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytesModified);
    } catch (error) {
      throw new Error(`Failed to add text to PDF: ${error}`);
    }
  }

  async addImageToPDF(
    filePath: string,
    pageNumber: number,
    imageData: string,
    x: number,
    y: number,
    width: number,
    height: number,
    outputPath: string
  ): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);

      // Decode base64 image
      const imageBytes = Buffer.from(imageData.split(',')[1], 'base64');
      let image;

      if (imageData.startsWith('data:image/png')) {
        image = await pdfDoc.embedPng(imageBytes);
      } else if (imageData.startsWith('data:image/jpeg') || imageData.startsWith('data:image/jpg')) {
        image = await pdfDoc.embedJpg(imageBytes);
      } else {
        throw new Error('Unsupported image format');
      }

      page.drawImage(image, {
        x,
        y: page.getHeight() - y - height, // Flip Y coordinate
        width,
        height,
      });

      const pdfBytesModified = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytesModified);
    } catch (error) {
      throw new Error(`Failed to add image to PDF: ${error}`);
    }
  }

  /**
   * Returns structured text for a page using mupdf, including font metrics.
   * Called by the renderer to build the TextEditLayer overlay.
   */
  async getPageStructuredText(
    filePath: string,
    pageNumber: number
  ): Promise<{
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
    font: { name: string; family: string; weight: string; style: string; size: number };
  }[]> {
    const mupdf = await getMupdf();
    const pdfBytes = await fs.readFile(filePath);
    const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf');
    const page = doc.loadPage(pageNumber - 1);
    const json = JSON.parse(page.toStructuredText('preserve-spans').asJSON());

    const lines: {
      text: string;
      bbox: { x: number; y: number; w: number; h: number };
      font: { name: string; family: string; weight: string; style: string; size: number };
    }[] = [];

    for (const block of json.blocks ?? []) {
      if (block.type !== 'text') continue;
      for (const line of block.lines ?? []) {
        if (!line.text || line.text.trim() === '') continue;
        lines.push({
          text: line.text,
          bbox: {
            x: line.bbox.x,
            y: line.bbox.y,
            w: line.bbox.w,
            h: line.bbox.h,
          },
          font: {
            name: line.font?.name ?? 'Helvetica',
            family: line.font?.family ?? 'sans-serif',
            weight: line.font?.weight ?? 'normal',
            style: line.font?.style ?? 'normal',
            size: line.font?.size ?? 12,
          },
        });
      }
    }

    doc.destroy();
    return lines;
  }

  /**
   * Foxit-style text editing: uses mupdf Redaction API to physically remove
   * original text from the PDF content stream, then writes new text in its place.
   * Returns the path to the modified PDF.
   */
  async applyTextEditsToPDF(
    filePath: string,
    textEdits: {
      pageNumber: number;
      originalText: string;
      newText: string;
      mupdfX: number;
      mupdfY: number;
      mupdfW: number;
      mupdfH: number;
      fontSize: number;
    }[],
    outputPath: string
  ): Promise<void> {
    const log = (...args: unknown[]) => console.log('[TextEdits]', ...args);

    log(`applyTextEditsToPDF called: ${textEdits.length} edits`);

    if (textEdits.length === 0) {
      await fs.copyFile(filePath, outputPath);
      return;
    }

    const pdfBytes = await fs.readFile(filePath);
    log(`input PDF size: ${pdfBytes.length} bytes`);

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    } catch (e) {
      log('PDFDocument.load failed:', String(e));
      throw e;
    }
    log(`pdf-lib loaded OK, pages: ${pdfDoc.getPageCount()}`);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const editsByPage = new Map<number, typeof textEdits>();
    for (const edit of textEdits) {
      if (!editsByPage.has(edit.pageNumber)) editsByPage.set(edit.pageNumber, []);
      editsByPage.get(edit.pageNumber)!.push(edit);
    }

    for (const [pageNumber, pageEdits] of editsByPage) {
      const page = pdfDoc.getPage(pageNumber - 1);
      const pageHeight = page.getHeight();
      const pageWidth = page.getWidth();
      log(`page ${pageNumber}: size ${pageWidth}x${pageHeight}, edits: ${pageEdits.length}`);

      for (const edit of pageEdits) {
        if (!edit.newText || edit.newText.trim() === '') {
          log(`  skip empty newText for "${edit.originalText}"`);
          continue;
        }

        const x = edit.mupdfX;
        // mupdf bbox: y is from top-of-page downward. pdf-lib: y is from bottom upward.
        // rectBottom = pdf-lib coordinate of the BOTTOM of the mupdf bbox.
        // pdf-lib drawText places text at the BASELINE, which is ~20% of fontSize
        // above the descender / bottom of the line bbox.
        const rectBottom = pageHeight - (edit.mupdfY + edit.mupdfH);
        const textY = rectBottom + edit.fontSize * 0.2; // shift baseline up from rect bottom
        const w = edit.mupdfW;
        const h = edit.mupdfH;

        log(`  "${edit.originalText}" → "${edit.newText}" x=${x.toFixed(1)} textY=${textY.toFixed(1)} size=${edit.fontSize}`);

        // White rectangle with small margin to fully erase the original text
        page.drawRectangle({ x: x - 1, y: rectBottom - 1, width: w + 6, height: h + 2, color: rgb(1, 1, 1), borderWidth: 0 });
        // Draw replacement text at corrected baseline
        page.drawText(edit.newText, { x, y: textY, size: edit.fontSize, font, color: rgb(0, 0, 0) });
      }
    }

    const outputBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, outputBytes);
    log(`Done: ${outputBytes.length} bytes → ${outputPath}`);
  }

  async exportPageToImage(_filePath: string, _pageNumber: number, _format: string, _dpi: number): Promise<string> {
    // This would require a library like pdf2pic or similar
    // For now, return a placeholder
    throw new Error('Image export not yet implemented - requires additional native dependencies');
  }

  async extractText(_filePath: string): Promise<string> {
    // Text extraction would require pdf-parse or similar
    // For now, return a placeholder
    throw new Error('Text extraction not yet implemented - requires additional dependencies');
  }

  async applyModificationsToPDF(
    filePath: string,
    modifications: {
      textElements: [number, any[]][];
      imageElements: [number, any[]][];
      annotations: [number, any[]][];
      textEdits?: any[];
    },
    outputPath: string
  ): Promise<void> {
    try {
      // If there are text edits, apply them first via mupdf (Foxit-style),
      // then feed the result into pdf-lib for other modifications.
      let sourceFilePath = filePath;
      if (modifications.textEdits && modifications.textEdits.length > 0) {
        const tmpPath = path.join(os.tmpdir(), `pdf-textedit-${Date.now()}.pdf`);
        await this.applyTextEditsToPDF(filePath, modifications.textEdits, tmpPath);
        sourceFilePath = tmpPath;
      }

      const pdfBytes = await fs.readFile(sourceFilePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Data is already in array format from IPC
      const textElementsArray = modifications.textElements;
      const imageElementsArray = modifications.imageElements;
      const annotationsArray = modifications.annotations;

      // Process each page
      for (let pageNum = 0; pageNum < pdfDoc.getPageCount(); pageNum++) {
        const page = pdfDoc.getPage(pageNum);
        const pageNumber = pageNum + 1;
        const pageHeight = page.getHeight();

        // Apply text elements
        const pageTextElements = textElementsArray.find(([pn]) => pn === pageNumber)?.[1] || [];
        for (const element of pageTextElements) {
          page.drawText(element.text, {
            x: element.x,
            y: pageHeight - element.y - element.fontSize, // Flip Y coordinate
            size: element.fontSize,
            font,
            color: rgb(
              parseInt(element.color.slice(1, 3), 16) / 255,
              parseInt(element.color.slice(3, 5), 16) / 255,
              parseInt(element.color.slice(5, 7), 16) / 255
            ),
          });
        }

        // Apply image elements
        const pageImageElements = imageElementsArray.find(([pn]) => pn === pageNumber)?.[1] || [];
        for (const element of pageImageElements) {
          try {
            const imageBytes = Buffer.from(element.data.split(',')[1], 'base64');
            let image;

            if (element.data.startsWith('data:image/png')) {
              image = await pdfDoc.embedPng(imageBytes);
            } else if (element.data.startsWith('data:image/jpeg') || element.data.startsWith('data:image/jpg')) {
              image = await pdfDoc.embedJpg(imageBytes);
            } else {
              continue; // Skip unsupported formats
            }

            page.drawImage(image, {
              x: element.x,
              y: pageHeight - element.y - element.height, // Flip Y coordinate
              width: element.width,
              height: element.height,
            });
          } catch (error) {
            console.error(`Failed to embed image on page ${pageNumber}:`, error);
          }
        }

        // Apply annotations (highlights, shapes, etc.)
        const pageAnnotations = annotationsArray.find(([pn]) => pn === pageNumber)?.[1] || [];
        for (const annotation of pageAnnotations) {
          const color = this.parseColor(annotation.color);

          switch (annotation.type) {
            case 'highlight':
              page.drawRectangle({
                x: annotation.data.x,
                y: pageHeight - annotation.data.y - annotation.data.height,
                width: annotation.data.width,
                height: annotation.data.height,
                color: rgb(color.r, color.g, color.b),
                opacity: 0.3,
              });
              break;

            case 'rectangle':
              page.drawRectangle({
                x: annotation.data.x,
                y: pageHeight - annotation.data.y - annotation.data.height,
                width: annotation.data.width,
                height: annotation.data.height,
                borderColor: rgb(color.r, color.g, color.b),
                borderWidth: 2,
              });
              break;

            case 'circle':
              // Draw circle as ellipse
              const centerX = annotation.data.x + annotation.data.width / 2;
              const centerY = pageHeight - annotation.data.y - annotation.data.height / 2;
              page.drawEllipse({
                x: centerX,
                y: centerY,
                xScale: annotation.data.width / 2,
                yScale: annotation.data.height / 2,
                borderColor: rgb(color.r, color.g, color.b),
                borderWidth: 2,
              });
              break;

            case 'underline':
              page.drawLine({
                start: { x: annotation.data.x, y: pageHeight - annotation.data.y - annotation.data.height },
                end: { x: annotation.data.x + annotation.data.width, y: pageHeight - annotation.data.y - annotation.data.height },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });
              break;

            case 'strikethrough':
              page.drawLine({
                start: { x: annotation.data.x, y: pageHeight - annotation.data.y - annotation.data.height / 2 },
                end: { x: annotation.data.x + annotation.data.width, y: pageHeight - annotation.data.y - annotation.data.height / 2 },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });
              break;

            case 'line':
              page.drawLine({
                start: { x: annotation.data.x, y: pageHeight - annotation.data.y },
                end: { x: annotation.data.x + annotation.data.width, y: pageHeight - annotation.data.y - annotation.data.height },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });
              break;

            case 'arrow': {
              const startX = annotation.data.x;
              const startY = pageHeight - annotation.data.y;
              const endX = annotation.data.endX || annotation.data.x + annotation.data.width;
              const endY = pageHeight - (annotation.data.endY || annotation.data.y + annotation.data.height);

              // Draw arrow shaft
              page.drawLine({
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });

              // Draw arrow head
              const angle = Math.atan2(endY - startY, endX - startX);
              const arrowHeadLength = 10;

              page.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - arrowHeadLength * Math.cos(angle - Math.PI / 6),
                  y: endY - arrowHeadLength * Math.sin(angle - Math.PI / 6)
                },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });

              page.drawLine({
                start: { x: endX, y: endY },
                end: {
                  x: endX - arrowHeadLength * Math.cos(angle + Math.PI / 6),
                  y: endY - arrowHeadLength * Math.sin(angle + Math.PI / 6)
                },
                color: rgb(color.r, color.g, color.b),
                thickness: 2,
              });
              break;
            }

            case 'freehand':
              if (annotation.data.points && annotation.data.points.length > 1) {
                for (let i = 0; i < annotation.data.points.length - 1; i++) {
                  const point1 = annotation.data.points[i];
                  const point2 = annotation.data.points[i + 1];
                  page.drawLine({
                    start: { x: point1.x, y: pageHeight - point1.y },
                    end: { x: point2.x, y: pageHeight - point2.y },
                    color: rgb(color.r, color.g, color.b),
                    thickness: 2,
                  });
                }
              }
              break;

            case 'note':
              // Draw note as a filled rectangle with text
              page.drawRectangle({
                x: annotation.data.x,
                y: pageHeight - annotation.data.y - annotation.data.height,
                width: annotation.data.width,
                height: annotation.data.height,
                color: rgb(0.99, 0.82, 0.30), // Yellow
                opacity: 0.9,
                borderColor: rgb(color.r, color.g, color.b),
                borderWidth: 1,
              });
              if (annotation.data.text) {
                page.drawText('Note', {
                  x: annotation.data.x + 5,
                  y: pageHeight - annotation.data.y - 15,
                  size: 10,
                  font,
                  color: rgb(0.2, 0.2, 0.2),
                });
              }
              break;

            case 'stamp':
              // Draw stamp with border and text
              page.drawRectangle({
                x: annotation.data.x,
                y: pageHeight - annotation.data.y - annotation.data.height,
                width: annotation.data.width,
                height: annotation.data.height,
                borderColor: rgb(color.r, color.g, color.b),
                borderWidth: 3,
              });

              const stampText = (annotation.data.stampType || 'stamp').toUpperCase();
              page.drawText(stampText, {
                x: annotation.data.x + annotation.data.width / 2 - (stampText.length * 3),
                y: pageHeight - annotation.data.y - annotation.data.height / 2 - 5,
                size: 12,
                font,
                color: rgb(color.r, color.g, color.b),
                rotate: degrees(-15),
              });
              break;
          }
        }
      }

      const pdfBytesModified = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytesModified);
    } catch (error) {
      throw new Error(`Failed to apply modifications to PDF: ${error}`);
    }
  }

  private parseColor(colorStr: string): { r: number; g: number; b: number } {
    // Parse hex color like #RRGGBB
    if (colorStr.startsWith('#')) {
      return {
        r: parseInt(colorStr.slice(1, 3), 16) / 255,
        g: parseInt(colorStr.slice(3, 5), 16) / 255,
        b: parseInt(colorStr.slice(5, 7), 16) / 255,
      };
    }
    // Default to black
    return { r: 0, g: 0, b: 0 };
  }
}
