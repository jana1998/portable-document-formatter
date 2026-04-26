// Programmatic builders for text-editing test fixtures.
//
// Each builder constructs a small PDF whose content stream we control
// precisely, so tests can verify byte-surgery against known structures
// (force-kerned multi-Tj, TJ arrays with kerning, leading whitespace
// runs, etc.).
//
// We use pdf-lib's high-level drawText for simple cases and its low-level
// pushOperators for content streams that drawText can't produce (e.g.
// force-kerned multi-Tj per character).

import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames as Ops,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  StandardFonts,
  rgb,
} from 'pdf-lib';

export interface FixturePdf {
  bytes: Uint8Array;
  /** Minimal description used by tests to construct edit requests. */
  meta: {
    name: string;
    /** The text the user would see / click. */
    text: string;
    /** Approximate bbox in mupdf coords (y from top of page). */
    bbox: { x: number; y: number; w: number; h: number };
    fontSize: number;
    pageWidth: number;
    pageHeight: number;
  };
}

const PAGE_W = 612;
const PAGE_H = 792;

/**
 * Helper: convert a PDF baseline y (from bottom) to mupdf bbox y (from top
 * of page) — the bbox top sits ~75% of font-size above the baseline for
 * Helvetica/Times-style fonts.
 */
function baselineToMupdfBbox(
  baselineY: number,
  fontSize: number
): { y: number; h: number } {
  const ascent = fontSize * 0.75;
  const descent = fontSize * 0.25;
  const top = PAGE_H - baselineY - ascent;
  return { y: top, h: ascent + descent };
}

// ---------------------------------------------------------------------------
// Builder 1: simple Helvetica + WinAnsi (drawText path).
// ---------------------------------------------------------------------------
export async function buildSimpleHelvetica(
  text: string,
  x: number,
  baselineY: number,
  fontSize: number
): Promise<FixturePdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawText(text, { x, y: baselineY, size: fontSize, font, color: rgb(0, 0, 0) });
  const bytes = await doc.save({ useObjectStreams: false });
  const { y, h } = baselineToMupdfBbox(baselineY, fontSize);
  return {
    bytes,
    meta: {
      name: 'simple-helvetica',
      text,
      bbox: { x, y, w: text.length * fontSize * 0.55, h },
      fontSize,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    },
  };
}

// ---------------------------------------------------------------------------
// Builder 2: Force-kerned multi-Tj line with a leading-whitespace run.
//
// This is the structure that broke "Architecture → Architectures" earlier:
// each visible character lives in its own Tj at a fixed-step Td, AND there's
// a literal-space Tj at the start that's part of the same line.
//
// Output content stream:
//     BT /F1 size Tf x y Td
//     ( ) Tj  step 0 Td
//     (A) Tj  step 0 Td
//     (r) Tj  step 0 Td
//     ...
//     (e) Tj
//     ET
// ---------------------------------------------------------------------------
export async function buildForceKernedWithLeadingSpace(
  text: string,
  x: number,
  baselineY: number,
  fontSize: number,
  step: number = 7
): Promise<FixturePdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  // Register the font on the page so /F1 resolves in our content stream.
  page.node.setFontDictionary(PDFName.of('F1'), font.ref);

  const fullText = ` ${text}`; // leading space char as its own Tj
  const ops: PDFOperator[] = [
    PDFOperator.of(Ops.BeginText),
    PDFOperator.of(Ops.SetFontAndSize, [
      PDFName.of('F1'),
      PDFNumber.of(fontSize),
    ]),
    PDFOperator.of(Ops.MoveText, [PDFNumber.of(x), PDFNumber.of(baselineY)]),
  ];
  for (let i = 0; i < fullText.length; i++) {
    ops.push(PDFOperator.of(Ops.ShowText, [PDFString.of(fullText[i])]));
    if (i < fullText.length - 1) {
      ops.push(
        PDFOperator.of(Ops.MoveText, [PDFNumber.of(step), PDFNumber.of(0)])
      );
    }
  }
  ops.push(PDFOperator.of(Ops.EndText));
  page.pushOperators(...ops);

  const bytes = await doc.save({ useObjectStreams: false });
  const { y, h } = baselineToMupdfBbox(baselineY, fontSize);
  return {
    bytes,
    meta: {
      name: 'force-kerned-leading-space',
      // mupdf typically reports the line's text including the leading space.
      text: fullText,
      bbox: { x, y, w: fullText.length * step, h },
      fontSize,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    },
  };
}

