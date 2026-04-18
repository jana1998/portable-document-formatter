# Knowledge Graph Documentation

## Overview

This document provides comprehensive documentation for the **Portable Document Formatter** knowledge graph. The knowledge graph represents the complete architecture, dependencies, and relationships within this Electron-based PDF editor application.

## Generated Artifacts

This knowledge graph analysis has produced three key deliverables:

1. **knowledge-graph.json** - Machine-readable graph data structure
2. **knowledge-graph-visualization.html** - Interactive D3.js visualization
3. **KNOWLEDGE_GRAPH.md** - This comprehensive documentation

## Quick Start

### Viewing the Interactive Visualization

```bash
# Open the visualization in your default browser
open knowledge-graph-visualization.html
```

The interactive visualization features:
- **Node Types**: Color-coded by layer, file, concept, or dependency
- **Edge Types**: Different colors for imports, dependencies, usage patterns
- **Interactions**: Hover over nodes for detailed information
- **Filters**: Filter by type or architectural layer
- **Controls**: Zoom, pan, drag nodes, reset view

### Querying the Knowledge Graph

The JSON structure can be queried programmatically:

```javascript
// Load the graph
const graph = require('./knowledge-graph.json');

// Find all files in the main process
const mainProcessFiles = graph.nodes.filter(n =>
  graph.edges.some(e =>
    e.target === n.id && e.source === 'main-process'
  )
);

// Find all dependencies of a specific file
const pdfViewerDeps = graph.edges
  .filter(e => e.source === 'PDFViewer.tsx' && e.type === 'imports')
  .map(e => e.target);

// Get workflow by ID
const documentLoadingFlow = graph.workflows.find(w =>
  w.id === 'document-loading'
);
```

---

## Architecture Overview

### Electron Multi-Process Architecture

```
┌─────────────────────────────────────────────────────┐
│                 MAIN PROCESS                        │
│  (Privileged - File I/O, PDF manipulation)          │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                 │
│  │  main.ts    │  │  Services    │                 │
│  │  IPC Hub    │→ │  - File      │                 │
│  └─────────────┘  │  - PDF       │                 │
│         ↕          └──────────────┘                 │
│   ┌─────────────┐                                   │
│   │ preload.ts  │ ← Security Bridge                 │
│   └─────────────┘                                   │
└──────────┬──────────────────────────────────────────┘
           │ IPC (contextBridge)
           ↓
┌─────────────────────────────────────────────────────┐
│              RENDERER PROCESS                       │
│  (Sandboxed - UI, User Interaction)                 │
│                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌───────────┐     │
│  │   App    │→ │  Components │→ │  Layers   │     │
│  └──────────┘  └─────────────┘  └───────────┘     │
│       ↕                ↕              ↕             │
│  ┌──────────────────────────────────────┐          │
│  │      Zustand Store (State)           │          │
│  └──────────────────────────────────────┘          │
│       ↕                ↕                            │
│  ┌──────────┐  ┌─────────────┐                     │
│  │ Services │  │  Workers    │                     │
│  │ PDF.js   │  │  OCR        │                     │
│  └──────────┘  └─────────────┘                     │
└─────────────────────────────────────────────────────┘
```

---

## Layer Breakdown

### 1. Main Process Layer

**Purpose**: Backend operations with full Node.js access

**Key Files**:
- `main.ts` (175 lines) - Application entry point
- `preload.ts` (65 lines) - Security bridge
- `file-service.ts` (60 lines) - File system operations
- `pdf-service.ts` (644 lines) - PDF manipulation engine

**Responsibilities**:
- Window lifecycle management
- Native dialog display
- File system I/O
- PDF document manipulation (merge, split, rotate, etc.)
- IPC handler registration (19 channels)

**Security Features**:
- Context isolation enabled
- No direct renderer access to Node.js
- Whitelist-based API exposure

**IPC Channels Exposed**:

