import { Hono, type Context } from 'hono';
import { CATEGORIES, LIMITS, type TestContent } from '../shared/const';
import { signJwt, verifyJwt } from './crypto';
import type { Env, UserRow, Vars } from './env';
import {
  HuevoError, createCredit, createPayment, getPayment, verifyCallbackSignature, verifyLaunch,
} from './huevo';
import { ensureSeed, genCode } from './seed';
import { IMAGE_ID_RE, imageIds, scoreTest, validateTest } from './validate';

type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const now = () => Math.floor(Date.now() / 1000);
const err = (c: C, status: number, code: string, message: string) =>
  c.json({ error: { code, message } }, status as any);

const isAdmin = (env: Env, id: number) =>
  env.ADMIN_IDS.split(',').map((s) => Number(s.trim())).filter(Boolean).includes(id);

const jwtSecret = (env: Env) => env.JWT_SECRET || env.HUEVO_CLIENT_SECRET;
const commission = (env: Env) => Math.min(90, Math.max(0, Number(env.COMMISSION_PCT) || 0));

// ---------- публичные ----------

app.get('/api/config', (c) =>
  c.json({ categories: CATEGORIES, limits: LIMITS, commission: commission(c.env) }),
);

app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let user: UserRow;
  let mode: 'live' | 'test' = 'test';

  if (c.env.DEV_LOGIN === '1' && body?.dev) {
    const id = Math.max(1, Number(body.dev.id) | 0) || 1;
    await c.env.DB.prepare(
      `INSERT INTO users (id, username, display_name, avatar, created_at) VALUES (?1, ?2, ?3, '', ?4)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(id, `dev${id}`, `Dev User ${id}`, now()).run();
    user = (await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRow>())!;
  } else {
    const hu = await verifyLaunch(c.env, body?.params ?? {});
    if (!hu) return err(c, 401, 'bad_signature', 'Не удалось подтвердить запуск. Открой игру заново из huEVO.');
    const id = Number(hu.hu_user_id);
    if (!Number.isInteger(id) || id <= 0) return err(c, 401, 'bad_signature', 'Неверный пользователь');
    mode = hu.hu_mode === 'live' ? 'live' : 'test';
    await c.env.DB.prepare(
      `INSERT INTO users (id, username, display_name, avatar, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET username=?2, display_name=?3, avatar=?4`,
    ).bind(id, hu.hu_username ?? '', (hu.hu_display_name ?? '').slice(0, 100), hu.hu_avatar ?? '', now()).run();
    user = (await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRow>())!;
  }
  if (user.banned) return err(c, 403, 'banned', 'Доступ закрыт');

  const token = await signJwt(jwtSecret(c.env), { sub: user.id, mode, exp: now() + 7 * 86400 });
  return c.json({ token, mode, user: publicUser(user), isAdmin: isAdmin(c.env, user.id) });
});

/** Коллбек оплат. Подпись проверяем по сырому телу, итог всё равно сверяем через API. */
app.post('/api/callback/payment', async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header('X-Huevo-Signature') ?? '';
  if (!(await verifyCallbackSignature(c.env, raw, sig))) return c.text('bad signature', 401);
  let intentId = '';
  try { intentId = JSON.parse(raw).intent_id; } catch { return c.text('bad json', 400); }
  const d = await c.env.DB.prepare('SELECT * FROM donations WHERE intent_id=?').bind(intentId).first<any>();
  if (d) c.executionCtx.waitUntil(settleDonation(c.env, d).catch(() => {}));
  return c.body(null, 204);
});

// ---------- авторизация ----------

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/login' || path === '/api/config' || path === '/api/callback/payment') return next();
  const m = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '');
  const payload = m ? await verifyJwt(jwtSecret(c.env), m[1]) : null;
  if (!payload) return err(c, 401, 'unauthorized', 'Нужно войти заново');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first<UserRow>();
  if (!user) return err(c, 401, 'unauthorized', 'Нужно войти заново');
  if (user.banned) return err(c, 403, 'banned', 'Доступ закрыт');
  c.set('user', user);
  c.set('mode', payload.mode);
  await ensureSeed(c.env);
  return next();
});

const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, name: u.display_name || u.username, avatar: u.avatar });

app.get('/api/me', (c) => {
  const u = c.get('user');
  return c.json({ user: publicUser(u), mode: c.get('mode'), isAdmin: isAdmin(c.env, u.id) });
});

// ---------- картинки ----------

app.post('/api/images', async (c) => {
  const u = c.get('user');
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength < 100 || buf.byteLength > LIMITS.imageMaxBytes) return err(c, 400, 'bad_image', 'Картинка слишком большая');
  const head = new Uint8Array(buf, 0, 3);
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return err(c, 400, 'bad_image', 'Нужна картинка JPEG');
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM images WHERE user_id=? AND created_at>?')
    .bind(u.id, now() - 86400).first<any>();
  if (recent.n >= LIMITS.imagesPerDay) return err(c, 429, 'limit', 'Лимит загрузок на сегодня исчерпан');
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await c.env.DB.prepare('INSERT INTO images (id, user_id, size, created_at, data) VALUES (?,?,?,?,?)')
    .bind(id, u.id, buf.byteLength, now(), buf).run();
  return c.json({ id });
});

/** Аватар тек. пользователя через наш origin — иначе canvas с коллажем «пачкается» чужой картинкой. */
app.get('/api/avatar', async (c) => {
  const url = c.get('user').avatar;
  if (!/^https:\/\//.test(url)) return err(c, 404, 'not_found', 'Нет аватара');
  const r = await fetch(url).catch(() => null);
  const type = r?.headers.get('content-type') ?? '';
  if (!r || !r.ok || !type.startsWith('image/')) return err(c, 404, 'not_found', 'Нет аватара');
  return new Response(r.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
});

// ---------- каталог ----------

const LIST_SELECT = `
  SELECT t.id, t.code, t.kind, t.title, t.description, t.cover_emoji, t.cover_grad, t.cover_image, t.category, t.status,
         t.plays, t.finishes, t.likes, t.comments, t.author_id, t.published_at, t.created_at,
         u.display_name AS a_name, u.username AS a_username, u.avatar AS a_avatar,
         EXISTS(SELECT 1 FROM likes l WHERE l.test_id=t.id AND l.user_id=?1) AS liked
  FROM tests t LEFT JOIN users u ON u.id=t.author_id`;

const listItem = (r: any) => ({
  id: r.id, code: r.code, kind: r.kind, title: r.title,
  description: r.description.length > 120 ? r.description.slice(0, 117) + '…' : r.description,
  cover_emoji: r.cover_emoji, cover_grad: r.cover_grad, cover_image: r.cover_image ?? null, category: r.category, status: r.status,
  plays: r.plays, finishes: r.finishes, likes: r.likes, comments: r.comments, liked: !!r.liked,
  author: { id: r.author_id, name: r.a_name || r.a_username || 'Редакция тестов', avatar: r.a_avatar },
});

app.get('/api/tests', async (c) => {
  const u = c.get('user');
  const { sort = 'popular', category, q, offset = '0' } = c.req.query();
  const where = ["t.status='published'"];
  const binds: unknown[] = [u.id];
  if (category && CATEGORIES.some((x) => x.id === category)) { where.push(`t.category=?${binds.length + 1}`); binds.push(category); }
  if (q) {
    where.push(`t.title LIKE ?${binds.length + 1} ESCAPE '\\'`);
    binds.push(`%${q.trim().slice(0, 40).replace(/[\\%_]/g, '\\$&')}%`);
  }
  const order = sort === 'new' ? 't.published_at DESC' : sort === 'top' ? 't.likes DESC, t.plays DESC' : 't.plays DESC, t.published_at DESC';
  const off = Math.max(0, Number(offset) | 0);
  const rows = await c.env.DB.prepare(`${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 21 OFFSET ${off}`)
    .bind(...binds).all<any>();
  const items = rows.results.slice(0, 20).map(listItem);
  return c.json({ items, more: rows.results.length > 20 });
});

app.get('/api/tests/code/:code', async (c) => {
  const code = c.req.param('code').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const t = await c.env.DB.prepare("SELECT id FROM tests WHERE code=? AND status='published'").bind(code).first<any>();
  if (!t) return err(c, 404, 'not_found', 'Тест с таким кодом не найден');
  return c.json({ id: t.id });
});

/** Загружает тест; для чужих неопубликованных — null. */
async function loadTest(c: C, id: number) {
  const u = c.get('user');
  const t = await c.env.DB.prepare(`${LIST_SELECT.replace('t.status,', 't.status, t.content, t.shares,')} WHERE t.id=?2`)
    .bind(u.id, id).first<any>();
  if (!t) return null;
  const owner = t.author_id === u.id || isAdmin(c.env, u.id);
  if (t.status !== 'published' && !owner) return null;
  return { row: t, owner, content: JSON.parse(t.content) as TestContent };
}

app.get('/api/tests/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const t = await loadTest(c, id);
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  const u = c.get('user');
  const my = await c.env.DB.prepare(
    'SELECT result_idx, score, created_at FROM plays WHERE test_id=? AND user_id=? ORDER BY id DESC LIMIT 1',
  ).bind(id, u.id).first<any>();
  const comments = await c.env.DB.prepare(
    `SELECT c.id, c.text, c.created_at, c.user_id, u.display_name AS name, u.username, u.avatar
     FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.test_id=? ORDER BY c.id DESC LIMIT 5`,
  ).bind(id).all<any>();
  return c.json({
    ...listItem(t.row),
    code: t.row.code,
    questionCount: t.content.questions.length,
    resultCount: t.content.results.length,
    shares: t.row.shares,
    canEdit: t.owner,
    played: !!my,
    myResultTitle: my ? t.content.results[my.result_idx]?.title ?? null : null,
    recent_comments: comments.results.map(commentItem),
  });
});

const commentItem = (r: any) => ({
  id: r.id, text: r.text, created_at: r.created_at,
  user: { id: r.user_id, name: r.name || r.username || 'Игрок', avatar: r.avatar },
});

app.get('/api/tests/:id/play', async (c) => {
  const t = await loadTest(c, Number(c.req.param('id')));
  if (!t || (t.row.status !== 'published' && !t.owner)) return err(c, 404, 'not_found', 'Тест не найден');
  return c.json({
    kind: t.row.kind,
    questions: t.content.questions.map((q) => ({ text: q.text, emoji: q.emoji, image: q.image ?? null, answers: q.answers.map((a) => a.text) })),
  });
});

app.post('/api/tests/:id/start', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE tests SET plays=plays+1 WHERE id=? AND status='published'").bind(id).run();
  return c.json({ ok: true });
});

const resultPayload = async (c: C, t: { row: any; content: TestContent }, play: any) => {
  const results = t.content.results;
  const idx = Math.min(play.result_idx, results.length - 1);
  const dist = await c.env.DB.prepare(
    'SELECT result_idx, COUNT(*) AS n FROM plays WHERE test_id=? GROUP BY result_idx',
  ).bind(t.row.id).all<any>();
  const total = dist.results.reduce((s, r) => s + r.n, 0) || 1;
  const same = dist.results.find((r) => r.result_idx === play.result_idx)?.n ?? 1;
  const answers: number[] = JSON.parse(play.answers ?? '[]');
  return {
    kind: t.row.kind,
    result: results[idx],
    teaser: t.content.teaser || '',
    teaser_image: t.content.teaserImage ?? null,
    score: play.score,
    total: t.row.kind === 'quiz' ? t.content.questions.length : undefined,
    percentSame: Math.round((same / total) * 100),
    review: t.row.kind === 'quiz'
      ? t.content.questions.map((q, i) => ({
          question: q.text, answers: q.answers.map((a) => a.text),
          correct: q.answers.findIndex((a) => a.correct), chosen: answers[i] ?? -1,
        }))
      : undefined,
    finished_at: play.created_at,
  };
};

app.post('/api/tests/:id/finish', async (c) => {
  const u = c.get('user');
  const t = await loadTest(c, Number(c.req.param('id')));
  if (!t || (t.row.status !== 'published' && !t.owner)) return err(c, 404, 'not_found', 'Тест не найден');
  const body = await c.req.json().catch(() => ({}));
  const answers: number[] = Array.isArray(body.answers) ? body.answers.map(Number) : [];
  const scored = scoreTest(t.row.kind, t.content, answers);
  if (!scored) return err(c, 400, 'bad_request', 'Неверные ответы');
  const ts = now();
  if (t.row.status !== 'published') {
    // предпросмотр автором: результат считаем, но статистику не пишем
    return c.json(await resultPayload(c, t, { result_idx: scored.resultIdx, score: scored.score, answers: JSON.stringify(answers), created_at: ts }));
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO plays (test_id, user_id, result_idx, score, answers, created_at) VALUES (?,?,?,?,?,?)')
      .bind(t.row.id, u.id, scored.resultIdx, scored.score, JSON.stringify(answers), ts),
    c.env.DB.prepare('UPDATE tests SET finishes=finishes+1 WHERE id=?').bind(t.row.id),
  ]);
  return c.json(await resultPayload(c, t, { result_idx: scored.resultIdx, score: scored.score, answers: JSON.stringify(answers), created_at: ts }));
});

app.get('/api/tests/:id/my-result', async (c) => {
  const u = c.get('user');
  const t = await loadTest(c, Number(c.req.param('id')));
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  const play = await c.env.DB.prepare('SELECT * FROM plays WHERE test_id=? AND user_id=? ORDER BY id DESC LIMIT 1')
    .bind(t.row.id, u.id).first<any>();
  if (!play) return err(c, 404, 'no_result', 'Ты ещё не проходил этот тест');
  return c.json(await resultPayload(c, t, play));
});

app.post('/api/tests/:id/like', async (c) => {
  const u = c.get('user');
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare("SELECT id FROM tests WHERE id=? AND status='published'").bind(id).first();
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  const del = await c.env.DB.prepare('DELETE FROM likes WHERE user_id=? AND test_id=?').bind(u.id, id).run();
  let liked = false;
  if (del.meta.changes) {
    await c.env.DB.prepare('UPDATE tests SET likes=MAX(0,likes-1) WHERE id=?').bind(id).run();
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT OR IGNORE INTO likes (user_id, test_id) VALUES (?,?)').bind(u.id, id),
      c.env.DB.prepare('UPDATE tests SET likes=likes+1 WHERE id=?').bind(id),
    ]);
    liked = true;
  }
  const row = await c.env.DB.prepare('SELECT likes FROM tests WHERE id=?').bind(id).first<any>();
  return c.json({ liked, likes: row.likes });
});

app.post('/api/tests/:id/shared', async (c) => {
  await c.env.DB.prepare('UPDATE tests SET shares=shares+1 WHERE id=?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.post('/api/tests/:id/report', async (c) => {
  const u = c.get('user');
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare('SELECT author_id, status FROM tests WHERE id=?').bind(id).first<any>();
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  if (t.author_id === u.id) return err(c, 400, 'own', 'Нельзя пожаловаться на свой тест');
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? '').slice(0, 200);
  const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO reports (test_id, user_id, reason, created_at) VALUES (?,?,?,?)')
    .bind(id, u.id, reason, now()).run();
  if (ins.meta.changes) {
    await c.env.DB.prepare('UPDATE tests SET reports=reports+1 WHERE id=?').bind(id).run();
    // автоскрытие до проверки модератором
    await c.env.DB.prepare("UPDATE tests SET status='hidden' WHERE id=? AND reports>=5 AND status='published'").bind(id).run();
  }
  return c.json({ ok: true });
});

// ---------- комментарии ----------

app.get('/api/tests/:id/comments', async (c) => {
  const before = Number(c.req.query('before')) || 2 ** 31;
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.text, c.created_at, c.user_id, u.display_name AS name, u.username, u.avatar
     FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.test_id=? AND c.id<? ORDER BY c.id DESC LIMIT 21`,
  ).bind(Number(c.req.param('id')), before).all<any>();
  return c.json({ items: rows.results.slice(0, 20).map(commentItem), more: rows.results.length > 20 });
});

app.post('/api/tests/:id/comments', async (c) => {
  const u = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.commentLen);
  if (!text) return err(c, 400, 'empty', 'Пустой комментарий');
  if (/https?:\/\/|www\./i.test(text)) return err(c, 400, 'links', 'Ссылки запрещены');
  const t = await c.env.DB.prepare("SELECT id FROM tests WHERE id=? AND status='published'").bind(id).first();
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id=? AND created_at>?')
    .bind(u.id, now() - 60).first<any>();
  if (recent.n >= 3) return err(c, 429, 'rate_limited', 'Слишком часто. Подожди минуту.');
  const ins = await c.env.DB.prepare('INSERT INTO comments (test_id, user_id, text, created_at) VALUES (?,?,?,?)')
    .bind(id, u.id, text, now()).run();
  await c.env.DB.prepare('UPDATE tests SET comments=comments+1 WHERE id=?').bind(id).run();
  return c.json(commentItem({ id: ins.meta.last_row_id, text, created_at: now(), user_id: u.id, name: u.display_name, username: u.username, avatar: u.avatar }));
});

