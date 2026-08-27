import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, ".zeusx-browser-profile");
const BROWSER_HOME = path.join(ROOT, ".browser-home");
const LISTINGS_FILE = path.join(ROOT, "listings.json");
const LOG_FILE = path.join(ROOT, "posting-log.jsonl");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const dryRun = args.has("--dry-run");
const loginOnly = args.has("--login");
const validateOnly = args.has("--validate-only");
const useCdp = args.has("--cdp") || Boolean(process.env.CDP_URL);
const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9222";
const startAt = Math.max(
  1,
  Number(rawArgs.find((arg) => arg.startsWith("--start="))?.split("=")[1] || process.env.START_AT || 1)
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const typeDelayMs = Number(process.env.TYPE_DELAY_MS || 5);
const imageUploadWaitMinMs = Number(process.env.IMAGE_UPLOAD_WAIT_MIN_MS || 2600);
const imageUploadWaitMaxMs = Number(process.env.IMAGE_UPLOAD_WAIT_MAX_MS || 3400);
const betweenListingWaitMinMs = Number(process.env.BETWEEN_LISTING_WAIT_MIN_MS || 8000);
const betweenListingWaitMaxMs = Number(process.env.BETWEEN_LISTING_WAIT_MAX_MS || 15000);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function readListings() {
  if (!fs.existsSync(LISTINGS_FILE)) {
    throw new Error(`Missing ${LISTINGS_FILE}. Copy listings.sample.json to listings.json first.`);
  }

  const data = JSON.parse(fs.readFileSync(LISTINGS_FILE, "utf8"));
  return data.filter((listing) => listing.enabled !== false);
}

function imageFilesFromFolder(folder) {
  const fullFolder = resolvePath(folder);
  if (!fs.existsSync(fullFolder)) {
    throw new Error(`Image folder does not exist: ${fullFolder}`);
  }

  return fs
    .readdirSync(fullFolder)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(fullFolder, name));
}