| Channel | Handler | Purpose |
|---------|---------|---------|
| `dialog:openFile` | FileService.getFileInfo() | Open file dialog |
| `dialog:saveFile` | dialog.showSaveDialog() | Save file dialog |
| `file:read` | FileService.readFile() | Read file as Buffer |
| `file:write` | FileService.writeFile() | Write file to disk |
| `pdf:getInfo` | PDFService.getDocumentInfo() | Get PDF metadata |
| `pdf:mergePDFs` | PDFService.mergePDFs() | Merge multiple PDFs |
| `pdf:splitPDF` | PDFService.splitPDF() | Split PDF by ranges |
| `pdf:deletePage` | PDFService.deletePage() | Remove page |
| `pdf:extractPages` | PDFService.extractPages() | Extract pages |
| `pdf:reorderPages` | PDFService.reorderPages() | Reorder pages |
| `pdf:rotatePage` | PDFService.rotatePage() | Rotate page |
| `pdf:addTextToPDF` | PDFService.addTextToPDF() | Add text overlay |
| `pdf:addImageToPDF` | PDFService.addImageToPDF() | Add image overlay |
| `pdf:getPageStructuredText` | PDFService.getPageStructuredText() | Extract text with positions (mupdf) |
| `pdf:applyModifications` | PDFService.applyModificationsToPDF() | Consolidate all edits |
| `annotations:save` | fs.writeFile() | Save annotation sidecar |
| `annotations:load` | fs.readFile() | Load annotation sidecar |

---

### 2. Renderer Process Layer

**Purpose**: User interface and interaction handling

**Key Files**:
- `App.tsx` (128 lines) - Root component
- `Toolbar.tsx` (352 lines) - Top toolbar
- `Sidebar.tsx` (72 lines) - Left sidebar
- `PDFViewer.tsx` (210 lines) - Main canvas viewer
- `usePDFStore.ts` (290 lines) - Global state store

**Component Hierarchy**:

```
App
├── Toolbar
│   ├── File operations (open, save)
│   ├── Navigation (prev, next, zoom)
│   ├── Tool selection (12 tools)
│   └── Dialogs (SaveDialog, OCRDialog)
├── Sidebar
│   ├── ThumbnailsPanel
│   ├── AnnotationsPanel
│   └── SearchPanel
└── PDFViewer (Main Area)
    ├── Canvas (PDF base layer)
    ├── SearchHighlightLayer
    ├── AnnotationLayer
    ├── EditingLayer (text/image overlays)
    └── TextEditLayer (Foxit-style editing)
```

**State Management**:
- **Pattern**: Zustand (Flux-like)
- **Single Store**: All state centralized
- **Immutable Updates**: New Map instances on changes
- **31 Actions**: Setters for all state mutations

**State Structure**:
```typescript
{
  // Document
  currentDocument: PDFDocument | null
  currentPage: number
  scale: number (0.5-3.0)
  rotation: number (0, 90, 180, 270)

  // Overlays (Map<pageNumber, items[]>)
  annotations: Map<number, Annotation[]>
  textElements: Map<number, TextElement[]>
  imageElements: Map<number, ImageElement[]>
  textEdits: Map<number, TextEdit[]>

  // Search
  searchQuery: string
  searchResults: SearchResult[]

  // OCR
  ocrResults: Map<number, OCRResult>

  // UI State
  currentTool: string
  isSidebarOpen: boolean
  sidebarTab: 'thumbnails' | 'annotations' | 'search'
  isDarkMode: boolean
}
```

---

### 3. Services Layer

**Purpose**: Shared business logic

**Key Files**:
- `pdf-renderer.ts` (164 lines) - PDF.js wrapper
- `annotation-service.ts` (80 lines) - Annotation management
- `ocr-service.ts` (42 lines) - OCR coordination (placeholder)

**PDFRenderer Service**:
```typescript
class PDFRenderer {
  loadDocument(data: ArrayBuffer): Promise<void>
  renderPage(pageNum, canvas, scale, rotation): Promise<void>
  getPageDimensions(pageNum, scale): Promise<{width, height}>
  getTextContent(pageNum): Promise<any>
  searchText(query, pageNum?): Promise<SearchResult[]>
  getPageCount(): number
  destroy(): Promise<void>
}
```

