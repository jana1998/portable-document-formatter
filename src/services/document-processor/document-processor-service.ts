/**
 * Document Processor Service
 *
 * Central registry and orchestrator for document processing backends
 * Implements automatic processor selection based on file type and availability
 */

import type {
  DocumentProcessor,
  ProcessingResult,
  ProcessingOptions,
  SupportedFileType,
  FileTypeDetectionResult,
} from './types';
import {
  DocumentProcessingError,
  ProcessingErrorCode,
} from './types';
import { detectFileType, detectFileTypeFromBuffer } from './file-type-detector';

/**
 * DocumentProcessorService - Registry and orchestrator
 *
 * This service manages multiple document processor backends and automatically
 * selects the best available processor for each document type.
 */
export class DocumentProcessorService {
  private processors: Map<string, DocumentProcessor> = new Map();
  private availabilityCache: Map<string, { available: boolean; timestamp: number }> = new Map();
  private readonly cacheTimeout = 60000; // 1 minute

  /**
   * Register a document processor
   *
   * @param processor - The processor to register
   */
  registerProcessor(processor: DocumentProcessor): void {
    if (this.processors.has(processor.name)) {
      console.warn(
        `[DocumentProcessorService] Processor ${processor.name} is already registered. Replacing.`
      );
    }

    this.processors.set(processor.name, processor);
    console.log(
      `[DocumentProcessorService] Registered processor: ${processor.name} (priority: ${processor.priority})`
    );
  }

  /**
   * Unregister a document processor
   *
   * @param processorName - Name of the processor to unregister
   */
  unregisterProcessor(processorName: string): void {
    const processor = this.processors.get(processorName);
    if (processor) {
      processor.cleanup().catch((error) => {
        console.error(
          `[DocumentProcessorService] Error cleaning up processor ${processorName}:`,
          error
        );
      });
      this.processors.delete(processorName);
      this.availabilityCache.delete(processorName);
      console.log(
        `[DocumentProcessorService] Unregistered processor: ${processorName}`
      );
    }
  }

  /**
   * Get all registered processors
   */
  getRegisteredProcessors(): DocumentProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Get a specific processor by name
   *
   * @param processorName - Name of the processor
   */
  getProcessor(processorName: string): DocumentProcessor | undefined {
    return this.processors.get(processorName);
  }

  /**
   * Process a document with automatic processor selection
   *
   * @param filePath - Absolute path to the document file
   * @param options - Processing options
   * @returns Processing result
   */
  async processDocument(
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    // Detect file type
    const detection = await detectFileType(filePath);

    // Select best processor
    const processor = await this.selectProcessor(detection.fileType);

    if (!processor) {
      throw new DocumentProcessingError(
        `No available processor found for file type: ${detection.fileType}`,
        ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
        'DocumentProcessorService'
      );
    }

    console.log(
      `[DocumentProcessorService] Processing ${detection.fileType} file with ${processor.name}`
    );

    // Process the document
    return await processor.process(filePath, options);
  }

  /**
   * Process a document buffer with automatic processor selection
   *
   * @param buffer - Document data buffer
   * @param fileName - Optional file name for type detection
   * @param options - Processing options
   * @returns Processing result
   */
  async processDocumentBuffer(
    buffer: Buffer,
    fileName?: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    // Detect file type
    const detection = detectFileTypeFromBuffer(buffer, fileName);

    // Select best processor
    const processor = await this.selectProcessor(detection.fileType);

    if (!processor) {
      throw new DocumentProcessingError(
        `No available processor found for file type: ${detection.fileType}`,
        ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
        'DocumentProcessorService'
      );
    }

    console.log(
      `[DocumentProcessorService] Processing ${detection.fileType} buffer with ${processor.name}`
    );

    // Process the document buffer
    return await processor.processBuffer(buffer, detection.fileType, options);
  }

