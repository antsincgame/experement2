# Opus Handoff — остаток после Round 4 + Windows fix

> **Для:** Claude Opus (следующая итерация)  
> **Снимок:** `main` после merge `f34d1648` + локальный fix platform tests  
> **Предшественник:** `docs/archive/CODE_AUDIT.md` (архив) @ `91dc0719`, `AUDIT.md` Round 4  
> **Контекст:** Cursor исправил то, что можно локально; ниже — задачи, требующие решения/инфры/прогона.

---

## 1. Что уже сделано (не трогать без причины)

| ID | Fix | Файлы |
|----|-----|-------|
| H1 | Metro restart timeout → `preview_status: error` | `preview-restart.ts:127-136` |
| H2 | `revertVersion` integration tests | `pipeline-revert.test.ts` |
| M1 | One-shot guard: no double-bump after restart | `ws-handler.ts:752-759, 833-835` |
| M3 | AUDIT Round 4 — B2/B1/E4 перепроверены FIXED | `AUDIT.md:370+` |
| M5 | Dropped WS message diagnostic | `ws-resilience.ts` |
| C4 | Reconnect resync policy tests | `ws-resilience.test.ts` |
| H3/M8 | Startup warn on insecure non-loopback bind | `local-auth.ts`, `.env.example` |
| L3 | Removed dead `refreshPreviewBundle` | `metro-ready.ts` |
| L6 | Removed deprecated aliases | `plan-brief.ts`, `generation-state.ts` |
| TS2578 | Strip `@ts-expect-error` from generated code | `code-style-repairs.ts` |
| **NEW** | Platform-guarded orphan-port tests (win/unix) | `preview-restart.test.ts` |

**Тесты после fix:** ожидается `npm run check` green (715+ tests).

---

## 2. Исправлено Cursor (этот PR)

### Windows test regression

**Проблема:** `preview-restart.test.ts` тест `"unix path"` вызывал `lsof` на win32 → `npm run check` падал локально на Windows.

**Fix:** `it.skipIf(process.platform === "win32")` для unix + отдельный Windows test для PowerShell/`taskkill`.

---

## 3. Задачи для Opus (нельзя закрыть без твоего участия)

### P0 — документация ✅ ЗАКРЫТО (Opus, 2026-06-14)

| # | Задача | Статус |
|---|--------|--------|
| 1 | Синхронизировать противоречие в AUDIT.md (B2/E4 open vs FIXED) | ✅ Round 2/3-таблицы помечены historical, снято в Round 4 |
| 2 | Обновить CODE_AUDIT.md (Round 4 статусы, CLOSED, test count) | ✅ §15 Round 4 Resolution; файл **архивирован** в `docs/archive/CODE_AUDIT.md` |

### P1 — CI / infra (нужен GitHub + стабильный runner)

| # | Задача | Почему не Cursor |
|---|--------|------------------|
| 3 | **Вернуть e2e в CI** (сейчас 7/26) | Flaky Metro/Tamagui на 2-core GitHub — нужен эксперимент: retries, longer timeout, dedicated job, или preview mock |
| 4 | **`web-preview-refresh.spec.ts` в CI** | ~3 min, зависит от Metro warm-up; проверить на `ubuntu-latest` + cache template |
| 5 | **`web-project-deletion.spec.ts`** | Order-dependent: Clear All удаляет shared fixture — нужен изолированный fixture per spec или serial-only suite |

**Файлы:** `playwright.e2e.ci.config.ts`, `.github/workflows/ci.yml`

### P1 — e2e coverage gaps

| # | Задача | Файл | Acceptance |
|---|--------|------|------------|
| 6 | **E2E revert → iframe update** | новый spec или расширение `web-preview-refresh` | VersionTimeline revert → iframe shows reverted text |
| 7 | **`reloading_preview` ws-handler test** | `ws-handler.test.ts` | Chat message + state interaction |

### P2 — env-dependent (нужен LM Studio + live preview)

| # | Задача | Команда | Источник |
|---|--------|---------|----------|
| 8 | **functional-smoke расширение** | `node e2e/functional-smoke.mjs <url> workspace/<project>` | `TODO.md:6` |
| 9 | **STRICT_REGRESSION_GATE decision** | `STRICT_REGRESSION_GATE=true npm run test:e2e:mass` | `TODO.md:7`, `pipeline-typecheck-gate.ts:61` |

### P2 — product / low priority