app.delete('/api/comments/:id', async (c) => {
  const u = c.get('user');
  const cm = await c.env.DB.prepare(
    'SELECT c.id, c.user_id, c.test_id, t.author_id FROM comments c JOIN tests t ON t.id=c.test_id WHERE c.id=?',
  ).bind(Number(c.req.param('id'))).first<any>();
  if (!cm) return err(c, 404, 'not_found', 'Комментарий не найден');
  if (cm.user_id !== u.id && cm.author_id !== u.id && !isAdmin(c.env, u.id)) return err(c, 403, 'forbidden', 'Нельзя');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM comments WHERE id=?').bind(cm.id),
    c.env.DB.prepare('UPDATE tests SET comments=MAX(0,comments-1) WHERE id=?').bind(cm.test_id),
  ]);
  return c.json({ ok: true });
});

// ---------- создание и редактирование ----------

app.get('/api/tests/:id/edit', async (c) => {
  const t = await loadTest(c, Number(c.req.param('id')));
  if (!t || !t.owner) return err(c, 404, 'not_found', 'Тест не найден');
  return c.json({
    id: t.row.id, kind: t.row.kind, title: t.row.title, description: t.row.description,
    cover_emoji: t.row.cover_emoji, cover_grad: t.row.cover_grad, cover_image: t.row.cover_image ?? null, category: t.row.category,
    status: t.row.status, content: t.content,
  });
});

