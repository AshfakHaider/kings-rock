"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Trash2, X } from "lucide-react";
import { completeDailyTask } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { compressImageFiles } from "@/lib/client-image-compression";

type SelectedProofImage = {
  id: string;
  file: File;
  url: string;
};

export function CompleteTaskButton({ taskId, completed }: { taskId: string; completed: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<SelectedProofImage[]>([]);
  const [previewImage, setPreviewImage] = useState<SelectedProofImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  function syncFileInput(images: SelectedProofImage[]) {
    if (!fileInputRef.current) return;
    const dataTransfer = new DataTransfer();
    images.forEach((image) => dataTransfer.items.add(image.file));
    fileInputRef.current.files = dataTransfer.files;
  }

  function setImages(nextImages: SelectedProofImage[]) {
    setSelectedImages((currentImages) => {
      currentImages
        .filter((image) => !nextImages.some((nextImage) => nextImage.id === image.id))
        .forEach((image) => URL.revokeObjectURL(image.url));
      syncFileInput(nextImages);
      return nextImages;
    });
  }

  async function addImages(files: FileList | null) {
    if (!files?.length) return;

    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const nextCount = selectedImages.length + incoming.length;

    if (nextCount > 15) {
      setNotice("You can upload maximum 15 screenshots.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      syncFileInput(selectedImages);
      return;
    }

    setNotice("Optimizing screenshots before upload...");
    let compressedImages: File[];
    try {
      compressedImages = await compressImageFiles(incoming);
    } catch {
      setNotice("One or more screenshots could not be optimized. Please try different images.");
      syncFileInput(selectedImages);
      return;
    }
    const nextImages = [
      ...selectedImages,
      ...compressedImages.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(file)
      }))
    ];
    setImages(nextImages);
    setNotice(null);
  }

  function removeImage(id: string) {
    const nextImages = selectedImages.filter((image) => image.id !== id);
    if (previewImage?.id === id) setPreviewImage(null);
    setImages(nextImages);
  }

  function submit(formData: FormData) {
    if (selectedImages.length === 0) {
      setNotice("Please attach at least one screenshot.");
      return;
    }

    startTransition(async () => {
      await completeDailyTask(formData);
      setOpen(false);
      setImages([]);
      setPreviewImage(null);
      router.refresh();
    });
  }

  function closeModal() {
    setOpen(false);
    setImages([]);
    setPreviewImage(null);
  }

  if (completed) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        <CheckCircle2 className="h-4 w-4" />
        Completed
      </Button>
    );
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={pending}>
        <CheckCircle2 className="h-4 w-4" />
        Mark complete
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-lg border bg-card shadow-2xl sm:max-w-md sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold">Complete task</h2>
                <p className="text-sm text-muted-foreground">Upload a screenshot as proof of completion.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeModal} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid gap-4 p-4">
              <input type="hidden" name="task_id" value={taskId} />
              <div className="space-y-2">
                <Label htmlFor={`screenshots_${taskId}`}>Screenshots</Label>
                <Input
                  id={`screenshots_${taskId}`}
                  ref={fileInputRef}
                  name="screenshots"
                  type="file"
                  accept="image/*"
                  multiple
                  required
                  onChange={(event) => void addImages(event.currentTarget.files)}
                />
                <p className="text-xs text-muted-foreground">
                  Upload up to 15 screenshots. Images are optimized before upload. Selected: {selectedImages.length}/15
                </p>
                {selectedImages.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {selectedImages.map((image, index) => (
                      <div key={image.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                        <button
                          type="button"
                          className="h-full w-full"
                          onClick={() => setPreviewImage(image)}
                          aria-label={`View selected task screenshot ${index + 1}`}
                        >
                          <img
                            src={image.url}
                            alt={`Selected task screenshot ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 bg-card/90"
                            onClick={() => setPreviewImage(image)}
                            aria-label="View screenshot"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            onClick={() => removeImage(image.id)}
                            aria-label="Remove screenshot"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : "Submit proof"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <NoticeToast message={notice} onClose={() => setNotice(null)} />

      {previewImage ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-card">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-3 z-10 bg-card/90"
              onClick={() => setPreviewImage(null)}
              aria-label="Close screenshot preview"
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={previewImage.url}
              alt="Selected task screenshot preview"
              className="max-h-[90vh] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
