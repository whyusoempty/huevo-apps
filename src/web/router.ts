import { useEffect, useState } from 'preact/hooks';

export function parseHash(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const h = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}

export const go = (path: string) => { location.hash = '#/' + path.replace(/^\/+/, ''); };
export const back = () => (history.length > 1 ? history.back() : go(''));
