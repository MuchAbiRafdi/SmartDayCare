"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  desc,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-ink/55 data-[state=open]:animate-in data-[state=open]:fade-in fixed inset-0 z-50" />
      <DialogPrimitive.Content
        className={cn(
          "border-line bg-surface shadow-pop fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 focus:outline-none sm:p-6",
          wide ? "max-w-[720px]" : "max-w-[460px]",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-[17px] leading-tight font-semibold">{title}</DialogPrimitive.Title>
            {desc ? (
              <DialogPrimitive.Description className="text-muted mt-1 text-[13.5px]">{desc}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="text-muted hover:bg-wash hover:text-ink rounded-md p-1" aria-label="Tutup">
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
