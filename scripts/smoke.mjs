// Смоук-тест API против `wrangler dev` (нужен DEV_LOGIN=1, HUEVO_CLIENT_SECRET=dev-secret).
import crypto from 'node:crypto';
const BASE = process.env.BASE ?? 'http://localhost:8787';
const SECRET = process.env.SECRET ?? 'dev-secret';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

async function call(path, token, body, method) {
  const r = await fetch(BASE + '/api' + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const dev = async (id) => (await call('/login', null, { dev: { id } })).token;

// подпись запуска по формуле из доков
function launch(extra = {}, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  const p = { hu_app_id: '1', hu_user_id: '777', hu_username: 'alice', hu_display_name: 'Alice', hu_avatar: 'https://x/a.png', hu_mode: 'test', hu_ts: String(ts), ...extra };
  const data = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('\n');
  const key = crypto.createHash('sha256').update(secret).digest();
  p.hu_hash = crypto.createHmac('sha256', key).update(data).digest('hex');
  return p;
}

const good = await call('/login', null, { params: launch() });
ok(good.token && good.user?.id === 777, 'login с верной подписью');
ok((await call('/login', null, { params: launch({ hu_start: 'ABCDE' }) })).token, 'login с подписанным hu_start')
const tamperedStart = launch({ hu_start: 'ABCDE' }); tamperedStart.hu_start = 'ZZZZZ';
ok((await call('/login', null, { params: tamperedStart })).status === 401, 'подмена hu_start отклонена')
ok((await call('/login', null, { params: launch({}, 'wrong') })).status === 401, 'login с неверной подписью отклонён');
ok((await call('/login', null, { params: launch({}, SECRET, 1000) })).status === 401, 'login с протухшим hu_ts отклонён');
const tampered = launch(); tampered.hu_user_id = '1';
ok((await call('/login', null, { params: tampered })).status === 401, 'подмена hu_user_id отклонена');
ok((await call('/tests')).status === 401, 'без токена 401');

const A = await dev(1), B = await dev(2), C = await dev(3);
const list = await call('/tests', B);
ok(list.items?.length >= 3, `каталог: ${list.items?.length} тестов`);
const naruto = list.items.find((t) => t.title.includes('Наруто'));
const quiz = list.items.find((t) => t.kind === 'quiz');

const play = await call(`/tests/${naruto.id}/play`, B);
ok(play.questions?.length === 6 && !JSON.stringify(play).includes('scores'), 'play не отдаёт очки');
const fin = await call(`/tests/${naruto.id}/finish`, B, { answers: [0, 0, 0, 0, 0, 0] });
ok(fin.result?.title === 'Наруто Узумаки', `результат personality: ${fin.result?.title}`);
ok((await call(`/tests/${naruto.id}/finish`, B, { answers: [0, 0] })).status === 400, 'finish: неверная длина ответов');
ok((await call(`/tests/${naruto.id}/finish`, B, { answers: [9, 0, 0, 0, 0, 0] })).status === 400, 'finish: индекс вне диапазона');
const mine = await call(`/tests/${naruto.id}/my-result`, B);
ok(mine.result?.title === fin.result.title, 'my-result совпадает');

const qplay = await call(`/tests/${quiz.id}/play`, B);
ok(!JSON.stringify(qplay).includes('correct'), 'quiz play не раскрывает правильные ответы');
const qfin = await call(`/tests/${quiz.id}/finish`, B, { answers: [1, 1, 2, 2, 1, 2] });
ok(qfin.score === 6 && qfin.result.title === 'Гений', `quiz 6/6 → ${qfin.result?.title}`);
const qfin0 = await call(`/tests/${quiz.id}/finish`, B, { answers: [0, 0, 0, 0, 0, 0] });
ok(qfin0.score === 0 && qfin0.result.title === 'Пока в разработке', `quiz 0/6 → ${qfin0.result?.title}`);

// создание
const draft = { kind: 'personality', title: 'Мой тест', description: 'тест', cover_emoji: '🔥', cover_grad: 2, category: 'fun',
  content: { results: [{ title: 'A', description: '', emoji: '🐱', grad: 1 }, { title: 'B', description: '', emoji: '🐶', grad: 2 }],
    questions: [{ text: 'Q1', answers: [{ text: 'a', scores: { 0: 2 } }, { text: 'b', scores: { 1: 2 } }] }, { text: 'Q2', answers: [{ text: 'a', scores: { 0: 1 } }, { text: 'b', scores: { 1: 1 } }] }] } };
ok((await call('/tests', A, { ...draft, title: 'x' })).status === 400, 'короткое название отклонено');
const bad = structuredClone(draft); bad.content.questions[0].answers[0].text = 'см. https://evil.ru';
ok((await call('/tests', A, bad)).status === 400, 'ссылки отклонены');
const unreachable = structuredClone(draft); unreachable.content.questions.forEach((q) => q.answers.forEach((a) => (a.scores = { 0: 1 })));
ok((await call('/tests', A, unreachable)).status === 400, 'недостижимый результат отклонён');
const created = await call('/tests', A, { ...draft, publish: true });
ok(created.id && created.status === 'published', 'тест создан и опубликован');
const byCode = await call(`/tests/${created.id}`, B);
ok(byCode.code && (await call(`/tests/code/${byCode.code}`, B)).id === created.id, 'поиск по коду');
const draftOnly = await call('/tests', A, { ...draft, title: 'Черновик' });
ok(draftOnly.status === 'draft', 'черновик');
ok((await call(`/tests/${draftOnly.id}`, B)).status === 404, 'чужой черновик не виден');
ok((await call(`/tests/${draftOnly.id}`, A)).canEdit === true, 'свой черновик виден');
ok(!(await call('/tests', B)).items.some((t) => t.id === draftOnly.id), 'черновик не в каталоге');

// лайки / комменты / жалобы
const l1 = await call(`/tests/${created.id}/like`, B, {});
const l2 = await call(`/tests/${created.id}/like`, B, {});
ok(l1.liked && l1.likes === 1 && !l2.liked && l2.likes === 0, 'лайк-тоггл');
const cm = await call(`/tests/${created.id}/comments`, B, { text: 'круто' });
ok(cm.id, 'комментарий');
ok((await call(`/tests/${created.id}/comments`, B, { text: 'http://spam.com' })).status === 400, 'ссылка в комменте');
ok((await call(`/comments/${cm.id}`, C, null, 'DELETE')).status === 403, 'чужой коммент не удалить');
ok((await call(`/comments/${cm.id}`, A, null, 'DELETE')).ok !== false, 'автор теста удаляет коммент');
for (const u of [10, 11, 12, 13, 14]) await call(`/tests/${created.id}/report`, await dev(u), { reason: 'спам' });
ok((await call(`/tests/${created.id}`, B)).status === 404, '5 жалоб → автоскрытие');
const rep = await call('/admin/reports', A);
ok(rep.items?.some((r) => r.test_id === created.id && r.count === 5), 'админ видит жалобы');
ok((await call('/admin/reports', B)).status === 403, 'не-админ не видит жалобы');
await call(`/admin/tests/${created.id}/restore`, A, {});
ok((await call(`/tests/${created.id}`, B)).id === created.id, 'админ вернул тест');

// статистика
const st = await call(`/tests/${naruto.id}/stats`, B);
ok(st.status === 404, 'чужая статистика недоступна');
await call(`/tests/${created.id}/start`, B, {});
await call(`/tests/${created.id}/finish`, B, { answers: [0, 0] });
const st2 = await call(`/tests/${created.id}/stats`, A);
ok(st2.started === 1 && st2.finished === 1 && st2.distribution[0].count === 1, 'статистика автора');

// донаты
ok((await call('/donate', B, { test_id: created.id, amount: 0 })).status === 400, 'донат: сумма 0');
ok((await call('/donate', A, { test_id: created.id, amount: 5 })).status === 400, 'донат самому себе');
ok((await call('/donate', B, { test_id: naruto.id, amount: 5 })).status === 400, 'донат редакции');

// коллбек
const body = JSON.stringify({ event: 'payment', intent_id: 'pi_x', status: 'succeeded' });
const cb = (sig) => fetch(BASE + '/api/callback/payment', { method: 'POST', headers: { 'X-Huevo-Signature': sig }, body });
ok((await cb('00')).status === 401, 'коллбек с неверной подписью');
const goodSig = crypto.createHmac('sha256', crypto.createHash('sha256').update(SECRET).digest()).update(body).digest('hex');
ok((await cb(goodSig)).status === 204, 'коллбек с верной подписью');


// картинки
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
const upload = async (token, body) => {
  const r = await fetch(BASE + '/api/images', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'image/jpeg' }, body });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const img = await upload(A, jpeg);
ok(/^[a-f0-9]{16}$/.test(img.id ?? ''), 'загрузка картинки');
ok((await upload(A, Buffer.alloc(300, 7))).status === 400, 'не-JPEG отклонён');
ok((await upload(A, Buffer.concat([jpeg, Buffer.alloc(600000)]))).status === 400, 'слишком большая картинка отклонена');
const got = await fetch(BASE + '/img/' + img.id);
ok(got.status === 200 && got.headers.get('content-type') === 'image/jpeg', 'картинка отдаётся по /img/:id');
ok((await fetch(BASE + '/img/' + 'zz')).status === 404, 'левый id → 404');
const withImg = structuredClone(draft); withImg.cover_image = img.id; withImg.content.results[0].image = img.id;
const okImg = await call('/tests', A, { ...withImg, publish: true });
ok(okImg.id, 'тест с картинками создан');
ok((await call(`/tests/${okImg.id}`, B)).cover_image === img.id, 'cover_image в карточке');
ok((await call('/tests', B, { ...withImg, publish: true })).status === 400, 'чужую картинку использовать нельзя');
await call(`/tests/${okImg.id}`, A, null, 'DELETE');


// топы и админ-список
const topA = await call('/top?kind=authors', B);
ok(Array.isArray(topA.items) && !topA.items.some((x) => x.id === 0), 'топ авторов без «Редакции»');
const topP = await call('/top?kind=players', A);
ok(topP.items?.some((x) => x.id === 2 && x.tests >= 2), 'топ игроков считает пройденные тесты');
const adm = await call('/admin/tests', A);
ok(adm.items?.length >= 3 && adm.items[0].author, 'админ видит все тесты');
ok((await call('/admin/tests?q=' + encodeURIComponent('Наруто'), A)).items?.some((t) => t.title.includes('Наруто')), 'поиск в админке');
ok((await call('/admin/tests', B)).status === 403, 'не-админ не видит список');

// удаление
ok((await call(`/tests/${created.id}`, B, null, 'DELETE')).status === 404, 'чужой тест не удалить');
ok((await call(`/tests/${created.id}`, A, null, 'DELETE')).ok !== false, 'своё удаление');

console.log(fails ? `\n${fails} провалено` : '\nвсё прошло');
process.exit(fails ? 1 : 0);
