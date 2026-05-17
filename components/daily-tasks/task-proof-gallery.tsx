"use client";

import { useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TaskProofGallery({ images }: { images: string[] }) {
  const cleanImages = images.filter(Boolean);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = cleanImages[activeIndex];

  if (!cleanImages.length) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
        Missing
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setActiveIndex(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm text-primary hover:bg-muted"
      >
        <img src={cleanImages[0]} alt="Task screenshot" className="h-10 w-12 rounded object-cover" />
        View {cleanImages.length > 1 ? `(${cleanImages.length})` : ""}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg bg-card">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-3 z-10 bg-card/90"
              onClick={() => setOpen(false)}
              aria-label="Close proof gallery"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex max-h-[92vh] flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
                {activeImage ? (
                  <img src={activeImage} alt="Task proof preview" className="max-h-[72vh] w-full object-contain" />
                ) : null}
              </div>
              {cleanImages.length > 1 ? (
                <div className="grid grid-cols-4 gap-2 border-t bg-card p-3 sm:grid-cols-6 md:grid-cols-8">
                  {cleanImages.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={cn(
                        "aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        activeIndex === index && "ring-2 ring-primary"
                      )}
                      aria-label={`Show proof image ${index + 1}`}
                    >
                      <img src={image} alt={`Task proof thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
