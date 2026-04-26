import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from '@components/common/Toolbar';
import { TooltipProvider } from '@components/ui/tooltip';

// Mock the PDF store
vi.mock('@renderer/store/usePDFStore', () => ({
  usePDFStore: () => ({
    currentDocument: {
      id: '1',
      name: 'test.pdf',
      path: '/test.pdf',
      pageCount: 10,
      fileSize: 1024,
      loadedAt: new Date(),
    },
    currentPage: 1,
    totalPages: 10,
    scale: 1.0,
    isSidebarOpen: true,
    currentTool: 'select',
    ocrResults: new Map(),
    setCurrentPage: vi.fn(),
    setScale: vi.fn(),
    setIsSidebarOpen: vi.fn(),
    setCurrentTool: vi.fn(),
  }),
}));

describe('Toolbar', () => {
  it('should render toolbar buttons', () => {
    render(
      <TooltipProvider>
        <Toolbar />
      </TooltipProvider>
    );

    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });

  it('should display current page and total pages', () => {
    render(
      <TooltipProvider>
        <Toolbar />
      </TooltipProvider>
    );

    const pageInfo = screen.getByText('1 / 10');
    expect(pageInfo).toBeInTheDocument();
  });

  it('should display zoom level', () => {
    render(
      <TooltipProvider>
        <Toolbar />
      </TooltipProvider>
    );

    const zoomLevel = screen.getByText('100%');
    expect(zoomLevel).toBeInTheDocument();
  });
});