| ID | Задача | Файл | Notes |
|----|--------|------|-------|
| L1 | Native preview surface | `preview-panel.tsx:100-119` | Placeholder only |
| L2 | Metro ENOENT spam template_cache | `metro.config.js` / ignore list | Log noise, non-fatal |
| M2 | `triggerMetroBuild` fail → only warn | `preview-restart.ts:119-125` | Acceptable if H1 covers UX |
| M7 | Expo dev `exited with code 1` after bundle | `npm run dev` / concurrently | Repro locally; may be port race |
| G3/G4 | Residual false-green e2e patterns | `web-navigation-stability`, `web-offline-recovery`, `web-settings-persistence` | Grep `isVisible().catch(() => false)` |

### P3 — design decisions (не баги — нужен выбор владельца)

| ID | Вопрос | Options |
|----|--------|---------|
| H3 | Auth off by default on localhost | A) keep + document B) require token always C) prompt on first LAN bind |
| M8 | Dangerous ops header vs secret | A) keep confirm header B) require token C) `ALLOW_DANGEROUS=false` by default |
| A3 | `json_schema` for planner/editor | Build from Zod, send to LM Studio when supported |

---

## 4. Карта влияния для Opus (e2e revert)

```
VersionTimeline (UI)
       │
       ├──► useWebSocket.revertVersion
       │         └──► agent pipeline.revertVersion
       │                   ├── killExpo (portBeforeKill captured)
       │                   ├── git checkout
       │                   └── restartProjectPreview
       │
       ├──► ws-handler: preview_ready + one-shot bump
       │
       └──► preview-panel: buildPreviewSrc → iframe reload

Tests today: pipeline-revert.test.ts (mocked) ✅
Missing: Playwright e2e ❌
```

---

## 5. Рекомендуемый порядок работ Opus

```
1. Merge platform test fix (если ещё не в main)
2. AUDIT.md + CODE_AUDIT.md sync ✅ (CODE_AUDIT.md архивирован в docs/archive/)
3. E2E revert spec (2-3 h)
4. CI e2e expansion experiment (infra, 1-2 h + CI runs)
5. functional-smoke + STRICT_REGRESSION_GATE (env, когда LM Studio доступен)
```

---

## 6. Команды верификации

```bash
npm run check                                    # must be green
npm run test:e2e:web -- e2e/web-preview-refresh.spec.ts
npm run test:e2e:web:ci                          # CI subset (7 tests)
node e2e/functional-smoke.mjs <url> workspace/<project>   # manual
```

---

## 7. Вопросы для Opus

1. CI e2e: retries=1 + workers=1 достаточно для Metro stability, или нужен mock preview server?
2. Revert e2e: mock git fixture с 2 commits или real git in fixture project?
3. `STRICT_REGRESSION_GATE` default ON — какой regression win-rate % acceptable?
4. ✅ Решено: `CODE_AUDIT.md` архивирован в `docs/archive/`; живой канон — `AUDIT.md` + `OPUS_HANDOFF.md`.

---

## 8. Боевой приказ для Курсора (Terra) — env-dependent остаток

> Это задачи, которые **нельзя закрыть в песочнице Opus** (нет браузеров / LM Studio /
> CI-прогонов). У Курсора на Терре есть живой Metro, LM Studio и сеть. Каждый блок:
> **цель → команды → acceptance**. Делать по порядку; не пушить флаки-спеки в CI-гейт.

### 0. Pre-flight (всегда)

```bash
git pull origin main
npm install && (cd agent && npm install)
npx playwright install --with-deps chromium      # браузеры для e2e
npm run check                                     # baseline: agent 599(+1 skip) · FE 126 · green
```
**Acceptance:** `npm run check` зелёный. Если нет — стоп, чинить до зелёного перед остальным.

### P0 — подтвердить CI-гейт после `retries:2`

```bash
gh run list --branch main --limit 5              # последние прогоны CI
gh run watch                                      # дождаться текущего
```
**Acceptance:** последние **3** прогона `CI` на `main` → `success`. Если retries:2 не помог конкретному тесту — открыть его trace из артефактов и чинить причину, не повышать retries вслепую.

### P1 #3-4 — расширить CI e2e (эксперимент по флаки)

**Цель:** вернуть в гейт спеки, что проходят **детерминированно**; live-Metro-preview оставить в nightly.