  /**
   * Process with a specific processor
   *
   * @param processorName - Name of the processor to use
   * @param filePath - Absolute path to the document file
   * @param options - Processing options
   * @returns Processing result
   */
  async processWithProcessor(
    processorName: string,
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    const processor = this.processors.get(processorName);

    if (!processor) {
      throw new DocumentProcessingError(
        `Processor not found: ${processorName}`,
        ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
        'DocumentProcessorService'
      );
    }

    const isAvailable = await this.checkAvailability(processor);
    if (!isAvailable) {
      throw new DocumentProcessingError(
        `Processor ${processorName} is not available`,
        ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
        'DocumentProcessorService'
      );
    }

    return await processor.process(filePath, options);
  }

  /**
   * Select the best available processor for a file type
   *
   * @param fileType - The file type to process
   * @returns The selected processor, or null if none available
   */
  private async selectProcessor(
    fileType: SupportedFileType
  ): Promise<DocumentProcessor | null> {
    // Get all processors that can handle this file type
    const candidates = Array.from(this.processors.values()).filter((p) =>
      p.canProcess(fileType)
    );

    if (candidates.length === 0) {
      return null;
    }

    // Sort by priority (descending)
    candidates.sort((a, b) => b.priority - a.priority);

    // Check availability in priority order
    for (const processor of candidates) {
      const isAvailable = await this.checkAvailability(processor);
      if (isAvailable) {
        return processor;
      }
    }

    return null;
  }

  /**
   * Check if a processor is available (with caching)
   *
   * @param processor - The processor to check
   * @returns true if available
   */
  private async checkAvailability(
    processor: DocumentProcessor
  ): Promise<boolean> {
    const cached = this.availabilityCache.get(processor.name);
    const now = Date.now();

    // Use cached result if within timeout
    if (cached && now - cached.timestamp < this.cacheTimeout) {
      return cached.available;
    }

    // Check actual availability
    try {
      const available = await processor.isAvailable();
      this.availabilityCache.set(processor.name, {
        available,
        timestamp: now,
      });
      return available;
    } catch (error) {
      console.error(
        `[DocumentProcessorService] Error checking availability for ${processor.name}:`,
        error
      );
      this.availabilityCache.set(processor.name, {
        available: false,
        timestamp: now,
      });
      return false;
    }
  }

  /**
   * Clear availability cache
   */
  clearAvailabilityCache(): void {
    this.availabilityCache.clear();
  }

  /**
   * Get processor availability status for all registered processors
   *
   * @returns Map of processor names to availability status
   */
  async getProcessorStatus(): Promise<
    Map<string, { available: boolean; processor: DocumentProcessor }>
  > {
    const status = new Map<
      string,
      { available: boolean; processor: DocumentProcessor }
    >();

    for (const [name, processor] of this.processors) {
      const available = await this.checkAvailability(processor);
      status.set(name, { available, processor });
    }

    return status;
  }

  /**
   * Clean up all processors
   */
  async cleanup(): Promise<void> {
    console.log('[DocumentProcessorService] Cleaning up all processors...');

    const cleanupPromises = Array.from(this.processors.values()).map((p) =>
      p.cleanup().catch((error) => {
        console.error(
          `[DocumentProcessorService] Error cleaning up ${p.name}:`,
          error
        );
      })
    );

    await Promise.all(cleanupPromises);
    this.processors.clear();
    this.availabilityCache.clear();

    console.log('[DocumentProcessorService] Cleanup complete');
  }

  /**
   * Detect file type without processing
   *
   * @param filePath - Absolute path to the file
   * @returns File type detection result
   */
  async detectFileType(filePath: string): Promise<FileTypeDetectionResult> {
    return detectFileType(filePath);
  }

  /**
   * Detect file type from buffer without processing
   *
   * @param buffer - File data buffer
   * @param fileName - Optional file name for type detection
   * @returns File type detection result
   */
  detectFileTypeFromBuffer(
    buffer: Buffer,
    fileName?: string
  ): FileTypeDetectionResult {
    return detectFileTypeFromBuffer(buffer, fileName);
  }
}

// Export singleton instance
export const documentProcessorService = new DocumentProcessorService();
