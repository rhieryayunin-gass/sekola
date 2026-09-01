import type { InputHTMLAttributes } from "react";
import { classNames } from "../../lib/class-names";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export function Input({
  className,
  error,
  id,
  label,
  ...props
}: InputProps) {
  const inputId = id ?? props.name;
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={inputId}>
      {label && <span>{label}</span>}
      <input
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={classNames(
          "min-h-11 w-full rounded-[var(--radius-sm)] border border-border bg-white/80 px-3 text-foreground shadow-sm transition placeholder:text-muted/70 hover:bg-white focus:border-secondary",
          error && "border-danger",
          className,
        )}
        id={inputId}
        {...props}
      />
      {error && (
        <span className="text-sm text-danger" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}
