import React, { useEffect, useRef, useState } from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { cn } from '@renderer/lib/utils';
import { PDFRenderer } from '@/services/pdf-renderer';

export function ThumbnailsPanel() {
  const { currentDocument, currentPage, totalPages, setCurrentPage } = usePDFStore();
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const pdfRendererRef = useRef<PDFRenderer | null>(null);

  useEffect(() => {
    if (currentDocument) {
      loadThumbnails();
    }
    return () => {
      pdfRendererRef.current?.destroy();
    };
  }, [currentDocument]);

  const loadThumbnails = async () => {
    if (!currentDocument) return;

    try {
      const renderer = new PDFRenderer();
      pdfRendererRef.current = renderer;

      const data = await window.electronAPI.readFile(currentDocument.path);

      // Convert Buffer to ArrayBuffer if needed
      const arrayBuffer = data instanceof ArrayBuffer
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      await renderer.loadDocument(arrayBuffer);

      const pageCount = renderer.getPageCount();
      const newThumbnails = new Map<number, string>();

      // Generate thumbnails for visible pages (first 20)
      const pagesToLoad = Math.min(pageCount, 20);

      for (let i = 1; i <= pagesToLoad; i++) {
        try {
          const canvas = document.createElement('canvas');
          await renderer.renderPage(i, canvas, 0.2); // Small scale for thumbnails
          const dataUrl = canvas.toDataURL();
          newThumbnails.set(i, dataUrl);
        } catch (error) {
          console.error(`Failed to generate thumbnail for page ${i}:`, error);
          // Continue with other pages even if one fails
        }
      }

      setThumbnails(newThumbnails);
    } catch (error) {
      console.error('Failed to load thumbnails:', error);
    }
  };

  if (!currentDocument || totalPages === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No pages to display
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
        <div
          key={pageNum}
          className={cn(
            'border rounded-md overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary',
            currentPage === pageNum && 'ring-2 ring-primary'
          )}
          onClick={() => setCurrentPage(pageNum)}
        >
          <div className="aspect-[8.5/11] bg-muted flex items-center justify-center relative">
            {thumbnails.has(pageNum) ? (
              <img
                src={thumbnails.get(pageNum)}
                alt={`Page ${pageNum}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-muted-foreground text-xs">Loading...</div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-background/90 py-1 text-center text-xs">
              Page {pageNum}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
