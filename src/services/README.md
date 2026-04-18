# Services

This directory contains core services for the PDF processing application.

## Available Services

### CacheService

Persistent caching for PDF processing results using IndexedDB.

**Files:**
- `cache-db.ts` - Dexie database schema
- `cache-service.ts` - Main caching service
- `hash-utils.ts` - File hashing utilities
- `cache-integration-example.ts` - Integration examples

**Features:**
- Persistent IndexedDB storage
- Automatic expiration and cleanup
- Size-based eviction (LRU)
- File hash-based cache keys
- TypeScript generics support

**Usage:**
```typescript
import { cacheService } from '@/services/cache-service';
import { generateFileHash } from '@/services/hash-utils';

const fileHash = await generateFileHash(buffer);
const metadata = { fileHash, processor: 'ocr', version: '5.0.4' };

// Cache result
await cacheService.set(metadata, result);

// Retrieve from cache
const cached = await cacheService.get(metadata);
```

See [docs/CACHE_SERVICE.md](../../docs/CACHE_SERVICE.md) for detailed documentation.

### AnnotationService

Manages PDF annotations in memory.

**File:** `annotation-service.ts`

**Features:**
- Create, update, delete annotations
- Page-based storage
- Export/import annotations
- Multiple annotation types support

**Usage:**
```typescript
import { annotationService } from '@/services/annotation-service';

const annotation = annotationService.createAnnotation(
  pageNumber,
  'highlight',
  { x, y, width, height }
);

annotationService.addAnnotation(annotation);
```

### PDFRenderer

Renders PDF pages using PDF.js.

**File:** `pdf-renderer.ts`

**Features:**
- PDF document loading
- Page rendering to canvas
- Text extraction
- Search functionality

**Usage:**
```typescript
import { PDFRenderer } from '@/services/pdf-renderer';

const renderer = new PDFRenderer();
await renderer.loadDocument(arrayBuffer);
await renderer.renderPage(1, canvas, scale);
```

### OCRService

OCR processing using Tesseract.js.

**File:** `ocr-service.ts`

**Features:**
- Text recognition from images
- Multiple language support
- Confidence scoring

**Usage:**
```typescript
import { ocrService } from '@/services/ocr-service';

const result = await ocrService.recognize(imageData, 'eng');
```

## Service Integration

Services are designed to work together:

1. **PDFRenderer** → renders pages
2. **OCRService** → extracts text from rendered pages
3. **CacheService** → caches OCR results
4. **AnnotationService** → manages user annotations

## Testing

All services have corresponding test files in `src/tests/unit/`:

```bash
npm test -- src/tests/unit/cache-service.test.ts
npm test -- src/tests/unit/annotation-service.test.ts
npm test -- src/tests/unit/pdf-renderer.test.ts
```

## Adding a New Service

To add a new service:

1. Create service file in `src/services/`
2. Export service class and singleton instance
3. Add TypeScript interfaces
4. Create test file in `src/tests/unit/`
5. Update this README
6. Add documentation in `docs/` if complex

Example structure:

```typescript
// my-service.ts
export class MyService {
  async process(data: any): Promise<any> {
    // implementation
  }
}

export const myService = new MyService();
```

## Architecture Notes

- Services are **stateful singletons** (except where noted)
- Services should be **framework-agnostic** (no React dependencies)
- Use **async/await** for asynchronous operations
- Export both class and singleton instance
- Prefer **composition over inheritance**
- Keep services **focused on single responsibility**

## Dependencies

Main dependencies used by services:

- **Dexie.js** - IndexedDB wrapper (CacheService)
- **PDF.js** - PDF rendering (PDFRenderer)
- **Tesseract.js** - OCR (OCRService)
- **Zustand** - State management (not in services, but used by components)

## Performance Considerations

- Use caching for expensive operations (OCR, rendering)
- Implement lazy loading where possible
- Consider web workers for CPU-intensive tasks
- Monitor memory usage with large PDFs
- Clean up resources when done (e.g., `destroy()` methods)
