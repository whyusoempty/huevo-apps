import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, EMOJIS, GRADIENTS, LIMITS, type EditQuestion, type EditResult, type Kind } from '../../shared/const';
import { api } from '../api';
import { back, go } from '../router';
import { Bar, Spinner, Thumb, gradCss, imgUrl, useApp } from '../ui';
import { uploadImage } from '../upload';

interface Form {
  kind: Kind; title: string; description: string; cover_emoji: string; cover_grad: number; cover_image: string | null; category: string;
  teaser: string;
  teaserImage: string | null;
  results: EditResult[]; questions: EditQuestion[];
}

const emptyResult = (i: number, kind: Kind): EditResult => ({
  title: '', description: '', image: null, emoji: EMOJIS[(i * 5) % EMOJIS.length], grad: (i * 3) % GRADIENTS.length, min: kind === 'quiz' ? i : undefined,
});
const emptyQuestion = (kind: Kind): EditQuestion => ({
  text: '', image: null, answers: [{ text: '', correct: kind === 'quiz' ? true : undefined, scores: {} }, { text: '', correct: kind === 'quiz' ? false : undefined, scores: {} }],
});
const initial = (kind: Kind = 'personality'): Form => ({
  kind, title: '', description: '', cover_emoji: '🎭', cover_grad: 1, cover_image: null, category: 'who', teaser: '', teaserImage: null,
  results: [emptyResult(0, kind), emptyResult(1, kind)],
  questions: [emptyQuestion(kind), emptyQuestion(kind)],
});

const STEPS = ['Основное', 'Результаты', 'Вопросы', 'Готово'];

function EmojiPick({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="emoji-pick">
      <button type="button" class="emoji-btn" onClick={() => setOpen(!open)}>{value}</button>
      {open && <div class="emoji-grid">{EMOJIS.map((e) => <button type="button" key={e} onClick={() => { onChange(e); setOpen(false); }}>{e}</button>)}</div>}
    </div>
  );
}

function ImageField({ value, onChange, label = 'Загрузить картинку' }: { value?: string | null; onChange: (id: string | null) => void; label?: string }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const pick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file)); } catch (err: any) { toast(err.message); }
    setBusy(false);
  };
  return (
    <div class="img-field">
      {value && <img src={imgUrl(value)} alt="" />}
      <label class="gbtn">{busy ? 'Загружаем…' : value ? 'Заменить' : label}
        <input type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
      </label>
      {value && <button type="button" class="gbtn" onClick={() => onChange(null)}>Убрать</button>}
    </div>
  );
}

