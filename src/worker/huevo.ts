import { huevoSign, safeEqual } from './crypto';
import type { Env } from './env';

const API = 'https://huevo.su/api/apps/v1';
export const LAUNCH_MAX_AGE = 24 * 3600;

/** Проверка подписи hu_* (раздел «Авторизация пользователя»). Возвращает hu_* или null. */
export async function verifyLaunch(
  env: Env,
  params: Record<string, unknown>,
): Promise<Record<string, string> | null> {
  const hu: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('hu_') && typeof v === 'string') hu[k] = v;
  }
  const given = hu.hu_hash ?? '';
  const data = Object.keys(hu)
    .filter((k) => k !== 'hu_hash')
    .sort()
    .map((k) => `${k}=${hu[k]}`)
    .join('\n');
  const expected = await huevoSign(env.HUEVO_CLIENT_SECRET, data);
  if (!safeEqual(expected, given)) return null;
  const age = Date.now() / 1000 - Number(hu.hu_ts);
  if (!(age >= 0 && age <= LAUNCH_MAX_AGE)) return null;
  return hu;
}

export async function verifyCallbackSignature(env: Env, rawBody: string, signature: string) {
  const expected = await huevoSign(env.HUEVO_CLIENT_SECRET, rawBody);
  return safeEqual(expected, signature.trim().toLowerCase());
}

interface ApiError { code: string; message?: string }

export class HuevoError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function call<T>(env: Env, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Basic ' + btoa(`${env.HUEVO_CLIENT_ID}:${env.HUEVO_CLIENT_SECRET}`),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: { ok?: boolean; error?: ApiError } & Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new HuevoError(res.status, 'bad_response');
  }
  if (!res.ok || !json.ok) throw new HuevoError(res.status, json.error?.code ?? 'internal');
  return json as T;
}

export interface Intent {
  intent_id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
  amount: number;
  user_id: number;
  test: boolean;
  error: string | null;
}

export const createPayment = (
  env: Env,
  p: { user_id: number; amount: number; description: string; idempotency_key: string; test: boolean },
) => call<Intent>(env, 'POST', '/payments', p);

export const getPayment = (env: Env, id: string) =>
  call<Intent>(env, 'GET', `/payments/${encodeURIComponent(id)}`);

export const createCredit = (
  env: Env,
  p: { user_id: number; amount: number; reason: string; idempotency_key: string; test: boolean },
) => call<{ credit_id: number; status: string }>(env, 'POST', '/credits', p);
