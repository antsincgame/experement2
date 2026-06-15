# App Factory — Аудит багов и недодуманностей

> Статус: **полный** — кластеры A–G + **Round 2** (проверка фиксов, в конце документа).
> Метод: 6 параллельных разборов по подсистемам + ручная верификация всех критичных находок по коду.
> Режим: **только анализ, без правок кода.**

## Как читать

- **Severity:** 🔴 Critical/High · 🟡 Medium · 🟢 Low/недодуманность
- **Confidence:** ✅ Confirmed (проверено по коду обеих сторон) · ◐ Likely · ◌ Suspect
- Ссылки вида `файл:строка` указывают на момент аудита (`main` @ `c5a42c0d`).

## Здоровье базы (на момент аудита)

- `tsc --noEmit` (agent + frontend): **чисто**.
- Тесты: **agent 275/275, frontend 27/27** зелёные.
- Lint: 1 реальный варнинг (+ шум ненайденного CodeMirror — артефакт песочницы без сети).
- Нет `any` / `@ts-ignore` / `TODO`-маркеров в проде. Типобезопасность сильная.

**Вывод:** объективная база здоровая; перечисленное ниже — логические и дизайнерские дефекты, которые не ловятся типами и тестами. Многие отказы происходят **тихо** (≈50 `catch {}` без логирования), поэтому в проде они выглядят как «непонятно почему не сработало».

> ⚠️ Один High-claim авто-разбора я **опроверг** при верификации: «truncation-continuation срабатывает на каждом файле» — на деле системный промпт (`prompts/system-generator.ts:152`) требует `// EOF`, поэтому проверка корректна. Понижено до Low. Детали — в разделе «Понижено / не баги».

---

## Кластер A — Хрупкость генерации (бьёт по win-rate)

Цепочка «ответ модели → JSON/блоки» рвётся тихо, особенно на reasoning-моделях (Qwen3/DeepSeek-R1). Это, вероятно, **главный источник недогенераций**.

### A1 — `stripThinkingFromText` стирает реальный контент 🔴 High ✅
`agent/src/lib/strip-thinking.ts:3`
Паттерн `/[\s\S]*?<\/think>/gi` не якорится на открывающий `<think>`. Он удаляет всё от начала строки до первого `</think>`. Для вывода вида `{json}<think>рефлексия</think>` или контента **между** двумя think-блоками — удаляется реальный JSON, который ждут планнер/editor.
**Fix-направление:** якорить на пару тегов `<think>…</think>`; контент без открытого тега не трогать.

### A2 — Незакрытый `<think>` глотает весь поток (0 правок, без ошибки) 🔴 High ✅
`agent/src/lib/stream-parser.ts:118-128` + flush `100-115`
В режиме `thinking` при отсутствии закрывающего тега буфер копится бесконечно, а финальный flush отдаёт только `search/replace/code`-буферы — `thinkingBuffer` **не отдаётся**, режим не возвращается в `idle`. Модель, открывшая `<think>` и не закрывшая его, приводит к тому, что editor/auto-fixer применяют **0 блоков и не сообщают об ошибке**.
**Fix-направление:** на конце потока, если остались в `thinking`, попытаться распарсить накопленное как контент; либо таймаут/деградация с явной ошибкой.

### A3 — Структурный JSON-вывод выключен, `json_schema` мёртв 🟡 Med ✅
`agent/src/services/llm-proxy.ts:39-45` · вызовы `planner.ts:37`, `editor.ts:107`
`toApiResponseFormat` всегда возвращает `undefined` (правильно убрали `json_object` — LM Studio отвечал 400). Но теперь планнер и editor-analyze держат JSON **только** на промпте + `safeJsonParse` + (баговый) strip/parse-стек выше. При этом `ApiResponseFormat` имеет ветку `json_schema`, которую LM Studio **принимает**, но она **нигде не строится** — мёртвый код и упущенная надёжность.
**Fix-направление:** генерировать `json_schema` из Zod (`AppPlanSchema`/`EditActionSchema`) и слать его на совместимых серверах.