export function Editor({ id }: { id?: number }) {
  const { toast } = useApp();
  const draftKey = `tests.draft.${id ?? 'new'}`;
  const [f, setF] = useState<Form | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const loaded = useRef(false);

  useEffect(() => {
    if (id) {
      api(`/tests/${id}/edit`).then((t) => {
        setStatus(t.status);
        setF({ kind: t.kind, title: t.title, description: t.description, cover_emoji: t.cover_emoji, cover_grad: t.cover_grad,
          cover_image: t.cover_image ?? null, teaser: t.content.teaser ?? '', teaserImage: t.content.teaserImage ?? null, category: t.category, results: t.content.results, questions: t.content.questions });
        loaded.current = true;
      }).catch((e) => { toast(e.message); back(); });
    } else {
      let restored: Form | null = null;
      try { restored = JSON.parse(localStorage.getItem(draftKey) ?? 'null'); } catch { /* ignore */ }
      if (restored?.questions) toast('Восстановили твой незаконченный тест');
      setF(restored?.questions ? restored : initial());
      loaded.current = true;
    }
  }, [id]);

  // локальное автосохранение: серверный черновик требует полностью валидного теста
  useEffect(() => {
    if (!f || !loaded.current || id) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(f)); } catch { /* ignore */ } }, 600);
    return () => clearTimeout(t);
  }, [f]);

  if (!f) return <><Bar title="Конструктор" onBack={back} /><Spinner /></>;

  const upd = (patch: Partial<Form>) => setF({ ...f, ...patch });
  const setKind = (kind: Kind) => {
    if (kind === f.kind) return;
    setF({ ...initial(kind), title: f.title, description: f.description, cover_emoji: f.cover_emoji, cover_grad: f.cover_grad, cover_image: f.cover_image, teaser: f.teaser, teaserImage: f.teaserImage, category: f.category });
  };

  // ---- результаты ----
  const setResult = (i: number, patch: Partial<EditResult>) => upd({ results: f.results.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addResult = () => f.results.length < LIMITS.resultsMax && upd({ results: [...f.results, emptyResult(f.results.length, f.kind)] });
  const removeResult = (ri: number) => {
    if (f.results.length <= LIMITS.resultsMin) return;
    const questions = f.questions.map((q) => ({
      ...q,
      answers: q.answers.map((a) => {
        const scores: Record<string, number> = {};
        for (const [k, v] of Object.entries(a.scores ?? {})) {
          const n = Number(k);
          if (n < ri) scores[k] = v; else if (n > ri) scores[String(n - 1)] = v;
        }
        return { ...a, scores };
      }),
    }));
    upd({ results: f.results.filter((_, k) => k !== ri), questions });
  };

  // ---- вопросы ----
  const setQuestion = (qi: number, patch: Partial<EditQuestion>) => upd({ questions: f.questions.map((q, k) => (k === qi ? { ...q, ...patch } : q)) });
  const setAnswer = (qi: number, ai: number, patch: object) =>
    setQuestion(qi, { answers: f.questions[qi].answers.map((a, k) => (k === ai ? { ...a, ...patch } : a)) });
  const setCorrect = (qi: number, ai: number) =>
    setQuestion(qi, { answers: f.questions[qi].answers.map((a, k) => ({ ...a, correct: k === ai })) });
  const cyclePoints = (qi: number, ai: number, ri: number) => {
    const a = f.questions[qi].answers[ai];
    const cur = a.scores?.[ri] ?? 0;
    const next = cur >= 3 ? 0 : cur + 1;
    const scores = { ...(a.scores ?? {}) };
    if (next) scores[ri] = next; else delete scores[ri];
    setAnswer(qi, ai, { scores });
  };
  const addAnswer = (qi: number) => f.questions[qi].answers.length < LIMITS.answersMax &&
    setQuestion(qi, { answers: [...f.questions[qi].answers, { text: '', correct: f.kind === 'quiz' ? false : undefined, scores: {} }] });
  const removeAnswer = (qi: number, ai: number) => {
    const q = f.questions[qi];
    if (q.answers.length <= LIMITS.answersMin) return;
    let answers = q.answers.filter((_, k) => k !== ai);
    if (f.kind === 'quiz' && !answers.some((a) => a.correct)) answers = answers.map((a, k) => ({ ...a, correct: k === 0 }));
    setQuestion(qi, { answers });
  };
  const addQuestion = () => f.questions.length < LIMITS.questionsMax && upd({ questions: [...f.questions, emptyQuestion(f.kind)] });
  const removeQuestion = (qi: number) => f.questions.length > LIMITS.questionsMin && upd({ questions: f.questions.filter((_, k) => k !== qi) });
  const moveQuestion = (qi: number, d: number) => {
    const to = qi + d;
    if (to < 0 || to >= f.questions.length) return;
    const qs = [...f.questions];
    [qs[qi], qs[to]] = [qs[to], qs[qi]];
    upd({ questions: qs });
  };

  const save = async (publish: boolean) => {
    setSaving(true);
    setError('');
    try {
      const body = { ...f, content: { questions: f.questions, results: f.results, teaser: f.teaser, teaserImage: f.teaserImage }, publish };
      const r = await api<{ id: number; status: string }>(id ? `/tests/${id}` : '/tests', { method: id ? 'PUT' : 'POST', body });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toast(publish ? 'Тест опубликован! 🎉' : 'Черновик сохранён');
      go(`t/${r.id}`);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const quiz = f.kind === 'quiz';

  return (
    <>
      <Bar title={id ? 'Изменить тест' : 'Новый тест'} onBack={() => (step === 0 ? back() : setStep(step - 1))} />
      <div class="steps">{STEPS.map((s, i) => <button key={s} class={i === step ? 'active' : i < step ? 'done' : ''} onClick={() => setStep(i)}><i>{i + 1}</i>{s}</button>)}</div>
      <div class="editor">
        {step === 0 && (
          <>
            <p class="small"><a class="link" href="#/guide">Как сделать хороший тест: гайд</a></p>
            {!id && (
              <div class="seg">
                <button class={!quiz ? 'active' : ''} onClick={() => setKind('personality')}>Кто ты?</button>
                <button class={quiz ? 'active' : ''} onClick={() => setKind('quiz')}>Викторина</button>
              </div>
            )}
            <p class="muted small">{quiz ? 'Викторина: за каждый правильный ответ — балл, итог зависит от числа баллов.' : 'Тест «кто ты»: ответы дают очки разным результатам (персонажам), побеждает набравший больше всех.'}</p>
            <label class="field">Название
              <input value={f.title} maxLength={LIMITS.titleMax} placeholder={quiz ? 'Насколько ты знаешь аниме?' : 'Кто ты из Наруто?'} onInput={(e) => upd({ title: (e.target as HTMLInputElement).value })} />
            </label>
            <label class="field">Описание
              <textarea rows={3} value={f.description} maxLength={LIMITS.descMax} placeholder="Пара слов о тесте" onInput={(e) => upd({ description: (e.target as HTMLTextAreaElement).value })} />
            </label>
            <label class="field">Категория
              <select value={f.category} onChange={(e) => upd({ category: (e.target as HTMLSelectElement).value })}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </label>
            <label class="field">Подпись в картинке-результате (необязательно)
              <input value={f.teaser} maxLength={LIMITS.teaserLen} placeholder="Он уже знает, кто ты)))" onInput={(e) => upd({ teaser: (e.target as HTMLInputElement).value })} />
            </label>
            <div class="field">Картинка для подписи (левая нижняя в коллаже, например мем)
              <ImageField value={f.teaserImage} onChange={(v) => upd({ teaserImage: v })} label="Загрузить картинку" />
            </div>
            <div class="field">Обложка
              <ImageField value={f.cover_image} onChange={(v) => upd({ cover_image: v })} label="Загрузить обложку" />
              <p class="muted small">Нет картинки? Выбери значок и фон — они покажутся вместо неё.</p>
              <div class="cover-preview"><Thumb image={f.cover_image} emoji={f.cover_emoji} grad={f.cover_grad} size="lg" /></div>
              <div class="emoji-grid inline">{EMOJIS.map((e) => <button type="button" key={e} class={f.cover_emoji === e ? 'sel' : ''} onClick={() => upd({ cover_emoji: e })}>{e}</button>)}</div>
              <div class="grads">{GRADIENTS.map((_, i) => <button type="button" key={i} class={f.cover_grad === i ? 'sel' : ''} style={{ background: gradCss(i) }} onClick={() => upd({ cover_grad: i })} aria-label={`Фон ${i + 1}`} />)}</div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p class="muted small">{quiz ? 'Что увидит игрок в зависимости от баллов. Первый результат должен начинаться с 0.' : 'Кем (чем) может оказаться игрок. Минимум 2.'}</p>
            {f.results.map((r, i) => (
              <div class="card edit-card" key={i}>
                <div class="edit-head">
                  <b>Результат {i + 1}</b>
                  <button class="x-btn" disabled={f.results.length <= LIMITS.resultsMin} onClick={() => removeResult(i)}>✕</button>
                </div>
                <div class="row start">
                  <EmojiPick value={r.emoji} onChange={(e) => setResult(i, { emoji: e })} />
                  <button type="button" class="grad-btn" style={{ background: gradCss(r.grad) }} onClick={() => setResult(i, { grad: (r.grad + 1) % GRADIENTS.length })} title="Сменить фон" />
                  <input value={r.title} maxLength={LIMITS.resultTitleLen} placeholder={quiz ? 'Название уровня' : 'Название, например «Наруто»'} onInput={(e) => setResult(i, { title: (e.target as HTMLInputElement).value })} />
                </div>
                <textarea rows={2} value={r.description} maxLength={LIMITS.resultDescLen} placeholder="Описание результата" onInput={(e) => setResult(i, { description: (e.target as HTMLTextAreaElement).value })} />
                <ImageField value={r.image} onChange={(v) => setResult(i, { image: v })} label="Картинка результата" />
                {quiz && (
                  <label class="field inline">От скольких баллов
                    <input type="number" min={0} max={f.questions.length} value={r.min ?? 0} disabled={i === 0} onInput={(e) => setResult(i, { min: Number((e.target as HTMLInputElement).value) })} />
                  </label>
                )}
              </div>
            ))}
            <button class="gbtn" disabled={f.results.length >= LIMITS.resultsMax} onClick={addResult}>+ Добавить результат</button>
          </>
        )}

        {step === 2 && (
          <>
            <p class="muted small">{quiz ? 'Отметь кружком правильный ответ.' : 'Нажимай на значки результатов у ответа, чтобы добавить очки (0–3). Ответ может давать очки сразу нескольким.'}</p>
            {f.questions.map((q, qi) => (
              <div class="card edit-card" key={qi}>
                <div class="edit-head">
                  <b>Вопрос {qi + 1}</b>
                  <span>
                    <button class="x-btn" disabled={qi === 0} onClick={() => moveQuestion(qi, -1)}>↑</button>
                    <button class="x-btn" disabled={qi === f.questions.length - 1} onClick={() => moveQuestion(qi, 1)}>↓</button>
                    <button class="x-btn" disabled={f.questions.length <= LIMITS.questionsMin} onClick={() => removeQuestion(qi)}>✕</button>
                  </span>
                </div>
                <input value={q.text} maxLength={LIMITS.questionLen} placeholder="Текст вопроса" onInput={(e) => setQuestion(qi, { text: (e.target as HTMLInputElement).value })} />
                <ImageField value={q.image} onChange={(v) => setQuestion(qi, { image: v })} label="Картинка к вопросу" />
                {q.answers.map((a, ai) => (
                  <div class="ans-edit" key={ai}>
                    <div class="row start">
                      {quiz && <input type="radio" name={`c${qi}`} checked={!!a.correct} onChange={() => setCorrect(qi, ai)} />}
                      <input value={a.text} maxLength={LIMITS.answerLen} placeholder={`Ответ ${ai + 1}`} onInput={(e) => setAnswer(qi, ai, { text: (e.target as HTMLInputElement).value })} />
                      <button class="x-btn" disabled={q.answers.length <= LIMITS.answersMin} onClick={() => removeAnswer(qi, ai)}>✕</button>
                    </div>
                    {!quiz && (
                      <div class="pts">
                        {f.results.map((r, ri) => (
                          <button type="button" key={ri} class={a.scores?.[ri] ? 'pt on' : 'pt'} title={r.title} onClick={() => cyclePoints(qi, ai, ri)}>
                            {r.emoji}{a.scores?.[ri] ? ` +${a.scores[ri]}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button class="gbtn sm" disabled={q.answers.length >= LIMITS.answersMax} onClick={() => addAnswer(qi)}>+ Ответ</button>
              </div>
            ))}
            <button class="gbtn" disabled={f.questions.length >= LIMITS.questionsMax} onClick={addQuestion}>+ Добавить вопрос</button>
          </>
        )}

        {step === 3 && (
          <>
            <div class="card center">
              <Thumb image={f.cover_image} emoji={f.cover_emoji} grad={f.cover_grad} size="lg" />
              <h3>{f.title || 'Без названия'}</h3>
              <p class="muted">{quiz ? 'Викторина' : 'Тест «кто ты»'} · {f.questions.length} вопр. · {f.results.length} результ.</p>
            </div>
            <p class="muted small">Публикуя тест, ты соглашаешься, что он не содержит оскорблений, 18+ и ссылок. На тесты можно жаловаться — спорные скрываются до проверки.</p>
            {error && <div class="error">{error}</div>}
            <button class="bbtn big" disabled={saving} onClick={() => save(true)}>{status === 'published' ? 'Сохранить изменения' : 'Опубликовать'}</button>
            {status !== 'published' && <button class="gbtn" disabled={saving} onClick={() => save(false)}>Сохранить как черновик</button>}
            {status === 'published' && <button class="gbtn" disabled={saving} onClick={() => save(false)}>Снять с публикации</button>}
            <p class="muted small center">Черновик увидишь только ты. Пройти его можно со страницы теста.</p>
          </>
        )}

        <div class="row nav">
          {step > 0 && <button class="gbtn" onClick={() => setStep(step - 1)}>Назад</button>}
          {step < 3 && <button class="bbtn" onClick={() => setStep(step + 1)}>Далее</button>}
        </div>
      </div>
    </>
  );
}
