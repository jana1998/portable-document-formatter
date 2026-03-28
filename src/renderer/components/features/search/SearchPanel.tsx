import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Search, SearchX } from 'lucide-react';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/ui/empty-state';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { PDFRenderer } from '@/services/pdf-renderer';
import { cn } from '@renderer/lib/utils';

export function SearchPanel() {
  const {
    currentDocument,
    searchQuery,
    searchResults,
    currentSearchResultIndex,
    setSearchQuery,
    setSearchResults,
    setCurrentSearchResultIndex,
    setCurrentPage,
  } = usePDFStore();
  const [query, setQuery] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !currentDocument) return;

    setIsSearching(true);
    setSearchQuery(query);

    try {
      const renderer = new PDFRenderer();
      const data = await window.electronAPI.readFile(currentDocument.path);
      const arrayBuffer =
        data instanceof ArrayBuffer
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

    const previousIndex =
      currentSearchResultIndex === 0
        ? searchResults.length - 1
        : currentSearchResultIndex - 1;

    setCurrentSearchResultIndex(previousIndex);
    setCurrentPage(searchResults[previousIndex].pageNumber);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="panel-muted p-4">
        <div className="flex items-center gap-3 rounded-[1.1rem] border border-input bg-background/80 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search text in the current PDF"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleSearch();
              }
            }}
            disabled={!currentDocument || isSearching}
          />
          <Button
            size="icon"
            onClick={() => void handleSearch()}
            disabled={!currentDocument || isSearching}
            aria-label="Search document"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {searchResults.length > 0
              ? `${currentSearchResultIndex + 1} of ${searchResults.length} matches`
              : query
                ? 'Run search to scan the active PDF'
                : 'Search is scoped to the current document'}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="toolbar"
              size="icon"
              className="h-9 w-9"
              onClick={handlePreviousResult}
              disabled={searchResults.length === 0}
              aria-label="Previous result"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="toolbar"
              size="icon"
              className="h-9 w-9"
              onClick={handleNextResult}
              disabled={searchResults.length === 0}
              aria-label="Next result"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isSearching ? (
        <div className="panel-muted flex min-h-[240px] flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Searching document text…</span>
          </div>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {searchResults.map((result, index) => (
            <button
              key={`${result.pageNumber}-${result.matchIndex}-${index}`}
              type="button"
              className={cn(
                'panel-muted block w-full p-4 text-left',
                index === currentSearchResultIndex &&
                  'border-primary/60 bg-primary/5 shadow-[0_14px_32px_rgba(13,148,136,0.12)]'
              )}
              onClick={() => {
                setCurrentSearchResultIndex(index);
                setCurrentPage(result.pageNumber);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Page {result.pageNumber}
                </div>
                {index === currentSearchResultIndex ? (
                  <div className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Current
                  </div>
                ) : null}
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground">{result.text}</p>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchX}
          title={query ? 'No matches found' : 'Search the current document'}
          description={
            query
              ? 'Try a broader phrase, different casing, or search after OCR if the PDF contains scanned pages.'
              : 'Results will appear here with direct page navigation once you search the active PDF.'
          }
          className="min-h-[280px] flex-1"
          tone={query ? 'warm' : 'default'}
        />
      )}
    </div>
  );
}
