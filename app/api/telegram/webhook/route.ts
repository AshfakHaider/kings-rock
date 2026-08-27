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
    title?: string;
    type?: "private" | "group" | "supergroup" | "channel" | string;
    username?: string;
  };
  caption?: string;
  document?: {
    file_id?: string;
    file_name?: string;
    mime_type?: string;
  };
  date?: number;
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
  message_id?: number;
  sticker?: {
    emoji?: string;
    file_id?: string;
  };
  text?: string;
};

type TelegramCallbackQuery = {
  data?: string;
  from?: {
    id?: number;
  };
  id: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  callback_query?: TelegramCallbackQuery;
  edited_message?: TelegramMessage;
  message?: TelegramMessage;
};

type SettingsRow = {
  id: string;
  game_categories: string[] | null;
  employee_permissions?: Record<string, unknown> | null;
};

type TelegramRuntimeKey =
  | "telegram_stock_drafts"
  | "telegram_group_stock_queue"
  | "telegram_group_queue_edits"
  | "telegram_group_stock_blocks";

type TelegramRuntimeRow = {
  key: TelegramRuntimeKey;
  data: Record<string, unknown> | null;
};

type TelegramStockDraft = {
  id: string;
  accountTitle?: string;
  chatId: string;
  createdAt: string;
  editingField?: "title" | "private_note" | "selling_price" | "buying_price" | null;
  gameName?: string;
  groupQueueItemId?: string;
  imageFileIds: string[];
  buyingPrice?: number;
  mediaGroupId?: string;
  note?: string;
  previewMessageId?: number;
  secretCode?: string | null;
  sellingPrice?: number;
  stage: "collecting" | "awaiting_buying_price" | "ready_for_approval";
  updatedAt: string;
  userId: string;
};

type TelegramSentMessage = {
  message_id?: number;
};

type TelegramGroupStockQueueItem = {
  accountTitle: string;
  buyingPrice?: number;
  createdAt: string;
  gameName: string;
  id: string;
  imageFileIds: string[];
  mediaGroupId?: string;
  note?: string;
  secretCode?: string | null;
  sellingPrice?: number;
  sourceChatId: string;
  sourceChatTitle?: string;
  sourceMessageId?: number;
  status: "pending";
  updatedAt: string;
};

type TelegramGroupQueueEditField = "title" | "private_note" | "selling_price" | "buying_price";

type TelegramGroupQueueEdit = {
  chatId: string;
  createdAt: string;
  field: TelegramGroupQueueEditField;
  itemId: string;
  userId: string;
};

type TelegramGroupStockBlock = {
  createdAt: string;
  imageFileIds: string[];
  sourceChatId: string;
  sourceChatTitle?: string;
  sourceMessageId?: number;
  texts: string[];
  updatedAt: string;
};

const DEFAULT_SETTINGS_PAYLOAD = {
  business_name: "Kings Rock",
  currency: "USD",
  game_categories: ["Mobile Legends", "Clash of Clans"],
  sale_source_websites: ["PlayerAuctions", "G2G", "FunPay", "Eldorado", "Igitems", "U7BUY"],
  expense_categories: ["gmail_purchase", "ads", "website_fee", "employee_payment", "scam_account", "refund_account", "other"],
  employee_permissions: {
    can_view_profit: false,
    can_view_buying_price: false
  }
};
const TELEGRAM_IMAGE_MAX_DIMENSION = 1600;
const TELEGRAM_IMAGE_QUALITY = 76;
const TELEGRAM_GROUP_CLOSE_DELAY_MS = 1500;
const TELEGRAM_RUNTIME_KEYS = [
  "telegram_stock_drafts",
  "telegram_group_stock_queue",
  "telegram_group_queue_edits",
  "telegram_group_stock_blocks"
] as const satisfies readonly TelegramRuntimeKey[];

function jsonOk(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isStartStockImportCommand(text: string) {
  return /^\/(addgame|addstock)(?:@\w+)?$/i.test(text);
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

function isReviewMissingCommand(text: string) {
  return /^\/(reviewmissing|missing|checkmissing)(?:@\w+)?$/i.test(text);
}

function isApproveAllMissingCommand(text: string) {
  return /^\/(approveallmissing|addallmissing)(?:@\w+)?$/i.test(text);
}

function isGroupChat(message: TelegramMessage) {
  const chatType = message.chat?.type;
  return chatType === "group" || chatType === "supergroup" || chatType === "channel";
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

async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {}
) {
  const token = botToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...extra
      })
    });
    const payload = (await response.json()) as { ok?: boolean; result?: TelegramSentMessage };
    return payload.ok ? payload.result ?? null : null;
  } catch {
    // Telegram retries webhook delivery; a reply failure should not repeat a database write.
    return null;
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

  if (!response.ok || !payload.ok || typeof payload.result === "undefined") {
    throw new Error(payload.description ?? `Telegram ${method} failed.`);
  }

  return payload.result;
}

async function editTelegramMessageText(chatId: number | string, messageId: number, text: string, extra: Record<string, unknown> = {}) {
  try {
    await callTelegramApi<TelegramSentMessage | boolean>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...extra
    });
    return true;
  } catch {
    return false;
  }
}

async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  try {
    await callTelegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: false } : {})
    });
  } catch {
    // Best effort only.
  }
}

async function setTelegramCommands() {
  try {
    await callTelegramApi<boolean>("setMyCommands", {
      commands: [
        { command: "start", description: "Show bot help" },
        { command: "addgame", description: "Start stock import or add a game name" },
        { command: "addstock", description: "Start a stock account draft" },
        { command: "games", description: "Show saved game names" },
        { command: "draft", description: "Show current stock draft" },
        { command: "reviewmissing", description: "Review missing accounts found in groups" },
        { command: "addallmissing", description: "Add complete missing accounts" },
        { command: "cancelstock", description: "Delete current stock draft" }
      ]
    });
  } catch {
    // Command menu setup should never block webhook handling.
  }
}

async function getSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("id,game_categories,employee_permissions")
    .limit(1)
    .maybeSingle<SettingsRow>();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    employee_permissions: await getTelegramRuntimePermissions(data.employee_permissions ?? {})
  };
}

async function getTelegramRuntimePermissions(legacyPermissions: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("telegram_runtime_state")
    .select("key,data")
    .in("key", [...TELEGRAM_RUNTIME_KEYS]);

  if (error) throw new Error(error.message);

  return Object.fromEntries(
    TELEGRAM_RUNTIME_KEYS.map((key) => {
      const runtimeRow = (data as TelegramRuntimeRow[] | null)?.find((row) => row.key === key);
      return [key, runtimeRow?.data ?? legacyPermissions[key] ?? {}];
    })
  );
}

function objectMap<T>(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

function getGroupQueue(settings: SettingsRow | null) {
  return objectMap<TelegramGroupStockQueueItem>(settings?.employee_permissions?.telegram_group_stock_queue);
}

function getDrafts(settings: SettingsRow | null) {
  return objectMap<TelegramStockDraft>(settings?.employee_permissions?.telegram_stock_drafts);
}

function getGroupQueueEdits(settings: SettingsRow | null) {
  return objectMap<TelegramGroupQueueEdit>(settings?.employee_permissions?.telegram_group_queue_edits);
}

function getGroupBlocks(settings: SettingsRow | null) {
  return objectMap<TelegramGroupStockBlock>(settings?.employee_permissions?.telegram_group_stock_blocks);
}

function compactGroupQueue(queue: Record<string, TelegramGroupStockQueueItem>) {
  return Object.fromEntries(
    Object.values(queue)
      .filter((item) => item.status === "pending")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 120)
      .map((item) => [item.id, item])
  );
}