### A4 — `json-repair` берёт первый ```` ``` ````-блок 🟡 Med ✅
`agent/src/lib/json-repair.ts:23`
Регэксп `/```(?:json)?\s*\n?([\s\S]*?)```/` не якорится на `json` и берёт **первый** фенс. Если модель привела пример в фенсах до настоящего JSON — распарсится пример.
**Fix-направление:** предпочитать ```` ```json ````; при неудаче парсинга перебирать все фенсы.

### A5 — `NaN`/не-конечные значения в эмбеддингах ломают top-K 🟡 Med ◐
`agent/src/lib/vector-store.ts:22-34,54` · `agent/src/services/embeddings.ts:65-73`
`cosineSimilarity` защищает от нулевой нормы, но не от `NaN/Infinity`; валидация вектора — только `Array.isArray` + непустой. `NaN`-score ломает компаратор `b.score - a.score` и может вытеснить хороший чанк из top-K.
**Fix-направление:** отбраковывать векторы с не-`Number.isFinite` компонентами на этапе индексации.

### A6 — Размерность эмбеддингов не проверяется; модель резолвится дважды 🟡 Med ◐
`agent/src/services/embeddings.ts:65-73` · `agent/src/lib/rag-retrieve.ts:77` vs `rag-index.ts`
Единообразие длины векторов не валидируется (ragged-ответ → смешанные размерности). Плюс модель эмбеддинга резолвится **независимо** в index и в retrieve — при рассинхроне (смена модели в окне TTL) размерность запроса ≠ размерности индекса, и `searchTopK` молча отбрасывает все чанки (тихая деградация до keyword-RAG).
**Fix-направление:** валидировать единую размерность; ключевать запрос той же резолвнутой моделью, что и индекс.

---

## Кластер B — Процессы / превью / оркестрация

### B1 — Утечка Metro при фейле/таймауте билда 🔴 High ✅
`agent/src/lib/pipeline.ts:587-756`
В build-loop `createProject` `startExpo` поднимает Metro, но на путях фейла (таймаут, провал гейтов, исчерпан autofix, Metro не готов) функция эмитит ошибку и `return` — **без `killExpo`** (он есть только в `revertVersion:896`). Осиротевший бандлер держит порт и память до следующего `startExpo` (`killAll`) или рестарта.
**Fix-направление:** `try/finally { if (!buildSuccess) killExpo(slug) }`.

### B2 — Metro — синглтон, что противоречит очереди по проектам 🔴 High ✅
`agent/src/services/process-manager.ts:80,124` (`startExpo`/`startExpoClearCache` → `killAll()`)
Любой запуск Metro убивает **все** превью. При этом очередь операций ключуется по `project:<name>` и допускает параллельную работу над **разными** проектами (`project-operation-lock.test.ts:49`). Итог: итерация/создание проекта B молча гасит живое превью проекта A, а `setPreviewPort`/`proxyCache` для A продолжают указывать на мёртвый порт.
**Fix-направление:** либо мульти-Metro (kill только своего проекта), либо честно сериализовать превью глобально.

### B3 — Упавший `initTemplateCache` «залипает» навсегда 🔴 High ✅
`agent/src/services/template-cache.ts:134-168` (особенно `:136`)
При ошибке `npmInstall` IIFE отклоняется, но `cacheInitPromise` **не сбрасывается в `null`**. Любой следующий вызов возвращает тот же отклонённый промис → кэш шаблона невозможно переинициализировать без рестарта сервера, и `createProjectFromCache` (`:175`) будет падать на `await` отклонённого промиса. Один сетевой сбой первого `npm install` = «ничего не создаётся» до перезапуска.
**Fix-направление:** в `catch` сбрасывать `cacheInitPromise = null` (и не выставлять `cacheReady`).

### B4 — Fast-path `start_preview` идёт мимо очереди 🟡 Med ◐
`agent/src/server.ts:~431-504`
Когда порт уже активен, быстрый путь делает probe + `setPreviewPort` напрямую, не через `enqueueProjectOperation`, и гонится с `killAll()` из очередных create/iterate — может объявить `preview_ready` на только что убитый порт.

### B5 — Autofix на превью — fire-and-forget 🟡 Med ◐
`agent/src/server.ts:~539-589`
В `onLog` при `build_error` вызывается `import("./lib/auto-fixer.js").then(autoFix…)` без `await` и вне очереди — пишет файлы проекта параллельно с другими операциями; reject только логируется.

### B6 — Детект `build_success` гоночный 🟡 Med ◐
`agent/src/services/log-watcher.ts:~196-208`
`build_success` эмитится через 2с после строки «Bundled». Ошибка в том же чанке после «Bundled» не проверяется (ранний `return`); успех, чей процесс убили в течение 2с, не эмитится → `waitForBuildOutcome` уходит в таймаут.

### B7 — `proxyCache`/`projectPorts` не чистятся при удалении проекта 🟢 Low ◐
`agent/src/services/event-bus.ts`
Записи удаляются только через `setPreviewPort(name, null)`, который не вызывается при удалении проекта (route `/all` и пересоздание делают `rmSync`, но карты не чистят). Накопление устаревших маршрутов; `/preview/<deleted>` ведёт на мёртвый порт (502/503) вместо 404.

---

## Кластер C — Фронт: состояние и контракт WebSocket

### C1 — Runtime WS диспозится при unmount и не реинициализируется 🔴 High ◐
`src/shared/hooks/use-websocket.ts:251` + `src/app/_layout.tsx:20`
`initializeRuntime()` зовётся один раз при импорте модуля; cleanup `_layout` зовёт `disposeWebSocketRuntime()` (сбрасывает `initialized`, отписывает от смены agent-URL, закрывает сокет). На remount/StrictMode ничего не реинициализирует — соединение и подписка на смену URL мертвы; «самолечится» только следующим исходящим `send()`.

### C2 — Создание проекта подмешивает чат предыдущего 🟡 Med ◐
`src/features/workspace/hooks/use-home-screen-controller.ts:144-148`
`handleCreate` делает `setProjectName(CREATING_PROJECT_SLUG)` (без свопа чата), затем `addMessage` дописывает в `messages` **прошлого** проекта, и это попадает в `projectChats[CREATING…]` → новый проект наследует историю предыдущего.
**Fix-направление:** `switchProject(CREATING_PROJECT_SLUG)` (со снапшотом+загрузкой) либо очистка `messages` до добавления.

### C3 — Статус фоновых проектов не разрешается 🟡 Med ◐
`src/stores/slices/ws-handler.ts:44-69`
Terminal-события (`status`, `preview_ready`, `iteration_complete`, `version_created`) для НЕ-активного проекта отбрасываются `matchesActiveProject` → в сайдбаре проект навсегда «generating», превью/версии не фиксируются. Ветку фона имеет только `plan_complete`.

### C4 — Нет ресинка событий при reconnect 🟡 Med ◐
`src/shared/hooks/use-websocket.ts:205-216`
События, эмитнутые во время разрыва, теряются (нет серверного replay-буфера, нет клиентского запроса состояния при reconnect). Разрыв в середине генерации → UI зависает в `generating`/`building` без терминального события.

### C5 — `iteration_result` — мёртвый член контракта + дрейф имён 🟢 Low ✅
`src/stores/slices/ws-handler.ts` (нет case) · `ws-messages.ts:201` · шлёт `agent/src/server.ts`
Бэкенд после iterate шлёт `iteration_result {appliedBlocks, failedBlocks}`, но фронт его не обрабатывает (есть только `iteration_complete {applied, failed}`, который пайплайн уже эмитит). Функционально не ломает, но контракт несогласован (и разные имена полей).

### C6 — `scaffold_complete` может «угнать» активный проект 🟢 Low ◐
`src/stores/slices/ws-handler.ts:262-283`
При `pendingProjectName === null` гейт не срабатывает и событие безусловно переключает активный проект + грузит файлы — на втором клиенте/после рефреша может перехватить то, что смотрит пользователь.

---

## Кластер D — Мелочи и недодуманности

- 🟢 **≈50 тихих `catch {}`** в `agent/src` — graceful, но отказы не логируются → диагностика вслепую (тема, а не одна точка).
- 🟢 ✅ **Двойной `v1`** — `git.ts:gitInit` коммитит «v1: initial generation», затем `createProject` коммитит «v1: …(build verified)»; `getVersionNumber` = строки лога + 1 → первая итерация помечается **v3**, не v2.
- 🟢 ◐ **`runNativeSmoke` удаляет `android/ios`** в `finally` (`process-manager.ts`) — снесёт закоммиченные нативные папки, если они есть в проекте.
- 🟢 ◐ **`processedMutationRequests`** (`server.ts:~286-313`) — глобальный дедуп bounded-set вместо TTL: коллизия `requestId` между клиентами; вытесненный-и-повторённый запрос перезапустится.
- 🟢 **`llm-proxy`**: бэкофф ретраев не прерывается abort'ом (слот висит до 8с после «Стоп»); 404-fallback не отменяет тело первого ответа; `completeNonStreaming` ретраит неретраябельные 400 4×; `TextDecoder` не флашится в конце; требуется литеральный `"data: "` с пробелом.
- 🟢 **`stream-parser`** (`THINKING_TAGS[13]==[14]`) — дубль; обещанного в комментарии R1-варианта тега нет.
- 🟢 ◐ **`@codemirror/state`** импортится напрямую (`use-web-code-editor.ts:2`), но не объявлен в `package.json` (живёт на хойстинге — сломается на pnpm/строгой установке).
- 🟢 **`useEffect` без зависимости** `setProjectName` (`use-home-screen-controller.ts:56`).

---

## Кластер E — Безопасность

> Контекст угроз: дефолтный бинд `127.0.0.1:3100`, **аутентификации нет вообще**. Несколько находок усиливаются с «нужна зловредная модель» до «любая веб-страница/локальный процесс».

### E1 — Нет проверки origin/auth на WebSocket 🔴 High ✅
`agent/src/server.ts:57` (`new WebSocketServer` без `verifyClient`)
CORS (`:101-103`) — только HTTP-заголовок; браузеры **не применяют** same-origin к WebSocket. Любая открытая жертвой веб-страница (или локальный процесс) делает `new WebSocket("ws://127.0.0.1:3100")` и шлёт `create_project`/`iterate`/`revert_version` → гоняет LLM, пишет файлы, ставит npm, спавнит Metro. Корень-усилитель для E2/E3.
**Fix-направление:** `verifyClient` с origin-allowlist + общий локальный токен для HTTP+WS.

### E2 — `npm install` без `--ignore-scripts` → RCE через postinstall 🔴 High ✅
`agent/src/services/process-manager.ts:176` · выбор пакетов: `dependency-validator.ts`
`args = ["install", ...packages]` — нет `--ignore-scripts`, поэтому `postinstall`-скрипты **выбранных моделью** пакетов выполняются с правами пользователя. Валидатор проверяет лишь существование пакета в реестре, не его безопасность. В связке с E1 — выполнение кода на хосте с зловредной веб-страницы.
**Fix-направление:** `--ignore-scripts` на все `npm install`; задокументировать границу доверия к сгенерированному коду/зависимостям.

### E3 — Версия зависимости не валидируется → инъекция команд (Windows) 🔴 High(Win)/Med(POSIX) ✅
`agent/src/lib/dependency-validator.ts:43` + `process-manager.ts:185` (`shell: isWindows`)
Версия срезается (`dep.replace(/@[\^~]?\d.*$/,"")`), валидируется только **имя**, но в `npm install` идёт **полная строка** (`valid.push(dep)`). `foo@1.0.0;calc.exe` → имя `foo` (валидно), устанавливается полная строка. На Windows (`shell:true`) `;`/`&&` → выполнение произвольных команд. На POSIX — единый argv (не RCE, но невалидированный spec уходит в npm).
**Fix-направление:** валидировать всю строку (имя + semver-диапазон); не `shell:true`.

### E4 — SSRF через следование редиректам 🟡 Med ✅
`agent/src/lib/llm-url.ts:36-55` + все LLM-fetch (`llm-proxy.ts:114,166`, `chat-model.ts:77`, `embedding-model.ts`, `embeddings.ts`, `routes/llm.ts`)
`assertLlmUrl` валидирует только **начальный** URL; ни один fetch не ставит `redirect:"manual"` (Node fetch по умолчанию следует). Allowed-хост, отдавший `302 → http://169.254.169.254/…`, прозрачно проксируется, тело возвращается клиенту. Нет защиты от DNS-rebinding для не-loopback allow-хостов.
**Fix-направление:** `redirect:"manual"` + ре-валидация каждого хопа; пин IP для не-loopback.

