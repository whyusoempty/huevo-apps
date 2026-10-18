/** Обёртка над huEVO Apps SDK. Скрипт обязательно с домена huEVO (иначе SDK принимает сообщения от любого родителя). */
const SDK_URL = 'https://huevo.su/static/js/huevo-apps-v1.js';

export interface HuevoSdk {
  init(opts?: unknown): Promise<{ mode: 'live' | 'test'; user: { id: number } }>;
  confirmPayment(intentId: string): Promise<{ intent_id: string; status: string; test: boolean; error?: string }>;
  share(): Promise<{ shared: boolean }>;
  shareContent(o: { text?: string; attachment?: Blob }): Promise<{ shared: boolean }>;
  openProfile(userId: number): Promise<{ opened: boolean }>;
  openLink(url: string): Promise<{ opened: boolean }>;
  fullscreen(on?: boolean): Promise<{ fullscreen: boolean }>;
  launchParams(): Record<string, string>;
  on(event: string, cb: (...a: any[]) => void): unknown;
}

declare global { interface Window { huevo?: HuevoSdk } }

let sdkPromise: Promise<HuevoSdk | null> | null = null;

export function loadSdk(): Promise<HuevoSdk | null> {
  sdkPromise ??= new Promise((resolve) => {
    if (window.huevo) return resolve(window.huevo);
    const s = document.createElement('script');
    const timer = setTimeout(() => resolve(window.huevo ?? null), 5000);
    s.src = SDK_URL;
    s.onload = () => { clearTimeout(timer); resolve(window.huevo ?? null); };
    s.onerror = () => { clearTimeout(timer); resolve(null); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export const sdk = () => window.huevo ?? null;

export const errCode = (e: unknown) => (e as { code?: string })?.code ?? 'error';

/** Параметры запуска: из SDK, а если его нет — из адресной строки. */
export function readLaunchParams(): Record<string, string> {
  const fromSdk = window.huevo?.launchParams?.();
  if (fromSdk && Object.keys(fromSdk).length) return fromSdk;
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(location.search)) if (k.startsWith('hu_')) out[k] = v;
  return out;
}

// hu_* читаем один раз при загрузке: при навигации query может пропасть.
let cached: Record<string, string> | null = null;
export function launchParams() {
  if (!cached || !Object.keys(cached).length) cached = readLaunchParams();
  return cached;
}
