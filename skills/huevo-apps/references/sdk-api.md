# SDK и Apps API

## Параметры запуска (во фрейм, в query, URL-кодированы)

| Параметр | Смысл |
|---|---|
| `hu_app_id` | числовой id приложения |
| `hu_user_id` | id игрока |
| `hu_username` | логин (страница `https://huevo.su/{username}`) |
| `hu_display_name` | отображаемое имя ≤100 |
| `hu_avatar` | абсолютный URL аватара 200×200 |
| `hu_mode` | `live` / `test` |
| `hu_ts` | время подписи, Unix-секунды |
| `hu_start` | значение `?start=` из ссылки (≤512 симв., без управляющих), **подписано**, но содержимое задаёт любой автор ссылки, валидируй как ввод пользователя |
| `hu_hash` | подпись, hex 64 |

### Проверка подписи (сервер)

1. Взять **все** `hu_*` кроме `hu_hash` (значения декодированные).
2. Отсортировать по имени, собрать `имя=значение` через `\n`.
3. Ключ = **бинарный** `SHA256(client_secret)` (32 байта, не hex).
4. `hash = hex(HMAC_SHA256(ключ, строка))`.
5. Сравнить с `hu_hash` за постоянное время.
6. Свежесть: `0 ≤ now − hu_ts ≤ max_age` (рекомендуется ≤24 ч).

Подпись не одноразовая. Дальше выдай свой токен сессии. Код: `patterns.md`.

## SDK

`<script src="https://huevo.su/static/js/huevo-apps-v1.js"></script>` (только с домена huEVO). Глобал `window.huevo`. Свойства: `version`, `protocol` (1), `origin`.

| Метод | Результат | Заметки |
|---|---|---|
| `init({debug?, origins?})` (`origins`: домены huEVO, у платформы их два: `huevo.su`, `huevo.departament.site`; без них SDK отвечает только домену скрипта; то же задаёт `data-origins` на теге script) | `{protocol, app_id, mode, user{id,username,display_name,avatar}, start, launch}` | **не верифицировано**; повторный вызов даёт тот же промис; `origins` нужен при сборке SDK в бандл |
| `confirmPayment(intentId)` | `{intent_id, status, test, error?}` | окно оплаты; таймаут 360 с; результат **не доверенный** |
| `share()` | `{shared}` | без аргументов, шарит только `https://huevo.su/apps/launch/{app_id}`; Web Share или копирование ссылки |
| `shareContent({text, attachment})` | `{shared}` | окно «Поделиться» huEVO: игрок выбирает свою стену / сообщество / личку и пишет комментарий. `text` ≤4000 (без HTML), `attachment` **только `Blob`/`File`** jpeg/png/webp/gif ≤10 МБ; нужен хотя бы один. Ссылка на приложение сама не добавляется, пиши её в `text`. Таймаут 600 с. Получает `pause`/`resume` |
| `openProfile(userId)` | `{opened}` | открыть страницу пользователя |
| `openLink(url)` | `{opened}` | только `http(s)`, ≤2000, без пробелов; игрок видит подтверждение с доменом; единственный способ открыть внешнюю ссылку |
| `fullscreen(on?)` | `{fullscreen}` | |
| `on/off/once(event, cb)` | `huevo` | цепочкой |
| `launchParams()` | `{hu_*}` | синхронно из URL, читай при загрузке (при навигации query может пропасть) |

### События

`visibility {hidden}`, `pause {reason:'dialog'}`, `resume {reason:'dialog'}`, `fullscreen {on}`, `payment {intent_id,status,test,error?}` (после `confirmPayment`). Ставь паузу по `pause` и `visibility.hidden`. Подписывайся **до** вызова методов.

### Ошибки SDK

`Error` с полем `code`: `not_embedded`, `timeout`, `bad_request`, `bad_version`, `unknown_method`, `rate_limited`, `not_allowed`, `unsupported`, `not_found`, `internal`. После `timeout` диалог может остаться открытым, а пока открыт диалог, другие диалоговые вызовы дают `rate_limited`.

### Лимиты SDK

Все вызовы 30 за 10 с; `share`/`shareContent`/`openLink`/`openProfile` по 15 в минуту (в старой версии доков было 3 в минуту, ориентируйся на актуальные доки); `confirmPayment` 5 в минуту; `fullscreen` 10 в минуту (только вызовы с запросом согласия); диалог одновременно один. Таймауты: `init` 10 с, `confirmPayment` 360 с, `share/openProfile/openLink/fullscreen` 120 с, `shareContent` 600 с.

### Deep link

`https://huevo.su/apps/{app_id}?start=<значение>` или `https://huevo.su/apps/launch/{app_id}?start=<значение>` (кнопка «Играть» переносит параметр). Во фрейм приходит как `hu_start`, в SDK как `init().start`. Используй для «зайти к другу», «открыть этот тест», реферальных кодов. Значение URL-кодируй.

