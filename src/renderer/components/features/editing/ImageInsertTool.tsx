import React, { useState, useRef } from 'react';
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
import { ImageIcon } from 'lucide-react';

interface ImageInsertToolProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
}

export function ImageInsertTool({ isOpen, onClose, position }: ImageInsertToolProps) {
  const { currentDocument, currentPage, addImageElement } = usePDFStore();
  const [imageData, setImageData] = useState<string | null>(null);
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(150);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageData(result);

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        setWidth(200);
        setHeight(Math.round(200 / aspectRatio));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = () => {
    if (!currentDocument || !position || !imageData) return;

    const imageElement = {
      id: `image_${Date.now()}`,
      pageNumber: currentPage,
      x: position.x,
      y: position.y,
      width,
      height,
      data: imageData,
    };

    addImageElement(imageElement);

    // Save to PDF via IPC
    window.electronAPI
      .addImageToPDF(
        currentDocument.path,
        currentPage,
        imageData,
        position.x,
        position.y,
        width,
        height,
        currentDocument.path.replace('.pdf', '_modified.pdf')
      )
      .then(() => {
        console.log('Image added to PDF successfully');
      })
      .catch((error) => {
        console.error('Failed to add image to PDF:', error);
      });

    setImageData(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Insert Image</DialogTitle>
          <DialogDescription>
            Choose an image to add to the PDF
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-32 border-dashed"
            >
              {imageData ? (
                <img
                  src={imageData}
                  alt="Selected"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to select image
                  </span>
                </div>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {imageData && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="width" className="text-sm font-medium">
                  Width (px)
                </label>
                <input
                  type="number"
                  id="width"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 200)}
                  min="10"
                  max="800"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="height" className="text-sm font-medium">
                  Height (px)
                </label>
                <input
                  type="number"
                  id="height"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 150)}
                  min="10"
                  max="800"
                />
              </div>
            </div>
          )}

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
          <Button onClick={handleAdd} disabled={!imageData}>
            Insert Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