**AnnotationService**:
```typescript
class AnnotationService {
  addAnnotation(annotation)
  updateAnnotation(id, data)
  deleteAnnotation(id)
  getPageAnnotations(pageNum): Annotation[]
  createAnnotation(pageNum, type, data, color): Annotation
  exportAnnotations(): object
}
```

---

### 4. Workers Layer

**Purpose**: Background processing

**Key Files**:
- `ocr-worker.ts` (55 lines) - Tesseract.js OCR worker

**Message Protocol**:
```typescript
// Incoming
{ type: 'recognize', data: { imageData } }
{ type: 'terminate' }

// Outgoing
{ type: 'result', data: { text, confidence, words[] } }
{ type: 'error', error: string }
{ type: 'terminated' }
```

---

## Critical Workflows

### 1. Document Loading Sequence

```
User Action: Click "Open PDF"
    ↓
Toolbar.tsx → window.electronAPI.openFile()
    ↓ IPC
Main Process → dialog.showOpenDialog()
    ↓
FileService.getFileInfo() → {path, name, size}
    ↓ Return metadata
Toolbar → Store.setCurrentDocument()
    ↓ Trigger effect
PDFViewer → window.electronAPI.readFile(path)
    ↓ IPC
Main Process → FileService.readFile() → Buffer
    ↓ Return bytes
PDFViewer → Convert Buffer to ArrayBuffer
    ↓
PDFRenderer.loadDocument(arrayBuffer)
    ↓ PDF.js initialization
PDFRenderer.getPageCount() → Store.setTotalPages()
    ↓
PDFRenderer.renderPage(1) → Canvas
    ↓
Overlay Layers Mount (Search, Annotations, Editing)
```

**Involved Components**:
- Toolbar.tsx
- IPC Bridge (preload.ts)
- main.ts
- file-service.ts
- usePDFStore.ts
- PDFViewer.tsx
- pdf-renderer.ts

**Duration**: ~500ms for typical PDF (depends on file size)

---

### 2. Save/Export Sequence

```
User Action: Click "Save"
    ↓
Toolbar → SaveDialog opens
    ↓
User selects pages (all or range: "1-3, 5, 7-9")
    ↓
SaveDialog gathers modifications from Store:
  - textElements Map → Array
  - imageElements Map → Array
  - annotations Map → Array
  - textEdits (filter changed only)
    ↓
SaveDialog → window.electronAPI.saveFile()
    ↓ IPC
Main Process → dialog.showSaveDialog() → outputPath
    ↓
If specific pages selected:
  └→ window.electronAPI.extractPages() → tempPDF
  └→ Remap page numbers for modifications
    ↓
window.electronAPI.applyModifications(source, mods, output)
    ↓ IPC
Main Process → PDFService.applyModificationsToPDF()
    ↓
If textEdits exist:
  └→ applyTextEditsToPDF() first
     └→ mupdf Redaction API
     └→ Remove original text (white rectangle)
     └→ Write new text
    ↓
Load PDF with pdf-lib
    ↓
For each page:
  ├→ Draw text elements (drawText)
  ├→ Embed images (embedPng/embedJpg)
  └→ Render annotations (drawRectangle, drawLine, etc.)
    ↓
Save to outputPath
    ↓ Return success
SaveDialog → Toast notification
```

**Key Features**:
- **Non-destructive**: Original PDF untouched until save
- **Selective Export**: Save specific page ranges
- **Consolidated Changes**: All modifications applied in one operation
- **Physical Text Editing**: mupdf removes/rewrites actual PDF text

---

### 3. Annotation Creation

```
User Action: Select annotation tool (e.g., highlight)
    ↓
Toolbar → Store.setCurrentTool('highlight')
    ↓
AnnotationLayer receives tool change
    ↓
User interaction on canvas:
  MouseDown → Capture start point {x, y}
  MouseMove → Update preview shape
  MouseUp → Finalize annotation
    ↓
AnnotationLayer → annotationService.createAnnotation()
    ↓
Generate annotation data:
  {
    id: 'annotation_<timestamp>_<random>',
    pageNumber: currentPage,
    type: 'highlight',
    data: { x, y, width, height },
    color: '#ffeb3b',
    createdAt: Date
  }
    ↓
Store.addAnnotation(annotation)
    ↓ Immutable update
Store creates new Map with annotation
    ↓ Re-render
AnnotationLayer → Render SVG element
```