### E5 — Нет аутентификации на `/api/*`; «подтверждение» — публичный заголовок 🟡 Med ✅
`agent/src/server.ts:100-120`, `agent/src/lib/route-guards.ts:4-9`
Все маршруты без auth. Деструктив (`DELETE /api/projects/all`, kill) защищён лишь статическим публичным заголовком `x-app-factory-confirm: delete-workspace` (не секрет → останавливает случайность, не атакующего) и `ALLOW_DANGEROUS_PROJECT_OPERATIONS`, который **включён по умолчанию** (`!== "false"`).

### E6 — Альт-кодировки loopback проходят allowlist 🟢 Low ✅
`agent/src/lib/llm-url.ts:9`
`http://2130706433/`, `http://127.1/`, `0.0.0.0` нормализуются в loopback и проходят. Импакт ограничен loopback-классом (модель угроз уже доверяет localhost). Классические обходы (`localhost@evil`, `localhost.evil.com`) корректно блокируются.

### E7 — Нет лимита числа проектов/глубины очереди 🟢 Low ◐
`agent/src/services/project-operation-lock.ts`
Создания сериализуются (хорошо против fork-бомб), но нет потолка на число проектов/глубину очереди; через E1 — disk-fill (npm install + dirs) и CPU (Metro/export) бесконечными creates. Input-size guard'ы (payload 1МБ/10МБ, описание 20k) разумны.

