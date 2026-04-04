<!-- Updated for LM Studio-only setup so the public docs match the single supported local provider. -->
# ⚡ App Factory

**Generate full React Native apps from natural language. Runs 100% locally.**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2055-black)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-117%20passing-brightgreen)]()

Describe an app → AI plans, generates, builds, and previews it — all on your machine. No cloud. No API keys. No limits.

## How it works

1. **Describe** your app in natural language
2. **AI plans** the architecture (routes, components, hooks, stores)
3. **AI generates** every file with TypeScript + React Native + Expo
4. **Metro builds** and shows live preview in the browser
5. **Iterate** via chat — AI edits code with SEARCH/REPLACE blocks

## Quick Start

```bash
# Prerequisites: Node.js 20+, LM Studio with a coding model

git clone https://github.com/antsincgame/experement2.git
cd experement2
npm install && cd agent && npm install && cd ..
npm run dev
```

Open http://localhost:8081 and start building.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Expo 55 + React Native Web + NativeWind |
| Backend | Express + WebSocket + ts-morph |
| LLM | LM Studio (OpenAI-compatible local API) |
| State | Zustand |
| Validation | Zod + JSON Export Contracts |

## Features

- 🧠 **JSON Contract-Driven Development** — LLM sees exact export signatures, prevents import/export mismatches
- 🔄 **Auto-fix loop** — if code breaks, AI fixes it automatically (max 2 retries)
- 📝 **Markdown in chat** — code blocks with syntax highlighting
- 🎯 **Export signature validation** — catches `import { X }` vs `import X` mismatches before Metro
- 🔍 **Event Log** — full pipeline visibility with filters (ERROR/WARN/INFO)
- ⚡ **Multi-project preview** — each project gets its own proxy URL
- 🎨 **Aurora glassmorphism UI** — beautiful cyan-pink gradient design
- 🛡️ **3 layers of error protection** — prompts, sanitizer, build verification loop

## Recommended Models

| Model | Size | Best for |
|-------|------|----------|
| Qwen 3 Coder 30B (Q4_K_M) | ~18 GB | Generation (128k context) |
| Qwen 2.5 Coder 32B | ~20 GB | High accuracy |
| GLM 4.7 Flash | ~18 GB | Fast enhance/planning |

## Project Structure

```
├── src/                    # Frontend (Expo Web)
│   ├── app/                # Expo Router pages
│   ├── features/           # Chat, Explorer, Preview, Settings
│   ├── shared/             # Components, hooks, utils
│   └── stores/             # Zustand state management
│
├── agent/                  # Backend (Node.js)
│   ├── src/lib/            # Pipeline, Generator, Editor, Contracts
│   ├── src/services/       # LLM proxy, Process manager, File manager
│   ├── src/prompts/        # System prompts for Planner/Generator
│   └── src/schemas/        # Zod validation schemas
│
└── workspace/              # Generated projects live here
```

## Contributing

Pull requests welcome! See [issues](https://github.com/antsincgame/experement2/issues) for open tasks.

## License

[MIT](LICENSE)
