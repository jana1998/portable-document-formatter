import React, { useEffect, useState } from 'react';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { FileText, FileUp, Moon, PanelLeft, PanelLeftClose, Save, Settings, Sun } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { SaveDialog } from '@components/features/pages/SaveDialog';
import { formatFileSize, formatRelativeTime } from '@renderer/lib/utils';

const isCompanionClient = (): boolean =>
  typeof window !== 'undefined' && window.electronAPI?.companionMode === true;

export function Toolbar() {
  const {
    currentDocument,
    isDarkMode,
    setIsDarkMode,
    isSidebarOpen,
    setIsSidebarOpen,
    setIsLibraryPickerOpen,
    setIsSettingsDialogOpen,
  } = usePDFStore();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const handleOpenFile = async () => {
    if (isCompanionClient()) {
      setIsLibraryPickerOpen(true);
      return;
    }
    try {
      const fileInfo = await window.electronAPI.openFile();
      if (!fileInfo) return;

      const store = usePDFStore.getState();
      store.setCurrentDocument({
        id: Date.now().toString(),
        name: fileInfo.name,
        path: fileInfo.path,
        pageCount: 0,
        fileSize: fileInfo.size,
        loadedAt: new Date(),
      });

      try {
        const sidecar = await window.electronAPI.loadOCRSidecar(fileInfo.path);
        if (sidecar && sidecar.length > 0) {
          store.hydrateOCRResults(sidecar);
        }
      } catch (ocrErr) {
        console.warn('OCR sidecar load failed:', ocrErr);
      }

    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const documentDetails = currentDocument
    ? `${formatFileSize(currentDocument.fileSize)} • opened ${formatRelativeTime(
        new Date(currentDocument.loadedAt)
      )}`
    : 'Focused desktop PDF editing workspace';

  return (
    <>
      <header className="toolbar-shell">
        <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div className="hidden min-w-0 border-l border-border/60 pl-3 leading-tight sm:block">
              <p className="truncate text-[12px] font-medium text-foreground">
                {currentDocument?.name ?? 'Production PDF workspace'}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{documentDetails}</p>
              {currentDocument && <LiveClock />}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              onClick={handleOpenFile}
              className="h-8 w-8 gap-1.5 px-0 text-xs sm:w-auto sm:px-3"
              aria-label="Open PDF"
            >
              <FileUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open PDF</span>
            </Button>

            <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-0.5">
              {currentDocument ? (
                <Tip label="Save PDF">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setSaveDialogOpen(true)}
                    aria-label="Save PDF"
                    className="hidden h-7 w-7 sm:inline-flex"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              ) : null}

              <Tip label={isDarkMode ? 'Light mode' : 'Dark mode'}>
                <Button
                  variant="toolbar"
                  size="icon"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  aria-label="Toggle dark mode"
                  className="h-7 w-7"
                >
                  {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </Button>
              </Tip>

              {!isCompanionClient() && (
                <Tip label="Settings">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setIsSettingsDialogOpen(true)}
                    aria-label="Settings"
                    className="hidden h-7 w-7 sm:inline-flex"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}

              {currentDocument && (
                <Tip label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                    className="hidden h-7 w-7 sm:inline-flex"
                  >
                    {isSidebarOpen ? (
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    ) : (
                      <PanelLeft className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </Tip>
              )}
            </div>
          </div>
        </div>
      </header>

      {saveDialogOpen && <SaveDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} />}
    </>
  );
}

function Tip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="truncate text-[10px] text-muted-foreground tabular-nums">
      {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      {' · '}
      {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </p>
  );
}
