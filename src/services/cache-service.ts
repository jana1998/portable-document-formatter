import { cacheDb, type CacheEntry } from './cache-db';

/**
 * Configuration options for cache service
 */
export interface CacheConfig {
  /**
   * Default time-to-live in milliseconds (default: 7 days)
   */
  defaultTTL?: number;
  /**
   * Maximum cache size in bytes (default: 100MB)
   */
  maxCacheSize?: number;
  /**
   * Enable automatic cleanup of expired entries (default: true)
   */
  autoCleanup?: boolean;
}

/**
 * Metadata for cache key generation
 */
export interface CacheKeyMetadata {
  fileHash: string;
  processor: string;
  version: string;
  fileSize?: number;
  pageCount?: number;
}

/**
 * Service for caching PDF processing results using IndexedDB via Dexie.js
 *
 * Features:
 * - Persistent storage using IndexedDB
 * - Cache key generation based on file hash, processor type, and version
 * - Automatic expiration and cleanup
 * - Size-based eviction (LRU-like behavior)
 * - Efficient queries and updates
 */
export class CacheService {
  private config: Required<CacheConfig>;
  private cleanupInterval?: number;

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxCacheSize: config.maxCacheSize ?? 100 * 1024 * 1024, // 100MB
      autoCleanup: config.autoCleanup ?? true,
    };

    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Generate a deterministic cache key from metadata
   */
  generateCacheKey(metadata: CacheKeyMetadata): string {
    const { fileHash, processor, version } = metadata;
    return `${fileHash}:${processor}:${version}`;
  }

  /**
   * Store data in the cache
   */
  async set<T>(
    metadata: CacheKeyMetadata,
    data: T,
    ttl?: number
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(metadata);
    const now = Date.now();
    const expiresAt = now + (ttl ?? this.config.defaultTTL);

    const entry: CacheEntry = {
      cacheKey,
      data,
      createdAt: now,
      expiresAt,
      metadata,
    };

    // Check if entry exists and update or add new
    const existing = await cacheDb.cacheEntries
      .where('cacheKey')
      .equals(cacheKey)
      .first();

    if (existing) {
      await cacheDb.cacheEntries.update(existing.id!, entry);
    } else {
      await cacheDb.cacheEntries.add(entry);
    }

    // Check cache size and evict if necessary
    await this.enforceCacheSize();
  }

  /**
   * Retrieve data from the cache
   * Returns null if not found or expired
   */
  async get<T>(metadata: CacheKeyMetadata): Promise<T | null> {
    const cacheKey = this.generateCacheKey(metadata);
    const entry = await cacheDb.cacheEntries
      .where('cacheKey')
      .equals(cacheKey)
      .first();

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      await this.delete(cacheKey);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Check if a cache entry exists and is not expired
   */
  async has(metadata: CacheKeyMetadata): Promise<boolean> {
    const cacheKey = this.generateCacheKey(metadata);
    const entry = await cacheDb.cacheEntries
      .where('cacheKey')
      .equals(cacheKey)
      .first();

    if (!entry) {
      return false;
    }

    if (entry.expiresAt < Date.now()) {
      await this.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific cache entry
   */
  async delete(cacheKey: string): Promise<void> {
    await cacheDb.cacheEntries.where('cacheKey').equals(cacheKey).delete();
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await cacheDb.cacheEntries.clear();
  }

  /**
   * Clear cache entries for a specific file hash
   */
  async clearByFileHash(fileHash: string): Promise<void> {
    await cacheDb.cacheEntries
      .where('metadata.fileHash')
      .equals(fileHash)
      .delete();
  }

  /**
   * Clear cache entries for a specific processor
   */
  async clearByProcessor(processor: string): Promise<void> {
    const entries = await cacheDb.cacheEntries.toArray();
    const toDelete = entries
      .filter((entry) => entry.metadata.processor === processor)
      .map((entry) => entry.id!);

    await cacheDb.cacheEntries.bulkDelete(toDelete);
  }

  /**
   * Remove all expired entries
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const count = await cacheDb.cacheEntries
      .where('expiresAt')
      .below(now)
      .delete();

    return count;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    estimatedSize: number;
  }> {
    const entries = await cacheDb.cacheEntries.toArray();
    const now = Date.now();
    const expiredEntries = entries.filter((e) => e.expiresAt < now).length;

    // Estimate size (rough approximation)
    const estimatedSize = entries.reduce((total, entry) => {
      const dataSize = JSON.stringify(entry.data).length;
      return total + dataSize;
    }, 0);

    return {
      totalEntries: entries.length,
      expiredEntries,
      estimatedSize,
    };
  }

  /**
   * Enforce maximum cache size by evicting oldest entries
   */
  private async enforceCacheSize(): Promise<void> {
    const stats = await this.getStats();

    if (stats.estimatedSize > this.config.maxCacheSize) {
      // Get all entries sorted by creation time (oldest first)
      const entries = await cacheDb.cacheEntries
        .orderBy('createdAt')
        .toArray();

      let currentSize = stats.estimatedSize;
      const toDelete: number[] = [];

      for (const entry of entries) {
        if (currentSize <= this.config.maxCacheSize * 0.8) {
          // Stop when we reach 80% of max size
          break;
        }

        const dataSize = JSON.stringify(entry.data).length;
        currentSize -= dataSize;
        toDelete.push(entry.id!);
      }

      if (toDelete.length > 0) {
        await cacheDb.cacheEntries.bulkDelete(toDelete);
      }
    }
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startAutoCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupExpired().catch((error) => {
        console.error('Cache cleanup error:', error);
      });
    }, 60 * 60 * 1000);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    this.stopAutoCleanup();
  }
}

/**
 * Singleton instance of the cache service
 */
export const cacheService = new CacheService();