async function saveTelegramRuntimeMap(key: TelegramRuntimeKey, data: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("telegram_runtime_state")
    .upsert(
      {
        key,
        data,
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    );

  if (error) throw new Error(error.message);
}

function draftKey(chatId: number | string, userId: string) {
  return `${chatId}:${userId}`;
}

function queueEditKey(chatId: number | string, userId: string) {
  return `${chatId}:${userId}`;
}

function groupBlockKey(chatId: number | string) {
  return String(chatId);
}

function mergeGroupBlock(existingBlock: TelegramGroupStockBlock, block: TelegramGroupStockBlock): TelegramGroupStockBlock {
  return {
    ...existingBlock,
    ...block,
    createdAt: existingBlock.createdAt,
    imageFileIds: [...new Set([...existingBlock.imageFileIds, ...block.imageFileIds])].slice(0, 15),
    texts: [...new Set([...existingBlock.texts, ...block.texts])],
    updatedAt: block.updatedAt
  };
}

function blockContainsFragment(block: TelegramGroupStockBlock | undefined, fragment: TelegramGroupStockBlock) {
  if (!block) return false;

  return (
    fragment.imageFileIds.every((fileId) => block.imageFileIds.includes(fileId)) &&
    fragment.texts.every((text) => block.texts.includes(text))
  );
}

function isGroupStockFragment(text: string, imageFileIds: string[]) {
  if (imageFileIds.length) return true;
  if (!text || text.startsWith("/")) return false;
  return Boolean(extractSecretCode(text) || looksLikePrivateNote(text) || parseMoney(text) !== null);
}

function isEmptyShellGroupQueueItem(item: TelegramGroupStockQueueItem) {
  return (
    Boolean(item.accountTitle) &&
    !item.imageFileIds.length &&
    !item.note &&
    typeof item.sellingPrice !== "number" &&
    typeof item.buyingPrice !== "number"
  );
}

async function saveDraft(key: string, draft: TelegramStockDraft | null) {
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const drafts = {
    ...getDrafts(settings)
  };

  if (draft) {
    drafts[key] = draft;
  } else {
    delete drafts[key];
  }

  await saveTelegramRuntimeMap("telegram_stock_drafts", drafts);
}

async function getDraft(key: string) {
  return getDrafts(await getSettings())[key] ?? null;
}

async function saveGroupQueueItem(item: TelegramGroupStockQueueItem | null) {
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const queue = {
    ...getGroupQueue(settings)
  };

  if (item) {
    queue[item.id] = item;
  }

  await saveTelegramRuntimeMap("telegram_group_stock_queue", item ? compactGroupQueue(queue) : queue);
}

async function deleteGroupQueueItem(itemId: string) {
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const queue = {
    ...getGroupQueue(settings)
  };
  delete queue[itemId];

  await saveTelegramRuntimeMap("telegram_group_stock_queue", queue);
}

async function saveGroupQueueEdit(key: string, edit: TelegramGroupQueueEdit | null) {
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const edits = {
    ...getGroupQueueEdits(settings)
  };

  if (edit) {
    edits[key] = edit;
  } else {
    delete edits[key];
  }

  await saveTelegramRuntimeMap("telegram_group_queue_edits", edits);
}

async function getGroupQueueEdit(key: string) {
  return getGroupQueueEdits(await getSettings())[key] ?? null;
}

async function saveGroupBlock(key: string, block: TelegramGroupStockBlock | null, mode: "replace" | "merge" = "replace") {
  const settings = await getSettings();

  if (!settings) {
    throw new Error("Settings row was not found. Add settings first from the app.");
  }

  const blocks = {
    ...getGroupBlocks(settings)
  };

  if (block) {
    const existingBlock = mode === "merge" ? blocks[key] : null;
    blocks[key] = existingBlock ? mergeGroupBlock(existingBlock, block) : block;
  } else {
    delete blocks[key];
  }

  await saveTelegramRuntimeMap("telegram_group_stock_blocks", blocks);
}

async function appendGroupBlockFragment(key: string, fragment: TelegramGroupStockBlock) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await saveGroupBlock(key, fragment, "merge");
    await sleep(120 * (attempt + 1));

    const latestBlock = getGroupBlocks(await getSettings())[key];
    if (blockContainsFragment(latestBlock, fragment)) return;
  }
}

function shouldQueueParsedGroupBlock(parsedBlock: ReturnType<typeof parseGroupBlock>) {
  if (!parsedBlock.accountTitle && !parsedBlock.imageFileIds.length && !parsedBlock.note && typeof parsedBlock.sellingPrice !== "number") {
    return false;
  }

  return !(
    parsedBlock.accountTitle &&
    !parsedBlock.imageFileIds.length &&
    !parsedBlock.note &&
    typeof parsedBlock.sellingPrice !== "number"
  );
}

async function queueGroupBlock(block: TelegramGroupStockBlock, notify = true) {
  const settings = await getSettings();
  const queue = getGroupQueue(settings);
  const settingsCategories = Array.isArray(settings?.game_categories) ? settings.game_categories : [];
  const parsedBlock = parseGroupBlock(block, settingsCategories);
  const now = new Date().toISOString();

  if (!shouldQueueParsedGroupBlock(parsedBlock)) return false;

  const duplicateStock = parsedBlock.accountTitle
    ? await isDuplicateStockAccount(parsedBlock.secretCode, parsedBlock.accountTitle)
    : false;

  if (duplicateStock) return true;

  const duplicateQueueItem = parsedBlock.accountTitle
    ? findGroupQueueDuplicate(
        queue,
        block.sourceChatId,
        undefined,
        parsedBlock.secretCode,
        parsedBlock.accountTitle
      )
    : null;

  const item: TelegramGroupStockQueueItem = {
    accountTitle: parsedBlock.accountTitle,
    buyingPrice: 0,
    createdAt: duplicateQueueItem?.createdAt ?? block.createdAt,
    gameName: parsedBlock.gameName,
    id: duplicateQueueItem?.id ?? randomUUID(),
    imageFileIds: [...new Set([...(duplicateQueueItem?.imageFileIds ?? []), ...parsedBlock.imageFileIds])].slice(0, 15),
    note: parsedBlock.note ?? duplicateQueueItem?.note,
    secretCode: parsedBlock.secretCode,
    sellingPrice: parsedBlock.sellingPrice ?? duplicateQueueItem?.sellingPrice,
    sourceChatId: block.sourceChatId,
    sourceChatTitle: block.sourceChatTitle,
    sourceMessageId: block.sourceMessageId,
    status: "pending",
    updatedAt: now
  };

  if (missingGroupQueueFields(item).length === 0) {
    try {
      const created = await createStockAccountFromGroupQueueItem(item, String(block.sourceChatId), "group-auto");
      if (duplicateQueueItem) {
        await deleteGroupQueueItem(duplicateQueueItem.id);
      }
      await notifyAllowedUsersStockAdded(created, item.sellingPrice, item.sourceChatTitle);
      return true;
    } catch (error) {
      await saveGroupQueueItem(item);
      if (notify && !duplicateQueueItem) {
        await Promise.all(
          [...getAllowedUserIds()].map((allowedUserId) =>
            sendTelegramMessage(
              allowedUserId,
              error instanceof Error ? `Could not auto-add stock account: ${error.message}` : "Could not auto-add stock account."
            )
          )
        );
      }
      return true;
    }
  }

  await saveGroupQueueItem(item);
  if (notify && !duplicateQueueItem) {
    await notifyAllowedUsersAboutGroupItem(item);
  }

  return true;
}

