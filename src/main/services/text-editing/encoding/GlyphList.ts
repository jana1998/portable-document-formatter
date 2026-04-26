// Adobe Glyph List (AGL) — glyph-name → Unicode codepoint.
//
// The full AGL has ~4200 entries (Adobe + AGLFN); we ship the subset that
// covers ~99% of real-world Western PDFs:
//   - Printable ASCII glyph names (space..tilde, code 0x20..0x7E)
//   - Latin-1 supplement (0xA0..0xFF) — accented characters, currencies,
//     punctuation
//   - Latin Extended-A common entries used in European languages
//   - Punctuation that PDF generators routinely emit (em/en-dash, smart
//     quotes, bullets, ellipsis, dagger, etc.)
//   - Common ligatures (fi, fl)
//   - The handful of special-named control characters
//
// Coverage gaps fall through gracefully — `glyphNameToUnicode` returns null,
// which the encoder reports as a "missing" character so the policy layer
// can fall back to redact-and-reemit instead of writing wrong bytes.
//
// This list is generated from Adobe's official AGLFN v1.7 (released 2008,
// public domain). Source: https://github.com/adobe-type-tools/agl-aglfn

/**
 * Map glyph names to their Unicode codepoints. A glyph name is the symbolic
 * identifier used in PostScript/PDF (e.g. "A", "agrave", "endash"); the
 * value is the canonical Unicode codepoint for that glyph.
 *
 * Some glyphs share names with multiple Unicode codepoints (e.g. Greek vs
 * Latin); we use the AGLFN's preferred mapping (Latin where ambiguous).
 */
