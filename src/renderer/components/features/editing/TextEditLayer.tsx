import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { TextEditLineInfo, TextEdit } from '@renderer/types';

interface Props {
  pageNumber: number;
  scale: number;
}

interface LineState {
  info: TextEditLineInfo;
  id: string;
}

/**
 * Pick a CSS font-family stack that mirrors the standard-font selection used
 * by the bake step (pickStandardFont in pdf-service). This way the overlay
 * shown while typing matches the rendered text after commit, instead of
 * silently falling back to the browser's generic sans-serif.
 */
function pickCssFontStack(family: string, postScriptName: string): string {
  const familyLc = family.toLowerCase();
  const nameLc = postScriptName.toLowerCase();
  if (
    /(mono|courier|consolas|menlo|inconsolata)/.test(nameLc) ||
    familyLc.includes('mono') ||
    familyLc.includes('courier')
  ) {
    return '"Courier New", Courier, monospace';
  }
  const isSerif =
    /(times|roman|georgia|garamond|palatino|cambria|caslon|baskerville|charter|minion)/.test(nameLc) ||
    /(^|[^a-z])serif([^a-z]|$)/.test(familyLc);
  const isExplicitSans =
    /(helvetica|arial|verdana|tahoma|calibri|segoe|trebuchet|lato|roboto|ubuntu)/.test(nameLc) ||
    familyLc.includes('sans');
  if (isSerif && !isExplicitSans) {
    return '"Times New Roman", Times, serif';
  }
  return 'Helvetica, Arial, sans-serif';
}

