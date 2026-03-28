import React, { useState } from 'react';
import { Button } from '@components/ui/button';
import { Separator } from '@components/ui/separator';
import { Slider } from '@components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  FileUp,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Type,
  Image as ImageIcon,
  Search,
  ScanText,
  PanelLeftClose,
  PanelLeft,
  Moon,
  Sun,
} from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { SaveDialog } from '@components/features/pages/SaveDialog';
import { OCRDialog } from '@components/features/ocr/OCRDialog';

export function Toolbar() {
  const {
    currentDocument,
    currentPage,
    totalPages,
    scale,
    isSidebarOpen,
    isDarkMode,
    setCurrentPage,
    setScale,
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
      if (fileInfo) {
        const data = await window.electronAPI.readFile(fileInfo.path);
        const pdfDoc = {
          id: Date.now().toString(),
          name: fileInfo.name,
          path: fileInfo.path,
          pageCount: 0, // Will be updated after loading
          fileSize: fileInfo.size,
          loadedAt: new Date(),
        };
        usePDFStore.getState().setCurrentDocument(pdfDoc);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.25, 0.5));
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-3 gap-1.5">
      {/* File operations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={handleOpenFile}>
            <FileUp className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open PDF</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!currentDocument}
          >
            <Save className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save PDF</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle Sidebar</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Navigation */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousPage}
            disabled={!currentDocument || currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Previous Page</TooltipContent>
      </Tooltip>

      <div className="text-sm text-muted-foreground min-w-[100px] text-center">
        {currentDocument ? `${currentPage} / ${totalPages}` : '-'}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPage}
            disabled={!currentDocument || currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Next Page</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Zoom controls */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={!currentDocument}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom Out</TooltipContent>
      </Tooltip>

      <div className="w-24">
        <Slider
          value={[scale * 100]}
          onValueChange={(value) => setScale(value[0] / 100)}
          min={50}
          max={300}
          step={25}
          disabled={!currentDocument}
        />
      </div>

      <span className="text-sm text-muted-foreground min-w-[50px]">
        {Math.round(scale * 100)}%
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={!currentDocument}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom In</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Tools */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={currentTool === 'highlight' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setCurrentTool('highlight')}
            disabled={!currentDocument}
          >
            <Highlighter className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Highlight Text</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={currentTool === 'text' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setCurrentTool('text')}
            disabled={!currentDocument}
          >
            <Type className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add Text Box (Click on PDF)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={currentTool === 'image' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setCurrentTool('image')}
            disabled={!currentDocument}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert Image (Click on PDF)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Search and OCR */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSidebarTab('search');
              setIsSidebarOpen(true);
            }}
            disabled={!currentDocument}
          >
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Search in PDF</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOcrDialogOpen(true)}
            disabled={!currentDocument}
          >
            <ScanText className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>OCR - Extract Text</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Theme toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
      </Tooltip>

      {/* Dialogs */}
      <SaveDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
      />
      <OCRDialog
        isOpen={ocrDialogOpen}
        onClose={() => setOcrDialogOpen(false)}
      />
    </div>
  );
}
