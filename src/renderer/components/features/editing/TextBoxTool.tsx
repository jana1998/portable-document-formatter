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

interface TextBoxToolProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
}

export function TextBoxTool({ isOpen, onClose, position }: TextBoxToolProps) {
  const { currentDocument, currentPage, addTextElement } = usePDFStore();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(12);
  const [color, setColor] = useState('#000000');

  const handleAdd = () => {
    if (!currentDocument || !position || !text.trim()) return;

    const textElement = {
      id: `text_${Date.now()}`,
      pageNumber: currentPage,
      x: position.x,
      y: position.y,
      width: 200,
      height: fontSize * 1.5,
      text: text.trim(),
      fontSize,
      fontFamily: 'Helvetica',
      color,
    };

    addTextElement(textElement);

    // Save to PDF via IPC
    window.electronAPI
      .addTextToPDF(
        currentDocument.path,
        currentPage,
        text.trim(),
        position.x,
        position.y,
        { fontSize, color: hexToRgb(color) },
        currentDocument.path.replace('.pdf', '_modified.pdf')
      )
      .then(() => {
        console.log('Text added to PDF successfully');
      })
      .catch((error) => {
        console.error('Failed to add text to PDF:', error);
      });

    setText('');
    onClose();
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Text Box</DialogTitle>
          <DialogDescription>
            Enter the text you want to add to the PDF
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="text" className="text-sm font-medium">
              Text
            </label>
            <textarea
              id="text"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label htmlFor="fontSize" className="text-sm font-medium">
                Font Size
              </label>
              <input
                type="number"
                id="fontSize"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value) || 12)}
                min="8"
                max="72"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="color" className="text-sm font-medium">
                Color
              </label>
              <input
                type="color"
                id="color"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          {position && (
            <div className="text-xs text-muted-foreground">
              Position: X: {Math.round(position.x)}, Y: {Math.round(position.y)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!text.trim()}>
            Add Text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
