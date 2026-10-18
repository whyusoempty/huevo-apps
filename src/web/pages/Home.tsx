import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES } from '../../shared/const';
import { api } from '../api';
import { go } from '../router';
import { Bar, Empty, Modal, Spinner, TestTile, useApp, type TestItem } from '../ui';

const SORTS = [['popular', 'Популярные'], ['new', 'Новые'], ['top', 'Лучшие']] as const;
const TITLES: Record<string, string> = { popular: 'Популярные за месяц', new: 'Новые тесты', top: 'Лучшие тесты' };

export function Home() {
  const { toast } = useApp();
  const [sort, setSort] = useState('popular');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TestItem[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const req = useRef(0);

  const load = async (offset: number) => {
    const my = ++req.current;
    setLoading(true);
    try {
      const p = new URLSearchParams({ sort, offset: String(offset) });
      if (category) p.set('category', category);
      if (query) p.set('q', query);
      const r = await api<{ items: TestItem[]; more: boolean }>(`/tests?${p}`);
      if (my !== req.current) return;
      setItems((prev) => (offset ? [...prev, ...r.items] : r.items));
      setMore(r.more);
    } catch (e: any) { toast(e.message); }
    if (my === req.current) setLoading(false);
  };

  useEffect(() => { load(0); }, [sort, category, query]);

  const submitCode = async () => {
    try {
      const r = await api<{ id: number }>(`/tests/code/${encodeURIComponent(code.trim())}`);
      setCodeOpen(false);
      go(`t/${r.id}`);
    } catch (e: any) { toast(e.message); }
  };

  return (
    <>
      <form class="filters" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Поиск по тестам" maxLength={40} />
        <select value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button class="gbtn" type="submit">Найти</button>
        <button class="gbtn" type="button" onClick={() => setCodeOpen(true)}>По коду</button>
      </form>
      <Bar title={query ? `Поиск: «${query}»` : TITLES[sort]} right={
        <span class="sorts">{SORTS.map(([id, label]) => <a key={id} href="#/" class={sort === id ? 'on' : ''} onClick={(e) => { e.preventDefault(); setSort(id); }}>{label}</a>)}</span>
      } />
      <div class="tiles">{items.map((t) => <TestTile key={t.id} t={t} />)}</div>
      {loading && <Spinner />}
      {!loading && !items.length && (
        <Empty text={query ? 'Ничего не нашлось' : 'Тестов пока нет'}>
          <a class="bbtn" href="#/new">Создать первый тест</a>
        </Empty>
      )}
      {!loading && more && <div class="center-wrap"><button class="gbtn wide" onClick={() => load(items.length)}>Показать еще тесты</button></div>}
      {codeOpen && (
        <Modal title="Код теста" onClose={() => setCodeOpen(false)}>
          <p class="muted">Друг прислал код? Введи его — откроем тот самый тест.</p>
          <form onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
            <input class="code-input" value={code} maxLength={5} autoFocus placeholder="K7M2X"
              onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
            <button class="bbtn" disabled={code.trim().length < 3}>Открыть</button>
          </form>
        </Modal>
      )}
    </>
  );
}