async function saveTest(c: C, id: number | null) {
  const u = c.get('user');
  const body = await c.req.json().catch(() => null);
  const v = validateTest(body);
  if (!v.ok) return err(c, 400, 'invalid', v.error);
  const d = v.data;
  const wantPublish = !!body.publish;
  const ts = now();

  // картинки должны быть загружены этим же пользователем (админ может править чужие тесты)
  const ids = imageIds(d);
  if (ids.length && !isAdmin(c.env, u.id)) {
    const found = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM images WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`,
    ).bind(u.id, ...ids).first<any>();
    if (found.n !== ids.length) return err(c, 400, 'invalid', 'Какая-то из картинок недоступна, загрузи её заново');
  }

  if (id === null) {
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tests WHERE author_id=? AND created_at>?')
      .bind(u.id, ts - 86400).first<any>();
    if (n.n >= LIMITS.testsPerDay) return err(c, 429, 'limit', `Не больше ${LIMITS.testsPerDay} тестов в сутки`);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await c.env.DB.prepare(
          `INSERT INTO tests (code, author_id, kind, title, description, cover_emoji, cover_grad, cover_image, category, content,
             status, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(genCode(), u.id, d.kind, d.title, d.description, d.cover_emoji, d.cover_grad, d.cover_image, d.category,
          JSON.stringify(d.content), wantPublish ? 'published' : 'draft', ts, ts, wantPublish ? ts : null).run();
        return c.json({ id: r.meta.last_row_id, status: wantPublish ? 'published' : 'draft' });
      } catch (e: any) {
        if (!/UNIQUE/i.test(String(e?.message))) throw e;
      }
    }
    return err(c, 500, 'internal', 'Не удалось создать тест');
  }

  const t = await c.env.DB.prepare('SELECT * FROM tests WHERE id=?').bind(id).first<any>();
  if (!t || (t.author_id !== u.id && !isAdmin(c.env, u.id))) return err(c, 404, 'not_found', 'Тест не найден');
  if (t.status === 'hidden' && !isAdmin(c.env, u.id)) return err(c, 403, 'hidden', 'Тест скрыт модератором');
  const status = t.status === 'hidden' ? 'hidden' : wantPublish ? 'published' : 'draft';
  await c.env.DB.prepare(
    `UPDATE tests SET kind=?, title=?, description=?, cover_emoji=?, cover_grad=?, cover_image=?, category=?, content=?, status=?,
       updated_at=?, published_at=CASE WHEN ?='published' AND published_at IS NULL THEN ? ELSE published_at END WHERE id=?`,
  ).bind(d.kind, d.title, d.description, d.cover_emoji, d.cover_grad, d.cover_image, d.category, JSON.stringify(d.content),
    status, ts, status, ts, id).run();
  return c.json({ id, status });
}

