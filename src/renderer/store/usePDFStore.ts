import { create } from 'zustand';
import type {
  PDFDocument,
  Annotation,
  TextElement,
  ImageElement,
  SearchResult,
  OCRResult,
  TextEdit,
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

  // Text edits (Foxit-style in-place editing)
  textEdits: Map<number, TextEdit[]>;
  selectedTextEditId: string | null;
  // Snapshot of textEdits that are baked into the currently-rendered PDF
  // (id → newText). When an entry matches the current edit's newText, the
  // overlay can hide its visible mask because pdf.js already shows the new text.
  bakedSnapshot: Map<string, string>;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  currentSearchResultIndex: number;

  // OCR
  ocrResults: Map<number, OCRResult>;
  isProcessingOCR: boolean;

  // UI state
  currentTool: string;
  isSidebarOpen: boolean;
  isToolbarCollapsed: boolean;
  sidebarTab: 'thumbnails' | 'annotations' | 'search';
  isDarkMode: boolean;
  isReaderMode: boolean;
  readerEntryPage: number;
  isLoading: boolean;
  error: string | null;
  isLibraryPickerOpen: boolean;
  isSettingsDialogOpen: boolean;

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

  addTextEdit: (edit: TextEdit) => void;
  updateTextEdit: (id: string, data: Partial<TextEdit>) => void;
  deleteTextEdit: (id: string) => void;
  setSelectedTextEditId: (id: string | null) => void;
  setBakedSnapshot: (snapshot: Map<string, string>) => void;

  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setCurrentSearchResultIndex: (index: number) => void;

  setOCRResult: (pageNumber: number, result: OCRResult) => void;
  hydrateOCRResults: (results: OCRResult[]) => void;
  setIsProcessingOCR: (isProcessing: boolean) => void;

  setCurrentTool: (tool: string) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setIsToolbarCollapsed: (isCollapsed: boolean) => void;
  setSidebarTab: (tab: 'thumbnails' | 'annotations' | 'search') => void;
  setIsDarkMode: (isDark: boolean) => void;
  setIsReaderMode: (value: boolean) => void;
  setReaderEntryPage: (page: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setIsLibraryPickerOpen: (value: boolean) => void;
  setIsSettingsDialogOpen: (value: boolean) => void;

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
  textEdits: new Map(),
  selectedTextEditId: null,
  bakedSnapshot: new Map(),
  searchQuery: '',
  searchResults: [],
  currentSearchResultIndex: 0,
  ocrResults: new Map(),
  isProcessingOCR: false,
  currentTool: 'select',
  isSidebarOpen: true,
  isToolbarCollapsed: false,
  sidebarTab: 'thumbnails' as const,
  isDarkMode: false,
  isReaderMode: false,
  readerEntryPage: 1,
  isLoading: false,
  error: null,
  isLibraryPickerOpen: false,
  isSettingsDialogOpen: false,
};

export const usePDFStore = create<PDFState>((set, get) => ({
  ...initialState,

  setCurrentDocument: (doc) => {
    const prevPath = get().currentDocument?.path;
    const changingDoc = doc?.path !== prevPath;
    set({
      currentDocument: doc,
      totalPages: doc?.pageCount || 0,
      ...(changingDoc
        ? {
            // All editing state is per-document. Without clearing these,
            // edits from PDF A would render on PDF B until the user
            // force-reloaded.
            ocrResults: new Map<number, OCRResult>(),
            bakedSnapshot: new Map<string, string>(),
            textEdits: new Map<number, TextEdit[]>(),
            annotations: new Map<number, Annotation[]>(),
            textElements: new Map<number, TextElement[]>(),
            imageElements: new Map<number, ImageElement[]>(),
            selectedAnnotationId: null,
            selectedTextElementId: null,
            selectedImageElementId: null,
            selectedTextEditId: null,
            searchQuery: '',
            searchResults: [],
            currentSearchResultIndex: 0,
          }
        : {}),
    });
  },
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

  addTextEdit: (edit) => {
    const textEdits = new Map(get().textEdits);
    const pageEdits = textEdits.get(edit.pageNumber) || [];
    // Replace existing edit for same position if any, otherwise append
    const existingIdx = pageEdits.findIndex((e) => e.id === edit.id);
    if (existingIdx !== -1) {
      pageEdits[existingIdx] = edit;
      textEdits.set(edit.pageNumber, [...pageEdits]);
    } else {
      textEdits.set(edit.pageNumber, [...pageEdits, edit]);
    }
    set({ textEdits });
  },

  updateTextEdit: (id, data) => {
    const textEdits = new Map(get().textEdits);
    textEdits.forEach((pageEdits, pageNumber) => {
      const index = pageEdits.findIndex((e) => e.id === id);
      if (index !== -1) {
        pageEdits[index] = { ...pageEdits[index], ...data };
        textEdits.set(pageNumber, [...pageEdits]);
      }
    });
    set({ textEdits });
  },

  deleteTextEdit: (id) => {
    const textEdits = new Map(get().textEdits);
    textEdits.forEach((pageEdits, pageNumber) => {
      textEdits.set(pageNumber, pageEdits.filter((e) => e.id !== id));
    });
    set({ textEdits });
  },

  setSelectedTextEditId: (id) => set({ selectedTextEditId: id }),

  setBakedSnapshot: (snapshot) => set({ bakedSnapshot: snapshot }),

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

  setCurrentTool: (tool) => set({ currentTool: tool }),
  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setIsToolbarCollapsed: (isCollapsed) => set({ isToolbarCollapsed: isCollapsed }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setIsReaderMode: (value) => set({ isReaderMode: value }),
  setReaderEntryPage: (page) => set({ readerEntryPage: page }),
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
  setIsLibraryPickerOpen: (value) => set({ isLibraryPickerOpen: value }),
  setIsSettingsDialogOpen: (value) => set({ isSettingsDialogOpen: value }),

  reset: () => set(initialState),
}));
