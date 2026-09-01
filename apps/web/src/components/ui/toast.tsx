"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { classNames } from "../../lib/class-names";

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastMessage {
  description?: string;
  id: number;
  title: string;
  tone: ToastTone;
}

interface CreateToast {
  description?: string;
  title: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  dismiss: (id: number) => void;
  toast: (message: CreateToast) => number;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  info: "border-secondary/35",
  success: "border-success/35",
  warning: "border-warning/35",
  error: "border-danger/35",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const toast = useCallback(
    ({ description, title, tone = "info" }: CreateToast) => {
      const id = nextId.current++;

      setMessages((current) => [
        ...current,
        { description, id, title, tone },
      ]);
      window.setTimeout(() => dismiss(id), 5_000);

      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ dismiss, toast }), [dismiss, toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <aside
        aria-label="Notifications"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] grid w-[min(24rem,calc(100vw-2rem))] gap-3"
      >
        {messages.map((message) => (
          <button
            className={classNames(
              "glass-panel rounded-[var(--radius-md)] border p-4 text-left",
              toneClasses[message.tone],
            )}
            key={message.id}
            onClick={() => dismiss(message.id)}
            type="button"
          >
            <span className="block font-semibold">{message.title}</span>
            {message.description && (
              <span className="mt-1 block text-sm text-muted">
                {message.description}
              </span>
            )}
          </button>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
