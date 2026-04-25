import React, { useState } from 'react';
import { Edit, Eye, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/ui/empty-state';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { Annotation } from '@renderer/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';

interface AnnotationListItem extends Annotation {
  pageNumber: number;
}

export function AnnotationsPanel() {
  const {
    annotations,
    deleteAnnotation,
    updateAnnotation,
    setCurrentPage,
    setSelectedAnnotationId,
  } = usePDFStore();
  const [editingAnnotation, setEditingAnnotation] = useState<{ id: string; comment: string } | null>(null);

  const allAnnotations = Array.from(annotations.entries())
    .flatMap(([pageNumber, pageAnnotations]) =>
      pageAnnotations.map((annotation) => ({ ...annotation, pageNumber }))
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ) as AnnotationListItem[];

  const handleAnnotationClick = (pageNumber: number, annotationId: string) => {
    setCurrentPage(pageNumber);
    setSelectedAnnotationId(annotationId);
  };

  const handleSaveEdit = () => {
    if (!editingAnnotation) return;

    let foundAnnotation: Annotation | null = null;
    for (const pageAnnotations of annotations.values()) {
      const match = pageAnnotations.find((annotation) => annotation.id === editingAnnotation.id);
      if (match) {
        foundAnnotation = match;
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
      <EmptyState
        icon={MessageSquare}
        title="No annotations yet"
        description="Highlights and comments will appear here so reviewers can jump straight to the relevant page."
        className="min-h-[280px]"
      />
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="panel-muted flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Annotation feed</p>
            <p className="text-xs text-muted-foreground">
              Review notes, highlights, and editable comments in one place.
            </p>
          </div>
          <div className="meta-pill">{allAnnotations.length} items</div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {allAnnotations.map((annotation) => (
            <div
              key={annotation.id}
              className="panel-muted p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full ring-4 ring-background"
                      style={{ backgroundColor: annotation.color }}
                    />
                    <span className="text-sm font-semibold capitalize text-foreground">
                      {annotation.type}
                    </span>
                    <span className="rounded-full bg-background px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Page {annotation.pageNumber}
                    </span>
                  </div>

                  {annotation.data.text ? (
                    <p className="mt-3 text-sm leading-6 text-foreground">{annotation.data.text}</p>
                  ) : null}

                  {annotation.data.comment ? (
                    <p className="mt-2 rounded-2xl bg-background/70 px-3 py-2 text-sm italic text-muted-foreground">
                      {annotation.data.comment}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No reviewer note added yet.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="toolbar"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => handleAnnotationClick(annotation.pageNumber, annotation.id)}
                    aria-label={`View annotation on page ${annotation.pageNumber}`}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="toolbar"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() =>
                      setEditingAnnotation({
                        id: annotation.id,
                        comment: annotation.data.comment || annotation.data.text || '',
                      })
                    }
                    aria-label="Edit annotation"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="toolbar"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => deleteAnnotation(annotation.id)}
                    aria-label="Delete annotation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!editingAnnotation} onOpenChange={() => setEditingAnnotation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Annotation</DialogTitle>
            <DialogDescription>
              Update the note attached to this annotation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label htmlFor="comment" className="text-sm font-semibold text-foreground">
              Comment
            </label>
            <textarea
              id="comment"
              className="min-h-[120px] w-full rounded-2xl border border-input bg-background/80 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={editingAnnotation?.comment || ''}
              onChange={(event) =>
                setEditingAnnotation(
                  editingAnnotation
                    ? { ...editingAnnotation, comment: event.target.value }
                    : null
                )
              }
              placeholder="Add a comment or reviewer note..."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAnnotation(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
