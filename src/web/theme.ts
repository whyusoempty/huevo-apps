export const THEMES = [
  { id: 'classic', name: 'Классика ВК' },
  { id: 'soft', name: 'Мягкая' },
  { id: 'dark', name: 'Тёмная' },
] as const;

const KEY = 'tests.theme';

export function getTheme(): string {
  try {
    const t = localStorage.getItem(KEY);
    if (THEMES.some((x) => x.id === t)) return t!;
  } catch { /* storage may be unavailable */ }
  return 'classic';
}

export function applyTheme(id: string) {
  document.documentElement.dataset.theme = id;
}

export function setTheme(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  applyTheme(id);
}
