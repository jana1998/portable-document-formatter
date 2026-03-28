import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_14px_28px_rgba(13,148,136,0.26)] hover:-translate-y-0.5 hover:bg-primary/95',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-border/80 bg-background/85 shadow-[0_6px_18px_rgba(15,23,42,0.04)] hover:bg-accent/10 hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-muted-foreground hover:bg-secondary/90 hover:text-foreground',
        toolbar: 'border border-transparent bg-transparent text-muted-foreground hover:border-border/80 hover:bg-background/80 hover:text-foreground',
        soft: 'bg-primary/10 text-primary hover:bg-primary/15',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3.5 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
        toolbar: 'h-10 px-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