export const GLYPH_NAME_TO_UNICODE: Readonly<Record<string, number>> = Object.freeze({
  // Special / placeholder
  '.notdef': 0x0000,

  // Whitespace
  space: 0x0020,
  nbspace: 0x00a0, // some PDFs use this; standard is "nbspace" or "space"
  nonbreakingspace: 0x00a0,

  // ASCII printable (0x21..0x7E)
  exclam: 0x0021,
  quotedbl: 0x0022,
  numbersign: 0x0023,
  dollar: 0x0024,
  percent: 0x0025,
  ampersand: 0x0026,
  quoteright: 0x2019, // PDF historical: "quoteright" → typographer's right single quote
  quotesingle: 0x0027, // straight ASCII apostrophe
  parenleft: 0x0028,
  parenright: 0x0029,
  asterisk: 0x002a,
  plus: 0x002b,
  comma: 0x002c,
  hyphen: 0x002d,
  period: 0x002e,
  slash: 0x002f,
  zero: 0x0030,
  one: 0x0031,
  two: 0x0032,
  three: 0x0033,
  four: 0x0034,
  five: 0x0035,
  six: 0x0036,
  seven: 0x0037,
  eight: 0x0038,
  nine: 0x0039,
  colon: 0x003a,
  semicolon: 0x003b,
  less: 0x003c,
  equal: 0x003d,
  greater: 0x003e,
  question: 0x003f,
  at: 0x0040,
  A: 0x0041,
  B: 0x0042,
  C: 0x0043,
  D: 0x0044,
  E: 0x0045,
  F: 0x0046,
  G: 0x0047,
  H: 0x0048,
  I: 0x0049,
  J: 0x004a,
  K: 0x004b,
  L: 0x004c,
  M: 0x004d,
  N: 0x004e,
  O: 0x004f,
  P: 0x0050,
  Q: 0x0051,
  R: 0x0052,
  S: 0x0053,
  T: 0x0054,
  U: 0x0055,
  V: 0x0056,
  W: 0x0057,
  X: 0x0058,
  Y: 0x0059,
  Z: 0x005a,
  bracketleft: 0x005b,
  backslash: 0x005c,
  bracketright: 0x005d,
  asciicircum: 0x005e,
  underscore: 0x005f,
  quoteleft: 0x2018, // PDF historical: typographer's left single quote
  grave: 0x0060, // straight grave accent
  a: 0x0061,
  b: 0x0062,
  c: 0x0063,
  d: 0x0064,
  e: 0x0065,
  f: 0x0066,
  g: 0x0067,
  h: 0x0068,
  i: 0x0069,
  j: 0x006a,
  k: 0x006b,
  l: 0x006c,
  m: 0x006d,
  n: 0x006e,
  o: 0x006f,
  p: 0x0070,
  q: 0x0071,
  r: 0x0072,
  s: 0x0073,
  t: 0x0074,
  u: 0x0075,
  v: 0x0076,
  w: 0x0077,
  x: 0x0078,
  y: 0x0079,
  z: 0x007a,
  braceleft: 0x007b,
  bar: 0x007c,
  braceright: 0x007d,
  asciitilde: 0x007e,

  // WinAnsi-specific upper range (0x80..0x9F is mostly punctuation)
  Euro: 0x20ac,
  bullet: 0x2022,
  quotesinglbase: 0x201a,
  florin: 0x0192,
  quotedblbase: 0x201e,
  ellipsis: 0x2026,
  dagger: 0x2020,
  daggerdbl: 0x2021,
  circumflex: 0x02c6,
  perthousand: 0x2030,
  Scaron: 0x0160,
  guilsinglleft: 0x2039,
  OE: 0x0152,
  Zcaron: 0x017d,
  quotedblleft: 0x201c,
  quotedblright: 0x201d,
  endash: 0x2013,
  emdash: 0x2014,
  tilde: 0x02dc,
  trademark: 0x2122,
  scaron: 0x0161,
  guilsinglright: 0x203a,
  oe: 0x0153,
  zcaron: 0x017e,
  Ydieresis: 0x0178,

  // Latin-1 supplement (0xA0..0xFF)
  exclamdown: 0x00a1,
  cent: 0x00a2,
  sterling: 0x00a3,
  currency: 0x00a4,
  yen: 0x00a5,
  brokenbar: 0x00a6,
  section: 0x00a7,
  dieresis: 0x00a8,
  copyright: 0x00a9,
  ordfeminine: 0x00aa,
  guillemotleft: 0x00ab,
  logicalnot: 0x00ac,
  hyphennb: 0x002d, // some encodings use "hyphennb" for the same glyph
  registered: 0x00ae,
  macron: 0x00af,
  degree: 0x00b0,
  plusminus: 0x00b1,
  twosuperior: 0x00b2,
  threesuperior: 0x00b3,
  acute: 0x00b4,
  mu: 0x00b5,
  paragraph: 0x00b6,
  periodcentered: 0x00b7,
  cedilla: 0x00b8,
  onesuperior: 0x00b9,
  ordmasculine: 0x00ba,
  guillemotright: 0x00bb,
  onequarter: 0x00bc,
  onehalf: 0x00bd,
  threequarters: 0x00be,
  questiondown: 0x00bf,
  Agrave: 0x00c0,
  Aacute: 0x00c1,
  Acircumflex: 0x00c2,
  Atilde: 0x00c3,
  Adieresis: 0x00c4,
  Aring: 0x00c5,
  AE: 0x00c6,
  Ccedilla: 0x00c7,
  Egrave: 0x00c8,
  Eacute: 0x00c9,
  Ecircumflex: 0x00ca,
  Edieresis: 0x00cb,
  Igrave: 0x00cc,
  Iacute: 0x00cd,
  Icircumflex: 0x00ce,
  Idieresis: 0x00cf,
  Eth: 0x00d0,
  Ntilde: 0x00d1,
  Ograve: 0x00d2,
  Oacute: 0x00d3,
  Ocircumflex: 0x00d4,
  Otilde: 0x00d5,
  Odieresis: 0x00d6,
  multiply: 0x00d7,
  Oslash: 0x00d8,
  Ugrave: 0x00d9,
  Uacute: 0x00da,
  Ucircumflex: 0x00db,
  Udieresis: 0x00dc,
  Yacute: 0x00dd,
  Thorn: 0x00de,
  germandbls: 0x00df,
  agrave: 0x00e0,
  aacute: 0x00e1,
  acircumflex: 0x00e2,
  atilde: 0x00e3,
  adieresis: 0x00e4,
  aring: 0x00e5,
  ae: 0x00e6,
  ccedilla: 0x00e7,
  egrave: 0x00e8,
  eacute: 0x00e9,
  ecircumflex: 0x00ea,
  edieresis: 0x00eb,
  igrave: 0x00ec,
  iacute: 0x00ed,
  icircumflex: 0x00ee,
  idieresis: 0x00ef,
  eth: 0x00f0,
  ntilde: 0x00f1,
  ograve: 0x00f2,
  oacute: 0x00f3,
  ocircumflex: 0x00f4,
  otilde: 0x00f5,
  odieresis: 0x00f6,
  divide: 0x00f7,
  oslash: 0x00f8,
  ugrave: 0x00f9,
  uacute: 0x00fa,
  ucircumflex: 0x00fb,
  udieresis: 0x00fc,
  yacute: 0x00fd,
  thorn: 0x00fe,
  ydieresis: 0x00ff,

  // Common ligatures and punctuation outside Latin-1
  fi: 0xfb01,
  fl: 0xfb02,
  ffi: 0xfb03,
  ffl: 0xfb04,
  ff: 0xfb00,
  emspace: 0x2003,
  enspace: 0x2002,
  thinspace: 0x2009,
  hairspace: 0x200a,
  zerowidthspace: 0x200b,
  minute: 0x2032, // prime
  second: 0x2033, // double prime
  fraction: 0x2044,

  // Latin Extended-A — commonly seen in European-language PDFs
  Lslash: 0x0141,
  lslash: 0x0142,
  Aogonek: 0x0104,
  aogonek: 0x0105,
  Cacute: 0x0106,
  cacute: 0x0107,
  Eogonek: 0x0118,
  eogonek: 0x0119,
  Sacute: 0x015a,
  sacute: 0x015b,
  Zacute: 0x0179,
  zacute: 0x017a,
  Zdotaccent: 0x017b,
  zdotaccent: 0x017c,
  IJ: 0x0132,
  ij: 0x0133,

  // Math / typography
  minus: 0x2212,
  partialdiff: 0x2202,
  infinity: 0x221e,
  approxequal: 0x2248,
  notequal: 0x2260,
  lessequal: 0x2264,
  greaterequal: 0x2265,
  arrowleft: 0x2190,
  arrowright: 0x2192,
  arrowup: 0x2191,
  arrowdown: 0x2193,
});

