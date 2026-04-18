# Document Processor Abstraction Layer

## Overview

The Document Processor Abstraction Layer is a pluggable, extensible system for processing various document formats. It implements the **Strategy Pattern** to allow multiple processing backends to coexist, with automatic selection based on file type and processor availability.

## Architecture

### Core Components

1. **DocumentProcessor Interface** - Defines the contract that all processors must implement
2. **DocumentProcessorService** - Central registry and orchestrator for processor selection
3. **File Type Detection** - Automatic file type detection using magic bytes and extensions
4. **Concrete Processors**:
   - `MarkItDownProcessor` - High-priority processor using Python's MarkItDown library
   - `TesseractProcessor` - Fallback OCR-based processor using Tesseract.js

### Design Pattern: Strategy Pattern

The system uses the Strategy Pattern to enable pluggable document processing backends:

```
┌──────────────────────────────────┐
│  DocumentProcessorService        │
│  (Context)                       │
│  - Manages processors            │
│  - Selects best available        │
│  - Routes processing requests    │
└────────┬─────────────────────────┘
         │
         │ uses
         │
         ▼
┌──────────────────────────────────┐
│  DocumentProcessor Interface     │
│  (Strategy)                      │
│  - canProcess(fileType)          │
│  - isAvailable()                 │
│  - process(filePath, options)    │
│  - processBuffer(buffer, ...)    │
│  - cleanup()                     │
└────────┬─────────────────────────┘
         │
         │ implemented by
         │
    ┌────┴─────┬──────────────┐
    ▼          ▼              ▼
┌─────────┐ ┌───────────┐ ┌───────────┐
│MarkIt   │ │Tesseract  │ │Custom     │
│Down     │ │Processor  │ │Processor  │
│Processor│ │           │ │           │
└─────────┘ └───────────┘ └───────────┘
```

### Priority-Based Selection

Processors are assigned priority levels:

- **HIGH (10)**: Specialized processors with comprehensive format support (e.g., MarkItDown)
- **NORMAL (5)**: Standard processors for common formats
- **FALLBACK (1)**: OCR-based processors that work but may be slower/less accurate (e.g., Tesseract)

The service automatically selects the highest-priority available processor for each file type.

## Installation

### Prerequisites

1. **Node.js 18+** with npm
2. **Tesseract.js** (included in package.json)
3. **MarkItDown** (optional, for enhanced processing):
   ```bash
   pip install markitdown
   ```

### Setup

The document processor system is already integrated into the project. No additional installation steps are required beyond `npm install`.

## Usage

### Basic Usage

```typescript
import {
  documentProcessorService,
  TesseractProcessor,
  MarkItDownProcessor,
} from './services/document-processor';

// Register processors (typically done at app startup)
documentProcessorService.registerProcessor(new MarkItDownProcessor());
documentProcessorService.registerProcessor(new TesseractProcessor());

// Process a document (automatic processor selection)
const result = await documentProcessorService.processDocument('/path/to/document.pdf');

console.log('Extracted text:', result.text);
console.log('Confidence:', result.confidence);
console.log('Processor used:', result.processorName);
console.log('Processing time:', result.processingTime, 'ms');

// Clean up when done (e.g., app shutdown)
await documentProcessorService.cleanup();
```

### Processing from Buffer

```typescript
const fileBuffer = await fs.readFile('/path/to/document.pdf');

const result = await documentProcessorService.processDocumentBuffer(
  fileBuffer,
  'document.pdf' // Optional filename hint for type detection
);
```

### Using a Specific Processor

```typescript
// Force use of a specific processor
const result = await documentProcessorService.processWithProcessor(
  'TesseractProcessor',
  '/path/to/scanned-image.png'
);
```

### Processing Options

```typescript
const options = {
  ocrLanguage: 'eng',        // OCR language (default: 'eng')
  enableOCR: true,           // Enable OCR for scanned documents
  timeout: 30000,            // Processing timeout in ms
  extractImages: false,      // Extract embedded images
  preserveFormatting: false, // Preserve document formatting
};

const result = await documentProcessorService.processDocument(
  '/path/to/document.pdf',
  options
);
```