**Supported Annotation Types** (11 total):
1. highlight
2. underline
3. strikethrough
4. rectangle
5. circle
6. line
7. arrow
8. freehand
9. text
10. note
11. stamp

---

### 4. Text Editing (Foxit-style)

```
User Action: Select "Edit Text" tool
    ↓
Toolbar → Store.setCurrentTool('edit-text')
    ↓
TextEditLayer mounts
    ↓
Fetch structured text: window.electronAPI.getPageStructuredText(page)
    ↓ IPC
Main Process → PDFService.getPageStructuredText()
    ↓
Load PDF with mupdf (dynamic ESM import)
    ↓
Extract text with bounding boxes and font metrics:
  {
    text: "Hello World",
    bbox: { x, y, width, height },
    font: { name, family, size, weight, style }
  }
    ↓ Return array of lines
TextEditLayer receives structured text
    ↓
Render invisible clickable overlays for each line
    ↓
User clicks text line
    ↓
Input field appears with original text
    ↓
User edits text, presses Enter or blur
    ↓
Store.addTextEdit() or updateTextEdit()
    ↓
TextEditLayer re-renders:
  - White background for edited line
  - Blue bottom border indicator
  - New text visible
    ↓
On Save:
  textEdits → PDFService.applyTextEditsToPDF()
    ↓
  mupdf Redaction API:
    1. Draw white rectangle over original
    2. Write new text at same position
    3. Preserve font metrics
```

**Why Foxit-style?**
- **In-place editing**: No separate text mode
- **Visual feedback**: White background shows edited areas
- **Font preservation**: Maintains original typography
- **Physical edits**: Actually modifies PDF text (not overlays)

**Coordinate System Challenges**:
- **pdf-lib**: Bottom-left origin (Y increases upward)
- **mupdf**: Top-left origin (Y increases downward)
- **Conversion**: `pdfLibY = pageHeight - mupdfY - height`

---

### 5. Search Execution

```
User Action: Enter query in SearchPanel
    ↓
SearchPanel input onChange
    ↓
User presses Enter
    ↓
SearchPanel → Create temporary PDFRenderer instance
    ↓
Load document: window.electronAPI.readFile(path)
    ↓ IPC
Main Process → FileService.readFile() → Buffer
    ↓ Return bytes
Convert to ArrayBuffer
    ↓
tempRenderer.loadDocument(arrayBuffer)
    ↓
tempRenderer.searchText(query)
    ↓
PDF.js rendering engine:
  For each page:
    ├→ Extract text content with positions
    ├→ Regex match query (case-insensitive)
    └→ Build SearchResult[]
        {
          pageNumber,
          matchIndex,
          text,
          bounds: { x, y, width, height }
        }
    ↓
Return all results
    ↓
Store.setSearchResults(results)
Store.setCurrentSearchResultIndex(0)
    ↓
SearchHighlightLayer receives results
    ↓
Render yellow highlight rectangles at match positions
    ↓
Store.setCurrentPage(firstMatchPage)
    ↓
User navigates with Next/Previous buttons
    ↓
Store.setCurrentSearchResultIndex(index)
Store.setCurrentPage(result.pageNumber)
    ↓
tempRenderer.destroy()
```

**Search Features**:
- **Full-text search**: Across all pages
- **Visual highlights**: Yellow rectangles
- **Navigation**: Next/Previous/Jump to result
- **Performance**: Separate renderer instance (no UI blocking)

---

## Dependency Graph

### External Dependencies

#### Production Dependencies

**Core Framework**:
- **electron** (28.1.0) - Desktop application framework
- **react** (18.2.0) - UI library
- **react-dom** (18.2.0) - React DOM renderer

**State Management**:
- **zustand** (4.4.7) - Lightweight state management

**PDF Libraries**:
- **pdfjs-dist** (3.11.174) - PDF rendering (Mozilla)
- **pdf-lib** (1.17.1) - PDF creation and modification
- **mupdf** (1.27.0) - Text extraction with font metrics

