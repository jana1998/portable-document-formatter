# CacheService Documentation

## Overview

The `CacheService` provides persistent caching for PDF processing results using IndexedDB through Dexie.js. It enables efficient caching of expensive operations like OCR, search results, and rendered page data.

## Features

- **Persistent Storage**: Uses IndexedDB for browser-based persistent storage
- **Cache Key Generation**: Deterministic keys based on file hash, processor type, and version
- **Automatic Expiration**: Time-based expiration with automatic cleanup
- **Size Management**: LRU-like eviction when cache size exceeds limits
- **Type-Safe**: Full TypeScript support with generics
- **Flexible Queries**: Search by file hash, processor type, or cache key
- **Statistics**: Monitor cache usage and performance

## Installation

The CacheService uses Dexie.js for IndexedDB access:

```bash
npm install dexie
```

For testing, install the IndexedDB polyfill:

```bash
npm install --save-dev fake-indexeddb
```

## Architecture

### Components

1. **cache-db.ts**: Dexie database schema and configuration
2. **cache-service.ts**: Main service class with caching logic
3. **hash-utils.ts**: Utilities for generating file hashes
4. **cache-integration-example.ts**: Integration examples with OCR, search, and rendering

### Database Schema

```typescript
interface CacheEntry {
  id?: number;
  cacheKey: string;
  data: any;
  createdAt: number;
  expiresAt: number;
  metadata: {
    fileHash: string;
    processor: string;
    version: string;
    fileSize?: number;
    pageCount?: number;
  };
}
```

## Basic Usage

### Importing

```typescript
import { cacheService, type CacheKeyMetadata } from '@/services/cache-service';
import { generateFileHash } from '@/services/hash-utils';
```

### Storing Data

```typescript
// Generate file hash
const fileHash = await generateFileHash(pdfBuffer);

// Define cache metadata
const metadata: CacheKeyMetadata = {
  fileHash,
  processor: 'ocr',
  version: '5.0.4',
  fileSize: pdfBuffer.byteLength,
  pageCount: 10,
};

// Cache the result (default TTL: 7 days)
await cacheService.set(metadata, ocrResult);

// Cache with custom TTL (30 days)
await cacheService.set(metadata, ocrResult, 30 * 24 * 60 * 60 * 1000);
```

### Retrieving Data

```typescript
// Get cached data
const cached = await cacheService.get<OCRResult>(metadata);

if (cached) {
  console.log('Cache hit!', cached);
} else {
  console.log('Cache miss, processing...');
  const result = await processOCR();
  await cacheService.set(metadata, result);
}
```

### Checking Cache Existence

```typescript
const exists = await cacheService.has(metadata);
if (exists) {
  console.log('Data is cached and not expired');
}
```

### Clearing Cache

```typescript
// Clear all cache
await cacheService.clear();

// Clear cache for specific file
await cacheService.clearByFileHash(fileHash);

// Clear cache for specific processor
await cacheService.clearByProcessor('ocr');

// Clear specific entry
const cacheKey = cacheService.generateCacheKey(metadata);
await cacheService.delete(cacheKey);
```

### Cache Statistics

```typescript
const stats = await cacheService.getStats();
console.log('Total entries:', stats.totalEntries);
console.log('Expired entries:', stats.expiredEntries);
console.log('Estimated size (bytes):', stats.estimatedSize);
```

### Manual Cleanup

```typescript
// Remove all expired entries
const removedCount = await cacheService.cleanupExpired();
console.log(`Cleaned up ${removedCount} expired entries`);
```

## Configuration

### Custom Configuration

```typescript
import { CacheService } from '@/services/cache-service';

const customCache = new CacheService({
  defaultTTL: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxCacheSize: 200 * 1024 * 1024,      // 200MB
  autoCleanup: true,                     // Enable automatic cleanup
});
```

### Default Values

- **defaultTTL**: 7 days (604,800,000 ms)
- **maxCacheSize**: 100MB (104,857,600 bytes)
- **autoCleanup**: true (runs every hour)

## Integration Examples

### OCR Caching

```typescript
import { cachedOCRService } from '@/services/cache-integration-example';

// Automatically uses cache
const result = await cachedOCRService.processWithCache(
  pdfBuffer,
  pageNumber,
  'eng'
);
```

### Search Caching

```typescript
import { cachedSearchService } from '@/services/cache-integration-example';

const results = await cachedSearchService.searchWithCache(
  pdfBuffer,
  'search query',
  false // case-insensitive
);
```

### Cache Invalidation

```typescript
import { cacheInvalidationHelper } from '@/services/cache-integration-example';

// When a PDF is modified, invalidate its cache
await cacheInvalidationHelper.invalidateFileCache(fileHash);

// After processor upgrade
await cacheInvalidationHelper.invalidateProcessorCache('ocr');

// Get cache info
const info = await cacheInvalidationHelper.getCacheInfo();
console.log('Cache size:', info.estimatedSizeMB, 'MB');

// Perform maintenance
const result = await cacheInvalidationHelper.performMaintenance();
console.log('Cleaned up', result.expiredCleaned, 'entries');
```

