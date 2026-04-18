/**
 * MarkItDown Processor
 *
 * High-priority processor using MarkItDown Python library via subprocess
 * for comprehensive document format support
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
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

/**
 * MarkItDownProcessor - High-priority processor using MarkItDown
 *
 * This processor uses the MarkItDown Python library to convert various
 * document formats to Markdown text. It supports a wide range of formats
 * including Office documents, PDFs, and more.
 *
 * Requires: Python 3.8+ with markitdown installed
 */
export class MarkItDownProcessor implements DocumentProcessor {
  public readonly name = 'MarkItDownProcessor';
  public readonly description =
    'High-priority processor using MarkItDown Python library for comprehensive document format support';
  public readonly priority = ProcessorPriority.HIGH;

  private pythonPath: string = 'python3';
  private isChecked = false;
  private isAvailableCache: boolean | null = null;

  /**
   * Supported file types (based on MarkItDown capabilities)
   */
  private readonly supportedTypes: Set<SupportedFileType> = new Set([
    'pdf',
    'docx',
    'doc',
    'xlsx',
    'xls',
    'pptx',
    'ppt',
    'html',
    'txt',
    'csv',
    'json',
    'xml',
    'image',
  ]);

  /**
   * Check if this processor can handle the given file type
   */
  canProcess(fileType: SupportedFileType): boolean {
    return this.supportedTypes.has(fileType);
  }

  /**
   * Check if MarkItDown is available
   *
   * Verifies that Python is installed and markitdown package is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.isChecked && this.isAvailableCache !== null) {
      return this.isAvailableCache;
    }

    try {
      // Try to import markitdown in Python
      const result = await this.executePython([
        '-c',
        'import markitdown; print("OK")',
      ]);

      this.isAvailableCache = result.trim() === 'OK';
      this.isChecked = true;

      return this.isAvailableCache;
    } catch (error) {
      console.log(
        '[MarkItDownProcessor] Not available - markitdown not installed'
      );
      this.isAvailableCache = false;
      this.isChecked = true;
      return false;
    }
  }

  /**
   * Process a document file
   */
  async process(
    filePath: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Check availability
      if (!(await this.isAvailable())) {
        throw new DocumentProcessingError(
          'MarkItDown processor is not available. Install with: pip install markitdown',
          ProcessingErrorCode.PROCESSOR_UNAVAILABLE,
          this.name
        );
      }

      // Verify file exists
      await fs.access(filePath);

      // Get file stats for metadata
      const stats = await fs.stat(filePath);

      // Create Python script to process the document
      const pythonScript = this.generateProcessingScript(filePath, options);

      // Execute the Python script
      const output = await this.executePython(['-c', pythonScript]);

      // Parse the JSON output
      const result = JSON.parse(output);

      const processingTime = Date.now() - startTime;

      return {
        text: result.text || '',
        confidence: 95, // MarkItDown is generally reliable
        processorName: this.name,
        processingTime,
        metadata: {
          fileSize: stats.size,
          title: result.metadata?.title,
          author: result.metadata?.author,
          pageCount: result.metadata?.page_count,
          ...result.metadata,
        },
      };
    } catch (error) {
      if (
        error instanceof DocumentProcessingError &&
        error.code === ProcessingErrorCode.PROCESSOR_UNAVAILABLE
      ) {
        throw error;
      }

      throw new DocumentProcessingError(
        `MarkItDown processing failed: ${error}`,
        ProcessingErrorCode.UNKNOWN_ERROR,
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
    // MarkItDown works with files, so we need to write to temp location
    const tmpDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'markitdown-'));
    const tmpFile = path.join(tmpDir, `document.${fileType}`);

    try {
      // Write buffer to temp file
      await fs.writeFile(tmpFile, buffer);

      // Process the temp file
      const result = await this.process(tmpFile, options);

      return result;
    } finally {
      // Clean up temp file
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error('[MarkItDownProcessor] Failed to clean up temp file:', error);
      }
    }
  }

  /**
   * Clean up resources (no persistent resources for this processor)
   */
  async cleanup(): Promise<void> {
    // No persistent resources to clean up
    this.isChecked = false;
    this.isAvailableCache = null;
  }

  /**
   * Generate Python script for processing a document
   */
  private generateProcessingScript(
    filePath: string,
    options: ProcessingOptions
  ): string {
    // Escape the file path for Python string
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `
import json
import sys
from markitdown import MarkItDown

try:
    # Initialize MarkItDown
    md = MarkItDown()

    # Process the document
    result = md.convert("${escapedPath}")

    # Extract metadata if available
    metadata = {}
    if hasattr(result, 'metadata') and result.metadata:
        metadata = {
            'title': result.metadata.get('title'),
            'author': result.metadata.get('author'),
            'page_count': result.metadata.get('page_count'),
        }

    # Output as JSON
    output = {
        'text': result.text_content if hasattr(result, 'text_content') else str(result),
        'metadata': metadata
    }

    print(json.dumps(output))

except Exception as e:
    error_output = {
        'error': str(e),
        'text': '',
        'metadata': {}
    }
    print(json.dumps(error_output))
    sys.exit(1)
`;
  }

  /**
   * Execute a Python command
   */
  private executePython(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, args);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(`Python process exited with code ${code}: ${stderr}`)
          );
        }
      });

      python.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Set custom Python path
   *
   * @param pythonPath - Path to Python executable
   */
  setPythonPath(pythonPath: string): void {
    this.pythonPath = pythonPath;
    this.isChecked = false;
    this.isAvailableCache = null;
  }
}
