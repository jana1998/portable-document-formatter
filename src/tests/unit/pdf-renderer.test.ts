import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PDFRenderer } from '@/services/pdf-renderer';

describe('PDFRenderer', () => {
  let renderer: PDFRenderer;

  beforeEach(() => {
    renderer = new PDFRenderer();
  });

  afterEach(async () => {
    await renderer.destroy();
  });

  it('should create a PDFRenderer instance', () => {
    expect(renderer).toBeDefined();
    expect(renderer.getPageCount()).toBe(0);
  });

  it('should load a PDF document', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);
    expect(renderer.getPageCount()).toBe(10);
  });

  it('should get page count after loading', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);
    const count = renderer.getPageCount();
    expect(count).toBe(10);
  });

  it('should render a page to canvas', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);

    const canvas = document.createElement('canvas');
    await renderer.renderPage(1, canvas, 1.0, 0);

    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it('should get page dimensions', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);

    const dimensions = await renderer.getPageDimensions(1, 1.0);
    expect(dimensions.width).toBe(600);
    expect(dimensions.height).toBe(800);
  });

  it('should search text in document', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);

    const results = await renderer.searchText('Sample');
    expect(results).toBeInstanceOf(Array);
  });

  it('should handle destroy properly', async () => {
    const mockData = new ArrayBuffer(8);
    await renderer.loadDocument(mockData);
    const initialCount = renderer.getPageCount();
    expect(initialCount).toBeGreaterThan(0);

    await renderer.destroy();
    expect(renderer.getPageCount()).toBe(0);
  });
});