app.post('/api/tests', (c) => saveTest(c, null));
app.put('/api/tests/:id', (c) => saveTest(c, Number(c.req.param('id'))));

app.delete('/api/tests/:id', async (c) => {
  const u = c.get('user');
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare('SELECT author_id FROM tests WHERE id=?').bind(id).first<any>();
  if (!t || (t.author_id !== u.id && !isAdmin(c.env, u.id))) return err(c, 404, 'not_found', 'Тест не найден');
  await c.env.DB.batch(
    ['plays', 'likes', 'comments', 'reports'].map((tb) => c.env.DB.prepare(`DELETE FROM ${tb} WHERE test_id=?`).bind(id))
      .concat(c.env.DB.prepare('DELETE FROM tests WHERE id=?').bind(id)),
  );
  return c.json({ ok: true });
});

// ---------- «моё» ----------

app.get('/api/me/tests', async (c) => {
  const u = c.get('user');
  const rows = await c.env.DB.prepare(`${LIST_SELECT} WHERE t.author_id=?1 ORDER BY t.created_at DESC LIMIT 100`).bind(u.id).all<any>();
  const earned = await c.env.DB.prepare(
    "SELECT test_id, SUM(payout) AS s FROM donations WHERE to_user=? AND status='done' AND test_mode=0 GROUP BY test_id",
  ).bind(u.id).all<any>();
  const map = new Map(earned.results.map((r) => [r.test_id, r.s]));
  return c.json({ items: rows.results.map((r) => ({ ...listItem(r), earned: map.get(r.id) ?? 0 })) });
});

