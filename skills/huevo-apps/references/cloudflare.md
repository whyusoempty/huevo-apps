# Стек и деплой: Cloudflare Workers + D1

Рабочая схема: один Worker отдаёт и статику (Assets), и API на одном origin. Это важно для фрейма (origin должен совпадать с адресом в настройках huEVO, редиректов нет).

## Структура

```
package.json            vite, preact, hono, wrangler, typescript, @cloudflare/workers-types
tsconfig.json           jsx: react-jsx, jsxImportSource: preact, types: [@cloudflare/workers-types]
vite.config.ts          root: src/web, outDir: ../../dist, plugin @preact/preset-vite, proxy /api → :8787
wrangler.jsonc          main: src/worker/index.ts, assets: ./dist
migrations/0001_*.sql   схема D1
src/worker/             index.ts (Hono), huevo.ts, crypto.ts, validate.ts, env.ts
src/web/                index.html, main.tsx, App.tsx, api.ts, sdk.ts, router.ts, pages/, styles.css
src/shared/             константы и лимиты для обеих сторон
scripts/smoke.mjs      смоук-тест API
```

## wrangler.jsonc

```jsonc
{
  "name": "my-app",
  "main": "src/worker/index.ts",
  "compatibility_date": "2025-01-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/img/*"]
  },
  "d1_databases": [{ "binding": "DB", "database_name": "my-app", "database_id": "…", "migrations_dir": "migrations" }],
  // "routes": [{ "pattern": "app.example.com", "custom_domain": true }],
  "triggers": { "crons": ["*/10 * * * *"] },
  "vars": { "HUEVO_CLIENT_ID": "", "ADMIN_IDS": "", "COMMISSION_PCT": "10", "DEV_LOGIN": "0" }
}
```

Секреты (**не в файле**): `HUEVO_CLIENT_SECRET`, `JWT_SECRET`.

Два конфига: общий `wrangler.jsonc` (заглушки, в git) и локальный `wrangler.<имя>.jsonc` с реальным `database_id`, доменом и `HUEVO_CLIENT_ID` (деплой `wrangler deploy -c wrangler.<имя>.jsonc`; в архив для передачи его лучше не класть).

## Команды

```bash
npm install
npx wrangler login
npx wrangler d1 create <name>                         # id вписать в конфиг
npx wrangler d1 migrations apply DB --remote -c <cfg> # повторить при ошибке «fetch failed»
printf '%s' "$SECRET" | npx wrangler secret put HUEVO_CLIENT_SECRET -c <cfg>
npx wrangler secret put JWT_SECRET -c <cfg>           # можно пайпом: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | ...
npx vite build && npx wrangler deploy -c <cfg>
```

Локально: `.dev.vars` (в git не класть) с `HUEVO_CLIENT_SECRET`, `JWT_SECRET`, `DEV_LOGIN=1`, `ADMIN_IDS`; `wrangler d1 migrations apply DB --local`; `vite build && wrangler dev --port 8787`. Для чистой базы в тестах: `--persist-to ./.wrangler/<dir>` и для миграций, и для `dev`.

Данные на удалённой базе трогать: `wrangler d1 execute DB --remote -c <cfg> --command "…"` или `--file x.sql` (путь относительный, внутри проекта; временные файлы удаляй). Для BLOB в SQL используй `x'<hex>'`.

## Hono

```ts
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
app.use('/api/*', auth)                  // публичные: /api/login, /api/config, /api/callback/payment
export default { fetch: app.fetch, async scheduled(_e, env, ctx) { ctx.waitUntil(...) } };
```

Для `/img/:id` и прочих публичных путей добавь их в `run_worker_first`, иначе их перехватит SPA-фолбэк.

## Тарифы (проверено 2026-10)

Free: Workers 100 000 запросов/сутки, 10 мс CPU на вызов; D1 5 млн чтений и 100 000 записей строк в сутки, 5 ГБ. Статика и трафик бесплатны. Paid $5/мес (10 млн запросов, 25 млрд чтений, 50 млн записей). Картинки через воркер считаются запросами: если их много, переходи на R2 (нужна карта) или кэшируй.

## Фронтенд

- Хэш-роутинг (`#/t/5`): сервер не нужен, перезагрузка внутри фрейма не ломается.
- Вёрстка mobile-first, `max-width: 640px` по центру.
- Тосты и модалки свои. Никаких `alert`.
- Не показывай «тестовый режим» баннером постоянно (пользователей раздражает), предупреждай только там, где это важно (окно доната).
- Сборка в Windows/Git Bash: heredoc с обратными кавычками и `\n` часто ломает файлы. Создавай файлы инструментом записи, а не `cat <<EOF`, и не вставляй `\n` внутрь строк через скрипты, используй `String.fromCharCode(10)` или раздельные строки.
- `npm install` может упасть на peer-зависимости `@cloudflare/workers-types` и `wrangler`: ставь ту версию `workers-types`, которую просит `wrangler` (посмотри в сообщении `ERESOLVE`).
