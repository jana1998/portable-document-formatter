import React, { useEffect, useRef, useState } from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { PDFRenderer } from '@/services/pdf-renderer';
import { AnnotationLayer } from '@components/features/annotations/AnnotationLayer';
import { EditingLayer } from '@components/features/editing/EditingLayer';
import { SearchHighlightLayer } from '@components/features/search/SearchHighlightLayer';
import { TextBoxTool } from '@components/features/editing/TextBoxTool';
import { ImageInsertTool } from '@components/features/editing/ImageInsertTool';

const pdfRenderer = new PDFRenderer();

export function PDFViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
      loadDocument();
    }
    return () => {
      pdfRenderer.destroy();
      setIsDocumentReady(false);
    };
  }, [currentDocument?.path]);

  useEffect(() => {
    if (isDocumentReady && canvasRef.current) {
      renderPage();
    }
  }, [currentPage, scale, rotation, isDocumentReady]);

  const loadDocument = async () => {
    if (!currentDocument) return;

    setIsLoading(true);
    setStoreLoading(true);
    setIsDocumentReady(false);

    try {
      const data = await window.electronAPI.readFile(currentDocument.path);

      // Convert Buffer to ArrayBuffer if needed
      const arrayBuffer = data instanceof ArrayBuffer
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      await pdfRenderer.loadDocument(arrayBuffer);

      const pageCount = pdfRenderer.getPageCount();

      // Update document with page count
      setCurrentDocument({
        ...currentDocument,
        pageCount,
      });

      setIsDocumentReady(true);

      // Render initial page
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || currentTool === 'select') return;

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
      <div
        ref={containerRef}
        className="h-full overflow-auto bg-muted/30 flex items-start justify-center p-8"
        onClick={handleCanvasClick}
        style={{ cursor: currentTool !== 'select' ? 'crosshair' : 'default' }}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="pdf-canvas bg-white shadow-lg"
          />
          {canvasRef.current && (
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
            </>
          )}
        </div>
      </div>

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
