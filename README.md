# ⚡ App Factory

**Локальная фабрика приложений — генерируй React Native (Expo) приложения через чат с локальной LLM.**

Аналог [bolt.new](https://bolt.new) / [lovable.dev](https://lovable.dev), работающий полностью на твоей машине через [LM Studio](https://lmstudio.ai). Без облака, без подписок, без лимитов.

![Expo](https://img.shields.io/badge/Expo_SDK-55-blue?logo=expo)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![LM Studio](https://img.shields.io/badge/LM_Studio-local_LLM-green)
![Tests](https://img.shields.io/badge/tests-100_passed-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Как это работает

```
Описываешь приложение → LLM планирует → генерирует код → Metro билдит
→ Build Verification Loop автофиксит ошибки → Live Preview в iframe
→ дорабатываешь через чат → бесконечные итерации
```

### Архитектура

```
┌──────────────────────────┐     WebSocket      ┌───────────────────────────┐
│   Frontend (Expo Web)    │ ◄──────────────►  │   Backend Agent (Node.js)  │
│   localhost:8081         │                    │   localhost:3100           │
│                          │                    │                           │
│  Sidebar │ Chat │ Code │ │                    │  LLM Proxy → LM Studio    │
│  Preview (iframe)        │ ──────────────►   │  Preview Proxy → Metro     │
│  Aurora UI + Glassmorphism                    │  File Manager → disk       │
│                          │                    │  Auto-Fixer → LLM          │
│                          │                    │  Build Verification Loop   │
└──────────────────────────┘                    └───────────────────────────┘
                                                          │
                                                    ┌─────┴─────┐
                                                    │ LM Studio │
                                                    │ :1234     │
                                                    └───────────┘
```

---

## Ключевые фичи

### 3 слоя защиты от ошибок генерации

| Слой | Тип | Описание |
|------|-----|----------|
| **Промпт** | Превентивный | 9 FORBIDDEN patterns + PRE-FLIGHT checklist + CORRECT templates |
| **Sanitizer** | Автоматический | 9 regex auto-fix: `@/src/`→`@/`, named icons→default, `React.useState`→direct import |
| **Build Loop** | Реактивный | Metro error → LLM fix → recompile → retry (max 3 попытки) |

### Генерация
- Промпт → JSON-план → scaffold из pre-warmed cache (~50ms) → генерация файлов со стримингом
- Dynamic root layout (Stack или Tabs автоматически по плану)
- Build Verification Loop: ждёт Metro, ловит ошибки, автофиксит через LLM

### Итерация (SEARCH/REPLACE)
- Чат: "Добавь поиск" → LLM анализирует файлы → точечные SEARCH/REPLACE блоки
- 10x экономия токенов vs перезапись файлов
- Metro hot-reload → preview обновляется мгновенно

### UI — Cyberpunk Aurora
- Aurora градиент (cyan→pink→gold)
- Glassmorphism панели
- Sidebar проектов (скроллируемый, 100+ проектов)
- Per-project чат (история сохраняется при переключении)
- Sacred geometry (Mandala, FlowerOfLife)
- Enhance промпт через LLM (кнопка ✦)

### Тестирование
- **100 юнит-тестов** (Vitest, 304ms)
- **70+ E2E тестов** через WebSocket (Waves 1-7)
- Stream parser, schemas, file manager, port finder, preview proxy, log watcher

---

## Быстрый старт

### Требования

- Node.js 20+
- [LM Studio](https://lmstudio.ai) с загруженной моделью
- GPU с 16+ GB VRAM (Qwen 3 Coder 30B рекомендуется)

### Установка

```bash
git clone https://github.com/antsincgame/experement2.git
cd experement2

# Frontend
npm install

# Backend Agent
cd agent && npm install && npm run build && cd ..
```

### Запуск

```bash
# 1. LM Studio → загрузи модель → Start Server (localhost:1234)

# 2. Backend Agent (терминал 1)
cd agent && node dist/server.js

# 3. Frontend (терминал 2)
npx expo start --web
```

Открой `http://localhost:8081` → опиши приложение → **Generate**.

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Expo SDK 55, Expo Router v6, NativeWind v4 |
| UI | Aurora gradient, Glassmorphism, Lucide React, Sacred Geometry |
| State | Zustand v4 (per-project chat isolation) |
| Backend | Node.js, Express, WebSocket (ws) |
| LLM | LM Studio (OpenAI-compatible API), auto-detect model |
| Code Gen | SEARCH/REPLACE blocks (Aider-style), AST skeleton (ts-morph) |
| Validation | Zod v3 schemas |
| Testing | Vitest (100 unit tests), E2E WebSocket tests |

---

## Структура проекта

```
├── agent/                    # Backend Agent (Node.js)
│   └── src/
│       ├── server.ts         # Express + WebSocket + Preview Proxy
│       ├── lib/
│       │   ├── pipeline.ts   # Orchestrator: plan→generate→build→verify
│       │   ├── planner.ts    # LLM → JSON plan
│       │   ├── generator.ts  # LLM → code files + sanitizer
│       │   ├── editor.ts     # SEARCH/REPLACE iteration
│       │   ├── auto-fixer.ts # Metro error → LLM fix
│       │   ├── stream-parser.ts # Parse SEARCH/REPLACE from LLM stream
│       │   └── context-builder.ts # AST skeleton (ts-morph)
│       ├── services/
│       │   ├── llm-proxy.ts  # LM Studio API (auto-detect model)
│       │   ├── process-manager.ts # Expo process lifecycle
│       │   ├── file-manager.ts # Workspace CRUD
│       │   ├── preview-proxy.ts # Strip X-Frame-Options for iframe
│       │   ├── template-cache.ts # Pre-warmed Expo template
│       │   └── log-watcher.ts # Metro error parser
│       ├── prompts/          # System prompts (generator, planner, editor)
│       └── schemas/          # Zod schemas (AppPlan, EditAction, SearchReplace)
│
├── src/                      # Frontend (Expo Web)
│   ├── app/index.tsx         # Main screen (Welcome + Workspace)
│   ├── features/
│   │   ├── chat/             # Chat panel, message schema, suggestion chips
│   │   ├── explorer/         # File tree, code viewer, file tabs
│   │   ├── preview/          # Preview iframe (proxy + auto-refresh)
│   │   ├── settings/         # Settings drawer (model selector, test connection)
│   │   ├── terminal/         # Terminal panel (streaming code)
│   │   └── history/          # Version timeline
│   ├── shared/
│   │   ├── hooks/use-websocket.ts # globalThis singleton (HMR-safe)
│   │   └── components/       # Aurora background, Sacred geometry
│   └── stores/
│       ├── project-store.ts  # Per-project state (dual-write pattern)
│       └── settings-store.ts # Persisted settings (localStorage)
│
└── workspace/                # Generated projects (on disk)
    └── template_cache/       # Pre-warmed Expo template
```

---

## Pipeline генерации

```
1. PLAN      LLM → JSON (files[], dependencies, navigation type)
2. SCAFFOLD  cp -r template_cache → workspace/project-name (~50ms)
3. GENERATE  LLM → code per file (streaming, sanitizer post-process)
4. LAYOUT    Dynamic: Stack or Tabs based on plan.navigation.type
5. BUILD     expo start --web → Metro bundler
6. VERIFY    Wait for build result (60s timeout)
   ├─ success → git commit "v1: verified" → preview_ready ✅
   └─ error → auto-fix (LLM reads error, generates SEARCH/REPLACE)
              → recompile → retry (max 3x)
              → still broken → show error to user
7. PREVIEW   iframe via proxy (strip X-Frame-Options/CSP)
8. ITERATE   Chat → SEARCH/REPLACE → Metro hot-reload → repeat
```

---

## Конфигурация

Settings через ⚙️ иконку:

| Параметр | По умолчанию | Описание |
|---|---|---|
| LM Studio URL | `http://localhost:1234` | LLM inference server |
| Agent URL | `http://localhost:3100` | Backend agent |
| Temperature | 0.4 | Генерация кода |
| Max Tokens | 32768 | Максимум на файл |
| Prompt Enhancer | ON | Улучшение промпта через LLM |
| Model | auto-detect | Первая загруженная в LM Studio |

---

## Рекомендуемая модель

**Qwen 3 Coder 30B** через LM Studio

- Квантизация: Q4_K_M (~18 GB VRAM)
- Контекст: 32k токенов
- Auto-detect: агент сам находит загруженную модель

Также работает с: DeepSeek Coder V2, Qwen 2.5 Coder 32B, Mistral Devstral, GLM-4

---

## Тесты

```bash
# Unit tests (100 тестов, <1 сек)
cd agent && npm test

# E2E (генерация 10 проектов через WebSocket)
node e2e-preview-test.mjs
```

| Модуль | Тесты |
|--------|-------|
| stream-parser | 25 (SEARCH/REPLACE, thinking, code fences, streaming) |
| app-plan.schema | 17 (validation, sanitize, navigation) |
| edit-action.schema | 8 (read_files, defaults, strip) |
| search-replace.schema | 9 (types, required fields) |
| log-watcher | 14 (Metro errors, truncation, warnings) |
| file-manager | 14 (CRUD, recursive, path traversal) |
| port-finder | 6 (free port, bind verification) |
| preview-proxy | 7 (headers, CORS, 502 fallback) |

---

## Roadmap

- [x] MVP генерации (plan → generate → preview)
- [x] Итерация через SEARCH/REPLACE
- [x] Auto-fix loop (Metro errors)
- [x] Build Verification Loop
- [x] Per-project chat (dual-write store)
- [x] Sidebar проектов + загрузка с диска
- [x] Prompt Enhancer (✦ кнопка)
- [x] Model auto-detect (LM Studio API)
- [x] 100 юнит-тестов
- [x] 3 слоя защиты генерации (промпт + sanitizer + build loop)
- [ ] Runtime error collector (iframe → postMessage → agent)
- [ ] Monaco Editor вместо syntax highlighter
- [ ] Кроссплатформенные билды (iOS, Android)
- [ ] Export в standalone Expo project
- [ ] Мульти-модельная поддержка

---

## Лицензия

MIT

---

*Создано с помощью Claude Code. Во славу Омниссии. ⚙️*
