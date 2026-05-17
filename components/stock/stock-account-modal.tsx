"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { saveStockAccount } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { compressImageFiles } from "@/lib/client-image-compression";
import type { Profile, StockAccount } from "@/lib/types";

type SelectedImage = {
  id: string;
  file: File;
  url: string;
};

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filenameSafe(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "stock-account";
}

export function StockAccountModal({
  employees,
  gameCategories,
  stock,
  variant = "add",
  trigger = "default",
  canViewBuyingPrice = true,
  existingImageCount
}: {
  employees: Profile[];
  gameCategories: string[];
  stock?: StockAccount;
  variant?: "add" | "edit";
  trigger?: "default" | "icon";
  canViewBuyingPrice?: boolean;
  existingImageCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<SelectedImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const isEdit = variant === "edit";

  function syncFileInput(images: SelectedImage[]) {
    if (!fileInputRef.current) return;
    const dataTransfer = new DataTransfer();
    images.forEach((image) => dataTransfer.items.add(image.file));
    fileInputRef.current.files = dataTransfer.files;
  }

  function setImages(nextImages: SelectedImage[]) {
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
      setNotice("You can upload maximum 15 images.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      syncFileInput(selectedImages);
      return;
    }

    setNotice("Optimizing images before upload...");
    let compressedImages: File[];
    try {
      compressedImages = await compressImageFiles(incoming);
    } catch {
      setNotice("One or more images could not be optimized. Please try different images.");
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

  function downloadSelectedImages() {
    const title = stock?.secret_code && stock?.account_title
      ? `${stock.secret_code} ${stock.account_title}`
      : stock?.account_title || "stock-account";
    const baseName = filenameSafe(title);

    selectedImages.forEach((image, index) => {
      const extension = image.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const anchor = document.createElement("a");
      anchor.href = image.url;
      anchor.download = `${baseName}-${String(index + 1).padStart(2, "0")}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      await saveStockAccount(formData);
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

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size={trigger === "icon" ? "icon" : "default"}
        variant={trigger === "icon" ? "outline" : "default"}
        aria-label={isEdit ? "Edit account" : "Add account"}
        title={isEdit ? "Edit account" : "Add account"}
      >
        {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {trigger === "default" ? (isEdit ? "Edit account" : "Add account") : null}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg border bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold">{isEdit ? "Edit stock account" : "Add stock account"}</h2>
                <p className="text-sm text-muted-foreground">
                  {isEdit ? "Update account details. Uploading new images replaces existing images." : "Only the fields you asked for, with image upload."}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeModal} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={submit} className="grid gap-4 p-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={stock?.id ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="game_name">Game name</Label>
                <Input
                  id="game_name"
                  name="game_name"
                  list="game_name_suggestions"
                  required
                  placeholder="Mobile Legends"
                  defaultValue={stock?.game_name ?? gameCategories[0] ?? "Mobile Legends"}
                />
                <datalist id="game_name_suggestions">
                  {gameCategories.map((game) => (
                    <option key={game} value={game} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Type any game name, or choose a saved suggestion.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_title">Title</Label>
                <Input id="account_title" name="account_title" required placeholder="TH15 Semi Max" defaultValue={stock?.account_title ?? ""} />
              </div>

              {canViewBuyingPrice ? (
                <div className="space-y-2">
                  <Label htmlFor="buying_price">Buying price</Label>
                  <Input id="buying_price" name="buying_price" type="number" min="0" required placeholder="12000" defaultValue={stock?.buying_price ?? ""} />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling price</Label>
                <Input id="selling_price" name="selling_price" type="number" min="0" required placeholder="16800" defaultValue={stock?.selling_price ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secret_code">Secret code</Label>
                <Input id="secret_code" name="secret_code" required placeholder="ml1202" defaultValue={stock?.secret_code ?? ""} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_date">Purchase date</Label>
                <Input
                  id="purchase_date"
                  name="purchase_date"
                  type="date"
                  required
                  defaultValue={stock?.purchase_date ?? formatDateValue(new Date())}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select id="status" name="status" defaultValue={stock?.status ?? "available"}>
                  {["available", "assigned", "sold", "hold", "problem"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assigned_employee_id">Assigned employee</Label>
                <Select id="assigned_employee_id" name="assigned_employee_id" defaultValue={stock?.assigned_employee_id ?? ""}>
                  <option value="">Unassigned</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="images">Images</Label>
                <Input
                  id="images"
                  ref={fileInputRef}
                  name="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    void addImages(event.currentTarget.files);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Upload up to 15 images. Images are optimized before upload to save hosting cost. Selected: {selectedImages.length}/15
                  {isEdit && existingImageCount ? ` Existing: ${existingImageCount}` : ""}
                </p>
                {selectedImages.length ? (
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <Button type="button" size="sm" variant="outline" onClick={downloadSelectedImages}>
                        <Download className="h-4 w-4" />
                        Download all
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {selectedImages.map((image, index) => (
                        <div key={image.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                          <button
                            type="button"
                            className="h-full w-full"
                            onClick={() => setPreviewImage(image)}
                            aria-label={`View selected account image ${index + 1}`}
                          >
                            <img
                              src={image.url}
                              alt={`Selected account image ${index + 1}`}
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
                              aria-label="View image"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="h-8 w-8"
                              onClick={() => removeImage(image.id)}
                              aria-label="Remove image"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes optional</Label>
                <Textarea id="notes" name="notes" placeholder="Any private note about the account" defaultValue={stock?.notes ?? ""} />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button disabled={pending}>{pending ? "Saving..." : isEdit ? "Update account" : "Save account"}</Button>
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
              aria-label="Close image preview"
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={previewImage.url}
              alt="Selected account preview"
              className="max-h-[90vh] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
