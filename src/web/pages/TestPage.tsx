import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { back, go } from '../router';
import { launchParams, sdk } from '../sdk';
import {
  Avatar, Bar, Modal, Spinner, Thumb, catName, fmtDate, kindLabel, num, openAuthor, useApp, type TestItem,
} from '../ui';

interface Comment { id: number; text: string; created_at: number; user: { id: number; name: string; avatar: string } }
interface Detail extends TestItem {
  questionCount: number; shares: number; canEdit: boolean; played: boolean; myResultTitle: string | null; recent_comments: Comment[];
}

export const REPORT_REASONS = ['Неприемлемый контент', 'Спам', 'Оскорбления', 'Чужой тест / плагиат', 'Другое'];

/** Ссылка на приложение для текста поста. */
export const appLink = (code?: string) => {
  const appId = launchParams().hu_app_id;
  return appId ? `https://huevo.su/apps/launch/${appId}${code ? `?start=${code}` : ''}` : '';
};

/** Окно «Поделиться» huEVO: текст + (необязательно) картинка. Публикует сам игрок, куда выберет. */
export function useShare(id: number, code?: string, title?: string) {
  const { toast } = useApp();
  /** Возвращает короткий статус для показа игроку (по нему видно, где оборвалось). */
  return async (picture?: Blob | null): Promise<string> => {
    const s = sdk();
    if (!s) { toast('Поделиться можно только внутри huEVO'); return 'SDK huEVO не загружен'; }
    const link = appLink(code);
    const text = [title && `Тест «${title}»`, link && `Пройти тест: ${link}`].filter(Boolean).join(String.fromCharCode(10));
    console.info('[share] старт', { picture: picture ? `${picture.type} ${picture.size} Б` : 'нет', link });
    let slow: ReturnType<typeof setTimeout> | undefined;
    try {
      if (typeof s.shareContent !== 'function') { await s.share(); return 'в этой версии SDK нет shareContent, отправлена ссылка на игру'; }
      slow = setTimeout(() => toast('Окно huEVO пока не ответило, подожди…'), 5000);
      const r = await s.shareContent({ text, attachment: picture ?? undefined });
      console.info('[share] ответ', r);
      if (r.shared) {
        api(`/tests/${id}/shared`, { method: 'POST', body: {} }).catch(() => {});
        toast('Опубликовано!');
        return 'опубликовано';
      }
      return 'окно закрыто без публикации';
    } catch (e: any) {
      console.warn('[share] ошибка', e?.code, e);
      if (e?.code === 'unsupported') { s.share().catch(() => {}); return 'окно «Поделиться» недоступно, отправлена ссылка на игру'; }
      if (e?.code === 'rate_limited') { toast('Окно уже открыто или слишком часто, подожди немного'); return 'rate_limited'; }
      if (e?.code === 'bad_request' && picture) {
        toast('Картинку не приняли, отправляем текст со ссылкой');
        s.shareContent({ text }).catch(() => {});
        return 'bad_request: картинку не приняли, отправлен текст';
      }
      if (e?.code !== 'timeout') toast(`Не получилось поделиться${e?.code ? ` (${e.code})` : ''}`);
      return `ошибка: ${e?.code ?? e?.message ?? e}`;
    } finally {
      if (slow) clearTimeout(slow);
    }
  };
}

export function ReportModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useApp();
  const send = async (reason: string) => {
    try { await api(`/tests/${id}/report`, { body: { reason } }); toast('Спасибо, мы проверим'); }
    catch (e: any) { toast(e.message); }
    onClose();
  };
  return (
    <Modal title="Пожаловаться" onClose={onClose}>
      <div class="stack">{REPORT_REASONS.map((r) => <button key={r} class="gbtn" onClick={() => send(r)}>{r}</button>)}</div>
    </Modal>
  );
}

