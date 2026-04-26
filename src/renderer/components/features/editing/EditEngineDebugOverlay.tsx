import React from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';

/**
 * Floating debug panel showing per-edit engine outcomes for the current
 * document. Only rendered when the URL contains `?debug=editing` (or
 * `&debug=editing`).
 *
 * Usage: open the app with `?debug=editing` in the URL bar.
 */
export function EditEngineDebugOverlay() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== 'editing') return null;

  return <DebugPanel />;
}

function DebugPanel() {
  const { textEdits, editOutcomes, sessionStats, editEngineMode } = usePDFStore();

  const allEdits: Array<{
    id: string;
    page: number;
    original: string;
    newText: string;
    path?: string;
    reason?: string;
  }> = [];

  textEdits.forEach((pageEdits, page) => {
    for (const e of pageEdits) {
      if (e.newText !== e.originalText) {
        const outcome = editOutcomes.get(e.id);
        allEdits.push({
          id: e.id,
          page,
          original: e.originalText,
          newText: e.newText,
          path: outcome?.path,
          reason: outcome?.reason,
        });
      }
    }
  });

  const pathColor = (path?: string) =>
    path === 'tj-surgery' ? '#22c55e'
    : path === 'legacy' ? '#f97316'
    : path === 'refused' ? '#ef4444'
    : '#94a3b8';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.93)',
        color: '#e2e8f0',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 11,
        fontFamily: '"Courier New", monospace',
        maxWidth: 380,
        maxHeight: 320,
        overflowY: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        userSelect: 'text',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#7dd3fc' }}>
        Edit Engine Debug — mode: {editEngineMode}
      </div>
      <div style={{ marginBottom: 8, color: '#94a3b8' }}>
        Session: {sessionStats.surgeryCount + sessionStats.legacyCount + sessionStats.refusedCount} total
        {' · '}
        <span style={{ color: '#22c55e' }}>{sessionStats.surgeryCount}✓</span>
        {' · '}
        <span style={{ color: '#f97316' }}>{sessionStats.legacyCount}~</span>
        {sessionStats.refusedCount > 0 && (
          <>
            {' · '}
            <span style={{ color: '#ef4444' }}>{sessionStats.refusedCount}✗</span>
          </>
        )}
      </div>
      {allEdits.length === 0 ? (
        <div style={{ color: '#64748b' }}>No edits yet.</div>
      ) : (
        allEdits.map((e) => (
          <div
            key={e.id}
            style={{
              marginBottom: 6,
              paddingLeft: 6,
              borderLeft: `3px solid ${pathColor(e.path)}`,
            }}
          >
            <span style={{ color: '#94a3b8' }}>p{e.page} </span>
            <span style={{ color: '#e2e8f0' }}>
              &quot;{truncate(e.original, 24)}&quot; → &quot;{truncate(e.newText, 24)}&quot;
            </span>
            {e.path && (
              <div style={{ color: pathColor(e.path), marginTop: 1 }}>
                {e.path}{e.reason ? ` (${e.reason})` : ''}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
