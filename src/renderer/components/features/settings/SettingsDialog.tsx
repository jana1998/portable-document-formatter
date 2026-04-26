import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, FolderOpen, RefreshCw, Smartphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { useToast } from '@renderer/hooks/use-toast';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { EditEngineMode } from '@renderer/types';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompanionSnapshot {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  libraryPath: string | null;
  lanUrls: { iface: string; url: string }[];
}

const ENGINE_OPTIONS: { value: EditEngineMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Byte-surgery first, legacy redraw as fallback' },
  { value: 'strict', label: 'Strict', description: 'Byte-surgery only — refuse edits that need fallback' },
  { value: 'legacy-only', label: 'Legacy only', description: 'Always use redraw (slower, bypasses engine)' },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [status, setStatus] = useState<CompanionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const { editEngineMode, setEditEngineMode, sessionStats } = usePDFStore();

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI.companionStatus();
      setStatus(next);
    } catch (err) {
      console.error('companion status failed:', err);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Re-render QR whenever the active URL or token changes.
  useEffect(() => {
    if (!status || !status.running || status.lanUrls.length === 0) {
      setQrDataUrl(null);
      return;
    }
    const pairUrl = `${status.lanUrls[0].url}/?t=${status.token}`;
    QRCode.toDataURL(pairUrl, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [status]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      let libraryPath = status?.libraryPath ?? null;
      if (!libraryPath) {
        libraryPath = await window.electronAPI.companionPickLibrary();
        if (!libraryPath) {
          setBusy(false);
          return;
        }
      }
      await window.electronAPI.companionEnable();
      await refresh();
      toast({
        title: 'Mobile companion enabled',
        description: 'Scan the QR code with your phone (must be on the same WiFi).',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Could not start companion',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await window.electronAPI.companionDisable();
      await refresh();
      toast({ title: 'Mobile companion disabled', description: 'The token has been rotated.' });
    } catch (err) {
      toast({
        title: 'Could not stop companion',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRotateToken = async () => {
    setBusy(true);
    try {
      if (status?.running) {
        // disable() rotates the token; enable() picks the new one up.
        await window.electronAPI.companionDisable();
        await window.electronAPI.companionEnable();
      } else {
        await window.electronAPI.companionRotateToken();
      }
      await refresh();
      toast({ title: 'Token rotated', description: 'Re-scan the QR code on the phone.' });
    } catch (err) {
      toast({
        title: 'Could not rotate token',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePickLibrary = async () => {
    try {
      const next = await window.electronAPI.companionPickLibrary();
      if (next) {
        await refresh();
        toast({ title: 'Library folder updated', description: next });
      }
    } catch (err) {
      toast({
        title: 'Could not pick folder',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const handleCopyToken = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.token);
      toast({ title: 'Token copied' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'URL copied' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Settings
          </DialogTitle>
          <DialogDescription>
            Run a small server on this Mac so your phone (same WiFi) can open and edit PDFs from a chosen folder.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Mobile companion</p>
                <p className="text-xs text-muted-foreground">
                  {status?.running
                    ? `Running on port ${status.port}.`
                    : 'Off — your phone cannot reach this app.'}
                </p>
              </div>
              {status?.running ? (
                <Button variant="outline" size="sm" onClick={handleDisable} disabled={busy}>
                  Disable
                </Button>
              ) : (
                <Button size="sm" onClick={handleEnable} disabled={busy}>
                  Enable
                </Button>
              )}
            </div>
          </section>

          <section className="grid gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Library folder</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-foreground">
                {status?.libraryPath ?? 'Not selected'}
              </code>
              <Button variant="outline" size="sm" onClick={handlePickLibrary} disabled={busy}>
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Choose folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only PDFs in this folder are visible to the phone. Saved edits land here too.
            </p>
          </section>

          {status?.running && qrDataUrl && (
            <section className="grid gap-3 rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-start gap-4">
                <img
                  src={qrDataUrl}
                  alt="Companion QR code"
                  className="h-[180px] w-[180px] rounded-lg border border-border/60 bg-white p-2"
                />
                <div className="grid flex-1 gap-2 text-xs">
                  <p className="text-foreground">Scan with your phone&apos;s camera, then approve the prompt.</p>
                  {status.lanUrls.map((u) => (
                    <button
                      key={u.url}
                      onClick={() => handleCopyUrl(`${u.url}/?t=${status.token}`)}
                      className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-foreground hover:bg-muted"
                    >
                      <span className="truncate">{u.url}</span>
                      <Copy className="ml-2 h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <p className="text-xs text-muted-foreground">
                  Anyone on this WiFi who has the QR can read &amp; edit your library.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCopyToken}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Token
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRotateToken} disabled={busy}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rotate
                  </Button>
                </div>
              </div>
            </section>
          )}

          {status?.running && status.lanUrls.length === 0 && (
            <p className="text-xs text-destructive">
              No LAN address detected — check that you&apos;re connected to WiFi.
            </p>
          )}

          <section className="grid gap-3 border-t border-border/60 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Text editing engine
            </p>
            <div className="flex rounded-md border border-border/60 bg-muted/30 p-0.5">
              {ENGINE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditEngineMode(opt.value)}
                  className={`flex-1 rounded px-3 py-1.5 text-xs transition-colors ${
                    editEngineMode === opt.value
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={opt.description}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ENGINE_OPTIONS.find((o) => o.value === editEngineMode)?.description}
            </p>
            {(sessionStats.surgeryCount + sessionStats.legacyCount + sessionStats.refusedCount) > 0 && (
              <p className="text-xs text-muted-foreground">
                Edits this session:{' '}
                {sessionStats.surgeryCount + sessionStats.legacyCount + sessionStats.refusedCount}
                {' '}(
                <span className="text-green-600 dark:text-green-400">{sessionStats.surgeryCount} byte-surgery</span>
                {' / '}
                <span className="text-orange-500 dark:text-orange-400">{sessionStats.legacyCount} legacy</span>
                {sessionStats.refusedCount > 0 && (
                  <>
                    {' / '}
                    <span className="text-red-500 dark:text-red-400">{sessionStats.refusedCount} refused</span>
                  </>
                )}
                )
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
