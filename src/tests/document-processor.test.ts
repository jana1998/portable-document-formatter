/**
 * Unit Tests for Document Processor Abstraction Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  DocumentProcessor,
  ProcessingResult,
  ProcessingOptions,
  SupportedFileType,
} from '../services/document-processor/types';
import {
  DocumentProcessingError,
  ProcessingErrorCode,
  ProcessorPriority,
} from '../services/document-processor/types';
import { DocumentProcessorService } from '../services/document-processor/document-processor-service';
import {
  detectFileTypeFromBuffer,
  isImageFile,
  isOfficeDocument,
  isTextDocument,
} from '../services/document-processor/file-type-detector';

// Mock processor for testing
class MockHighPriorityProcessor implements DocumentProcessor {
  public readonly name = 'MockHighPriorityProcessor';
  public readonly description = 'Mock high priority processor';
  public readonly priority = ProcessorPriority.HIGH;

  private available = true;

  canProcess(fileType: SupportedFileType): boolean {
    return fileType === 'pdf' || fileType === 'docx';
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async process(
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    return {
      text: `Processed ${filePath} with MockHighPriorityProcessor`,
      confidence: 95,
      processorName: this.name,
      processingTime: 100,
    };
  }

  async processBuffer(
    buffer: Buffer,
    fileType: SupportedFileType,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    return {
      text: `Processed buffer (${fileType}) with MockHighPriorityProcessor`,
      confidence: 95,
      processorName: this.name,
      processingTime: 100,
    };
  }

  async cleanup(): Promise<void> {
    // No-op
  }
}

class MockFallbackProcessor implements DocumentProcessor {
  public readonly name = 'MockFallbackProcessor';
  public readonly description = 'Mock fallback processor';
  public readonly priority = ProcessorPriority.FALLBACK;

  canProcess(fileType: SupportedFileType): boolean {
    return fileType === 'pdf' || fileType === 'image';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async process(
    filePath: string,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    return {
      text: `Processed ${filePath} with MockFallbackProcessor`,
      confidence: 70,
      processorName: this.name,
      processingTime: 200,
    };
  }

  async processBuffer(
    buffer: Buffer,
    fileType: SupportedFileType,
    options?: ProcessingOptions
  ): Promise<ProcessingResult> {
    return {
      text: `Processed buffer (${fileType}) with MockFallbackProcessor`,
      confidence: 70,
      processorName: this.name,
      processingTime: 200,
    };
  }

  async cleanup(): Promise<void> {
    // No-op
  }
}

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let highPriorityProcessor: MockHighPriorityProcessor;
  let fallbackProcessor: MockFallbackProcessor;

  beforeEach(() => {
    service = new DocumentProcessorService();
    highPriorityProcessor = new MockHighPriorityProcessor();
    fallbackProcessor = new MockFallbackProcessor();
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('Processor Registration', () => {
    it('should register a processor', () => {
      service.registerProcessor(highPriorityProcessor);

      const registered = service.getRegisteredProcessors();
      expect(registered).toHaveLength(1);
      expect(registered[0].name).toBe('MockHighPriorityProcessor');
    });

    it('should register multiple processors', () => {
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      const registered = service.getRegisteredProcessors();
      expect(registered).toHaveLength(2);
    });

    it('should replace processor when registering with same name', () => {
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(highPriorityProcessor);

      const registered = service.getRegisteredProcessors();
      expect(registered).toHaveLength(1);
    });

    it('should unregister a processor', () => {
      service.registerProcessor(highPriorityProcessor);
      service.unregisterProcessor('MockHighPriorityProcessor');

      const registered = service.getRegisteredProcessors();
      expect(registered).toHaveLength(0);
    });

    it('should get processor by name', () => {
      service.registerProcessor(highPriorityProcessor);

      const processor = service.getProcessor('MockHighPriorityProcessor');
      expect(processor).toBeDefined();
      expect(processor?.name).toBe('MockHighPriorityProcessor');
    });
  });

  describe('Processor Selection', () => {
    it('should select high priority processor when available', async () => {
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      // Create a mock PDF buffer
      const buffer = Buffer.from('%PDF-1.4\ntest content');
      const result = await service.processDocumentBuffer(buffer, 'test.pdf');

      expect(result.processorName).toBe('MockHighPriorityProcessor');
      expect(result.confidence).toBe(95);
    });

    it('should fallback to lower priority when high priority unavailable', async () => {
      highPriorityProcessor.setAvailable(false);
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      const buffer = Buffer.from('%PDF-1.4\ntest content');
      const result = await service.processDocumentBuffer(buffer, 'test.pdf');

      expect(result.processorName).toBe('MockFallbackProcessor');
      expect(result.confidence).toBe(70);
    });

    it('should throw error when no processor available', async () => {
      // Don't register any processors
      const buffer = Buffer.from('%PDF-1.4\ntest content');

      await expect(
        service.processDocumentBuffer(buffer, 'test.pdf')
      ).rejects.toThrow(DocumentProcessingError);
    });

    it('should cache availability checks', async () => {
      const isAvailableSpy = vi.spyOn(highPriorityProcessor, 'isAvailable');
      service.registerProcessor(highPriorityProcessor);

      const buffer = Buffer.from('%PDF-1.4\ntest content');

      // First call
      await service.processDocumentBuffer(buffer, 'test.pdf');

      // Second call (should use cache)
      await service.processDocumentBuffer(buffer, 'test.pdf');

      // Should only check availability once (second time uses cache)
      expect(isAvailableSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Process with specific processor', () => {
    it('should process with specified processor', async () => {
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      const result = await service.processWithProcessor(
        'MockFallbackProcessor',
        '/path/to/test.pdf'
      );

      expect(result.processorName).toBe('MockFallbackProcessor');
    });

    it('should throw error when specified processor not found', async () => {
      await expect(
        service.processWithProcessor('NonExistentProcessor', '/path/to/test.pdf')
      ).rejects.toThrow(DocumentProcessingError);
    });
  });

  describe('Processor Status', () => {
    it('should return status for all processors', async () => {
      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      const status = await service.getProcessorStatus();

      expect(status.size).toBe(2);
      expect(status.get('MockHighPriorityProcessor')?.available).toBe(true);
      expect(status.get('MockFallbackProcessor')?.available).toBe(true);
    });

    it('should clear availability cache', async () => {
      service.registerProcessor(highPriorityProcessor);

      // Populate cache
      await service.getProcessorStatus();

      // Clear cache
      service.clearAvailabilityCache();

      // Next call should check availability again
      const isAvailableSpy = vi.spyOn(highPriorityProcessor, 'isAvailable');
      await service.getProcessorStatus();

      expect(isAvailableSpy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all processors', async () => {
      const cleanupSpy1 = vi.spyOn(highPriorityProcessor, 'cleanup');
      const cleanupSpy2 = vi.spyOn(fallbackProcessor, 'cleanup');

      service.registerProcessor(highPriorityProcessor);
      service.registerProcessor(fallbackProcessor);

      await service.cleanup();

      expect(cleanupSpy1).toHaveBeenCalled();
      expect(cleanupSpy2).toHaveBeenCalled();
      expect(service.getRegisteredProcessors()).toHaveLength(0);
    });
  });
});

describe('File Type Detection', () => {
  describe('detectFileTypeFromBuffer', () => {
    it('should detect PDF from magic bytes', () => {
      const buffer = Buffer.from('%PDF-1.4\ntest content');
      const result = detectFileTypeFromBuffer(buffer, 'test.pdf');

      expect(result.fileType).toBe('pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.confidence).toBeGreaterThan(90);
    });

    it('should detect PNG from magic bytes', () => {
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const result = detectFileTypeFromBuffer(buffer, 'test.png');

      expect(result.fileType).toBe('image');
      expect(result.mimeType).toBe('image/png');
    });

    it('should detect JPEG from magic bytes', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const result = detectFileTypeFromBuffer(buffer, 'test.jpg');

      expect(result.fileType).toBe('image');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should fallback to extension when magic bytes unknown', () => {
      const buffer = Buffer.from('plain text content');
      const result = detectFileTypeFromBuffer(buffer, 'test.txt');

      expect(result.fileType).toBe('txt');
      expect(result.mimeType).toBe('text/plain');
      expect(result.confidence).toBeLessThan(90);
    });

    it('should throw error when unable to determine type', () => {
      const buffer = Buffer.from('unknown content');

      expect(() => detectFileTypeFromBuffer(buffer)).toThrow(
        DocumentProcessingError
      );
    });
  });

  describe('File Type Helpers', () => {
    it('should identify image files', () => {
      expect(isImageFile('image')).toBe(true);
      expect(isImageFile('pdf')).toBe(false);
      expect(isImageFile('docx')).toBe(false);
    });

    it('should identify Office documents', () => {
      expect(isOfficeDocument('docx')).toBe(true);
      expect(isOfficeDocument('xlsx')).toBe(true);
      expect(isOfficeDocument('pptx')).toBe(true);
      expect(isOfficeDocument('pdf')).toBe(false);
      expect(isOfficeDocument('txt')).toBe(false);
    });

    it('should identify text documents', () => {
      expect(isTextDocument('txt')).toBe(true);
      expect(isTextDocument('md')).toBe(true);
      expect(isTextDocument('html')).toBe(true);
      expect(isTextDocument('csv')).toBe(true);
      expect(isTextDocument('pdf')).toBe(false);
      expect(isTextDocument('docx')).toBe(false);
    });
  });
});

describe('DocumentProcessingError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new DocumentProcessingError(
      'Test error',
      ProcessingErrorCode.PROCESSING_TIMEOUT,
      'TestProcessor',
      cause
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ProcessingErrorCode.PROCESSING_TIMEOUT);
    expect(error.processorName).toBe('TestProcessor');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('DocumentProcessingError');
  });

  it('should create error without optional properties', () => {
    const error = new DocumentProcessingError(
      'Test error',
      ProcessingErrorCode.UNKNOWN_ERROR
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ProcessingErrorCode.UNKNOWN_ERROR);
    expect(error.processorName).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});

describe('ProcessorPriority', () => {
  it('should have correct priority values', () => {
    expect(ProcessorPriority.FALLBACK).toBe(1);
    expect(ProcessorPriority.NORMAL).toBe(5);
    expect(ProcessorPriority.HIGH).toBe(10);
  });

  it('should order priorities correctly', () => {
    expect(ProcessorPriority.HIGH).toBeGreaterThan(ProcessorPriority.NORMAL);
    expect(ProcessorPriority.NORMAL).toBeGreaterThan(ProcessorPriority.FALLBACK);
  });
});
