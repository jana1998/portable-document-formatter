import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { useSettingsStore, type LLMBackend } from '@renderer/store/useSettingsStore';
import { useToast } from '@renderer/hooks/use-toast';

interface LLMSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LLMSettingsDialog({ open, onOpenChange }: LLMSettingsDialogProps) {
  const { backend, setBackend } = useSettingsStore();
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [hasAnthropic, setHasAnthropic] = useState(false);
  const [hasOpenai, setHasOpenai] = useState(false);
  const [testing, setTesting] = useState<'anthropic' | 'openai' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    void window.electronAPI.llmHasApiKey('anthropic').then(setHasAnthropic);
    void window.electronAPI.llmHasApiKey('openai').then(setHasOpenai);
  }, [open]);

  const saveKey = async (which: 'anthropic' | 'openai', value: string) => {
    try {
      await window.electronAPI.llmSetApiKey(which, value || null);
      if (which === 'anthropic') {
        setHasAnthropic(Boolean(value));
        setAnthropicKey('');
      } else {
        setHasOpenai(Boolean(value));
        setOpenaiKey('');
      }
      toast({
        title: value ? 'API key stored' : 'API key cleared',
        description: `${which === 'anthropic' ? 'Claude' : 'OpenAI'} credential updated.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to save API key',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const testKey = async (which: 'anthropic' | 'openai') => {
    setTesting(which);
    try {
      const res = await window.electronAPI.llmTestBackend(which);
      toast({
        title: res.ok ? 'Connection OK' : 'Test failed',
        description: res.ok
          ? `${which === 'anthropic' ? 'Claude' : 'OpenAI'} responded successfully.`
          : res.error ?? 'Unknown error',
        variant: res.ok ? 'success' : 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>AI settings</DialogTitle>
          <DialogDescription>
            Choose how AI features run. API keys are encrypted with your OS keychain via Electron
            safeStorage — the app never stores them in plaintext.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Backend</label>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {(['local', 'anthropic', 'openai'] as LLMBackend[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBackend(b)}
                  className={`rounded-md border px-3 py-2 transition ${
                    backend === b
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-input text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {b === 'local' ? 'Local (v1.1)' : b === 'anthropic' ? 'Claude' : 'OpenAI'}
                </button>
              ))}
            </div>
            {backend === 'local' && (
              <p className="text-xs text-muted-foreground">
                Local Qwen 2.5 1.5B (~1GB, node-llama-cpp) lands in v1.1. For now, choose Claude or
                OpenAI above.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Claude API key</label>
            <input
              type="password"
              placeholder={hasAnthropic ? '•••• (stored)' : 'sk-ant-…'}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveKey('anthropic', anthropicKey)}>
                Save
              </Button>
              {hasAnthropic && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testKey('anthropic')}
                  disabled={testing === 'anthropic'}
                >
                  {testing === 'anthropic' ? 'Testing…' : 'Test connection'}
                </Button>
              )}
              {hasAnthropic && (
                <Button variant="outline" size="sm" onClick={() => saveKey('anthropic', '')}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">OpenAI API key</label>
            <input
              type="password"
              placeholder={hasOpenai ? '•••• (stored)' : 'sk-…'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveKey('openai', openaiKey)}>
                Save
              </Button>
              {hasOpenai && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testKey('openai')}
                  disabled={testing === 'openai'}
                >
                  {testing === 'openai' ? 'Testing…' : 'Test connection'}
                </Button>
              )}
              {hasOpenai && (
                <Button variant="outline" size="sm" onClick={() => saveKey('openai', '')}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
