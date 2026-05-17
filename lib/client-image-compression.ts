export type ImageCompressionOptions = {
  maxDimension?: number;
  quality?: number;
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Image compression failed."));
      },
      type,
      quality
    );
  });
}

export async function compressImageFile(
  file: File,
  { maxDimension = 1600, quality = 0.76 }: ImageCompressionOptions = {}
) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (blob.size >= file.size && scale === 1) return file;

  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
    {
      type: "image/jpeg",
      lastModified: Date.now()
    }
  );
}

export async function compressImageFiles(files: File[]) {
  return Promise.all(files.map((file) => compressImageFile(file)));
}
