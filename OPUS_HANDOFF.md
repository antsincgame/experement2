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

*Сгенерировано Cursor после pull `c9bfd3e3` + Windows test fix. Код wins при расхождении.*
