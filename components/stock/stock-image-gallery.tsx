"use client";

import { useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoticeToast } from "@/components/ui/notice-toast";
import { createZipBlob, downloadBlob } from "@/lib/client-zip";
import { cn } from "@/lib/utils";

function imageExtension(url: string) {
  if (url.startsWith("data:image/")) {
    return url.slice("data:image/".length).split(";")[0] || "jpg";
  }

  const pathname = new URL(url, window.location.origin).pathname;
  const extension = pathname.split(".").pop()?.toLowerCase();
  return extension && extension.length <= 5 ? extension : "jpg";
}

function filenameSafe(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "stock-account";
}

export function StockImageGallery({
  images,
  title
}: {
  images: string[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const activeImage = images[activeIndex];

  async function downloadAllImages() {
    if (downloading) return;
    const baseName = filenameSafe(title);
    setDownloading(true);
    setNotice(null);

    try {
      const files = await Promise.all(
        images.map(async (image, index) => {
          const response = await fetch(image);
          if (!response.ok) throw new Error("Image download failed.");
          const blob = await response.blob();
          const extension = imageExtension(image);
          return {
            name: `${baseName}-${String(index + 1).padStart(2, "0")}.${extension}`,
            blob
          };
        })
      );
      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `${baseName}-images.zip`);
    } catch {
      setNotice("Could not download all images. Please try again or download images one by one.");
    } finally {
      setDownloading(false);
    }
  }

  if (!activeImage) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <ImageIcon className="h-8 w-8" />
          No image uploaded
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <p className="text-sm font-medium">Image gallery</p>
        <Button type="button" size="sm" variant="outline" onClick={downloadAllImages} disabled={downloading}>
          <Download className="h-4 w-4" />
          {downloading ? "Preparing..." : "Download all"}
        </Button>
      </div>

      <div className="aspect-video bg-muted">
        <img
          src={activeImage}
          alt={`${title} image ${activeIndex + 1}`}
          className="h-full w-full object-contain"
        />
      </div>

      {images.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 border-t p-3 sm:grid-cols-6 lg:grid-cols-5">
          {images.slice(0, 15).map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                activeIndex === index && "ring-2 ring-primary"
              )}
              aria-label={`Show image ${index + 1}`}
              aria-pressed={activeIndex === index}
            >
              <img
                src={image}
                alt={`${title} thumbnail ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
      <NoticeToast message={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
