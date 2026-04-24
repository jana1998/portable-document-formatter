import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileUp, PanelLeft } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/toaster';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { Toolbar } from '@components/common/Toolbar';
import { Sidebar } from '@components/common/Sidebar';
import { PDFViewer } from '@components/features/viewer/PDFViewer';
import { usePDFStore } from '@renderer/store/usePDFStore';

function App() {
  const {
    currentDocument,
    isSidebarOpen,
    setIsSidebarOpen,
    setIsDarkMode,
    error,
  } = usePDFStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    setIsReady(true);
  }, [setIsDarkMode]);

  const handleOpenFile = async () => {
    try {
      const fileInfo = await window.electronAPI.openFile();
      if (!fileInfo) return;

      const pdfDoc = {
        id: Date.now().toString(),
        name: fileInfo.name,
        path: fileInfo.path,
        pageCount: 0,
        fileSize: fileInfo.size,
        loadedAt: new Date(),
      };

      usePDFStore.getState().setCurrentDocument(pdfDoc);
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
      <div className="app-shell">
        <Toolbar />

        <div className="relative z-10 mt-4 flex min-h-0 flex-1 gap-4">
          <div
            className={`min-w-0 overflow-hidden transition-[width,opacity,margin] duration-300 ${
              isSidebarOpen ? 'w-[22rem] opacity-100' : 'm-0 w-0 opacity-0'
            }`}
          >
            <Sidebar />
          </div>

          {currentDocument && !isSidebarOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 self-start rounded-full"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Show sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Show sidebar</TooltipContent>
            </Tooltip>
          ) : null}

          <main className="min-w-0 flex-1">
            {currentDocument ? (
              <div className="flex h-full flex-col gap-3">
                {error ? (
                  <div className="panel-surface flex items-center gap-3 border-destructive/30 px-4 py-3 text-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Rendering issue detected</p>
                      <p className="text-muted-foreground">{error}</p>
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1">
                  <PDFViewer />
                </div>
              </div>
            ) : (
              <div className="landing-stage">
                <div className="landing-watermark">Portable Document Formatter</div>
                <div className="landing-content">
                  <div className="w-full max-w-xl text-center">
                    <span className="eyebrow mb-5 justify-center">Workspace</span>
                    <h1 className="display-hero mb-4">Open a PDF to begin.</h1>
                    <p className="mx-auto mb-10 max-w-md text-base leading-relaxed text-muted-foreground">
                      Markup, in-place text edits, image inserts, OCR, and
                      search — all running locally on your machine.
                    </p>
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
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