function logResult(entry) {
  fs.appendFileSync(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function validateListings(listings) {
  console.log(`Loaded ${listings.length} enabled listings.`);

  for (let i = 0; i < listings.length; i += 1) {
    const listing = listings[i];
    const imagePaths = imageFilesFromFolder(listing.imageFolder);
    if (imagePaths.length === 0) {
      throw new Error(`No images found in folder: ${listing.imageFolder}`);
    }

    console.log(
      `#${i + 1}: ${listing.title.slice(0, 80)} | ${imagePaths.length} images | ${listing.imageFolder}`
    );
  }
}

async function clickFirst(page, selectors, label) {
  for (const selector of selectors) {
    const locator = typeof selector === "string" ? page.locator(selector) : selector;
    try {
      await locator.first().waitFor({ state: "visible", timeout: 5000 });
      await locator.first().click();
      return;
    } catch {
      // Try next selector.
    }
  }
  throw new Error(`Could not click ${label}`);
}

async function waitForHumanVerification(page) {
  let sawVerification = false;
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const bodyText = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    const onVerification =
      /verifying you are human|checking your browser|cloudflare|security service/i.test(bodyText);

    if (!onVerification) {
      if (sawVerification) {
        console.log("Human verification cleared.");
        await wait(3000);
      }
      return;
    }

    if (!sawVerification) {
      console.log("Cloudflare/human verification detected. Waiting for it to clear...");
      sawVerification = true;
    }

    await wait(5000);
  }

  const rl = readline.createInterface({ input, output });
  await rl.question("Complete ZeusX human verification in the browser, then press Enter here...");
  rl.close();
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await wait(3000);
}

async function fillFirst(page, selectors, value, label) {
  for (const selector of selectors) {
    const locator = typeof selector === "string" ? page.locator(selector) : selector;
    try {
      await locator.first().waitFor({ state: "visible", timeout: 5000 });
      await locator.first().fill(String(value));
      return;
    } catch {
      // Try next selector.
    }
  }
  throw new Error(`Could not fill ${label}`);
}

async function fillNearText(page, textMatcher, value, label, fieldSelector = "input, textarea") {
  const labelLocator =
    textMatcher instanceof RegExp
      ? page.getByText(textMatcher).first()
      : page.getByText(textMatcher, { exact: true }).first();

  try {
    await labelLocator.waitFor({ state: "visible", timeout: 5000 });
    const field = labelLocator.locator(`xpath=following::${fieldSelector.includes("textarea") ? "*[self::input or self::textarea]" : "input"}[1]`);
    await field.waitFor({ state: "visible", timeout: 5000 });
    await field.fill(String(value));
    return;
  } catch {
    // Fall through to the DOM scan fallback below.
  }

  const filled = await page.evaluate(
    ({ labelText, newValue }) => {
      const candidates = [...document.querySelectorAll("label, div, span, p")];
      const labelNode = candidates.find((node) => node.textContent?.trim().startsWith(labelText));
      if (!labelNode) return false;

      const inputs = [...document.querySelectorAll("input, textarea")];
      const labelBox = labelNode.getBoundingClientRect();
      const below = inputs
        .map((input) => ({ input, box: input.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && box.top >= labelBox.top)
        .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);

      const target = below[0]?.input;
      if (!target) return false;

      target.focus();
      target.value = "";
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
      target.value = String(newValue);
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(newValue) }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { labelText: typeof textMatcher === "string" ? textMatcher : label, newValue: value }
  );

  if (!filled) {
    throw new Error(`Could not fill ${label}`);
  }
}

async function fillInputAfterTextLikeHuman(page, textMatcher, value, label, { allowZero = false } = {}) {
  const labelLocator =
    textMatcher instanceof RegExp
      ? page.getByText(textMatcher).first()
      : page.getByText(textMatcher, { exact: true }).first();

  await labelLocator.waitFor({ state: "visible", timeout: 8000 });
  const input = labelLocator.locator("xpath=following::input[1]");
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(String(value), { delay: typeDelayMs });
  await page.keyboard.press("Tab");

  const valueAfter = await input.inputValue().catch(() => "");
  const numericValue = valueAfter.replace(/[^\d.]/g, "");
  if (!valueAfter || (!allowZero && /^0(?:\.0+)?$/.test(numericValue))) {
    throw new Error(`Could not fill ${label}`);
  }
}

async function clickFieldAfterText(page, textMatcher) {
  const labelLocator =
    textMatcher instanceof RegExp
      ? page.getByText(textMatcher).first()
      : page.getByText(textMatcher, { exact: true }).first();

  await labelLocator.waitFor({ state: "visible", timeout: 8000 });

  const clickable = labelLocator.locator(
    "xpath=following::*[self::button or self::input or @role='button' or @role='combobox'][1]"
  );
  await clickable.waitFor({ state: "visible", timeout: 8000 });
  await clickable.scrollIntoViewIfNeeded();
  await clickable.click();
}

async function selectDropdownOption(page, fieldLabel, optionText) {
  await clickFieldAfterText(page, fieldLabel, `${fieldLabel} dropdown`);
  await wait(250);

  await clickFirst(
    page,
    [
      page.getByRole("option", { name: new RegExp(optionText, "i") }),
      page.getByRole("radio", { name: new RegExp(optionText, "i") }),
      page.getByText(optionText, { exact: true }),
      page.locator(`text=${optionText}`)
    ],
    `${fieldLabel} option ${optionText}`
  );
  await wait(250);
}

async function clickTermsCheckbox(page) {
  await page.getByText(/I agree with/i).first().scrollIntoViewIfNeeded().catch(() => {});
  await wait(150);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const state = await page.evaluate(() => {
      const isChecked = (node) =>
        node.matches('input[type="checkbox"]') ? node.checked : node.getAttribute("aria-checked") === "true";

      const checkboxes = [...document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')]
        .map((node) => ({ node, box: node.getBoundingClientRect(), text: node.textContent || "" }))
        .filter(({ box }) => box.width > 0 && box.height > 0);

      const target =
        checkboxes.find(({ text }) => /I agree with/i.test(text))?.node ||
        checkboxes.sort((a, b) => b.box.top - a.box.top)[0]?.node;

      if (!target) return { found: false, checked: false, point: null };

      const checked = isChecked(target);

      const targetBox = target.getBoundingClientRect();
      const smallBox = [...target.querySelectorAll("*")]
        .map((node) => ({ node, box: node.getBoundingClientRect() }))
        .filter(({ box }) => {
          return (
            box.width > 0 &&
            box.height > 0 &&
            box.width <= 40 &&
            box.height <= 40 &&
            box.left >= targetBox.left - 4 &&
            box.left <= targetBox.left + 56 &&
            box.top >= targetBox.top - 8 &&
            box.top <= targetBox.bottom + 8
          );
        })
        .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0]?.box;

      const clickBox =
        smallBox ||
        ({
          left: targetBox.left,
          top: targetBox.top,
          width: Math.min(24, targetBox.width),
          height: Math.min(24, targetBox.height)
        });

      return {
        found: true,
        checked,
        point: {
          x: clickBox.left + clickBox.width / 2,
          y: clickBox.top + clickBox.height / 2
        }
      };
    });

    if (!state.found || !state.point) {
      throw new Error("Could not find terms checkbox");
    }

    if (state.checked) return;

    await page.mouse.click(state.point.x, state.point.y);
    await wait(250);

    const checked = await page.evaluate(() => {
      const isChecked = (node) =>
        node.matches('input[type="checkbox"]') ? node.checked : node.getAttribute("aria-checked") === "true";

      return [...document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')].some(
        (node) => /I agree with/i.test(node.textContent || "") && isChecked(node)
      );
    });

    if (checked) return;

    await page
      .locator('[role="checkbox"]')
      .filter({ hasText: /I agree with/i })
      .first()
      .press("Space")
      .catch(() => {});
    await wait(250);

    const checkedAfterSpace = await page.evaluate(() => {
      const isChecked = (node) =>
        node.matches('input[type="checkbox"]') ? node.checked : node.getAttribute("aria-checked") === "true";

      return [...document.querySelectorAll('[role="checkbox"], input[type="checkbox"]')].some(
        (node) => /I agree with/i.test(node.textContent || "") && isChecked(node)
      );
    });

    if (checkedAfterSpace) return;
    console.log(`Terms checkbox attempt ${attempt} failed.`);
  }

  throw new Error("Could not check terms checkbox");
}

async function selectText(page, text, label = text) {
  await clickFirst(
    page,
    [
      page.getByRole("button", { name: new RegExp(text, "i") }),
      page.getByText(text, { exact: true }),
      page.locator(`text=${text}`)
    ],
    label
  );
}

async function clearAndSearchGame(page, gameName) {
  await fillFirst(
    page,
    [
      page.getByPlaceholder(/search by game name/i),
      page.getByPlaceholder(/search/i),
      'input[placeholder*="game" i]',
      'input[type="search"]'
    ],
    gameName,
    "game search"
  );
  await wait(randomBetween(500, 900));
  await selectText(page, gameName, `game ${gameName}`);
}

async function fillDescription(page, description) {
  if (!description || !description.trim()) {
    throw new Error("Listing description is empty");
  }

  const fillEditor = async (locator) => {
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(description);
    await wait(250);
    await page.keyboard.press("Tab");

    const textAfter = await locator.innerText().catch(() => "");
    if (textAfter.trim().length < 50) {
      throw new Error("Description text did not stick");
    }
  };

  try {
    const label = page.getByText(/Descriptions/i).first();
    await label.waitFor({ state: "visible", timeout: 5000 });
    const editor = label.locator("xpath=following::*[@contenteditable='true'][1]");
    await fillEditor(editor);
    return;
  } catch {
    // Fall back to generic editor selectors below.
  }

  const descriptionLocators = [
    page.locator(".ProseMirror").first(),
    page.locator(".ql-editor").first(),
    page.locator('[contenteditable="true"]').first(),
    page.locator('textarea[name*="description" i]')
  ];

  for (const locator of descriptionLocators) {
    try {
      await fillEditor(locator);
      return;
    } catch {
      // Try next description editor.
    }
  }

  throw new Error("Could not fill description editor");
}

async function addTags(page, tags) {
  for (const tag of tags || []) {
    await fillFirst(
      page,
      [
        page.getByPlaceholder(/enter to add/i),
        'input[placeholder*="Enter to add" i]',
        'input[placeholder*="tag" i]'
      ],
      tag,
      `tag ${tag}`
    );
    await page.keyboard.press("Enter");
    await wait(randomBetween(350, 800));
  }
}

async function uploadImagesOneByOne(page, imagePaths) {
  await page.getByText(/Upload Images/i).first().scrollIntoViewIfNeeded().catch(() => {});

  for (let i = 0; i < imagePaths.length; i += 1) {
    const imagePath = imagePaths[i];
    console.log(`Uploading image ${i + 1}/${imagePaths.length}: ${path.basename(imagePath)}`);

    const inputs = page.locator('input[type="file"]');
    const count = await inputs.count();
    if (count === 0) {
      throw new Error("No file input found for image upload");
    }

    await inputs.nth(Math.min(i, count - 1)).setInputFiles(imagePath);
    await wait(randomBetween(imageUploadWaitMinMs, imageUploadWaitMaxMs));
  }

  await wait(3000);
}

async function createListing(page, listing) {
  const imagePaths = imageFilesFromFolder(listing.imageFolder);

  await page.goto("https://zeusx.com/", { waitUntil: "domcontentloaded" });
  await waitForHumanVerification(page);
  await clickFirst(
    page,
    [
      page.getByRole("link", { name: /sell item/i }),
      page.getByRole("button", { name: /sell item/i }),
      page.locator('a[href*="sell" i]'),
      page.getByText(/sell item/i)
    ],
    "Sell Item"
  );
  await wait(randomBetween(500, 900));

  await selectText(page, listing.category, `category ${listing.category}`);
  await wait(randomBetween(400, 800));

  await clearAndSearchGame(page, listing.game);
  await wait(randomBetween(400, 800));

  await fillFirst(
    page,
    [
      page.getByLabel(/listing title/i),
      page.getByPlaceholder(/clash of clans account/i),
      page.getByPlaceholder(/account lv/i),
      'input[name*="title" i]',
      'input[placeholder*="title" i]',
      'input[placeholder*="account" i]'
    ],
    listing.title,
    "listing title"
  ).catch(() => fillNearText(page, "Listing Title", listing.title, "listing title"));

  await fillInputAfterTextLikeHuman(page, /^Price/i, listing.price, "price");

  if (listing.server) {
    await selectDropdownOption(page, /^Server/i, listing.server);
  }

  if (listing.deliveryMethod) {
    await selectText(page, listing.deliveryMethod, `delivery method ${listing.deliveryMethod}`);
  }

  await fillInputAfterTextLikeHuman(page, /^Days/i, listing.deliveryDays ?? 0, "delivery days", { allowZero: true });
  await fillInputAfterTextLikeHuman(page, /^Hours/i, listing.deliveryHours ?? 1, "delivery hours", { allowZero: true });

  await fillDescription(page, listing.description);
  await addTags(page, listing.tags);
  await uploadImagesOneByOne(page, imagePaths);

  await clickTermsCheckbox(page);

  if (dryRun) {
    console.log(`[DRY RUN] Ready to submit: ${listing.title}`);
    return { submitted: false };
  }

  await clickFirst(page, [page.getByRole("button", { name: /list items/i }), page.getByText(/list items/i)], "List Items");
  await page.getByRole("heading", { name: /successfully listed/i }).waitFor({ timeout: 90000 });

  return { submitted: true };
}

async function openBrowserPage() {
  if (useCdp) {
    console.log(`Connecting to existing Chrome at ${cdpUrl}`);
    let browser;
    try {
      browser = await chromium.connectOverCDP(cdpUrl);
    } catch (error) {
      throw new Error(
        [
          `Could not connect to Chrome at ${cdpUrl}.`,
          "Chrome is probably not running with --remote-debugging-port=9222.",
          "",
          "From normal Terminal:",
          "1. Quit Chrome completely with Cmd+Q.",
          "2. Run: npm run chrome:debug",
          "3. Log in to ZeusX in that Chrome window if needed.",
          "4. Run: npm run cdp:check",
          "5. Run: npm run post:cdp:dry",
          "",
          "Chrome 136+ blocks remote debugging on the default Chrome profile,",
          "so chrome:debug uses a dedicated .chrome-debug-profile folder.",
          "",
          `Original error: ${error.message}`
        ].join("\n")
      );
    }
    const context = browser.contexts()[0] || (await browser.newContext());
    for (const existingPage of context.pages()) {
      const title = await existingPage.title().catch(() => "");
      const url = existingPage.url();
      if (/terms/i.test(title) || /terms/i.test(url)) {
        await existingPage.close().catch(() => {});
      }
    }

    const pages = context.pages();
    const page =
      pages.find((existingPage) => /create-offer/i.test(existingPage.url())) ||
      pages.find((existingPage) => /zeusx\.com/i.test(existingPage.url())) ||
      pages[0] ||
      (await context.newPage());
    return { browser, page, connectedToExistingBrowser: true };
  }

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    executablePath: fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined,
    env: {
      ...process.env,
      HOME: BROWSER_HOME,
      XDG_CONFIG_HOME: path.join(BROWSER_HOME, ".config"),
      XDG_CACHE_HOME: path.join(BROWSER_HOME, ".cache")
    },
    args: ["--disable-crash-reporter", "--disable-crashpad"]
  });

  const page = await browser.newPage();
  return { browser, page, connectedToExistingBrowser: false };
}