export function TextEditLayer({ pageNumber, scale }: Props) {
  const { currentDocument, currentTool, textEdits, bakedSnapshot, editOutcomes, addTextEdit, updateTextEdit } = usePDFStore();
  const [lines, setLines] = useState<LineState[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const isEditMode = currentTool === 'edit-text';

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

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Mirror-measure the input value so the input grows with content.
  useLayoutEffect(() => {
    if (editingId && measureRef.current) {
      setMeasuredWidth(measureRef.current.getBoundingClientRect().width);
    }
  }, [inputValue, editingId]);

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

    // Phase 4a diagnostic: log the content-stream locator result so we can
    // verify on real PDFs that the new editing engine resolves clicks to
    // the right operator. Does NOT change behavior — the legacy bake path
    // still runs. Removed in Phase 4b once the new engine is the default.
    if (currentDocument && window.electronAPI?.locateTextEdit) {
      void window.electronAPI
        .locateTextEdit(currentDocument.path, pageNumber, {
          bbox: line.info.bbox,
          text: line.info.text,
          fontSize: line.info.font.size,
        })
        .then((res) => {
          if (!res) {
            // eslint-disable-next-line no-console
            console.info('[locator] no result for line', line.id);
            return;
          }
          // eslint-disable-next-line no-console
          console.info(
            `[locator] line=${line.id} text="${line.info.text}" → confidence=${res.confidence.toFixed(2)} runs=${res.runs.length}`,
            { reason: res.reason, runs: res.runs }
          );
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[locator] error', err);
        });
    }
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
        color: line.info.color,
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
        const { bbox, font, color } = line.info;
        const existingEdit = getExistingEdit(line.id);
        const isEditing = editingId === line.id;
        const isEdited =
          existingEdit !== undefined && existingEdit.newText !== existingEdit.originalText;
        // Once the rendered PDF has the new text baked in, the underlying
        // pdf.js canvas already shows it. Drop the white-mask + overlay text
        // so the user sees the pixel-perfect rendered version.
        const isBakedInSync =
          isEdited &&
          bakedSnapshot.get(line.id) === existingEdit!.newText;
        const showOverlayPaint = isEdited && !isBakedInSync;

        // Color-code the bottom border by bake outcome so the user can see
        // which path each edit took: green=byte-surgery, orange=legacy, red=refused.
        const bakedOutcome = isBakedInSync ? editOutcomes.get(line.id) : undefined;
        const outcomeBorderColor =
          bakedOutcome?.path === 'tj-surgery' ? '#22c55e'
          : bakedOutcome?.path === 'legacy' ? '#f97316'
          : bakedOutcome?.path === 'refused' ? '#ef4444'
          : '#94a3b8';
        const outcomeBorderStyle = isBakedInSync
          ? `2px solid ${outcomeBorderColor}`
          : showOverlayPaint
            ? '2px solid #3b82f6'
            : 'none';

        const outcomeTitle = bakedOutcome
          ? bakedOutcome.path === 'tj-surgery'
            ? `Saved (byte-surgery)${bakedOutcome.reason ? ` — ${bakedOutcome.reason}` : ''}`
            : bakedOutcome.path === 'legacy'
              ? 'Saved (legacy redraw)'
              : `Not saved in-place${bakedOutcome.reason ? ` — ${bakedOutcome.reason}` : ''}`
          : undefined;

        const left = bbox.x * scale;
        const top = bbox.y * scale;
        const minWidth = Math.max(bbox.w * scale, 20);
        // Use bbox.h as the visible-glyph anchor: it reflects the actual
        // rendered line height in the PDF (mupdf reports it in pt at 72dpi).
        // bbox.h * scale gives us a px height that closely matches the
        // rendered glyphs, regardless of how PDF text matrices may have
        // scaled the nominal font.size.
        const height = Math.max(bbox.h * scale, font.size * scale * 0.5);
        const fontSizePx = bbox.h * scale;

        // Mirror the bake's font selection so the overlay during typing
        // looks like the final rendered result (Times for serif PDFs,
        // Helvetica for sans-serif, etc.) instead of falling back to a
        // generic system font. Color comes from mupdf so colored body
        // text doesn't flash to black mid-edit.
        const cssFont: React.CSSProperties = {
          fontFamily: pickCssFontStack(font.family, font.name),
          fontSize: `${fontSizePx}px`,
          fontWeight: font.weight,
          fontStyle: font.style,
          lineHeight: 1,
          fontFeatureSettings: '"kern" 1',
          textRendering: 'geometricPrecision',
          fontKerning: 'normal',
        };
        const textColor = color || '#000000';

        return (
          <div
            key={line.id}
            className="pointer-events-auto absolute"
            style={{ left, top, height }}
          >
            {isEditing ? (
              <>
                {/* Hidden mirror span so the input grows as the user types. */}
                <span
                  ref={measureRef}
                  aria-hidden="true"
                  style={{
                    ...cssFont,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    visibility: 'hidden',
                    whiteSpace: 'pre',
                    pointerEvents: 'none',
                  }}
                >
                  {inputValue || ' '}
                </span>
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={() => commitEdit(line)}
                  onKeyDown={(e) => handleKeyDown(e, line)}
                  className="block h-full border-0 bg-blue-50/80 px-0 outline outline-2 outline-blue-400 focus:ring-0 dark:bg-blue-900/40 dark:outline-blue-500"
                  style={{
                    ...cssFont,
                    width: Math.max(measuredWidth + 2, minWidth),
                    padding: 0,
                    margin: 0,
                    boxSizing: 'content-box',
                  }}
                />
              </>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleLineClick(line)}
                onKeyDown={(e) => e.key === 'Enter' && handleLineClick(line)}
                title={
                  outcomeTitle
                    ? `Edited: "${existingEdit?.newText}" — ${outcomeTitle}`
                    : isEdited
                      ? `Edited: "${existingEdit?.newText}"`
                      : `Click to edit: "${line.info.text}"`
                }
                className={
                  showOverlayPaint
                    ? 'flex h-full cursor-text items-end'
                    : 'flex h-full cursor-text items-end hover:bg-blue-100/30 dark:hover:bg-blue-800/20'
                }
                style={{
                  ...cssFont,
                  // While the bake is in flight (showOverlayPaint=true), white
                  // covers the original PDF text and the new text is drawn in
                  // the original color. Once the bake completes
                  // (isBakedInSync), we go fully transparent — pdf.js renders
                  // the new text natively, which matches the original PDF
                  // font and color.
                  backgroundColor: showOverlayPaint ? 'white' : 'transparent',
                  color: showOverlayPaint ? textColor : 'transparent',
                  borderBottom: outcomeBorderStyle,
                  boxShadow: showOverlayPaint ? '0 0 0 1.5px white' : 'none',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  minWidth,
                  paddingBottom: `${fontSizePx * 0.05}px`,
                }}
              >
                {showOverlayPaint
                  ? existingEdit!.newText
                  : isBakedInSync
                    ? ''
                    : line.info.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
