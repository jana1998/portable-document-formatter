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
    <div ref={ref} className={cn('flex items-start justify-between gap-3 p-5', className)} {...props} />
  )
);
PanelCardHeader.displayName = 'PanelCardHeader';

const PanelCardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-base font-medium tracking-tightest text-foreground', className)}
      {...props}
    />
  )
);
PanelCardTitle.displayName = 'PanelCardTitle';

const PanelCardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('mt-1 text-[13px] leading-5 text-muted-foreground', className)} {...props} />
  )
);
PanelCardDescription.displayName = 'PanelCardDescription';

const PanelCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pb-5', className)} {...props} />
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
