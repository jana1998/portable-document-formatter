import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { useToast } from '@renderer/hooks/use-toast';

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaveDialog({ open, onOpenChange }: SaveDialogProps) {
  const { currentDocument, totalPages, annotations, textElements, imageElements } = usePDFStore();
  const [saveOption, setSaveOption] = useState<'all' | 'specific'>('all');
  const [pageRanges, setPageRanges] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!currentDocument) return;

    setIsSaving(true);

    try {
      const defaultPath = currentDocument.path.replace('.pdf', '_edited.pdf');
      const savePath = await window.electronAPI.saveFile(defaultPath);

      if (!savePath) {
        setIsSaving(false);
        return;
      }

      let pagesToSave: number[] = [];

      if (saveOption === 'all') {
        pagesToSave = Array.from({ length: totalPages }, (_, i) => i + 1);
      } else {
        // Parse page ranges like "1-3, 5, 7-9"
        pagesToSave = parsePageRanges(pageRanges, totalPages);
      }

      if (pagesToSave.length === 0) {
        toast({
          title: "Invalid Page Range",
          description: "Please specify valid page ranges (e.g., 1-3, 5, 7-9)",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      // Apply all modifications (text, images, annotations) to the PDF
      // Convert Maps to plain objects for IPC transfer
      const modificationsForIPC = {
        textElements: Array.from(textElements.entries()),
        imageElements: Array.from(imageElements.entries()),
        annotations: Array.from(annotations.entries()),
      };

      // If saving specific pages, first extract pages then apply modifications
      if (saveOption === 'specific' && pagesToSave.length < totalPages) {
        // Create a temporary file with extracted pages
        const tempPath = currentDocument.path.replace('.pdf', '_temp.pdf');
        await window.electronAPI.extractPages(currentDocument.path, pagesToSave, tempPath);

        // Filter modifications to only include the selected pages
        // Re-map page numbers for extracted pages (1-based indexing)
        const pageMapping = new Map(pagesToSave.map((origPage, newIndex) => [origPage, newIndex + 1]));
        const filteredModifications = {
          textElements: Array.from(textElements.entries())
            .filter(([page]) => pagesToSave.includes(page))
            .map(([page, elements]) => [pageMapping.get(page)!, elements]),
          imageElements: Array.from(imageElements.entries())
            .filter(([page]) => pagesToSave.includes(page))
            .map(([page, elements]) => [pageMapping.get(page)!, elements]),
          annotations: Array.from(annotations.entries())
            .filter(([page]) => pagesToSave.includes(page))
            .map(([page, anns]) => [pageMapping.get(page)!, anns]),
        };

        // Apply modifications to the extracted pages
        await window.electronAPI.applyModifications(tempPath, filteredModifications, savePath);
      } else {
        // Apply modifications to all pages
        await window.electronAPI.applyModifications(
          currentDocument.path,
          modificationsForIPC,
          savePath
        );
      }

      toast({
        title: "PDF Saved Successfully",
        description: `File saved to: ${savePath}`,
        variant: "success",
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Save Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const parsePageRanges = (ranges: string, maxPage: number): number[] => {
    const pages = new Set<number>();
    const parts = ranges.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(maxPage, end); i++) {
            pages.add(i);
          }
        }
      } else {
        const pageNum = parseInt(part);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPage) {
          pages.add(pageNum);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save PDF</DialogTitle>
          <DialogDescription>
            Choose which pages to save and where to save the file
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Save Options</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="save-all"
                  name="save-option"
                  checked={saveOption === 'all'}
                  onChange={() => setSaveOption('all')}
                  className="h-4 w-4"
                />
                <label htmlFor="save-all" className="text-sm cursor-pointer">
                  Save all pages ({totalPages} pages)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="save-specific"
                  name="save-option"
                  checked={saveOption === 'specific'}
                  onChange={() => setSaveOption('specific')}
                  className="h-4 w-4"
                />
                <label htmlFor="save-specific" className="text-sm cursor-pointer">
                  Save specific pages
                </label>
              </div>
            </div>
          </div>

          {saveOption === 'specific' && (
            <div className="grid gap-2">
              <label htmlFor="page-ranges" className="text-sm font-medium">
                Page Ranges
              </label>
              <input
                type="text"
                id="page-ranges"
                placeholder="e.g., 1-3, 5, 7-9"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={pageRanges}
                onChange={(e) => setPageRanges(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter page numbers separated by commas. Use hyphens for ranges.
              </p>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">What will be saved:</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>✓ Original PDF content</li>
              <li>✓ Annotations ({Array.from(annotations.values()).flat().length} total)</li>
              <li>✓ Text elements ({Array.from(textElements.values()).flat().length} total)</li>
              <li>✓ Image elements ({Array.from(imageElements.values()).flat().length} total)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !currentDocument}>
            {isSaving ? 'Saving...' : 'Save PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
