import React, { useState } from 'react';
import { Button } from '@components/ui/button';
import { Trash2, Eye, Edit } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';

export function AnnotationsPanel() {
  const { annotations, deleteAnnotation, updateAnnotation, setCurrentPage, setSelectedAnnotationId } = usePDFStore();
  const [editingAnnotation, setEditingAnnotation] = useState<{ id: string; comment: string } | null>(null);

  const allAnnotations = Array.from(annotations.entries()).flatMap(([pageNumber, pageAnnotations]) =>
    pageAnnotations.map((annotation) => ({ ...annotation, pageNumber }))
  );

  const handleAnnotationClick = (pageNumber: number, annotationId: string) => {
    setCurrentPage(pageNumber);
    setSelectedAnnotationId(annotationId);
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    deleteAnnotation(annotationId);
  };

  const handleEditClick = (annotation: any) => {
    setEditingAnnotation({
      id: annotation.id,
      comment: annotation.data.comment || annotation.data.text || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingAnnotation) return;

    // Find the annotation across all pages
    let foundAnnotation: any = null;
    for (const [_, pageAnnotations] of annotations.entries()) {
      const ann = pageAnnotations.find(a => a.id === editingAnnotation.id);
      if (ann) {
        foundAnnotation = ann;
        break;
      }
    }

    if (foundAnnotation) {
      updateAnnotation(editingAnnotation.id, {
        data: {
          ...foundAnnotation.data,
          comment: editingAnnotation.comment,
        },
        updatedAt: new Date(),
      });
    }

    setEditingAnnotation(null);
  };

  if (allAnnotations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No annotations yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allAnnotations.map((annotation) => (
        <div
          key={annotation.id}
          className="p-3 border rounded-md hover:bg-accent cursor-pointer transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: annotation.color }}
                />
                <span className="text-sm font-medium capitalize">{annotation.type}</span>
              </div>
              <p className="text-xs text-muted-foreground">Page {annotation.pageNumber}</p>
              {annotation.data.text && (
                <p className="text-sm mt-1 line-clamp-2">{annotation.data.text}</p>
              )}
              {annotation.data.comment && (
                <p className="text-sm mt-1 text-muted-foreground italic">
                  Note: {annotation.data.comment}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAnnotationClick(annotation.pageNumber, annotation.id)}
              >
                <Eye className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEditClick(annotation)}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDeleteAnnotation(annotation.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Edit Annotation Dialog */}
      <Dialog open={!!editingAnnotation} onOpenChange={() => setEditingAnnotation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Annotation</DialogTitle>
            <DialogDescription>
              Update the comment or note for this annotation
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="comment" className="text-sm font-medium">
                Comment
              </label>
              <textarea
                id="comment"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={editingAnnotation?.comment || ''}
                onChange={(e) =>
                  setEditingAnnotation(
                    editingAnnotation ? { ...editingAnnotation, comment: e.target.value } : null
                  )
                }
                placeholder="Add a comment or note..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAnnotation(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
