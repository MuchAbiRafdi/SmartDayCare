import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "border-line-strong bg-surface text-ink hover:border-teal-600 hover:text-teal-800",
        primary: "border-teal-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14)] hover:brightness-105 [background:var(--grad-primary)]",
        ghost: "border-transparent bg-transparent text-ink-2 hover:bg-wash hover:text-ink",
        danger: "border-danger-line bg-danger-wash text-danger hover:border-danger",
        light: "border-white/25 bg-white/10 text-white hover:bg-white/18",
        dark: "border-ink bg-ink text-white hover:bg-ink-2",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };
