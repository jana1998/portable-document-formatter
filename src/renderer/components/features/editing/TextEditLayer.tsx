import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { TextEditLineInfo, TextEdit } from '@renderer/types';

interface Props {
  pageNumber: number;
  scale: number;
}

interface LineState {
  info: TextEditLineInfo;
  id: string; // stable id = `page-line-${index}`
}

export function TextEditLayer({ pageNumber, scale }: Props) {
  const { currentDocument, currentTool, textEdits, addTextEdit, updateTextEdit } = usePDFStore();
  const [lines, setLines] = useState<LineState[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditMode = currentTool === 'edit-text';

  // Fetch structured text whenever the page or document changes
  useEffect(() => {
    if (!currentDocument || !isEditMode) return;
    let cancelled = false;

    window.electronAPI
      .getPageStructuredText(currentDocument.path, pageNumber)
      .then((rawLines) => {
        if (cancelled) return;
        setLines(
          rawLines.map((info, i) => ({
            info,
            id: `p${pageNumber}-l${i}`,
          }))
        );
      })
      .catch((err) => {
        console.error('TextEditLayer: failed to get structured text', err);
      });

    return () => {
      cancelled = true;
    };
  }, [currentDocument?.path, pageNumber, isEditMode]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const getExistingEdit = useCallback(
    (lineId: string): TextEdit | undefined => {
      const pageEdits = textEdits.get(pageNumber) || [];
      return pageEdits.find((e) => e.id === lineId);
    },
    [textEdits, pageNumber]
  );

  const handleLineClick = (line: LineState) => {
    if (!isEditMode) return;
    const existing = getExistingEdit(line.id);
    setInputValue(existing ? existing.newText : line.info.text);
    setEditingId(line.id);
  };

  const commitEdit = (line: LineState) => {
    const existing = getExistingEdit(line.id);
    if (inputValue !== line.info.text || existing) {
      const edit: TextEdit = {
        id: line.id,
        pageNumber,
        originalText: line.info.text,
        newText: inputValue,
        mupdfX: line.info.bbox.x,
        mupdfY: line.info.bbox.y,
        mupdfW: line.info.bbox.w,
        mupdfH: line.info.bbox.h,
        fontSize: line.info.font.size,
        fontName: line.info.font.name,
        fontFamily: line.info.font.family,
        fontWeight: line.info.font.weight,
        fontStyle: line.info.font.style,
      };
      if (existing) {
        updateTextEdit(line.id, { newText: inputValue });
      } else {
        addTextEdit(edit);
      }
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, line: LineState) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(line);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  if (!isEditMode || lines.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ width: '100%', height: '100%' }}
    >
      {lines.map((line) => {
        const { bbox, font } = line.info;
        const existingEdit = getExistingEdit(line.id);
        const isEditing = editingId === line.id;
        const isEdited =
          existingEdit !== undefined && existingEdit.newText !== existingEdit.originalText;

        const left = bbox.x * scale;
        const top = bbox.y * scale;
        const minWidth = Math.max(bbox.w * scale, 20);
        const height = Math.max(bbox.h * scale, font.size * scale * 0.5);

        const fontSizePx = font.size * scale;
        const cssFont: React.CSSProperties = {
          fontFamily: `'${font.name}', ${font.family}, sans-serif`,
          fontSize: `${fontSizePx}px`,
          fontWeight: font.weight,
          fontStyle: font.style,
          lineHeight: 1,
        };

        return (
          // Wrapper sits at the exact original bbox; the inner box grows
          // horizontally (only) to fit longer replacement text without clipping.
          <div
            key={line.id}
            className="pointer-events-auto absolute"
            style={{ left, top, height }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={() => commitEdit(line)}
                onKeyDown={(e) => handleKeyDown(e, line)}
                className="block h-full border-0 bg-blue-50/80 px-0 outline outline-2 outline-blue-400 focus:ring-0 dark:bg-blue-900/40 dark:outline-blue-500"
                style={{
                  ...cssFont,
                  minWidth,
                  padding: 0,
                  margin: 0,
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleLineClick(line)}
                onKeyDown={(e) => e.key === 'Enter' && handleLineClick(line)}
                title={
                  isEdited
                    ? `Edited: "${existingEdit?.newText}"`
                    : `Click to edit: "${line.info.text}"`
                }
                className={
                  isEdited
                    ? 'flex h-full cursor-text items-end'
                    : 'flex h-full cursor-text items-end hover:bg-blue-100/30 dark:hover:bg-blue-800/20'
                }
                style={{
                  ...cssFont,
                  // When edited: white covers the original PDF text exactly at
                  // the original bbox; a 1.5px box-shadow halo masks pixel-level
                  // glyph spillover without changing layout (so adjacent lines
                  // stay visible). The box grows horizontally with longer text.
                  backgroundColor: isEdited ? 'white' : 'transparent',
                  color: isEdited ? 'black' : 'transparent',
                  borderBottom: isEdited ? '2px solid #3b82f6' : 'none',
                  boxShadow: isEdited ? '0 0 0 1.5px white' : 'none',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  minWidth,
                  paddingBottom: `${fontSizePx * 0.1}px`,
                }}
              >
                {isEdited ? existingEdit!.newText : line.info.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
