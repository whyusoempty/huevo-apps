import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Avatar, Bar, Empty, Spinner, num, openAuthor, useApp } from '../ui';

interface Row { id: number; name: string; avatar: string; tests: number; plays: number; likes: number }

export function Top() {
  const { toast, me } = useApp();
  const [kind, setKind] = useState<'authors' | 'players'>('authors');
  const [items, setItems] = useState<Row[] | null>(null);

  useEffect(() => {
    setItems(null);
    api<{ items: Row[] }>(`/top?kind=${kind}`).then((r) => setItems(r.items)).catch((e) => toast(e.message));
  }, [kind]);

  return (
    <>
      <Bar title={kind === 'authors' ? 'Топ авторов по тестам' : 'Топ по пройденным тестам'} right={
        <span class="sorts">
          <a href="#/top" class={kind === 'authors' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setKind('authors'); }}>Авторы</a>
          <a href="#/top" class={kind === 'players' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setKind('players'); }}>Игроки</a>
        </span>
      } />
      {items === null && <Spinner />}
      {items?.length === 0 && <Empty text="Пока никого нет" />}
      <div class="top-list">
        {items?.map((r, i) => (
          <div class={`top-row ${r.id === me.id ? 'me' : ''}`} key={r.id}>
            <span class="top-place">{i + 1}</span>
            <a href="#/top" onClick={(e) => { e.preventDefault(); openAuthor(r); }}><Avatar src={r.avatar} name={r.name} size={40} /></a>
            <div class="top-name">
              <a class="link" href="#/top" onClick={(e) => { e.preventDefault(); openAuthor(r); }}>{r.name}</a>
              <div class="small muted">
                {kind === 'authors' ? `прошли ваши тесты: ${num(r.plays)} · лайков: ${num(r.likes)}` : `прохождений всего: ${num(r.plays)}`}
              </div>
            </div>
            <b class="top-count">{r.tests}<span class="small muted"> {kind === 'authors' ? 'тестов' : 'пройдено'}</span></b>
          </div>
        ))}
      </div>
    </>
  );
}
