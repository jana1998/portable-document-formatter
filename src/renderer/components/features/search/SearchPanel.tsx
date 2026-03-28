import React, { useState } from 'react';
import { Button } from '@components/ui/button';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { PDFRenderer } from '@/services/pdf-renderer';
import { cn } from '@renderer/lib/utils';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const {
    currentDocument,
    searchResults,
    currentSearchResultIndex,
    setSearchQuery,
    setSearchResults,
    setCurrentSearchResultIndex,
    setCurrentPage,
  } = usePDFStore();

  const handleSearch = async () => {
    if (!query.trim() || !currentDocument) return;

    setIsSearching(true);
    setSearchQuery(query);

    try {
      const renderer = new PDFRenderer();
      const data = await window.electronAPI.readFile(currentDocument.path);

      // Convert Buffer to ArrayBuffer if needed
      const arrayBuffer = data instanceof ArrayBuffer
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      await renderer.loadDocument(arrayBuffer);

      const results = await renderer.searchText(query);
      setSearchResults(results);
      setCurrentSearchResultIndex(0);

      if (results.length > 0) {
        setCurrentPage(results[0].pageNumber);
      }

      await renderer.destroy();
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextResult = () => {
    if (searchResults.length === 0) return;

    const nextIndex = (currentSearchResultIndex + 1) % searchResults.length;
    setCurrentSearchResultIndex(nextIndex);
    setCurrentPage(searchResults[nextIndex].pageNumber);
  };

  const handlePreviousResult = () => {
    if (searchResults.length === 0) return;

    const prevIndex =
      currentSearchResultIndex === 0
        ? searchResults.length - 1
        : currentSearchResultIndex - 1;
    setCurrentSearchResultIndex(prevIndex);
    setCurrentPage(searchResults[prevIndex].pageNumber);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search in PDF..."
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            disabled={!currentDocument || isSearching}
          />
          <Button
            size="icon"
            onClick={handleSearch}
            disabled={!currentDocument || isSearching}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {currentSearchResultIndex + 1} of {searchResults.length} results
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousResult}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextResult}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {isSearching && (
        <div className="text-sm text-muted-foreground text-center">Searching...</div>
      )}

      {!isSearching && searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((result, index) => (
            <div
              key={index}
              className={cn(
                'p-2 border rounded-md cursor-pointer hover:bg-accent transition-colors',
                index === currentSearchResultIndex && 'bg-accent'
              )}
              onClick={() => {
                setCurrentSearchResultIndex(index);
                setCurrentPage(result.pageNumber);
              }}
            >
              <div className="text-xs text-muted-foreground mb-1">
                Page {result.pageNumber}
              </div>
              <div className="text-sm line-clamp-2">{result.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
