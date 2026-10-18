import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { go } from '../router';
import { Avatar, Bar, Empty, Modal, Spinner, Thumb, fmtDate, gradCss, imgUrl, num, useApp, type TestItem } from '../ui';

interface Stats {
  started: number; finished: number; shares: number; likes: number; comments: number;
  distribution: { title: string; emoji: string; count: number }[];
  donations: { count: number; sum: number };
}
interface MyResult {
  test_id: number; title: string; cover_emoji: string; cover_grad: number; result_title: string; result_emoji: string; result_image: string | null;
  score: number; total?: number; created_at: number;
}
interface Don { id: number; payout: number; status: string; test_mode: boolean; created_at: number; title: string; from: { id: number; name: string } }

const STATUS: Record<string, string> = { published: 'Опубликован', draft: 'Черновик', hidden: 'Скрыт модератором' };

function StatsBox({ id }: { id: number }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>(`/tests/${id}/stats`).then(setS).catch(() => {}); }, [id]);
  if (!s) return <Spinner />;
  const max = Math.max(1, ...s.distribution.map((d) => d.count));
  const conv = s.started ? Math.round((s.finished / s.started) * 100) : 0;
  return (
    <div class="statsbox">
      <div class="funnel small">
        <span>Начали <b>{num(s.started)}</b></span><span>Дошли до конца <b>{num(s.finished)}</b> ({conv}%)</span>
        <span>Поделились <b>{num(s.shares)}</b></span><span>Донаты <b>{s.donations.sum}</b> ({s.donations.count})</span>
      </div>
      {s.distribution.map((d, i) => (
        <div class="bar-row small" key={i}>
          <span class="bar-label">{d.emoji} {d.title}</span>
          <div class="bar"><div style={{ width: `${(d.count / max) * 100}%` }} /></div>
          <b>{d.count}</b>
        </div>
      ))}
    </div>
  );
}

export function Mine() {
  const { me, isAdmin, toast } = useApp();
  const [tab, setTab] = useState<'tests' | 'results' | 'donations'>('tests');
  const [tests, setTests] = useState<TestItem[] | null>(null);
  const [results, setResults] = useState<MyResult[] | null>(null);
  const [dons, setDons] = useState<Don[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [del, setDel] = useState<TestItem | null>(null);

  useEffect(() => {
    if (tab === 'tests') api('/me/tests').then((r) => setTests(r.items)).catch((e) => toast(e.message));
    if (tab === 'results') api('/me/results').then((r) => setResults(r.items)).catch((e) => toast(e.message));
    if (tab === 'donations') api('/me/donations').then((r) => setDons(r.items)).catch((e) => toast(e.message));
  }, [tab]);

  const remove = async () => {
    if (!del) return;
    try { await api(`/tests/${del.id}`, { method: 'DELETE' }); setTests(tests!.filter((t) => t.id !== del.id)); }
    catch (e: any) { toast(e.message); }
    setDel(null);
  };

  const earned = (tests ?? []).reduce((s, t) => s + (t.earned ?? 0), 0);

  return (
    <>
      <Bar title="Мои тесты" right={isAdmin ? <a class="link" href="#/admin">Жалобы</a> : undefined} />
      <div class="profile"><Avatar src={me.avatar} name={me.name} size={56} /><div><b>{me.name}</b><div class="muted small">@{me.username}</div></div></div>
      <div class="seg">
        <button class={tab === 'tests' ? 'active' : ''} onClick={() => setTab('tests')}>Мои тесты</button>
        <button class={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Результаты</button>
        <button class={tab === 'donations' ? 'active' : ''} onClick={() => setTab('donations')}>Донаты</button>
      </div>

      <div class="list">
        {tab === 'tests' && (tests === null ? <Spinner /> : !tests.length ? (
          <Empty text="Ты ещё не создавал тестов"><a class="bbtn" href="#/new">Создать тест</a><a class="link" href="#/guide">Как сделать тест: гайд</a></Empty>
        ) : tests.map((t) => (
          <div class="card mine" key={t.id}>
            <a class="tcard" href={`#/t/${t.id}`}>
              <Thumb image={t.cover_image} emoji={t.cover_emoji} grad={t.cover_grad} />
              <div class="tcard-body">
                <div class="tcard-title">{t.title}</div>
                <div class="small"><span class={`badge ${t.status === 'published' ? 'ok' : 'warn'}`}>{STATUS[t.status] ?? t.status}</span> <span class="muted">код {t.code}</span></div>
                <div class="tcard-meta small muted"><span>прошли {num(t.plays)}</span><span>до конца {num(t.finishes)}</span><span>♥ {num(t.likes)}</span><span>монет {t.earned ?? 0}</span></div>
              </div>
            </a>
            <div class="row">
              <button class="gbtn sm" onClick={() => go(`edit/${t.id}`)}>Изменить</button>
              <button class="gbtn sm" onClick={() => setOpen(open === t.id ? null : t.id)}>Статистика</button>
              <button class="gbtn sm" onClick={() => setDel(t)}>Удалить</button>
            </div>
            {open === t.id && <StatsBox id={t.id} />}
          </div>
        )))}
        {tab === 'tests' && tests && tests.length > 0 && earned > 0 && <p class="muted small center">Всего получено донатов: {earned} монет</p>}

        {tab === 'results' && (results === null ? <Spinner /> : !results.length ? (
          <Empty text="Пока нет пройденных тестов"><a class="bbtn" href="#/">К тестам</a></Empty>
        ) : results.map((r) => (
          <a class="card tcard" href={`#/r/${r.test_id}`} key={r.test_id}>
            {r.result_image ? <img class="thumb thumb-md" src={imgUrl(r.result_image)} alt="" /> : <div class="thumb thumb-md thumb-ph" style={{ background: gradCss(r.cover_grad) }}><span>{r.result_emoji}</span></div>}
            <div class="tcard-body">
              <div class="tcard-title">{r.result_title}{r.total != null && ` · ${r.score}/${r.total}`}</div>
              <div class="muted small">{r.title}</div>
              <div class="muted small">{fmtDate(r.created_at)}</div>
            </div>
          </a>
        )))}

        {tab === 'donations' && (dons === null ? <Spinner /> : !dons.length ? (
          <Empty text="Пока никто не поддержал твои тесты" />
        ) : dons.map((d) => (
          <div class="card don" key={d.id}>
            <div><b>+{d.payout} монет</b> от {d.from.name}{d.test_mode && <span class="badge warn">тест</span>}</div>
            <div class="muted small">«{d.title}» · {fmtDate(d.created_at)}{d.status === 'payout_pending' && ' · ожидает выплаты'}</div>
          </div>
        )))}
      </div>

      {del && (
        <Modal title="Удалить тест?" onClose={() => setDel(null)}>
          <p>«{del.title}» исчезнет вместе с результатами и комментариями. Это нельзя отменить.</p>
          <div class="row"><button class="gbtn" onClick={() => setDel(null)}>Отмена</button><button class="bbtn danger" onClick={remove}>Удалить</button></div>
        </Modal>
      )}
    </>
  );
}
