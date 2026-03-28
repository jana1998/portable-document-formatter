import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationService } from '@/services/annotation-service';
import type { Annotation } from '@renderer/types';

describe('AnnotationService', () => {
  let service: AnnotationService;

  beforeEach(() => {
    service = new AnnotationService();
  });

  it('should create an annotation', () => {
    const annotation = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 },
      '#FFFF00'
    );

    expect(annotation).toBeDefined();
    expect(annotation.pageNumber).toBe(1);
    expect(annotation.type).toBe('highlight');
    expect(annotation.color).toBe('#FFFF00');
  });

  it('should add an annotation', () => {
    const annotation = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 }
    );

    service.addAnnotation(annotation);
    const pageAnnotations = service.getPageAnnotations(1);

    expect(pageAnnotations).toHaveLength(1);
    expect(pageAnnotations[0]).toEqual(annotation);
  });

  it('should update an annotation', () => {
    const annotation = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 }
    );

    service.addAnnotation(annotation);
    service.updateAnnotation(annotation.id, { color: '#FF0000' });

    const pageAnnotations = service.getPageAnnotations(1);
    expect(pageAnnotations[0].color).toBe('#FF0000');
  });

  it('should delete an annotation', () => {
    const annotation = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 }
    );

    service.addAnnotation(annotation);
    service.deleteAnnotation(annotation.id);

    const pageAnnotations = service.getPageAnnotations(1);
    expect(pageAnnotations).toHaveLength(0);
  });

  it('should export annotations', () => {
    const annotation1 = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 }
    );
    const annotation2 = service.createAnnotation(
      2,
      'rectangle',
      { x: 30, y: 40, width: 80, height: 60 }
    );

    service.addAnnotation(annotation1);
    service.addAnnotation(annotation2);

    const exported = service.exportAnnotations();
    expect(exported[1]).toHaveLength(1);
    expect(exported[2]).toHaveLength(1);
  });

  it('should load annotations', () => {
    const mockData = {
      1: [
        {
          id: 'test-1',
          pageNumber: 1,
          type: 'highlight',
          data: { x: 10, y: 20, width: 100, height: 50 },
          color: '#FFFF00',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    service.loadAnnotations(mockData);
    const pageAnnotations = service.getPageAnnotations(1);

    expect(pageAnnotations).toHaveLength(1);
    expect(pageAnnotations[0].id).toBe('test-1');
  });

  it('should clear all annotations', () => {
    const annotation = service.createAnnotation(
      1,
      'highlight',
      { x: 10, y: 20, width: 100, height: 50 }
    );

    service.addAnnotation(annotation);
    service.clear();

    const pageAnnotations = service.getPageAnnotations(1);
    expect(pageAnnotations).toHaveLength(0);
  });
});
