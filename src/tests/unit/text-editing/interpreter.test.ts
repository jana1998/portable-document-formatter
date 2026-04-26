// Interpreter tests — verify state tracking, event emission, and byte-range
// accuracy of the content-stream interpreter.

import { describe, expect, it } from 'vitest';
import { tokenize } from '@main/services/text-editing/interpreter/Tokenizer';
import { interpret } from '@main/services/text-editing/interpreter/Interpreter';
import type {
  FontResolver,
  InterpreterEvent,
  TextRun,
} from '@main/services/text-editing/interpreter/types';

const enc = new TextEncoder();
const bytes = (s: string): Uint8Array => enc.encode(s);

/** Latin1 stub resolver — every byte → char. */
const latin1Resolver: FontResolver = {
  decodeText(_fontName: string, b: Uint8Array): string {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  },
};

function run(source: string) {
  const buf = bytes(source);
  const { tokens, diagnostics: tdiag } = tokenize(buf);
  expect(tdiag).toEqual([]);
  return { source: buf, ...interpret(tokens, latin1Resolver) };
}

function textRuns(events: InterpreterEvent[]): TextRun[] {
  return events.filter((e): e is { kind: 'text-run'; run: TextRun } => e.kind === 'text-run').map((e) => e.run);
}

describe('interpret — basic text-show', () => {
  it('emits a single text-run for "BT (Hello) Tj ET"', () => {
    const { events, diagnostics } = run('BT (Hello) Tj ET');
    expect(diagnostics).toEqual([]);
    const runs = textRuns(events);
    expect(runs.length).toBe(1);
    expect(runs[0].text).toBe('Hello');
    expect(runs[0].operator).toBe('Tj');
  });

  it('captures byte ranges of the operand and full op block', () => {
    const src = 'BT (Hello) Tj ET';
    const { events, source } = run(src);
    const r = textRuns(events)[0];
    // Operand "(Hello)" sits at byte 3..10
    expect(r.operandStart).toBe(src.indexOf('(Hello)'));
    expect(r.operandEnd).toBe(src.indexOf('(Hello)') + '(Hello)'.length);
    // opStart should equal operandStart (operand comes first)
    expect(r.opStart).toBe(r.operandStart);
    // opEnd should be just past 'Tj'
    expect(r.opEnd).toBe(src.indexOf('Tj') + 2);
    // Bytes match
    expect(source.subarray(r.operandStart!, r.operandEnd!).toString()).toBe(
      bytes('(Hello)').toString()
    );
  });

  it('records the active font and size', () => {
    const { events } = run('BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.fontResourceName).toBe('F1');
    expect(r.fontSize).toBe(12);
  });

  it('Tj outside BT/ET records a diagnostic and emits no run', () => {
    const { events, diagnostics } = run('(Hello) Tj');
    expect(textRuns(events)).toEqual([]);
    expect(diagnostics.some((d) => d.code === 'text-op-outside-bt-et')).toBe(true);
  });
});

describe('interpret — text positioning', () => {
  it('Td translates the text matrix', () => {
    const { events } = run('BT /F1 12 Tf 100 200 Td (Hi) Tj ET');
    const r = textRuns(events)[0];
    // textMatrix should reflect translation by (100, 200)
    expect(r.textMatrix[4]).toBe(100);
    expect(r.textMatrix[5]).toBe(200);
  });

  it('Tm sets the text matrix absolutely', () => {
    const { events } = run('BT /F1 12 Tf 1 0 0 1 50 75 Tm (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.textMatrix).toEqual([1, 0, 0, 1, 50, 75]);
  });

  it('multiple Td operations accumulate', () => {
    const { events } = run('BT /F1 12 Tf 10 20 Td 5 5 Td (Hi) Tj ET');
    const r = textRuns(events)[0];
    // Each Td is relative to the textLineMatrix; result is translation by (15, 25)
    expect(r.textMatrix[4]).toBe(15);
    expect(r.textMatrix[5]).toBe(25);
  });

  it('T* uses the current leading', () => {
    const { events } = run('BT /F1 12 Tf 14 TL (line1) Tj T* (line2) Tj ET');
    const runs = textRuns(events);
    expect(runs.length).toBe(2);
    expect(runs[0].textMatrix[5]).toBe(0); // first line at origin
    expect(runs[1].textMatrix[5]).toBe(-14); // second line moved by -leading
  });

  it("' applies an implicit T* before showing", () => {
    const { events } = run("BT /F1 12 Tf 10 TL (a) Tj (b) ' ET");
    const runs = textRuns(events);
    expect(runs.length).toBe(2);
    expect(runs[1].textMatrix[5]).toBe(-10);
    expect(runs[1].operator).toBe("'");
  });

  it('" sets word+char spacing and applies T*', () => {
    const { events } = run('BT /F1 12 Tf 10 TL 2 1 (line) " ET');
    const runs = textRuns(events);
    expect(runs.length).toBe(1);
    expect(runs[0].operator).toBe('"');
    expect(runs[0].textMatrix[5]).toBe(-10);
  });
});

describe('interpret — graphics state & CTM', () => {
  it('cm updates the CTM seen by subsequent text-runs', () => {
    const { events } = run('1 0 0 1 50 100 cm BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.ctm[4]).toBe(50);
    expect(r.ctm[5]).toBe(100);
  });

  it('q/Q stacks the CTM (state restored after Q)', () => {
    const src = [
      '1 0 0 1 10 20 cm', // outer CTM
      'q',
      '1 0 0 1 50 60 cm', // inner CTM (applied on top of outer)
      'BT /F1 12 Tf (inner) Tj ET',
      'Q',
      'BT /F1 12 Tf (outer) Tj ET',
    ].join('\n');
    const { events } = run(src);
    const runs = textRuns(events);
    expect(runs.length).toBe(2);
    // Inner CTM: outer + inner translation = (60, 80)
    expect(runs[0].ctm[4]).toBe(60);
    expect(runs[0].ctm[5]).toBe(80);
    // After Q, back to just outer
    expect(runs[1].ctm[4]).toBe(10);
    expect(runs[1].ctm[5]).toBe(20);
  });

  it('Q without matching q records a diagnostic', () => {
    const { diagnostics } = run('Q');
    expect(diagnostics.some((d) => d.code === 'graphics-state-underflow')).toBe(true);
  });
});

describe('interpret — color', () => {
  it('rg sets fill color', () => {
    const { events } = run('0.8 0.2 0.4 rg BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.fillColor.r).toBeCloseTo(0.8);
    expect(r.fillColor.g).toBeCloseTo(0.2);
    expect(r.fillColor.b).toBeCloseTo(0.4);
  });

  it('g sets gray fill color', () => {
    const { events } = run('0.5 g BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.fillColor).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });

  it('k sets CMYK and converts to RGB', () => {
    // Pure cyan (C=1 M=0 Y=0 K=0) → r=0, g=1, b=1
    const { events } = run('1 0 0 0 k BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.fillColor.r).toBeCloseTo(0);
    expect(r.fillColor.g).toBeCloseTo(1);
    expect(r.fillColor.b).toBeCloseTo(1);
  });

  it('RG sets stroke color (separate from fill)', () => {
    const { events } = run('0.1 0.2 0.3 RG BT /F1 12 Tf (Hi) Tj ET');
    const r = textRuns(events)[0];
    expect(r.strokeColor).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(r.fillColor).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('interpret — TJ', () => {
  it('emits a TJ run with array items', () => {
    const { events } = run('BT /F1 12 Tf [(Hello) -100 (World)] TJ ET');
    const r = textRuns(events)[0];
    expect(r.operator).toBe('TJ');
    expect(r.text).toBe('HelloWorld');
    expect(r.tjArray?.length).toBe(3);
    expect(r.tjArray?.[0]).toMatchObject({ kind: 'string', text: 'Hello' });
    expect(r.tjArray?.[1]).toMatchObject({ kind: 'kern', value: -100 });
    expect(r.tjArray?.[2]).toMatchObject({ kind: 'string', text: 'World' });
  });

  it('preserves byte ranges of each string in the TJ array', () => {
    const src = 'BT /F1 12 Tf [(Hello) -100 (World)] TJ ET';
    const { events } = run(src);
    const r = textRuns(events)[0];
    const helloItem = r.tjArray?.[0];
    const worldItem = r.tjArray?.[2];
    if (helloItem?.kind !== 'string' || worldItem?.kind !== 'string') {
      throw new Error('expected string items');
    }
    expect(helloItem.operandStart).toBe(src.indexOf('(Hello)'));
    expect(worldItem.operandStart).toBe(src.indexOf('(World)'));
  });

  it('handles a TJ that mixes literal and hex strings', () => {
    const { events } = run('BT /F1 12 Tf [(He) -10 <6C6C6F>] TJ ET');
    const r = textRuns(events)[0];
    expect(r.text).toBe('Hello');
    if (r.tjArray?.[2].kind !== 'string') throw new Error();
    expect(r.tjArray[2].isHex).toBe(true);
  });
});

describe('interpret — XObjects', () => {
  it('emits a do-xobject event for `Do`', () => {
    const { events } = run('q /XF1 Do Q');
    const xob = events.find((e) => e.kind === 'do-xobject');
    expect(xob).toBeDefined();
    if (xob?.kind !== 'do-xobject') throw new Error();
    expect(xob.name).toBe('XF1');
  });

  it('marks runs as inXObject when interpreter is told it runs inside one', () => {
    const buf = bytes('BT /F1 12 Tf (X) Tj ET');
    const { tokens } = tokenize(buf);
    const { events } = interpret(tokens, latin1Resolver, { inXObject: true });
    const r = textRuns(events)[0];
    expect(r.inXObject).toBe(true);
  });
});

describe('interpret — unsupported operators', () => {
  it('records unsupported-op for color-space operators', () => {
    const { events } = run('/DeviceRGB cs 0.5 0.5 0.5 sc BT /F1 12 Tf (X) Tj ET');
    const unsupported = events.filter((e) => e.kind === 'unsupported-op');
    expect(unsupported.length).toBeGreaterThan(0);
  });

  it('records unsupported-op for unknown operators without crashing', () => {
    const { events } = run('xyz123 BT /F1 12 Tf (X) Tj ET');
    const unsupported = events.find((e) => e.kind === 'unsupported-op');
    expect(unsupported).toBeDefined();
    // The text-run should still be emitted afterwards.
    expect(textRuns(events).length).toBe(1);
  });
});

describe('interpret — full content stream sample', () => {
  it('handles a realistic mixed stream', () => {
    const src = [
      '1 0 0 1 50 700 cm',
      '0.2 0.2 0.2 rg',
      'BT',
      '/F1 12 Tf',
      '14 TL',
      '(Hello, World!) Tj',
      '0 -14 Td',
      '[(Second) -50 (line)] TJ',
      '(Third line) ' + "'",
      'ET',
    ].join('\n');
    const { events, diagnostics } = run(src);
    expect(diagnostics).toEqual([]);
    const runs = textRuns(events);
    expect(runs.length).toBe(3);
    expect(runs[0].text).toBe('Hello, World!');
    expect(runs[1].text).toBe('Secondline');
    expect(runs[2].text).toBe('Third line');
    // CTM was applied to all
    for (const r of runs) {
      expect(r.ctm[4]).toBe(50);
      expect(r.ctm[5]).toBe(700);
      expect(r.fillColor.r).toBeCloseTo(0.2);
    }
  });
});