## Advanced Features

### File Hash Generation

```typescript
import {
  generateFileHash,
  generateStringHash,
  generateQuickHash,
  compareHashes
} from '@/services/hash-utils';

// SHA-256 hash from buffer
const hash = await generateFileHash(arrayBuffer);

// Hash from string (useful for testing)
const stringHash = await generateStringHash('content');

// Quick non-cryptographic hash for metadata
const quickHash = generateQuickHash('file.pdf', 1024000, Date.now());

// Compare hashes
if (compareHashes(hash1, hash2)) {
  console.log('Hashes match!');
}
```

### Cache Key Structure

Cache keys follow the format: `{fileHash}:{processor}:{version}`

Example: `a3f5b2c1d4e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0:ocr:5.0.4`

This ensures:
- Different files have different keys
- Same file processed with different processors are cached separately
- Cache is invalidated when processor version changes

### Expiration and Cleanup

The service automatically cleans up expired entries every hour (when `autoCleanup: true`). You can also manually trigger cleanup:

```typescript
// Manual cleanup
const count = await cacheService.cleanupExpired();

// Stop auto-cleanup
cacheService.stopAutoCleanup();

// Restart auto-cleanup
cacheService.destroy();
const newService = new CacheService({ autoCleanup: true });
```

### Size-Based Eviction

When cache size exceeds `maxCacheSize`, the service automatically evicts the oldest entries until the cache is reduced to 80% of the maximum size.

## Testing

The test suite includes comprehensive coverage:

```bash
npm test -- src/tests/unit/cache-service.test.ts
```

Test coverage includes:
- Cache key generation
- Set/get operations
- Expiration logic
- Cache invalidation
- Statistics
- Size enforcement
- Metadata storage

## Performance Considerations

### Best Practices

1. **Hash Generation**: Use `generateFileHash()` for accurate cache keys, but be aware it's async and can be slow for large files
2. **TTL Selection**: Choose appropriate TTLs based on data volatility
   - OCR results: 30 days (rarely change)
   - Search results: 7 days (may change with new processor versions)
   - Rendered pages: 1 day (may change frequently)
3. **Cache Size**: Monitor cache size and adjust `maxCacheSize` based on device constraints
4. **Cleanup**: Enable `autoCleanup` in production to prevent unbounded growth

### Optimization Tips

1. **Batch Operations**: When invalidating multiple entries, use `clearByFileHash()` or `clearByProcessor()` instead of individual deletes
2. **Lazy Loading**: Only load cached data when needed
3. **Versioning**: Update processor version when changing algorithms to invalidate old cache

## API Reference

### CacheService

#### Constructor

```typescript
constructor(config?: CacheConfig)
```

#### Methods

- `generateCacheKey(metadata: CacheKeyMetadata): string`
- `set<T>(metadata: CacheKeyMetadata, data: T, ttl?: number): Promise<void>`
- `get<T>(metadata: CacheKeyMetadata): Promise<T | null>`
- `has(metadata: CacheKeyMetadata): Promise<boolean>`
- `delete(cacheKey: string): Promise<void>`
- `clear(): Promise<void>`
- `clearByFileHash(fileHash: string): Promise<void>`
- `clearByProcessor(processor: string): Promise<void>`
- `cleanupExpired(): Promise<number>`
- `getStats(): Promise<CacheStats>`
- `stopAutoCleanup(): void`
- `destroy(): void`

### Types

```typescript
interface CacheConfig {
  defaultTTL?: number;
  maxCacheSize?: number;
  autoCleanup?: boolean;
}

interface CacheKeyMetadata {
  fileHash: string;
  processor: string;
  version: string;
  fileSize?: number;
  pageCount?: number;
}

interface CacheStats {
  totalEntries: number;
  expiredEntries: number;
  estimatedSize: number;
}
```

## Troubleshooting

### IndexedDB Not Available

The service requires IndexedDB support. For testing, use `fake-indexeddb`:

```typescript
// In test setup
import 'fake-indexeddb/auto';
```

### Cache Not Persisting

Ensure the browser allows IndexedDB. Check:
- Private browsing mode (may disable IndexedDB)
- Browser storage quotas
- Browser compatibility

### Performance Issues

If cache operations are slow:
- Check cache size (use `getStats()`)
- Run manual cleanup (`cleanupExpired()`)
- Reduce `maxCacheSize` or increase `defaultTTL`
- Consider clearing old entries by processor version

## Future Enhancements

Potential improvements:
- Compression for large cached data
- Encryption for sensitive data
- Web Worker support for hash generation
- Streaming support for large files
- Multi-tab synchronization
- Storage quota management
- Cache warming strategies

## Related Files

- `src/services/cache-db.ts` - Database schema
- `src/services/cache-service.ts` - Main service
- `src/services/hash-utils.ts` - Hash utilities
- `src/services/cache-integration-example.ts` - Integration examples
- `src/tests/unit/cache-service.test.ts` - Test suite

## License

Same as the main project (MIT).
