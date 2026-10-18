import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { back } from '../router';
import { Bar, Empty, Modal, Spinner, num, useApp } from '../ui';

interface Report { test_id: number; title: string; status: string; count: number; reasons: string; author: { id: number; name: string } }
interface Row {
  id: number; code: string; title: string; status: string; plays: number; likes: number; reports: number;
  author: { id: number; name: string; banned: boolean };
}
const STATUS: Record<string, string> = { published: 'виден', draft: 'черновик', hidden: 'скрыт' };

function Tests() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Row[] | null>(null);
  const [more, setMore] = useState(false);
  const [del, setDel] = useState<Row | null>(null);

  const load = async (offset = 0) => {
    try {
      const r = await api<{ items: Row[]; more: boolean }>(`/admin/tests?offset=${offset}&q=${encodeURIComponent(query)}`);
      setItems((prev) => (offset && prev ? [...prev, ...r.items] : r.items));
      setMore(r.more);
    } catch (e: any) { toast(e.message); }
  };
  useEffect(() => { setItems(null); load(0); }, [query]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(0); } catch (e: any) { toast(e.message); }
  };
  const remove = async () => {
    if (!del) return;
    const id = del.id;
    setDel(null);
    await act(() => api(`/tests/${id}`, { method: 'DELETE' }));
    toast('Тест удалён');
  };

  return (
    <>
      <form class="filters" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Название, автор или код теста" />
        <button class="gbtn">Найти</button>
      </form>
      {items === null && <Spinner />}
      {items?.length === 0 && <Empty text="Ничего не найдено" />}
      <div class="list">
        {items?.map((t) => (
          <div class="card" key={t.id}>
            <a href={`#/t/${t.id}`}><b>{t.title}</b></a> <span class="muted small">код {t.code}</span>
            <div class="small muted">
              {STATUS[t.status] ?? t.status} · прошли {num(t.plays)} · ♥ {num(t.likes)}{t.reports > 0 && ` · жалоб ${t.reports}`} · автор {t.author.name} ({t.author.id}){t.author.banned && ' · забанен'}
            </div>
            <div class="row wrap">
              {t.status === 'published'
                ? <button class="gbtn sm" onClick={() => act(() => api(`/admin/tests/${t.id}/hide`, { body: {} }))}>Скрыть</button>
                : <button class="gbtn sm" onClick={() => act(() => api(`/admin/tests/${t.id}/restore`, { body: {} }))}>Вернуть</button>}
              <button class="bbtn danger sm" onClick={() => setDel(t)}>Удалить</button>
              {t.author.id > 0 && <button class="gbtn sm" onClick={() => act(() => api(`/admin/users/${t.author.id}/ban`, { body: { banned: !t.author.banned } }))}>{t.author.banned ? 'Разбанить автора' : 'Бан автора'}</button>}
            </div>
          </div>
        ))}
      </div>
      {more && <div class="center-wrap"><button class="gbtn wide" onClick={() => load(items?.length ?? 0)}>Показать ещё</button></div>}
      {del && (
        <Modal title="Удалить тест?" onClose={() => setDel(null)}>
          <p>«{del.title}» исчезнет вместе с результатами и комментариями. Это нельзя отменить.</p>
          <div class="row"><button class="gbtn" onClick={() => setDel(null)}>Отмена</button><button class="bbtn danger" onClick={remove}>Удалить</button></div>
        </Modal>
      )}
    </>
  );
}

function Reports() {
  const { toast } = useApp();
  const [items, setItems] = useState<Report[] | null>(null);
  const load = () => api('/admin/reports').then((r) => setItems(r.items)).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e: any) { toast(e.message); }
  };
  return (
    <div class="list">
      {items === null && <Spinner />}
      {items?.length === 0 && <Empty text="Жалоб нет" />}
      {items?.map((r) => (
        <div class="card" key={r.test_id}>
          <a href={`#/t/${r.test_id}`}><b>{r.title}</b></a>
          <div class="small muted">Жалоб: {r.count} · {r.status === 'hidden' ? 'скрыт' : 'виден'} · автор {r.author.name} ({r.author.id})</div>
          <div class="small">{r.reasons}</div>
          <div class="row wrap">
            {r.status !== 'hidden' && <button class="gbtn sm" onClick={() => act(() => api(`/admin/tests/${r.test_id}/hide`, { body: {} }))}>Скрыть</button>}
            <button class="gbtn sm" onClick={() => act(() => api(`/admin/tests/${r.test_id}/restore`, { body: {} }))}>Всё ок</button>
            <button class="gbtn sm" onClick={() => act(() => api(`/tests/${r.test_id}`, { method: 'DELETE' }))}>Удалить</button>
            <button class="bbtn danger sm" onClick={() => act(() => api(`/admin/users/${r.author.id}/ban`, { body: { banned: true } }))}>Бан автора</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Admin() {
  const [tab, setTab] = useState<'tests' | 'reports'>('tests');
  return (
    <>
      <Bar title="Админка" onBack={back} right={
        <span class="sorts">
          <a href="#/admin" class={tab === 'tests' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab('tests'); }}>Все тесты</a>
          <a href="#/admin" class={tab === 'reports' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab('reports'); }}>Жалобы</a>
        </span>
      } />
      {tab === 'tests' ? <Tests /> : <Reports />}
    </>
  );
}
