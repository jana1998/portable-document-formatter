/**
 * Tesseract OCR Processor
 *
 * Fallback processor using Tesseract.js for OCR-based document processing
 */

import * as fs from 'fs/promises';
import { createWorker, type Worker } from 'tesseract.js';
import type {
  DocumentProcessor,
  ProcessingResult,
  ProcessingOptions,
  SupportedFileType,
} from '../types';
import {
  DocumentProcessingError,
  ProcessingErrorCode,
  ProcessorPriority,
} from '../types';
import { isImageFile } from '../file-type-detector';

/**
 * TesseractProcessor - OCR-based fallback processor
 *
 * This processor uses Tesseract.js to perform OCR on images and scanned documents.
 * It acts as a fallback when specialized processors are unavailable.
 */
export class TesseractProcessor implements DocumentProcessor {
  public readonly name = 'TesseractProcessor';
  public readonly description =
    'OCR-based processor using Tesseract.js for image and scanned document processing';
  public readonly priority = ProcessorPriority.FALLBACK;

  private worker: Worker | null = null;
  private workerInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Supported file types (primarily images and scanned PDFs)
   */
  private readonly supportedTypes: Set<SupportedFileType> = new Set([
    'image',
    'pdf', // Can handle scanned PDFs through OCR
  ]);

  /**
   * Check if this processor can handle the given file type
   */
  canProcess(fileType: SupportedFileType): boolean {
    return this.supportedTypes.has(fileType);
  }

  /**
   * Check if Tesseract is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to initialize the worker if not already done
      if (!this.workerInitialized) {
        await this.initializeWorker();
      }
      return this.workerInitialized;
    } catch (error) {
      console.error('[TesseractProcessor] Availability check failed:', error);
      return false;
    }
  }

  /**
   * Initialize the Tesseract worker
   */
  private async initializeWorker(language = 'eng'): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        if (!this.worker) {
          this.worker = await createWorker(language, 1, {
            // Use local worker path for Electron compatibility
            workerPath: undefined, // Let Tesseract.js determine the path
            logger: (m) => {
              // Optional: log progress
              if (m.status === 'recognizing text') {
                console.log(
                  `[TesseractProcessor] OCR Progress: ${Math.round(m.progress * 100)}%`
                );
              }
            },
          });
          this.workerInitialized = true;
        }
      } catch (error) {
        this.workerInitialized = false;
        throw new DocumentProcessingError(
          `Failed to initialize Tesseract worker: ${error}`,
          ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
          this.name,
          error as Error
        );
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Process a document file
   */
  async process(
    filePath: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const language = options.ocrLanguage || 'eng';

    try {
      // Initialize worker if needed
      await this.initializeWorker(language);

      if (!this.worker) {
        throw new DocumentProcessingError(
          'Tesseract worker not initialized',
          ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
          this.name
        );
      }

      // Perform OCR
      const { data } = await this.worker.recognize(filePath);

      const processingTime = Date.now() - startTime;
      const warnings: string[] = [];

      // Check confidence
      if (data.confidence < 60) {
        warnings.push(
          `Low OCR confidence: ${data.confidence.toFixed(1)}%. Results may be inaccurate.`
        );
      }

      return {
        text: data.text,
        confidence: data.confidence,
        processorName: this.name,
        processingTime,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          pageCount: 1, // Single page/image
          wordCount: data.words?.length || 0,
          paragraphCount: data.paragraphs?.length || 0,
        },
      };
    } catch (error) {
      throw new DocumentProcessingError(
        `OCR processing failed: ${error}`,
        ProcessingErrorCode.OCR_FAILED,
        this.name,
        error as Error
      );
    }
  }

  /**
   * Process document from buffer
   */
  async processBuffer(
    buffer: Buffer,
    fileType: SupportedFileType,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const language = options.ocrLanguage || 'eng';

    try {
      if (!this.canProcess(fileType)) {
        throw new DocumentProcessingError(
          `File type ${fileType} not supported by ${this.name}`,
          ProcessingErrorCode.UNSUPPORTED_FILE_TYPE,
          this.name
        );
      }

      // Initialize worker if needed
      await this.initializeWorker(language);

      if (!this.worker) {
        throw new DocumentProcessingError(
          'Tesseract worker not initialized',
          ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
          this.name
        );
      }

      // Convert buffer to data URL for Tesseract
      const base64 = buffer.toString('base64');
      const mimeType = this.getMimeType(fileType);
      const dataUrl = `data:${mimeType};base64,${base64}`;

      // Perform OCR
      const { data } = await this.worker.recognize(dataUrl);

      const processingTime = Date.now() - startTime;
      const warnings: string[] = [];

      if (data.confidence < 60) {
        warnings.push(
          `Low OCR confidence: ${data.confidence.toFixed(1)}%. Results may be inaccurate.`
        );
      }

      return {
        text: data.text,
        confidence: data.confidence,
        processorName: this.name,
        processingTime,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          pageCount: 1,
          wordCount: data.words?.length || 0,
          paragraphCount: data.paragraphs?.length || 0,
        },
      };
    } catch (error) {
      throw new DocumentProcessingError(
        `OCR buffer processing failed: ${error}`,
        ProcessingErrorCode.OCR_FAILED,
        this.name,
        error as Error
      );
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.workerInitialized = false;
        this.initializationPromise = null;
      } catch (error) {
        console.error('[TesseractProcessor] Cleanup error:', error);
      }
    }
  }

  /**
   * Get MIME type for a file type
   */
  private getMimeType(fileType: SupportedFileType): string {
    if (isImageFile(fileType)) {
      return 'image/png'; // Default to PNG for images
    }
    if (fileType === 'pdf') {
      return 'application/pdf';
    }
    return 'application/octet-stream';
  }
}
