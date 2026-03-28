import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { createWorker } from 'tesseract.js';
import { PDFRenderer } from '@/services/pdf-renderer';
import { useToast } from '@renderer/hooks/use-toast';

interface OCRDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OCRDialog({ isOpen, onClose }: OCRDialogProps) {
  const { currentDocument, currentPage, setOCRResult, setIsProcessingOCR, totalPages } = usePDFStore();
  const [ocrMode, setOcrMode] = useState<'current' | 'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string>('');
  const { toast } = useToast();

  const handleOCR = async () => {
    if (!currentDocument) return;

    setIsProcessing(true);
    setIsProcessingOCR(true);
    setProgress(0);
    setResult('');

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      if (ocrMode === 'current') {
        // OCR current page only
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        // Get the PDF page as image
        const data = await window.electronAPI.readFile(currentDocument.path);

        // For simplicity, we'll get the current canvas from the viewer
        const pdfCanvas = document.querySelector('.pdf-canvas') as HTMLCanvasElement;
        if (pdfCanvas) {
          canvas.width = pdfCanvas.width;
          canvas.height = pdfCanvas.height;
          ctx.drawImage(pdfCanvas, 0, 0);

          const imageData = canvas.toDataURL();
          const { data: { text, confidence, words } } = await worker.recognize(imageData);

          setResult(text);
          setOCRResult(currentPage, {
            pageNumber: currentPage,
            text,
            confidence,
            words: words.map((w: any) => ({
              text: w.text,
              confidence: w.confidence,
              bbox: w.bbox,
            })),
          });
        }
      } else {
        // OCR all pages
        let allText = '';
        const pageCount = currentDocument.pageCount || 1;

        // Create a PDF renderer to render each page
        const pdfRenderer = new PDFRenderer();
        const data = await window.electronAPI.readFile(currentDocument.path);
        const arrayBuffer = data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await pdfRenderer.loadDocument(arrayBuffer);

        for (let page = 1; page <= pageCount; page++) {
          setResult(`Processing page ${page} of ${pageCount}...\n\n${allText}`);
          setProgress(Math.round(((page - 1) / pageCount) * 100));

          try {
            // Create an off-screen canvas for each page
            const canvas = document.createElement('canvas');
            await pdfRenderer.renderPage(page, canvas, 1.0, 0);

            const imageData = canvas.toDataURL();
            const { data: { text, confidence } } = await worker.recognize(imageData);

            allText += `\n--- Page ${page} ---\n${text}\n`;

            // Store result for each page
            setOCRResult(page, {
              pageNumber: page,
              text,
              confidence,
              words: [],
            });
          } catch (error) {
            console.error(`Failed to OCR page ${page}:`, error);
            allText += `\n--- Page ${page} ---\n[Error processing page]\n`;
          }
        }

        setProgress(100);
        setResult(allText);
        await pdfRenderer.destroy();
      }

      await worker.terminate();
      toast({
        title: "OCR Completed Successfully",
        description: "Text has been extracted from the PDF.",
        variant: "success",
      });
    } catch (error) {
      console.error('OCR failed:', error);
      toast({
        title: "OCR Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setIsProcessingOCR(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>OCR - Extract Text from PDF</DialogTitle>
          <DialogDescription>
            Use Optical Character Recognition to extract text from scanned PDFs or images
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">OCR Mode</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="ocr-current"
                  name="ocr-mode"
                  checked={ocrMode === 'current'}
                  onChange={() => setOcrMode('current')}
                  className="h-4 w-4"
                  disabled={isProcessing}
                />
                <label htmlFor="ocr-current" className="text-sm cursor-pointer">
                  Current page only (Page {currentPage})
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="ocr-all"
                  name="ocr-mode"
                  checked={ocrMode === 'all'}
                  onChange={() => setOcrMode('all')}
                  className="h-4 w-4"
                  disabled={isProcessing}
                />
                <label htmlFor="ocr-all" className="text-sm cursor-pointer">
                  All pages (slower, processes sequentially)
                </label>
              </div>
            </div>
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {result && (
            <div className="grid gap-2">
              <label className="text-sm font-medium">Extracted Text:</label>
              <textarea
                className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={result}
                readOnly
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(result);
                  toast({
                    title: "Copied to Clipboard",
                    description: "Extracted text has been copied.",
                  });
                }}
              >
                Copy to Clipboard
              </Button>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">How OCR Works:</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Analyzes the visual content of the PDF page</li>
              <li>• Recognizes text characters using AI</li>
              <li>• Extracts text that can be searched and copied</li>
              <li>• Works best with clear, high-resolution scans</li>
              <li>• Processing time: ~5-10 seconds per page</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleOCR} disabled={isProcessing || !currentDocument}>
            {isProcessing ? 'Processing...' : 'Start OCR'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
