export interface PDFDocument {
  id: string;
  name: string;
  path: string;
  pageCount: number;
  fileSize: number;
  loadedAt: Date;
}

export interface PDFPage {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}

export interface Annotation {
  id: string;
  pageNumber: number;
  type: AnnotationType;
  data: AnnotationData;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'freehand'
  | 'text'
  | 'comment';

export interface AnnotationData {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
  text?: string;
  comment?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface TextElement {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface ImageElement {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string; // base64
}

export interface SearchResult {
  pageNumber: number;
  matchIndex: number;
  text: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  pageNumber: number;
  text: string;
  confidence: number;
  words: OCRWord[];
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface ExportOptions {
  format: 'pdf' | 'png' | 'jpeg' | 'txt';
  pages?: number[];
  quality?: number;
  dpi?: number;
}

export interface Tool {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}
