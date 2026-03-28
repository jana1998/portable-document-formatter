import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { FileStack, Scissors, Trash2, Copy } from 'lucide-react';

interface PageManagementProps {
  children: React.ReactNode;
}

export function PageManagement({ children }: PageManagementProps) {
  const { currentDocument, currentPage } = usePDFStore();
  const [isOpen, setIsOpen] = useState(false);
  const [operation, setOperation] = useState<'merge' | 'split' | 'delete' | 'extract'>('merge');

  const handleMergePDFs = async () => {
    if (!currentDocument) return;

    try {
      // Open file picker for additional PDFs
      // This is a simplified version - in production, you'd need multiple file selection
      const outputPath = await window.electronAPI.saveFile(
        currentDocument.name.replace('.pdf', '_merged.pdf')
      );

      if (outputPath) {
        // In production, allow selecting multiple files
        await window.electronAPI.mergePDFs([currentDocument.path], outputPath);
        alert('PDFs merged successfully!');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to merge PDFs:', error);
      alert('Failed to merge PDFs');
    }
  };

  const handleSplitPDF = async () => {
    if (!currentDocument) return;

    try {
      // For simplicity, split at current page
      const outputPath = await window.electronAPI.saveFile(
        currentDocument.name.replace('.pdf', '_split.pdf')
      );

      if (outputPath) {
        const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
        await window.electronAPI.splitPDF(
          currentDocument.path,
          [[0, currentPage - 1], [currentPage]],
          outputDir
        );
        alert('PDF split successfully!');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to split PDF:', error);
      alert('Failed to split PDF');
    }
  };

  const handleDeletePage = async () => {
    if (!currentDocument) return;

    const confirmed = confirm(`Are you sure you want to delete page ${currentPage}?`);
    if (!confirmed) return;

    try {
      const outputPath = await window.electronAPI.saveFile(
        currentDocument.name.replace('.pdf', '_deleted.pdf')
      );

      if (outputPath) {
        await window.electronAPI.deletePage(currentDocument.path, currentPage, outputPath);
        alert('Page deleted successfully!');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to delete page:', error);
      alert('Failed to delete page');
    }
  };

  const handleExtractPages = async () => {
    if (!currentDocument) return;

    try {
      const outputPath = await window.electronAPI.saveFile(
        currentDocument.name.replace('.pdf', '_extracted.pdf')
      );

      if (outputPath) {
        await window.electronAPI.extractPages(currentDocument.path, [currentPage], outputPath);
        alert('Page extracted successfully!');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to extract page:', error);
      alert('Failed to extract page');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Page Management</DialogTitle>
          <DialogDescription>
            Manage pages in your PDF document
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant={operation === 'merge' ? 'default' : 'outline'}
              onClick={() => setOperation('merge')}
              className="h-24 flex-col gap-2"
            >
              <FileStack className="h-6 w-6" />
              <span>Merge PDFs</span>
            </Button>

            <Button
              variant={operation === 'split' ? 'default' : 'outline'}
              onClick={() => setOperation('split')}
              className="h-24 flex-col gap-2"
            >
              <Scissors className="h-6 w-6" />
              <span>Split PDF</span>
            </Button>

            <Button
              variant={operation === 'delete' ? 'default' : 'outline'}
              onClick={() => setOperation('delete')}
              className="h-24 flex-col gap-2"
            >
              <Trash2 className="h-6 w-6" />
              <span>Delete Page</span>
            </Button>

            <Button
              variant={operation === 'extract' ? 'default' : 'outline'}
              onClick={() => setOperation('extract')}
              className="h-24 flex-col gap-2"
            >
              <Copy className="h-6 w-6" />
              <span>Extract Pages</span>
            </Button>
          </div>

          <div className="border-t pt-4">
            {operation === 'merge' && (
              <p className="text-sm text-muted-foreground">
                Combine multiple PDF files into a single document.
              </p>
            )}
            {operation === 'split' && (
              <p className="text-sm text-muted-foreground">
                Split the current PDF at page {currentPage}.
              </p>
            )}
            {operation === 'delete' && (
              <p className="text-sm text-muted-foreground">
                Delete page {currentPage} from the document.
              </p>
            )}
            {operation === 'extract' && (
              <p className="text-sm text-muted-foreground">
                Extract page {currentPage} to a new PDF file.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              switch (operation) {
                case 'merge':
                  handleMergePDFs();
                  break;
                case 'split':
                  handleSplitPDF();
                  break;
                case 'delete':
                  handleDeletePage();
                  break;
                case 'extract':
                  handleExtractPages();
                  break;
              }
            }}
            disabled={!currentDocument}
          >
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
