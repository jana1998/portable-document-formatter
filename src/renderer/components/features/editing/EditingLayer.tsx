import React from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';

interface EditingLayerProps {
  pageNumber: number;
  scale: number;
}

export function EditingLayer({ pageNumber, scale }: EditingLayerProps) {
  const { textElements, imageElements } = usePDFStore();

  const pageTextElements = textElements.get(pageNumber) || [];
  const pageImageElements = imageElements.get(pageNumber) || [];

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      {/* Render text elements */}
      {pageTextElements.map((element) => (
        <div
          key={element.id}
          className="absolute pointer-events-auto"
          style={{
            left: `${element.x * scale}px`,
            top: `${element.y * scale}px`,
            fontSize: `${element.fontSize * scale}px`,
            fontFamily: element.fontFamily,
            color: element.color,
            whiteSpace: 'pre-wrap',
            maxWidth: `${element.width * scale}px`,
            cursor: 'move',
          }}
        >
          {element.text}
        </div>
      ))}

      {/* Render image elements */}
      {pageImageElements.map((element) => (
        <img
          key={element.id}
          src={element.data}
          alt="Inserted"
          className="absolute pointer-events-auto"
          style={{
            left: `${element.x * scale}px`,
            top: `${element.y * scale}px`,
            width: `${element.width * scale}px`,
            height: `${element.height * scale}px`,
            cursor: 'move',
            objectFit: 'contain',
          }}
        />
      ))}
    </div>
  );
}
