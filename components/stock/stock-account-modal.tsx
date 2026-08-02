"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { addGameCategory, saveStockAccount } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeToast } from "@/components/ui/notice-toast";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/client-download";
import { compressImageFiles } from "@/lib/client-image-compression";
import { stockDisplayTitle } from "@/lib/stock-title";
import type { Profile, StockAccount } from "@/lib/types";

type SelectedImage = {
  id: string;
  file: File;
  url: string;
};

const DEFAULT_GAME_CATEGORIES = ["Mobile Legends", "Clash of Clans"];

function normalizeGameName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mergeGameCategories(...groups: Array<Array<string | null | undefined>>) {
  const categories: string[] = [];
  const seen = new Set<string>();

  groups.flat().forEach((game) => {
    const normalized = normalizeGameName(String(game ?? ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    categories.push(normalized);
  });

  return categories;
}

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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function StockAccountModal({
  employees,
  gameCategories,
  stock,
  variant = "add",
  trigger = "default",
  canViewBuyingPrice = true,
  existingImageCount,
  currentProfileId,
  isAdmin = false
}: {
  employees: Profile[];
  gameCategories: string[];
  stock?: StockAccount;
  variant?: "add" | "edit";
  trigger?: "default" | "icon";
  canViewBuyingPrice?: boolean;
  existingImageCount?: number;
  currentProfileId?: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<SelectedImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(stock?.assigned_employee_id ?? "");
  const [imageDownloadPending, setImageDownloadPending] = useState(false);
  const [savedGameCategories, setSavedGameCategories] = useState(() =>
    mergeGameCategories(DEFAULT_GAME_CATEGORIES, gameCategories, [stock?.game_name])
  );
  const [selectedGameName, setSelectedGameName] = useState(
    normalizeGameName(stock?.game_name ?? gameCategories[0] ?? DEFAULT_GAME_CATEGORIES[0])
  );
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [addGamePending, startAddGameTransition] = useTransition();
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const isEdit = variant === "edit";
  const availableGameCategories = mergeGameCategories(
    DEFAULT_GAME_CATEGORIES,
    savedGameCategories,
    [stock?.game_name, selectedGameName]
  );
  const canUsePrivateNotes =
    isAdmin || assignedEmployeeId === currentProfileId || (isEdit && stock?.assigned_employee_id === currentProfileId);

  useEffect(() => {
    setSavedGameCategories(mergeGameCategories(DEFAULT_GAME_CATEGORIES, gameCategories, [stock?.game_name]));
  }, [gameCategories, stock?.game_name]);

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

  async function downloadSelectedImages() {
    if (imageDownloadPending) return;
    const title = stockDisplayTitle(stock?.secret_code, stock?.account_title) || "stock-account";
    const baseName = filenameSafe(title);
    setImageDownloadPending(true);

    try {
      for (const [index, image] of selectedImages.entries()) {
        const extension = image.file.name.split(".").pop()?.toLowerCase() || "jpg";
        downloadBlob(image.file, `${baseName}-${String(index + 1).padStart(2, "0")}.${extension}`);
        await wait(150);
      }
      setNotice(`Started ${selectedImages.length} image downloads. Your browser may ask to allow multiple downloads.`);
    } catch {
      setNotice("Could not prepare image download. Please try again.");
    } finally {
      setImageDownloadPending(false);
    }
  }

  function addPersistentGameCategory() {
    const normalized = normalizeGameName(newGameName);
    if (!normalized) {
      setNotice("Please enter a game name first.");
      return;
    }

    startAddGameTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("game_name", normalized);
        const updatedCategories = await addGameCategory(formData);
        setSavedGameCategories(mergeGameCategories(DEFAULT_GAME_CATEGORIES, updatedCategories, [normalized]));
        setSelectedGameName(normalized);
        setNewGameName("");
        setShowAddGame(false);
        setNotice(`${normalized} added for everyone.`);
        router.refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Game could not be added.");
      }
    });
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await saveStockAccount(formData);
        setOpen(false);
        setImages([]);
        setPreviewImage(null);
        router.refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Account could not be saved.");
      }
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
                <Select
                  id="game_name"
                  name="game_name"
                  required
                  value={selectedGameName}
                  onChange={(event) => setSelectedGameName(event.currentTarget.value)}
                >
                  {availableGameCategories.map((game) => (
                    <option key={game} value={game}>
                      {game}
                    </option>
                  ))}
                </Select>
                {isAdmin && showAddGame ? (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={newGameName}
                        onChange={(event) => setNewGameName(event.currentTarget.value)}
                        placeholder="Enter new game name"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="words"
                        spellCheck={false}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addPersistentGameCategory();
                          }
                        }}
                      />
                      <Button type="button" variant="secondary" onClick={addPersistentGameCategory} disabled={addGamePending}>
                        {addGamePending ? "Adding..." : "Add"}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Admin only. This adds the game to settings so everyone can choose it.
                    </p>
                  </div>
                ) : isAdmin ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      className="text-left text-xs font-medium text-primary hover:underline"
                      onClick={() => setShowAddGame(true)}
                    >
                      Add new game
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Only admins can add new game names.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_title">Title</Label>
                <Input
                  id="account_title"
                  name="account_title"
                  required
                  placeholder="TH15 Semi Max"
                  defaultValue={stock?.account_title ?? ""}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                />
              </div>

              {canViewBuyingPrice ? (
                <div className="space-y-2">
                  <Label htmlFor="buying_price">Buying price</Label>
                  <Input id="buying_price" name="buying_price" type="number" min="0" step="0.01" inputMode="decimal" required placeholder="12000" defaultValue={stock?.buying_price ?? ""} autoComplete="off" />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling price</Label>
                <Input id="selling_price" name="selling_price" type="number" min="0" step="0.01" inputMode="decimal" required placeholder="16800" defaultValue={stock?.selling_price ?? ""} autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secret_code">Secret code</Label>
                <Input
                  id="secret_code"
                  name="secret_code"
                  required
                  placeholder="ml1202"
                  defaultValue={stock?.secret_code ?? ""}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_date">Purchase date</Label>
                <Input
                  id="purchase_date"
                  name="purchase_date"
                  type="date"
                  required
                  defaultValue={stock?.purchase_date ?? formatDateValue(new Date())}
                  autoComplete="off"
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
                <Select
                  id="assigned_employee_id"
                  name="assigned_employee_id"
                  defaultValue={stock?.assigned_employee_id ?? ""}
                  onChange={(event) => setAssignedEmployeeId(event.currentTarget.value)}
                >
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
                      <Button type="button" size="sm" variant="outline" onClick={downloadSelectedImages} disabled={imageDownloadPending}>
                        <Download className="h-4 w-4" />
                        {imageDownloadPending ? "Preparing..." : "Download all"}
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

              {canUsePrivateNotes ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notes">Private notes optional</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Private note. Admin and the assigned person can view this."
                    defaultValue={stock?.notes ?? ""}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              ) : null}

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
