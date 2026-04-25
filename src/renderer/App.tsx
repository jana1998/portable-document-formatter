import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, FileUp, PanelLeft, PanelLeftClose, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@components/ui/button';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/toaster';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { Toolbar } from '@components/common/Toolbar';
import { WelcomeHero } from '@components/common/WelcomeHero';
import { Sidebar } from '@components/common/Sidebar';
import { PDFViewer } from '@components/features/viewer/PDFViewer';
import { FloatingToolbar } from '@components/features/viewer/FloatingToolbar';
import { ReaderMode } from '@components/features/reader/ReaderMode';
import { SettingsDialog } from '@components/features/settings/SettingsDialog';
import { LibraryPicker } from '@components/features/library/LibraryPicker';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { cn } from '@renderer/lib/utils';

function App() {
  const {
    currentDocument,
    currentPage,
    totalPages,
    scale,
    isSidebarOpen,
    isReaderMode,
    setCurrentPage,
    setScale,
    setIsSidebarOpen,
    setIsDarkMode,
    error,
    isLibraryPickerOpen,
    setIsLibraryPickerOpen,
    isSettingsDialogOpen,
    setIsSettingsDialogOpen,
  } = usePDFStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    setIsReady(true);
  }, [setIsDarkMode]);

  const handleOpenFile = async () => {
    if (window.electronAPI?.companionMode) {
      setIsLibraryPickerOpen(true);
      return;
    }
    try {
      const fileInfo = await window.electronAPI.openFile();
      if (!fileInfo) return;
      usePDFStore.getState().setCurrentDocument({
        id: Date.now().toString(),
        name: fileInfo.name,
        path: fileInfo.path,
        pageCount: 0,
        fileSize: fileInfo.size,
        loadedAt: new Date(),
      });
    } catch (openError) {
      console.error('Failed to open file:', openError);
    }
  };

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="panel-surface w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-foreground">
            <LoadingSpinner size="lg" />
          </div>
          <p className="display-h3">Preparing workspace</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Initializing the PDF editor and loading your desktop tools.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Floating toolbar — fixed over the canvas, not in the layout flow */}
      <div className="fixed inset-x-2 top-2 z-30 sm:inset-x-3 sm:top-3">
        <Toolbar />
      </div>

      <div className="app-shell">
        {/* Content fills the full padded area; the toolbar floats over the top */}
        <div className="relative z-10 flex min-h-0 flex-1 gap-0 px-2 pt-[64px] pb-2 sm:gap-4 sm:px-3 sm:pt-[68px] sm:pb-3">
          {isSidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/40 sm:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <div
            className={`min-w-0 overflow-hidden transition-[width,opacity,transform,margin] duration-300 ${
              isSidebarOpen
                ? 'max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-80 max-sm:shadow-xl sm:w-[22rem] sm:opacity-100'
                : 'max-sm:pointer-events-none max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-40 max-sm:w-80 max-sm:-translate-x-full max-sm:opacity-0 sm:m-0 sm:w-0 sm:opacity-0'
            }`}
          >
            <Sidebar />
          </div>

          <main className="min-w-0 flex-1">
            {currentDocument ? (
              <div className="flex h-full flex-col gap-3">
                {error && (
                  <div className="panel-surface flex items-center gap-3 border-destructive/30 px-4 py-3 text-sm" style={{ marginTop: '3.5rem' }}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Rendering issue detected</p>
                      <p className="text-muted-foreground">{error}</p>
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <PDFViewer />
                </div>
              </div>
            ) : (
              /* Landing: pt-14 shifts the centering origin below the toolbar */
              <div className="landing-stage pt-14">
                <div className="landing-content">
                  <div className="w-full max-w-xl text-center">
                    <WelcomeHero />
                    <Button onClick={handleOpenFile} size="lg" className="gap-2">
                      <FileUp className="h-4 w-4" />
                      Open PDF
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating bottom bar — page nav + zoom */}
      {currentDocument && !isReaderMode && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-3 py-2 shadow-[0_8px_32px_rgba(20,20,19,0.10)] backdrop-blur-sm ${
            isSidebarOpen ? 'z-40' : 'z-20'
          }`}
        >
          {/* Sidebar toggle — mobile only */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0 sm:hidden"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeft className="h-3.5 w-3.5" />
            )}
          </Button>
          <div className="mx-1 h-4 w-px bg-border/60 sm:hidden" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0"
            onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[56px] text-center text-xs font-semibold text-foreground tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0"
            onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="mx-1 h-4 w-px bg-border/60" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0"
            onClick={() => setScale(Math.max(scale - 0.25, 0.5))}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[36px] text-center text-xs font-semibold text-foreground tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0"
            onClick={() => setScale(Math.min(scale + 0.25, 3))}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <FloatingToolbar />
      <Toaster />
      {isReaderMode && <ReaderMode />}
      <SettingsDialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen} />
      <LibraryPicker open={isLibraryPickerOpen} onOpenChange={setIsLibraryPickerOpen} />
    </TooltipProvider>
  );
}

export default App;