**OCR**:
- **tesseract.js** (5.0.4) - OCR engine

**UI Components**:
- **@radix-ui/react-*** (9 packages) - Accessible primitives
- **lucide-react** (0.294.0) - Icon library
- **class-variance-authority** (0.7.1) - Variant utilities
- **clsx** (2.0.0) - Classname utility
- **tailwind-merge** (2.2.0) - Tailwind merger

#### Development Dependencies

**Build Tools**:
- **vite** (5.0.8) - Build tool and dev server
- **electron-builder** (24.13.3) - Packaging and distribution
- **typescript** (5.3.3) - Type system

**Testing**:
- **vitest** (1.0.4) - Unit testing framework
- **@vitest/coverage-v8** (1.0.4) - Code coverage
- **@playwright/test** (1.40.1) - E2E testing
- **@testing-library/react** (14.1.2) - React testing utilities

**Styling**:
- **tailwindcss** (3.4.0) - Utility-first CSS
- **autoprefixer** (10.4.16) - CSS vendor prefixes
- **postcss** (8.4.32) - CSS processing

---

### Internal Dependencies

#### Component Dependencies

```
App.tsx
├── usePDFStore
├── Toolbar
├── Sidebar
│   ├── ThumbnailsPanel
│   ├── AnnotationsPanel
│   └── SearchPanel
└── PDFViewer
    ├── pdf-renderer
    ├── SearchHighlightLayer
    ├── AnnotationLayer
    ├── EditingLayer
    └── TextEditLayer

Toolbar.tsx
├── usePDFStore
├── SaveDialog
├── OCRDialog
└── window.electronAPI

PDFViewer.tsx
├── usePDFStore
├── pdf-renderer (singleton)
├── window.electronAPI
└── All layer components
```

#### Service Dependencies

```
pdf-renderer.ts
└── pdfjs-dist

annotation-service.ts
└── (no external deps)

ocr-service.ts
└── (placeholder)

ocr-worker.ts
└── tesseract.js
```

#### Main Process Dependencies

```
main.ts
├── electron
├── file-service
└── pdf-service

pdf-service.ts
├── pdf-lib
├── mupdf (dynamic ESM import)
└── fs/promises

file-service.ts
├── fs/promises
└── path
```

---

## Data Models

### Core Types

#### PDFDocument
```typescript
interface PDFDocument {
  id: string                  // Unique identifier
  name: string                // Filename
  path: string                // Absolute file path
  pageCount: number           // Total pages
  fileSize: number            // Bytes
  loadedAt: Date             // Load timestamp
}
```

#### Annotation
```typescript
interface Annotation {
  id: string                  // annotation_<timestamp>_<random>
  pageNumber: number          // 1-indexed
  type: AnnotationType        // 11 types
  data: AnnotationData        // Type-specific data
  color: string               // Hex color
  createdAt: Date
  updatedAt: Date
}

type AnnotationType =
  | 'highlight' | 'underline' | 'strikethrough'
  | 'rectangle' | 'circle' | 'line' | 'arrow'
  | 'freehand' | 'text' | 'comment' | 'note' | 'stamp'

type AnnotationData =
  | HighlightData { x, y, width, height }
  | RectangleData { x, y, width, height }
  | CircleData { cx, cy, rx, ry }
  | LineData { x1, y1, x2, y2 }
  | ArrowData { x1, y1, x2, y2 }
  | FreehandData { points: {x, y}[] }
  | TextData { x, y, text, fontSize }
  | NoteData { x, y, content }
  | StampData { x, y, width, height, text }
```

#### TextElement
```typescript
interface TextElement {
  id: string                  // textElement_<timestamp>_<random>
  pageNumber: number
  x: number                   // Canvas coordinates
  y: number
  width: number
  height: number
  text: string
  fontSize: number            // pt
  fontFamily: string          // 'Arial', 'Times', etc.
  color: string               // Hex color
}
```

#### ImageElement
```typescript
interface ImageElement {
  id: string                  // imageElement_<timestamp>_<random>
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  data: string                // Base64 encoded image
}
```

