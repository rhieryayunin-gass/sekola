import type { HTMLAttributes } from "react";
import { classNames } from "../../lib/class-names";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-white/80 text-muted",
  success: "bg-primary-soft text-success",
  warning: "bg-orange-50 text-warning",
  danger: "bg-red-50 text-danger",
  info: "bg-secondary-soft text-secondary-strong",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
