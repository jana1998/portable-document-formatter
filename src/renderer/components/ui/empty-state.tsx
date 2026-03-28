import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: 'default' | 'warm';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = 'default',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'empty-state-grid flex min-h-[240px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border/80 px-6 py-10 text-center',
        tone === 'warm' && 'bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.14),transparent_30%)]',
        className
      )}
      {...props}
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-inner shadow-primary/10">
        <Icon className="h-7 w-7" />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
