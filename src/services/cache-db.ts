import Dexie, { type EntityTable } from 'dexie';

/**
 * Represents a cached processing result in IndexedDB
 */
export interface CacheEntry {
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

/**
 * Dexie database instance for caching PDF processing results
 */
class CacheDatabase extends Dexie {
  cacheEntries!: EntityTable<CacheEntry, 'id'>;

  constructor() {
    super('PDFProcessorCache');

    this.version(1).stores({
      cacheEntries: '++id, cacheKey, expiresAt, createdAt, metadata.fileHash',
    });
  }
}

export const cacheDb = new CacheDatabase();