### File Type Detection

```typescript
import { detectFileType } from './services/document-processor';

// Detect file type
const detection = await documentProcessorService.detectFileType('/path/to/unknown.file');

console.log('File type:', detection.fileType);
console.log('MIME type:', detection.mimeType);
console.log('Extension:', detection.extension);
console.log('Confidence:', detection.confidence);
```

### Checking Processor Status

```typescript
// Get status of all processors
const status = await documentProcessorService.getProcessorStatus();

for (const [name, info] of status) {
  console.log(`${name}: ${info.available ? 'Available' : 'Unavailable'}`);
  console.log(`  Priority: ${info.processor.priority}`);
  console.log(`  Description: ${info.processor.description}`);
}
```

## Supported File Types

| Type | Extensions | MarkItDown | Tesseract |
|------|-----------|------------|-----------|
| PDF | .pdf | ✓ | ✓ (OCR) |
| Word | .docx, .doc | ✓ | ✗ |
| Excel | .xlsx, .xls | ✓ | ✗ |
| PowerPoint | .pptx, .ppt | ✓ | ✗ |
| Text | .txt, .md | ✓ | ✗ |
| HTML | .html | ✓ | ✗ |
| CSV | .csv | ✓ | ✗ |
| JSON | .json | ✓ | ✗ |
| XML | .xml | ✓ | ✗ |
| Images | .png, .jpg, .gif, .bmp, .tiff | ✓ | ✓ (OCR) |

## Creating Custom Processors

You can create custom processors by implementing the `DocumentProcessor` interface:

```typescript
import type {
  DocumentProcessor,
  ProcessingResult,
  ProcessingOptions,
  SupportedFileType,
} from './services/document-processor/types';
import { ProcessorPriority } from './services/document-processor/types';

export class CustomProcessor implements DocumentProcessor {
  public readonly name = 'CustomProcessor';
  public readonly description = 'My custom processor';
  public readonly priority = ProcessorPriority.NORMAL;

  canProcess(fileType: SupportedFileType): boolean {
    // Return true for supported file types
    return fileType === 'pdf' || fileType === 'docx';
  }

  async isAvailable(): Promise<boolean> {
    // Check if processor dependencies are available
    return true;
  }

  async process(
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    // Your processing logic here
    const text = await this.extractText(filePath);

    return {
      text,
      confidence: 90,
      processorName: this.name,
      processingTime: Date.now() - startTime,
    };
  }

  async processBuffer(
    buffer: Buffer,
    fileType: SupportedFileType,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    // Process from buffer
    // ...
  }

  async cleanup(): Promise<void> {
    // Clean up resources
  }

  private async extractText(filePath: string): Promise<string> {
    // Your text extraction logic
    return '';
  }
}

// Register your custom processor
documentProcessorService.registerProcessor(new CustomProcessor());
```

## Integration with Electron Main Process

For use in Electron's main process (for IPC handlers):

```typescript
// In main.ts
import { ipcMain } from 'electron';
import {
  documentProcessorService,
  TesseractProcessor,
  MarkItDownProcessor,
} from './services/document-processor';

// Initialize processors
documentProcessorService.registerProcessor(new MarkItDownProcessor());
documentProcessorService.registerProcessor(new TesseractProcessor());

// Register IPC handler
ipcMain.handle('document:process', async (event, filePath: string, options?: any) => {
  try {
    const result = await documentProcessorService.processDocument(filePath, options);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Clean up on app quit
app.on('quit', async () => {
  await documentProcessorService.cleanup();
});
```

## Error Handling

The system provides structured error handling through `DocumentProcessingError`:

```typescript
import { DocumentProcessingError, ProcessingErrorCode } from './services/document-processor';

try {
  const result = await documentProcessorService.processDocument('/path/to/file.pdf');
} catch (error) {
  if (error instanceof DocumentProcessingError) {
    console.error('Processing error:', error.message);
    console.error('Error code:', error.code);
    console.error('Processor:', error.processorName);

    switch (error.code) {
      case ProcessingErrorCode.UNSUPPORTED_FILE_TYPE:
        // Handle unsupported file type
        break;
      case ProcessingErrorCode.FILE_NOT_FOUND:
        // Handle missing file
        break;
      case ProcessingErrorCode.PROCESSOR_UNAVAILABLE:
        // Handle no available processor
        break;
      case ProcessingErrorCode.OCR_FAILED:
        // Handle OCR failure
        break;
      // ... other cases
    }
  }
}
```