#### TextEdit
```typescript
interface TextEdit {
  id: string                  // textEdit_<timestamp>_<random>
  pageNumber: number
  originalText: string
  newText: string
  mupdfX: number              // mupdf coordinates (top-left origin)
  mupdfY: number
  mupdfW: number
  mupdfH: number
  fontSize: number
  fontName: string            // PDF font name
  fontFamily: string          // CSS font family
  fontWeight: string          // 'normal' | 'bold'
  fontStyle: string           // 'normal' | 'italic'
}
```

#### SearchResult
```typescript
interface SearchResult {
  pageNumber: number
  matchIndex: number          // Index within page
  text: string                // Matched text
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}
```

#### OCRResult
```typescript
interface OCRResult {
  pageNumber: number
  text: string                // Extracted text
  confidence: number          // 0-100
  words: OCRWord[]
}

interface OCRWord {
  text: string
  confidence: number
  bbox: { x0, y0, x1, y1 }
}
```

---

## Security Analysis

### Electron Security Checklist

✅ **Enabled Features**:
- Context isolation
- Node integration disabled in renderer
- Preload script whitelist API
- No remote module usage
- File operations through IPC only
- HTTPS enforcement for CDN resources

⚠️ **Potential Improvements**:
- Add certificate pinning for CDN resources
- Bundle PDF.js worker locally (currently CDN)
- Implement code signing (currently disabled)
- Add input validation on IPC handlers
- Implement file size limits
- Add Content Security Policy headers

### Attack Surface Analysis

**Main Process**:
- **Risk**: High (full Node.js access)
- **Mitigation**: No direct renderer access, IPC only
- **Exposure**: File system, native dialogs

**Renderer Process**:
- **Risk**: Medium (sandboxed)
- **Mitigation**: Context isolation, no Node.js
- **Exposure**: DOM, browser APIs only

**IPC Bridge**:
- **Risk**: Medium (critical boundary)
- **Mitigation**: Whitelist-based exposure
- **Exposure**: 19 predefined channels

**File Operations**:
- **Risk**: High (arbitrary file access)
- **Mitigation**: Native dialogs for user selection
- **Exposure**: User-selected files only

---

## Performance Considerations

### Optimizations Implemented

1. **Render Task Cancellation**
   - PDFRenderer cancels previous render on page change
   - Prevents memory leaks during rapid navigation

2. **High DPI Support**
   - Canvas scaling for retina displays
   - `devicePixelRatio` detection

3. **Thumbnail Caching**
   - dataURL strings stored in memory
   - First 20 pages only (PREVIEW_LIMIT)

4. **Lazy OCR**
   - Only process requested pages
   - Web Worker prevents UI blocking

5. **Map-based Storage**
   - O(1) page lookup for overlays
   - Efficient page-specific data access

### Performance Bottlenecks

1. **PDF.js Rendering**
   - **Impact**: High (largest bottleneck)
   - **Duration**: 100-500ms per page (size-dependent)
   - **Mitigation**: Render task cancellation, progress indicators

2. **State Updates**
   - **Impact**: Medium
   - **Frequency**: On every interaction
   - **Mitigation**: Immutable updates, React optimization

3. **Search Across Large PDFs**
   - **Impact**: High for 100+ page documents
   - **Duration**: 5-30 seconds
   - **Mitigation**: Separate renderer instance, progress UI

4. **Thumbnail Generation**
   - **Impact**: Medium
   - **Duration**: 2-10 seconds for 20 pages
   - **Mitigation**: 20-page limit, caching

### Recommended Improvements

1. **Virtual Scrolling** for large page lists
2. **Worker Pool** for parallel thumbnail generation
3. **Canvas Pooling** to reuse canvas elements
4. **Debounced Rendering** during zoom/rotation
5. **IndexedDB** for persisting large documents

---

## Testing Infrastructure

### Unit Tests

**Location**: `src/tests/unit/`

**Coverage**:
- `annotation-service.test.ts` - Annotation CRUD operations
- `pdf-renderer.test.ts` - PDF.js wrapper methods
- `pdf-store.test.ts` - Zustand state management

