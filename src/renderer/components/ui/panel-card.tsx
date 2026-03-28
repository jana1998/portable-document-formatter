import * as React from 'react';
import { cn } from '@renderer/lib/utils';

const PanelCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('panel-surface', className)} {...props} />
  )
);
PanelCard.displayName = 'PanelCard';

const PanelCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-start justify-between gap-3 p-4', className)} {...props} />
  )
);
PanelCardHeader.displayName = 'PanelCardHeader';

const PanelCardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm font-semibold tracking-tight text-foreground', className)} {...props} />
  )
);
PanelCardTitle.displayName = 'PanelCardTitle';

const PanelCardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs leading-5 text-muted-foreground', className)} {...props} />
  )
);
PanelCardDescription.displayName = 'PanelCardDescription';

const PanelCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-4 pb-4', className)} {...props} />
  )
);
PanelCardContent.displayName = 'PanelCardContent';

export {
  PanelCard,
  PanelCardHeader,
  PanelCardTitle,
  PanelCardDescription,
  PanelCardContent,
};
