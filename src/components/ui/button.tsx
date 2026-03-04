import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
    const variants = {
      default: "bg-neutral-900 text-white hover:bg-neutral-800",
      outline: "border border-neutral-300 hover:bg-neutral-100",
      secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
      ghost: "hover:bg-neutral-100",
    } as const;
    const sizes = {
      sm: "h-11 sm:h-8 px-3",
      md: "h-11 sm:h-9 px-4",
      lg: "h-11 sm:h-10 px-5",
      icon: "h-11 w-11 sm:h-9 sm:w-9 p-0",
    } as const;

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