**Проверено и звучит надёжно:** path-traversal (`file-manager.ts` через `path.relative`+`..`-check, двойной слой со схемами — обхода построить не удалось); git-инъекция (`git.ts` `spawnSync` `shell:false`, `-m <msg>` единым argv, hash по `GIT_HASH_PATTERN`); reverse-proxy (`preview-proxy.ts` `target=127.0.0.1:${port}`, порт из внутренней карты — не open-proxy).

---

## Кластер F — Роуты / валидация / статический валидатор

> `validateGeneratedProject` — **жёсткий гейт** (`pipeline.ts`: любая не-`missing_package_dependency` проблема → `success:false`). Его ложные срабатывания напрямую стоят «побед».

### F1 — `IMPORT_PATTERN` ложно извлекает импорт из строки/JSX 🔴 High ✅
`agent/src/lib/project-validator.ts:27-28`
`/\b(?:import|export)\b[\s\S]*?\bfrom\s+["']([^"']+)["']/g` — ленивый `[\s\S]*?` мостит от `export`/`import` до **любого** последующего `from "x"`, включая внутри строкового литерала/JSX. Проверено: `export default function Home(){ return <Text>Built from "scratch"</Text> }` → извлекает `scratch` → не локаль и не пакет → `missing_package_dependency` → авто-установка `scratch` падает → **жёсткий фейл корректного приложения**. `export default function` есть в каждом экране → срабатывает часто. **Топ-кандидат в убийцы win-rate.**
**Fix-направление:** парсить импорты через ts-morph (он уже есть), а не регэкспом; либо требовать импорт в начале строки.

### F2 — Регэксп тела интерфейса обрывается на вложенной `}` 🟡 Med ✅
`agent/src/lib/project-validator.ts:354` · `agent/src/lib/context-builder.ts:118`
`/interface\s+\w+(?:Store|State)\s*\{([^}]+)\}/` — `[^}]+` стопится на первой вложенной `}`. `{ count; settings:{theme:string}; increment; reset }` → видит только `[count, settings]` → ложный `invalid_destructured_key` на `increment/reset`. Мягкий гейт, но жжёт ретраи и может заставить переписать корректный код.

### F3 — `IMPORT_SHAPE_REGEX` неверно разбирает `import type` 🟢 Low/Med ✅
`agent/src/lib/project-validator.ts:340`
`import type { Foo } from "@/types"` → `default="type"`; `import type Foo from "x"` → default-import. Модификатор `type` невидим → неверные подсказки `expected/actual` (мягкий гейт).

### F4 — Нет глобального error-middleware Express 🟡 Med ✅
`agent/src/server.ts`
Нет `app.use((err,req,res,next)=>…)`. Синхронный throw в хендлере без try/catch → дефолтный обработчик Express → **500 с HTML-стектрейсом (утечка внутренностей)**.

### F5 — Незащищённые sync-fs в `GET /` и `DELETE /all` 🟡 Med ✅
`agent/src/routes/project.ts:26-72`
`readdirSync/statSync/rmSync` без try/catch → транзиентная FS-ошибка (гонка с удалением проекта) → throw → через F4 → 500+стектрейс. Остальные маршруты тут обёрнуты.

### F6 — Кэш моделей не ключуется по URL 🟡 Med ✅
`agent/src/routes/llm.ts:106-157`
Один глобальный `modelsCache` без ключа по `baseUrl`. Во время активной генерации запрос за `url=hostB` отдаёт модели `hostA` (TTL 10с).

### F7 — `GET /health` мислейблит и не валидирует ответ 🟢 Low ✅
`agent/src/routes/llm.ts:89-104`
`data.data?.map(...)` в try: не-массивный ответ → throw → ложно «disconnected», хотя сервер доступен; `data` нетипизирован.