## Apps API (только сервер)

База `https://huevo.su/api/apps/v1`. HTTPS, `Authorization: Basic base64(client_id:client_secret)`, тело JSON UTF-8. **CORS нет**, из браузера не вызвать. Ответ всегда JSON с `Cache-Control: no-store`: успех HTTP 200 `{"ok":true,...}`, ошибка `{"ok":false,"error":{"code","message"}}` (message по-русски и может меняться, логика только по `code`).

Общие ошибки: 401 `unauthorized`, 403 `app_blocked`, 429 `rate_limited` (+ `Retry-After`), 500 `internal`. Неверный путь/метод отвечает не в формате API.

| Метод | Запрос | Ответ |
|---|---|---|
| `users.get` | `GET /users/{id}` | `user{id,username,display_name,avatar}`; 404 `not_found` (нет/заблокирован/удалён) |
| `wallet.get` | `GET /wallet` | `balance` (только live), `frozen` |
| `payments.create` | `POST /payments` `{user_id, amount 1..100000, description ≤200?, idempotency_key, test}` | `intent_id (pi_…)`, `status:pending`, `amount`, `user_id`, `test`, `description`, `error`, `created_at` (МСК), `expires_at` (+5 мин), `expires_in`. Ошибки: 400 `bad_request`, 404 `not_found`, 403 `wallet_frozen`, 409 `idempotency_conflict` |
| `payments.get` | `GET /payments/{intent_id}` | те же поля; статусы `pending`, `succeeded`, `failed` (+`error`: `insufficient_funds`, `limit_exceeded`, `wallet_frozen`, `transfer_blocked`), `cancelled` (игрок отказал), `expired` (5 мин). Финальный статус не меняется. 404 если чужой/нет |
| `credits.create` | `POST /credits` `{user_id, amount 1..100000, reason ≤200?, idempotency_key, test}` | `credit_id`, `status:succeeded`, `amount`, `user_id`, `reason`, `test`, `balance`, `created_at`. Ошибки: 404 `not_found`; 403 `not_a_player` (live), `player_restricted` (live), `wallet_frozen`; 409 `insufficient_wallet`, `idempotency_conflict`; 429 `limit_exceeded` (live) |

`test` обязательно boolean (иначе `bad_request`). Неопубликованные приложения всегда в тесте.

**Идемпотентность:** тот же `idempotency_key` + `user_id` + `amount` возвращает первую операцию (даже `expired`), с другими значениями 409 `idempotency_conflict`. Ключи платежей и выплат независимы, test и live независимы.

### Лимиты API

Скользящее окно 60 с, на приложение: 3000 всего, 600 на метод. 429 + `Retry-After`. Лимиты монэток см. platform.md.

## Оплата от игрока: флоу

1. Сервер: `POST /payments` (`user_id` игрока из **сессии**, не из тела запроса клиента!).
2. Сервер отдаёт клиенту `intent_id`.
3. Клиент: `huevo.confirmPayment(intent_id)`; игрок видит сумму, описание, баланс; кнопка «Разрешить» активна через 1 с; окно живёт 5 минут. Подтвердить может только указанный игрок.
4. Сервер узнаёт итог из коллбека и/или `GET /payments/{id}` (опрашивай пока `pending`, даже если `confirmPayment` упал).
5. При `succeeded` выдать покупку **один раз на `intent_id`**.

## Выплата игроку

`POST /credits`, без подтверждения, мгновенно, в пределах баланса кошелька; игрок получает уведомление со ссылкой на приложение и `reason`. Ключ строй из события: `reward-{user_id}-{level}`.

## Коллбек оплат

Настройка во вкладке «API». huEVO шлёт `POST` JSON с заголовками `X-Huevo-Signature`, `User-Agent: huEVO-callback/1`, когда игрок решил: `succeeded`, `failed`, `cancelled`, `expired` (один коллбек на решение; если окно не открывали, истечёт без коллбека). Тело: `event:"payment"`, `app_id`, `intent_id`, `status`, `amount`, `user_id`, `test`, `error`, `ts`.

Подпись: `hex(HMAC_SHA256(SHA256(client_secret), сырое_тело))`, считать по **сырому телу до разбора JSON**, сравнивать за постоянное время. Отвечай любым `2xx` (204). Попыток до 3 (сразу, +3 с, +15 с), таймаут 5 с на сеть и 10 с на попытку, редиректы не выполняются. Доставка «хотя бы раз» и **не гарантирована**, поэтому держи запасной опрос `GET /payments/{id}` по cron. Обработка идемпотентна (дубли по `intent_id`).
