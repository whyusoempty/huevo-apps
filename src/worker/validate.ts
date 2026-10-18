import { CATEGORIES, LIMITS, type Kind, type TestContent } from '../shared/const';

export interface TestInput {
  kind: Kind;
  title: string;
  description: string;
  cover_emoji: string;
  cover_grad: number;
  category: string;
  cover_image: string | null;
  content: TestContent;
}

export const IMAGE_ID_RE = /^[a-f0-9]{16}$/;
const imgId = (v: unknown) => (typeof v === 'string' && IMAGE_ID_RE.test(v) ? v : null);

/** Все id картинок, которые использует тест (для проверки владения). */
export function imageIds(d: TestInput): string[] {
  const ids = [d.cover_image, ...d.content.results.map((r) => r.image), ...d.content.questions.map((q) => q.image), d.content.teaserImage];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const LINK_RE = /https?:\/\/|www\.|\.(ru|com|su|net|org)\b/i;

/** Возвращает нормализованный тест или текст ошибки. */
export function validateTest(raw: any): { ok: true; data: TestInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!raw || typeof raw !== 'object') return fail('Неверные данные');

  const kind: Kind = raw.kind === 'quiz' ? 'quiz' : 'personality';
  const title = str(raw.title, LIMITS.titleMax);
  if (title.length < LIMITS.titleMin) return fail('Название слишком короткое');
  const description = str(raw.description, LIMITS.descMax);
  const category = CATEGORIES.some((c) => c.id === raw.category) ? String(raw.category) : 'other';
  const cover_emoji = str(raw.cover_emoji, 8) || '✨';
  const cover_grad = Math.max(0, Math.min(11, Number(raw.cover_grad) | 0));

  const rq = raw.content?.questions;
  const rr = raw.content?.results;
  if (!Array.isArray(rq) || rq.length < LIMITS.questionsMin || rq.length > LIMITS.questionsMax)
    return fail(`Вопросов должно быть от ${LIMITS.questionsMin} до ${LIMITS.questionsMax}`);
  if (!Array.isArray(rr) || rr.length < LIMITS.resultsMin || rr.length > LIMITS.resultsMax)
    return fail(`Результатов должно быть от ${LIMITS.resultsMin} до ${LIMITS.resultsMax}`);

  const results = rr.map((r: any, i: number) => ({
    title: str(r?.title, LIMITS.resultTitleLen),
    description: str(r?.description, LIMITS.resultDescLen),
    emoji: str(r?.emoji, 8) || '✨',
    grad: Math.max(0, Math.min(11, Number(r?.grad) | 0)),
    image: imgId(r?.image),
    min: kind === 'quiz' ? Math.max(0, Number(r?.min) | 0) : undefined,
  }));
  for (const [i, r] of results.entries()) {
    if (!r.title) return fail(`Результат №${i + 1}: нет названия`);
  }

  if (kind === 'quiz') {
    results.sort((a, b) => a.min! - b.min!);
    if (results[0].min !== 0) return fail('Нужен результат, начинающийся с 0 баллов');
    for (let i = 1; i < results.length; i++) {
      if (results[i].min === results[i - 1].min) return fail('Диапазоны баллов в результатах не должны повторяться');
    }
    if (results[results.length - 1].min! > rq.length) return fail('Порог результата больше числа вопросов');
  }

  const questions = [];
  for (const [qi, q] of rq.entries()) {
    const text = str(q?.text, LIMITS.questionLen);
    if (!text) return fail(`Вопрос №${qi + 1}: пустой текст`);
    if (!Array.isArray(q.answers) || q.answers.length < LIMITS.answersMin || q.answers.length > LIMITS.answersMax)
      return fail(`Вопрос №${qi + 1}: ответов от ${LIMITS.answersMin} до ${LIMITS.answersMax}`);
    const answers = q.answers.map((a: any) => {
      const scores: Record<string, number> = {};
      if (kind === 'personality' && a?.scores && typeof a.scores === 'object') {
        for (const [k, v] of Object.entries(a.scores)) {
          const idx = Number(k);
          const pts = Math.max(0, Math.min(LIMITS.maxPoints, Number(v) | 0));
          if (Number.isInteger(idx) && idx >= 0 && idx < results.length && pts > 0) scores[String(idx)] = pts;
        }
      }
      return { text: str(a?.text, LIMITS.answerLen), correct: kind === 'quiz' ? !!a?.correct : undefined, scores };
    });
    if (answers.some((a: any) => !a.text)) return fail(`Вопрос №${qi + 1}: есть пустой ответ`);
    if (kind === 'quiz' && answers.filter((a: any) => a.correct).length !== 1)
      return fail(`Вопрос №${qi + 1}: отметь ровно один правильный ответ`);
    if (kind === 'personality' && !answers.some((a: any) => Object.keys(a.scores).length))
      return fail(`Вопрос №${qi + 1}: ни один ответ не даёт очков результатам`);
    questions.push({ text, emoji: str(q?.emoji, 8) || undefined, image: imgId(q?.image), answers });
  }

  if (kind === 'personality') {
    for (const [ri, r] of results.entries()) {
      const reachable = questions.some((q) => q.answers.some((a: any) => a.scores[String(ri)]));
      if (!reachable) return fail(`Результат «${r.title}» недостижим: ни один ответ не даёт ему очков`);
    }
  }

  const teaser = str(raw.content?.teaser, LIMITS.teaserLen);
  const all = [title, description, teaser, ...results.flatMap((r) => [r.title, r.description]),
    ...questions.flatMap((q) => [q.text, ...q.answers.map((a: any) => a.text)])];
  if (all.some((t) => LINK_RE.test(t))) return fail('Ссылки в тестах запрещены');

  return { ok: true, data: { kind, title, description, cover_emoji, cover_grad, category, cover_image: imgId(raw.cover_image), content: { questions, results, teaser: teaser || undefined, teaserImage: imgId(raw.content?.teaserImage) } } };
}

export function scoreTest(kind: Kind, content: TestContent, answers: number[]) {
  const { questions, results } = content;
  if (answers.length !== questions.length) return null;
  let correct: number[] = [];
  for (const [i, q] of questions.entries()) {
    const a = answers[i];
    if (!Number.isInteger(a) || a < 0 || a >= q.answers.length) return null;
  }
  if (kind === 'quiz') {
    correct = questions.map((q) => q.answers.findIndex((a) => a.correct));
    const score = answers.filter((a, i) => a === correct[i]).length;
    let idx = 0;
    results.forEach((r, i) => { if ((r.min ?? 0) <= score && (r.min ?? 0) >= (results[idx].min ?? 0)) idx = i; });
    return { resultIdx: idx, score, correct };
  }
  const totals = results.map(() => 0);
  questions.forEach((q, i) => {
    for (const [k, v] of Object.entries(q.answers[answers[i]].scores ?? {})) totals[Number(k)] += v;
  });
  let idx = 0;
  totals.forEach((t, i) => { if (t > totals[idx]) idx = i; });
  return { resultIdx: idx, score: totals[idx], correct };
}
