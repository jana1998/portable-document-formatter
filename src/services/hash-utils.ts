/**
 * Utility functions for generating file hashes for cache keys
 */

/**
 * Generate a hash from a file buffer using Web Crypto API
 */
export async function generateFileHash(
  buffer: ArrayBuffer
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

/**
 * Generate a hash from a string (useful for testing or text content)
 */
export async function generateStringHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(content);
  return generateFileHash(buffer);
}

/**
 * Generate a quick hash from file metadata (non-cryptographic, for quick checks)
 * Uses file size, name, and modification time
 */
export function generateQuickHash(
  fileName: string,
  fileSize: number,
  lastModified?: number
): string {
  const data = `${fileName}:${fileSize}:${lastModified ?? 0}`;
  // Simple hash function for quick checks
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Compare two hash strings for equality
 */
export function compareHashes(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase();
}