### Error Codes

- `UNSUPPORTED_FILE_TYPE` - File type not supported by any processor
- `FILE_NOT_FOUND` - Input file does not exist
- `FILE_CORRUPTED` - File is corrupted or invalid
- `PROCESSING_TIMEOUT` - Processing exceeded timeout limit
- `PROCESSOR_UNAVAILABLE` - No suitable processor available
- `OCR_FAILED` - OCR processing failed
- `INVALID_OPTIONS` - Invalid processing options provided
- `UNKNOWN_ERROR` - Unexpected error occurred

## Performance Considerations

### Availability Caching

The service caches processor availability checks for 1 minute to avoid repeated expensive checks. You can clear the cache manually:

```typescript
documentProcessorService.clearAvailabilityCache();
```

### Tesseract Worker Management

The TesseractProcessor maintains a single worker instance that is reused across multiple processing requests. The worker is automatically initialized on first use and cleaned up during service shutdown.

### MarkItDown Subprocess

The MarkItDownProcessor spawns a Python subprocess for each processing request. For high-volume processing, consider implementing a worker pool pattern or using a long-running Python service.

## Testing

Run the test suite:

```bash
npm test -- document-processor.test.ts
```

The test suite includes:
- Processor registration and unregistration
- Priority-based selection
- Fallback behavior
- Availability caching
- File type detection
- Error handling

## Roadmap

### Phase 1.2 Deliverables ✓

- [x] DocumentProcessor interface
- [x] DocumentProcessorService registry
- [x] MarkItDownProcessor implementation
- [x] TesseractProcessor fallback
- [x] File type detection
- [x] Auto-selection logic
- [x] Comprehensive tests
- [x] Documentation

### Future Enhancements

- **Phase 1.3**: Native PDF text extraction using pdf-lib
- **Phase 1.4**: Direct Office document parsing (docx-parser, xlsx-parser)
- **Phase 1.5**: Worker pool for parallel processing
- **Phase 1.6**: Streaming support for large documents
- **Phase 1.7**: Progress reporting and cancellation
- **Phase 1.8**: Cache layer for repeated document processing

## API Reference

### DocumentProcessor Interface

```typescript
interface DocumentProcessor {
  readonly name: string;
  readonly description: string;
  readonly priority: ProcessorPriority;

  canProcess(fileType: SupportedFileType): boolean;
  isAvailable(): Promise<boolean>;
  process(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult>;
  processBuffer(buffer: Buffer, fileType: SupportedFileType, options?: ProcessingOptions): Promise<ProcessingResult>;
  cleanup(): Promise<void>;
}
```

### ProcessingResult

```typescript
interface ProcessingResult {
  text: string;                    // Extracted text
  confidence: number;               // 0-100
  processorName: string;            // Name of processor used
  processingTime: number;           // Time in milliseconds
  metadata?: DocumentMetadata;      // Optional metadata
  warnings?: string[];              // Optional warnings
}
```

### ProcessingOptions

```typescript
interface ProcessingOptions {
  ocrLanguage?: string;             // OCR language (default: 'eng')
  enableOCR?: boolean;              // Enable OCR (default: true)
  timeout?: number;                 // Timeout in ms (default: 30000)
  extractImages?: boolean;          // Extract images (default: false)
  preserveFormatting?: boolean;     // Preserve formatting (default: false)
  [key: string]: unknown;           // Custom options
}
```

## Contributing

When adding new processors:

1. Implement the `DocumentProcessor` interface
2. Set appropriate priority level
3. Implement proper error handling with `DocumentProcessingError`
4. Add comprehensive tests
5. Update this documentation
6. Register the processor in the main initialization code

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please refer to the main project repository.
