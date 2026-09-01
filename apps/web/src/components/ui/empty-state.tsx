import type { ReactNode } from "react";
import { Card } from "./card";

export interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}

export function EmptyState({
  action,
  description,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <Card className="grid min-h-64 place-items-center text-center">
      <div className="max-w-md">
        {icon && (
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-secondary-soft text-secondary">
            {icon}
          </div>
        )}
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </Card>
  );
}