export function TestPage({ id }: { id: number }) {
  const { toast, me, isAdmin } = useApp();
  const [t, setT] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const share = useShare(id, t?.code, t?.title);

  useEffect(() => {
    api<Detail>(`/tests/${id}`).then((d) => { setT(d); setComments(d.recent_comments); setMore(d.recent_comments.length < d.comments); })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <><Bar title="Тест" onBack={back} /><p class="center muted pad">{err}</p></>;
  if (!t) return <><Bar title="Тест" onBack={back} /><Spinner /></>;

  const toggleLike = async () => {
    try {
      const r = await api(`/tests/${id}/like`, { body: {} });
      setT({ ...t, liked: r.liked, likes: r.likes });
    } catch (e: any) { toast(e.message); }
  };
  const loadMore = async () => {
    const before = comments[comments.length - 1]?.id;
    const r = await api<{ items: Comment[]; more: boolean }>(`/tests/${id}/comments?before=${before}`);
    setComments([...comments, ...r.items]);
    setMore(r.more);
  };
  const send = async () => {
    try {
      const c = await api<Comment>(`/tests/${id}/comments`, { body: { text } });
      setComments([c, ...comments]);
      setT({ ...t, comments: t.comments + 1 });
      setText('');
    } catch (e: any) { toast(e.message); }
  };
  const removeComment = async (cid: number) => {
    await api(`/comments/${cid}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    setComments(comments.filter((c) => c.id !== cid));
  };

  return (
    <>
      <Bar title={t.title} onBack={back} right={<a class="link" href="#/" onClick={(e) => { e.preventDefault(); setReport(true); }}>Пожаловаться</a>} />
      <div class="test-head">
        <Thumb image={t.cover_image} emoji={t.cover_emoji} grad={t.cover_grad} size="lg" />
        <div class="test-info">
          <div class="muted small">{kindLabel(t.kind)} · {t.questionCount} вопр. · {catName(t.category)}
            {t.status !== 'published' && <b class="warn-text"> · {t.status === 'draft' ? 'черновик' : 'скрыт'}</b>}</div>
          {t.description && <p class="desc">{t.description}</p>}
          <div class="small">Автор: <a class="link" href="#/" onClick={(e) => { e.preventDefault(); openAuthor(t.author); }}>{t.author.name}</a></div>
          <div class="small muted">Прошли: {num(t.plays)} · Нравится: {num(t.likes)} · Код теста: <b class="code">{t.code}</b></div>
        </div>
      </div>
      <div class="actions">
        <button class="bbtn big" onClick={() => go(`play/${id}`)}>{t.played ? 'Пройти ещё раз' : 'Начать тест'}</button>
        {t.played && <button class="gbtn" onClick={() => go(`r/${id}`)}>Мой результат: {t.myResultTitle}</button>}
        <button class={t.liked ? 'gbtn on' : 'gbtn'} onClick={toggleLike}>{t.liked ? '♥ Понравилось' : '♡ Мне нравится'}</button>
        <button class="gbtn" onClick={() => share()}>Рассказать друзьям</button>
        {(t.canEdit || isAdmin) && <button class="gbtn" onClick={() => go(`edit/${id}`)}>Редактировать</button>}
      </div>

      <Bar title={`Комментарии (${num(t.comments)})`} />
      <div class="comments">
        <form class="comment-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Avatar src={me.avatar} name={me.name} size={32} />
          <input value={text} maxLength={300} placeholder="Добавить комментарий…" onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <button class="bbtn" disabled={!text.trim()}>Отправить</button>
        </form>
        {comments.map((c) => (
          <div class="comment" key={c.id}>
            <a href="#/" onClick={(e) => { e.preventDefault(); openAuthor(c.user); }}><Avatar src={c.user.avatar} name={c.user.name} size={36} /></a>
            <div class="comment-body">
              <div class="small"><a class="link" href="#/" onClick={(e) => { e.preventDefault(); openAuthor(c.user); }}>{c.user.name}</a> <span class="muted">{fmtDate(c.created_at)}</span></div>
              <div>{c.text}</div>
            </div>
            {(c.user.id === me.id || t.canEdit || isAdmin) && <button class="x-btn" onClick={() => removeComment(c.id)} title="Удалить">✕</button>}
          </div>
        ))}
        {!comments.length && <p class="muted small">Комментариев пока нет.</p>}
        {more && <button class="gbtn" onClick={loadMore}>Показать ещё</button>}
      </div>
      {report && <ReportModal id={id} onClose={() => setReport(false)} />}
    </>
  );
}
