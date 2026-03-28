import * as fs from 'fs/promises';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

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
    },
    outputPath: string
  ): Promise<void> {
    try {
      const pdfBytes = await fs.readFile(filePath);
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
