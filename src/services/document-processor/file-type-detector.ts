/**
 * File Type Detector
 *
 * Detects document file types based on extension and magic bytes
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  SupportedFileType,
  FileTypeDetectionResult,
} from './types';
import { DocumentProcessingError, ProcessingErrorCode } from './types';

/**
 * Magic byte signatures for common file types
 */
const MAGIC_BYTES: Record<string, { signature: number[]; offset: number }> = {
  pdf: { signature: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  docx: {
    signature: [0x50, 0x4b, 0x03, 0x04],
    offset: 0,
  }, // ZIP signature (DOCX is ZIP)
  doc: { signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], offset: 0 }, // MS Office legacy
  png: { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  jpg: { signature: [0xff, 0xd8, 0xff], offset: 0 },
  gif: { signature: [0x47, 0x49, 0x46, 0x38], offset: 0 }, // GIF8
  bmp: { signature: [0x42, 0x4d], offset: 0 }, // BM
  tiff: { signature: [0x49, 0x49, 0x2a, 0x00], offset: 0 }, // II*\0 (little-endian)
};

/**
 * MIME type mappings
 */
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
};

/**
 * Image file extensions
 */
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'tiff',
  'tif',
]);

/**
 * Detect file type from file path
 *
 * @param filePath - Absolute path to the file
 * @returns File type detection result
 * @throws {DocumentProcessingError} if file cannot be read or type cannot be determined
 */
export async function detectFileType(
  filePath: string
): Promise<FileTypeDetectionResult> {
  try {
    // Check if file exists
    await fs.access(filePath);

    // Get file extension
    const extension = path.extname(filePath).toLowerCase().slice(1);

    // Read first 8 bytes for magic byte detection
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(8);
    await fileHandle.read(buffer, 0, 8, 0);
    await fileHandle.close();

    // Try magic byte detection first (more reliable)
    const magicResult = detectByMagicBytes(buffer, extension);
    if (magicResult) {
      return magicResult;
    }

    // Fall back to extension-based detection
    return detectByExtension(extension);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DocumentProcessingError(
        `File not found: ${filePath}`,
        ProcessingErrorCode.FILE_NOT_FOUND,
        'FileTypeDetector',
        error as Error
      );
    }
    throw new DocumentProcessingError(
      `Failed to detect file type: ${error}`,
      ProcessingErrorCode.UNKNOWN_ERROR,
      'FileTypeDetector',
      error as Error
    );
  }
}

/**
 * Detect file type from buffer
 *
 * @param buffer - File data buffer
 * @param fileName - Optional file name for extension hint
 * @returns File type detection result
 */
export function detectFileTypeFromBuffer(
  buffer: Buffer,
  fileName?: string
): FileTypeDetectionResult {
  // Try magic byte detection
  const extension = fileName
    ? path.extname(fileName).toLowerCase().slice(1)
    : '';
  const magicResult = detectByMagicBytes(buffer, extension);

  if (magicResult) {
    return magicResult;
  }

  // Fall back to extension if provided
  if (extension) {
    return detectByExtension(extension);
  }

  // Unable to determine
  throw new DocumentProcessingError(
    'Unable to determine file type from buffer',
    ProcessingErrorCode.UNSUPPORTED_FILE_TYPE,
    'FileTypeDetector'
  );
}

/**
 * Detect file type using magic bytes
 */
function detectByMagicBytes(
  buffer: Buffer,
  extensionHint: string
): FileTypeDetectionResult | null {
  for (const [type, { signature, offset }] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length < offset + signature.length) {
      continue;
    }

    let matches = true;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[offset + i] !== signature[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      // Special handling for ZIP-based formats (DOCX, XLSX, PPTX)
      if (type === 'docx' && extensionHint) {
        if (extensionHint === 'xlsx' || extensionHint === 'xls') {
          return createResult('xlsx', 'xlsx', 90);
        } else if (extensionHint === 'pptx' || extensionHint === 'ppt') {
          return createResult('pptx', 'pptx', 90);
        }
      }

      const fileType = normalizeFileType(type);
      return createResult(fileType, type, 95);
    }
  }

  return null;
}

/**
 * Detect file type using file extension
 */
function detectByExtension(extension: string): FileTypeDetectionResult {
  const normalized = extension.toLowerCase();

  // Check if it's a supported type
  if (MIME_TYPES[normalized]) {
    const fileType = normalizeFileType(normalized);
    return createResult(fileType, normalized, 70);
  }

  // Check if it's an image with alternate extension
  if (normalized === 'tif') {
    return createResult('image', 'tiff', 70);
  }

  throw new DocumentProcessingError(
    `Unsupported file type: ${extension}`,
    ProcessingErrorCode.UNSUPPORTED_FILE_TYPE,
    'FileTypeDetector'
  );
}

/**
 * Normalize file type to SupportedFileType
 */
function normalizeFileType(type: string): SupportedFileType {
  if (IMAGE_EXTENSIONS.has(type)) {
    return 'image';
  }
  return type as SupportedFileType;
}

/**
 * Create file type detection result
 */
function createResult(
  fileType: SupportedFileType,
  extension: string,
  confidence: number
): FileTypeDetectionResult {
  return {
    fileType,
    mimeType: MIME_TYPES[extension] || 'application/octet-stream',
    extension,
    confidence,
  };
}

/**
 * Check if a file type is an image
 */
export function isImageFile(fileType: SupportedFileType): boolean {
  return fileType === 'image';
}

/**
 * Check if a file type is a Microsoft Office document
 */
export function isOfficeDocument(fileType: SupportedFileType): boolean {
  return ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(fileType);
}

/**
 * Check if a file type is text-based
 */
export function isTextDocument(fileType: SupportedFileType): boolean {
  return ['txt', 'md', 'html', 'csv', 'json', 'xml'].includes(fileType);
}
