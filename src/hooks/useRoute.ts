import { useEffect, useState } from 'react';
import type { RouteKey } from '@/types';

const ROUTES: RouteKey[] = ['dashboard', 'strategy', 'plan', 'calendar', 'bank', 'performance', 'settings'];

function parse(): RouteKey {
  const key = window.location.hash.replace(/^#\/?/, '').split('?')[0] as RouteKey;
  return ROUTES.includes(key) ? key : 'dashboard';
}

/** Minimal hash router — no dependency needed for 7 pages. */
export function useRoute(): RouteKey {
  const [route, setRoute] = useState<RouteKey>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: RouteKey) {
  window.location.hash = `/${route}`;
}
