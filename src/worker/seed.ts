import type { EditAnswer, EditQuestion, EditResult, Kind } from '../shared/const';
import type { Env } from './env';

const a = (text: string, scores: Record<number, number>): EditAnswer => ({
  text,
  scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v])),
});
const q = (text: string, emoji: string, answers: EditAnswer[]): EditQuestion => ({ text, emoji, answers });
const quizQ = (text: string, answers: string[], right: number): EditQuestion => ({
  text,
  answers: answers.map((t, i) => ({ text: t, correct: i === right })),
});

interface Seed {
  kind: Kind; title: string; description: string; emoji: string; grad: number; category: string; cover?: string;
  results: EditResult[]; questions: EditQuestion[];
}

const SEEDS: Seed[] = [
  {
    kind: 'personality', title: 'Кто ты из Наруто?', emoji: '🍥', grad: 4, category: 'anime',
    description: 'Узнай, какой шиноби скрывается внутри тебя. Отвечай не думая — первая мысль самая честная!',
    results: [
      { title: 'Наруто Узумаки', emoji: '🍥', grad: 4, description: 'Ты шумный, упрямый и никогда не сдаёшься. Тебя могут недооценивать, но ты всегда доказываешь обратное. Друзья для тебя — всё.' },
      { title: 'Саске Учиха', emoji: '⚡', grad: 8, description: 'Ты сдержанный, гордый и целеустремлённый. Редко показываешь чувства, но если уж ставишь цель — идёшь до конца.' },
      { title: 'Сакура Харуно', emoji: '🌸', grad: 9, description: 'Умная, волевая и заботливая. Ты вырастаешь из сомнений в настоящую силу и всегда готова прикрыть команду.' },
      { title: 'Какаши Хатаке', emoji: '📖', grad: 5, description: 'Спокойный, ироничный и всегда чуть-чуть опаздываешь. Зато в нужный момент ты — самый надёжный человек рядом.' },
      { title: 'Хината Хюга', emoji: '🌙', grad: 1, description: 'Тихая, добрая и невероятно стойкая. Твоя сила — в верности и в том, что ты не отступаешь, когда это важно.' },
      { title: 'Шикамару Нара', emoji: '☁️', grad: 6, description: 'Ленивый гений. «Как же всё хлопотно» — твой девиз, но план у тебя всегда уже готов.' },
    ],
    questions: [
      q('Как проходит твоё идеальное утро?', '🌅', [
        a('Вскакиваю и сразу куда-то бегу', { 0: 3, 2: 1 }), a('Тренировка до завтрака', { 1: 3, 2: 1 }),
        a('Лежу и смотрю на облака', { 5: 3, 3: 1 }), a('Тихо пью чай и читаю', { 3: 2, 4: 2 }),
      ]),
      q('Друг попал в беду. Что делаешь?', '🆘', [
        a('Бегу на помощь, плана нет, зато есть упрямство', { 0: 3 }), a('Придумываю стратегию и только потом иду', { 5: 3, 3: 1 }),
        a('Иду молча, но иду обязательно', { 1: 2, 4: 2 }), a('Лечу, перевязываю и ругаю за неосторожность', { 2: 3 }),
      ]),
      q('Твоя главная черта?', '💫', [
        a('Упорство', { 0: 3, 1: 1 }), a('Ум', { 5: 2, 3: 2, 2: 1 }), a('Верность', { 4: 3, 2: 1 }), a('Гордость', { 1: 3 }),
      ]),
      q('Любимая еда?', '🍜', [
        a('Рамен, конечно!', { 0: 3 }), a('Что-нибудь простое и без лишней остроты', { 1: 2, 3: 1 }),
        a('Корица-булочки и чай', { 4: 3 }), a('Всё, что не нужно готовить', { 5: 2, 3: 1 }),
      ]),
      q('Как относишься к правилам?', '📜', [
        a('Правила для того, чтобы их ломать', { 0: 3 }), a('Следую, но обхожу, если мешают цели', { 1: 2, 5: 1 }),
        a('Соблюдаю и других прошу', { 2: 3, 4: 1 }), a('Знаю их все, но выбираю по ситуации', { 3: 3, 5: 1 }),
      ]),
      q('Чего ты боишься больше всего?', '😨', [
        a('Остаться одному', { 0: 3, 4: 1 }), a('Потерять близких и не успеть их защитить', { 1: 3, 3: 1 }),
        a('Оказаться слабой', { 2: 2, 4: 2 }), a('Что станет слишком хлопотно', { 5: 3 }),
      ]),
    ],
  },
  {
    kind: 'personality', title: 'Какое ты животное?', emoji: '🦊', grad: 3, category: 'who',
    description: 'Классика старого интернета: пять вопросов — и ты узнаешь свою звериную сущность.',
    results: [
      { title: 'Кот', emoji: '🐱', grad: 1, description: 'Независимый и обаятельный. Ты любишь комфорт, но когда хочешь — становишься центром внимания.' },
      { title: 'Волк', emoji: '🐺', grad: 8, description: 'Ты преданный и сильный, ценишь свою стаю и умеешь идти до цели.' },
      { title: 'Лиса', emoji: '🦊', grad: 4, description: 'Хитрая и находчивая. Из любой ситуации найдёшь выход — желательно красивый.' },
      { title: 'Сова', emoji: '🦉', grad: 10, description: 'Мудрая ночная душа. Ты думаешь, наблюдаешь и расцветаешь, когда все спят.' },
    ],
    questions: [
      q('Когда ты бодрее всего?', '🕰️', [a('Утром', { 1: 2, 2: 1 }), a('Днём', { 2: 2, 1: 1 }), a('Вечером', { 0: 3 }), a('Глубокой ночью', { 3: 3 })]),
      q('Идеальный выходной?', '🏖️', [a('Валяться дома', { 0: 3 }), a('Поход с друзьями', { 1: 3 }), a('Приключение в новом месте', { 2: 3 }), a('Книга и тишина', { 3: 3 })]),
      q('Как ты решаешь проблемы?', '🧩', [a('Хитростью', { 2: 3 }), a('Напролом', { 1: 3 }), a('Жду, пока само пройдёт', { 0: 3 }), a('Анализирую со всех сторон', { 3: 3 })]),
      q('Что для тебя важнее?', '❤️', [a('Свобода', { 0: 2, 2: 1 }), a('Близкие', { 1: 3 }), a('Интересные впечатления', { 2: 3 }), a('Знания', { 3: 3 })]),
      q('Выбери цвет', '🎨', [a('Фиолетовый', { 0: 2, 3: 1 }), a('Серый', { 1: 2, 3: 1 }), a('Рыжий', { 2: 3 }), a('Тёмно-синий', { 3: 2, 1: 1 })]),
    ],
  },
  {
    kind: 'quiz', title: 'Эрудит или нет?', emoji: '🎓', grad: 5, category: 'knowledge',
    description: 'Шесть вопросов на общую эрудицию. За каждый правильный ответ — балл. Не подглядывай!',
    results: [
      { title: 'Пока в разработке', emoji: '🐣', grad: 4, min: 0, description: 'Не расстраивайся: знания — дело наживное. Пройди ещё раз!' },
      { title: 'Любознательный', emoji: '🔍', grad: 5, min: 3, description: 'Хороший результат! Ты явно читал что-то помимо ленты.' },
      { title: 'Эрудит', emoji: '🧠', grad: 8, min: 5, description: 'Почти идеально. С тобой приятно играть в «Что? Где? Когда?»' },
      { title: 'Гений', emoji: '👑', grad: 3, min: 6, description: 'Все ответы верны! Тебе стоит делать свои тесты — залетай в конструктор.' },
    ],
    questions: [
      quizQ('Какая планета Солнечной системы самая большая?', ['Сатурн', 'Юпитер', 'Нептун', 'Земля'], 1),
      quizQ('Сколько сторон у шестиугольника?', ['5', '6', '7', '8'], 1),
      quizQ('Кто написал «Войну и мир»?', ['Достоевский', 'Чехов', 'Толстой', 'Пушкин'], 2),
      quizQ('Столица Японии?', ['Киото', 'Осака', 'Токио', 'Нагоя'], 2),
      quizQ('Какой газ мы вдыхаем для жизни?', ['Азот', 'Кислород', 'Гелий', 'Водород'], 1),
      quizQ('Сколько континентов на Земле (по классической модели)?', ['5', '6', '7', '8'], 2),
    ],
  },
];