// ---------------------------------------------------------------------------
// Builder 3: TJ array with explicit inter-character kerning offsets.
// (Justified text / typeset paragraph pattern.)
//
// Output: BT /F1 size Tf x y Td [(He) -50 (llo) -50 (Wor) -50 (ld)] TJ ET
// ---------------------------------------------------------------------------
export async function buildTjArrayWithKerning(
  segments: string[],
  kern: number,
  x: number,
  baselineY: number,
  fontSize: number
): Promise<FixturePdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('F1'), font.ref);

  // Build the TJ array as raw operands. pdf-lib's PDFOperator.of allows
  // mixing values; we serialize the array via a custom operator emission.
  // pdf-lib doesn't expose an array-PDFObject directly for use as an
  // operand here, so we emit a 'pushOperators' with explicit raw bytes:
  // for testing we rely on the shape `[(...) num (...) num ...] TJ`.
  const tjOperands: Array<PDFString | PDFNumber> = [];
  segments.forEach((seg, i) => {
    tjOperands.push(PDFString.of(seg));
    if (i < segments.length - 1) {
      tjOperands.push(PDFNumber.of(kern));
    }
  });

  const ops: PDFOperator[] = [
    PDFOperator.of(Ops.BeginText),
    PDFOperator.of(Ops.SetFontAndSize, [
      PDFName.of('F1'),
      PDFNumber.of(fontSize),
    ]),
    PDFOperator.of(Ops.MoveText, [PDFNumber.of(x), PDFNumber.of(baselineY)]),
    // Use the TJ operator name explicitly with the array operands. The
    // PDFOperator constructor accepts [array operand] for TJ.
    PDFOperator.of(Ops.ShowTextAdjusted, tjOperands),
    PDFOperator.of(Ops.EndText),
  ];
  page.pushOperators(...ops);

  const bytes = await doc.save({ useObjectStreams: false });
  const { y, h } = baselineToMupdfBbox(baselineY, fontSize);
  const text = segments.join('');
  return {
    bytes,
    meta: {
      name: 'tj-array-kerning',
      text,
      bbox: { x, y, w: text.length * fontSize * 0.55, h },
      fontSize,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    },
  };
}

// ---------------------------------------------------------------------------
// Builder 4: Mixed-style line — bold word followed by regular word, both
// drawn at the same baseline. Tests that our multi-run policy refuses
// distribution across font switches.
// ---------------------------------------------------------------------------
export async function buildMixedStyleLine(
  boldText: string,
  regularText: string,
  x: number,
  baselineY: number,
  fontSize: number
): Promise<FixturePdf> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawText(boldText, { x, y: baselineY, size: fontSize, font: bold, color: rgb(0, 0, 0) });
  // Place regular after bold; estimate ~6pt per char advance for layout.
  const xRegular = x + boldText.length * fontSize * 0.6;
  page.drawText(regularText, {
    x: xRegular,
    y: baselineY,
    size: fontSize,
    font: regular,
    color: rgb(0, 0, 0),
  });
  const bytes = await doc.save({ useObjectStreams: false });
  const { y, h } = baselineToMupdfBbox(baselineY, fontSize);
  const fullText = `${boldText}${regularText}`;
  return {
    bytes,
    meta: {
      name: 'mixed-style-line',
      text: fullText,
      bbox: { x, y, w: fullText.length * fontSize * 0.6, h },
      fontSize,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    },
  };
}

// ---------------------------------------------------------------------------
// Builder 5: Hex-string Tj operand (some PDF generators emit hex even for
// simple ASCII to defeat naive grep-based extraction).
// ---------------------------------------------------------------------------
export async function buildHexStringTj(
  text: string,
  x: number,
  baselineY: number,
  fontSize: number
): Promise<FixturePdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('F1'), font.ref);

  const ops: PDFOperator[] = [
    PDFOperator.of(Ops.BeginText),
    PDFOperator.of(Ops.SetFontAndSize, [
      PDFName.of('F1'),
      PDFNumber.of(fontSize),
    ]),
    PDFOperator.of(Ops.MoveText, [PDFNumber.of(x), PDFNumber.of(baselineY)]),
    PDFOperator.of(Ops.ShowText, [PDFHexString.of(toHex(text))]),
    PDFOperator.of(Ops.EndText),
  ];
  page.pushOperators(...ops);

  const bytes = await doc.save({ useObjectStreams: false });
  const { y, h } = baselineToMupdfBbox(baselineY, fontSize);
  return {
    bytes,
    meta: {
      name: 'hex-string-tj',
      text,
      bbox: { x, y, w: text.length * fontSize * 0.55, h },
      fontSize,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    },
  };
}

function toHex(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ch.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}