**Setup**: `src/tests/setup.ts`
- Vitest globals
- jsdom environment
- Mock window.electronAPI
- React Testing Library matchers

**Run Commands**:
```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage
```

### UI Tests

**Location**: `src/tests/ui/`

**Coverage**:
- `Toolbar.test.tsx` - Toolbar component interactions

**Strategy**: React Testing Library
- User-centric queries
- Accessibility-focused
- Integration-style tests

### E2E Tests

**Location**: `src/e2e/`

**Coverage**:
- `pdf-viewer.spec.ts` - Playwright integration tests

**Strategy**: Full application testing
- Electron app launch
- Real file operations
- Visual regression (potential)

**Run Commands**:
```bash
npm run test:e2e
```

### Coverage Gaps

⚠️ **Areas Needing More Tests**:
1. Save/export flows (requires mocking Electron dialogs)
2. OCR processing (requires canvas mocking)
3. Text editing (requires mupdf mocking)
4. IPC communication (requires Electron testing)
5. Error handling (missing error scenarios)

---

## Build and Distribution

### Development Build

```bash
npm run dev
```

**Process**:
1. Vite starts dev server (port 5173)
2. Main process compiles (tsc)
3. Electron waits for Vite ready (wait-on)
4. Electron launches with dev URL

**Hot Module Replacement**: Enabled for renderer

### Production Build

```bash
npm run build
```

**Output**:
- `dist/renderer/` - Vite bundled assets
- `dist/main/` - TypeScript transpiled files

### Distribution

**macOS**:
```bash
npm run dist:mac          # Unsigned universal DMG
npm run dist:mac:signed   # Signed (requires Apple Developer)
```

**Windows**:
```bash
npm run dist:win          # Unsigned NSIS installer
npm run dist:win:signed   # Signed (requires certificate)
```

**Output**: `release/` directory

**Installer Names**:
- macOS: `Portable Document Formatter-1.0.0-universal.dmg`
- Windows: `Portable Document Formatter-Setup-1.0.0.exe`

### electron-builder Configuration

```json
{
  "appId": "com.portabledocumentformatter.app",
  "asar": true,
  "npmRebuild": false,
  "files": [
    "dist/**/*",
    "package.json"
  ],
  "mac": {
    "category": "public.app-category.productivity",
    "target": "dmg",
    "arch": ["universal"]  // ARM64 + x64
  },
  "win": {
    "target": "nsis",
    "arch": ["x64"]
  }
}
```

---

## Known Limitations

### Unimplemented Features

1. **Image Export** (`exportPageToImage`)
   - Status: Placeholder method
   - Requirement: pdf2pic or similar library
   - Impact: Cannot export pages as PNG/JPEG

2. **Text Extraction** (`extractText`)
   - Status: Placeholder method
   - Requirement: pdf-parse or similar library
   - Impact: Cannot batch extract text

3. **OCR Service** (`ocr-service.ts`)
   - Status: Placeholder implementation
   - Requirement: Worker integration
   - Impact: OCR currently in OCRDialog only

4. **Page Management UI** (`PageManagement.tsx`)
   - Status: Not wired to main workflow
   - Impact: UI exists but not accessible

### Technical Debt

1. **PDF.js Worker**: CDN-based (not bundled)
   - **Risk**: Requires internet connection
   - **Fix**: Bundle worker with Vite

2. **Thumbnail Limit**: First 20 pages only
   - **Risk**: Limited navigation for large PDFs
   - **Fix**: Implement virtual scrolling

3. **No Drag Interaction**: EditingLayer elements can't be moved
   - **Risk**: Limited editing flexibility
   - **Fix**: Implement drag-and-drop handlers

4. **No Undo/Redo**: State mutations not reversible
   - **Risk**: User mistakes permanent
   - **Fix**: Implement history stack in store

5. **Limited Annotation Editing**: Can select but not modify
   - **Risk**: Typos in annotations permanent
   - **Fix**: Add edit mode for annotations

### Performance Limitations

