import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { cn } from '@renderer/lib/utils';
import { PDFRenderer } from '@/services/pdf-renderer';
import { EmptyState } from '@components/ui/empty-state';

const PREVIEW_LIMIT = 20;

export function ThumbnailsPanel() {
  const { currentDocument, currentPage, totalPages, setCurrentPage } = usePDFStore();
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const pdfRendererRef = useRef<PDFRenderer | null>(null);

  useEffect(() => {
    if (currentDocument) {
      void loadThumbnails();
    } else {
      setThumbnails(new Map());
    }

    return () => {
      pdfRendererRef.current?.destroy();
    };
  }, [currentDocument?.path]);

  const loadThumbnails = async () => {
    if (!currentDocument) return;

    setIsLoading(true);
    setThumbnails(new Map());

    try {
      const renderer = new PDFRenderer();
      pdfRendererRef.current = renderer;

      const data = await window.electronAPI.readFile(currentDocument.path);
      const arrayBuffer =
        data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      await renderer.loadDocument(arrayBuffer);

      const pageCount = renderer.getPageCount();
      const nextThumbnails = new Map<number, string>();
      const pagesToLoad = Math.min(pageCount, PREVIEW_LIMIT);

      for (let pageNumber = 1; pageNumber <= pagesToLoad; pageNumber += 1) {
        try {
          const canvas = document.createElement('canvas');
          await renderer.renderPage(pageNumber, canvas, 0.2);
          nextThumbnails.set(pageNumber, canvas.toDataURL());
        } catch (error) {
          console.error(`Failed to generate thumbnail for page ${pageNumber}:`, error);
        }
      }

      setThumbnails(nextThumbnails);
    } catch (error) {
      console.error('Failed to load thumbnails:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentDocument || totalPages === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No page previews yet"
        description="Open a document to generate thumbnail navigation for each page."
        className="min-h-[280px]"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="panel-muted flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Page navigator</p>
          <p className="text-xs text-muted-foreground">
            Fast previews for the first {Math.min(totalPages, PREVIEW_LIMIT)} pages.
          </p>
        </div>
        <div className="meta-pill">{totalPages} total</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
            const hasPreview = thumbnails.has(pageNumber);
            const previewUnavailable = pageNumber > PREVIEW_LIMIT;

            return (
              <button
                key={pageNumber}
                type="button"
                className={cn(
                  'group panel-muted block w-full overflow-hidden p-2 text-left',
                  currentPage === pageNumber && 'border-primary/60 bg-primary/5 shadow-[0_14px_32px_rgba(13,148,136,0.12)]'
                )}
                onClick={() => setCurrentPage(pageNumber)}
              >
                <div className="relative overflow-hidden rounded-[1rem] border border-border/60 bg-white">
                  <div className="aspect-[8.5/11] w-full bg-[linear-gradient(180deg,#ffffff,#f8fafc)]">
                    {hasPreview ? (
                      <img
                        src={thumbnails.get(pageNumber)}
                        alt={`Page ${pageNumber}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {isLoading && !previewUnavailable ? (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-xs font-medium">Generating preview</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
                            <FileText className="h-5 w-5" />
                            <span className="text-xs font-medium">
                              {previewUnavailable ? 'Preview on demand' : 'Preview unavailable'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/90 px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">Page {pageNumber}</span>
                    {currentPage === pageNumber ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">
                        Active
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