app.get('/api/me/results', async (c) => {
  const u = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT p.test_id, p.result_idx, p.score, p.created_at, t.title, t.kind, t.cover_emoji, t.cover_grad, t.content, t.status
     FROM plays p JOIN tests t ON t.id=p.test_id
     WHERE p.id IN (SELECT MAX(id) FROM plays WHERE user_id=? GROUP BY test_id)
     ORDER BY p.created_at DESC LIMIT 100`,
  ).bind(u.id).all<any>();
  return c.json({
    items: rows.results.filter((r) => r.status === 'published').map((r) => {
      const content = JSON.parse(r.content) as TestContent;
      const res = content.results[Math.min(r.result_idx, content.results.length - 1)];
      return {
        test_id: r.test_id, title: r.title, kind: r.kind, cover_emoji: r.cover_emoji, cover_grad: r.cover_grad,
        result_title: res.title, result_emoji: res.emoji, result_image: res.image ?? null, score: r.score,
        total: r.kind === 'quiz' ? content.questions.length : undefined, created_at: r.created_at,
      };
    }),
  });
});

app.get('/api/tests/:id/stats', async (c) => {
  const t = await loadTest(c, Number(c.req.param('id')));
  if (!t || !t.owner) return err(c, 404, 'not_found', 'Тест не найден');
  const dist = await c.env.DB.prepare('SELECT result_idx, COUNT(*) AS n FROM plays WHERE test_id=? GROUP BY result_idx')
    .bind(t.row.id).all<any>();
  const don = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(payout),0) AS s, COUNT(*) AS n FROM donations WHERE test_id=? AND status IN ('done','payout_pending') AND test_mode=0",
  ).bind(t.row.id).first<any>();
  return c.json({
    started: t.row.plays, finished: t.row.finishes, shares: t.row.shares, likes: t.row.likes, comments: t.row.comments,
    distribution: t.content.results.map((r, i) => ({
      title: r.title, emoji: r.emoji, count: dist.results.find((d) => d.result_idx === i)?.n ?? 0,
    })),
    donations: { count: don.n, sum: don.s },
  });
});

app.get('/api/me/donations', async (c) => {
  const u = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.amount, d.payout, d.status, d.test_mode, d.created_at, d.from_user, t.title, u.display_name AS name, u.username
     FROM donations d JOIN tests t ON t.id=d.test_id LEFT JOIN users u ON u.id=d.from_user
     WHERE d.to_user=? AND d.status IN ('done','payout_pending') ORDER BY d.id DESC LIMIT 50`,
  ).bind(u.id).all<any>();
  return c.json({
    items: rows.results.map((r) => ({
      id: r.id, payout: r.payout, status: r.status, test_mode: !!r.test_mode, created_at: r.created_at,
      title: r.title, from: { id: r.from_user, name: r.name || r.username || 'Игрок' },
    })),
  });
});

