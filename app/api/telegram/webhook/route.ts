import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { cleanSecretCode, cleanStockText, stripSecretCodeFromTitle } from "@/lib/stock-title";
import { createAdminClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TelegramMessage = {
  chat?: {
    id?: number | string;
  };
  caption?: string;
  document?: {
    file_id?: string;
    file_name?: string;
    mime_type?: string;
  };
  from?: {
    id?: number;
    first_name?: string;
    username?: string;
  };
  media_group_id?: string;
  photo?: Array<{
    file_id: string;
    file_size?: number;
    height: number;
    width: number;
  }>;
  reply_to_message?: TelegramMessage;
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

type SettingsRow = {
  id: string;
  game_categories: string[] | null;
  employee_permissions?: Record<string, unknown> | null;
};

type TelegramStockDraft = {
  id: string;
  accountTitle?: string;
  chatId: string;
  createdAt: string;
  gameName?: string;
  imageFileIds: string[];
  mediaGroupId?: string;
  note?: string;
  secretCode?: string | null;
  sellingPrice?: number;
  stage: "collecting" | "awaiting_buying_price";
  updatedAt: string;
  userId: string;
};

const DEFAULT_SETTINGS_PAYLOAD = {
  business_name: "Kings Rock",
  currency: "USD",
  game_categories: ["Mobile Legends", "Clash of Clans"],
  sale_source_websites: ["Facebook", "PlayerAuctions", "G2G", "Discord"],
  expense_categories: ["gmail_purchase", "ads", "website_fee", "employee_payment", "scam_account", "refund_account", "other"],
  employee_permissions: {
    can_view_profit: false,
    can_view_buying_price: false
  }
};
const TELEGRAM_IMAGE_MAX_DIMENSION = 1600;
const TELEGRAM_IMAGE_QUALITY = 76;

function jsonOk(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

function getAllowedUserIds() {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function parseGameCommand(text: string) {
  const match = text.match(/^\/addgame(?:@\w+)?\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function isHelpCommand(text: string) {
  return /^\/(start|help)(?:@\w+)?$/i.test(text);
}

function isGamesCommand(text: string) {
  return /^\/games(?:@\w+)?$/i.test(text);
}

function isCancelStockCommand(text: string) {
  return /^\/cancelstock(?:@\w+)?$/i.test(text);
}

function isDraftCommand(text: string) {
  return /^\/draft(?:@\w+)?$/i.test(text);
}

function normalizeGameName(value: string) {
  const gameName = cleanStockText(value);
  if (!gameName) return "";
  return gameName.slice(0, 80);
}

function uniqueCategories(categories: string[]) {
  return categories.filter(
    (category, index, allCategories) =>
      allCategories.findIndex((item) => item.trim().toLowerCase() === category.trim().toLowerCase()) === index
  );
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = botToken();
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });
  } catch {
    // Telegram retries webhook delivery; a reply failure should not repeat a database write.
  }
}

async function callTelegramApi<T>(method: string, body: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { ok?: boolean; result?: T; description?: string };

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description ?? `Telegram ${method} failed.`);
  }

  return payload.result;
}

async function getSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("id,game_categories,employee_permissions")
    .limit(1)
    .maybeSingle<SettingsRow>();

  if (error) throw new Error(error.message);
  return data;
}

function getDrafts(settings: SettingsRow | null) {
  const permissions = settings?.employee_permissions;
  const drafts = permissions?.telegram_stock_drafts;
  return drafts && typeof drafts === "object" && !Array.isArray(drafts)
    ? (drafts as Record<string, TelegramStockDraft>)
    : {};
}

function draftKey(chatId: number | string, userId: string) {
  return `${chatId}:${userId}`;
}

