import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = (process.env.KINGSROCK_BASE_URL || "").replace(/\/+$/, "");
const workerToken = process.env.ZEUSX_WORKER_TOKEN || "";
const batchLimit = Math.min(Math.max(Number(process.env.ZEUSX_BATCH_LIMIT || 3), 1), 20);
const workRoot = path.resolve(process.env.ZEUSX_WORK_DIR || ".zeusx-worker");
const posterScript = path.resolve(process.env.ZEUSX_POSTER_SCRIPT || "scripts/zeusx-poster.mjs");
const posterArgs = (process.env.ZEUSX_POSTER_ARGS || "--cdp").split(/\s+/).filter(Boolean);

function requireEnv() {
  const missing = [];
  if (!baseUrl) missing.push("KINGSROCK_BASE_URL");
  if (!workerToken) missing.push("ZEUSX_WORKER_TOKEN");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  if (!existsSync(posterScript)) {
    throw new Error(`ZeusX poster script was not found at ${posterScript}. Set ZEUSX_POSTER_SCRIPT.`);
  }
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${workerToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `KingsRock API failed with HTTP ${response.status}`);
  }
  return body;
}

async function updateStatus(id, status, extra = {}) {
  await api(`/api/zeusx/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...extra })
  });
}

function extensionFromResponse(url, response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";

  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).replace(".", "").toLowerCase();
  return ext || "jpg";
}

async function downloadImages(listing, imageFolder) {
  await mkdir(imageFolder, { recursive: true });

  for (const [index, url] of listing.imageUrls.entries()) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Image ${index + 1} download failed with HTTP ${response.status}`);
    }

    const extension = extensionFromResponse(url, response);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(imageFolder, `${String(index + 1).padStart(2, "0")}.${extension}`), buffer);
  }
}

function posterListing(listing, imageFolder) {
  return {
    enabled: true,
    category: listing.category,
    game: listing.game,
    title: listing.title,
    price: listing.price,
    server: listing.server,
    deliveryMethod: listing.deliveryMethod,
    deliveryDays: listing.deliveryDays,
    deliveryHours: listing.deliveryHours,
    description: listing.description,
    tags: listing.tags,
    imageFolder
  };
}

function runPoster(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [posterScript, ...posterArgs], {
      cwd,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ZeusX poster exited with code ${code ?? "unknown"}`));
    });
  });
}

async function postListing(listing) {
  const listingWorkDir = path.join(workRoot, listing.stockAccountId);
  const imageFolder = path.join(listingWorkDir, "images");

  await rm(listingWorkDir, { recursive: true, force: true });
  await mkdir(listingWorkDir, { recursive: true });
  await downloadImages(listing, imageFolder);
  await writeFile(
    path.join(listingWorkDir, "listings.json"),
    `${JSON.stringify([posterListing(listing, imageFolder)], null, 2)}\n`
  );

  await updateStatus(listing.stockAccountId, "posting");
  await runPoster(listingWorkDir);
  await updateStatus(listing.stockAccountId, "posted");
}

async function main() {
  requireEnv();
  await mkdir(workRoot, { recursive: true });

  const { listings = [] } = await api(`/api/zeusx/listings?limit=${batchLimit}`);
  if (!listings.length) {
    console.log("No pending ZeusX listings.");
    return;
  }

  for (const listing of listings) {
    console.log(`\nPosting ${listing.stockAccountId}: ${listing.title}`);
    try {
      await postListing(listing);
      console.log("Posted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed: ${message}`);
      await updateStatus(listing.stockAccountId, "failed", { error: message }).catch((statusError) => {
        console.error(`Could not save failed status: ${statusError instanceof Error ? statusError.message : statusError}`);
      });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
