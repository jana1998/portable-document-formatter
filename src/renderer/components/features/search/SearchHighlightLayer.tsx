import React from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';

interface SearchHighlightLayerProps {
  pageNumber: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}

export function SearchHighlightLayer({
  pageNumber,
  canvasWidth,
  canvasHeight,
  scale,
}: SearchHighlightLayerProps) {
  const { searchResults, currentSearchResultIndex } = usePDFStore();

  // Get search results for this page
  const pageResults = searchResults.filter((r) => r.pageNumber === pageNumber);

  if (pageResults.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
      }}
    >
      {pageResults.map((result, index) => {
        const globalIndex = searchResults.findIndex(
          (r) => r.pageNumber === result.pageNumber && r.text === result.text
        );
        const isCurrentResult = globalIndex === currentSearchResultIndex;

        // If the result has position data, use it
        if (result.position) {
          return (
            <div
              key={index}
              className="absolute transition-colors"
              style={{
                left: `${result.position.x * scale}px`,
                top: `${result.position.y * scale}px`,
                width: `${result.position.width * scale}px`,
                height: `${result.position.height * scale}px`,
                backgroundColor: isCurrentResult
                  ? 'rgba(255, 165, 0, 0.4)' // Orange for current result
                  : 'rgba(255, 255, 0, 0.3)', // Yellow for other results
                border: isCurrentResult ? '2px solid orange' : 'none',
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