**Проверено и звучит надёжно:** алиас/относительные импорты (`resolveImportPath`) с route-groups `(tabs)`; `@/ui` barrel пишется скаффолдом; zod-схемы без `z.any()/passthrough`, внешние входы валидируются; WS discriminated-union отвергает неизвестный `type`.

---

## Кластер G — UI-компоненты и достоверность измерений

> ⚠️ **Мета:** связка G2+G3+G4 означает, что **инструменты измерения сами могут врать** — а ты судишь прогресс (win-rate) именно по ним.

### G1 — `triple_click()` — несуществующий метод Playwright 🔴 High ✅
`e2e/web-settings-persistence.spec.ts:155,184`
В Playwright есть `tripleClick`, не `triple_click` → `TypeError`. Тесты «URL persists/discarded» жёстко падают (или тихо no-op, если внутри `if(hasInput)`).

### G2 — Win-rate захардкожен на деление на 50 🟡 Med ✅
`e2e/mass-test-50.mjs:428-431,448`
`wins/50*100`, `${fails}/50`, `exit(wins>=25?0:1)` — независимо от реально прогнанных. При `MASS_TEST_LIMIT<50` или частичном резюме процент и gate неверны (10 побед из 10 → «20%», exit 1). Должно быть `/results.length`.

### G3 — `enhance()` глотает ошибки, пишет как успех 🟡 Med ◐
`e2e/mass-test-50.mjs:296-298`
`catch { return prompt }` + `data.data || prompt` — 4xx/5xx/пусто неотличимы от успеха, печатается «OK», `enhancedPrompt`=сырой. Ложные «зелёные» в измерении enhance.

### G4 — Паттерн ложных «зелёных» в e2e 🟡 Med ✅
`web-navigation-stability.spec.ts:127,139,144`, `web-settings-persistence.spec.ts:154,183,214,228`, `web-project-deletion.spec.ts:98,146`, `web-offline-recovery.spec.ts:92,148`, `web-error-recovery.spec.ts:92`
Множество assert обёрнуты в `if (hasX){…expect…}` где `hasX=isVisible().catch(()=>false)`. Неверный селектор → блок пропущен → тест зелёный, **не проверив ничего** (+ `aria-label="Close"` не матчит реальный «Close settings»). Сюита переоценивает стабильность.

### G5 — Ctrl+S listener переподписывается на каждый символ 🟢 Low ✅
`src/features/explorer/components/code-viewer.tsx:81-91`
`useEffect([handleSave])`, а `handleSave` зависит от `draft` → на каждый ввод remove/add listener. `chat-input` сделал правильно через ref.

### G6 — CodeMirror контролируемый без `key={filepath}` 🟡 Med ◐
`src/features/explorer/components/code-viewer.tsx:215-240`
Один инстанс на все файлы: при переключении — replace-all транзакция, общая undo-история, риск дрейфа курсора/скролла; массив `extensions` пересоздаётся каждый рендер (реконфиг). `key={filepath}` форсировал бы чистый remount.

### G7 — Возможны дубль-ключи React в narration 🟢 Low ◐
`src/shared/lib/generation-narration.ts` · `generation-activity.tsx:173`
Ключи по `file.path`; повтор пути в одном прогоне → warning/мис-реконсиляция.

**Проверено и звучит надёжно:** MergeView lifecycle (`destroy`+`cancelled`); `chat-input` ref + очистка таймера; `use-websocket` очередь(100)+stale-guards; `use-web-code-editor` `isActive`; `neon-background` web-guard; `chat-message` порядок хуков; persist кап чата(50)/логов(200).

---

## Понижено / проверено и НЕ баг (честность)

- ◯ **«Truncation-continuation на каждом файле»** — **опровергнуто**: `prompts/system-generator.ts:152,193` требуют `// EOF` последней строкой; проверка `!includes("// EOF")` ловит реально обрезанные/непослушные файлы. Понижено до Low (зависит от послушности модели).
- ✅ **SSRF-страж** `assertLlmUrl` (`lib/llm-url.ts`) — корректный host-allowlist (loopback по умолчанию, http(s)-only, отбрасывает path/query). Нюансы редиректов/DNS-rebinding — см. раздел E.
- ✅ **Path-sandbox** `file-manager.ts` (`assertWithinRoot/assertProjectName`) — звучит против traversal/абсолютных путей (доп. проверка — раздел E/F).
- ✅ **Инфлайт-дедуп + TTL-кеш** в `chat-model.ts`/`embedding-model.ts` — `finally{delete}` всегда срабатывает; согласованно.
- ✅ **`corpusHash`** (`rag-corpus.ts`) — инъекционно-безопасные разделители; ключ `model:hash` корректно инвалидируется.
- ✅ **`activeRequestCount`** — check-then-increment синхронен (нет `await` между) — TOCTOU нет.

---

## Итоговые приоритеты

**Win-rate (почему 0/50):**
1. **F1** — ложный импорт из строки/JSX в жёстком гейте → детерминированно валит корректные приложения. Самый конкретный и часто срабатывающий убийца. Чинить через ts-morph.
2. **A1 + A2 + A3** — тихая порча JSON/блоков на reasoning-моделях (strip-thinking, stream-parser, выключенный structured-output).
3. **G2 + G3 + G4** — почини **измерители** прежде всего: win-rate `/50`, проглатывание enhance-ошибок, ложные «зелёные» e2e. Иначе ты не видишь реальный прогресс и можешь «чинить» по ложным сигналам.

