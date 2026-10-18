import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { renderCollage, type Layout } from '../collage';
import { go } from '../router';
import { Bar, Spinner, TestTile, useApp, type TestItem } from '../ui';
import { Donate } from './Donate';
import { ReportModal, useShare } from './TestPage';

interface ResultData {
  kind: 'personality' | 'quiz';
  result: { title: string; description: string; emoji: string; grad: number; image?: string | null };
  teaser: string;
  teaser_image?: string | null;
  score: number;
  total?: number;
  percentSame: number;
  review?: { question: string; answers: string[]; correct: number; chosen: number }[];
}

const cache = new Map<number, ResultData>();
export const cacheResult = (id: number, r: ResultData) => cache.set(id, r);

export function Result({ id }: { id: number }) {
  const { toast, me } = useApp();
  const [r, setR] = useState<ResultData | null>(cache.get(id) ?? null);
  const [test, setTest] = useState<TestItem | null>(null);
  const [similar, setSimilar] = useState<TestItem[]>([]);
  const [donate, setDonate] = useState(false);
  const [report, setReport] = useState(false);
  const [review, setReview] = useState(false);
  const [layout, setLayout] = useState<Layout>('grid');
  const [picture, setPicture] = useState<string | null>(null);
  const blobRef = useRef<Promise<Blob | null> | null>(null);
  const [failedPic, setFailedPic] = useState(false);
  const share = useShare(id, test?.code, test?.title);

  useEffect(() => {
    cache.delete(id);
    if (!r) api<ResultData>(`/tests/${id}/my-result`).then(setR).catch((e) => { toast(e.message); go(`t/${id}`); });
    api<TestItem>(`/tests/${id}`).then((t) => {
      setTest(t);
      api<{ items: TestItem[] }>(`/tests?category=${t.category}&sort=popular`)
        .then((s) => setSimilar(s.items.filter((x) => x.id !== id).slice(0, 4))).catch(() => {});
    }).catch(() => {});
  }, [id]);

  // картинка-результат (как «Отправить себе на стену» в старых миниТестах)
  useEffect(() => {
    if (!r || !test) return;
    let alive = true;
    setPicture(null);
    setFailedPic(false);
    const job = renderCollage({
      layout,
      userName: me.name.split(' ')[0] || me.name,
      testTitle: test.title,
      coverImage: test.cover_image,
      coverEmoji: test.cover_emoji,
      coverGrad: test.cover_grad,
      teaser: r.teaser,
      teaserImage: r.teaser_image,
      result: r.result,
      watermark: `код ${test.code} · huEVO`,
    }).then((blob) => {
      if (alive) setPicture(URL.createObjectURL(blob));
      return blob;
    }).catch((e) => {
      console.warn('collage', e);
      if (alive) setFailedPic(true);
      return null;
    });
    blobRef.current = job;
    return () => { alive = false; };
  }, [r, test, layout]);

  useEffect(() => () => { if (picture) URL.revokeObjectURL(picture); }, [picture]);

  /** Кнопка не блокируется: если картинка ещё собирается, ждём её, если не вышло, шлём текст со ссылкой. */
  const sharing = useRef(false);
  const [shareNote, setShareNote] = useState('');
  const onShare = async () => {
    if (sharing.current) return;          // окно уже открывается: второй вызов дал бы rate_limited
    sharing.current = true;
    setTimeout(() => { sharing.current = false; }, 5000);
    setShareNote('Открываю окно huEVO…');
    const blob = blobRef.current ? await blobRef.current : null;
    if (!blob) toast('Картинку собрать не удалось, отправляем текст со ссылкой');
    setShareNote(await share(blob));
  };

  if (!r) return <><Bar title="Результат" onBack={() => go(`t/${id}`)} /><Spinner /></>;

  const like = async () => {
    if (!test) return;
    const x = await api(`/tests/${id}/like`, { body: {} }).catch((e) => { toast(e.message); return null; });
    if (x) setTest({ ...test, liked: x.liked, likes: x.likes });
  };
  const canDonate = test && test.author.id > 0 && test.author.id !== me.id && test.status === 'published';

  return (
    <>
      <Bar title={test?.title ?? 'Результат'} onBack={() => go(`t/${id}`)} />
      <div class="result">
        <div class="seg-links small">
          <a href="#/" class={layout === 'grid' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setLayout('grid'); }}>Коллаж</a>
          <a href="#/" class={layout === 'big' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setLayout('big'); }}>Крупно</a>
        </div>
        <div class="collage-box">
          {picture ? <img class="collage" src={picture} alt={r.result.title} /> : failedPic ? <p class="muted small">Картинку собрать не получилось, но поделиться текстом со ссылкой можно.</p> : <Spinner />}
        </div>
        <p class="muted small center">Кнопка выше откроет окно huEVO: выбери свою страницу, сообщество или друга. Картинку можно и просто сохранить. Друзья найдут тест по коду на ней: «По коду» на главной.</p>

        <h2 class="result-title">{r.result.title}{r.kind === 'quiz' && <span class="muted"> — {r.score} из {r.total}</span>}</h2>
        {r.result.description && <p class="result-desc">{r.result.description}</p>}
        <p class="muted small">{r.kind === 'personality' ? 'Так же получилось у' : 'С таким результатом'} {r.percentSame}% игроков.</p>

        <div class="actions">
          <button class="bbtn big" onClick={onShare}>{picture || failedPic ? 'Отправить себе на стену' : 'Собираем картинку…'}</button>
          <button class="gbtn" onClick={() => go(`play/${id}`)}>Пройти ещё раз</button>
          {test && <button class={test.liked ? 'gbtn on' : 'gbtn'} onClick={like}>{test.liked ? '♥ Понравилось' : '♡ Мне нравится'}</button>}
          {canDonate && <button class="gold-btn" onClick={() => setDonate(true)}>Поддержать автора монетками</button>}
          <button class="gbtn" onClick={() => go(`t/${id}`)}>Комментарии</button>
        </div>
        {shareNote && <p class="muted small center">{shareNote}</p>}

        {r.review && (
          <>
            <button class="gbtn" onClick={() => setReview(!review)}>{review ? 'Скрыть разбор' : 'Разбор ответов'}</button>
            {review && r.review.map((q, qi) => (
              <div class="review" key={qi}>
                <b>{qi + 1}. {q.question}</b>
                {q.answers.map((a, ai) => (
                  <div key={ai} class={ai === q.correct ? 'rv ok' : ai === q.chosen ? 'rv bad' : 'rv'}>
                    {ai === q.correct ? '✓' : ai === q.chosen ? '✗' : '·'} {a}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        <div class="small center"><a class="link muted" href="#/" onClick={(e) => { e.preventDefault(); setReport(true); }}>Пожаловаться на тест</a></div>
      </div>

      {similar.length > 0 && (
        <>
          <Bar title="Ещё из этой категории" />
          <div class="tiles">{similar.map((t) => <TestTile key={t.id} t={t} />)}</div>
        </>
      )}
      {donate && test && <Donate testId={id} authorName={test.author.name} onClose={() => setDonate(false)} />}
      {report && <ReportModal id={id} onClose={() => setReport(false)} />}
    </>
  );
}