async function flushOpenGroupBlocks(notify = false) {
  await sleep(TELEGRAM_GROUP_CLOSE_DELAY_MS);
  const settings = await getSettings();
  const blocks = getGroupBlocks(settings);

  for (const [key, block] of Object.entries(blocks)) {
    if (!block.texts.length && !block.imageFileIds.length) continue;

    const queued = await queueGroupBlock(block, notify);
    if (queued) {
      await saveGroupBlock(key, null);
    }
  }
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

function largestTelegramPhoto(message: TelegramMessage) {
  return message.photo?.length
    ? [...message.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]
    : null;
}

function isCheckmarkSeparator(message: TelegramMessage, text: string) {
  const normalizedText = text.replace(/\ufe0f/g, "").replace(/\s+/g, "");
  const normalizedStickerEmoji = (message.sticker?.emoji ?? "").replace(/\ufe0f/g, "").replace(/\s+/g, "");
  const stickerOnlyMessage =
    Boolean(message.sticker?.file_id) && !text && !message.photo?.length && !message.document?.file_id;
  const photo = largestTelegramPhoto(message);
  const squareSmallPhotoOnly =
    Boolean(photo) &&
    !text &&
    !message.document?.file_id &&
    !message.sticker?.file_id &&
    photo!.width >= 80 &&
    photo!.height >= 80 &&
    photo!.width <= 640 &&
    photo!.height <= 640 &&
    photo!.width / photo!.height > 0.75 &&
    photo!.width / photo!.height < 1.33;

  return (
    /^(?:✅|✔|☑)+$/.test(normalizedText) ||
    /^(?:✅|✔|☑)+$/.test(normalizedStickerEmoji) ||
    stickerOnlyMessage ||
    squareSmallPhotoOnly
  );
}

function getImageFileIds(message: TelegramMessage) {
  const ids: string[] = [];
  const largestPhoto = largestTelegramPhoto(message);

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

function parseSellingPriceFromAccountText(value: string) {
  const explicit = value
    .replace(/,/g, "")
    .match(/(?:selling|sell|price)\s*:?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*\$?/i);
  if (explicit) {
    const amount = Number(explicit[1]);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  const dollarAmount = value
    .replace(/,/g, "")
    .match(/(?:^|\s)(?:\$+\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*\$+)(?:\s|$)/i);
  const amountText = dollarAmount?.[1] ?? dollarAmount?.[2];
  if (!amountText) return null;

  const amount = Number(amountText);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function stripInlinePriceText(value: string) {
  return value
    .replace(/(?:selling|sell|price)\s*:?\s*\$?\s*\d+(?:\.\d{1,2})?\s*\$?/gi, "")
    .replace(/(?:^|\s)(?:\$+\s*\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s*\$+)(?=\s|$)/gi, " ")
    .trim();
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
  const cleaned = cleanStockText(stripInlinePriceText(value));
  const secretCode = extractSecretCode(cleaned);
  const accountTitle = secretCode ? stripSecretCodeFromTitle(cleaned, secretCode) : cleaned;

  return {
    accountTitle: accountTitle || cleaned,
    gameName: inferGameName(secretCode, categories),
    secretCode
  };
}

function looksLikePrivateNote(value: string) {
  return /@|\)\(|gmail|outlook|hotmail|yahoo|password|pass|login/i.test(value);
}

function parseGroupBlock(block: TelegramGroupStockBlock, categories: string[]) {
  let accountTitle = "";
  let gameName = "";
  let note = "";
  let secretCode: string | null = null;
  let sellingPrice: number | undefined;

  for (const rawText of block.texts) {
    const text = cleanStockText(rawText);
    if (!text) continue;

    const inlineSellingPrice = parseSellingPriceFromAccountText(text);
    const standaloneMoney = parseMoney(text);
    if (typeof sellingPrice !== "number" && (inlineSellingPrice !== null || standaloneMoney !== null)) {
      sellingPrice = inlineSellingPrice ?? standaloneMoney ?? undefined;
    }

    if (extractSecretCode(text)) {
      const parsed = parseAccountText(text, categories);
      accountTitle = parsed.accountTitle;
      gameName = parsed.gameName;
      secretCode = parsed.secretCode;
      continue;
    }

    if (looksLikePrivateNote(text)) {
      note = [note, text].filter(Boolean).join("\n");
    }
  }

  return {
    accountTitle,
    gameName: gameName || inferGameName(secretCode, categories),
    imageFileIds: [...new Set(block.imageFileIds)].slice(0, 15),
    note: note || undefined,
    secretCode,
    sellingPrice
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

  const duplicate = findDuplicateStockAccount(data ?? [], secretCode, accountTitle);
  if (!duplicate) return;

  const requestedCode = normalizeStockIdentity(secretCode);
  const isCodeDuplicate = requestedCode && normalizeStockIdentity(duplicate.secret_code) === requestedCode;
  throw new Error(
    isCodeDuplicate
      ? "Duplicate stock account already exists with this secret code."
      : "Duplicate stock account already exists with this title."
  );
}

function findDuplicateStockAccount(
  accounts: Array<{ account_title: string | null; id: string; secret_code: string | null; status?: string | null }>,
  secretCode: string | null | undefined,
  accountTitle: string
) {
  const requestedCode = normalizeStockIdentity(secretCode);
  const requestedTitle = normalizeStockIdentity(accountTitle);
  return accounts.find((account) => {
    if (requestedCode && normalizeStockIdentity(account.secret_code) === requestedCode) return true;
    return normalizeStockIdentity(account.account_title) === requestedTitle;
  });
}

async function isDuplicateStockAccount(secretCode: string | null | undefined, accountTitle: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .select("id,status,secret_code,account_title")
    .neq("status", "sold");

  if (error) throw new Error(error.message);
  return Boolean(findDuplicateStockAccount(data ?? [], secretCode, accountTitle));
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
  const paths: string[] = [];

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

    paths.push(storagePath);
  }

  return paths;
}

function nextDraftStage(draft: TelegramStockDraft): TelegramStockDraft["stage"] {
  return missingApprovalFields(draft).length ? "collecting" : "ready_for_approval";
}

function missingApprovalFields(draft: TelegramStockDraft) {
  const missing: string[] = [];
  if (!draft.accountTitle) missing.push("title");
  if (!draft.imageFileIds.length) missing.push("image");
  if (!draft.note) missing.push("private note");
  return missing;
}

function nextDraftInstruction(draft: TelegramStockDraft) {
  const missing = missingApprovalFields(draft);
  const nextMissing = missing[0];

  if (!nextMissing) return "Ready. I will add this account automatically.";
  if (nextMissing === "title") return "Next: forward or send the account title with code, like ML# 1632 ...";
  if (nextMissing === "image") return "Next: forward or upload at least one account image.";
  if (nextMissing === "private note") return "Next: send Gmail/password private note.";
  return "Next: send the missing detail.";
}

function draftPreviewText(draft: TelegramStockDraft) {
  const missing = missingApprovalFields(draft);
  return [
    "Stock account preview",
    "",
    draft.secretCode ? `Code: ${draft.secretCode}` : "Code: missing",
    `Game: ${draft.gameName ?? "missing"}`,
    `Title: ${draft.accountTitle ?? "missing"}`,
    `Images: ${draft.imageFileIds.length}/15`,
    draft.note ? "Private note: saved" : "Private note: missing",
    typeof draft.sellingPrice === "number" ? `Selling price: $${draft.sellingPrice}` : "Selling price: not set",
    "Buying price: $0",
    "",
    missing.length ? `Missing: ${missing.join(", ")}` : null,
    nextDraftInstruction(draft)
  ].join("\n");
}

function draftPreviewMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "Edit", callback_data: "stock:edit" },
        { text: "Delete", callback_data: "stock:delete" }
      ]
    ]
  };
}

