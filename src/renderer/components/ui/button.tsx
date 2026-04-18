import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-button text-sm font-medium tracking-tight ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
  {
    variants: {
      variant: {
        // Ink Black Pill - Primary CTA
        default: 'bg-primary text-primary-foreground border border-primary shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.16)] active:scale-[0.98]',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        // Outlined Pill - Secondary CTA
        outline: 'border-[1.5px] border-foreground bg-card text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:bg-muted/50 active:scale-[0.98]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        toolbar: 'border border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/60 hover:text-foreground',
        // Signal Orange - Consent/Special Actions
        soft: 'bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_2px_8px_rgba(207,69,0,0.2)]',
        link: 'text-foreground underline-offset-4 hover:underline font-normal',
      },
      size: {
        default: 'h-10 px-6 py-1.5',
        sm: 'h-9 px-5 text-xs',
        lg: 'h-12 px-10 text-base',
        icon: 'h-10 w-10',
        toolbar: 'h-10 px-4',
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
