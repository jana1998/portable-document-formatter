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
  Pencil,
  Pointer,
  RotateCw,
  Save,
  ScanText,
  Search,
  Settings as SettingsIcon,
  Sparkles,
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
import { ChatPanel } from '@components/features/chat/ChatPanel';
import { LLMSettingsDialog } from '@components/features/settings/LLMSettingsDialog';
import { ensureEmbeddingsForDocument } from '@renderer/services/embeddings-indexer';
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
  const [chatOpen, setChatOpen] = useState(false);
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);

  const handleOpenFile = async () => {
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

      // Restore any prior OCR results saved alongside the PDF.
      try {
        const sidecar = await window.electronAPI.loadOCRSidecar(fileInfo.path);
        if (sidecar && sidecar.length > 0) {
          store.hydrateOCRResults(sidecar);
        }
      } catch (ocrErr) {
        console.warn('OCR sidecar load failed:', ocrErr);
      }

      // Semantic index: hydrate from sidecar if present, else build in the
      // background using whatever text we can gather (OCR or pdfjs text layer).
      void ensureEmbeddingsForDocument(fileInfo.path);
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          {/* Brand + document info */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <FileText className="h-[18px] w-[18px]" />
            </div>

            <div className="min-w-0 border-l border-border/60 pl-3 leading-tight">
              <p className="truncate text-[13px] font-medium text-foreground">
                {currentDocument?.name ?? 'Production PDF workspace'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{documentDetails}</p>
            </div>
          </div>

          {/* Primary CTA + utility group */}
          <div className="flex items-center gap-2">
            <Button
              size="toolbar"
              onClick={handleOpenFile}
              className="gap-2"
              aria-label="Open PDF"
            >
              <FileUp className="h-4 w-4" />
              <span>Open PDF</span>
            </Button>

            <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1">
              {currentDocument ? (
                <ToolbarButton label="Save PDF">
                  <Button
                    variant="toolbar"
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
                  variant="toolbar"
                  size="icon"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  aria-label="Toggle dark mode"
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </ToolbarButton>
            </div>
          </div>
        </div>

        {currentDocument ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1">
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

              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5">
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
              <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1">
                {toolOptions.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      className={cn(
                        currentTool === id && 'rounded-full'
                      )}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1">
                {annotationTools.map(({ id, label, icon: Icon }) => (
                  <ToolbarButton key={id} label={label}>
                    <Button
                      variant={currentTool === id ? 'default' : 'toolbar'}
                      size="icon"
                      onClick={() => setCurrentTool(id)}
                      className={cn(
                        currentTool === id && 'rounded-full'
                      )}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </ToolbarButton>
                ))}
              </div>

              <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/60 p-1">
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

                <ToolbarButton label="Chat with PDF">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setChatOpen(true)}
                    aria-label="Chat with PDF"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </ToolbarButton>

                <ToolbarButton label="AI settings">
                  <Button
                    variant="toolbar"
                    size="icon"
                    onClick={() => setLlmSettingsOpen(true)}
                    aria-label="AI settings"
                  >
                    <SettingsIcon className="h-4 w-4" />
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
      <LLMSettingsDialog open={llmSettingsOpen} onOpenChange={setLlmSettingsOpen} />
      <ChatPanel open={chatOpen} onOpenChange={setChatOpen} onOpenSettings={() => setLlmSettingsOpen(true)} />
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
