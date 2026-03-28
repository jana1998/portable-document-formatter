# Portable Document Formatter

A production-ready Electron desktop application for comprehensive PDF manipulation, similar to Foxit PDF Editor.

## Features

### 📄 PDF Viewer
- High-performance PDF rendering using pdf.js
- Zoom controls (50% - 300%)
- Page navigation with thumbnails
- Smooth scrolling and lazy loading
- Text selection layer

### ✏️ Annotation System
- Highlight text
- Underline and strikethrough
- Draw shapes (rectangles, circles, lines)
- Freehand drawing
- Add comments and notes
- Annotations stored as JSON (non-destructive)

### 📑 Page Management
- Merge multiple PDFs
- Split PDFs at any page
- Reorder pages with drag & drop
- Delete pages
- Extract specific pages

### 🖊️ Basic Editing
- Add text boxes
- Insert images
- Move and resize elements
- Customizable fonts and colors

### 🔍 Search
- Full-text search across entire PDF
- Highlight search results
- Navigate between matches

### 🔤 OCR (Optical Character Recognition)
- Detect scanned PDFs
- Extract text from images using Tesseract.js
- Create searchable PDFs
- Process pages in background worker

### 📤 Export
- Save edited PDFs
- Export pages as PNG/JPEG
- Extract text content
- Configurable quality and DPI

## Tech Stack

- **Electron** (v28+) - Desktop application framework
- **React** (v18) - UI framework
- **TypeScript** - Type safety
- **pdf.js** - PDF rendering
- **pdf-lib** - PDF manipulation
- **tesseract.js** - OCR engine
- **Zustand** - State management
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components
- **Vitest** - Unit testing
- **Playwright** - E2E testing

## Project Structure

```
portable-document-formatter/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── main.ts               # Main entry point
│   │   ├── preload.ts            # Preload script for IPC
│   │   └── services/             # Main process services
│   │       ├── file-service.ts   # File I/O operations
│   │       └── pdf-service.ts    # PDF manipulation
│   │
│   ├── renderer/                  # React application
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui base components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── slider.tsx
│   │   │   │   └── ...
│   │   │   ├── common/           # Reusable components
│   │   │   │   ├── Toolbar.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   └── features/         # Feature-specific components
│   │   │       ├── viewer/
│   │   │       ├── annotations/
│   │   │       ├── pages/
│   │   │       ├── editing/
│   │   │       ├── search/
│   │   │       └── ocr/
│   │   ├── hooks/                # Custom React hooks
│   │   ├── store/                # Zustand stores
│   │   ├── styles/               # Global styles
│   │   ├── types/                # TypeScript types
│   │   ├── lib/                  # Utilities
│   │   ├── App.tsx              # Main app component
│   │   └── main.tsx             # React entry point
│   │
│   ├── services/                  # Shared services
│   │   ├── pdf-renderer.ts       # PDF.js wrapper
│   │   ├── annotation-service.ts # Annotation management
│   │   └── ocr-service.ts        # OCR coordination
│   │
│   ├── workers/                   # Web Workers
│   │   └── ocr-worker.ts         # OCR processing worker
│   │
│   ├── tests/                     # Unit & integration tests
│   │   ├── setup.ts
│   │   ├── unit/
│   │   └── ui/
│   │
│   └── e2e/                       # End-to-end tests
│       └── pdf-viewer.spec.ts
│
├── dist/                          # Build output
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── tailwind.config.js
└── README.md
```

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/portable-document-formatter.git
cd portable-document-formatter
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

This will start:
- Vite dev server (React app) on `http://localhost:5173`
- Electron app with hot reload

## Available Scripts

### Development
```bash
npm run dev              # Start development mode
npm run dev:renderer     # Start only Vite dev server
npm run dev:main         # Build main process and start Electron
```

### Building
```bash
npm run build            # Build for production
npm run build:renderer   # Build renderer process
npm run build:main       # Build main process
```

### Testing
```bash
npm test                 # Run unit tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:e2e         # Run E2E tests
```

### Other
```bash
npm run lint             # Lint code
npm run format           # Format code with Prettier
npm start                # Start built application
```

## Testing

### Unit Tests
Located in `src/tests/unit/` and `src/tests/ui/`

Run unit tests:
```bash
npm test
```

Example test files:
- `pdf-renderer.test.ts` - Tests for PDF rendering
- `annotation-service.test.ts` - Tests for annotations
- `pdf-store.test.ts` - Tests for state management
- `Toolbar.test.tsx` - Tests for UI components

