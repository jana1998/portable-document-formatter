import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { PDFRenderer } from '@/services/pdf-renderer';
import { cn } from '@renderer/lib/utils';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

export function ReaderMode() {
  const {
    currentDocument,
    currentPage,
    totalPages,
    setCurrentPage,
    setIsReaderMode,
  } = usePDFStore();

  const [readerPage, setReaderPage] = useState(currentPage);
  const [spreadMode, setSpreadMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [scale, setScale] = useState(1.0);
  const rendererRef = useRef<PDFRenderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentDocument) return;
    const renderer = new PDFRenderer();
    rendererRef.current = renderer;
    setIsDocumentReady(false);
    let cancelled = false;
    void (async () => {
      const data = await window.electronAPI.readFile(currentDocument.path);
      if (cancelled) return;
      const ab =
        data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      await renderer.loadDocument(ab);
      // Guard against stale IIFEs (cleanup ran while we were loading).
      if (!cancelled) setIsDocumentReady(true);
    })();
    return () => {
      cancelled = true;
      setIsDocumentReady(false);
      renderer.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument?.path]);

  useEffect(() => {
    if (!rendererRef.current || !isDocumentReady) return;
    void renderPages(rendererRef.current, readerPage, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerPage, spreadMode, isDocumentReady, scale]);

  const renderPages = async (renderer: PDFRenderer, page: number, currentScale: number) => {
    if (canvasRef.current) {
      await renderer.renderPage(page, canvasRef.current, currentScale, 0);
      canvasRef.current.style.width = '';
      canvasRef.current.style.height = '';
    }
    if (spreadMode && canvas2Ref.current && page + 1 <= totalPages) {
      await renderer.renderPage(page + 1, canvas2Ref.current, currentScale, 0);
      canvas2Ref.current.style.width = '';
      canvas2Ref.current.style.height = '';
    }
  };

  const goTo = useCallback(
    (delta: number) => {
      const step = spreadMode ? 2 : 1;
      setReaderPage((p) => Math.min(Math.max(1, p + delta * step), totalPages));
    },
    [spreadMode, totalPages]
  );

  const exit = useCallback(() => {
    setCurrentPage(readerPage);
    setIsReaderMode(false);
  }, [readerPage, setCurrentPage, setIsReaderMode]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(+(s + SCALE_STEP).toFixed(2), MAX_SCALE)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(+(s - SCALE_STEP).toFixed(2), MIN_SCALE)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(-1);
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(1);
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, exit, zoomIn, zoomOut]);

  const showControls = () => {
    setControlsVisible(true);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setControlsVisible(false), 2500);
  };

  const pageLabel = spreadMode && readerPage + 1 <= totalPages
    ? `${readerPage}–${readerPage + 1} / ${totalPages}`
    : `${readerPage} / ${totalPages}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      onMouseMove={showControls}
    >
      {/* Exit */}
      <button
        className={cn(
          'absolute right-5 top-5 z-10 rounded-full bg-foreground/10 p-2 transition-opacity hover:bg-foreground/20',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={exit}
        aria-label="Exit reader mode"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Spread toggle */}
      <button
        className={cn(
          'absolute left-5 top-5 z-10 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-opacity hover:bg-muted',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={() => setSpreadMode((s) => !s)}
      >
        {spreadMode ? 'Single page' : 'Two-page spread'}
      </button>

      {/* Canvases */}
      <div className="flex items-center gap-4 px-16">
        <canvas
          ref={canvasRef}
          className="max-h-[calc(100vh-120px)] max-w-full h-auto w-auto object-contain shadow-soft-2"
        />
        {spreadMode && (
          <canvas
            ref={canvas2Ref}
            className="max-h-[calc(100vh-120px)] max-w-full h-auto w-auto object-contain shadow-soft-2"
          />
        )}
      </div>

      {/* Prev */}
      <button
        className={cn(
          'absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-foreground/5 p-4 transition-opacity hover:bg-foreground/10 disabled:opacity-20',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={() => goTo(-1)}
        disabled={readerPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-7 w-7" />
      </button>

      {/* Next */}
      <button
        className={cn(
          'absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-foreground/5 p-4 transition-opacity hover:bg-foreground/10 disabled:opacity-20',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={() => goTo(1)}
        disabled={readerPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-7 w-7" />
      </button>

      {/* Bottom controls: page counter + zoom */}
      <div
        className={cn(
          'absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-foreground/10 px-4 py-2 text-sm font-medium transition-opacity',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <button
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          aria-label="Zoom out"
          className="rounded-full p-1 hover:bg-foreground/10 disabled:opacity-30"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span className="min-w-[80px] text-center">{pageLabel}</span>

        <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>

        <button
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          aria-label="Zoom in"
          className="rounded-full p-1 hover:bg-foreground/10 disabled:opacity-30"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