1. **Search**: Slow for 100+ page documents (5-30s)
2. **Rendering**: Large PDFs (500+ pages) may be sluggish
3. **Memory**: All overlays kept in memory (no pagination)
4. **Thumbnails**: Only first 20 pages generated

---

## Extension Points

### Adding New Annotation Types

1. Add type to `AnnotationType` in `types/index.ts`
2. Add rendering logic to `AnnotationLayer.tsx`
3. Add drawing logic to `pdf-service.ts` (applyModificationsToPDF)
4. Add tool button to `Toolbar.tsx`

### Adding New IPC Channels

1. Register handler in `main.ts`
2. Add method to `preload.ts` API
3. Add TypeScript definition to `types/index.ts`
4. Call from renderer components

### Adding New Tools

1. Add tool ID to store (`usePDFStore.ts`)
2. Add button to `Toolbar.tsx`
3. Create interaction layer component
4. Add processing logic to save flow

### Adding New Features

1. **Cloud Storage Integration**:
   - Add IPC methods for cloud API
   - Implement OAuth flow in main process
   - Add UI for cloud file picker

2. **Collaboration**:
   - Add WebSocket IPC channel
   - Implement operational transformation in store
   - Add presence indicators in UI

3. **Form Filling**:
   - Extend pdf-lib integration
   - Add form field detection
   - Create form filling UI components

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total Files | 49 |
| TypeScript Files | 40 |
| Main Process Files | 4 |
| Renderer Files | 24 |
| Service Files | 3 |
| Worker Files | 1 |
| Test Files | 5 |
| Config Files | 7 |
| Est. Lines of Code | 5,200 |
| IPC Channels | 19 |
| State Actions | 31 |
| Annotation Types | 11 |
| Overlay Layers | 5 |
| External Dependencies | 48 |
| Dev Dependencies | 20 |

---

## Recommended Exploration Paths

### For New Developers

1. **Start with State**:
   - Read `usePDFStore.ts` to understand data flow
   - Explore `types/index.ts` for data models

2. **Understand IPC**:
   - Read `preload.ts` to see API surface
   - Read `main.ts` to see handler implementations

3. **Explore Rendering**:
   - Read `PDFViewer.tsx` to understand layer composition
   - Read `pdf-renderer.ts` to understand PDF.js integration

4. **Study Modification Flow**:
   - Read `SaveDialog.tsx` to understand export process
   - Read `pdf-service.ts` to understand PDF manipulation

### For Feature Development

1. **New Annotation**: Extend `AnnotationLayer.tsx`
2. **New Tool**: Add to Toolbar, implement interaction layer
3. **New IPC Method**: Add to main.ts, preload.ts, types
4. **New UI Component**: Follow Radix UI + Tailwind pattern

### For Security Audit

1. Review all IPC handlers in `main.ts`
2. Verify contextBridge whitelist in `preload.ts`
3. Check file path sanitization in services
4. Audit electron-builder configuration

### For Performance Tuning

1. Profile `PDFRenderer.renderPage()` (Chrome DevTools)
2. Measure state update frequency (Zustand dev tools)
3. Analyze bundle size (rollup-plugin-visualizer)
4. Monitor memory usage during large PDF operations

---

## Conclusion

This knowledge graph provides a comprehensive map of the Portable Document Formatter codebase. The application demonstrates:

- **Security-first Electron architecture** with proper process isolation
- **Modern React patterns** (Zustand, hooks, TypeScript)
- **Complex state management** (multi-page overlays, editing)
- **Production-ready infrastructure** (testing, building, packaging)

The codebase is well-structured, maintainable, and follows Electron best practices. Key architectural strengths include clear separation between main/renderer processes, centralized Zustand store, and modular layer-based rendering.

The knowledge graph can be used for:
- **Onboarding new developers**
- **Planning architectural changes**
- **Identifying dependencies before refactoring**
- **Understanding data flow for debugging**
- **Security auditing**
- **Performance optimization planning**

For questions or contributions, refer to the interactive visualization (`knowledge-graph-visualization.html`) or query the JSON structure programmatically (`knowledge-graph.json`).

---

**Generated**: 2026-04-18
**Tool**: Electron JS Architect Agent
**Version**: 1.0.0
