import type { Annotation, AnnotationType, AnnotationData } from '@renderer/types';

export class AnnotationService {
  private annotations: Map<number, Annotation[]> = new Map();

  addAnnotation(annotation: Annotation): void {
    const pageAnnotations = this.annotations.get(annotation.pageNumber) || [];
    pageAnnotations.push(annotation);
    this.annotations.set(annotation.pageNumber, pageAnnotations);
  }

  updateAnnotation(id: string, data: Partial<Annotation>): void {
    this.annotations.forEach((pageAnnotations) => {
      const annotation = pageAnnotations.find((a) => a.id === id);
      if (annotation) {
        Object.assign(annotation, data);
      }
    });
  }

  deleteAnnotation(id: string): void {
    this.annotations.forEach((pageAnnotations, pageNumber) => {
      const filtered = pageAnnotations.filter((a) => a.id !== id);
      this.annotations.set(pageNumber, filtered);
    });
  }

  getPageAnnotations(pageNumber: number): Annotation[] {
    return this.annotations.get(pageNumber) || [];
  }

  getAllAnnotations(): Map<number, Annotation[]> {
    return new Map(this.annotations);
  }

  loadAnnotations(annotationsData: any): void {
    this.annotations.clear();
    if (annotationsData && typeof annotationsData === 'object') {
      Object.entries(annotationsData).forEach(([pageNum, annotations]) => {
        this.annotations.set(Number(pageNum), annotations as Annotation[]);
      });
    }
  }

  exportAnnotations(): any {
    const result: any = {};
    this.annotations.forEach((annotations, pageNumber) => {
      result[pageNumber] = annotations;
    });
    return result;
  }

  createAnnotation(
    pageNumber: number,
    type: AnnotationType,
    data: AnnotationData,
    color: string = '#FFFF00'
  ): Annotation {
    return {
      id: this.generateId(),
      pageNumber,
      type,
      data,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateId(): string {
    return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  clear(): void {
    this.annotations.clear();
  }
}

export const annotationService = new AnnotationService();