```bash
# 1. Замерить флаки каждого ИСКЛЮЧЁННОГО спека (5 прогонов):
for spec in web-chat-history web-concurrent-chats web-offline-recovery web-error-recovery web-happy-path web-preview-refresh; do
  pass=0; for i in 1 2 3 4 5; do npm run test:e2e:web -- e2e/$spec.spec.ts && pass=$((pass+1)); done
  echo "RESULT $spec: $pass/5"
done
```
**Acceptance / действие:**
- спек **5/5** → добавить в `testMatch` в `playwright.e2e.ci.config.ts`, запушить, подтвердить **3** зелёных CI-прогона подряд;
- спек **<5/5** → НЕ добавлять в PR-гейт; если это live-Metro (happy-path/preview-refresh) — создать отдельный **nightly** workflow (`.github/workflows/e2e-nightly.yml`, cron, `npm run test:e2e:web`, warm `template_cache`, retries:2, timeout↑).

### P1 #5 — web-project-deletion self-isolation

**Проблема:** тест «Clear All» удаляет **общую** фикстуру `e2e-existing-project` с диска → следующий тест в файле падает (order-dependent).
**Фикс:** тест должен создавать и удалять **свой throwaway-проект**, не общую фикстуру.

```bash
# после правки e2e/web-project-deletion.spec.ts:
for i in 1 2 3; do npm run test:e2e:web -- e2e/web-project-deletion.spec.ts || echo "FAIL $i"; done
```
**Acceptance:** 3/3 зелёных в любом порядке → добавить спек в `playwright.e2e.ci.config.ts`.

### P1 #6 — e2e revert → iframe (новый спек)

**Цель:** `e2e/web-revert.spec.ts` — создать/открыть проект → итерация (текст A→B) → VersionTimeline revert на предыдущий коммит → **assert: iframe показывает текст A**.
Интеграционный путь уже покрыт (`pipeline-revert.test.ts`); здесь нужен браузерный E2E против живого Metro.

```bash
for i in 1 2 3; do npm run test:e2e:web -- e2e/web-revert.spec.ts || echo "FAIL $i"; done
```
**Acceptance:** 3/3 зелёных. Карта влияния — §4 выше.

### P2 #8 — functional-smoke против живого превью (нужен LM Studio)

```bash
npm run dev                                        # терминал 1: agent :3100 + UI :8081
# в UI создать проект; узнать preview-порт (URL-бар превью или [Preview] лог агента)
node e2e/functional-smoke.mjs http://127.0.0.1:<metro-port> workspace/<project>   # терминал 2
```
**Acceptance:** smoke зелёный (не падает + не пусто + клик не роняет). Затем **расширить**: сценарии из плана (ввод в форму → assert, что элемент появился) — `TODO.md:6`.

### P2 #9 — STRICT_REGRESSION_GATE: решение по данным (нужен LM Studio)

```bash
node e2e/mass-test-50.mjs                               > /tmp/baseline.txt   # win-rate X
STRICT_REGRESSION_GATE=true node e2e/mass-test-50.mjs   > /tmp/gated.txt      # win-rate Y
grep -i "win" /tmp/baseline.txt /tmp/gated.txt
```
**Acceptance / действие:** если регресс `X−Y ≤ ~2%` → включить по умолчанию: `agent/src/lib/pipeline-typecheck-gate.ts:61` (`STRICT_REGRESSION_GATE` default `true`), + обновить `TODO.md:7`. Если просадка больше — оставить opt-in, записать цифры в `AUDIT.md`.

### P2 — M7 / L2 (по месту, repro на Терре)

```bash
npm run dev    # M7: ловить "exited with code 1" после первого bundle → captures concurrently-логи; вероятна гонка портов (:8081 / :3100 / metro-pool)
# L2: если ENOENT-спам по @tamagui/*/node_modules — добавить ignore в metro.config.js (resolver.blockList)
```
**Acceptance:** M7 — стабильный repro + причина (порт/таймінг); L2 — лог чистый после ignore.

### Правила пуша для Курсора

- Каждый код-фикс — **под тестом** и `npm run check` зелёный перед пушем.
- НЕ добавлять спек в `playwright.e2e.ci.config.ts` без **5/5** (новые) / **3/3** (фикс) локально.
- Живой канон — `AUDIT.md` + этот файл; результаты прогонов (win-rate, флаки-статы) писать в `AUDIT.md` новым Round.

---

*Сгенерировано Cursor после pull `c9bfd3e3` + Windows test fix. §8 — боевой приказ от Opus (2026-06-14). Код wins при расхождении.*
