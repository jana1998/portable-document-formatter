import React, { useState } from 'react';
import { Button } from '@components/ui/button';
import { Slider } from '@components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileEdit,
  FileText,
  FileUp,
  Highlighter,
  Image as ImageIcon,
  MessageSquare,
  Minus,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Pointer,
  RotateCw,
  Save,
  ScanText,
  Search,
  Square,
  Stamp,
  Sun,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { SaveDialog } from '@components/features/pages/SaveDialog';
import { OCRDialog } from '@components/features/ocr/OCRDialog';
import { cn, formatFileSize, formatRelativeTime } from '@renderer/lib/utils';

const toolOptions = [
  { id: 'select', label: 'Select', icon: Pointer },
  { id: 'edit-text', label: 'Edit Text', icon: FileEdit },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'text', label: 'Add Text', icon: Type },
  { id: 'image', label: 'Image', icon: ImageIcon },
] as const;

const annotationTools = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'freehand', label: 'Draw', icon: Pencil },
  { id: 'note', label: 'Note', icon: MessageSquare },
  { id: 'stamp', label: 'Stamp', icon: Stamp },
] as const;

export function Toolbar() {
  const {
    currentDocument,
    currentPage,
    totalPages,
    scale,
    rotation,
    isSidebarOpen,
    isDarkMode,
    setCurrentPage,
    setScale,
    setRotation,
    setIsSidebarOpen,
    setCurrentTool,
    currentTool,
    setSidebarTab,
    setIsDarkMode,
  } = usePDFStore();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);

  const handleOpenFile = async () => {
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(13,148,136,0.28)]">
              <FileText className="h-5 w-5" />
            </div>

            {currentDocument ? (
              <ToolbarButton label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
                <Button
                  variant="toolbar"
                  size="icon"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  aria-label="Toggle sidebar"
                >
                  {isSidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                </Button>
              </ToolbarButton>
            ) : null}

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                Portable Document Formatter
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {currentDocument?.name ?? 'Production PDF workspace'}
              </p>
              <p className="truncate text-xs text-muted-foreground">{documentDetails}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="toolbar"
              onClick={handleOpenFile}
              className="gap-2"
              aria-label="Open PDF"
            >
              <FileUp className="h-4 w-4" />
              <span>Open PDF</span>
            </Button>

            {currentDocument ? (
              <ToolbarButton label="Save PDF">
                <Button
                  variant="soft"
                  size="icon"
                  onClick={() => setSaveDialogOpen(true)}
                  aria-label="Save PDF"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </ToolbarButton>
            ) : null}

            <ToolbarButton label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Button
                variant={isDarkMode ? 'soft' : 'toolbar'}
                size="icon"
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </ToolbarButton>
          </div>
        </div>

        {currentDocument ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/70 bg-background/70 p-1.5">
                <ToolbarButton label="Previous page">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </ToolbarButton>

                <div className="meta-pill min-w-[92px] justify-center text-foreground">
                  {`${currentPage} / ${totalPages}`}
                </div>

                <ToolbarButton label="Next page">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </ToolbarButton>
              </div>

              <div className="flex items-center gap-2 rounded-[1.2rem] border border-border/70 bg-background/70 px-3 py-2">
                <ToolbarButton label="Zoom out">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setScale(Math.max(scale - 0.25, 0.5))}
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </ToolbarButton>

                <div className="w-28">
                  <Slider
                    value={[scale * 100]}
                    onValueChange={(value) => setScale(value[0] / 100)}
                    min={50}
                    max={300}
                    step={25}
                    aria-label="Zoom level"
                  />
                </div>

                <span className="min-w-[48px] text-sm font-semibold text-foreground">
                  {Math.round(scale * 100)}%
                </span>

                <ToolbarButton label="Zoom in">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setScale(Math.min(scale + 0.25, 3))}
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </ToolbarButton>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/70 bg-background/70 p-1.5">
                {toolOptions.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      className={cn(
                        currentTool === id && 'shadow-[0_10px_24px_rgba(13,148,136,0.2)]'
                      )}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/70 bg-background/70 p-1.5">
                {annotationTools.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      className={cn(
                        currentTool === id && 'shadow-[0_10px_24px_rgba(13,148,136,0.2)]'
                      )}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-[1.2rem] border border-border/70 bg-background/70 p-1.5">
                <ToolbarButton label="Search document">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => {
                      setSidebarTab('search');
                      setIsSidebarOpen(true);
                    }}
                    aria-label="Search document"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </ToolbarButton>

                <ToolbarButton label="Rotate page">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setRotation((rotation + 90) % 360)}
                    aria-label="Rotate page"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </ToolbarButton>

                <ToolbarButton label="OCR">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setOcrDialogOpen(true)}
                    aria-label="OCR"
                  >
                    <ScanText className="h-4 w-4" />
                  </Button>
                </ToolbarButton>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {saveDialogOpen ? (
        <SaveDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} />
      ) : null}
      {ocrDialogOpen ? (
        <OCRDialog open={ocrDialogOpen} onOpenChange={setOcrDialogOpen} />
      ) : null}
    </>
  );
}

function ToolbarButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