function draftIncompleteMarkup() {
  return {
    inline_keyboard: [
      [{ text: "Delete draft", callback_data: "stock:delete" }]
    ]
  };
}

function draftEditMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "Title", callback_data: "stock:edit:title" },
        { text: "Selling price", callback_data: "stock:edit:selling_price" }
      ],
      [
        { text: "Private note", callback_data: "stock:edit:private_note" }
      ],
      [
        { text: "Back", callback_data: "stock:edit:back" },
        { text: "Delete", callback_data: "stock:delete" }
      ]
    ]
  };
}

function groupQueueItemText(item: TelegramGroupStockQueueItem, index?: number, total?: number) {
  const missing = missingGroupQueueFields(item);
  return [
    typeof index === "number" && typeof total === "number" ? `Missing group account ${index + 1}/${total}` : "Missing group account",
    "",
    item.secretCode ? `Code: ${item.secretCode}` : "Code: missing",
    `Game: ${item.gameName}`,
    `Title: ${item.accountTitle}`,
    `Images: ${item.imageFileIds.length}/15`,
    item.note ? "Private note: saved" : "Private note: missing",
    typeof item.sellingPrice === "number" ? `Selling price: $${item.sellingPrice}` : "Selling price: not set",
    "Buying price: $0",
    item.sourceChatTitle ? `Source: ${item.sourceChatTitle}` : null,
    "",
    missing.length
      ? `Missing: ${missing.join(", ")}`
      : "Ready. I will add this account automatically."
  ]
    .filter(Boolean)
    .join("\n");
}

function missingGroupQueueFields(item: TelegramGroupStockQueueItem) {
  const missing: string[] = [];
  if (!item.accountTitle) missing.push("title");
  if (!item.imageFileIds.length) missing.push("image");
  if (!item.note) missing.push("private note");
  return missing;
}

function groupQueueMarkup(item: TelegramGroupStockQueueItem, completeCount = 0) {
  const itemId = item.id;
  const isComplete = missingGroupQueueFields(item).length === 0;
  const firstRow = isComplete
    ? [
        { text: "Add now", callback_data: `group:approve:${itemId}` },
        { text: "Edit", callback_data: `group:editmenu:${itemId}` },
        { text: "Skip", callback_data: `group:skip:${itemId}` }
      ]
    : [
        { text: "Private note", callback_data: `group:edit:private_note:${itemId}` }
      ];
  const rows = [
    firstRow,
    [
      { text: "Selling price", callback_data: `group:edit:selling_price:${itemId}` },
      { text: "Title", callback_data: `group:edit:title:${itemId}` }
    ],
    [
      { text: "Use draft", callback_data: `group:review:${itemId}` },
      { text: "Skip", callback_data: `group:skip:${itemId}` }
    ]
  ];

  if (completeCount > 0) {
    rows.push([{ text: `Add complete (${completeCount})`, callback_data: "group:bulk" }]);
  }

  return {
    inline_keyboard: rows
  };
}

async function sendOrUpdateDraftPreview(chatId: number | string, draft: TelegramStockDraft) {
  const text = draftPreviewText(draft);
  const extra = { reply_markup: missingApprovalFields(draft).length ? draftIncompleteMarkup() : draftPreviewMarkup() };

  if (draft.previewMessageId) {
    const edited = await editTelegramMessageText(chatId, draft.previewMessageId, text, extra);
    if (edited) return draft;
  }

  const sent = await sendTelegramMessage(chatId, text, extra);
  return sent?.message_id ? { ...draft, previewMessageId: sent.message_id } : draft;
}

async function saveOrAutoAddDraft(chatId: number | string, key: string, draft: TelegramStockDraft) {
  const readyDraft: TelegramStockDraft = {
    ...draft,
    buyingPrice: 0,
    stage: nextDraftStage({ ...draft, buyingPrice: 0 }),
    updatedAt: new Date().toISOString()
  };

  if (missingApprovalFields(readyDraft).length) {
    const previewDraft = await sendOrUpdateDraftPreview(chatId, readyDraft);
    await saveDraft(key, previewDraft);
    return true;
  }

  try {
    const created = await createStockAccountFromDraft(readyDraft, 0);
    await saveDraft(key, null);
    if (readyDraft.groupQueueItemId) {
      await deleteGroupQueueItem(readyDraft.groupQueueItemId);
    }

    const successMessage = stockAddedMessage(created, readyDraft.sellingPrice);
    if (readyDraft.previewMessageId) {
      const edited = await editTelegramMessageText(chatId, readyDraft.previewMessageId, successMessage);
      if (!edited) await sendTelegramMessage(chatId, successMessage);
    } else {
      await sendTelegramMessage(chatId, successMessage);
    }

    return true;
  } catch (error) {
    const previewDraft = await sendOrUpdateDraftPreview(chatId, readyDraft);
    await saveDraft(key, previewDraft);
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? `Could not add stock account: ${error.message}` : "Could not add stock account."
    );
    return true;
  }
}