/** Файлы из public/seed (см. scripts/fetch_seed_images.py). Naruto без картинок: персонажи защищены авторским правом. */
const COVER: Record<string, string> = { 'Какое ты животное?': 'fox', 'Эрудит или нет?': 'jupiter' };
const RESULT_IMG: Record<string, string> = {
  'Кот': 'cat', 'Волк': 'wolf', 'Лиса': 'fox', 'Сова': 'owl',
  'Пока в разработке': 'chick', 'Любознательный': 'magnifier', 'Эрудит': 'owl', 'Гений': 'einstein',
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const genCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

let seeded = false;

/** Один раз за жизнь изолята: если тестов нет — добавляем стартовые от «редакции» (author_id = 0). */
export async function ensureSeed(env: Env) {
  if (seeded) return;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM tests').first<{ n: number }>();
  if (row && row.n === 0) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, username, display_name, avatar, created_at) VALUES (0, 'huevo-tests', 'Редакция тестов', '', ?)",
    ).bind(now).run();
    const ids = new Map<string, string>();
    const image = async (name?: string) => {
      if (!name) return null;
      if (ids.has(name)) return ids.get(name)!;
      const res = await env.ASSETS.fetch(`https://assets.local/seed/${name}.jpg`);
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
      const data = await res.arrayBuffer();
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare('INSERT INTO images (id, user_id, size, created_at, data) VALUES (?,0,?,?,?)').bind(id, data.byteLength, now, data).run();
      ids.set(name, id);
      return id;
    };
    for (const [i, s] of SEEDS.entries()) {
      const cover = await image(COVER[s.title]);
      for (const r of s.results) r.image = await image(RESULT_IMG[r.title]);
      await env.DB.prepare(
        `INSERT INTO tests (code, author_id, kind, title, description, cover_emoji, cover_grad, cover_image, category, content,
           status, plays, likes, created_at, updated_at, published_at)
         VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0, 0, ?, ?, ?)`,
      ).bind(genCode(), s.kind, s.title, s.description, s.emoji, s.grad, cover, s.category,
        JSON.stringify({ questions: s.questions, results: s.results }), now - i, now - i, now - i).run();
    }
  }
  seeded = true;
}
