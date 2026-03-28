import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, GripVertical } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { cn } from '@renderer/lib/utils';
import { PDFRenderer } from '@/services/pdf-renderer';
import { EmptyState } from '@components/ui/empty-state';
import { useToast } from '@renderer/hooks/use-toast';

const PREVIEW_LIMIT = 20;

export function ThumbnailsPanel() {
  const { currentDocument, currentPage, totalPages, setCurrentPage, setTotalPages, setCurrentDocument } = usePDFStore();
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const [dropTargetPage, setDropTargetPage] = useState<number | null>(null);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const pdfRendererRef = useRef<PDFRenderer | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (currentDocument) {
      void loadThumbnails();
      // Initialize page order
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
    } else {
      setThumbnails(new Map());
      setPageOrder([]);
    }

    return () => {
      pdfRendererRef.current?.destroy();
    };
  }, [currentDocument?.path]);

  useEffect(() => {
    // Update page order when total pages changes
    if (totalPages > 0) {
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
  }, [totalPages]);

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

  const handleDragStart = (e: React.DragEvent, pageNumber: number) => {
    setDraggedPage(pageNumber);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pageNumber.toString());

    // Add semi-transparent drag image
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedPage(null);
    setDropTargetPage(null);
  };

  const handleDragOver = (e: React.DragEvent, pageNumber: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedPage !== null && draggedPage !== pageNumber) {
      setDropTargetPage(pageNumber);
    }
  };

  const handleDragLeave = () => {
    setDropTargetPage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetPage: number) => {
    e.preventDefault();

    if (draggedPage === null || draggedPage === targetPage || !currentDocument) {
      setDraggedPage(null);
      setDropTargetPage(null);
      return;
    }

    setIsReordering(true);

    try {
      // Create new page order
      const newOrder = [...pageOrder];
      const draggedIndex = newOrder.indexOf(draggedPage);
      const targetIndex = newOrder.indexOf(targetPage);

      // Remove dragged page and insert at target position
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedPage);

      // Update local state immediately for UI feedback
      setPageOrder(newOrder);

      // Save reordered PDF - overwrite the original
      await window.electronAPI.reorderPages(currentDocument.path, newOrder, currentDocument.path);

      // Update document in store to trigger re-render
      setCurrentDocument({
        ...currentDocument,
        pageCount: totalPages,
      });

      toast({
        title: 'Pages Reordered Successfully',
        description: `Pages have been reordered. The changes are saved to the document.`,
        variant: 'success',
      });

      // Reload thumbnails with new order
      await loadThumbnails();

    } catch (error) {
      console.error('Failed to reorder pages:', error);
      toast({
        title: 'Reorder Failed',
        description: String(error),
        variant: 'destructive',
      });

      // Reset to original order on error
      setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
    } finally {
      setIsReordering(false);
      setDraggedPage(null);
      setDropTargetPage(null);
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
            Drag & drop to reorder • {Math.min(totalPages, PREVIEW_LIMIT)} previews
          </p>
        </div>
        <div className="meta-pill">{totalPages} total</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isReordering && (
          <div className="panel-muted mb-3 flex items-center justify-center gap-2 p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Reordering pages...</span>
          </div>
        )}

        <div className="space-y-3">
          {pageOrder.map((pageNumber, index) => {
            const hasPreview = thumbnails.has(pageNumber);
            const previewUnavailable = pageNumber > PREVIEW_LIMIT;
            const isDragging = draggedPage === pageNumber;
            const isDropTarget = dropTargetPage === pageNumber;

            return (
              <button
                key={`page-${pageNumber}-${index}`}
                type="button"
                draggable={!isReordering}
                onDragStart={(e) => handleDragStart(e, pageNumber)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, pageNumber)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, pageNumber)}
                className={cn(
                  'group panel-muted block w-full overflow-hidden p-2 text-left transition-all relative',
                  currentPage === pageNumber && 'border-primary/60 bg-primary/5 shadow-[0_14px_32px_rgba(13,148,136,0.12)]',
                  isDragging && 'opacity-50 scale-95',
                  isDropTarget && 'ring-2 ring-primary ring-offset-2',
                  !isReordering && 'cursor-move'
                )}
                onClick={() => !isDragging && setCurrentPage(pageNumber)}
              >
                {/* Drag handle */}
                {!isReordering && (
                  <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="rounded bg-background/90 p-1 shadow-sm">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                )}
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
                    <span className="font-semibold text-foreground">
                      Page {pageNumber}
                      {index + 1 !== pageNumber && (
                        <span className="ml-1 text-muted-foreground">→ {index + 1}</span>
                      )}
                    </span>
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
