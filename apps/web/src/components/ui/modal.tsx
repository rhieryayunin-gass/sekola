"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "./button";

export interface ModalProps {
  children: ReactNode;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export function Modal({
  children,
  description,
  isOpen,
  onClose,
  title,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/45 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="glass-panel w-full max-w-lg rounded-[var(--radius-lg)] p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted">{description}</p>
            )}
          </div>
          <Button aria-label="Close modal" onClick={onClose} size="sm" variant="ghost">
            Close
          </Button>
        </header>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
