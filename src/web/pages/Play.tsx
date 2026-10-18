import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { go } from '../router';
import { Bar, Spinner, imgUrl, useApp } from '../ui';
import { cacheResult } from './Result';

interface PlayData {
  kind: string;
  questions: { text: string; emoji?: string; image?: string | null; answers: string[] }[];
}

export function Play({ id }: { id: number }) {
  const { toast } = useApp();
  const [data, setData] = useState<PlayData | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    api<PlayData>(`/tests/${id}/play`).then((d) => {
      setData(d);
      if (!started.current) { started.current = true; api(`/tests/${id}/start`, { body: {} }).catch(() => {}); }
    }).catch((e) => { toast(e.message); go(`t/${id}`); });
  }, [id]);

  if (!data) return <><Bar title="Тест" onBack={() => go(`t/${id}`)} /><Spinner /></>;

  const total = data.questions.length;
  const q = data.questions[i];

  const finish = async (all: number[]) => {
    setBusy(true);
    try {
      const r = await api(`/tests/${id}/finish`, { body: { answers: all } });
      cacheResult(id, r);
      go(`r/${id}`);
    } catch (e: any) { toast(e.message); setBusy(false); setPicked(null); }
  };

  const pick = (idx: number) => {
    if (busy || picked !== null) return;
    setPicked(idx);
    const all = [...answers.slice(0, i), idx];
    setTimeout(() => {
      setAnswers(all);
      if (i + 1 >= total) finish(all);
      else { setI(i + 1); setPicked(null); }
    }, 220);
  };

  const prev = () => { if (i > 0 && !busy) { setI(i - 1); setPicked(null); } };

  return (
    <>
      <Bar title={`Вопрос ${i + 1} из ${total}`} onBack={() => (i === 0 ? go(`t/${id}`) : prev())} />
      <div class="progress"><div style={{ width: `${((i + (picked !== null ? 1 : 0)) / total) * 100}%` }} /></div>
      <div class="question" key={i}>
        {q.image && <img class="q-image" src={imgUrl(q.image)} alt="" />}
        <h2>{q.text}</h2>
        <div class="answers">
          {q.answers.map((a, idx) => (
            <button key={idx} class={`answer ${picked === idx ? 'picked' : answers[i] === idx && picked === null ? 'was' : ''}`}
              disabled={busy} onClick={() => pick(idx)}>{a}</button>
          ))}
        </div>
      </div>
      {busy && <Spinner />}
    </>
  );
}
