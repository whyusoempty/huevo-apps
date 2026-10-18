# Проверенные шаблоны кода (Cloudflare Workers, TypeScript)

Всё ниже работало в приложении «Тесты» (https://tests.emptygate.xyz). Без внешних зависимостей, на WebCrypto.

## 1. Подпись huEVO и JWT (`crypto.ts`)

```ts
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const sha256 = (data: string) => crypto.subtle.digest('SHA-256', enc.encode(data));

async function hmacKey(raw: ArrayBuffer | string) {
  const keyData = typeof raw === 'string' ? enc.encode(raw) : raw;
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** hex(HMAC_SHA256(SHA256(secret), data)): формула huEVO для hu_hash и коллбека. */
export async function huevoSign(secret: string, data: string) {
  const key = await hmacKey(await sha256(secret));          // ключ = БИНАРНЫЙ sha256
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function safeEqual(a: string, b: string) {            // постоянное время
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// JWT HS256 для своей сессии: signJwt/verifyJwt (base64url, exp в секундах), секрет JWT_SECRET (или client_secret)
```

## 2. Проверка запуска (`/api/login`)

```ts
export async function verifyLaunch(env: Env, params: Record<string, unknown>) {
  const hu: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (k.startsWith('hu_') && typeof v === 'string') hu[k] = v;
  const data = Object.keys(hu).filter((k) => k !== 'hu_hash').sort().map((k) => `${k}=${hu[k]}`).join('\n');
  const expected = await huevoSign(env.HUEVO_CLIENT_SECRET, data);
  if (!safeEqual(expected, hu.hu_hash ?? '')) return null;
  const age = Date.now() / 1000 - Number(hu.hu_ts);
  if (!(age >= 0 && age <= 24 * 3600)) return null;
  return hu;
}
```

Логин: upsert пользователя (`id = hu_user_id`, имя/аватар обновляются при каждом входе), `mode = hu_mode === 'live' ? 'live' : 'test'`, выдать JWT `{sub, mode, exp: +7д}`. Если `banned`, вернуть 403. Клиент: на 401 один раз перелогиниться (`hu_*` из `launchParams()`) и повторить запрос.

Dev-вход для локальной разработки: при `DEV_LOGIN=1` принимать `{dev:{id}}` вместо подписи. **На проде `DEV_LOGIN=0`.**

## 3. Клиентский вход (`App.tsx` / `sdk.ts`)

```ts
const sdk = await loadSdk();                    // грузит скрипт с huevo.su, таймаут 5 с
if (sdk) await sdk.init().catch(() => {});
const params = launchParams();                  // читай один раз при загрузке и кэшируй
const body = params.hu_hash ? { params } : { dev: { id: 1 } };   // dev только локально
const r = await api('/login', { body });        // → { token, mode, user }
```

## 4. Тестовый/боевой режим платежей

`mode` берётся из JWT (то есть из проверенного `hu_mode`), **не из тела запроса**:

```ts
createPayment(env, { user_id: user.id, amount, test: mode === 'test', idempotency_key: `don-${donationId}`, description })
```

## 5. Платёж → выдача (машина состояний, одно место, идемпотентно)

Таблица платежа: `status` ∈ `created → pending → payout_pending → done` (+ `failed`, `expired`), `intent_id UNIQUE`.

```ts
async function settle(env, d) {
  if (['done','failed','expired','created'].includes(d.status)) return d.status;
  if (d.status === 'pending') {
    const intent = await getPayment(env, d.intent_id);               // источник правды
    if (intent.status === 'pending') return 'pending';
    if (intent.status !== 'succeeded') { /* пометить failed/expired, вернуть */ }
    // «захват»: переход pending → payout_pending атомарно (UPDATE ... WHERE status='pending')
  }
  await createCredit(env, { user_id: d.to_user, amount: d.payout, test: !!d.test_mode,
                            idempotency_key: `dp-${d.id}`, reason: '...' });      // ретрай безопасен
  /* пометить done; при ошибке оставить payout_pending (cron повторит), через N дней failed */
}
```

Вызывается из трёх мест: коллбека (`waitUntil`), эндпоинта `POST /api/donate/:id/check` (клиент дёргает после `confirmPayment`, это только ускорение) и cron (`*/10 * * * *`, строки `pending`/`payout_pending` старше минуты).

Для магазина (платная покупка вместо выплаты) тот же каркас: на `succeeded` выдать предмет **один раз** (`UPDATE ... WHERE status='pending'` с проверкой `changes`), без `credits`.

## 6. Коллбек

```ts
app.post('/api/callback/payment', async (c) => {
  const raw = await c.req.text();                                         // СЫРОЕ тело
  const sig = (c.req.header('X-Huevo-Signature') ?? '').trim().toLowerCase();
  if (!safeEqual(await huevoSign(c.env.HUEVO_CLIENT_SECRET, raw), sig)) return c.text('bad signature', 401);
  const { intent_id } = JSON.parse(raw);
  /* найти платёж по intent_id → c.executionCtx.waitUntil(settle(...)) */
  return c.body(null, 204);
});
```

Маршрут коллбека не должен требовать JWT. Статус всё равно перепроверяй через `getPayment`, а не верь телу.

## 7. «Поделиться» картинкой на свою стену (как «Отправить себе на стену» в старом ВК)

```ts
const link = `https://huevo.su/apps/launch/${launchParams().hu_app_id}?start=${code}`;   // deep link
const text = [`Тест «${title}»`, `Пройти тест: ${link}`].join('\n');
const blob = await (await fetch(canvas.toDataURL('image/jpeg', 0.9))).blob();
try {
  const r = await huevo.shareContent({ text, attachment: blob });        // игрок сам выбирает, куда
  if (r.shared) /* засчитать */;
} catch (e) {
  if (e.code === 'unsupported') huevo.share();                          // запасной вариант: ссылка на игру
  else if (e.code === 'rate_limited') /* «подожди минуту» */;
}
```

Картинку рисуй на `<canvas>` **на клиенте**. Чужие картинки (аватар `hu_avatar` с домена huEVO) «пачкают» canvas, и `toDataURL`/`toBlob` падает. Решение: прокси на своём origin (`/api/avatar` берёт `avatar` текущего пользователя из БД, проверяет `https://` и `content-type: image/*`, отдаёт байты). Свои картинки отдавай с того же origin.

## 8. Deep link при запуске

```ts
const code = (launchParams().hu_start ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
if (code.length >= 3) { /* найти сущность по коду на сервере, при успехе go('...') */ }
```

`hu_start` подписан, но придумать значение может любой, поэтому валидируй и ищи в БД как обычный ввод.

## 9. Пользовательские картинки без R2

R2 требует включения и карты. Для небольших картинок хватает D1 BLOB:

- Клиент ужимает в JPEG ≤900px (canvas, перебор качества), сервер принимает только JPEG (магические байты `ff d8 ff`), ≤500 КБ, лимит загрузок в сутки.
- Таблица `images(id TEXT PK, user_id, size, created_at, data BLOB)`, отдача `GET /img/:id` с `Cache-Control: public, max-age=31536000, immutable`.
- Привязка к тесту/сущности только к картинкам, загруженным этим же пользователем (проверка по таблице).
- `run_worker_first: ["/api/*", "/img/*"]` в `assets`.
- Лимит строки D1 около 2 МБ, поэтому держи картинки маленькими. При росте нагрузки перенеси в R2 и добавь кэш.

## 10. Серверные проверки, которые стоит делать всегда

- Права: автор/админ/владелец проверяется на сервере для каждого изменения.
- Антиспам: лимиты на создание, комментарии, донаты в минуту/сутки.
- Тексты: `replace(/\s+/g,' ').trim().slice(0,N)`, запрет ссылок (`https?://|www\.`), рендер только текстом.
- Результат считается на сервере (клиент не получает «правильные ответы» и веса).
- Автоскрытие после N жалоб, админка (ID админов в `ADMIN_IDS`), бан скрывает контент.
