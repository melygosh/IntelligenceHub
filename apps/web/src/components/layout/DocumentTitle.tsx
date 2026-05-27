import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTitle } from './PageTitleContext';

const APP_NAME = 'News Intelligence';

// First path segment → section label for list/section pages.
const SECTION: Record<string, string> = {
  articles: 'Articles',
  entities: 'Entities',
  graph: 'Graph',
  digests: 'Digests',
  feeds: 'Feeds',
  categories: 'Categories',
  telemetry: 'Telemetry',
};

const AUTH: Record<string, string> = {
  login: 'Sign in',
  register: 'Create account',
  'check-email': 'Confirm your email',
  confirm: 'Confirming email',
};

/** Derive the tab title from the route, preferring a page-supplied title
 * (set by detail pages via useSetPageTitle) over the static section label. */
function titleFor(pathname: string, pageTitle: string | null): string {
  const segs = pathname.split('/').filter(Boolean);
  const first = segs[0];
  let label: string | null = null;
  if (first === 'auth') {
    label = (segs[1] && AUTH[segs[1]]) || 'Welcome';
  } else if (first === 'settings') {
    label = segs[1] === 'axes' ? 'Axes' : 'Settings';
  } else if (pageTitle) {
    label = pageTitle;
  } else if (first) {
    label = SECTION[first] ?? null;
  }
  return label ? `${label} · ${APP_NAME}` : APP_NAME;
}

/** Headless component: keeps document.title in sync with the current route. */
export function DocumentTitle() {
  const { pathname } = useLocation();
  const pageTitle = usePageTitle();
  useEffect(() => {
    document.title = titleFor(pathname, pageTitle);
  }, [pathname, pageTitle]);
  return null;
}
