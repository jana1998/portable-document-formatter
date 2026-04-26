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
  | 'arrow'
  | 'freehand'
  | 'text'
  | 'comment'
  | 'note'
  | 'stamp';

export interface AnnotationData {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
  text?: string;
  comment?: string;
  stampType?: StampType;
  noteColor?: string;
}

export type StampType =
  | 'approved'
  | 'rejected'
  | 'confidential'
  | 'draft'
  | 'final'
  | 'reviewed'
  | 'urgent'
  | 'completed';

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

export interface TextEdit {
  id: string;
  pageNumber: number;
  originalText: string;
  newText: string;
  // Bounding box in mupdf coordinate space (Y=0 at top, 72dpi units)
  mupdfX: number;
  mupdfY: number;
  mupdfW: number;
  mupdfH: number;
  fontSize: number;
  fontName: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  color: string; // #rrggbb captured from the original text
}

export type TextEditLineInfo = {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  font: {
    name: string;
    family: string;
    weight: string;
    style: string;
    size: number;
  };
  color: string; // #rrggbb
};

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
