/**
 * Document Processor Abstraction Layer Types
 *
 * This module defines the core types and interfaces for the pluggable
 * document processing backend system using the Strategy Pattern.
 */

/**
 * Supported document file types that can be processed
 */
export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'xlsx'
  | 'xls'
  | 'pptx'
  | 'ppt'
  | 'txt'
  | 'md'
  | 'html'
  | 'csv'
  | 'json'
  | 'xml'
  | 'image'; // Generic image type (png, jpg, jpeg, gif, bmp, tiff)

/**
 * Processing result containing extracted text and metadata
 */
export interface ProcessingResult {
  /** Successfully extracted text content */
  text: string;

  /** Processing confidence score (0-100) */
  confidence: number;

  /** Optional metadata about the document */
  metadata?: DocumentMetadata;

  /** Name of the processor that handled this document */
  processorName: string;

  /** Time taken to process in milliseconds */
  processingTime: number;

  /** Any warnings encountered during processing */
  warnings?: string[];
}

/**
 * Document metadata extracted during processing
 */
export interface DocumentMetadata {
  /** Document title, if available */
  title?: string;

  /** Document author, if available */
  author?: string;

  /** Page count for multi-page documents */
  pageCount?: number;

  /** File size in bytes */
  fileSize?: number;

  /** Document creation date, if available */
  createdAt?: Date;

  /** Document modification date, if available */
  modifiedAt?: Date;

  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Options for document processing
 */
export interface ProcessingOptions {
  /** OCR language for image-based documents (default: 'eng') */
  ocrLanguage?: string;

  /** Enable OCR for scanned documents (default: true) */
  enableOCR?: boolean;

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Extract images from document (default: false) */
  extractImages?: boolean;

  /** Preserve formatting information (default: false) */
  preserveFormatting?: boolean;

  /** Additional processor-specific options */
  [key: string]: unknown;
}

/**
 * Error thrown during document processing
 */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: ProcessingErrorCode,
    public readonly processorName?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}

/**
 * Error codes for document processing failures
 */
export enum ProcessingErrorCode {
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
  PROCESSOR_UNAVAILABLE = 'PROCESSOR_UNAVAILABLE',
  OCR_FAILED = 'OCR_FAILED',
  INVALID_OPTIONS = 'INVALID_OPTIONS',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Processor priority level - higher numbers indicate higher priority
 */
export enum ProcessorPriority {
  FALLBACK = 1,
  NORMAL = 5,
  HIGH = 10,
}

/**
 * Core interface that all document processors must implement
 *
 * This defines the Strategy Pattern interface for pluggable backends
 */
export interface DocumentProcessor {
  /**
   * Unique identifier for this processor
   */
  readonly name: string;

  /**
   * Human-readable description of this processor
   */
  readonly description: string;

  /**
   * Priority level for processor selection
   */
  readonly priority: ProcessorPriority;

  /**
   * Check if this processor can handle the given file type
   *
   * @param fileType - The file type to check
   * @returns true if this processor supports the file type
   */
  canProcess(fileType: SupportedFileType): boolean;

  /**
   * Check if this processor is available for use
   *
   * @returns true if the processor is ready and available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Process a document file and extract its content
   *
   * @param filePath - Absolute path to the document file
   * @param options - Processing options
   * @returns Processing result with extracted content
   * @throws {DocumentProcessingError} if processing fails
   */
  process(
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult>;

  /**
   * Process document from buffer data
   *
   * @param buffer - Document data as Buffer
   * @param fileType - Type of the document
   * @param options - Processing options
   * @returns Processing result with extracted content
   * @throws {DocumentProcessingError} if processing fails
   */
  processBuffer(
    buffer: Buffer,
    fileType: SupportedFileType,
    options?: ProcessingOptions
  ): Promise<ProcessingResult>;

  /**
   * Clean up resources used by this processor
   */
  cleanup(): Promise<void>;
}

/**
 * File type detection result
 */
export interface FileTypeDetectionResult {
  /** Detected file type */
  fileType: SupportedFileType;

  /** MIME type of the file */
  mimeType: string;

  /** File extension (without dot) */
  extension: string;

  /** Confidence of detection (0-100) */
  confidence: number;
}
