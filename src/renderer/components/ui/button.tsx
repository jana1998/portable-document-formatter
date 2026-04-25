import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

/*
 * Button variants follow the Mastercard-inspired spec in DESIGN.md:
 *   - `default`   Ink Black pill, 20px radius, weight 500, cream text.
 *                 The flagship primary action.
 *   - `outline`   White-on-cream with 1.5px ink border. Secondary or utility.
 *   - `soft`      Cream-on-ink (soft brown-beige) for muted emphasis.
 *   - `ghost`     Text-only with a quiet hover — used for dense toolbars.
 *   - `toolbar`   Transparent by default, lifts to cream on hover. Docked in
 *                 pill nav bars.
 *   - `satellite` 56px white circle with arrow — attaches to portrait cards.
 *   - `consent`   Signal Orange — reserved for legal / cookie actions. Don't
 *                 use for marketing CTAs.
 *   - `destructive`  Warm red pill for truly destructive confirmations.
 *   - `link`      Underlined inline link.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'font-medium text-sm leading-none',
    'ring-offset-background transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:scale-[0.98]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'rounded-button border border-foreground bg-foreground text-background',
          'hover:bg-foreground/92',
        ].join(' '),
        destructive: [
          'rounded-button border border-destructive bg-destructive text-destructive-foreground',
          'hover:bg-destructive/92',
        ].join(' '),
        outline: [
          'rounded-button border-[1.5px] border-foreground bg-white text-foreground',
          'hover:bg-card dark:bg-card dark:border-foreground',
        ].join(' '),
        secondary: [
          'rounded-button border border-border bg-card text-foreground',
          'hover:bg-muted',
        ].join(' '),
        soft: [
          'rounded-button bg-muted text-foreground',
          'hover:bg-muted/70',
        ].join(' '),
        ghost: [
          'rounded-button text-muted-foreground',
          'hover:bg-muted hover:text-foreground',
        ].join(' '),
        toolbar: [
          'rounded-full border border-transparent bg-transparent text-foreground/80',
          'hover:bg-muted hover:text-foreground',
        ].join(' '),
        satellite: [
          'rounded-full bg-white text-foreground border border-border/50',
          'shadow-soft-1 hover:shadow-soft-2',
        ].join(' '),
        consent: [
          'rounded-full bg-accent text-accent-foreground border border-accent',
          'hover:bg-accent/90',
        ].join(' '),
        link: 'text-foreground underline-offset-4 hover:underline decoration-foreground/30',
      },
      size: {
        default: 'h-10 px-6',
        sm: 'h-9 px-4 text-[13px]',
        lg: 'h-12 px-8 text-base',
        xl: 'h-14 px-10 text-base',
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