async function saveDraft(key: string, draft: TelegramStockDraft | null) {
  const supabase = createAdminClient();
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const permissions = {
    ...(settings.employee_permissions ?? {})
  };
  const drafts = {
    ...getDrafts(settings)
  };

  if (draft) {
    drafts[key] = draft;
  } else {
    delete drafts[key];
  }

  const nextPermissions = {
    ...permissions,
    telegram_stock_drafts: drafts
  };

  const { error } = await supabase
    .from("settings")
    .update({ employee_permissions: nextPermissions })
    .eq("id", settings.id);

  if (error) throw new Error(error.message);
}

async function getDraft(key: string) {
  return getDrafts(await getSettings())[key] ?? null;
}

async function addGameCategory(gameName: string) {
  const supabase = createAdminClient();
  const settings = await getSettings();

  if (!settings) {
    const seededCategories = uniqueCategories([...DEFAULT_SETTINGS_PAYLOAD.game_categories, gameName]);
    const { data, error } = await supabase
      .from("settings")
      .insert({
        ...DEFAULT_SETTINGS_PAYLOAD,
        game_categories: seededCategories
      })
      .select("game_categories")
      .single<{ game_categories: string[] | null }>();

    if (error) throw new Error(error.message);

    revalidatePath("/stock-accounts");
    revalidatePath("/settings");

    return {
      message: `${gameName} added for everyone.`,
      gameCategories: data.game_categories ?? seededCategories
    };
  }

  const existingCategories = Array.isArray(settings.game_categories) ? settings.game_categories : [];
  const alreadyExists = existingCategories.some(
    (category) => category.trim().toLowerCase() === gameName.toLowerCase()
  );

  if (alreadyExists) {
    return {
      message: `${gameName} already exists.`,
      gameCategories: existingCategories
    };
  }

  const nextCategories = [...existingCategories, gameName];
  const { data, error } = await supabase
    .from("settings")
    .update({ game_categories: nextCategories })
    .eq("id", settings.id)
    .select("game_categories")
    .single<{ game_categories: string[] | null }>();

  if (error) throw new Error(error.message);

  revalidatePath("/stock-accounts");
  revalidatePath("/settings");

  return {
    message: `${gameName} added for everyone.`,
    gameCategories: data.game_categories ?? nextCategories
  };
}

async function listGameCategories() {
  const settings = await getSettings();
  return Array.isArray(settings?.game_categories) ? settings.game_categories : [];
}

function messageText(message: TelegramMessage) {
  return (message.text ?? message.caption ?? "").trim();
}

function getImageFileIds(message: TelegramMessage) {
  const ids: string[] = [];
  const largestPhoto = message.photo?.length
    ? [...message.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]
    : null;

  if (largestPhoto?.file_id) ids.push(largestPhoto.file_id);
  if (message.document?.file_id && message.document.mime_type?.startsWith("image/")) {
    ids.push(message.document.file_id);
  }

  return ids;
}