// ---------- донаты ----------

app.post('/api/donate', async (c) => {
  const u = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < LIMITS.donateMin || amount > LIMITS.donateMax)
    return err(c, 400, 'bad_amount', `Сумма от ${LIMITS.donateMin} до ${LIMITS.donateMax} монеток`);
  const t = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.author_id, u.banned FROM tests t LEFT JOIN users u ON u.id=t.author_id
     WHERE t.id=? AND t.status='published'`,
  ).bind(Number(body.test_id)).first<any>();
  if (!t) return err(c, 404, 'not_found', 'Тест не найден');
  if (t.author_id === u.id) return err(c, 400, 'own', 'Нельзя поддержать самого себя');
  if (t.author_id === 0 || t.banned) return err(c, 400, 'no_author', 'Этому автору нельзя отправить монетки');

  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM donations WHERE from_user=? AND created_at>?')
    .bind(u.id, now() - 60).first<any>();
  if (recent.n >= 5) return err(c, 429, 'rate_limited', 'Слишком часто. Подожди минуту.');

  const mode = c.get('mode');
  const payout = Math.max(1, Math.floor((amount * (100 - commission(c.env))) / 100));
  const ts = now();
  const ins = await c.env.DB.prepare(
    `INSERT INTO donations (test_id, from_user, to_user, amount, payout, test_mode, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'created', ?, ?)`,
  ).bind(t.id, u.id, t.author_id, amount, payout, mode === 'test' ? 1 : 0, ts, ts).run();
  const donationId = ins.meta.last_row_id as number;

  try {
    const intent = await createPayment(c.env, {
      user_id: u.id, amount, test: mode === 'test', idempotency_key: `don-${donationId}`,
      description: `Поддержка автора теста «${t.title}»`.slice(0, 200),
    });
    await c.env.DB.prepare("UPDATE donations SET intent_id=?, status='pending', updated_at=? WHERE id=?")
      .bind(intent.intent_id, now(), donationId).run();
    return c.json({ donation_id: donationId, intent_id: intent.intent_id, payout, test: mode === 'test' });
  } catch (e) {
    const code = e instanceof HuevoError ? e.code : 'internal';
    await c.env.DB.prepare("UPDATE donations SET status='failed', error=?, updated_at=? WHERE id=?").bind(code, now(), donationId).run();
    return err(c, 502, code, 'Не удалось создать платёж. Попробуй позже.');
  }
});

/** Фронт дёргает после confirmPayment — ускоряет начисление (результат фронта не доверенный, итог берём из API). */
app.post('/api/donate/:id/check', async (c) => {
  const u = c.get('user');
  const d = await c.env.DB.prepare('SELECT * FROM donations WHERE id=? AND from_user=?')
    .bind(Number(c.req.param('id')), u.id).first<any>();
  if (!d) return err(c, 404, 'not_found', 'Платёж не найден');
  const status = await settleDonation(c.env, d).catch(() => d.status);
  return c.json({ status });
});

const RETRY_MAX_AGE = 14 * 86400;

/** Единственное место, где проверяется платёж и платится автору. Идемпотентно. */
async function settleDonation(env: Env, d: any): Promise<string> {
  let status: string = d.status;
  if (['done', 'failed', 'expired', 'created'].includes(status)) return status;
  const db = env.DB;

  if (status === 'pending') {
    const intent = await getPayment(env, d.intent_id);
    if (intent.status === 'pending') return 'pending';
    if (intent.status !== 'succeeded') {
      const final = intent.status === 'expired' ? 'expired' : 'failed';
      await db.prepare("UPDATE donations SET status=?, error=?, updated_at=? WHERE id=? AND status='pending'")
        .bind(final, intent.error ?? intent.status, now(), d.id).run();
      return final;
    }
    // «захватываем» платёж: только один обработчик получит changes=1
    await db.prepare("UPDATE donations SET status='payout_pending', updated_at=? WHERE id=? AND status='pending'")
      .bind(now(), d.id).run();
    status = 'payout_pending';
  }

  try {
    await createCredit(env, {
      user_id: d.to_user, amount: d.payout, test: !!d.test_mode, idempotency_key: `dp-${d.id}`,
      reason: 'Поддержка за твой тест в «Тестах»',
    });
    await db.prepare("UPDATE donations SET status='done', error=NULL, updated_at=? WHERE id=?").bind(now(), d.id).run();
    return 'done';
  } catch (e) {
    const code = e instanceof HuevoError ? e.code : 'internal';
    const expired = now() - d.created_at > RETRY_MAX_AGE;
    // не удалось выплатить — оставляем в очереди, cron повторит (автор может позже открыть игру и т.п.)
    await db.prepare('UPDATE donations SET status=?, error=?, updated_at=? WHERE id=?')
      .bind(expired ? 'failed' : 'payout_pending', code, now(), d.id).run();
    return expired ? 'failed' : 'payout_pending';
  }
}

// ---------- админка ----------

const adminOnly = async (c: C, next: () => Promise<void>) => {
  if (!isAdmin(c.env, c.get('user').id)) return err(c, 403, 'forbidden', 'Нет доступа');
  return next();
};
app.use('/api/admin/*', adminOnly as any);

app.get('/api/admin/reports', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.test_id, t.title, t.status, t.author_id, COUNT(*) AS n, GROUP_CONCAT(r.reason, ' | ') AS reasons,
            u.display_name AS a_name, u.username AS a_username
     FROM reports r JOIN tests t ON t.id=r.test_id LEFT JOIN users u ON u.id=t.author_id
     WHERE r.status='open' GROUP BY r.test_id ORDER BY n DESC LIMIT 100`,
  ).all<any>();
  return c.json({ items: rows.results.map((r) => ({
    test_id: r.test_id, title: r.title, status: r.status, count: r.n, reasons: r.reasons,
    author: { id: r.author_id, name: r.a_name || r.a_username || String(r.author_id) },
  })) });
});

