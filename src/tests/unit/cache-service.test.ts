import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService, type CacheKeyMetadata } from '@/services/cache-service';
import { cacheDb } from '@/services/cache-db';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(async () => {
    // Create a fresh instance for each test
    cacheService = new CacheService({
      defaultTTL: 1000, // 1 second for testing
      maxCacheSize: 1024 * 1024, // 1MB
      autoCleanup: false, // Disable auto-cleanup for predictable tests
    });

    // Clear the database before each test
    await cacheDb.cacheEntries.clear();
  });

  afterEach(() => {
    cacheService.destroy();
  });

  describe('generateCacheKey', () => {
    it('should generate a deterministic cache key', () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'abc123',
        processor: 'ocr',
        version: '1.0.0',
      };

      const key1 = cacheService.generateCacheKey(metadata);
      const key2 = cacheService.generateCacheKey(metadata);

      expect(key1).toBe(key2);
      expect(key1).toBe('abc123:ocr:1.0.0');
    });

    it('should generate different keys for different metadata', () => {
      const metadata1: CacheKeyMetadata = {
        fileHash: 'abc123',
        processor: 'ocr',
        version: '1.0.0',
      };

      const metadata2: CacheKeyMetadata = {
        fileHash: 'abc123',
        processor: 'ocr',
        version: '2.0.0',
      };

      const key1 = cacheService.generateCacheKey(metadata1);
      const key2 = cacheService.generateCacheKey(metadata2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'test-hash',
        processor: 'ocr',
        version: '1.0.0',
      };

      const testData = { text: 'Sample OCR result', confidence: 0.95 };

      await cacheService.set(metadata, testData);
      const retrieved = await cacheService.get<typeof testData>(metadata);

      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'non-existent',
        processor: 'ocr',
        version: '1.0.0',
      };

      const result = await cacheService.get(metadata);
      expect(result).toBeNull();
    });

    it('should update existing entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'test-hash',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'first' });
      await cacheService.set(metadata, { value: 'second' });

      const result = await cacheService.get(metadata);
      expect(result).toEqual({ value: 'second' });

      // Verify only one entry exists
      const allEntries = await cacheDb.cacheEntries.toArray();
      expect(allEntries.length).toBe(1);
    });

    it('should handle complex data types', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'complex-hash',
        processor: 'annotation',
        version: '1.0.0',
      };

      const complexData = {
        annotations: [
          { id: '1', type: 'highlight', text: 'Important' },
          { id: '2', type: 'note', text: 'Remember this' },
        ],
        metadata: {
          pageCount: 10,
          created: new Date('2024-01-01'),
        },
      };

      await cacheService.set(metadata, complexData);
      const retrieved = await cacheService.get(metadata);

      expect(retrieved).toEqual(complexData);
    });
  });

  describe('expiration', () => {
    it('should return null for expired entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'expire-test',
        processor: 'ocr',
        version: '1.0.0',
      };

      // Set with 10ms TTL
      await cacheService.set(metadata, { value: 'test' }, 10);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await cacheService.get(metadata);
      expect(result).toBeNull();
    });

    it('should delete expired entries when accessed', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'expire-delete',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'test' }, 10);
      await new Promise((resolve) => setTimeout(resolve, 50));

      await cacheService.get(metadata);

      const allEntries = await cacheDb.cacheEntries.toArray();
      expect(allEntries.length).toBe(0);
    });

    it('should use custom TTL when provided', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'custom-ttl',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'test' }, 5000); // 5 seconds

      const entry = await cacheDb.cacheEntries
        .where('cacheKey')
        .equals(cacheService.generateCacheKey(metadata))
        .first();

      expect(entry).toBeDefined();
      expect(entry!.expiresAt - entry!.createdAt).toBeGreaterThanOrEqual(4900);
      expect(entry!.expiresAt - entry!.createdAt).toBeLessThanOrEqual(5100);
    });
  });

  describe('has', () => {
    it('should return true for existing valid entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'has-test',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'test' });
      const exists = await cacheService.has(metadata);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'not-there',
        processor: 'ocr',
        version: '1.0.0',
      };

      const exists = await cacheService.has(metadata);
      expect(exists).toBe(false);
    });

    it('should return false for expired entries', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'expired-has',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'test' }, 10);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const exists = await cacheService.has(metadata);
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a specific cache entry', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'delete-test',
        processor: 'ocr',
        version: '1.0.0',
      };

      await cacheService.set(metadata, { value: 'test' });
      const cacheKey = cacheService.generateCacheKey(metadata);

      await cacheService.delete(cacheKey);

      const result = await cacheService.get(metadata);
      expect(result).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      const metadata1: CacheKeyMetadata = {
        fileHash: 'hash1',
        processor: 'ocr',
        version: '1.0.0',
      };

      const metadata2: CacheKeyMetadata = {
        fileHash: 'hash2',
        processor: 'search',
        version: '1.0.0',
      };

      await cacheService.set(metadata1, { value: 'test1' });
      await cacheService.set(metadata2, { value: 'test2' });

      await cacheService.clear();

      const allEntries = await cacheDb.cacheEntries.toArray();
      expect(allEntries.length).toBe(0);
    });
  });

  describe('clearByFileHash', () => {
    it('should clear all entries for a specific file hash', async () => {
      const targetHash = 'target-hash';

      await cacheService.set(
        { fileHash: targetHash, processor: 'ocr', version: '1.0.0' },
        { value: 'ocr' }
      );

      await cacheService.set(
        { fileHash: targetHash, processor: 'search', version: '1.0.0' },
        { value: 'search' }
      );

      await cacheService.set(
        { fileHash: 'other-hash', processor: 'ocr', version: '1.0.0' },
        { value: 'other' }
      );

      await cacheService.clearByFileHash(targetHash);

      const remaining = await cacheDb.cacheEntries.toArray();
      expect(remaining.length).toBe(1);
      expect(remaining[0].metadata.fileHash).toBe('other-hash');
    });
  });

  describe('clearByProcessor', () => {
    it('should clear all entries for a specific processor', async () => {
      await cacheService.set(
        { fileHash: 'hash1', processor: 'ocr', version: '1.0.0' },
        { value: 'ocr1' }
      );

      await cacheService.set(
        { fileHash: 'hash2', processor: 'ocr', version: '2.0.0' },
        { value: 'ocr2' }
      );

      await cacheService.set(
        { fileHash: 'hash3', processor: 'search', version: '1.0.0' },
        { value: 'search' }
      );

      await cacheService.clearByProcessor('ocr');

      const remaining = await cacheDb.cacheEntries.toArray();
      expect(remaining.length).toBe(1);
      expect(remaining[0].metadata.processor).toBe('search');
    });
  });

  describe('cleanupExpired', () => {
    it('should remove all expired entries', async () => {
      // Add expired entry
      await cacheService.set(
        { fileHash: 'expired', processor: 'ocr', version: '1.0.0' },
        { value: 'old' },
        10
      );

      // Add valid entry
      await cacheService.set(
        { fileHash: 'valid', processor: 'ocr', version: '1.0.0' },
        { value: 'new' },
        10000
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const count = await cacheService.cleanupExpired();
      expect(count).toBe(1);

      const remaining = await cacheDb.cacheEntries.toArray();
      expect(remaining.length).toBe(1);
      expect(remaining[0].metadata.fileHash).toBe('valid');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      await cacheService.set(
        { fileHash: 'hash1', processor: 'ocr', version: '1.0.0' },
        { value: 'test1' }
      );

      await cacheService.set(
        { fileHash: 'hash2', processor: 'ocr', version: '1.0.0' },
        { value: 'test2' }
      );

      const stats = await cacheService.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.estimatedSize).toBeGreaterThan(0);
    });

    it('should count expired entries correctly', async () => {
      await cacheService.set(
        { fileHash: 'expired', processor: 'ocr', version: '1.0.0' },
        { value: 'old' },
        10
      );

      await cacheService.set(
        { fileHash: 'valid', processor: 'ocr', version: '1.0.0' },
        { value: 'new' }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = await cacheService.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.expiredEntries).toBe(1);
    });
  });

  describe('cache size enforcement', () => {
    it('should evict oldest entries when cache is full', async () => {
      const smallCache = new CacheService({
        defaultTTL: 10000,
        maxCacheSize: 500, // Very small cache
        autoCleanup: false,
      });

      try {
        // Add multiple entries
        for (let i = 0; i < 10; i++) {
          await smallCache.set(
            { fileHash: `hash${i}`, processor: 'ocr', version: '1.0.0' },
            { value: `data${i}`.repeat(20) } // Make data larger
          );

          // Small delay to ensure different createdAt timestamps
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        const stats = await smallCache.getStats();

        // Should have evicted some entries
        expect(stats.totalEntries).toBeLessThan(10);
        expect(stats.estimatedSize).toBeLessThanOrEqual(500);
      } finally {
        smallCache.destroy();
        await cacheDb.cacheEntries.clear();
      }
    });
  });

  describe('metadata storage', () => {
    it('should store and preserve metadata', async () => {
      const metadata: CacheKeyMetadata = {
        fileHash: 'meta-test',
        processor: 'ocr',
        version: '1.0.0',
        fileSize: 1024000,
        pageCount: 50,
      };

      await cacheService.set(metadata, { value: 'test' });

      const entry = await cacheDb.cacheEntries
        .where('cacheKey')
        .equals(cacheService.generateCacheKey(metadata))
        .first();

      expect(entry).toBeDefined();
      expect(entry!.metadata).toEqual(metadata);
    });
  });
});
