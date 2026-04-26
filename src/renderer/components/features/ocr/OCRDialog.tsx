import React, { useRef, useState } from 'react';
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
import { PDFRenderer } from '@/services/pdf-renderer';
import { useToast } from '@renderer/hooks/use-toast';
import type { OCRResult } from '@renderer/types';

interface OCRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Pages below this threshold are treated as text-layer-sparse and sent to OCR.
const TEXT_LAYER_MIN_CHARS = 200;

// Target render DPI for OCR rasterization. PaddleOCR prefers 150–200 DPI.
const OCR_RENDER_SCALE = 2.0;

export function OCRDialog({ open, onOpenChange }: OCRDialogProps) {
  const { currentDocument, currentPage, setOCRResult, setIsProcessingOCR, totalPages } =
    usePDFStore();
  const [ocrMode, setOcrMode] = useState<'current' | 'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLine, setStatusLine] = useState('');
  const [result, setResult] = useState('');
  const [language] = useState<'multi'>('multi');
  const [exportFormat, setExportFormat] = useState<'md' | 'txt' | 'pdf'>('md');
  const [isExporting, setIsExporting] = useState(false);
  const abortRef = useRef(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    abortRef.current = true;
    try {
      await window.electronAPI.cancelOCR();
    } catch {
      // noop
    }
  };

  const rasterizePage = async (
    renderer: PDFRenderer,
    pageNumber: number
  ): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    await renderer.renderPage(pageNumber, canvas, OCR_RENDER_SCALE, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const synthesizeFromTextLayer = async (
    renderer: PDFRenderer,
    pageNumber: number
  ): Promise<OCRResult | null> => {
    try {
      const textContent = await renderer.getTextContent(pageNumber);
      const items = (textContent.items ?? []) as Array<{ str?: string }>;
      const text = items
        .map((i) => (typeof i.str === 'string' ? i.str : ''))
        .filter(Boolean)
        .join(' ');
      if (text.replace(/\s+/g, ' ').trim().length < TEXT_LAYER_MIN_CHARS) return null;
      return {
        pageNumber,
        text,
        confidence: 1,
        words: [],
      };
    } catch {
      return null;
    }
  };

  const recognizeOnePage = async (
    renderer: PDFRenderer,
    pageNumber: number
  ): Promise<OCRResult | null> => {
    const viaText = await synthesizeFromTextLayer(renderer, pageNumber);
    if (viaText) return viaText;

    const blob = await rasterizePage(renderer, pageNumber);
    if (!blob) return null;
    const buffer = await blob.arrayBuffer();
    const res = await window.electronAPI.recognizePageImage(pageNumber, buffer);
    return res as OCRResult;
  };

  const handleOCR = async () => {
    if (!currentDocument) return;

    abortRef.current = false;
    setIsProcessing(true);
    setIsProcessingOCR(true);
    setProgress(0);
    setResult('');
    setStatusLine('Loading document…');

    const renderer = new PDFRenderer();

    try {
      const data = await window.electronAPI.readFile(currentDocument.path);
      const arrayBuffer =
        data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      await renderer.loadDocument(arrayBuffer);

      const pages = ocrMode === 'current' ? [currentPage] : range(1, currentDocument.pageCount || totalPages || 1);
      const results: OCRResult[] = [];
      let accumulated = '';

      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current) break;
        const pageNumber = pages[i];
        setStatusLine(`Processing page ${pageNumber}…`);
        setProgress(Math.round((i / pages.length) * 100));

        const pageResult = await recognizeOnePage(renderer, pageNumber);
        if (!pageResult) {
          accumulated += `\n--- Page ${pageNumber} ---\n[no text]\n`;
          continue;
        }

        setOCRResult(pageNumber, pageResult);
        results.push(pageResult);
        accumulated += `\n--- Page ${pageNumber} ---\n${pageResult.text}\n`;
        setResult(accumulated);
      }

      if (!abortRef.current) {
        setProgress(100);
        setStatusLine('Saving sidecar…');
        try {
          await window.electronAPI.saveOCRSidecar(currentDocument.path, results);
        } catch (sidecarErr) {
          console.warn('OCR sidecar write failed:', sidecarErr);
        }

        toast({
          title: 'OCR complete',
          description: `Extracted text from ${results.length} page${results.length === 1 ? '' : 's'}.`,
          variant: 'success',
        });
      } else {
        toast({ title: 'OCR cancelled', variant: 'default' });
      }
    } catch (error) {
      console.error('OCR failed:', error);
      toast({
        title: 'OCR Failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      await renderer.destroy().catch(() => undefined);
      setIsProcessing(false);
      setIsProcessingOCR(false);
      setStatusLine('');
    }
  };

  const handleExport = async () => {
    if (!result || !currentDocument) return;
    setIsExporting(true);
    const baseName = currentDocument.name.replace(/\.pdf$/i, '');
    try {
      if (exportFormat === 'pdf') {
        const savePath = await window.electronAPI.saveTextFile(
          `${baseName}-ocr.pdf`,
          [{ name: 'PDF Files', extensions: ['pdf'] }]
        );
        if (!savePath) return;
        await window.electronAPI.exportOCRPDF(savePath, result);
      } else {
        const content =
          exportFormat === 'md'
            ? result.replace(/--- Page (\d+) ---/g, '\n## Page $1\n')
            : result;
        const filters =
          exportFormat === 'md'
            ? [{ name: 'Markdown', extensions: ['md'] }]
            : [{ name: 'Plain Text', extensions: ['txt'] }];
        const savePath = await window.electronAPI.saveTextFile(
          `${baseName}-ocr.${exportFormat}`,
          filters
        );
        if (!savePath) return;
        await window.electronAPI.writeTextFile(savePath, content);
      }
      toast({ title: 'Export complete', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>OCR — Extract Text from PDF</DialogTitle>
          <DialogDescription>
            Run PaddleOCR locally on-device. Born-digital pages use the embedded text layer
            automatically; scanned pages are recognized in a background process.
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
                  All pages (text-layer pages are skipped automatically)
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Language</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={language}
              disabled
              aria-label="OCR language"
            >
              <option value="multi">Chinese + English (multilingual, default)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Additional languages can be added in a later build.
            </p>
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{statusLine || 'Processing…'}</span>
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
                    title: 'Copied to Clipboard',
                    description: 'Extracted text has been copied.',
                  });
                }}
              >
                Copy to Clipboard
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'md' | 'txt' | 'pdf')}
                  disabled={isExporting}
                  aria-label="Export format"
                >
                  <option value="md">Markdown (.md)</option>
                  <option value="txt">Plain Text (.txt)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                  {isExporting ? 'Exporting…' : 'Export text'}
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">How it works</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Tries the PDF's text layer first — instant and perfect on born-digital PDFs.</li>
              <li>• Falls back to PaddleOCR v4 (ONNX) in a sandboxed background process.</li>
              <li>• Runs 100% on-device; no content leaves your machine.</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          {isProcessing ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {result ? 'Close' : 'Cancel'}
              </Button>
              <Button onClick={handleOCR} disabled={!currentDocument}>
                Start OCR
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
