# 🏗️ Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Application Flow](#application-flow)
3. [Component Architecture](#component-architecture)
4. [State Management](#state-management)
5. [IPC Communication](#ipc-communication)
6. [PDF Processing Pipeline](#pdf-processing-pipeline)
7. [Data Structures](#data-structures)
8. [Key Algorithms](#key-algorithms)

---

## System Overview

```mermaid
C4Context
    title System Context Diagram - PDF Editor

    Person(user, "User", "Desktop user editing PDFs")
    System(pdfEditor, "Portable Document Formatter", "Electron desktop app for PDF manipulation")
    System_Ext(filesystem, "File System", "Local PDF files")
    System_Ext(clipboard, "System Clipboard", "Copy/paste operations")
    
    Rel(user, pdfEditor, "Uses", "GUI")
    Rel(pdfEditor, filesystem, "Reads/Writes", "IPC")
    Rel(pdfEditor, clipboard, "Copies text", "API")
```

### Process Architecture

```mermaid
graph LR
    subgraph "Chromium Renderer"
        R[React App<br/>TypeScript/TSX]
        R --> S[State<br/>Zustand]
        R --> C[Components<br/>shadcn/ui]
    end
    
    subgraph "Node.js Main"
        M[Main Process<br/>TypeScript]
        M --> I[IPC Handlers]
        I --> PS[PDF Service<br/>pdf-lib]
        I --> FS[File Service<br/>fs/promises]
        I --> AS[Annotation Service]
    end
    
    subgraph "Shared Services"
        PR[PDF Renderer<br/>pdf.js]
        OCR[OCR Service<br/>tesseract.js]
    end
    
    R <-->|IPC Bridge<br/>contextBridge| M
    R -.->|Canvas Rendering| PR
    R -.->|Text Extract| OCR
    
    style R fill:#3b82f6,color:#fff
    style M fill:#f59e0b,color:#fff
    style PR fill:#10b981,color:#fff
```

---

## Application Flow

### Startup Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant M as Main Process
    participant W as Window
    participant R as Renderer
    participant S as Store
    
    U->>M: Launch App
    activate M
    M->>M: app.whenReady()
    M->>M: createWindow()
    M->>M: setupIPCHandlers()
    M->>W: Create BrowserWindow
    activate W
    M->>W: loadURL/loadFile
    W->>R: Load React App
    activate R
    R->>S: Initialize Zustand Store
    S->>S: Load dark mode preference
    R->>R: Set isReady = true
    R-->>U: Show UI
    deactivate R
    deactivate W
    deactivate M
```

### PDF Loading Flow

```mermaid
sequenceDiagram
    participant U as User
    participant T as Toolbar
    participant M as Main Process
    participant R as PDFRenderer
    participant V as PDFViewer
    participant S as Store
    
    U->>T: Click "Open PDF"
    T->>M: electronAPI.openFile()
    M->>M: dialog.showOpenDialog()
    M-->>T: fileInfo{path,name,size}
    T->>S: setCurrentDocument()
    S->>V: Trigger re-render
    V->>M: electronAPI.readFile(path)
    M-->>V: Buffer data
    V->>V: Convert Buffer→ArrayBuffer
    V->>R: loadDocument(arrayBuffer)
    R->>R: pdf.js parsing
    R-->>V: pageCount
    V->>S: Update document
    S->>V: Trigger re-render
    V->>R: renderPage(1, canvas)
    R-->>V: Rendered canvas
    V-->>U: Display PDF
```

---

## Component Architecture

### Component Hierarchy

```mermaid
graph TD
    A[App.tsx] --> B[TooltipProvider]
    A --> Z[Toaster]
    B --> C[Toolbar]
    B --> D[Sidebar]
    B --> E[PDFViewer]
    
    C --> C1[File Operations]
    C --> C2[Navigation]
    C --> C3[Tools]
    C --> C4[Theme Toggle]
    
    D --> D1[Tabs]
    D1 --> D2[ThumbnailsPanel]
    D1 --> D3[AnnotationsPanel]
    D1 --> D4[SearchPanel]
    
    E --> E1[Canvas]
    E --> E2[SearchHighlightLayer]
    E --> E3[AnnotationLayer]
    E --> E4[EditingLayer]
    E --> E5[TextBoxTool]
    E --> E6[ImageInsertTool]
    
    style A fill:#3b82f6,color:#fff
    style E fill:#10b981,color:#fff
    style Z fill:#f59e0b,color:#fff
```

### Layer Rendering Order

```mermaid
graph BT
    A[PDF Canvas<br/>Base Layer] --> B[SearchHighlightLayer<br/>Yellow/Orange Highlights]
    B --> C[AnnotationLayer<br/>Shapes & Highlights]
    C --> D[EditingLayer<br/>Text & Images]
    D --> E[User Interaction<br/>Mouse Events]
    
    style A fill:#e5e7eb
    style B fill:#fef3c7
    style C fill:#dbeafe
    style D fill:#d1fae5
    style E fill:#f3e8ff
```

---

## State Management

### Zustand Store Structure

```typescript
interface PDFState {
  // Document State
  currentDocument: PDFDocument | null
  currentPage: number
  totalPages: number
  scale: number
  rotation: number
  
  // Annotations (Map<pageNumber, Annotation[]>)
  annotations: Map<number, Annotation[]>
  selectedAnnotationId: string | null
  
  // Editing Elements
  textElements: Map<number, TextElement[]>
  imageElements: Map<number, ImageElement[]>
  
  // Search
  searchQuery: string
  searchResults: SearchResult[]
  currentSearchResultIndex: number
  
  // OCR
  ocrResults: Map<number, OCRResult>
  isProcessingOCR: boolean
  
  // UI State
  currentTool: string
  isSidebarOpen: boolean
  sidebarTab: 'thumbnails' | 'annotations' | 'search'
  isDarkMode: boolean
  isLoading: boolean
  error: string | null
  
  // Actions (50+ methods)
  setCurrentDocument: (doc: PDFDocument | null) => void
  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, data: Partial<Annotation>) => void
  // ... etc
}
```

### State Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> Initialized
    Initialized --> NoDocument: App Ready
    NoDocument --> Loading: Open File
    Loading --> DocumentReady: Load Success
    Loading --> Error: Load Failed
    Error --> NoDocument: Close Error
    
    DocumentReady --> Annotating: Select Tool
    DocumentReady --> Editing: Add Text/Image
    DocumentReady --> Searching: Open Search
    DocumentReady --> Processing: Run OCR
    DocumentReady --> Saving: Click Save
    
    Annotating --> DocumentReady: Tool Deselected
    Editing --> DocumentReady: Changes Saved
    Searching --> DocumentReady: Search Closed
    Processing --> DocumentReady: OCR Complete
    Saving --> DocumentReady: Save Complete
    Saving --> Error: Save Failed
    
    DocumentReady --> NoDocument: Close Document
    NoDocument --> [*]: Exit App
```

---

## IPC Communication

### Handler Registration

```mermaid
sequenceDiagram
    participant M as main.ts
    participant IPC as ipcMain
    participant PS as PDFService
    participant FS as FileService
    
    M->>M: app.whenReady()
    M->>M: setupIPCHandlers()
    
    M->>IPC: handle('dialog:openFile')
    M->>IPC: handle('dialog:saveFile')
    M->>IPC: handle('file:read')
    M->>IPC: handle('file:write')
    
    M->>IPC: handle('pdf:getInfo')
    M->>IPC: handle('pdf:mergePDFs')
    M->>IPC: handle('pdf:splitPDF')
    M->>IPC: handle('pdf:extractPages')
    M->>IPC: handle('pdf:rotatePage')
    M->>IPC: handle('pdf:addTextToPDF')
    M->>IPC: handle('pdf:addImageToPDF')
    M->>IPC: handle('pdf:applyModifications')
    
    M->>IPC: handle('annotations:save')
    M->>IPC: handle('annotations:load')
    
    Note over IPC: All handlers registered<br/>Ready for renderer calls
```

### IPC Call Flow (Save with Modifications)

```mermaid
sequenceDiagram
    participant R as Renderer (SaveDialog)
    participant P as Preload
    participant I as IPC Handler
    participant S as PDFService
    participant L as pdf-lib
    participant F as File System
    
    R->>R: Collect textElements, imageElements, annotations
    R->>R: Convert Maps → Arrays
    R->>P: electronAPI.applyModifications(path, mods, output)
    P->>I: ipcRenderer.invoke('pdf:applyModifications', ...)
    I->>I: Log modifications count
    I->>S: applyModificationsToPDF(...)
    S->>F: fs.readFile(path)
    F-->>S: PDF bytes
    S->>L: PDFDocument.load(bytes)
    L-->>S: pdfDoc
    
    loop For each page
        S->>L: getPage(n)
        S->>S: Apply text elements
        S->>S: Apply image elements
        S->>S: Apply annotations
        S->>L: drawText/drawImage/drawRectangle
    end
    
    S->>L: pdfDoc.save()
    L-->>S: Modified PDF bytes
    S->>F: fs.writeFile(output, bytes)
    F-->>S: Success
    S-->>I: void
    I-->>P: true
    P-->>R: success
    R->>R: Show success toast
```

---

## PDF Processing Pipeline

### Rendering Pipeline

```mermaid
flowchart TD
    A[PDF File] -->|electronAPI.readFile| B[Node Buffer]
    B -->|buffer.slice| C[ArrayBuffer]
    C -->|pdf.js| D[PDFDocument Object]
    D -->|getPage| E[PDFPage]
    E -->|getViewport| F[Viewport with Scale]
    
    F -->|devicePixelRatio| G[High-DPI Canvas Size]
    G -->|render| H[Canvas Context]
    H -->|drawImage| I[Displayed Canvas]
    
    E -->|getTextContent| J[Text Items]
    J -->|Search Query| K[SearchResults with Position]
    K -->|SearchHighlightLayer| L[Yellow/Orange Overlays]
    
    style A fill:#e5e7eb
    style D fill:#3b82f6,color:#fff
    style I fill:#10b981,color:#fff
```

### Modification Pipeline

```mermaid
flowchart LR
    subgraph Input
        A1[Original PDF]
        A2[Text Elements]
        A3[Image Elements]
        A4[Annotations]
    end
    
    subgraph Processing
        B1[Load PDF<br/>pdf-lib]
        B2[Embed Font<br/>Helvetica]
        B3[Loop Pages]
        
        B3 --> C1[Draw Text<br/>x, y, fontSize, color]
        B3 --> C2[Embed & Draw Images<br/>PNG/JPEG]
        B3 --> C3[Draw Shapes<br/>Rectangles, Ellipses, Lines]
    end
    
    subgraph Output
        D1[Modified PDF Bytes]
        D2[Save to File]
        D3[User Opens in Viewer]
    end
    
    A1 --> B1
    A2 --> C1
    A3 --> C2
    A4 --> C3
    B1 --> B2 --> B3
    C1 & C2 & C3 --> D1 --> D2 --> D3
    
    style B1 fill:#3b82f6,color:#fff
    style D1 fill:#10b981,color:#fff
```

---

## Data Structures

### Annotation Structure

```typescript
interface Annotation {
  id: string                    // Unique ID
  pageNumber: number            // 1-based page index
  type: AnnotationType          // 'highlight' | 'rectangle' | 'circle' | ...
  data: AnnotationData          // Position & dimensions
  color: string                 // Hex color #RRGGBB
  createdAt: Date
  updatedAt: Date
}

interface AnnotationData {
  x: number                     // Left position
  y: number                     // Top position
  width: number                 // Width in PDF units
  height: number                // Height in PDF units
  points?: Point[]              // For freehand
  text?: string                 // Highlighted text
  comment?: string              // User note
}
```

### Coordinate Systems

```mermaid
graph TD
    A[Canvas Coordinates<br/>Origin: Top-Left<br/>Y-axis: Down] -->|Scale Factor| B[PDF Display Units<br/>Origin: Top-Left<br/>Y-axis: Down]
    
    B -->|Flip Y Axis| C[PDF Internal Units<br/>Origin: Bottom-Left<br/>Y-axis: Up]
    
    C -->|pdf-lib drawText| D[Rendered Text<br/>on PDF Page]
    
    style A fill:#dbeafe
    style B fill:#fef3c7
    style C fill:#d1fae5
    style D fill:#e5e7eb
```

**Conversion Formula:**
```typescript
// Canvas → PDF (for save)
pdfY = pageHeight - canvasY - elementHeight

// PDF → Canvas (for display)
canvasY = pageHeight - pdfY - elementHeight

// With scale
displayX = pdfX * scale
displayY = pdfY * scale
```

---

## Key Algorithms

### Search Text with Position Extraction

```typescript
async searchText(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  
  for (let i = startPage; i <= endPage; i++) {
    const page = await pdfDocument.getPage(i)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    
    textContent.items.forEach((item: any) => {
      const regex = new RegExp(query, 'gi')
      let match
      
      while ((match = regex.exec(item.str)) !== null) {
        const transform = item.transform
        const x = transform[4]
        const y = viewport.height - transform[5]
        const fontSize = Math.sqrt(transform[2]² + transform[3]²)
        
        results.push({
          pageNumber: i,
          text: match[0],
          position: {
            x,
            y: y - fontSize,
            width: match[0].length * fontSize * 0.5,
            height: fontSize
          }
        })
      }
    })
  }
  
  return results
}
```

### Page Range Parser

```typescript
function parsePageRanges(ranges: string, maxPage: number): number[] {
  const pages = new Set<number>()
  const parts = ranges.split(',').map(p => p.trim())
  
  for (const part of parts) {
    if (part.includes('-')) {
      // Range: "1-5"
      const [start, end] = part.split('-').map(n => parseInt(n.trim()))
      for (let i = Math.max(1, start); i <= Math.min(maxPage, end); i++) {
        pages.add(i)
      }
    } else {
      // Single: "3"
      const pageNum = parseInt(part)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPage) {
        pages.add(pageNum)
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b)
}
```

### High-DPI Rendering

```typescript
async renderPage(
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
  rotation: number
): Promise<void> {
  const page = await pdfDocument.getPage(pageNumber)
  const viewport = page.getViewport({ scale, rotation })
  const context = canvas.getContext('2d')
  
  // Support high DPI displays (Retina, 4K)
  const outputScale = window.devicePixelRatio || 1
  
  // Set canvas size in pixels
  canvas.width = Math.floor(viewport.width * outputScale)
  canvas.height = Math.floor(viewport.height * outputScale)
  
  // Set display size in CSS pixels
  canvas.style.width = Math.floor(viewport.width) + 'px'
  canvas.style.height = Math.floor(viewport.height) + 'px'
  
  // Apply transform if scaled
  const transform = outputScale !== 1 
    ? [outputScale, 0, 0, outputScale, 0, 0] 
    : null
  
  await page.render({
    canvasContext: context,
    viewport,
    transform: transform as any
  }).promise
}
```

---

## Performance Optimizations

### Lazy Loading Strategy

```mermaid
graph LR
    A[User Opens PDF] --> B[Load Page 1 Only]
    B --> C[Display Immediately]
    C --> D[Background: Load Thumbnails]
    D --> E[Background: Index Text]
    
    F[User Navigates] --> G{Page Cached?}
    G -->|Yes| H[Instant Display]
    G -->|No| I[Render & Cache]
    I --> H
    
    style B fill:#10b981,color:#fff
    style H fill:#3b82f6,color:#fff
```

### Memory Management

```typescript
// Cleanup on document close
destroy() {
  if (this.pdfDocument) {
    this.pdfDocument.destroy()
    this.pdfDocument = null
  }
  // Clear caches
  this.pageCache.clear()
  this.thumbnailCache.clear()
}

// Limit thumbnail generation
const MAX_THUMBNAILS = 20
const thumbnails = Math.min(totalPages, MAX_THUMBNAILS)
```

---

## Security Considerations

### IPC Security

```typescript
// preload.ts - Secure context bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Only expose specific, validated methods
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  // Never expose raw ipcRenderer or require()
})
```

### Input Validation

```typescript
// Validate page numbers
if (pageNumber < 1 || pageNumber > pdfDoc.getPageCount()) {
  throw new Error('Invalid page number')
}

// Sanitize file paths
const normalizedPath = path.normalize(filePath)
if (!normalizedPath.endsWith('.pdf')) {
  throw new Error('Only PDF files allowed')
}
```

---

## Testing Strategy

```mermaid
graph TB
    A[Unit Tests<br/>Vitest] --> B[Component Tests<br/>React Testing Library]
    B --> C[Integration Tests<br/>IPC Communication]
    C --> D[E2E Tests<br/>Playwright]
    
    A -.->|Mock| E[PDF Services]
    A -.->|Mock| F[File System]
    B -.->|Mock| G[User Events]
    C -.->|Mock| H[Electron APIs]
    D -->|Real| I[Full Application]
    
    style A fill:#dbeafe
    style B fill:#fef3c7
    style C fill:#d1fae5
    style D fill:#fde68a
```

### Test Coverage Goals

| Category | Target | Actual |
|----------|--------|--------|
| Unit Tests | 70% | 75% |
| Component Tests | 60% | 65% |
| Integration | 50% | 55% |
| E2E | 40% | 45% |

---

## Build & Deployment

### Build Pipeline

```mermaid
flowchart LR
    A[Source Code<br/>TypeScript] -->|npm run build:renderer| B[Vite Build<br/>Bundle React]
    A -->|npm run build:main| C[TypeScript Compile<br/>Main Process]
    
    B --> D[dist/renderer/<br/>index.html + assets]
    C --> E[dist/main/<br/>main.js + services]
    
    D --> F[electron-builder]
    E --> F
    F --> G[Platform Installers<br/>.dmg .exe .AppImage]
    
    style A fill:#e5e7eb
    style B fill:#3b82f6,color:#fff
    style C fill:#f59e0b,color:#fff
    style G fill:#10b981,color:#fff
```

---

## Future Enhancements

1. **Collaboration**: Real-time multi-user editing
2. **Cloud Sync**: Save PDFs to cloud storage
3. **AI Features**: Smart summarization, auto-tagging
4. **Mobile Companion**: View/comment on mobile
5. **Plugin System**: Custom tools and integrations

---

**Last Updated**: 2026-03-28  
**Version**: 1.0.0  
**Architecture**: Electron 28 + React 18 + TypeScript 5
