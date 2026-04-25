import React, { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { LoadingSpinner } from '@components/ui/loading-spinner';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { formatFileSize, formatRelativeTime } from '@renderer/lib/utils';

interface LibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LibraryFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

const TOKEN_KEY = 'companionToken';

function authToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function LibraryPicker({ open, onOpenChange }: LibraryPickerProps) {
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = authToken();
      const res = await fetch('/api/library/list', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        throw new Error(
          'Companion server not detected on this origin. Open the QR code from the desktop Settings panel — its URL uses a different port.'
        );
      }
      const body = await res.json() as { files: LibraryFile[] };
      setFiles(body.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFiles(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handlePick = (file: LibraryFile) => {
    usePDFStore.getState().setCurrentDocument({
      id: Date.now().toString(),
      name: file.name,
      path: file.path,
      pageCount: 0,
      fileSize: file.size,
      loadedAt: new Date(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Companion library</span>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Tap a PDF from the desktop&apos;s shared folder to open it on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && files && files.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No PDFs found in the library folder.
            </p>
          )}

          {!loading && files && files.length > 0 && (
            <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60">
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => handlePick(file)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/60"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatFileSize(file.size)} · {formatRelativeTime(new Date(file.mtime))}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
