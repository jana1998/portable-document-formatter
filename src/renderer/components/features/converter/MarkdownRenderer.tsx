import React, { useMemo } from 'react';
import { cn } from '@renderer/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight Markdown renderer component
 * Renders common Markdown syntax including headings, lists, code blocks, and links
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    return parseMarkdown(content);
  }, [content]);

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        'prose-headings:font-medium prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h1:mb-4 prose-h1:mt-6',
        'prose-h2:text-xl prose-h2:mb-3 prose-h2:mt-5',
        'prose-h3:text-lg prose-h3:mb-2 prose-h3:mt-4',
        'prose-p:mb-3 prose-p:leading-relaxed',
        'prose-ul:mb-3 prose-ul:list-disc prose-ul:pl-6',
        'prose-ol:mb-3 prose-ol:list-decimal prose-ol:pl-6',
        'prose-li:mb-1',
        'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono',
        'prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto',
        'prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic',
        'prose-a:text-primary prose-a:underline prose-a:font-medium',
        'prose-strong:font-semibold',
        'prose-em:italic',
        'prose-hr:my-6 prose-hr:border-border',
        'prose-table:border-collapse prose-table:w-full',
        'prose-th:border prose-th:border-border prose-th:bg-muted prose-th:p-2 prose-th:text-left prose-th:font-semibold',
        'prose-td:border prose-td:border-border prose-td:p-2',
        className
      )}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}

/**
 * Simple Markdown parser
 * Converts common Markdown syntax to HTML
 */
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${language}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg" />');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');
  html = html.replace(/^\*\*\*$/gm, '<hr />');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs
  const lines = html.split('\n');
  const processed: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('<pre>')) {
      inCodeBlock = true;
    } else if (line.startsWith('</pre>')) {
      inCodeBlock = false;
    } else if (line.startsWith('<ul>') || line.startsWith('<ol>')) {
      inList = true;
    } else if (line.startsWith('</ul>') || line.startsWith('</ol>')) {
      inList = false;
    }

    if (
      !inCodeBlock &&
      !inList &&
      line.length > 0 &&
      !line.startsWith('<h') &&
      !line.startsWith('<blockquote>') &&
      !line.startsWith('<hr') &&
      !line.startsWith('<li>') &&
      !line.startsWith('<ul>') &&
      !line.startsWith('<ol>') &&
      !line.startsWith('</ul>') &&
      !line.startsWith('</ol>') &&
      !line.startsWith('<pre>') &&
      !line.startsWith('</pre>')
    ) {
      processed.push(`<p>${line}</p>`);
    } else {
      processed.push(line);
    }
  }

  return processed.join('\n');
}
