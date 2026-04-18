/**
 * Integration examples for using CacheService with PDF processing operations
 *
 * This file demonstrates how to integrate the CacheService with various
 * PDF processing operations like OCR, search, and annotation processing.
 */

import { cacheService, type CacheKeyMetadata } from './cache-service';
import { generateFileHash } from './hash-utils';
import type { OCRResult, SearchResult } from '@renderer/types';

/**
 * Example: Caching OCR results
 */
export class CachedOCRService {
  private readonly PROCESSOR_NAME = 'tesseract-ocr';
  private readonly VERSION = '5.0.4';

  async processWithCache(
    pdfBuffer: ArrayBuffer,
    pageNumber: number,
    language: string = 'eng'
  ): Promise<OCRResult> {
    // Generate file hash for cache key
    const fileHash = await generateFileHash(pdfBuffer);

    const metadata: CacheKeyMetadata = {
      fileHash: `${fileHash}-page${pageNumber}-${language}`,
      processor: this.PROCESSOR_NAME,
      version: this.VERSION,
      fileSize: pdfBuffer.byteLength,
    };

    // Check cache first
    const cached = await cacheService.get<OCRResult>(metadata);
    if (cached) {
      console.log('OCR cache hit for page', pageNumber);
      return cached;
    }

    console.log('OCR cache miss, processing page', pageNumber);

    // Perform actual OCR processing
    const result = await this.performOCR(pdfBuffer, pageNumber, language);

    // Cache the result (TTL: 30 days)
    await cacheService.set(metadata, result, 30 * 24 * 60 * 60 * 1000);

    return result;
  }

  private async performOCR(
    pdfBuffer: ArrayBuffer,
    pageNumber: number,
    language: string
  ): Promise<OCRResult> {
    // Placeholder for actual OCR implementation
    // In real implementation, this would use tesseract.js
    return {
      pageNumber,
      text: '',
      confidence: 0,
      words: [],
    };
  }

  async invalidateCache(fileHash: string): Promise<void> {
    await cacheService.clearByFileHash(fileHash);
  }
}

/**
 * Example: Caching search results
 */
export class CachedSearchService {
  private readonly PROCESSOR_NAME = 'pdf-search';
  private readonly VERSION = '1.0.0';

  async searchWithCache(
    pdfBuffer: ArrayBuffer,
    query: string,
    caseSensitive: boolean = false
  ): Promise<SearchResult[]> {
    const fileHash = await generateFileHash(pdfBuffer);

    const metadata: CacheKeyMetadata = {
      fileHash: `${fileHash}-search-${query}-${caseSensitive}`,
      processor: this.PROCESSOR_NAME,
      version: this.VERSION,
      fileSize: pdfBuffer.byteLength,
    };

    // Check cache
    const cached = await cacheService.get<SearchResult[]>(metadata);
    if (cached) {
      console.log('Search cache hit for query:', query);
      return cached;
    }

    console.log('Search cache miss, processing query:', query);

    // Perform actual search
    const results = await this.performSearch(pdfBuffer, query, caseSensitive);

    // Cache results (TTL: 7 days)
    await cacheService.set(metadata, results, 7 * 24 * 60 * 60 * 1000);

    return results;
  }

  private async performSearch(
    pdfBuffer: ArrayBuffer,
    query: string,
    caseSensitive: boolean
  ): Promise<SearchResult[]> {
    // Placeholder for actual search implementation
    return [];
  }
}

/**
 * Example: Caching rendered page data
 */
export class CachedRenderService {
  private readonly PROCESSOR_NAME = 'pdf-renderer';
  private readonly VERSION = '3.11.174'; // pdfjs version

  async getPageDataWithCache(
    pdfBuffer: ArrayBuffer,
    pageNumber: number,
    scale: number = 1.0
  ): Promise<ImageData> {
    const fileHash = await generateFileHash(pdfBuffer);

    const metadata: CacheKeyMetadata = {
      fileHash: `${fileHash}-page${pageNumber}-scale${scale}`,
      processor: this.PROCESSOR_NAME,
      version: this.VERSION,
      fileSize: pdfBuffer.byteLength,
    };

    const cached = await cacheService.get<ImageData>(metadata);
    if (cached) {
      console.log('Render cache hit for page', pageNumber);
      return cached;
    }

    console.log('Render cache miss, rendering page', pageNumber);

    const imageData = await this.renderPage(pdfBuffer, pageNumber, scale);

    // Cache rendered page (TTL: 1 day)
    await cacheService.set(metadata, imageData, 24 * 60 * 60 * 1000);

    return imageData;
  }

  private async renderPage(
    pdfBuffer: ArrayBuffer,
    pageNumber: number,
    scale: number
  ): Promise<ImageData> {
    // Placeholder for actual rendering implementation
    throw new Error('Not implemented');
  }
}

/**
 * Example: Batch cache invalidation when a PDF is modified
 */
export class CacheInvalidationHelper {
  /**
   * Invalidate all cached data for a specific PDF file
   */
  async invalidateFileCache(fileHash: string): Promise<void> {
    await cacheService.clearByFileHash(fileHash);
    console.log(`Cleared all cache entries for file: ${fileHash}`);
  }

  /**
   * Invalidate cache for a specific processor (e.g., after processor upgrade)
   */
  async invalidateProcessorCache(processor: string): Promise<void> {
    await cacheService.clearByProcessor(processor);
    console.log(`Cleared all cache entries for processor: ${processor}`);
  }

  /**
   * Get cache statistics
   */
  async getCacheInfo(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    estimatedSizeMB: number;
  }> {
    const stats = await cacheService.getStats();
    return {
      ...stats,
      estimatedSizeMB: stats.estimatedSize / (1024 * 1024),
    };
  }

  /**
   * Perform manual cache cleanup
   */
  async performMaintenance(): Promise<{
    expiredCleaned: number;
    stats: Awaited<ReturnType<typeof cacheService.getStats>>;
  }> {
    const expiredCleaned = await cacheService.cleanupExpired();
    const stats = await cacheService.getStats();

    return {
      expiredCleaned,
      stats,
    };
  }
}

// Singleton instances
export const cachedOCRService = new CachedOCRService();
export const cachedSearchService = new CachedSearchService();
export const cachedRenderService = new CachedRenderService();
export const cacheInvalidationHelper = new CacheInvalidationHelper();
