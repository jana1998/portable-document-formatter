import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText, FileUp, Layers3, Wand2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { TooltipProvider } from '@components/ui/tooltip';
import { Toaster } from '@components/ui/toaster';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { Toolbar } from '@components/common/Toolbar';
import { Sidebar } from '@components/common/Sidebar';
import { PDFViewer } from '@components/features/viewer/PDFViewer';
import { EmptyState } from '@components/ui/empty-state';
import { PanelCard, PanelCardContent, PanelCardDescription, PanelCardHeader, PanelCardTitle } from '@components/ui/panel-card';
import { formatFileSize } from '@renderer/lib/utils';
import { usePDFStore } from '@renderer/store/usePDFStore';

function App() {
  const { currentDocument, isSidebarOpen, setIsDarkMode, error, currentTool } = usePDFStore();
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
        <div className="panel-surface w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
            <LoadingSpinner size="lg" />
          </div>
          <p className="text-lg font-semibold text-foreground">Preparing workspace</p>
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

        <div className="relative z-10 mt-3 flex min-h-0 flex-1 gap-3">
          <div
            className={`min-w-0 overflow-hidden transition-[width,opacity,margin] duration-300 ${
              isSidebarOpen ? 'w-[22rem] opacity-100' : 'm-0 w-0 opacity-0'
            }`}
          >
            <Sidebar />
          </div>

          <main className="min-w-0 flex-1">
            {currentDocument ? (
              <div className="flex h-full flex-col gap-3">
                {error ? (
                  <div className="panel-surface flex items-center gap-3 border-destructive/30 px-4 py-3 text-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Rendering issue detected</p>
                      <p className="text-muted-foreground">{error}</p>
                    </div>
                  </div>
                ) : null}

                <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <PDFViewer />

                  <PanelCard className="hidden xl:flex xl:flex-col">
                    <PanelCardHeader className="pb-2">
                      <div>
                        <PanelCardTitle>Document Overview</PanelCardTitle>
                        <PanelCardDescription>
                          Fast context for the active editing session.
                        </PanelCardDescription>
                      </div>
                    </PanelCardHeader>

                    <PanelCardContent className="flex flex-1 flex-col gap-3">
                      <StatusTile
                        icon={FileText}
                        label="File"
                        value={currentDocument.name}
                        detail={formatFileSize(currentDocument.fileSize)}
                      />
                      <StatusTile
                        icon={Layers3}
                        label="Mode"
                        value={toolLabels[currentTool] ?? 'Select'}
                        detail="Switch tools from the toolbar"
                      />
                      <StatusTile
                        icon={Wand2}
                        label="Ready"
                        value="Edit, annotate, search"
                        detail="The workspace is optimized for quick iteration"
                      />
                    </PanelCardContent>
                  </PanelCard>
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
                          <Button onClick={handleOpenFile} className="gap-2">
                            <FileUp className="h-4 w-4" />
                            Open PDF
                          </Button>
                        )}
                        className="w-full max-w-2xl border-white/50 bg-white/58 px-8 py-14 shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-cyan-400/10 dark:bg-[linear-gradient(180deg,rgba(9,24,32,0.78),rgba(4,12,18,0.88))] dark:shadow-[0_28px_100px_rgba(2,8,14,0.6)]"
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

const toolLabels: Record<string, string> = {
  select: 'Selection tool',
  highlight: 'Highlight review',
  text: 'Text insertion',
  image: 'Image placement',
};

function StatusTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="panel-muted flex items-start gap-3 p-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default App;
