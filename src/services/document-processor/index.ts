/**
 * Document Processor Abstraction Layer
 *
 * Pluggable document processing system using the Strategy Pattern.
 * Supports multiple backends with automatic selection based on availability.
 *
 * @example
 * ```typescript
 * import {
 *   documentProcessorService,
 *   TesseractProcessor,
 *   MarkItDownProcessor,
 * } from './services/document-processor';
 *
 * // Register processors
 * documentProcessorService.registerProcessor(new MarkItDownProcessor());
 * documentProcessorService.registerProcessor(new TesseractProcessor());
 *
 * // Process a document (automatic processor selection)
 * const result = await documentProcessorService.processDocument('/path/to/document.pdf');
 * console.log(result.text);
 *
 * // Clean up when done
 * await documentProcessorService.cleanup();
 * ```
 */

// Core types and interfaces
export type {
  DocumentProcessor,
  ProcessingResult,
  ProcessingOptions,
  SupportedFileType,
  DocumentMetadata,
  FileTypeDetectionResult,
} from './types';

export {
  DocumentProcessingError,
  ProcessingErrorCode,
  ProcessorPriority,
} from './types';

// Service
export {
  DocumentProcessorService,
  documentProcessorService,
} from './document-processor-service';

// File type detection
export {
  detectFileType,
  detectFileTypeFromBuffer,
  isImageFile,
  isOfficeDocument,
  isTextDocument,
} from './file-type-detector';

// Processors
export { TesseractProcessor } from './processors/tesseract-processor';
export { MarkItDownProcessor } from './processors/markitdown-processor';
