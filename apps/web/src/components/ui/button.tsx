import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { classNames } from "../../lib/class-names";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-foreground shadow-sm hover:bg-primary-strong hover:text-white",
  secondary:
    "bg-secondary text-white shadow-sm hover:bg-secondary-strong",
  ghost: "bg-white/55 text-foreground hover:bg-white/90",
  danger: "bg-danger text-white hover:brightness-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

function buttonClasses({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return classNames(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  className,
  size,
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses({ className, size, variant })}
      type={type}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function ButtonLink({
  className,
  size,
  variant,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClasses({ className, size, variant })}
      {...props}
    />
  );
}
