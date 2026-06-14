# Code Audit — App Factory (experement2)

> 🗄️ **АРХИВ — не поддерживается.** Точечный снимок @ `91dc0719`. Все находки закрыты
> (см. §15 Round 4 ниже) или перенесены в `OPUS_HANDOFF.md`. Живой канон аудита:
> **`AUDIT.md`** (история раундов) + **`OPUS_HANDOFF.md`** (открытые задачи). Этот файл
> оставлен как исторический документ (исходная таксономия H1–M8–L6, 5 Whys, §11–§14).

> **Назначение:** передать Opus для глубокого ревью и приоритизации фиксов.  
> **Снимок:** `main` @ `91dc0719` (2026-06-06)  
> **Метод:** статический анализ + прогон `npm run check` + обзор e2e/harness + сверка с `AUDIT.md` / `TODO.md`.

---

## 1. Executive Summary

**App Factory** — локальный генератор Expo/React Native приложений: Node agent (пайплайн, Metro, git) + Expo Web UI (чат, превью, файлы). Связь через WebSocket + REST.

| Метрика | Значение |
|---------|----------|
| TypeScript | strict, без `any` в проде |
| Unit-тесты | **701** (585 agent + 116 frontend) — зелёные |
| Playwright e2e | **26** тестов в 10 spec-файлах; CI гоняет **7** (3 файла) |
| Lint / tsc | чисто на момент снимка |

**Общая оценка:** база здоровая, типобезопасность и контракт WS сильные. Основные риски — **тихие отказы** (Metro restart timeout, malformed WS), **пробелы тестов** (revert, reload edge cases), **устаревшая документация** в `AUDIT.md` (B2 singleton Metro уже частично исправлен LRU).

**Главная продуктовая зона внимания:** preview refresh после chat iteration / git revert на Windows (Metro stale bundle + iframe cache-bust).

---

## 2. Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (Expo Web, src/)                                       │
│  ws-messages.ts     — канонический WS-контракт (Zod)            │
│  ws-handler.ts      — inbound events → Zustand store              │
│  preview-panel.tsx  — iframe pool (LRU), direct Metro URL       │
│  api-client.ts      — REST + WS URL + preview direct URL        │
└────────────────────────────┬────────────────────────────────────┘
                             │ WS :3100/ws  +  HTTP REST
