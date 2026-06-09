// Функциональный smoke сгенерированного приложения: проверяет, что превью не просто
// СОБРАЛОСЬ, а реально РАБОТАЕТ. Закрывает headline-разрыв аудита «компилируется ≠
// делает заявленное»: гейты (tsc + web-export + Metro 200) поведение не проверяют, и
// приложение может пройти их все, оставаясь нерабочим (todo не добавляется и т.п.).
//
// Это STANDALONE-скрипт (как e2e/mass-test-50.mjs), НЕ *.spec.ts — чтобы дефолтный
// Playwright-CI его НЕ подхватывал (ему нужен запущенный превью + LM Studio). Запуск:
//   PREVIEW_URL=http://localhost:8081 node e2e/preview-smoke.mjs
// Коды выхода: 0 — ок, 1 — провал (белый экран / не грузится / краш), 2 — нет Playwright.
//
// Проверки v1 (generic, без знания плана):
//   1) RENDER (hard): страница отдаёт непустой видимый текст (не белый экран).
//   2) INTERACTIVITY (soft): первый видимый кликабельный элемент по клику меняет DOM
//      или навигацию — доказывает, что обработчики живые, а не статичный макет.
// Следующий шаг (issue #16): плановые сценарии — принимать JSON со списком
// (selector → действие → ожидаемое изменение) и делать их hard-ассертами по плану.
import { chromium } from "@playwright/test";

const PREVIEW_URL = process.env.PREVIEW_URL ?? "http://localhost:8081";
const NAV_TIMEOUT_MS = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);
const SETTLE_MS = Number(process.env.SMOKE_SETTLE_MS ?? 1_500);
const MIN_TEXT_LEN = Number(process.env.SMOKE_MIN_TEXT_LEN ?? 1);

const ok = (msg) => console.log(`\u2713 ${msg}`);

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(
    `Playwright/Chromium \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d (${err instanceof Error ? err.message : String(err)}). ` +
      "\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438: npx playwright install chromium",
  );
  process.exit(2);
}

const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  // 1) Страница вообще грузится.
  const response = await page.goto(PREVIEW_URL, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  if (!response || !response.ok()) {
    throw new Error(
      `\u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u043d\u0435 \u043e\u0442\u0434\u0430\u043b\u0430\u0441\u044c (HTTP ${response ? response.status() : "no response"}) \u043d\u0430 ${PREVIEW_URL}`,
    );
  }
  await page.waitForTimeout(SETTLE_MS);

  // 2) RENDER (hard): не белый экран — есть видимый текст.
  const bodyText = (await page.evaluate(() => document.body?.innerText ?? "")).trim();
  if (bodyText.length < MIN_TEXT_LEN) {
    throw new Error(
      `\u043f\u0443\u0441\u0442\u043e\u0439 \u0440\u0435\u043d\u0434\u0435\u0440: \u0432\u0438\u0434\u0438\u043c\u043e\u0433\u043e \u0442\u0435\u043a\u0441\u0442\u0430 ${bodyText.length} \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432 (\u0431\u0435\u043b\u044b\u0439 \u044d\u043a\u0440\u0430\u043d?)`,
    );
  }
  ok(`RENDER: ${bodyText.length} \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432 \u0432\u0438\u0434\u0438\u043c\u043e\u0433\u043e \u0442\u0435\u043a\u0441\u0442\u0430`);

  // Рантайм-ошибки в консоли — приложение «отрисовалось», но может падать.
  if (consoleErrors.length > 0) {
    console.warn(
      `\u26a0 ${consoleErrors.length} console error(s):\n  ${consoleErrors.slice(0, 5).join("\n  ")}`,
    );
  }

  // 3) INTERACTIVITY (soft): кликаем первый видимый интерактивный элемент, ждём изменения.
  const clickable = page.locator(
    'button, [role="button"], a[href], [tabindex]:not([tabindex="-1"])',
  );
  const count = await clickable.count();
  const snap = () =>
    page.evaluate(() => ({
      html: document.body?.innerHTML?.length ?? 0,
      url: location.href,
    }));
  let interactiveChecked = false;
  for (let i = 0; i < count; i++) {
    const el = clickable.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const before = await snap();
    try {
      await el.click({ timeout: 5_000 });
    } catch {
      continue; // перекрыт/недоступен — пробуем следующий
    }
    await page.waitForTimeout(SETTLE_MS);
    const after = await snap();
    interactiveChecked = true;
    if (after.url !== before.url || after.html !== before.html) {
      ok(
        `INTERACTIVITY: \u043a\u043b\u0438\u043a \u0438\u0437\u043c\u0435\u043d\u0438\u043b ${after.url !== before.url ? "\u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044e" : "DOM"}`,
      );
    } else {
      console.warn(
        "\u26a0 INTERACTIVITY: \u043f\u0435\u0440\u0432\u044b\u0439 \u043a\u043b\u0438\u043a \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0438\u043b DOM/\u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044e (\u0432\u043e\u0437\u043c\u043e\u0436\u0435\u043d \u0441\u0442\u0430\u0442\u0438\u0447\u043d\u044b\u0439 \u043c\u0430\u043a\u0435\u0442)",
      );
    }
    break;
  }
  if (!interactiveChecked) {
    console.warn(
      "\u26a0 INTERACTIVITY: \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e \u0432\u0438\u0434\u0438\u043c\u044b\u0445 \u0438\u043d\u0442\u0435\u0440\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u043e\u0432",
    );
  }

  ok("SMOKE PASSED (render + best-effort interactivity)");
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error(`\u2717 SMOKE FAIL: ${err instanceof Error ? err.message : String(err)}`);
  await browser.close().catch(() => {});
  process.exit(1);
}
