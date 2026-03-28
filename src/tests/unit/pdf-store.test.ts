import { describe, it, expect, beforeEach } from 'vitest';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { PDFDocument, Annotation } from '@renderer/types';

describe('usePDFStore', () => {
  beforeEach(() => {
    usePDFStore.getState().reset();
  });

  it('should set current document', () => {
    const mockDoc: PDFDocument = {
      id: '1',
      name: 'test.pdf',
      path: '/path/to/test.pdf',
      pageCount: 10,
      fileSize: 1024,
      loadedAt: new Date(),
    };

    usePDFStore.getState().setCurrentDocument(mockDoc);
    expect(usePDFStore.getState().currentDocument).toEqual(mockDoc);
    expect(usePDFStore.getState().totalPages).toBe(10);
  });

  it('should set current page', () => {
    usePDFStore.getState().setCurrentPage(5);
    expect(usePDFStore.getState().currentPage).toBe(5);
  });

  it('should set scale', () => {
    usePDFStore.getState().setScale(1.5);
    expect(usePDFStore.getState().scale).toBe(1.5);
  });

  it('should add annotation', () => {
    const mockAnnotation: Annotation = {
      id: 'ann-1',
      pageNumber: 1,
      type: 'highlight',
      data: { x: 10, y: 20, width: 100, height: 50 },
      color: '#FFFF00',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usePDFStore.getState().addAnnotation(mockAnnotation);
    const annotations = usePDFStore.getState().annotations.get(1);

    expect(annotations).toHaveLength(1);
    expect(annotations?.[0]).toEqual(mockAnnotation);
  });

  it('should update annotation', () => {
    const mockAnnotation: Annotation = {
      id: 'ann-1',
      pageNumber: 1,
      type: 'highlight',
      data: { x: 10, y: 20, width: 100, height: 50 },
      color: '#FFFF00',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usePDFStore.getState().addAnnotation(mockAnnotation);
    usePDFStore.getState().updateAnnotation('ann-1', { color: '#FF0000' });

    const annotations = usePDFStore.getState().annotations.get(1);
    expect(annotations?.[0].color).toBe('#FF0000');
  });

  it('should delete annotation', () => {
    const mockAnnotation: Annotation = {
      id: 'ann-1',
      pageNumber: 1,
      type: 'highlight',
      data: { x: 10, y: 20, width: 100, height: 50 },
      color: '#FFFF00',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usePDFStore.getState().addAnnotation(mockAnnotation);
    usePDFStore.getState().deleteAnnotation('ann-1');

    const annotations = usePDFStore.getState().annotations.get(1);
    expect(annotations).toHaveLength(0);
  });

  it('should set search results', () => {
    const mockResults = [
      {
        pageNumber: 1,
        matchIndex: 0,
        text: 'test',
        bounds: { x: 10, y: 20, width: 50, height: 20 },
      },
    ];

    usePDFStore.getState().setSearchResults(mockResults);
    expect(usePDFStore.getState().searchResults).toEqual(mockResults);
  });

  it('should toggle sidebar', () => {
    const initialState = usePDFStore.getState().isSidebarOpen;
    usePDFStore.getState().setIsSidebarOpen(!initialState);
    expect(usePDFStore.getState().isSidebarOpen).toBe(!initialState);
  });

  it('should reset store', () => {
    usePDFStore.getState().setCurrentPage(5);
    usePDFStore.getState().setScale(2.0);
    usePDFStore.getState().reset();

    expect(usePDFStore.getState().currentPage).toBe(1);
    expect(usePDFStore.getState().scale).toBe(1.0);
  });
});
