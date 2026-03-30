# ⚡ App Factory

**Локальная фабрика приложений — генерируй React Native (Expo) приложения через чат с локальной LLM.**

Аналог [bolt.new](https://bolt.new) / [lovable.dev](https://lovable.dev), работающий полностью на твоей машине через [LM Studio](https://lmstudio.ai). Без облака, без подписок, без лимитов.

![Expo](https://img.shields.io/badge/Expo_SDK-55-blue?logo=expo)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![LM Studio](https://img.shields.io/badge/LM_Studio-local_LLM-green)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Как это работает

```
Ты описываешь приложение → LLM планирует структуру → генерирует код файл за файлом
→ Metro собирает → Live Preview в iframe → ты дорабатываешь через чат → бесконечно
```

### Архитектура

```
┌─────────────────────┐     WebSocket      ┌──────────────────────┐
│   Frontend (Expo)   │ ◄──────────────►  │  Backend Agent (Node) │
│   localhost:8081    │                    │  localhost:3100       │
│                     │                    │                       │
│  Chat │ Code │ Preview ──iframe──►      │  Preview Proxy        │
│                     │                    │  File Manager → disk  │
│                     │                    │  Metro logs → WS      │
│                     │                    │  LM Studio → :1234    │
└─────────────────────┘                    └──────────────────────┘
```

**Frontend** — Expo Web с Aurora UI, трёхпанельный workspace (Chat | Editor | Preview)

**Backend Agent** — Node.js сервер, который пишет файлы на диск, запускает `expo start`, проксирует LLM, парсит ошибки Metro и автоматически их фиксит

**LM Studio** — локальный LLM inference (рекомендуется Qwen 3 Coder 30B)

---

## Быстрый старт

### Требования

- Node.js 20+
- [LM Studio](https://lmstudio.ai) с загруженной моделью (Qwen 3 Coder 30B рекомендуется)
- GPU с 16+ GB VRAM (для комфортной работы LLM)

### Установка

```bash
# Клонировать
git clone https://github.com/antsincgame/experement2.git
cd experement2

# Frontend
npm install

# Backend Agent
cd agent
npm install
cd ..
```

### Запуск

```bash
# 1. Запусти LM Studio и загрузи модель (Server → Start)
#    Убедись что сервер слушает на localhost:1234

# 2. Backend Agent (терминал 1)
cd agent
npm run dev

# 3. Frontend (терминал 2)
npm run web
```

Открой `http://localhost:8081` — Welcome Screen. Опиши приложение и нажми **Generate**.

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Expo SDK 55, Expo Router v6, NativeWind v4 |
| UI | Lucide React, react-resizable-panels, react-syntax-highlighter |
| State | Zustand v5 |
| Backend | Node.js, Express, WebSocket (ws) |
| LLM | LM Studio (OpenAI-compatible API) |
| AST | ts-morph (скелет проекта) |
| Validation | Zod v3 |

---

## Возможности

### Создание
1. Опиши приложение на естественном языке
2. LLM создаёт JSON-план (файлы, зависимости, навигация)
3. Scaffold из pre-warmed cache (~50ms вместо 60-120s npm install)
4. Генерация кода файл за файлом со стримингом
5. `expo start --web` + Live Preview в iframe

### Итерация
1. Пиши в чат: "Добавь поиск" / "Измени цвет на красный"
2. Двухшаговая система: LLM анализирует какие файлы читать → генерирует SEARCH/REPLACE блоки
3. Точечные правки (не перезапись файлов целиком)
4. Metro hot-reload → превью обновляется мгновенно

### Auto-Fix Loop
- Metro ловит ошибку → Agent отправляет LLM (обрезанную до 500 символов)
- LLM генерирует фикс → применяется → Metro перекомпилирует
- До 3 попыток, потом ошибка показывается в чате

### Версионирование
- Каждая итерация = git commit
- Откат к любой версии через timeline
- `git clean -fd` + `checkout` + `expo start -c` (safe rollback)

---

## Структура проекта

```
├── agent/                    # Backend Agent (Node.js)
│   └── src/
│       ├── server.ts         # Express + WebSocket
│       ├── lib/              # Pipeline, Planner, Generator, Editor, AutoFixer
│       ├── services/         # FileManager, ProcessManager, LLM Proxy, Preview Proxy
│       ├── prompts/          # System prompts для LLM
│       └── schemas/          # Zod-схемы (AppPlan, EditAction, SearchReplace)
│
├── src/                      # Frontend (Expo)
│   ├── app/                  # Expo Router (index.tsx — единый экран)
│   ├── features/             # Chat, Explorer, Preview, Terminal, Settings, History
│   ├── shared/               # Sacred Geometry, Effects, Hooks
│   └── stores/               # Zustand (project-store, settings-store)
│
└── workspace/                # Сгенерированные проекты (на диске)
```

---

## Горячие клавиши

| Комбинация | Действие |
|---|---|
| `Ctrl/Cmd + B` | Показать/скрыть файловое дерево |
| `Ctrl/Cmd + J` | Открыть/закрыть терминал |
| `Ctrl/Cmd + Enter` | Отправить сообщение в чат |

---

## Конфигурация

Настройки через gear-иконку в UI:

- **LM Studio URL** — `http://localhost:1234`
- **Agent URL** — `http://localhost:3100`
- **Temperature** — 0.4 (генерация), 0.3 (планирование)
- **Max Tokens** — 8192

---

## Технические решения

- **SEARCH/REPLACE** вместо перезаписи файлов — 10x экономия токенов при итерациях
- **AST-скелет** через ts-morph — экспорты/импорты/типы без тел функций (~3-5k токенов для 20+ файлов)
- **Pre-warmed template cache** — `cp -r` за 50ms вместо `npm install` за 60-120s
- **Preview proxy** — strip X-Frame-Options/CSP для iframe
- **Metro error parser** — лимит 500 символов (тип + файл + строка + 3-5 строк стека)
- **Двухшаговая итерация** — LLM сначала решает какие файлы прочитать, потом генерирует точечные правки

---

## Рекомендуемая модель

**Qwen 3 Coder 30B** через LM Studio

- Квантизация: Q4_K_M (~18 GB VRAM)
- Контекст: 32k токенов (комфортно в VRAM)
- HumanEval: ~92%

Также работает с: DeepSeek Coder V2, Qwen 2.5 Coder 32B, Mistral Codestral 22B

---

## Roadmap

- [ ] E2E тест: полный цикл создание → итерация → экспорт
- [ ] Monaco Editor вместо react-syntax-highlighter
- [ ] Кроссплатформенные билды (iOS, Android)
- [ ] Сохранение проектов в IndexedDB
- [ ] Import существующего проекта
- [ ] Мульти-модельная поддержка (переключение между LLM)

---

## Лицензия

MIT

---

*Создано с помощью Claude Code. Во славу Омниссии. ⚙️*
