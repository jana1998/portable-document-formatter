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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { createWorker } from 'tesseract.js';
import { PDFRenderer } from '@/services/pdf-renderer';
import { useToast } from '@renderer/hooks/use-toast';
import { FormatBadge } from './FormatBadge';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FileDown, Copy, Check } from 'lucide-react';
import type { ConversionResult, DocumentFormat } from '@renderer/types';

interface DocumentConverterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * DocumentConverterDialog - Multi-format document conversion with Markdown rendering
 *
 * Features:
 * - Detect and display document format with badge
 * - Tabbed result view: Preview (Markdown), Markdown source, Raw text
 * - Export buttons for MD, TXT, and JSON formats
 * - Support for current page or all pages conversion
 */
export function DocumentConverterDialog({ open, onOpenChange }: DocumentConverterDialogProps) {
  const { currentDocument, currentPage, setOCRResult, setIsProcessingOCR, totalPages } = usePDFStore();
  const [conversionMode, setConversionMode] = useState<'current' | 'all'>('current');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'raw'>('preview');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const { toast } = useToast();

  const handleConvert = async () => {
    if (!currentDocument) return;

    setIsProcessing(true);
    setIsProcessingOCR(true);
    setProgress(0);
    setResult(null);

    try {
      // Detect format from file extension
      const format = detectFormat(currentDocument.name);

      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      let extractedText = '';
      let markdownContent = '';
      const metadata: ConversionResult['metadata'] = {
        pageCount: currentDocument.pageCount || 1,
      };

      if (conversionMode === 'current') {
        // Convert current page only
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        const pdfCanvas = document.querySelector('.pdf-canvas') as HTMLCanvasElement;
        if (pdfCanvas) {
          canvas.width = pdfCanvas.width;
          canvas.height = pdfCanvas.height;
          ctx.drawImage(pdfCanvas, 0, 0);

          const imageData = canvas.toDataURL();
          const { data: { text, confidence } } = await worker.recognize(imageData);

          extractedText = text;
          markdownContent = convertToMarkdown(text, currentPage, 1);
          metadata.confidence = confidence;
          metadata.wordCount = countWords(text);

          setOCRResult(currentPage, {
            pageNumber: currentPage,
            text,
            confidence,
            words: [],
          });
        }
      } else {
        // Convert all pages
        const pageCount = currentDocument.pageCount || 1;
        const pdfRenderer = new PDFRenderer();
        const data = await window.electronAPI.readFile(currentDocument.path);
        const arrayBuffer = data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await pdfRenderer.loadDocument(arrayBuffer);

        const pageTexts: string[] = [];
        let totalConfidence = 0;

        for (let page = 1; page <= pageCount; page++) {
          setProgress(Math.round(((page - 1) / pageCount) * 100));

          try {
            const canvas = document.createElement('canvas');
            await pdfRenderer.renderPage(page, canvas, 1.0, 0);

            const imageData = canvas.toDataURL();
            const { data: { text, confidence } } = await worker.recognize(imageData);

            pageTexts.push(text);
            totalConfidence += confidence;

            setOCRResult(page, {
              pageNumber: page,
              text,
              confidence,
              words: [],
            });
          } catch (error) {
            console.error(`Failed to convert page ${page}:`, error);
            pageTexts.push(`[Error processing page ${page}]`);
          }
        }

        setProgress(100);
        extractedText = pageTexts.join('\n\n');
        markdownContent = convertToMarkdown(extractedText, 1, pageCount);
        metadata.confidence = totalConfidence / pageCount;
        metadata.wordCount = countWords(extractedText);
        await pdfRenderer.destroy();
      }

      await worker.terminate();

      const conversionResult: ConversionResult = {
        success: true,
        format,
        markdown: markdownContent,
        text: extractedText,
        metadata,
      };

      setResult(conversionResult);
      setActiveTab('preview');

      toast({
        title: 'Conversion Completed Successfully',
        description: `Extracted ${metadata.wordCount} words from ${conversionMode === 'current' ? '1 page' : `${metadata.pageCount} pages`}.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Conversion failed:', error);
      const errorResult: ConversionResult = {
        success: false,
        format: 'unknown',
        markdown: '',
        text: '',
        error: String(error),
      };
      setResult(errorResult);
      toast({
        title: 'Conversion Failed',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setIsProcessingOCR(false);
      setProgress(0);
    }
  };

  const handleExport = async (format: 'md' | 'txt' | 'json') => {
    if (!result || !result.success) return;

    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      switch (format) {
        case 'md': {
          content = result.markdown;
          filename = `${currentDocument?.name.replace(/\.[^/.]+$/, '')}_converted.md`;
          mimeType = 'text/markdown';
          break;
        }
        case 'txt': {
          content = result.text;
          filename = `${currentDocument?.name.replace(/\.[^/.]+$/, '')}_converted.txt`;
          mimeType = 'text/plain';
          break;
        }
        case 'json': {
          content = JSON.stringify(result, null, 2);
          filename = `${currentDocument?.name.replace(/\.[^/.]+$/, '')}_converted.json`;
          mimeType = 'application/json';
          break;
        }
        default:
          return;
      }

      // Create blob and download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Successful',
        description: `Saved as ${filename}`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleCopy = async (content: string, formatName: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFormat(formatName);
      setTimeout(() => setCopiedFormat(null), 2000);
      toast({
        title: 'Copied to Clipboard',
        description: `${formatName} content has been copied.`,
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>Document Converter</DialogTitle>
            {result && result.success && <FormatBadge format={result.format} size="sm" />}
          </div>
          <DialogDescription>
            Convert documents to Markdown format using OCR and text extraction
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1 overflow-hidden flex flex-col">
          {!result ? (
            <>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Conversion Mode</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="convert-current"
                      name="convert-mode"
                      checked={conversionMode === 'current'}
                      onChange={() => setConversionMode('current')}
                      className="h-4 w-4"
                      disabled={isProcessing}
                    />
                    <label htmlFor="convert-current" className="text-sm cursor-pointer">
                      Current page only (Page {currentPage})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="convert-all"
                      name="convert-mode"
                      checked={conversionMode === 'all'}
                      onChange={() => setConversionMode('all')}
                      className="h-4 w-4"
                      disabled={isProcessing}
                    />
                    <label htmlFor="convert-all" className="text-sm cursor-pointer">
                      All pages ({totalPages} pages - slower)
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

              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium mb-1">How Document Conversion Works:</p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Detects document format automatically</li>
                  <li>• Extracts text using OCR technology</li>
                  <li>• Converts to clean Markdown format</li>
                  <li>• Preserves document structure and formatting</li>
                  <li>• Export to MD, TXT, or JSON formats</li>
                </ul>
              </div>
            </>
          ) : result.success ? (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="markdown">Markdown</TabsTrigger>
                    <TabsTrigger value="raw">Raw Text</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex-1 overflow-hidden border rounded-md">
                <Tabs value={activeTab} className="h-full flex flex-col">
                  <TabsContent value="preview" className="flex-1 overflow-auto p-4 mt-0">
                    <MarkdownRenderer content={result.markdown} />
                  </TabsContent>
                  <TabsContent value="markdown" className="flex-1 overflow-auto mt-0">
                    <div className="relative h-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 z-10 gap-2"
                        onClick={() => handleCopy(result.markdown, 'Markdown')}
                      >
                        {copiedFormat === 'Markdown' ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                      <pre className="h-full p-4 bg-muted rounded-md text-sm font-mono overflow-auto">
                        {result.markdown}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="raw" className="flex-1 overflow-auto mt-0">
                    <div className="relative h-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2 z-10 gap-2"
                        onClick={() => handleCopy(result.text, 'Text')}
                      >
                        {copiedFormat === 'Text' ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                      <pre className="h-full p-4 bg-muted rounded-md text-sm font-mono overflow-auto whitespace-pre-wrap">
                        {result.text}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {result.metadata && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {result.metadata.wordCount && <span>Words: {result.metadata.wordCount}</span>}
                  {result.metadata.pageCount && <span>Pages: {result.metadata.pageCount}</span>}
                  {result.metadata.confidence && (
                    <span>Confidence: {Math.round(result.metadata.confidence)}%</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
              <p className="font-medium">Conversion Failed</p>
              <p className="text-xs mt-1">{result.error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {result && result.success ? (
            <>
              <div className="flex gap-2 flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('md')}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Export MD
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('txt')}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Export TXT
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('json')}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Export JSON
                </Button>
              </div>
              <Button variant="outline" onClick={() => setResult(null)} size="sm">
                New Conversion
              </Button>
              <Button onClick={() => onOpenChange(false)} size="sm">
                Close
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isProcessing}
                size="sm"
              >
                Cancel
              </Button>
              <Button onClick={handleConvert} disabled={isProcessing || !currentDocument} size="sm">
                {isProcessing ? 'Processing...' : 'Start Conversion'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Detect document format from filename
 */
function detectFormat(filename: string): DocumentFormat {
  const ext = filename.toLowerCase().split('.').pop();
  const formatMap: Record<string, DocumentFormat> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'docx',
    pptx: 'pptx',
    ppt: 'pptx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    html: 'html',
    htm: 'html',
    epub: 'epub',
    txt: 'txt',
  };
  return formatMap[ext || ''] || 'unknown';
}

/**
 * Convert extracted text to Markdown format
 */
function convertToMarkdown(text: string, startPage: number, pageCount: number): string {
  let markdown = '';

  // Add document metadata
  if (pageCount > 1) {
    markdown += `# Document Conversion\n\n`;
    markdown += `**Pages:** ${startPage} - ${startPage + pageCount - 1}\n\n`;
    markdown += `---\n\n`;
  }

  // Split text into lines and process
  const lines = text.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines in code blocks
    if (inCodeBlock) {
      markdown += line + '\n';
      if (trimmed.startsWith('```')) {
        inCodeBlock = false;
      }
      continue;
    }

    // Detect code blocks
    if (trimmed.startsWith('```')) {
      inCodeBlock = true;
      markdown += line + '\n';
      continue;
    }

    // Detect headers (lines with all caps, or lines that look like titles)
    if (trimmed.length > 0 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
      markdown += `\n## ${trimmed}\n\n`;
    } else if (trimmed.length > 0) {
      markdown += trimmed + '\n\n';
    } else {
      markdown += '\n';
    }
  }

  return markdown.trim();
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}
