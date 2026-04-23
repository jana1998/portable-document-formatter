import { create } from 'zustand';
import type {
  PDFDocument,
  Annotation,
  TextElement,
  ImageElement,
  SearchResult,
  OCRResult,
} from '@renderer/types';

interface PDFState {
  // Document state
  currentDocument: PDFDocument | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  rotation: number;

  // Annotations
  annotations: Map<number, Annotation[]>;
  selectedAnnotationId: string | null;

  // Text elements
  textElements: Map<number, TextElement[]>;
  selectedTextElementId: string | null;

  // Image elements
  imageElements: Map<number, ImageElement[]>;
  selectedImageElementId: string | null;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  currentSearchResultIndex: number;

  // OCR
  ocrResults: Map<number, OCRResult>;
  isProcessingOCR: boolean;

  // Semantic (page embeddings from @huggingface/transformers MiniLM, 384-dim)
  pageEmbeddings: Map<number, number[]>;
  isIndexingEmbeddings: boolean;

  // UI state
  currentTool: string;
  isSidebarOpen: boolean;
  sidebarTab: 'thumbnails' | 'annotations' | 'search';
  isDarkMode: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentDocument: (doc: PDFDocument | null) => void;
  setCurrentPage: (page: number) => void;
  setTotalPages: (pages: number) => void;
  setScale: (scale: number) => void;
  setRotation: (rotation: number) => void;

  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedAnnotationId: (id: string | null) => void;

  addTextElement: (element: TextElement) => void;
  updateTextElement: (id: string, data: Partial<TextElement>) => void;
  deleteTextElement: (id: string) => void;
  setSelectedTextElementId: (id: string | null) => void;

  addImageElement: (element: ImageElement) => void;
  updateImageElement: (id: string, data: Partial<ImageElement>) => void;
  deleteImageElement: (id: string) => void;
  setSelectedImageElementId: (id: string | null) => void;

  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setCurrentSearchResultIndex: (index: number) => void;

  setOCRResult: (pageNumber: number, result: OCRResult) => void;
  hydrateOCRResults: (results: OCRResult[]) => void;
  setIsProcessingOCR: (isProcessing: boolean) => void;

  setPageEmbedding: (pageNumber: number, vector: number[]) => void;
  hydratePageEmbeddings: (entries: Array<{ pageNumber: number; vector: number[] }>) => void;
  clearPageEmbeddings: () => void;
  setIsIndexingEmbeddings: (isIndexing: boolean) => void;

