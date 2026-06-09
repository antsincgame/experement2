# TODO

Остаток по аудиту. Контекст и детали — issue #16. Сделанное уже в main, CI зелёный.

## Требует запущенного окружения (LM Studio + пайплайн)
- [ ] **functional-smoke против живого превью.** Прогнать `node e2e/functional-smoke.mjs <preview-url> workspace/<project>`, затем усилить: добавить сценарии из плана (ввод в форму → проверка, что элемент появился), а не только «не падает + не пусто + клик не роняет».
- [ ] **Решить судьбу `STRICT_REGRESSION_GATE`.** Прогнать `mass-test` с `STRICT_REGRESSION_GATE=true` до/после, сравнить win-rate. Если не проседает — включить set-based гейт по умолчанию (сейчас опт-ин в `agent/src/lib/pipeline-typecheck-gate.ts`).

## Отложено осознанно (не делать без данных, что снижает баги)
- [ ] call-site arity check в `validateFileContracts` — regex-арность даёт больше false-positive (default args / rest / перегрузки), чем пользы; типизированное и так ловит tsc.
- [ ] SEARCH/REPLACE uniqueness в `search-replace.ts` — tradeoff: жёсткая уникальность блока может снизить успех правок на итерации.

## Готово (main)
- [x] theming end-to-end (isDark + палитра) — был обрыв plan→render
- [x] инвалидация template-cache по хэшу контракта
- [x] синхрон промптов editor↔generator (`@/ui`, не `tamagui`)
- [x] error-fix-store не учит обходным фиксам (`as any` / `@ts-ignore` / `eslint-disable`)
- [x] set-based детект регрессий — опт-ин `STRICT_REGRESSION_GATE`
- [x] `e2e/functional-smoke.mjs` — стартовая версия

## Невалидно (снято)
- ~~кросс-платформенный sanitizeErrorText~~ — `e2e/mass-test-50.mjs` уже кросс-платформенный, ошибка аудита.
