// Функциональный smoke сгенерированного приложения: проверяет, что приложение не
// просто СОБРАЛОСЬ, а реально РАБОТАЕТ в браузере. Закрывает разрыв «компилируется
// ≠ работает»: ловит рантайм-исключения, пустой рендер и падающие обработчики —
// чего НЕ видят гейты tsc / expo export / prebuild (они структурные).
//
// Запуск (нужен УЖЕ запущенный preview сгенерированного приложения):
//   node e2e/functional-smoke.mjs <preview-url> [path/to/project]
// или через env:
//   SMOKE_URL=http://localhost:8081 SMOKE_PROJECT=workspace/my-app node e2e/functional-smoke.mjs
//
// Если передан путь к проекту, маршруты берутся из .appfactory/blueprint.json
// (каждый экран открывается отдельно). Иначе проверяется только "/".
//
// НЕ в дефолтном CI: требует живого превью (LM Studio + полный пайплайн). Это
// локальный инструмент, как e2e/mass-test-50.mjs. chromium берём из @playwright/test
// (он уже есть в зависимостях e2e).
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const SMOKE_URL = process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:8081";
const PROJECT_DIR = process.argv[3] ?? process.env.SMOKE_PROJECT ?? "";
const NAV_WAIT_MS = Number(process.env.SMOKE_NAV_WAIT_MS ?? 4000);

// Текст оверлеев/ошибок, которые Expo/Metro/React показывают при рантайм-падении.
const ERROR_MARKERS = [
  "Unable to resolve module",
  "Unexpected token",
  "is not defined",
  "is not a function",
  "Cannot read properties",
  "Element type is invalid",
  "Failed to compile",
  "Metro error",
  "Render Error",
];

/** app/(tabs)/settings.tsx -> /settings ; app/(tabs)/index.tsx -> / */
function routeHrefFromPath(routePath) {
  const normalized = String(routePath)
    .replace(/^app\//, "")
    .replace(/\.(tsx|ts|jsx|js)$/, "")
    .replace(/\([^/]+\)\//g, "")
    .replace(/(?:^|\/)index$/, "");
  return normalized.length > 0 ? `/${normalized}` : "/";
}

/** Маршруты из blueprint.json проекта (если задан), иначе только "/". */
function readRoutes() {
  if (!PROJECT_DIR) return ["/"];
  try {
    const planPath = path.join(PROJECT_DIR, ".appfactory", "blueprint.json");
    const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
    const screens = plan?.navigation?.screens ?? [];
    const hrefs = screens.map((screen) => routeHrefFromPath(screen.path));
    const unique = [...new Set(["/", ...hrefs])];
    return unique.length > 0 ? unique : ["/"];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[smoke] Не прочитал blueprint.json (${message}) — проверю только "/"`);
    return ["/"];
  }
}

function joinUrl(base, route) {
  return `${base.replace(/\/$/, "")}${route}`;
}

/** Открыть маршрут и собрать проблемы: HTTP, пустой рендер, маркеры и рантайм-ошибки. */
async function checkRoute(page, url) {
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onPageError = (err) => consoleErrors.push(`pageerror: ${err.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  const issues = [];
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_WAIT_MS + 6000,
    });
    if (response && response.status() >= 400) {
      issues.push(`HTTP ${response.status()}`);
    }
    // Даём приложению смонтироваться (Tamagui + Expo Router).
    await page.waitForTimeout(NAV_WAIT_MS);

    const bodyText = (await page.evaluate(() => document.body?.innerText ?? "")).trim();
    if (bodyText.length < 2) {
      issues.push("пустой рендер (body почти пустой)");
    }
    for (const marker of ERROR_MARKERS) {
      if (bodyText.includes(marker)) {
        issues.push(`маркер ошибки: "${marker}"`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`навигация упала: ${message}`);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  if (consoleErrors.length > 0) {
    const head = consoleErrors.slice(0, 3).join(" | ").slice(0, 300);
    issues.push(`рантайм-ошибки в консоли (${consoleErrors.length}): ${head}`);
  }
  return issues;
}

/** Кликнуть первую видимую кнопку и проверить, что обработчик не падает. */
async function checkInteraction(page, url) {
  const pageErrors = [];
  const onPageError = (err) => pageErrors.push(err.message);
  page.on("pageerror", onPageError);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_WAIT_MS + 6000 });
    await page.waitForTimeout(NAV_WAIT_MS);
    const button = page.locator('button, [role="button"]').first();
    if ((await button.count()) === 0) return [];
    await button.click({ timeout: 3000 }).catch(() => {
      // отсутствие/неинтерактивность кнопки — не фейл сам по себе
    });
    await page.waitForTimeout(800);
  } catch {
    // клик/навигация могли не пройти — это не считаем падением приложения
  } finally {
    page.off("pageerror", onPageError);
  }
  if (pageErrors.length === 0) return [];
  const head = pageErrors.slice(0, 2).join(" | ").slice(0, 200);
  return [`клик по первой кнопке вызвал рантайм-ошибку: ${head}`];
}

async function main() {
  const routes = readRoutes();
  console.log("=== FUNCTIONAL SMOKE ===");
  console.log(`URL: ${SMOKE_URL}`);
  console.log(`Маршруты: ${routes.join(", ")}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const failures = [];
  for (const route of routes) {
    const url = joinUrl(SMOKE_URL, route);
    const issues = await checkRoute(page, url);
    const status = issues.length === 0 ? "✅" : "❌";
    console.log(`${status} ${route}${issues.length ? `: ${issues.join("; ")}` : " — рендерится чисто"}`);
    if (issues.length > 0) failures.push({ route, issues });
  }

  const interactionIssues = await checkInteraction(page, joinUrl(SMOKE_URL, routes[0]));
  if (interactionIssues.length > 0) {
    console.log(`❌ интерактив (${routes[0]}): ${interactionIssues.join("; ")}`);
    failures.push({ route: `${routes[0]} (interaction)`, issues: interactionIssues });
  } else {
    console.log(`✅ интерактив (${routes[0]}) — клик не уронил приложение`);
  }

  await browser.close();

  console.log(`\n${"=".repeat(50)}`);
  if (failures.length === 0) {
    console.log(`SMOKE PASSED: ${routes.length} маршрут(ов) рендерятся и работают`);
    process.exit(0);
  }
  console.log(`SMOKE FAILED: ${failures.length} проблем(ы) — приложение собралось, но не работает`);
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke] фатальная ошибка: ${message}`);
  process.exit(1);
});
