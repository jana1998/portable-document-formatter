import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, RotateCw, ZoomIn } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { PDFRenderer } from '@/services/pdf-renderer';
import { AnnotationLayer } from '@components/features/annotations/AnnotationLayer';
import { EditingLayer } from '@components/features/editing/EditingLayer';
import { TextEditLayer } from '@components/features/editing/TextEditLayer';
import { SearchHighlightLayer } from '@components/features/search/SearchHighlightLayer';
import { TextBoxTool } from '@components/features/editing/TextBoxTool';
import { ImageInsertTool } from '@components/features/editing/ImageInsertTool';

const pdfRenderer = new PDFRenderer();

const toolLabels: Record<string, string> = {
  select: 'Selection mode',
  'edit-text': 'Edit text mode',
  highlight: 'Highlight mode',
  text: 'Text mode',
  image: 'Image placement',
};

export function PDFViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [textBoxDialogOpen, setTextBoxDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const {
    currentDocument,
    currentPage,
    scale,
    rotation,
    currentTool,
    setCurrentDocument,
    setIsLoading: setStoreLoading,
    setError,
  } = usePDFStore();

  useEffect(() => {
    if (currentDocument) {
      setIsDocumentReady(false);
      void loadDocument();
    }

    return () => {
      pdfRenderer.destroy();
      setIsDocumentReady(false);
    };
  }, [currentDocument?.path]);

  useEffect(() => {
    if (isDocumentReady && canvasRef.current) {
      void renderPage();
    }
  }, [currentPage, scale, rotation, isDocumentReady]);

  const loadDocument = async () => {
    if (!currentDocument) return;

    setIsLoading(true);
    setStoreLoading(true);
    setIsDocumentReady(false);

    try {
      const data = await window.electronAPI.readFile(currentDocument.path);
      const arrayBuffer =
        data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      await pdfRenderer.loadDocument(arrayBuffer);

      const pageCount = pdfRenderer.getPageCount();
      setCurrentDocument({
        ...currentDocument,
        pageCount,
      });

      setIsDocumentReady(true);

      if (canvasRef.current) {
        await renderPage();
      }
    } catch (error) {
      console.error('Failed to load document:', error);
      setError(`Failed to load PDF document: ${error}`);
      setIsDocumentReady(false);
    } finally {
      setIsLoading(false);
      setStoreLoading(false);
    }
  };

  const renderPage = async () => {
    if (!canvasRef.current || !currentDocument) return;

    try {
      await pdfRenderer.renderPage(currentPage, canvasRef.current, scale, rotation);
    } catch (error) {
      console.error('Failed to render page:', error);
      setError('Failed to render page');
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || currentTool === 'select' || currentTool === 'edit-text') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;

    setClickPosition({ x, y });

    if (currentTool === 'text') {
      setTextBoxDialogOpen(true);
    } else if (currentTool === 'image') {
      setImageDialogOpen(true);
    }
  };

  return (
    <>
      <section className="panel-surface flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              Canvas
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              {currentDocument?.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="meta-pill">
              <Crosshair className="h-3.5 w-3.5" />
              {toolLabels[currentTool] ?? 'Selection mode'}
            </div>
            <div className="meta-pill">
              <ZoomIn className="h-3.5 w-3.5" />
              {Math.round(scale * 100)}%
            </div>
            <div className="meta-pill">
              <RotateCw className="h-3.5 w-3.5" />
              {rotation}deg
            </div>
          </div>
        </div>

        <div
          className="viewer-stage viewer-grid flex min-h-0 flex-1 items-start justify-center"
          onClick={handleCanvasClick}
          style={{ cursor: currentTool === 'edit-text' ? 'text' : currentTool !== 'select' ? 'crosshair' : 'default' }}
        >
          {isLoading ? (
            <div className="flex h-full min-h-[420px] w-full items-center justify-center">
              <div className="panel-surface flex items-center gap-4 px-6 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Rendering PDF</p>
                  <p className="text-sm text-muted-foreground">
                    Preparing page {currentPage} for editing.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative mx-auto">
              <canvas ref={canvasRef} className="pdf-canvas bg-white" />
              {canvasRef.current ? (
                <>
                  <SearchHighlightLayer
                    pageNumber={currentPage}
                    canvasWidth={canvasRef.current.width}
                    canvasHeight={canvasRef.current.height}
                    scale={scale}
                  />
                  <AnnotationLayer
                    pageNumber={currentPage}
                    canvasWidth={canvasRef.current.width}
                    canvasHeight={canvasRef.current.height}
                    scale={scale}
                  />
                  <EditingLayer pageNumber={currentPage} scale={scale} />
                  <TextEditLayer pageNumber={currentPage} scale={scale} />
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <TextBoxTool
        isOpen={textBoxDialogOpen}
        onClose={() => setTextBoxDialogOpen(false)}
        position={clickPosition}
      />

      <ImageInsertTool
        isOpen={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        position={clickPosition}
      />
    </>
  );
}
