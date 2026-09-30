"use client";
import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/format";

type Tone = "info" | "ok" | "err";
interface Item {
  id: number;
  text: string;
  tone: Tone;
}

const ToastCtx = React.createContext<(text: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return React.useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const push = React.useCallback((text: string, tone: Tone = "info") => {
    setItems((xs) => [...xs.slice(-3), { id: Date.now() + Math.random(), text, tone }]);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4200}>
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(o) => {
              if (!o) setItems((xs) => xs.filter((x) => x.id !== t.id));
            }}
            className={cn(
              "shadow-pop data-[state=closed]:animate-out data-[state=closed]:fade-out pointer-events-auto rounded-lg border px-4 py-3 text-[14px] leading-snug",
              t.tone === "err"
                ? "border-danger-line bg-danger-wash text-danger"
                : t.tone === "ok"
                  ? "border-ok-line bg-ok-wash text-ok"
                  : "border-[#2a3350] bg-[#1b2340] text-white",
            )}
          >
            <ToastPrimitive.Description>{t.text}</ToastPrimitive.Description>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[100] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastCtx.Provider>
  );
}
