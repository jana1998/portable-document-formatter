import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';
import { Send, Settings2, Sparkles, Loader2 } from 'lucide-react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import { useSettingsStore } from '@renderer/store/useSettingsStore';
import { rankPagesBySimilarity } from '@renderer/services/embeddings-indexer';
import { useToast } from '@renderer/hooks/use-toast';

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citedPages?: number[];
  streaming?: boolean;
}

const SYSTEM_PROMPT = `You are a helpful assistant answering questions about a PDF document.
Answer strictly using the provided context. When you reference information, cite pages with the format [p.N] (e.g., "[p.3]"). If the answer is not in the context, say so clearly.`;

const MAX_CONTEXT_CHARS = 16000;

export function ChatPanel({ open, onOpenChange, onOpenSettings }: ChatPanelProps) {
  const { currentDocument, ocrResults, pageEmbeddings, isIndexingEmbeddings, setCurrentPage } =
    usePDFStore();
  const { backend } = useSettingsStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    if (backend === 'anthropic' || backend === 'openai') {
      void window.electronAPI.llmHasApiKey(backend).then(setHasKey);
    } else {
      // Local backend has no API key requirement.
      setHasKey(true);
    }
  }, [open, backend]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const canChat = useMemo(() => {
    if (!currentDocument) return false;
    if (pageEmbeddings.size === 0) return false;
    if (backend === 'local') return true;
    return hasKey;
  }, [currentDocument, pageEmbeddings.size, backend, hasKey]);

  const backendLabel =
    backend === 'anthropic' ? 'Claude' : backend === 'openai' ? 'OpenAI' : 'local model';

  const statusHint = useMemo(() => {
    if (!currentDocument) return 'Open a PDF to start chatting.';
    if (isIndexingEmbeddings && pageEmbeddings.size === 0) {
      return 'Indexing the document for AI search…';
    }
    if (pageEmbeddings.size === 0) {
      return 'No text to chat with yet. Run OCR (for scans) or open a born-digital PDF so the chat has something to work with.';
    }
    if (backend === 'local') {
      return 'Ready. Responses stream from the on-device model (SmolLM2). First use downloads ~360MB.';
    }
    if (!hasKey) {
      return `Add a ${backendLabel} API key in AI settings to start chatting — or switch to the local model.`;
    }
    return `Ready. Responses via ${backendLabel}.`;
  }, [currentDocument, isIndexingEmbeddings, pageEmbeddings.size, backend, hasKey, backendLabel]);

  const buildContext = async (query: string) => {
    const queryVec = await window.electronAPI.embedText(query);
    if (!queryVec) return { citedPages: [] as number[], context: '' };
    const ranked = rankPagesBySimilarity(queryVec, pageEmbeddings, 5).filter((r) => r.score >= 0.2);

    const pieces: string[] = [];
    const cited: number[] = [];
    let used = 0;

    for (const { pageNumber } of ranked) {
      const ocr = ocrResults.get(pageNumber);
      const text = (ocr?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      // Crude char-based budget; leaves headroom for the system + question + answer.
      const remaining = MAX_CONTEXT_CHARS - used;
      if (remaining <= 0) break;
      const piece = text.slice(0, remaining);
      pieces.push(`[p.${pageNumber}]\n${piece}`);
      cited.push(pageNumber);
      used += piece.length;
    }

    return { citedPages: cited, context: pieces.join('\n\n---\n\n') };
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const query = input.trim();
    setInput('');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
      citedPages: [],
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setSending(true);

    const unsubs: Array<() => void> = [];
    try {
      const { citedPages, context } = await buildContext(query);
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, citedPages } : msg))
      );

      if (!context) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantMsg.id
              ? {
                  ...msg,
                  streaming: false,
                  content:
                    'The document has no indexed text yet. Try running OCR first, then chat.',
                }
              : msg
          )
        );
        setSending(false);
        return;
      }

      const prompt = `Context from the document:\n\n${context}\n\nQuestion: ${query}`;

      const { requestId } = await window.electronAPI.llmGenerate(prompt, {
        backend,
        system: SYSTEM_PROMPT,
        maxTokens: 1024,
        temperature: 0.2,
      });
      setStreamingId(requestId);

      unsubs.push(
        window.electronAPI.onLLMChunk(({ requestId: id, chunk }) => {
          if (id !== requestId) return;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsg.id ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        })
      );

      await new Promise<void>((resolve, reject) => {
        unsubs.push(
          window.electronAPI.onLLMDone(({ requestId: id }) => {
            if (id !== requestId) return;
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, streaming: false } : msg))
            );
            resolve();
          })
        );
        unsubs.push(
          window.electronAPI.onLLMError(({ requestId: id, message }) => {
            if (id !== requestId) return;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantMsg.id
                  ? { ...msg, streaming: false, content: msg.content + `\n\n⚠ ${message}` }
                  : msg
              )
            );
            reject(new Error(message));
          })
        );
      });
    } catch (err) {
      toast({
        title: 'Chat failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
      setStreamingId(null);
      for (const u of unsubs) u();
    }
  };

  const handleCancel = async () => {
    if (!streamingId) return;
    try {
      await window.electronAPI.llmCancel();
    } catch {
      // noop
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] sm:max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Chat with this PDF
          </DialogTitle>
          <DialogDescription>
            Ask questions grounded in the document. Answers cite the pages they come from — click any
            citation to jump there.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
          <span className="text-muted-foreground">{statusHint}</span>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> AI settings
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-[280px] space-y-3 overflow-y-auto rounded-md border border-input bg-background p-3 text-sm"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {canChat
                ? 'Ask a question about this document.'
                : 'Set up the backend above, then ask away.'}
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'rounded-md bg-primary/10 px-3 py-2'
                    : 'rounded-md bg-muted px-3 py-2'
                }
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                  {m.role}
                </div>
                <CitationText text={m.content} onPageClick={setCurrentPage} />
                {m.streaming && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Streaming…
                  </div>
                )}
                {m.role === 'assistant' && m.citedPages && m.citedPages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.citedPages.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                        onClick={() => setCurrentPage(p)}
                      >
                        Page {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            placeholder={canChat ? 'Ask a question about this PDF…' : 'Waiting…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={!canChat || sending}
          />
          {sending ? (
            <Button variant="outline" onClick={handleCancel}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => void handleSend()} disabled={!canChat || !input.trim()}>
              <Send className="h-4 w-4 mr-1" /> Send
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Renders an assistant message with clickable [p.N] citations.
function CitationText({
  text,
  onPageClick,
}: {
  text: string;
  onPageClick: (page: number) => void;
}) {
  const parts = text.split(/(\[p\.\d+\])/g);
  return (
    <div className="whitespace-pre-wrap leading-6">
      {parts.map((part, i) => {
        const match = /^\[p\.(\d+)\]$/.exec(part);
        if (!match) return <React.Fragment key={i}>{part}</React.Fragment>;
        const page = Number(match[1]);
        return (
          <button
            key={i}
            type="button"
            className="mx-0.5 inline rounded bg-primary/10 px-1 text-primary hover:bg-primary/20"
            onClick={() => onPageClick(page)}
          >
            {part}
          </button>
        );
      })}
    </div>
  );
}
