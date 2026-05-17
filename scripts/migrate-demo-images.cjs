const { createHash, randomUUID } = require("crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");

const root = process.cwd();
const stores = [
  {
    file: ".demo-stock-accounts.json",
    folder: "stock",
    fields: ["image_url"],
    arrayFields: ["image_urls"]
  },
  {
    file: ".demo-daily-task-completions.json",
    folder: "tasks",
    fields: ["screenshot_url"],
    arrayFields: ["screenshot_urls"]
  }
];
const seen = new Map();

function parseDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  const match = value.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    extension: match[1].replace("jpeg", "jpg"),
    data: match[2]
  };
}

function migrateUrl(value, folder) {
  const parsed = parseDataUrl(value);
  if (!parsed) return value;

  const hash = createHash("sha1").update(parsed.data).digest("hex");
  const cacheKey = `${folder}:${hash}`;
  if (seen.has(cacheKey)) return seen.get(cacheKey);

  const year = new Date().getFullYear();
  const uploadDir = path.join(root, "public", "demo-uploads", folder, String(year));
  mkdirSync(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.${parsed.extension || "jpg"}`;
  const publicUrl = `/demo-uploads/${folder}/${year}/${filename}`;
  writeFileSync(path.join(uploadDir, filename), Buffer.from(parsed.data, "base64"));
  seen.set(cacheKey, publicUrl);
  return publicUrl;
}

for (const store of stores) {
  const storePath = path.join(root, store.file);
  if (!existsSync(storePath)) continue;

  const rows = JSON.parse(readFileSync(storePath, "utf8"));
  let changed = false;

  for (const row of rows) {
    for (const field of store.fields) {
      const next = migrateUrl(row[field], store.folder);
      if (next !== row[field]) {
        row[field] = next;
        changed = true;
      }
    }

    for (const field of store.arrayFields) {
      if (!Array.isArray(row[field])) continue;
      const nextArray = row[field].map((url) => migrateUrl(url, store.folder));
      if (nextArray.some((url, index) => url !== row[field][index])) {
        row[field] = nextArray;
        changed = true;
      }
    }
  }

  if (changed) {
    writeFileSync(storePath, JSON.stringify(rows, null, 2));
    console.log(`Migrated embedded images in ${store.file}`);
  } else {
    console.log(`No embedded images found in ${store.file}`);
  }
}