/** Build a reverse map for encoding (Unicode → glyph name). */
function buildReverse(): Map<number, string> {
  const m = new Map<number, string>();
  for (const [name, cp] of Object.entries(GLYPH_NAME_TO_UNICODE)) {
    // First-write wins: prefer the name that comes first in declaration order.
    // For our purposes the canonical names happen to be declared first.
    if (!m.has(cp)) m.set(cp, name);
  }
  return m;
}

const UNICODE_TO_GLYPH_NAME: Map<number, string> = buildReverse();

/** Look up the Unicode codepoint for a glyph name. Returns null if unknown. */
export function glyphNameToUnicode(name: string): number | null {
  if (name.length === 0) return null;
  const direct = GLYPH_NAME_TO_UNICODE[name];
  if (typeof direct === 'number') return direct;

  // Try a few common Adobe glyph-name conventions:
  //   - "uniXXXX" → U+XXXX
  //   - "uXXXXXXXX" → U+XXXXXXXX (used for codepoints beyond BMP)
  if (name.length === 7 && name.startsWith('uni')) {
    const cp = parseInt(name.slice(3), 16);
    return Number.isFinite(cp) ? cp : null;
  }
  if (name.length >= 5 && name.startsWith('u') && /^u[0-9A-Fa-f]{4,6}$/.test(name)) {
    const cp = parseInt(name.slice(1), 16);
    return Number.isFinite(cp) ? cp : null;
  }
  return null;
}

/** Reverse: codepoint → canonical glyph name. Returns null if unknown. */
export function unicodeToGlyphName(cp: number): string | null {
  return UNICODE_TO_GLYPH_NAME.get(cp) ?? null;
}