function parseMoney(value: string) {
  const match = value
    .replace(/,/g, "")
    .trim()
    .match(/^(?:buying\s*)?(?:selling\s*)?(?:price\s*:?\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*\$?$/i);

  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseSellingPrice(value: string) {
  if (!/(?:\$|price|selling|sell)/i.test(value)) return null;
  return parseMoney(value);
}

function extractSecretCode(value: string) {
  const match = value.match(/^\s*([a-z]{2,8}\s*#\s*\d+)\b/i);
  if (!match) return null;

  const normalized = match[1]
    .replace(/\s*#\s*/, "# ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanSecretCode(normalized.replace(/^[a-z]+/i, (prefix) => prefix.toUpperCase()));
}

function inferGameName(secretCode: string | null | undefined, categories: string[]) {
  const prefix = secretCode?.match(/^([a-z]+)/i)?.[1]?.toUpperCase();
  if (!prefix) return categories[0] ?? "Mobile Legends";

  const aliases: Record<string, string> = {
    COC: "Clash of Clans",
    ML: "Mobile Legends",
    MLBB: "Mobile Legends"
  };
  const preferred = aliases[prefix] ?? prefix;

  return (
    categories.find((category) => category.trim().toLowerCase() === preferred.toLowerCase()) ??
    categories.find((category) => category.trim().toLowerCase().startsWith(prefix.toLowerCase())) ??
    preferred
  );
}

function parseAccountText(value: string, categories: string[]) {
  const cleaned = cleanStockText(value);
  const secretCode = extractSecretCode(cleaned);
  const accountTitle = secretCode ? stripSecretCodeFromTitle(cleaned, secretCode) : cleaned;

  return {
    accountTitle: accountTitle || cleaned,
    gameName: inferGameName(secretCode, categories),
    secretCode
  };
}

function normalizeStockIdentity(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function ensureGameCategory(gameName: string) {
  const categories = await listGameCategories();
  const existing = categories.find((category) => category.trim().toLowerCase() === gameName.trim().toLowerCase());
  if (existing) return existing;

  await addGameCategory(gameName);
  return gameName;
}

async function assertNoDuplicateStockAccount(secretCode: string | null | undefined, accountTitle: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .select("id,status,secret_code,account_title")
    .neq("status", "sold");

  if (error) throw new Error(error.message);

  const requestedCode = normalizeStockIdentity(secretCode);
  const requestedTitle = normalizeStockIdentity(accountTitle);
  const duplicate = data?.find((account) => {
    if (requestedCode && normalizeStockIdentity(account.secret_code) === requestedCode) return true;
    return normalizeStockIdentity(account.account_title) === requestedTitle;
  });

  if (!duplicate) return;

  const isCodeDuplicate = requestedCode && normalizeStockIdentity(duplicate.secret_code) === requestedCode;
  throw new Error(
    isCodeDuplicate
      ? "Duplicate stock account already exists with this secret code."
      : "Duplicate stock account already exists with this title."
  );
}

function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Dhaka",
    year: "numeric"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fileExtension(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
}

async function optimizeTelegramImage(buffer: Buffer) {
  try {
    const optimized = await sharp(buffer, { animated: false })
      .rotate()
      .resize({
        fit: "inside",
        height: TELEGRAM_IMAGE_MAX_DIMENSION,
        width: TELEGRAM_IMAGE_MAX_DIMENSION,
        withoutEnlargement: true
      })
      .flatten({ background: "#ffffff" })
      .jpeg({
        mozjpeg: true,
        quality: TELEGRAM_IMAGE_QUALITY
      })
      .toBuffer();

    return {
      buffer: optimized,
      contentType: "image/jpeg",
      extension: "jpg"
    };
  } catch {
    return null;
  }
}

async function uploadTelegramImages(fileIds: string[]) {
  const token = botToken();
  const supabase = createAdminClient();
  const urls: string[] = [];

  for (const fileId of fileIds.slice(0, 15)) {
    const file = await callTelegramApi<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file.file_path) throw new Error("Telegram did not return an image file path.");

    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!response.ok) throw new Error("Telegram image download failed.");

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const originalExtension = fileExtension(file.file_path);
    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const optimizedImage = contentType.startsWith("image/")
      ? await optimizeTelegramImage(originalBuffer)
      : null;
    const image = optimizedImage ?? {
      buffer: originalBuffer,
      contentType,
      extension: originalExtension
    };
    const storagePath = `telegram/${new Date().getFullYear()}/${randomUUID()}.${image.extension}`;

    const { error } = await supabase.storage
      .from("stock-images")
      .upload(storagePath, image.buffer, { contentType: image.contentType, upsert: false });

    if (error) throw new Error(`Image upload failed: ${error.message}`);

    const { data } = supabase.storage.from("stock-images").getPublicUrl(storagePath);
    urls.push(data.publicUrl);
  }

  return urls;
}

function draftSummary(draft: TelegramStockDraft) {
  return [
    draft.secretCode ? `Code: ${draft.secretCode}` : null,
    draft.accountTitle ? `Title: ${draft.accountTitle}` : null,
    draft.gameName ? `Game: ${draft.gameName}` : null,
    `Images: ${draft.imageFileIds.length}`,
    draft.note ? "Private note: saved" : "Private note: missing",
    typeof draft.sellingPrice === "number" ? `Selling price: $${draft.sellingPrice}` : "Selling price: missing"
  ]
    .filter(Boolean)
    .join("\n");
}

async function createStockAccountFromDraft(draft: TelegramStockDraft, buyingPrice: number) {
  if (!draft.accountTitle) throw new Error("Account title is missing.");
  if (!draft.imageFileIds.length) throw new Error("At least one account image is required.");
  if (typeof draft.sellingPrice !== "number") throw new Error("Selling price is missing.");

  const gameName = await ensureGameCategory(draft.gameName ?? inferGameName(draft.secretCode, await listGameCategories()));
  await assertNoDuplicateStockAccount(draft.secretCode, draft.accountTitle);

  const imageUrls = await uploadTelegramImages(draft.imageFileIds);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .insert({
      account_title: draft.accountTitle,
      buying_price: buyingPrice,
      game_name: gameName,
      image_url: imageUrls[0] ?? null,
      image_urls: imageUrls,
      notes: draft.note ? `Telegram private note:\n${draft.note}` : null,
      purchase_date: dhakaToday(),
      purchase_source: "Telegram",
      secret_code: draft.secretCode,
      selling_price: draft.sellingPrice,
      status: "available"
    })
    .select("id,secret_code,account_title")
    .single<{ id: string; secret_code: string | null; account_title: string }>();

  if (error) throw new Error(error.message);

  revalidatePath("/stock-accounts");
  revalidatePath(`/stock-accounts/${data.id}`);
  revalidatePath("/");

  return data;
}

async function handleStockDraftMessage(chatId: number | string, userId: string, message: TelegramMessage, text: string) {
  const key = draftKey(chatId, userId);
  const imageFileIds = getImageFileIds(message);
  const settingsCategories = await listGameCategories();
  const existingDraft = await getDraft(key);
  const now = new Date().toISOString();

  if (existingDraft?.stage === "awaiting_buying_price") {
    const buyingPrice = parseMoney(text);
    if (buyingPrice === null) {
      await sendTelegramMessage(chatId, "Please send only the buying price. Example: 8.50");
      return true;
    }

    try {
      const created = await createStockAccountFromDraft(existingDraft, buyingPrice);
      await saveDraft(key, null);
      await sendTelegramMessage(
        chatId,
        `Stock account added.\n${created.secret_code ? `Code: ${created.secret_code}\n` : ""}Title: ${created.account_title}\nBuying: $${buyingPrice}\nSelling: $${existingDraft.sellingPrice}`
      );
    } catch (error) {
      await sendTelegramMessage(
        chatId,
        error instanceof Error ? `Could not add stock account: ${error.message}` : "Could not add stock account."
      );
    }

    return true;
  }

  if (imageFileIds.length || (text && extractSecretCode(text))) {
    const parsed = text ? parseAccountText(text, settingsCategories) : null;
    const draft: TelegramStockDraft = {
      id: existingDraft?.id ?? randomUUID(),
      accountTitle: parsed?.accountTitle ?? existingDraft?.accountTitle,
      chatId: String(chatId),
      createdAt: existingDraft?.createdAt ?? now,
      gameName: parsed?.gameName ?? existingDraft?.gameName,
      imageFileIds: [...new Set([...(existingDraft?.imageFileIds ?? []), ...imageFileIds])].slice(0, 15),
      mediaGroupId: message.media_group_id ?? existingDraft?.mediaGroupId,
      note: existingDraft?.note,
      secretCode: parsed?.secretCode ?? existingDraft?.secretCode,
      sellingPrice: existingDraft?.sellingPrice,
      stage: "collecting",
      updatedAt: now,
      userId
    };

    await saveDraft(key, draft);
    await sendTelegramMessage(
      chatId,
      `Account draft saved.\n${draftSummary(draft)}\n\nNow send Gmail/password private note, then selling price.`
    );
    return true;
  }

  if (existingDraft) {
    const sellingPrice = parseSellingPrice(text);
    if (sellingPrice !== null) {
      const draft: TelegramStockDraft = {
        ...existingDraft,
        sellingPrice,
        stage: "awaiting_buying_price",
        updatedAt: now
      };
      await saveDraft(key, draft);
      await sendTelegramMessage(chatId, `Selling price saved: $${sellingPrice}\nNow send buying price.`);
      return true;
    }

    const note = [existingDraft.note, text]
      .filter(Boolean)
      .join("\n")
      .trim();
    const draft: TelegramStockDraft = {
      ...existingDraft,
      note,
      updatedAt: now
    };
    await saveDraft(key, draft);
    await sendTelegramMessage(chatId, `Private note saved.\n${draftSummary(draft)}\n\nNow send selling price.`);
    return true;
  }

  return false;
}

export async function GET() {
  return jsonOk({ service: "telegram-game-category-webhook" });
}

export async function POST(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ ok: false, message: "Unauthorized webhook request." }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return jsonOk();
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id ? String(message.from.id) : "";
  const text = message ? messageText(message) : "";

  if (!chatId || (!text && !getImageFileIds(message ?? {}).length)) return jsonOk();

  const allowedUserIds = getAllowedUserIds();
  if (!allowedUserIds.size || !allowedUserIds.has(userId)) {
    await sendTelegramMessage(chatId, "You are not allowed to add games to Kings Rock.");
    return jsonOk({ handled: true });
  }

  if (!hasSupabaseEnv() || !hasSupabaseAdminEnv()) {
    await sendTelegramMessage(chatId, "Kings Rock bot is missing Supabase server environment variables.");
    return jsonOk({ handled: true });
  }

  if (isHelpCommand(text)) {
    await sendTelegramMessage(
      chatId,
      "Kings Rock Telegram commands:\n/addgame Game Name\n/games\n\nTo add stock: send account images with title/caption, then Gmail/password note, then selling price. I will ask for buying price.\n\nOther commands:\n/draft\n/cancelstock"
    );
    return jsonOk({ handled: true });
  }

  if (isDraftCommand(text)) {
    const draft = await getDraft(draftKey(chatId, userId));
    await sendTelegramMessage(chatId, draft ? `Current draft:\n${draftSummary(draft)}` : "No stock draft is active.");
    return jsonOk({ handled: true });
  }

  if (isCancelStockCommand(text)) {
    await saveDraft(draftKey(chatId, userId), null);
    await sendTelegramMessage(chatId, "Stock draft cancelled.");
    return jsonOk({ handled: true });
  }

  if (isGamesCommand(text)) {
    const gameCategories = await listGameCategories();
    await sendTelegramMessage(
      chatId,
      gameCategories.length ? `Current games:\n${gameCategories.join("\n")}` : "No games found yet."
    );
    return jsonOk({ handled: true });
  }

  const gameName = normalizeGameName(parseGameCommand(text));
  if (gameName) {
    try {
      const result = await addGameCategory(gameName);
      await sendTelegramMessage(chatId, result.message);
      return jsonOk({ handled: true, gameCategories: result.gameCategories });
    } catch (error) {
      await sendTelegramMessage(
        chatId,
        error instanceof Error ? `Could not add game: ${error.message}` : "Could not add game."
      );
      return jsonOk({ handled: true });
    }
  }

  const handledStockDraft = await handleStockDraftMessage(chatId, userId, message, text);
  if (!handledStockDraft) {
    await sendTelegramMessage(
      chatId,
      "Send account images with title/caption, or use /addgame Game Name. Example account title: ML# 1632 collector Natalia EPIC..."
    );
    return jsonOk({ handled: true });
  }

  return jsonOk({ handled: true });
}
