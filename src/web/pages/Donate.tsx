import { useEffect, useState } from 'preact/hooks';
import { LIMITS } from '../../shared/const';
import { api } from '../api';
import { sdk } from '../sdk';
import { Modal, useApp } from '../ui';

const PRESETS = [5, 10, 50, 100];

export function Donate({ testId, authorName, onClose }: { testId: number; authorName: string; onClose: () => void }) {
  const { mode } = useApp();
  const [amount, setAmount] = useState(10);
  const [commission, setCommission] = useState(10);
  const [state, setState] = useState<'form' | 'wait' | 'ok' | 'fail'>('form');
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/config').then((c) => setCommission(c.commission)).catch(() => {}); }, []);

  const payout = Math.max(1, Math.floor((amount * (100 - commission)) / 100));
  const valid = Number.isInteger(amount) && amount >= LIMITS.donateMin && amount <= LIMITS.donateMax;

  const pay = async () => {
    const s = sdk();
    if (!s) { setMsg('Оплата доступна только внутри huEVO'); setState('fail'); return; }
    setState('wait');
    try {
      const d = await api<{ donation_id: number; intent_id: string }>('/donate', { body: { test_id: testId, amount } });
      // результат confirmPayment на клиенте не доверенный — итог проверяет сервер
      await s.confirmPayment(d.intent_id).catch(() => null);
      let status = 'pending';
      for (let i = 0; i < 5 && status === 'pending'; i++) {
        status = (await api<{ status: string }>(`/donate/${d.donation_id}/check`, { body: {} })).status;
        if (status === 'pending') await new Promise((r) => setTimeout(r, 1000));
      }
      if (status === 'done' || status === 'payout_pending') {
        setState('ok');
        setMsg(status === 'done' ? 'Монетки отправлены автору. Спасибо!' : 'Платёж прошёл. Автор получит монетки в ближайшее время.');
      } else {
        setState('fail');
        setMsg(status === 'pending' || status === 'expired' ? 'Платёж не подтверждён. Монетки не списаны.' : 'Платёж не прошёл. Проверь баланс и попробуй ещё раз.');
      }
    } catch (e: any) {
      setState('fail');
      setMsg(e.message);
    }
  };

  return (
    <Modal title="Поддержать автора" onClose={onClose}>
      {state === 'form' && (
        <>
          <p class="muted">Необязательно, но приятно: отправь монетки автору, <b>{authorName}</b>, за тест.</p>
          <div class="chips">
            {PRESETS.map((p) => <button key={p} class={amount === p ? 'gbtn on' : 'gbtn'} onClick={() => setAmount(p)}>{p} монеток</button>)}
          </div>
          <label class="field">Своя сумма
            <input type="number" min={LIMITS.donateMin} max={LIMITS.donateMax} value={amount}
              onInput={(e) => setAmount(Math.floor(Number((e.target as HTMLInputElement).value)))} />
          </label>
          <p class="muted small">
            Автору дойдёт {valid ? payout : '—'} монеток{commission ? ` (${commission}% — комиссия приложения)` : ''}.
            {mode === 'test' && ' Тестовый режим: монетки не списываются.'}
          </p>
          <button class="gold-btn big" disabled={!valid} onClick={pay}>Отправить {valid ? amount : ''} монеток</button>
        </>
      )}
      {state === 'wait' && <p class="center">Подтверди платёж в окне huEVO…</p>}
      {(state === 'ok' || state === 'fail') && (
        <>
          <p class="center">{msg}</p>
          <button class="bbtn" onClick={state === 'ok' ? onClose : () => setState('form')}>{state === 'ok' ? 'Закрыть' : 'Назад'}</button>
        </>
      )}
    </Modal>
  );
}