**Стабильность/ресурсы:**
4. **B3** — sticky `initTemplateCache`: один сбой `npm install` = создание сломано до рестарта.
5. **B1 + B2** — утечка Metro при фейле билда + синглтон-Metro против очереди по проектам.
6. **C1** — мёртвый WS после remount.

**Безопасность (дёшево и важно, особенно если выходишь за localhost):**
7. **E2 + E3** — `--ignore-scripts` + валидация полной строки зависимости (две маленькие правки закрывают RCE-поверхность).
8. **E1** — origin-allowlist + локальный токен на WS/HTTP (закрывает удалённый триггер для E2/E3).

---

### Сводка по severity

| | 🔴 High | 🟡 Medium | 🟢 Low |
|---|---|---|---|
| A (генерация/RAG) | A1, A2 | A3, A4, A5, A6 | — |
| B (процессы/превью) | B1, B2, B3 | B4, B5, B6 | B7 |
| C (фронт-стейт/WS) | C1 | C2, C3, C4 | C5, C6 |
| E (безопасность) | E1, E2, E3 | E4, E5 | E6, E7 |
| F (роуты/валидация) | F1 | F2, F4, F5, F6 | F3, F7 |
| G (UI/e2e) | G1 | G2, G3, G4, G6 | G5, G7 |
| D (мелочи) | — | — | ~8 пунктов |

**Итого:** ~10 High · ~18 Medium · ~17 Low/недодуманности. База (типы/тесты) здорова — дефекты логические/дизайнерские и преимущественно **тихие**.

---

# Round 2 — проверка фиксов (2026-06-03)

> Коммиты `48221905` (фиксы аудита) и `f688b109` (Планнер 2.0). База после фиксов: **agent 300/300, frontend 28/28, typecheck чист.** Каждый ключевой фикс проверен **по коду**, а не по описанию коммита.

## Починено и верифицировано ✅

| Находка | Как закрыто | Файл |
|---|---|---|
| **F1** ложный импорт из строки | импорты через **ts-morph AST** (не регэксп) | `project-validator.ts:35-72` |
| **F2** ключи store | через ts-morph | `project-validator.ts` |
| **A1** strip-thinking ест JSON | якорь на пару `<think>…</think>` | `strip-thinking.ts:3-7` |
| **A2** незакрытый think глотает поток | flush thinking-буфера в конце | `stream-parser.ts:117-123` |
| **A4/A5/A6** | выбор json-фенса; отбраковка `NaN`/ragged | `json-repair.ts`, `vector-store.ts`, `embeddings.ts` |
| **B1** утечка Metro | `killExpo` в провал-ветке билда | `pipeline.ts:751` |
| **B3** sticky init | `cacheInitPromise=null` в `catch` | `template-cache.ts:166-168` |
| **E2** RCE через postinstall | `npm install --ignore-scripts` | `process-manager.ts:177` |
| **E3** инъекция версии | блок `UNSAFE_SPEC_CHARS` + чистый разбор имени | `dependency-validator.ts:10-29` |
| **F4/F5/F6** | error-middleware; try/catch в роутах; кэш по `baseUrl` | `server.ts`, `routes/*` |
| **C1–C6, G1, G2** | по коду/тестам — на месте | фронт + e2e |

Фиксы честные, с тестами; критичный **F1** закрыт правильным способом (AST, как и рекомендовалось).

## 🆕 N1 — Planner 2.0: лейауты считаются «экранами» → ложное `thin` 🟡 Med ◐
`agent/src/lib/planner.ts:36`
`assessPlanDepth` считает экранами все `app/*.{tsx,jsx}` **без исключения** `app/_layout.tsx` / `app/(tabs)/_layout.tsx`. Если модель включит лейаут в план (генератор всё равно создаёт его сам), простой `_layout + index` даёт `screens=2, stores=0` → ложное `thin=true` → принудительный ре-план «добавь 12-20 файлов».
**Риск (важно для win-rate):** навязанная сложность на простом запросе ↑ поверхность отказа генерации/валидации. Регресс **не покрыт** — `planner.test.ts:64` использует план без `_layout`.
**Концептуально:** депт-гейт оптимизирует «богатство», а не «собираемость» — для голого win-rate это палка о двух концах.
**Fix-направление:** исключить `AUTO_GENERATED_PLAN_FILES`/`_layout` из счётчика `screens`.

## Серые остатки ВНУТРИ фиксов

- 🟢 **A1** — ветка незакрытого `<think>` всё ещё эвристична: `<think>{json}` без пустой строки и без закрытия может обнулить вывод (`strip-thinking.ts:42-53`).
- 🟡 **E2** — глобальный `--ignore-scripts` применяется и к установке **шаблона**; dep, которому нужен postinstall для сборки нативного бинарника, может тихо недо-собраться. Проверить на реальном соаке.
- 🟢 **E3** — `%` и `^` не входят в `UNSAFE_SPEC_CHARS` → на Windows `shell:true` `foo@1%PATH%` расширяется в строку с `;` (узко, Windows-only, model-emitted).
- 🟢 **A2** — блоки, вылитые ВНУТРЬ незакрытого `<think>`, уходят как thinking, а не как правки (вырожденный ввод модели).

## Ещё открыто из аудита (не закрыто фиксами)

> **⚠️ Снимок Round 2 — частично снят в Round 4 (ниже).** `B2` (мульти-Metro), `B1`,
> `E4` перепроверены по коду и помечены **FIXED** в Round 4; актуальный статус — там.
> Таблица оставлена как историческая запись Round 2.

