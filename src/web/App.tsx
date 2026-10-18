import { useCallback, useEffect, useState } from 'preact/hooks';
import { ApiError, api, onRelogin, setToken } from './api';
import { Admin } from './pages/Admin';
import { Editor } from './pages/Editor';
import { Guide } from './pages/Guide';
import { Home } from './pages/Home';
import { Mine } from './pages/Mine';
import { Play } from './pages/Play';
import { Result } from './pages/Result';
import { Top } from './pages/Top';
import { TestPage } from './pages/TestPage';
import { go, useRoute } from './router';
import { launchParams, loadSdk } from './sdk';
import { THEMES, getTheme, setTheme } from './theme';
import { AppCtx, Empty, Spinner, TopTabs, type Session } from './ui';

async function login(): Promise<Session> {
  const sdk = await loadSdk();
  if (sdk) await sdk.init().catch(() => {});
  const params = launchParams();
  const body = params.hu_hash ? { params } : { dev: { id: Number(new URLSearchParams(location.search).get('dev')) || 1 } };
  const r = await api('/login', { body });
  setToken(r.token);
  return { me: r.user, mode: r.mode, isAdmin: r.isAdmin };
}

/** Ссылка из поста: ?start=КОД, во фрейм приходит подписанный hu_start — сразу открываем этот тест. */
async function openSharedTest() {
  const code = (launchParams().hu_start ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (code.length < 3) return;
  try {
    const r = await api<{ id: number }>(`/tests/code/${code}`);
    go(`t/${r.id}`);
  } catch { /* неверный код — остаёмся на главной */ }
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const route = useRoute();
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => {
    onRelogin(async () => { setSession(await login()); });
    login().then((sess) => { setSession(sess); openSharedTest(); }).catch((e: ApiError) => {
      setFailed(e.code === 'banned' ? 'Доступ закрыт.' : e.status === 401
        ? 'Открой приложение через huEVO — так мы узнаем, кто ты.'
        : 'Не получилось подключиться. Попробуй обновить страницу.');
    });
  }, []);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  if (failed) return <div class="page center"><Empty text={failed} /></div>;
  if (!session) return <div class="page center"><Spinner /></div>;

  const [page, arg] = route;
  const id = Number(arg);
  let view;
  let tab = 'home';
  switch (page) {
    case 't': view = <TestPage key={id} id={id} />; break;
    case 'play': view = <Play key={id} id={id} />; break;
    case 'r': view = <Result key={id} id={id} />; break;
    case 'new': view = <Editor key="new" />; tab = 'new'; break;
    case 'edit': view = <Editor key={`e${id}`} id={id} />; tab = 'new'; break;
    case 'me': view = <Mine />; tab = 'me'; break;
    case 'guide': view = <Guide />; tab = 'new'; break;
    case 'top': view = <Top />; tab = 'top'; break;
    case 'admin': view = session.isAdmin ? <Admin /> : <Empty text="Нет доступа" />; tab = 'admin'; break;
    default: view = <Home />;
  }
  const hideTabs = page === 'play';

  return (
    <AppCtx.Provider value={{ ...session, toast }}>
      <main class="page">{!hideTabs && <TopTabs active={tab} />}{view}
        <div class="theme-switch">Оформление:{THEMES.map((t) => (
          <a key={t.id} href="#/" class={theme === t.id ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTheme(t.id); setThemeState(t.id); }}>{t.name}</a>
        ))}</div>
      </main>
      <div class="toasts">{toasts.map((t) => <div key={t.id} class="toast">{t.msg}</div>)}</div>
    </AppCtx.Provider>
  );
}
