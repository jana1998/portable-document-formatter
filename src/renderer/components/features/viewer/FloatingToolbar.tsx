import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Circle,
  FileEdit,
  Highlighter,
  Image as ImageIcon,
  MessageSquare,
  Minus,
  Pencil,
  Pointer,
  RotateCw,
  ScanText,
  Search,
  Square,
  Stamp,
  Type,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { OCRDialog } from '@components/features/ocr/OCRDialog';
import { cn } from '@renderer/lib/utils';

const editTools = [
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

export function FloatingToolbar() {
  const {
    currentDocument,
    currentTool,
    setCurrentTool,
    isReaderMode,
    currentPage,
    setIsReaderMode,
    setReaderEntryPage,
    setSidebarTab,
    setIsSidebarOpen,
    rotation,
    setRotation,
  } = usePDFStore();

  const [ocrOpen, setOcrOpen] = useState(false);
  const isCompanion = typeof window !== 'undefined' && window.electronAPI?.companionMode === true;

  if (!currentDocument || isReaderMode) return null;

  return (
    <>
      <div className="fixed right-4 top-1/2 z-20 -translate-y-1/2 flex flex-col gap-0.5 rounded-[1.5rem] border border-border/70 bg-background/95 p-1.5 shadow-[0_8px_32px_rgba(20,20,19,0.10)] backdrop-blur-sm max-h-[calc(100vh-140px)] overflow-y-auto">
        {/* Edit tools */}
        {editTools.map(({ id, label, icon: Icon }) => (
          <Tip key={id} label={label}>
            <Button
              variant={currentTool === id ? 'default' : 'toolbar'}
              size="icon"
              onClick={() => setCurrentTool(id)}
              className={cn('h-7 w-7', currentTool === id && 'rounded-full')}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </Tip>
        ))}

        <Divider />

        {/* Annotation tools */}
        {annotationTools.map(({ id, label, icon: Icon }) => (
          <Tip key={id} label={label}>
            <Button
              variant={currentTool === id ? 'default' : 'toolbar'}
              size="icon"
              onClick={() => setCurrentTool(id)}
              className={cn('h-7 w-7', currentTool === id && 'rounded-full')}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </Tip>
        ))}

        <Divider />

        {/* Document actions */}
        <Tip label="Reader mode">
          <Button
            variant="toolbar"
            size="icon"
            onClick={() => {
              setReaderEntryPage(currentPage);
              setIsReaderMode(true);
            }}
            aria-label="Reader mode"
            className="h-7 w-7"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        <Tip label="Search document">
          <Button
            variant="toolbar"
            size="icon"
            onClick={() => {
              setSidebarTab('search');
              setIsSidebarOpen(true);
            }}
            aria-label="Search document"
            className="h-7 w-7"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        <Tip label="Rotate page">
          <Button
            variant="toolbar"
            size="icon"
            onClick={() => setRotation((rotation + 90) % 360)}
            aria-label="Rotate page"
            className="h-7 w-7"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        {!isCompanion && (
          <Tip label="OCR">
            <Button
              variant="toolbar"
              size="icon"
              onClick={() => setOcrOpen(true)}
              aria-label="OCR"
              className="h-7 w-7"
            >
              <ScanText className="h-3.5 w-3.5" />
            </Button>
          </Tip>
        )}
      </div>

      {ocrOpen && <OCRDialog open={ocrOpen} onOpenChange={setOcrOpen} />}
    </>
  );
}

function Tip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div className="mx-auto my-0.5 h-px w-5 bg-border/60" />;
}