| Severity | Находка | Замечание |
|---|---|---|
| 🟡 (было 🔴) | **E1** WS без origin/auth | severity ↓ — **E2** убрал RCE; удалённый триггер / DoS / запись файлов остаются |
| 🟡 | **G3 + G4** ложные «зелёные» e2e | `isVisible().catch(()=>false)`-гейты ещё в `web-navigation-stability`(2)/`web-offline-recovery`(1)/`web-settings-persistence`(2); `enhance()` глотает ошибки → **измерители частично всё ещё врут** (но G2 win-rate починен — достоверность выросла) |
| 🟡 | **B2** singleton-Metro | `startExpo→killAll()` не тронут: работа над проектом B гасит превью A |
| 🟡 | **E4** SSRF через редиректы | `redirect:"manual"` не добавлен |
| 🟢 | **A3** `json_schema` | всё ещё не формируется (json_object дропается); смягчено фиксами A1/A4 |
| 🟢 | **B4, B5, B7, F3, F7, E5–E7, G5–G7**, бóльшая часть **D** | по списку выше |

## Обновлённые приоритеты

1. **N1** — убрать лейауты из счётчика экранов (дешёвая правка, прямой риск для win-rate на простых запросах).
2. **G3 + G4** — починить измерители до конца (иначе соак-метрики частично слепые).
3. **B2** — singleton-Metro vs очередь по проектам.
4. **E1** — origin-allowlist + локальный токен на WS/HTTP (severity снижена, но стоит закрыть).
5. Остальное открытое — по таблице выше.

---

# Round 3 — фикс зависания на стадии Plan (2026-06-03)

**Симптом (с экрана пользователя):** проект висит на «Plan», план не генерируется. Причина — связка: медленная локальная 31B-модель + Планнер 2.0 форсировал **12–20 файлов** на любой запрос + **тихий** ре-план замораживал UI без прогресса + **N1** (лейауты как экраны) почти всегда триггерил этот ре-план.

**Мягкий фикс (Планнер 2.0 сохранён, но приручён) — `48…`→ запушено:**
- ✅ **N1 закрыт** — `assessPlanDepth` больше не считает `app/_layout.tsx` / `app/(tabs)/_layout.tsx` за экраны (`planner.ts:isRealScreen`), + регресс-тест.
- **Ре-план видимый** — стримит прогресс в UI вместо «заморозки» (`planner.ts` planApp).
- **Промпт смягчён** — масштаб по сложности запроса + приоритет «собираемости» вместо мандата «12-20 файлов / 9=FAILURE / never minimize» (`system-planner.ts`). Глубина для сложных доменов сохранена; описания 1-3 предложения (меньше раздувание JSON → быстрее план).
- **Сетка от зависания** — общий таймаут планнера **180с** → понятная ошибка вместо вечного спиннера (`planner.ts MAX_PLAN_DURATION_MS`).

Это лечит и **N1**, и механизм **N2** (объём → hard-gate) со стороны планнера: меньше/целевее план → быстрее стадия Plan и выше шанс пройти гейты. agent **301/301**, typecheck чист.

> Ещё открыто (по желанию): N2 на стороне гейтов (сделать часть проверок мягкими), B2 (singleton-Metro), G3/G4 (e2e-измерители), E1/E4.
> **(Round 3 запись; B2/E4 сняты в Round 4 ниже.)**

---

# Round 4 — превью-устойчивость + сверка устаревших статусов (2026-06-14)

> По итогам `CODE_AUDIT.md @ 91dc0719` (архивирован → `docs/archive/CODE_AUDIT.md`). База: agent **594/594**, frontend **117/117**, typecheck чист.

## Устаревшие статусы выше — ПЕРЕПРОВЕРЕНО ПО КОДУ, закрыто ✅

| Находка | Прежний статус | Реальность (file:line) |
|---|---|---|
| **B2** singleton-Metro / `killAll` | Open | **FIXED** — мульти-Metro: `MAX_LIVE_PREVIEWS` + `evictToBudget` (LRU, kill только LRU-жертвы), `touchPreview` защищает активный, idle-backstop. `process-manager.ts:40,87,121`. `killAll` остался только для shutdown. |
| **B1** утечка Metro при фейле билда | Open | **FIXED** — `killExpo(projectSlug)` в провал-ветке codegen. `pipeline-codegen-phase.ts:857`. |
| **E4** SSRF через редиректы | Open | **FIXED** — `redirect:"manual"` + ре-валидация каждого хопа на всех LLM-fetch. `llm-url.ts:107`, тест `llm-url.test.ts:66`. |

## Новое в этом раунде (фиксы из CODE_AUDIT.md)

- ✅ **TS2578 «Unused @ts-expect-error» убивал превью** — `stripSuppressionDirectives()` в `sanitizeGeneratedCode` срезает `@ts-expect-error`/`@ts-ignore` из ВСЕХ путей генерации (прод-код не прячет ошибки). `code-style-repairs.ts`, +5 тестов.
- ✅ **M1 double-bump** (точнее варианта A аудита) — one-shot-страж по `buildId` гасит ровно хвостовой `build_success` после `preview_ready`, СОХРАНЯЯ in-place HMR-reload (вариант A «убрать build_success-бамп» регрессировал бы HMR). `ws-handler.ts`, +1 тест.
- ✅ **H1 Metro-restart timeout** — теперь эмитит `preview_status: error` с сообщением вместо тихого `{restarted:false}` → UI выходит из вечного `starting`. `preview-restart.ts:127`, +1 тест.
- ✅ **H2 `revertVersion` без тестов** — интеграционный тест WS-последовательности (валидация хэша, git-фейл, happy-path, restart-no-port). `pipeline-revert.test.ts`, +4 теста.

