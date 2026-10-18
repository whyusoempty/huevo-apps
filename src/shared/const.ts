export const CATEGORIES = [
  { id: 'who', name: 'Кто ты?', emoji: '🎭' },
  { id: 'love', name: 'Любовь', emoji: '💘' },
  { id: 'character', name: 'Характер', emoji: '🧠' },
  { id: 'anime', name: 'Аниме и фэндомы', emoji: '🍥' },
  { id: 'games', name: 'Игры', emoji: '🎮' },
  { id: 'movies', name: 'Кино и музыка', emoji: '🎬' },
  { id: 'fun', name: 'Прикольные', emoji: '🤪' },
  { id: 'knowledge', name: 'Знания', emoji: '🎓' },
  { id: 'other', name: 'Другое', emoji: '✨' },
] as const;

export const GRADIENTS = [
  ['#ff9a9e', '#fad0c4'], ['#a18cd1', '#fbc2eb'], ['#84fab0', '#8fd3f4'],
  ['#fccb90', '#d57eeb'], ['#f6d365', '#fda085'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#667eea', '#764ba2'],
  ['#ff6a88', '#ff99ac'], ['#30cfd0', '#330867'], ['#f093fb', '#f5576c'],
] as const;

export const EMOJIS = ['🍥','🦊','🐺','🐱','🐶','🦄','🐉','👑','💎','🔥','⚡','🌈','🌙','☀️','🌸','🍀','🎧','🎮','🎬','📚','🚀','👻','💀','🤖','😎','🥰','😈','🍕','🍓','☕','🏆','🎯'];

export const LIMITS = {
  titleMin: 2, titleMax: 64,
  descMax: 500,
  questionsMin: 2, questionsMax: 20,
  answersMin: 2, answersMax: 6,
  resultsMin: 2, resultsMax: 12,
  questionLen: 200, answerLen: 100,
  resultTitleLen: 64, resultDescLen: 600,
  commentLen: 300,
  maxPoints: 5,
  donateMin: 1, donateMax: 100_000,
  testsPerDay: 10,
  teaserLen: 40,
  imageMaxBytes: 500_000,
  imagesPerDay: 100,
} as const;

export type Kind = 'personality' | 'quiz';

export interface EditAnswer { text: string; correct?: boolean; scores?: Record<string, number> }
export interface EditQuestion { text: string; emoji?: string; image?: string | null; answers: EditAnswer[] }
export interface EditResult { title: string; description: string; emoji: string; grad: number; image?: string | null; min?: number }
export interface TestContent { questions: EditQuestion[]; results: EditResult[]; teaser?: string; teaserImage?: string | null }