app.get('/api/top', async (c) => {
  const kind = c.req.query('kind') === 'players' ? 'players' : 'authors';
  const rows = kind === 'authors'
    ? await c.env.DB.prepare(
        `SELECT u.id, u.display_name AS name, u.username, u.avatar, COUNT(*) AS tests, SUM(t.plays) AS plays, SUM(t.likes) AS likes
         FROM tests t JOIN users u ON u.id=t.author_id
         WHERE t.status='published' AND t.author_id>0 AND u.banned=0
         GROUP BY u.id ORDER BY tests DESC, plays DESC LIMIT 30`).all<any>()
    : await c.env.DB.prepare(
        `SELECT u.id, u.display_name AS name, u.username, u.avatar, COUNT(DISTINCT p.test_id) AS tests, COUNT(*) AS plays
         FROM plays p JOIN users u ON u.id=p.user_id
         WHERE u.banned=0 AND u.id>0
         GROUP BY u.id ORDER BY tests DESC, plays DESC LIMIT 30`).all<any>();
  return c.json({
    items: rows.results.map((r) => ({
      id: r.id, name: r.name || r.username || 'Игрок', avatar: r.avatar,
      tests: r.tests, plays: r.plays ?? 0, likes: r.likes ?? 0,
    })),
  });
});