Контекст: в этой же серии ранее закрыты **#1** (мульти-Metro + keep-alive кэш живого кадра), **#2** (типизированный исходящий WS-контракт — единый источник истины с фронтом), **#4** (разрез god-функции codegen на 5 фаз).

## Остаётся открытым (по CODE_AUDIT.md)

| ID | Что | Почему не сейчас |
|---|---|---|
| **H3 / M8** | auth off by default; dangerous-ops header | дизайн-решение порога доверия (localhost vs LAN) — твой выбор |
| **M6** | CI e2e гоняет 7/26 | инфра: flaky Metro на 2-core GitHub — нужен стабильный раннер |
| **M2** | `triggerMetroBuild` fail только `console.warn` | best-effort warm-bundle; реальный гейт — `waitForMetroReady` (теперь с H1) |
| **M7** | Expo dev падает после bundle | env/процессное, нужен живой прогон |
| **L1–L6** | native preview, ENOENT-spam, dead code, env-DI debt, deprecated-алиасы | низкий приоритет / косметика |

---

# Round 5 — Terra env-dependent остаток (2026-06-15, Cursor @ Windows)

> **Наблюдатель:** Магос Доминус (Дмитрий Орлов) — oversight Terra Round 5.  
> Pre-flight: `npm run check` **green** — agent **600+1 skip**, FE **126**. P0 CI: **6+** прогонов `main` → **success** (последний `af3fd7c9`, run `27517046971`, 5m24s).

## Закрыто на Terra ✅

| Задача | Результат |
|---|---|
| **P1 #5** `web-project-deletion` self-isolation | Throwaway `e2e-throwaway-deletion` + `restoreSharedFixture()`; kill previews перед Clear All; agent `DELETE /all` — kill Metro + retry rmSync + continue-on-error; **3/3** локально (~2.0m × 3) |
| **P1 #6** `web-revert.spec.ts` | Две итерации → revert v2 → iframe `Hello from iteration`; **3/3** локально (~1.1–2.0m) |
| **P1 CI gate** | 6 spec-файлов в `playwright.e2e.ci.config.ts` (см. флаки-таблицу ниже) |
| **P1 nightly** | `.github/workflows/e2e-nightly.yml` — полный `test:e2e:web`, cron 03:00 UTC |
| **global-setup Windows** | `killKnownPreviewProcesses` + EPERM retry перед `rmSync`; warn-and-continue |
| **mock LLM** | `nextTitleFor()` — вторая итерация → `Hello from iteration 2` (revert e2e) |
| **iframe selector** | `Preview ${projectName}` (keep-alive pool), не `App Preview` |

## Флаки-замер (P1 #3-4) — ЗАВЕРШЁН ✅

Скрипт: `e2e/measure-flakiness.ps1`, 5 прогонов × 6 excluded specs (~76m, Terra 2026-06-15). Артефакт: `e2e/flakiness-results.txt`.

| Spec | Pass | Действие |
|---|---|---|
| `web-offline-recovery` | **5/5** | ✅ добавлен в PR-гейт |
| `web-error-recovery` | **5/5** | ✅ добавлен в PR-гейт |
| `web-chat-history` | 1/5 | ❌ не в гейт |
| `web-concurrent-chats` | 0/5 | ❌ не в гейт → **диагностика:** stale selectors (`App Preview`, strict duplicate text); fix в работе |
| `web-happy-path` | 0/5 | nightly only (live Metro) |
| `web-preview-refresh` | 0/5 | nightly only (live Metro) |

## Заблокировано / требует решения ⏸

| Задача | Причина |
|---|---|
| **P2 #8** functional-smoke расширение | Нужен проект с формой + live preview; не прогонялся |
| **P2 #9** `STRICT_REGRESSION_GATE` mass-test | `mass-test-50` ~часы; LM Studio :1234 доступен — отдельный прогон |
| **M7** Expo dev exit 1 | Не reproduцирован изолированно в этой сессии |
| **L2** ENOENT @tamagui | EPERM warn в global-setup; Metro ignore list не добавлен |

## Продуктовый долг (e2e revert)

- Version timeline = только `version_created` WS, не git log → revert e2e: **2 итерации**, click v2.
- `getVersionNumber` до `gitInit` → seed git v1 в e2e.

---

## Статус наблюдения (2026-06-15, под oversight Магоса Доминуса / Д. Орлов)

| Блок §8 | Статус | Примечание |
|---|---|---|
| Pre-flight | ✅ | `npm run check` green |
| P0 CI-гейт | ✅ | 6 spec-файлов, `retries:2`, CI `27517046971` success |
| P1 #3-4 флаки | ✅ | 2×5/5 в гейт; live-Metro → nightly |
| P1 #5 deletion | ✅ | 3/3 + agent resilient delete (`2fc36f9f`) |
| P1 #6 revert | ✅ | 3/3 локально; nightly (live Metro) |
| P2 #8 smoke | ⏸ | не стартовал |
| P2 #9 mass-test-50 | ⏸ | ~часы, LM Studio :1234 |
| M7 / L2 | ⏸ | repro не получен |
| `web-concurrent-chats` | 🔍 | 0/5 batch → **selector drift** (не env): test1 strict dup fix ✅, test3 live Metro timeout — nightly candidate |