async function closeBrowserSession(browser, connectedToExistingBrowser) {
  if (connectedToExistingBrowser) {
    await browser.close().catch(() => {});
    return;
  }

  await browser.close();
}

async function main() {
  const listings = readListings();

  if (validateOnly) {
    validateListings(listings);
    return;
  }

  const { browser, page, connectedToExistingBrowser } = await openBrowserPage();

  if (loginOnly) {
    await page.goto("https://zeusx.com/", { waitUntil: "domcontentloaded" });
    await waitForHumanVerification(page);
    const rl = readline.createInterface({ input, output });
    console.log("Log in manually in the opened browser window.");
    await rl.question("Press Enter here after login is complete...");
    rl.close();
    await closeBrowserSession(browser, connectedToExistingBrowser);
    return;
  }

  validateListings(listings);

  for (let i = startAt - 1; i < listings.length; i += 1) {
    const listing = listings[i];
    console.log(`\nListing ${i + 1}/${listings.length}: ${listing.title}`);

    try {
      const result = await createListing(page, listing);
      logResult({ status: result.submitted ? "success" : "dry-run", title: listing.title });
      console.log(result.submitted ? "Success." : "Dry run completed.");
    } catch (error) {
      logResult({ status: "failed", title: listing.title, error: error.message });
      console.error(`Failed: ${error.message}`);
      console.error("Browser is left open for inspection. Fix the selector or listing data, then run again.");
      await page.screenshot({ path: path.join(ROOT, `failure-${Date.now()}.png`), fullPage: true }).catch(() => {});
      const rl = readline.createInterface({ input, output });
      await rl.question("Press Enter to close the browser...");
      rl.close();
      break;
    }

    if (i < listings.length - 1) {
      const delay = randomBetween(betweenListingWaitMinMs, betweenListingWaitMaxMs);
      console.log(`Waiting ${Math.round(delay / 1000)} seconds before next listing...`);
      await wait(delay);
    }
  }

  await closeBrowserSession(browser, connectedToExistingBrowser);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
