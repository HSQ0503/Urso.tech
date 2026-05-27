import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "bare";
type Size = "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
};

const variantClass: Record<Variant, string> = {
  primary:
    "bg-orange text-white border-transparent hover:brightness-110 transition-[filter,background]",
  ghost:
    "bg-transparent text-ink border-edge-strong hover:bg-white/[0.04] transition-colors",
  bare: "bg-transparent text-ink border-transparent hover:text-orange transition-colors",
};

const sizeClass: Record<Size, string> = {
  md: "text-[14px] px-4 py-[10px]",
  lg: "text-[15px] px-[22px] py-[14px]",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-2 rounded-lg border font-medium tracking-[-0.01em] cursor-pointer ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {children}
      {icon}
    </button>
  );
}