### E2E Tests
Located in `src/e2e/`

Run E2E tests:
```bash
npm run test:e2e
```

Example test files:
- `pdf-viewer.spec.ts` - Tests for PDF viewer functionality

### Coverage
Minimum test coverage: **70%**

Generate coverage report:
```bash
npm run test:coverage
```

## Usage

### Opening a PDF
1. Click the "Open PDF" button in the toolbar
2. Select a PDF file from your computer
3. The PDF will load in the viewer

### Adding Annotations
1. Select an annotation tool from the toolbar (Highlight, Rectangle, etc.)
2. Click and drag on the PDF to create the annotation
3. Annotations are saved automatically
4. View all annotations in the Annotations panel

### Page Management
1. Click the page management icon
2. Choose an operation (Merge, Split, Delete, Extract)
3. Follow the prompts to complete the operation
4. Save the modified PDF

### Searching
1. Click the Search icon or open the Search panel
2. Enter your search query
3. Navigate through results using the arrow buttons
4. Click on a result to jump to that page

### OCR
1. Open a scanned PDF
2. Click the OCR button in the toolbar
3. Select pages to process
4. Wait for OCR to complete
5. Text will become searchable

### Exporting
1. Go to File > Export
2. Choose format (PDF, PNG, JPEG, TXT)
3. Select pages to export
4. Configure quality settings
5. Save the exported file

## Architecture

### IPC Communication
The app uses Electron's IPC for secure communication between main and renderer processes:

**Renderer → Main:**
- `dialog:openFile` - Open file dialog
- `dialog:saveFile` - Save file dialog
- `pdf:mergePDFs` - Merge multiple PDFs
- `pdf:splitPDF` - Split PDF
- `annotations:save` - Save annotations

**Main → Renderer:**
- File data and metadata
- Operation results
- Error messages

### State Management
Zustand is used for global state:
- Current document state
- Page navigation
- Annotations
- UI state (sidebar, tools, etc.)

### Worker Threads
Heavy operations run in Web Workers to avoid blocking the UI:
- OCR processing (tesseract.js)
- PDF parsing
- Large file operations

### Error Handling
- All async operations have try-catch blocks
- User-friendly error messages
- Fallback UI for failed operations
- Logging for debugging

## Development Notes

### Adding New Features
1. Create components in `src/renderer/components/features/`
2. Add services in `src/services/`
3. Update types in `src/renderer/types/`
4. Add IPC handlers in `src/main/main.ts`
5. Write tests in `src/tests/`

### shadcn/ui Components
All UI components use shadcn/ui. To add a new component:
1. Add to `src/renderer/components/ui/`
2. Follow shadcn/ui patterns
3. Use Tailwind for styling

### Styling
- Use Tailwind utility classes
- Follow the design system in `tailwind.config.js`
- Use CSS variables for theming
- Custom styles in `src/renderer/styles/globals.css`

## Performance Optimizations

- **Lazy Loading:** Pages are rendered on-demand
- **Virtual Scrolling:** Thumbnails use virtual scrolling for large documents
- **Debouncing:** Search and zoom operations are debounced
- **Memoization:** React components use proper memoization
- **Worker Threads:** Heavy operations don't block the UI
- **Canvas Pooling:** Reuse canvas elements for rendering

## Security

- **Context Isolation:** Enabled in Electron
- **No Node Integration:** Renderer process doesn't have direct Node access
- **Preload Script:** Secure IPC bridge
- **Input Validation:** All user inputs are validated
- **No Inline Scripts:** CSP-compliant

## Known Limitations

1. **Image Export:** Requires additional native dependencies (currently placeholder)
2. **Text Extraction:** Requires pdf-parse or similar (currently placeholder)
3. **Large Files:** Files over 500MB may have performance issues
4. **OCR Accuracy:** Depends on image quality and language

## Future Enhancements

- [ ] Digital signatures
- [ ] Form filling
- [ ] Redaction tools
- [ ] Batch processing
- [ ] Cloud storage integration
- [ ] Collaborative editing
- [ ] More export formats
- [ ] Advanced text editing
- [ ] Custom stamps and watermarks
- [ ] Compare documents

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please visit the GitHub repository.

## Acknowledgments

- pdf.js by Mozilla
- pdf-lib by Andrew Dillon
- tesseract.js by Naptha
- shadcn/ui by shadcn
- Electron team
- React team
