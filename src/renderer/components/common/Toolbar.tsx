import React, { useState } from 'react';
import { Button } from '@components/ui/button';
import { Slider } from '@components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Circle,
  FileEdit,
  FileText,
  FileUp,
  Highlighter,
  Image as ImageIcon,
  MessageSquare,
  Minus,
  Moon,
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
    isToolbarCollapsed,
    isDarkMode,
    setCurrentPage,
    setScale,
    setRotation,
    setIsToolbarCollapsed,
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
        {/* Top Row: Branding & Primary Actions */}
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
              <FileText className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-muted-foreground">
                • PDF Editor
              </p>
              <h1 className="truncate text-base font-medium tracking-tight text-foreground">
                {currentDocument?.name ?? 'Production Workspace'}
              </h1>
              {!isToolbarCollapsed && (
                <p className="truncate text-xs font-normal text-muted-foreground">{documentDetails}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="default"
              onClick={handleOpenFile}
              className="gap-2"
              aria-label="Open PDF"
            >
              <FileUp className="h-4 w-4" />
              <span className="hidden sm:inline">Open PDF</span>
            </Button>

            {currentDocument ? (
              <ToolbarButton label="Save PDF">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSaveDialogOpen(true)}
                  aria-label="Save PDF"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </ToolbarButton>
            ) : null}

            <div className="h-6 w-px bg-border/50" />

            <ToolbarButton label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Button
                variant="toolbar"
                size="icon"
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </ToolbarButton>

            {currentDocument ? (
              <>
                <div className="h-6 w-px bg-border/50" />
                <ToolbarButton label={isToolbarCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}>
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
                    aria-label="Toggle toolbar"
                  >
                    {isToolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </ToolbarButton>
              </>
            ) : null}
          </div>
        </div>

        {/* Bottom Row: Document Controls (only when document is loaded and toolbar is not collapsed) */}
        {currentDocument && !isToolbarCollapsed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            {/* Left: Navigation & View Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Page Navigation Pill */}
              <div className="flex items-center gap-1.5 rounded-pill border border-border/50 bg-muted/60 p-1.5">
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

                <div className="flex min-w-[100px] items-center justify-center rounded-full bg-background/80 px-4 py-1.5 text-sm font-semibold text-foreground">
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

              {/* Zoom Controls Pill */}
              <div className="flex items-center gap-2 rounded-pill border border-border/50 bg-muted/60 px-3 py-2">
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

                <span className="min-w-[52px] text-center text-sm font-semibold text-foreground">
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

            {/* Right: Tool Groups */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Editing Tools Pill */}
              <div className="flex items-center gap-1 rounded-pill border border-border/50 bg-muted/60 p-1.5">
                {toolOptions.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              {/* Annotation Tools Pill */}
              <div className="flex items-center gap-1 rounded-pill border border-border/50 bg-muted/60 p-1.5">
                {annotationTools.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              {/* Utility Tools Pill */}
              <div className="flex items-center gap-1 rounded-pill border border-border/50 bg-muted/60 p-1.5">
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