┌────────────────────────────▼────────────────────────────────────┐
│ Agent (Node, agent/src/)                                        │
│  server.ts           — Express + WS router                      │
│  pipeline.ts         — create / iterate / revert                │
│  preview-restart.ts  — shared Metro restart (clear cache)       │
│  process-manager.ts  — Metro lifecycle, LRU eviction            │
│  ws-contract.ts      — OutboundMessage ← IncomingWsMessage      │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Runtime                                                         │
│  workspace/<project>/  — сгенерированные Expo-проекты           │
│  workspace/template_cache/ — scaffold + node_modules (lazy)     │
│  Metro per project (до MAX_LIVE_PREVIEWS, LRU sleep)            │
└─────────────────────────────────────────────────────────────────┘
```

### Границы ответственности

| Concern | Agent | Frontend |
|---------|-------|----------|
| Metro start/kill/restart | ✅ | — |
| Git commit / revert | ✅ | UI trigger only |
| LLM calls | ✅ | settings URL only |
| Iframe reload | emits `preview_ready`, `build_success`, `buildId` | `bumpPreviewRevision` + query `?v=port-rev-buildId` |
| Preview URL | emits `port`, `proxyUrl` | **direct Metro URL** (не proxy — asset paths) |
| Файлы проекта | REST | store + CodeMirror |

**Coupling:** agent импортирует **типы** из `src/shared/` (`ws-messages`, `plan-brief`). Frontend не импортирует agent — OK.

---

## 3. Preview Restart Flow (критический путь)

### Контракт после изменения кода на диске

1. `pipeline.iterateProject` (успех) → `restartProjectPreview`
2. `pipeline.revertVersion` → capture `portBeforeKill` → `killExpo` → git checkout → `restartProjectPreview(..., portBeforeKill)`
3. `restartProjectPreview`:
   - `reloading_preview` → `preview_status: starting` + `buildId`
   - kill orphan listener if no ChildProcess handle
   - `killExpo` → `startExpoClearCache` → `waitForMetroReady(60s)`
   - success: `preview_ready` + `preview_status: ready` + synthetic `build_success`
4. Client `ws-handler`: `preview_ready` → `setPreview` + **`bumpPreviewRevision`**
5. Client `build_success` (when `previewStatus === ready`): **ещё один `bumpPreviewRevision`**
6. `preview-panel`: `buildPreviewSrc(baseUrl, port, revision, buildId)` → upsert iframe in LRU pool

### Ключевые файлы

| Файл | Строки / зона |
|------|----------------|
| `agent/src/lib/preview-restart.ts` | 81–146 — весь restart |
| `agent/src/lib/pipeline.ts` | 327 iterate; 344–392 revert |
| `agent/src/services/process-manager.ts` | LRU, `killExpo`, `startExpoClearCache` |
| `src/stores/slices/ws-handler.ts` | 732–743, 784–818, 901–908 |
| `src/features/preview/components/preview-panel.tsx` | 23–28, 169–184 |
| `src/features/preview/lib/preview-frame-pool.ts` | LRU pure logic |

---

## 4. Findings

### 🔴 Critical / High

*На момент снимка нет блокеров CI или data loss. Ниже — продуктовые и эксплуатационные риски.*

| ID | Severity | Finding | Location | Impact |
|----|----------|---------|----------|--------|
| **H1** | High | Metro restart timeout **не эмитит `preview_status: error`** — возвращает `{ restarted: false, port }` | `preview-restart.ts:127-129` | UI застревает в `starting`; пользователь не видит причину |
| **H2** | High | **`revertVersion` без тестов** (unit/integration/e2e) | `pipeline.ts:344-392` | Регресс revert + preview refresh не ловится автоматически |
| **H3** | High (conditional) | **Auth выключен по умолчанию** — `AGENT_LOCAL_TOKEN` unset → все запросы проходят | `local-auth.ts` | OK для localhost; опасно при bind на LAN |

### 🟡 Medium

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **M1** | **Double bump** iframe после restart: `preview_ready` + `build_success` оба вызывают `bumpPreviewRevision` | `ws-handler.ts:741-743, 815` | Мигание UI; лишний reload |
| **M2** | `triggerMetroBuild` failure только `console.warn` | `preview-restart.ts:119-125` | Warm bundle может не стартовать |
| **M3** | `AUDIT.md` B2 «singleton Metro / killAll» **устарел** — сейчас LRU + per-project kill | `process-manager.ts`, `AUDIT.md:339` | Вводит в заблуждение при ревью |
| **M4** | `iteration_result` vs `iteration_complete` — два канала, dedup в handler хрупкий | `ws-handler.ts:855-868`, `server.ts` | Легко сломать дублирование чата |
| **M5** | Malformed WS от agent → **silent drop** (`parseIncomingWsMessage` → null) | `ws-messages.ts:376-381` | Нет user-visible ошибки |
| **M6** | CI e2e **исключает 19/26 тестов** (Metro timing, shared fixture deletion) | `playwright.e2e.ci.config.ts` | Регрессии в happy-path не ловятся в CI |
| **M7** | Expo dev process **периодически падает** (`exited with code 1`) после bundle | `npm run dev` / concurrently | UI недоступен, agent жив |
| **M8** | Destructive ops: header `x-app-factory-confirm` — не секрет | `route-guards.ts` | Нужен `ALLOW_DANGEROUS_PROJECT_OPERATIONS=false` в prod |

### 🟢 Low / Suggestions

| ID | Finding | Location |
|----|---------|----------|
| **L1** | Native preview unwired (placeholder) | `preview-panel.tsx:100-119` |
| **L2** | Metro ENOENT spam по `@tamagui/*/node_modules/*` в template_cache | dev logs |
| **L3** | `refreshPreviewBundle` unused in production path | dead code candidate |
| **L4** | `bestOfN` читает `process.env` напрямую (partial DI debt) | `pipeline-codegen-phase.ts` |
| **L5** | WS token в query string при auth | `api-client.ts`, `local-auth.ts` |
| **L6** | `@deprecated` aliases не удалены | `plan-brief.ts`, `generation-state.ts` |

---

## 5. Корневая причина: stale preview после iteration (Windows)

**Симптом:** файлы на диске обновлены (`Hello from iteration`), iframe показывает старый текст (`Hello from fixture`).

```
Почему 1: iframe не перезагружается при HMR/rebundle на том же порту
   ↓
Почему 2: bump на iteration_complete гонялся с Metro debounce (~2s)
   ↓
Почему 3: iterate/revert не перезапускали Metro если порт «осиротел»
   ↓
Почему 4: не было единого контракта «disk change → clear cache restart → client reload»
   ↓
Почему 5: архитектурный gap между agent process lifecycle и client cache-bust
```

**Текущий fix (в main):** `restartProjectPreview` + client bump on `preview_ready`/`build_success` + `buildId` in iframe src.

**Остаточные риски:** M1 (double bump), H1 (timeout UX), нет e2e revert.

---

## 6. Test Coverage Matrix

### ✅ Хорошо покрыто

| Area | Tests |
|------|-------|
| Preview restart core | `agent/src/lib/preview-restart.test.ts` |
| Process LRU eviction | `agent/src/services/process-manager.eviction.test.ts` |
| WS handler (preview, iteration fail) | `src/stores/slices/ws-handler.test.ts` (33 cases) |
| WS contract / schema | `ws-contract.test.ts`, `ws-messages.test.ts` |
| Frame pool | `preview-frame-pool.test.ts` |
| E2E iterate refresh | `e2e/web-preview-refresh.spec.ts` |
| Pipeline gates / typecheck | `pipeline-typecheck-gate.test.ts` (incl. STRICT_REGRESSION_GATE) |

### ❌ Пробелы

| Gap | Risk | Suggested test |
|-----|------|----------------|
| `revertVersion` end-to-end | High | integration: mock git + assert WS sequence |
| Metro restart failure | Medium | `preview-restart.test.ts`: `waitForMetroReady` false → expect error WS |
| `reloading_preview` handler | Low | ws-handler test: chat + state |
| `preview-panel.tsx` component | Low | placeholder vs waking vs error |
| `use-websocket.ts` reconnect | Medium | resync after disconnect |
| E2e revert → iframe update | High | Playwright + VersionTimeline |
| `killOrphanedListenerOnPort` | Low | platform mock |

---

## 7. E2E & Harness

### Playwright specs (10 files, 26 tests)

| Spec | Tests | CI? |
|------|-------|-----|
| `web-settings-persistence` | 5 | ✅ |
| `web-navigation-stability` | 3 | ✅ |
| `web-preview-error-state` | 1 | ✅ |
| `web-happy-path` | 1 | ❌ |
| `web-preview-refresh` | 2 | ❌ |
| `web-chat-history` | 3 | ❌ |
| `web-concurrent-chats` | 3 | ❌ |
| `web-offline-recovery` | 3 | ❌ |
| `web-error-recovery` | 2 | ❌ |
| `web-project-deletion` | 3 | ❌ |

### Standalone (не в CI, нужен LM Studio)

- `e2e/mass-test-50.mjs` — 50-app marathon, win-rate gate
- `e2e/functional-smoke.mjs` — runtime smoke на live preview
- `e2e/preview-smoke.mjs` — render + interactivity
- `e2e/grand-soak-test.mjs`, `ultimate-test.mjs`

### Harness

- `e2e/support/global-setup.ts` — mock LLM :1235, agent :3100, expo :8081
- `e2e/support/mock-openai-server.mjs` — deterministic plan/iteration
- `e2e/support/runtime-manager.ts` — cross-platform spawn (Windows `.cmd` fix applied)

---

## 8. Security Snapshot

### ✅ Исправлено (см. AUDIT Round 2)

- WS origin allowlist
- Optional `AGENT_LOCAL_TOKEN`
- `npm install --ignore-scripts`
- Dependency char validation (`UNSAFE_SPEC_CHARS`)
- SSRF redirects `redirect: "manual"` in `llm-url.ts`
- Path traversal guards in file routes

### ⚠️ Residual

| Item | Default | Recommendation |
|------|---------|----------------|
| Auth | OFF if no token | Document; warn on non-loopback bind |
| Dangerous ops | ON unless `ALLOW_DANGEROUS_PROJECT_OPERATIONS=false` | Set false in any shared env |
| `shell: true` on Windows | mitigated by validator | Audit new spawn sites |
| No project count limit | unbounded | Backpressure / queue depth cap |

**Secrets:** live keys не найдены; `.env.example` с placeholder.

---

## 9. Open Debt (TODO.md + AUDIT.md)

### Требует окружения

- [ ] `functional-smoke.mjs` против живого preview — расширить сценарии (form input, assertions)
- [ ] Решить судьбу `STRICT_REGRESSION_GATE` — mass-test до/после, включить по умолчанию если win-rate OK

### Отложено осознанно

- [ ] `validateFileContracts` arity — false positives
- [ ] SEARCH/REPLACE uniqueness — tradeoff success rate

### AUDIT.md — вероятно устарело (проверить Opus)

| Item | AUDIT status | Current code hint |
|------|--------------|-------------------|
| B2 singleton Metro | Open | LRU + per-project in `process-manager.ts` |
| B1 Metro leak on build fail | Open | `killExpo` in codegen fail path |
| E4 SSRF redirects | Open | `redirect: "manual"` present in `llm-url.ts` |
| G3/G4 false-green e2e | Partial | mostly fixed; check remaining `isVisible().catch` |

---

## 10. Рекомендации (приоритет для Opus)

### P0 — быстрые, низкий blast radius

1. **H1:** emit `preview_status: error` + message when `waitForMetroReady` fails in `restartProjectPreview`
2. **M1:** dedupe bump — оставить только в `preview_ready` (там уже fresh `buildId`)
3. **M3:** обновить `AUDIT.md` B2/B1/E4 статусы или пометить FIXED

### P1 — тесты

4. **H2:** unit/integration test for `revertVersion` WS sequence
5. E2e: revert via VersionTimeline → iframe content matches reverted commit
6. `preview-restart.test.ts`: failure path assertions

### P2 — CI / infra

7. Вернуть в CI `web-preview-refresh` когда Metro stable на 2-core runners
8. `STRICT_REGRESSION_GATE` experiment per TODO.md
9. Metro ignore list для template_cache ENOENT (L2)

### P3 — архитектура (не срочно)

10. Единый outbound schema validation on agent
11. `iteration_result` deprecation → только `iteration_complete`
12. Native preview surface (L1)

---

## 11. Три варианта fix для M1 (double bump)

| Критерий | A: bump только preview_ready | B: bump только build_success | C: debounce bump 100ms |
|----------|------------------------------|------------------------------|------------------------|
| Суть | reload when Metro port+buildId known | reload when bundle ready | coalesce двух events |
| Время | быстро | быстро | средне |
| Риск | низкий | средний (race if preview still starting) | низкий |
| Побочки | нет | revert path may miss reload | timer edge cases |
| **Рекомендую** | ✅ | ❌ | ○ |

---

## 12. Вопросы для Opus

1. Достаточно ли `buildId` в query string без `revision` bump, или нужны оба?
2. Стоит ли `restartProjectPreview` блокировать `iteration_complete` до `preview_ready` (сейчас ordering implicit)?
3. Как безопасно расширить CI e2e без flaky Metro на GitHub 2-core?
4. Включать `STRICT_REGRESSION_GATE` по умолчанию — какой порог win-rate regression acceptable?
5. Нужен ли revert e2e в P0 или достаточно integration test?

---

## 13. Команды для воспроизведения

```bash
# Полная проверка
npm run check

# Dev (agent :3100 + UI :8081)
npm run dev

# E2E preview refresh (local, ~3 min)
npm run test:e2e:web -- e2e/web-preview-refresh.spec.ts

# CI subset
npm run test:e2e:web:ci

# Functional smoke (live preview URL required)
node e2e/functional-smoke.mjs http://127.0.0.1:<metro-port> workspace/<project>
```

---

## 14. Changelog context (recent main)

Последние значимые коммиты от preview/harness work:

- `983989a8` — e2e cascade fixes; preserve preview on failed iteration
- `974db178` — iframe reload after iteration (Metro restart + client bump)
- `0f63bd0d` — shared `preview-restart.ts`, orphan port reclaim
- `df8b58aa` — merge harness Phase 1–4
- `91dc0719` — TODO.md audit remainder

---

*Документ сгенерирован для handoff в Opus. При расхождении с кодом — код wins.*

---

## 15. Round 4 — Resolution (Opus, 2026-06-14)

> Снимок после серии фиксов. База: **agent 599 (+1 skip) · frontend 126**, оба typecheck чисты, CI green.

**Закрыто и заперто тестами:**

| ID | Статус | Где |
|----|--------|-----|
| **H1** Metro restart timeout без терминального события | ✅ CLOSED | `preview-restart.ts:127` эмитит `preview_status:error`; `preview-restart.test.ts` |
| **H2** `revertVersion` без тестов | ✅ CLOSED | `pipeline-revert.test.ts` (hash/git-fail/happy/no-port) |
| **M1** double-bump iframe | ✅ CLOSED | one-shot по `buildId` в `ws-handler.ts` — точнее варианта A: сохраняет in-place HMR-reload; +тест |
| **M3** устаревший AUDIT | ✅ CLOSED | Round 4 в `AUDIT.md`; противоречие Round 2/3↔4 помечено historical |
| **M5** silent WS-drop | ✅ CLOSED | `describeDroppedMessage` (тип+payload) в `ws-resilience.ts` |
| **C4** reconnect-resync без тестов | ✅ CLOSED | `shouldResyncActiveProjectOnReconnect` + `ws-resilience.test.ts` |
| **TS2578** `@ts-expect-error` убивал превью | ✅ CLOSED | `stripSuppressionDirectives` в `code-style-repairs.ts` |
| **H3/M8** (выбор: **local-only**) | ✅ CLOSED | `describeInsecureBind` warn на non-loopback bind + `.env.example` doc |
| **§6** `reloading_preview` тест (≡ handoff P1 #7) | ✅ CLOSED | `ws-handler.test.ts` |
| **§6** `killOrphanedListenerOnPort` тест | ✅ CLOSED | `preview-restart.test.ts` (unix + win, platform-guarded) |
| **L3** dead `refreshPreviewBundle` | ✅ CLOSED | удалён (ноль прод-вызывателей) |
| **L6** deprecated-алиасы | ✅ CLOSED | мигрированы на канон + удалены (`formatPlanBrief`/`summarizePlanForChat`/`saveProjectPlan`) |

**Решение владельца:** **H3/M8 → только локальный запуск** (бинд `127.0.0.1`, auth не требуется; страж предупреждает при случайной LAN-экспозиции).

**Остаётся (вне песочницы — см. `OPUS_HANDOFF.md`):** M2 · M6 (CI e2e 7/26) · M7 · A3 (`json_schema`) · e2e revert spec (P1) · `functional-smoke`/`STRICT_REGRESSION_GATE` (env) · L1/L2/L4/L5 (косметика/конфиг).

**Ответы на §12:** (1) нужны ОБА — `buildId` форсит reload на свежий Metro, `revision` даёт Refresh + in-place HMR; (2) не нужно — корректность держится на `buildId`+`revision`+one-shot; (3) nightly/self-hosted джоба с retries + longer-timeout, PR-CI на детерминированном сабсете; (4) `STRICT_REGRESSION_GATE` по умолчанию при регрессе win-rate ≤ ~2% (нужен mass-test); (5) интеграционного `pipeline-revert.test.ts` достаточно для P0, e2e — P1.