  setCurrentTool: (tool: string) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setSidebarTab: (tab: 'thumbnails' | 'annotations' | 'search') => void;
  setIsDarkMode: (isDark: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  reset: () => void;
}

const initialState = {
  currentDocument: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  rotation: 0,
  annotations: new Map(),
  selectedAnnotationId: null,
  textElements: new Map(),
  selectedTextElementId: null,
  imageElements: new Map(),
  selectedImageElementId: null,
  searchQuery: '',
  searchResults: [],
  currentSearchResultIndex: 0,
  ocrResults: new Map(),
  isProcessingOCR: false,
  pageEmbeddings: new Map(),
  isIndexingEmbeddings: false,
  currentTool: 'select',
  isSidebarOpen: true,
  sidebarTab: 'thumbnails' as const,
  isDarkMode: false,
  isLoading: false,
  error: null,
};

export const usePDFStore = create<PDFState>((set, get) => ({
  ...initialState,

  setCurrentDocument: (doc) => set({ currentDocument: doc, totalPages: doc?.pageCount || 0 }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (pages) => set({ totalPages: pages }),
  setScale: (scale) => set({ scale }),
  setRotation: (rotation) => set({ rotation }),

  addAnnotation: (annotation) => {
    const annotations = new Map(get().annotations);
    const pageAnnotations = annotations.get(annotation.pageNumber) || [];
    annotations.set(annotation.pageNumber, [...pageAnnotations, annotation]);
    set({ annotations });
  },

  updateAnnotation: (id, data) => {
    const annotations = new Map(get().annotations);
    annotations.forEach((pageAnnotations, pageNumber) => {
      const index = pageAnnotations.findIndex((a) => a.id === id);
      if (index !== -1) {
        pageAnnotations[index] = { ...pageAnnotations[index], ...data };
        annotations.set(pageNumber, [...pageAnnotations]);
      }
    });
    set({ annotations });
  },

  deleteAnnotation: (id) => {
    const annotations = new Map(get().annotations);
    annotations.forEach((pageAnnotations, pageNumber) => {
      const filtered = pageAnnotations.filter((a) => a.id !== id);
      annotations.set(pageNumber, filtered);
    });
    set({ annotations });
  },

  setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),

  addTextElement: (element) => {
    const textElements = new Map(get().textElements);
    const pageElements = textElements.get(element.pageNumber) || [];
    textElements.set(element.pageNumber, [...pageElements, element]);
    set({ textElements });
  },

  updateTextElement: (id, data) => {
    const textElements = new Map(get().textElements);
    textElements.forEach((pageElements, pageNumber) => {
      const index = pageElements.findIndex((e) => e.id === id);
      if (index !== -1) {
        pageElements[index] = { ...pageElements[index], ...data };
        textElements.set(pageNumber, [...pageElements]);
      }
    });
    set({ textElements });
  },

  deleteTextElement: (id) => {
    const textElements = new Map(get().textElements);
    textElements.forEach((pageElements, pageNumber) => {
      const filtered = pageElements.filter((e) => e.id !== id);
      textElements.set(pageNumber, filtered);
    });
    set({ textElements });
  },

  setSelectedTextElementId: (id) => set({ selectedTextElementId: id }),

  addImageElement: (element) => {
    const imageElements = new Map(get().imageElements);
    const pageElements = imageElements.get(element.pageNumber) || [];
    imageElements.set(element.pageNumber, [...pageElements, element]);
    set({ imageElements });
  },

  updateImageElement: (id, data) => {
    const imageElements = new Map(get().imageElements);
    imageElements.forEach((pageElements, pageNumber) => {
      const index = pageElements.findIndex((e) => e.id === id);
      if (index !== -1) {
        pageElements[index] = { ...pageElements[index], ...data };
        imageElements.set(pageNumber, [...pageElements]);
      }
    });
    set({ imageElements });
  },

  deleteImageElement: (id) => {
    const imageElements = new Map(get().imageElements);
    imageElements.forEach((pageElements, pageNumber) => {
      const filtered = pageElements.filter((e) => e.id !== id);
      imageElements.set(pageNumber, filtered);
    });
    set({ imageElements });
  },

  setSelectedImageElementId: (id) => set({ selectedImageElementId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setCurrentSearchResultIndex: (index) => set({ currentSearchResultIndex: index }),

  setOCRResult: (pageNumber, result) => {
    const ocrResults = new Map(get().ocrResults);
    ocrResults.set(pageNumber, result);
    set({ ocrResults });
  },

  hydrateOCRResults: (results) => {
    const ocrResults = new Map<number, OCRResult>();
    for (const r of results) ocrResults.set(r.pageNumber, r);
    set({ ocrResults });
  },

  setIsProcessingOCR: (isProcessing) => set({ isProcessingOCR: isProcessing }),

  setPageEmbedding: (pageNumber, vector) => {
    const pageEmbeddings = new Map(get().pageEmbeddings);
    pageEmbeddings.set(pageNumber, vector);
    set({ pageEmbeddings });
  },

  hydratePageEmbeddings: (entries) => {
    const pageEmbeddings = new Map<number, number[]>();
    for (const e of entries) pageEmbeddings.set(e.pageNumber, e.vector);
    set({ pageEmbeddings });
  },

  clearPageEmbeddings: () => set({ pageEmbeddings: new Map() }),

  setIsIndexingEmbeddings: (isIndexing) => set({ isIndexingEmbeddings: isIndexing }),

  setCurrentTool: (tool) => set({ currentTool: tool }),
  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setIsDarkMode: (isDark) => {
    set({ isDarkMode: isDark });
    // Apply dark mode class to document
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Save preference to localStorage
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');
  },
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
