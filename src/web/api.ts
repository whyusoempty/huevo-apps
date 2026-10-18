const TOKEN_KEY = 'tests.token';

let token: string | null = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage may be unavailable */ }

let relogin: (() => Promise<void>) | null = null;
export const onRelogin = (fn: () => Promise<void>) => { relogin = fn; };

export function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export const authHeader = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Opts { method?: string; body?: unknown }

export async function api<T = any>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером');
  }
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && relogin && path !== '/login') {
    try {
      await relogin();
      return api<T>(path, opts, true);
    } catch { /* fallthrough */ }
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Что-то пошло не так');
  }
  return data as T;
}