app.get('/api/admin/tests', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  const off = Math.max(0, Number(c.req.query('offset')) | 0);
  const where = q ? `WHERE t.title LIKE ?1 ESCAPE '\\' OR u.display_name LIKE ?1 ESCAPE '\\' OR u.username LIKE ?1 ESCAPE '\\' OR t.code = ?2` : '';
  const stmt = c.env.DB.prepare(
    `SELECT t.id, t.code, t.title, t.status, t.plays, t.likes, t.reports, t.author_id, u.display_name AS a_name, u.username AS a_username, u.banned
     FROM tests t LEFT JOIN users u ON u.id=t.author_id ${where} ORDER BY t.id DESC LIMIT 31 OFFSET ${off}`);
  const rows = await (q ? stmt.bind(`%${q.replace(/[\\%_]/g, '\\$&')}%`, q.toUpperCase()) : stmt).all<any>();
  return c.json({
    items: rows.results.slice(0, 30).map((r) => ({
      id: r.id, code: r.code, title: r.title, status: r.status, plays: r.plays, likes: r.likes, reports: r.reports,
      author: { id: r.author_id, name: r.a_name || r.a_username || 'Редакция', banned: !!r.banned },
    })),
    more: rows.results.length > 30,
  });
});

app.post('/api/admin/tests/:id/:action', async (c) => {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action === 'hide') {
    await c.env.DB.prepare("UPDATE tests SET status='hidden' WHERE id=?").bind(id).run();
  } else if (action === 'restore' || action === 'dismiss') {
    if (action === 'restore') await c.env.DB.prepare("UPDATE tests SET status='published' WHERE id=? AND status='hidden'").bind(id).run();
    await c.env.DB.prepare("UPDATE reports SET status='done' WHERE test_id=?").bind(id).run();
    await c.env.DB.prepare('UPDATE tests SET reports=0 WHERE id=?').bind(id).run();
  } else return err(c, 400, 'bad_request', 'Неизвестное действие');
  return c.json({ ok: true });
});

app.post('/api/admin/users/:id/ban', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const banned = body.banned === false ? 0 : 1;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(banned, id),
    ...(banned ? [c.env.DB.prepare("UPDATE tests SET status='hidden' WHERE author_id=? AND status='published'").bind(id)] : []),
  ]);
  return c.json({ ok: true });
});

app.get('/img/:id', async (c) => {
  const id = c.req.param('id');
  if (!IMAGE_ID_RE.test(id)) return c.text('not found', 404);
  const row = await c.env.DB.prepare('SELECT data FROM images WHERE id=?').bind(id).first<{ data: ArrayBuffer | number[] | null }>();
  if (!row?.data) return c.text('not found', 404);
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
});

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Не найдено' } }, 404));

export default {
  fetch: app.fetch,
  /** Cron: дожимаем платежи и выплаты, у которых не пришёл коллбек или не прошла выплата. */
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const rows = await env.DB.prepare(
        "SELECT * FROM donations WHERE status IN ('pending','payout_pending') AND updated_at < ? ORDER BY id LIMIT 50",
      ).bind(now() - 60).all<any>();
      for (const d of rows.results) await settleDonation(env, d).catch(() => {});
    })());
  },
};
