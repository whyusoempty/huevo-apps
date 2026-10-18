import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect } from 'preact/hooks';
import { CATEGORIES, GRADIENTS } from '../shared/const';
import { sdk } from './sdk';

export interface Me { id: number; name: string; avatar: string; username: string }
export interface Session { me: Me; mode: 'live' | 'test'; isAdmin: boolean }
export interface Ctx extends Session { toast: (msg: string) => void }
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export interface TestItem {
  id: number; code: string; kind: 'personality' | 'quiz'; title: string; description: string;
  cover_emoji: string; cover_grad: number; cover_image: string | null; category: string; status: string;
  plays: number; finishes: number; likes: number; comments: number; liked: boolean;
  author: { id: number; name: string; avatar: string };
  earned?: number;
}

export const gradCss = (i: number) => {
  const [a, b] = GRADIENTS[i] ?? GRADIENTS[0];
  return `linear-gradient(135deg, ${a}, ${b})`;
};

export const imgUrl = (id: string) => `/img/${id}`;
export const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? '';
export const kindLabel = (k: string) => (k === 'quiz' ? 'Викторина' : 'Тест «кто ты»');

/** Миниатюра: картинка, а если её нет — значок на градиенте. */
export function Thumb({ image, emoji, grad, size = 'md' }: { image?: string | null; emoji: string; grad: number; size?: 'sm' | 'md' | 'lg' }) {
  return image
    ? <img class={`thumb thumb-${size}`} src={imgUrl(image)} alt="" loading="lazy" />
    : <div class={`thumb thumb-${size} thumb-ph`} style={{ background: gradCss(grad) }}><span>{emoji}</span></div>;
}

export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  return src
    ? <img class="avatar" src={src} alt="" style={{ width: size, height: size }} />
    : <span class="avatar avatar-ph" style={{ width: size, height: size, fontSize: size * 0.5 }}>{(name || '?')[0]}</span>;
}

export const Spinner = () => <div class="spinner" aria-label="Загрузка" />;

export function Empty({ text, children }: { emoji?: string; text: string; children?: ComponentChildren }) {
  return <div class="empty"><p>{text}</p>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div class="modal-bg" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head"><h3>{title}</h3><button class="x-btn" onClick={onClose} aria-label="Закрыть">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function openAuthor(a: { id: number }) {
  if (a.id > 0) sdk()?.openProfile(a.id).catch(() => {});
}

export const num = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(n));

/** Плитка каталога: квадратная картинка с тенью и подпись под ней. */
export function TestTile({ t }: { t: TestItem }) {
  return (
    <a class="tile" href={`#/t/${t.id}`}>
      <Thumb image={t.cover_image} emoji={t.cover_emoji} grad={t.cover_grad} />
      <span class="tile-title">{t.title}</span>
    </a>
  );
}

/** Заголовок раздела: серая полоса, как в старом ВК. */
export function Bar({ title, onBack, right }: { title: ComponentChildren; onBack?: () => void; right?: ComponentChildren }) {
  return (
    <div class="hbar">
      {onBack && <a class="hbar-back" href="#/" onClick={(e) => { e.preventDefault(); onBack(); }}>← назад</a>}
      <span class="hbar-title">{title}</span>
      <span class="hbar-right">{right}</span>
    </div>
  );
}

export function TopTabs({ active }: { active: string }) {
  const { isAdmin } = useApp();
  const tab = (id: string, path: string, label: string) => (
    <a href={`#/${path}`} class={active === id ? 'vtab active' : 'vtab'}>{label}</a>
  );
  return (
    <nav class="vtabs">
      {tab('home', '', 'Каталог тестов')}{tab('top', 'top', 'Топ')}{tab('me', 'me', 'Мои тесты')}{tab('new', 'new', 'Редактор')}
      {isAdmin && tab('admin', 'admin', 'Админка')}
    </nav>
  );
}

export const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
