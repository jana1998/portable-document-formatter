import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText, FileUp } from 'lucide-react';
import { Button } from '@components/ui/button';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/toaster';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { Toolbar } from '@components/common/Toolbar';
import { Sidebar } from '@components/common/Sidebar';
import { PDFViewer } from '@components/features/viewer/PDFViewer';
import { EmptyState } from '@components/ui/empty-state';
import { PanelCard, PanelCardContent } from '@components/ui/panel-card';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { cn } from '@renderer/lib/utils';

function App() {
  const { currentDocument, isSidebarOpen, isToolbarCollapsed, setIsDarkMode, error } = usePDFStore();
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-button bg-primary/10 text-primary">
            <LoadingSpinner size="lg" />
          </div>
          <h2 className="text-lg font-medium tracking-tight text-foreground">Preparing workspace</h2>
          <p className="mt-3 text-sm font-normal leading-relaxed text-muted-foreground">
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

        <div className={cn(
          "relative z-10 flex min-h-0 flex-1 gap-3 transition-[margin] duration-200",
          isToolbarCollapsed ? "mt-2" : "mt-3"
        )}>
          <div className="h-full w-[22rem] shrink-0">
            <Sidebar />
          </div>

          <main className="min-w-0 flex-1">
            {currentDocument ? (
              <div className="flex h-full flex-col gap-3">
                {error ? (
                  <div className="panel-surface flex items-center gap-4 border-destructive/30 px-5 py-4 text-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-button bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium tracking-tight text-foreground">Rendering issue detected</p>
                      <p className="mt-0.5 font-normal text-muted-foreground">{error}</p>
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1">
                  <PDFViewer />
                </div>
              </div>
            ) : (
              <PanelCard className="h-full overflow-hidden">
                <PanelCardContent className="h-full p-0">
                  <div className="landing-stage">
                    <div className="landing-grid" />
                    <div className="landing-orb landing-orb-one" />
                    <div className="landing-orb landing-orb-two" />

                    <div className="landing-content">
                      <EmptyState
                        icon={FileText}
                        title="Open a PDF to begin"
                        description="Your workspace is ready for markup, text edits, image inserts, OCR, and search. Start with a document and the editor will expand into the full production layout."
                        action={(
                          <Button onClick={handleOpenFile} className="gap-2" size="lg">
                            <FileUp className="h-4 w-4" />
                            Open PDF
                          </Button>
                        )}
                        className="w-full max-w-2xl border-border/30 bg-card/70 px-10 py-16 shadow-[0_24px_48px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-border/20 dark:bg-card/60 dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)]"
                      />
                    </div>
                  </div>
                </PanelCardContent>
              </PanelCard>
            )}
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