async function pendingGroupQueueItems() {
  const queue = getGroupQueue(await getSettings());
  return Object.values(queue)
    .filter((item) => !isEmptyShellGroupQueueItem(item))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function sendNextGroupQueueItem(chatId: number | string) {
  const items = await pendingGroupQueueItems();

  if (!items.length) {
    await sendTelegramMessage(chatId, "No missing group accounts are waiting for review.");
    return;
  }

  const item = items[0];
  const completeCount = items.filter((queueItem) => missingGroupQueueFields(queueItem).length === 0).length;
  await sendTelegramMessage(chatId, groupQueueItemText(item, 0, items.length), {
    reply_markup: groupQueueMarkup(item, completeCount)
  });
}

async function notifyAllowedUsersAboutGroupItem(item: TelegramGroupStockQueueItem) {
  const allowedUserIds = [...getAllowedUserIds()];

  await Promise.all(
    allowedUserIds.map((allowedUserId) =>
      sendTelegramMessage(allowedUserId, groupQueueItemText(item), {
        reply_markup: groupQueueMarkup(item)
      })
    )
  );
}

function stockAddedMessage(
  created: { account_title: string; secret_code: string | null },
  sellingPrice: number | undefined,
  sourceChatTitle?: string
) {
  return [
    "Stock account added.",
    created.secret_code ? `Code: ${created.secret_code}` : null,
    `Title: ${created.account_title}`,
    "Buying: $0",
    typeof sellingPrice === "number" ? `Selling: $${sellingPrice}` : "Selling: not set",
    sourceChatTitle ? `Source: ${sourceChatTitle}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyAllowedUsersStockAdded(
  created: { account_title: string; secret_code: string | null },
  sellingPrice: number | undefined,
  sourceChatTitle?: string
) {
  const allowedUserIds = [...getAllowedUserIds()];
  const message = stockAddedMessage(created, sellingPrice, sourceChatTitle);

  await Promise.all(allowedUserIds.map((allowedUserId) => sendTelegramMessage(allowedUserId, message)));
}

async function createStockAccountFromDraft(draft: TelegramStockDraft, buyingPrice = 0) {
  if (!draft.accountTitle) throw new Error("Account title is missing.");
  if (!draft.imageFileIds.length) throw new Error("At least one account image is required.");

  const gameName = await ensureGameCategory(draft.gameName ?? inferGameName(draft.secretCode, await listGameCategories()));
  await assertNoDuplicateStockAccount(draft.secretCode, draft.accountTitle);

  const imagePaths = await uploadTelegramImages(draft.imageFileIds);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_accounts")
    .insert({
      account_title: draft.accountTitle,
      buying_price: buyingPrice,
      game_name: gameName,
      image_url: null,
      image_urls: [],
      image_path: imagePaths[0] ?? null,
      image_paths: imagePaths,
      notes: draft.note ?? null,
      purchase_date: dhakaToday(),
      purchase_source: "Telegram",
      secret_code: draft.secretCode,
      selling_price: draft.sellingPrice ?? null,
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

async function createStockAccountFromGroupQueueItem(item: TelegramGroupStockQueueItem, chatId: number | string, userId: string) {
  const missing = missingGroupQueueFields(item);
  if (missing.length) {
    throw new Error(`Missing: ${missing.join(", ")}`);
  }

  const draft: TelegramStockDraft = {
    accountTitle: item.accountTitle,
    buyingPrice: 0,
    chatId: String(chatId),
    createdAt: item.createdAt,
    gameName: item.gameName,
    groupQueueItemId: item.id,
    id: randomUUID(),
    imageFileIds: item.imageFileIds,
    mediaGroupId: item.mediaGroupId,
    note: item.note,
    secretCode: item.secretCode,
    sellingPrice: item.sellingPrice,
    stage: "ready_for_approval",
    updatedAt: new Date().toISOString(),
    userId
  };

  return createStockAccountFromDraft(draft, 0);
}

async function approveCompleteGroupQueueItems(chatId: number | string, userId: string, limit = 5) {
  const items = (await pendingGroupQueueItems()).filter((item) => missingGroupQueueFields(item).length === 0);
  const selectedItems = items.slice(0, limit);
  const failures: string[] = [];
  let added = 0;

  for (const item of selectedItems) {
    try {
      await createStockAccountFromGroupQueueItem(item, chatId, userId);
      await deleteGroupQueueItem(item.id);
      added += 1;
    } catch (error) {
      failures.push(
        `${item.secretCode ?? item.accountTitle}: ${
          error instanceof Error ? error.message : "could not add"
        }`
      );
    }
  }

  const remainingComplete = Math.max(0, items.length - selectedItems.length);
  return { added, failures, remainingComplete };
}

function findGroupQueueDuplicate(
  queue: Record<string, TelegramGroupStockQueueItem>,
  sourceChatId: number | string | undefined,
  mediaGroupId: string | undefined,
  secretCode: string | null | undefined,
  accountTitle: string
) {
  const requestedCode = normalizeStockIdentity(secretCode);
  const requestedTitle = normalizeStockIdentity(accountTitle);
  const source = sourceChatId ? String(sourceChatId) : "";

  return Object.values(queue).find((item) => {
    if (source && mediaGroupId && item.sourceChatId === source && item.mediaGroupId === mediaGroupId) return true;
    if (requestedCode && normalizeStockIdentity(item.secretCode) === requestedCode) return true;
    return normalizeStockIdentity(item.accountTitle) === requestedTitle;
  });
}

async function handleGroupStockMessage(message: TelegramMessage, text: string) {
  if (!isGroupChat(message)) return false;

  const imageFileIds = getImageFileIds(message);
  const settings = await getSettings();
  const queue = getGroupQueue(settings);
  const now = new Date().toISOString();
  const sourceChatId = message.chat?.id;
  const mediaGroupId = message.media_group_id;

  if (!sourceChatId) return false;

  const blockKey = groupBlockKey(sourceChatId);
  const existingBlock = getGroupBlocks(settings)[blockKey];

  if (isCheckmarkSeparator(message, text)) {
    if (existingBlock && (existingBlock.texts.length || existingBlock.imageFileIds.length)) {
      await sleep(TELEGRAM_GROUP_CLOSE_DELAY_MS);
      const latestBlock = getGroupBlocks(await getSettings())[blockKey] ?? existingBlock;
      const queued = await queueGroupBlock(latestBlock);
      if (queued) {
        await saveGroupBlock(blockKey, null);
      }
    }

    await saveGroupBlock(blockKey, {
      createdAt: now,
      imageFileIds: [],
      sourceChatId: String(sourceChatId),
      sourceChatTitle: message.chat?.title ?? message.chat?.username,
      sourceMessageId: message.message_id,
      texts: [],
      updatedAt: now
    });
    return true;
  }

  if (existingBlock) {
    await appendGroupBlockFragment(blockKey, {
      ...existingBlock,
      imageFileIds,
      sourceMessageId: existingBlock.sourceMessageId ?? message.message_id,
      texts: text ? [text] : [],
      updatedAt: now
    });
    return true;
  }

  if (isGroupStockFragment(text, imageFileIds)) {
    await appendGroupBlockFragment(blockKey, {
      createdAt: now,
      imageFileIds,
      sourceChatId: String(sourceChatId),
      sourceChatTitle: message.chat?.title ?? message.chat?.username,
      sourceMessageId: message.message_id,
      texts: text ? [text] : [],
      updatedAt: now
    });
    return true;
  }

  if (!text && imageFileIds.length && mediaGroupId) {
    const existingItem = Object.values(queue).find(
      (item) => item.sourceChatId === String(sourceChatId) && item.mediaGroupId === mediaGroupId
    );

    if (!existingItem) return false;

    await saveGroupQueueItem({
      ...existingItem,
      imageFileIds: [...new Set([...existingItem.imageFileIds, ...imageFileIds])].slice(0, 15),
      updatedAt: now
    });
    return true;
  }

  const secretCode = text ? extractSecretCode(text) : null;
  if (!secretCode) return false;

  const settingsCategories = Array.isArray(settings?.game_categories) ? settings.game_categories : [];
  const parsed = parseAccountText(text, settingsCategories);
  const duplicateStock = await isDuplicateStockAccount(parsed.secretCode, parsed.accountTitle);
  if (duplicateStock) return true;

  const duplicateQueueItem = findGroupQueueDuplicate(
    queue,
    sourceChatId,
    mediaGroupId,
    parsed.secretCode,
    parsed.accountTitle
  );
  const sellingPrice = parseSellingPriceFromAccountText(text);
  const item: TelegramGroupStockQueueItem = {
    accountTitle: parsed.accountTitle,
    buyingPrice: 0,
    createdAt: duplicateQueueItem?.createdAt ?? now,
    gameName: parsed.gameName,
    id: duplicateQueueItem?.id ?? randomUUID(),
    imageFileIds: [...new Set([...(duplicateQueueItem?.imageFileIds ?? []), ...imageFileIds])].slice(0, 15),
    mediaGroupId,
    secretCode: parsed.secretCode,
    sellingPrice: sellingPrice ?? duplicateQueueItem?.sellingPrice,
    sourceChatId: String(sourceChatId),
    sourceChatTitle: message.chat?.title ?? message.chat?.username,
    sourceMessageId: message.message_id,
    status: "pending",
    updatedAt: now
  };

  if (missingGroupQueueFields(item).length === 0) {
    try {
      const created = await createStockAccountFromGroupQueueItem(item, String(sourceChatId), "group-auto");
      if (duplicateQueueItem) {
        await deleteGroupQueueItem(duplicateQueueItem.id);
      }
      await notifyAllowedUsersStockAdded(created, item.sellingPrice, item.sourceChatTitle);
      return true;
    } catch (error) {
      await saveGroupQueueItem(item);
      if (!duplicateQueueItem) {
        await Promise.all(
          [...getAllowedUserIds()].map((allowedUserId) =>
            sendTelegramMessage(
              allowedUserId,
              error instanceof Error ? `Could not auto-add stock account: ${error.message}` : "Could not auto-add stock account."
            )
          )
        );
      }
      return true;
    }
  }

  await saveGroupQueueItem(item);

  if (!duplicateQueueItem) {
    await notifyAllowedUsersAboutGroupItem(item);
  }

  return true;
}

async function applyDraftEdit(chatId: number | string, key: string, draft: TelegramStockDraft, text: string, settingsCategories: string[]) {
  const now = new Date().toISOString();
  let nextDraft: TelegramStockDraft | null = null;

  if (draft.editingField === "title") {
    const parsed = parseAccountText(text, settingsCategories);
    nextDraft = {
      ...draft,
      accountTitle: parsed.accountTitle,
      editingField: null,
      gameName: parsed.gameName,
      secretCode: parsed.secretCode,
      updatedAt: now
    };
  }

  if (draft.editingField === "private_note") {
    const note = text.trim();
    if (!note) {
      await sendTelegramMessage(chatId, "Please send the Gmail/password private note.");
      return true;
    }

    nextDraft = {
      ...draft,
      editingField: null,
      note,
      updatedAt: now
    };
  }

  if (draft.editingField === "selling_price") {
    const sellingPrice = parseMoney(text);
    if (sellingPrice === null) {
      await sendTelegramMessage(chatId, "Please send a valid selling price, like 15$ or $15.");
      return true;
    }

    nextDraft = {
      ...draft,
      editingField: null,
      sellingPrice,
      updatedAt: now
    };
  }

  if (draft.editingField === "buying_price") {
    const buyingPrice = parseMoney(text);
    if (buyingPrice === null) {
      await sendTelegramMessage(chatId, "Please send a valid buying price, like 10 or $10.");
      return true;
    }

    nextDraft = {
      ...draft,
      buyingPrice,
      editingField: null,
      updatedAt: now
    };
  }

  if (!nextDraft) return false;

  nextDraft = {
    ...nextDraft,
    buyingPrice: 0,
    stage: nextDraftStage(nextDraft)
  };
  return saveOrAutoAddDraft(chatId, key, nextDraft);
}

async function applyGroupQueueEdit(chatId: number | string, userId: string, text: string) {
  const key = queueEditKey(chatId, userId);
  const edit = await getGroupQueueEdit(key);
  if (!edit) return false;

  const settings = await getSettings();
  const item = getGroupQueue(settings)[edit.itemId];
  if (!item) {
    await saveGroupQueueEdit(key, null);
    await sendTelegramMessage(chatId, "That missing account is no longer in the review queue.");
    return true;
  }

  const now = new Date().toISOString();
  let nextItem: TelegramGroupStockQueueItem | null = null;

  if (edit.field === "title") {
    const parsed = parseAccountText(text, Array.isArray(settings?.game_categories) ? settings.game_categories : []);
    nextItem = {
      ...item,
      accountTitle: parsed.accountTitle,
      gameName: parsed.gameName,
      secretCode: parsed.secretCode,
      updatedAt: now
    };
  }

  if (edit.field === "private_note") {
    const note = text.trim();
    if (!note) {
      await sendTelegramMessage(chatId, "Please send the Gmail/password private note.");
      return true;
    }

    nextItem = {
      ...item,
      note,
      updatedAt: now
    };
  }

  if (edit.field === "selling_price") {
    const sellingPrice = parseMoney(text);
    if (sellingPrice === null) {
      await sendTelegramMessage(chatId, "Please send a valid selling price, like 15$ or $15.");
      return true;
    }

    nextItem = {
      ...item,
      sellingPrice,
      updatedAt: now
    };
  }

  if (edit.field === "buying_price") {
    const buyingPrice = parseMoney(text);
    if (buyingPrice === null) {
      await sendTelegramMessage(chatId, "Please send a valid buying price, like 10 or $10.");
      return true;
    }

    nextItem = {
      ...item,
      buyingPrice,
      updatedAt: now
    };
  }

  if (!nextItem) return false;

  await saveGroupQueueItem(nextItem);
  await saveGroupQueueEdit(key, null);
  const completeCount = (await pendingGroupQueueItems()).filter(
    (queueItem) => missingGroupQueueFields(queueItem).length === 0
  ).length;
  await sendTelegramMessage(chatId, groupQueueItemText(nextItem), {
    reply_markup: groupQueueMarkup(nextItem, completeCount)
  });
  return true;
}

async function handleStockDraftMessage(chatId: number | string, userId: string, message: TelegramMessage, text: string) {
  const key = draftKey(chatId, userId);
  const imageFileIds = getImageFileIds(message);
  const settingsCategories = await listGameCategories();
  const existingDraft = await getDraft(key);
  const now = new Date().toISOString();

  if (existingDraft?.editingField) {
    return applyDraftEdit(chatId, key, existingDraft, text, settingsCategories);
  }

  if (imageFileIds.length || (text && extractSecretCode(text))) {
    const parsed = text ? parseAccountText(text, settingsCategories) : null;
    let draft: TelegramStockDraft = {
      id: existingDraft?.id ?? randomUUID(),
      accountTitle: parsed?.accountTitle ?? existingDraft?.accountTitle,
      buyingPrice: 0,
      chatId: String(chatId),
      createdAt: existingDraft?.createdAt ?? now,
      gameName: parsed?.gameName ?? existingDraft?.gameName,
      imageFileIds: [...new Set([...(existingDraft?.imageFileIds ?? []), ...imageFileIds])].slice(0, 15),
      mediaGroupId: message.media_group_id ?? existingDraft?.mediaGroupId,
      note: existingDraft?.note,
      previewMessageId: existingDraft?.previewMessageId,
      secretCode: parsed?.secretCode ?? existingDraft?.secretCode,
      sellingPrice: existingDraft?.sellingPrice,
      stage: "collecting",
      updatedAt: now,
      userId
    };

    draft = { ...draft, stage: nextDraftStage(draft) };
    return saveOrAutoAddDraft(chatId, key, draft);
  }

  if (existingDraft) {
    const sellingPrice = /(?:price|selling|sell)/i.test(text) ? parseSellingPrice(text) : null;
    if (sellingPrice !== null) {
      let draft: TelegramStockDraft = {
        ...existingDraft,
        buyingPrice: 0,
        sellingPrice,
        updatedAt: now
      };
      draft = { ...draft, stage: nextDraftStage(draft) };
      return saveOrAutoAddDraft(chatId, key, draft);
    }

    const note = [existingDraft.note, text]
      .filter(Boolean)
      .join("\n")
      .trim();
    let draft: TelegramStockDraft = {
      ...existingDraft,
      buyingPrice: 0,
      note,
      updatedAt: now
    };
    draft = { ...draft, stage: nextDraftStage(draft) };
    return saveOrAutoAddDraft(chatId, key, draft);
  }

  return false;
}

async function startStockDraft(chatId: number | string, userId: string) {
  const key = draftKey(chatId, userId);
  const existingDraft = await getDraft(key);
  const now = new Date().toISOString();
  let draft: TelegramStockDraft = existingDraft ?? {
    id: randomUUID(),
    chatId: String(chatId),
    createdAt: now,
    buyingPrice: 0,
    imageFileIds: [],
    stage: "collecting",
    updatedAt: now,
    userId
  };

  draft = {
    ...draft,
    stage: nextDraftStage(draft),
    updatedAt: now
  };
  await saveOrAutoAddDraft(chatId, key, draft);
}

async function createDraftFromGroupQueueItem(chatId: number | string, userId: string, item: TelegramGroupStockQueueItem) {
  const now = new Date().toISOString();
  let draft: TelegramStockDraft = {
    accountTitle: item.accountTitle,
    buyingPrice: 0,
    chatId: String(chatId),
    createdAt: now,
    gameName: item.gameName,
    groupQueueItemId: item.id,
    id: randomUUID(),
    imageFileIds: item.imageFileIds,
    mediaGroupId: item.mediaGroupId,
    note: item.note,
    secretCode: item.secretCode,
    sellingPrice: item.sellingPrice,
    stage: "collecting",
    updatedAt: now,
    userId
  };

  draft = {
    ...draft,
    stage: nextDraftStage(draft)
  };
  await saveOrAutoAddDraft(chatId, draftKey(chatId, userId), draft);
}

async function handleStockCallback(callback: TelegramCallbackQuery, chatId: number | string, userId: string) {
  const key = draftKey(chatId, userId);
  const draft = await getDraft(key);

  if (callback.data?.startsWith("group:")) {
    const [, action, fieldOrItemId, maybeItemId] = callback.data.split(":");

    if (action === "bulk") {
      await answerTelegramCallback(callback.id, "Adding complete accounts...");
      await flushOpenGroupBlocks(false);
      const result = await approveCompleteGroupQueueItems(chatId, userId);
      const lines = [
        `Bulk add finished.`,
        `Added: ${result.added}`,
        result.remainingComplete ? `Complete accounts still waiting: ${result.remainingComplete}` : null,
        result.failures.length ? `Errors:\n${result.failures.slice(0, 3).join("\n")}` : null
      ]
        .filter(Boolean)
        .join("\n");
      if (callback.message?.message_id) {
        await editTelegramMessageText(chatId, callback.message.message_id, lines);
      } else {
        await sendTelegramMessage(chatId, lines);
      }
      await sendNextGroupQueueItem(chatId);
      return;
    }

    const itemId = action === "edit" ? maybeItemId : fieldOrItemId;
    const item = itemId ? getGroupQueue(await getSettings())[itemId] : null;

    if (!item) {
      await answerTelegramCallback(callback.id, "This missing account is no longer available.");
      await sendNextGroupQueueItem(chatId);
      return;
    }

    if (action === "skip") {
      await deleteGroupQueueItem(item.id);
      await answerTelegramCallback(callback.id, "Skipped.");
      if (callback.message?.message_id) {
        await editTelegramMessageText(chatId, callback.message.message_id, "Missing account skipped.");
      }
      await sendNextGroupQueueItem(chatId);
      return;
    }

    if (action === "approve") {
      const missing = missingGroupQueueFields(item);
      if (missing.length) {
        await answerTelegramCallback(callback.id, `Missing: ${missing.join(", ")}`);
        return;
      }

      try {
        const created = await createStockAccountFromGroupQueueItem(item, chatId, userId);
        await deleteGroupQueueItem(item.id);
        await answerTelegramCallback(callback.id, "Stock account added.");
        const successMessage = [
          "Stock account added.",
          created.secret_code ? `Code: ${created.secret_code}` : null,
          `Title: ${created.account_title}`,
          "Buying: $0",
          typeof item.sellingPrice === "number" ? `Selling: $${item.sellingPrice}` : "Selling: not set"
        ]
          .filter(Boolean)
          .join("\n");

        if (callback.message?.message_id) {
          await editTelegramMessageText(chatId, callback.message.message_id, successMessage);
        } else {
          await sendTelegramMessage(chatId, successMessage);
        }
        await sendNextGroupQueueItem(chatId);
      } catch (error) {
        await answerTelegramCallback(callback.id, "Could not add stock account.");
        await sendTelegramMessage(
          chatId,
          error instanceof Error ? `Could not add stock account: ${error.message}` : "Could not add stock account."
        );
      }
      return;
    }

    if (action === "editmenu") {
      await answerTelegramCallback(callback.id, "Choose what to edit.");
      if (callback.message?.message_id) {
        await editTelegramMessageText(chatId, callback.message.message_id, `${groupQueueItemText(item)}\n\nChoose one field to edit.`, {
          reply_markup: groupQueueMarkup(item)
        });
      }
      return;
    }

    if (action === "edit") {
      const editableFields: Record<string, TelegramGroupQueueEditField> = {
        private_note: "private_note",
        selling_price: "selling_price",
        title: "title"
      };
      const field = editableFields[fieldOrItemId];

      if (!field) {
        await answerTelegramCallback(callback.id);
        return;
      }

      await saveGroupQueueEdit(queueEditKey(chatId, userId), {
        chatId: String(chatId),
        createdAt: new Date().toISOString(),
        field,
        itemId: item.id,
        userId
      });
      await answerTelegramCallback(callback.id, "Send the new value.");
      const labels: Record<TelegramGroupQueueEditField, string> = {
        buying_price: "buying price",
        private_note: "private note",
        selling_price: "selling price, like 15$ or $15",
        title: "title with code, like ML# 1632 ..."
      };
      await sendTelegramMessage(chatId, `Send the new ${labels[field]} for ${item.secretCode ?? item.accountTitle}.`);
      return;
    }

    if (action === "review") {
      await createDraftFromGroupQueueItem(chatId, userId, item);
      await answerTelegramCallback(callback.id, "Added to private draft.");
      if (callback.message?.message_id) {
        await editTelegramMessageText(chatId, callback.message.message_id, "Added to private draft. Complete the missing fields in the latest preview.");
      }
      return;
    }

    await answerTelegramCallback(callback.id);
    return;
  }

  if (!draft) {
    await answerTelegramCallback(callback.id, "No active stock draft.");
    await sendTelegramMessage(chatId, "No active stock draft. Use /addgame and forward account details again.");
    return;
  }

  if (callback.data?.startsWith("stock:edit:")) {
    const field = callback.data.replace("stock:edit:", "");

    if (field === "back") {
      await answerTelegramCallback(callback.id);
      const updatedDraft = await sendOrUpdateDraftPreview(chatId, {
        ...draft,
        editingField: null,
        stage: nextDraftStage(draft),
        updatedAt: new Date().toISOString()
      });
      await saveDraft(key, updatedDraft);
      return;
    }

    const editableFields: Record<string, NonNullable<TelegramStockDraft["editingField"]>> = {
      private_note: "private_note",
      selling_price: "selling_price",
      title: "title"
    };
    const editingField = editableFields[field];

    if (!editingField) {
      await answerTelegramCallback(callback.id);
      return;
    }

    const updatedDraft: TelegramStockDraft = {
      ...draft,
      editingField,
      updatedAt: new Date().toISOString()
    };
    await saveDraft(key, updatedDraft);
    await answerTelegramCallback(callback.id, "Send the new value.");
    const labels: Record<NonNullable<TelegramStockDraft["editingField"]>, string> = {
      buying_price: "buying price",
      private_note: "private note",
      selling_price: "selling price, like 15$ or $15",
      title: "title with code, like ML# 1632 ..."
    };
    await sendTelegramMessage(chatId, `Send the new ${labels[editingField]}.`);
    return;
  }

  if (callback.data === "stock:delete") {
    await saveDraft(key, null);
    await answerTelegramCallback(callback.id, "Draft deleted.");
    if (draft.previewMessageId) {
      await editTelegramMessageText(chatId, draft.previewMessageId, "Stock draft deleted.");
    } else {
      await sendTelegramMessage(chatId, "Stock draft deleted.");
    }
    return;
  }

  if (callback.data === "stock:edit") {
    await answerTelegramCallback(callback.id, "Choose what to edit.");
    const updatedDraft: TelegramStockDraft = {
      ...draft,
      editingField: null,
      updatedAt: new Date().toISOString()
    };
    await saveDraft(key, updatedDraft);
    const editText = `${draftPreviewText(updatedDraft)}\n\nChoose one field to edit.`;
    if (draft.previewMessageId) {
      const edited = await editTelegramMessageText(chatId, draft.previewMessageId, editText, {
        reply_markup: draftEditMarkup()
      });
      if (edited) return;
    }
    await sendTelegramMessage(chatId, editText, { reply_markup: draftEditMarkup() });
    return;
  }

  if (callback.data !== "stock:approve") {
    await answerTelegramCallback(callback.id);
    return;
  }

  const missing = missingApprovalFields(draft);
  if (missing.length) {
    await answerTelegramCallback(callback.id, `Missing: ${missing.join(", ")}`);
    const updatedDraft = await sendOrUpdateDraftPreview(chatId, {
      ...draft,
      stage: nextDraftStage(draft),
      updatedAt: new Date().toISOString()
    });
    await saveDraft(key, updatedDraft);
    return;
  }

  try {
    const created = await createStockAccountFromDraft(draft, draft.buyingPrice ?? 0);
    await saveDraft(key, null);
    if (draft.groupQueueItemId) {
      await deleteGroupQueueItem(draft.groupQueueItemId);
    }
    await answerTelegramCallback(callback.id, "Stock account added.");
    const successMessage = [
      "Stock account added.",
      created.secret_code ? `Code: ${created.secret_code}` : null,
      `Title: ${created.account_title}`,
      "Buying: $0",
      typeof draft.sellingPrice === "number" ? `Selling: $${draft.sellingPrice}` : "Selling: not set"
    ]
      .filter(Boolean)
      .join("\n");

    if (draft.previewMessageId) {
      await editTelegramMessageText(chatId, draft.previewMessageId, successMessage);
    } else {
      await sendTelegramMessage(chatId, successMessage);
    }
    if (draft.groupQueueItemId) {
      await sendNextGroupQueueItem(chatId);
    }
  } catch (error) {
    await answerTelegramCallback(callback.id, "Could not add stock account.");
    await sendTelegramMessage(
      chatId,
      error instanceof Error ? `Could not add stock account: ${error.message}` : "Could not add stock account."
    );
  }
}

export async function GET() {
  await setTelegramCommands();
  return jsonOk({ commands: "registered", service: "telegram-game-category-webhook" });
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

  const callback = update.callback_query;
  const callbackChatId = callback?.message?.chat?.id;
  const callbackUserId = callback?.from?.id ? String(callback.from.id) : "";
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id ? String(message.from.id) : "";
  const text = message ? messageText(message) : "";
  const isSeparatorMessage = message ? isCheckmarkSeparator(message, text) : false;

  if (callback && callbackChatId) {
    const allowedUserIds = getAllowedUserIds();
    if (!allowedUserIds.size || !allowedUserIds.has(callbackUserId)) {
      await answerTelegramCallback(callback.id, "You are not allowed to use this bot.");
      return jsonOk({ handled: true });
    }

    if (!hasSupabaseEnv() || !hasSupabaseAdminEnv()) {
      await answerTelegramCallback(callback.id, "Supabase environment is missing.");
      return jsonOk({ handled: true });
    }

    await setTelegramCommands();
    await handleStockCallback(callback, callbackChatId, callbackUserId);
    return jsonOk({ handled: true });
  }

  if (!chatId || (!text && !getImageFileIds(message ?? {}).length && !isSeparatorMessage)) return jsonOk();

  if (!hasSupabaseEnv() || !hasSupabaseAdminEnv()) {
    if (!message || !isGroupChat(message)) {
      await sendTelegramMessage(chatId, "Kings Rock bot is missing Supabase server environment variables.");
    }
    return jsonOk({ handled: true });
  }

  if (message && isGroupChat(message)) {
    await handleGroupStockMessage(message, text);
    return jsonOk({ handled: true });
  }

  const allowedUserIds = getAllowedUserIds();
  if (!allowedUserIds.size || !allowedUserIds.has(userId)) {
    await sendTelegramMessage(chatId, "You are not allowed to add games to Kings Rock.");
    return jsonOk({ handled: true });
  }

  await setTelegramCommands();

  if (isHelpCommand(text)) {
    await sendTelegramMessage(
      chatId,
      "Kings Rock Telegram commands:\n/addgame - start a stock draft\n/addgame Game Name - add a saved game name\n/addstock - start a stock draft\n/games - show saved games\n/draft - show current stock draft\n/reviewmissing - review accounts found in groups\n/addallmissing - add complete queued accounts\n/cancelstock - delete current draft\n\nPrivate stock import: forward account screenshots/title, then Gmail/password private note. Buying price is saved as $0 automatically. Selling price is optional and can be added later.\n\nGroup scanner: send ✅, then the account images/title/private note/selling price in any order, then ✅ again. Buying price is saved as $0 automatically. Complete blocks are added without approval."
    );
    return jsonOk({ handled: true });
  }

  if (isDraftCommand(text)) {
    const draft = await getDraft(draftKey(chatId, userId));
    if (draft) {
      const updatedDraft = await sendOrUpdateDraftPreview(chatId, draft);
      await saveDraft(draftKey(chatId, userId), updatedDraft);
    } else {
      await sendTelegramMessage(chatId, "No stock draft is active.");
    }
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

  if (isReviewMissingCommand(text)) {
    await flushOpenGroupBlocks(false);
    await sendNextGroupQueueItem(chatId);
    return jsonOk({ handled: true });
  }

  if (isApproveAllMissingCommand(text)) {
    await flushOpenGroupBlocks(false);
    const result = await approveCompleteGroupQueueItems(chatId, userId);
    await sendTelegramMessage(
      chatId,
      [
        "Bulk add finished.",
        `Added: ${result.added}`,
        result.remainingComplete ? `Complete accounts still waiting: ${result.remainingComplete}` : null,
        result.failures.length ? `Errors:\n${result.failures.slice(0, 3).join("\n")}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );
    await sendNextGroupQueueItem(chatId);
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

  if (isStartStockImportCommand(text)) {
    await startStockDraft(chatId, userId);
    return jsonOk({ handled: true });
  }

  const handledGroupQueueEdit = await applyGroupQueueEdit(chatId, userId, text);
  if (handledGroupQueueEdit) {
    return jsonOk({ handled: true });
  }

  const handledStockDraft = await handleStockDraftMessage(chatId, userId, message, text);
  if (!handledStockDraft) {
    await sendTelegramMessage(
      chatId,
      "Use /addgame to start a stock draft, then forward account images/title. Example account title: ML# 1632 collector Natalia EPIC..."
    );
    return jsonOk({ handled: true });
  }

  return jsonOk({ handled: true });
}
