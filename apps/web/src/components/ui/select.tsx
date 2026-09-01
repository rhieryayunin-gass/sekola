import type { SelectHTMLAttributes } from "react";
import { classNames } from "../../lib/class-names";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
}

export function Select({
  children,
  className,
  error,
  id,
  label,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  return (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={selectId}>
      {label && <span>{label}</span>}
      <select
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={classNames(
          "min-h-11 w-full rounded-[var(--radius-sm)] border border-border bg-white/80 px-3 text-foreground shadow-sm transition hover:bg-white focus:border-secondary",
          error && "border-danger",
          className,
        )}
        id={selectId}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span className="text-sm text-danger" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}
