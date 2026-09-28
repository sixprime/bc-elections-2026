const sections = new Set(['province', 'ridings', 'candidates', 'parties', 'polls', 'about']);
let siteBase = new URL('./', import.meta.url).pathname;

export function configureRouteBase(value) {
  siteBase = /^https?:\/\//.test(value) ? new URL(value).pathname : value;
  if (!siteBase.endsWith('/')) siteBase += '/';
}

export function routePath(route = 'province') {
  if (route === 'province') return '';
  if (sections.has(route)) return `${route}/`;
  if (/^riding\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) return `ridings/${route.slice(7)}/`;
  throw new Error(`Unknown route: ${route}`);
}

export function routeFromPath(pathname, basePath = siteBase) {
  if (pathname === basePath.slice(0, -1)) return 'province';
  if (!pathname.startsWith(basePath)) return null;
  const path = pathname.slice(basePath.length).replace(/(?:^|\/)index\.html$/, '').replace(/\/$/, '');
  if (!path) return 'province';
  if (sections.has(path) && path !== 'province') return path;
  if (/^ridings\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return `riding/${path.slice(8)}`;
  return null;
}

export function legacyRoute(hash) {
  let route;
  try { route = decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
  if (route === 'methodology') return 'about';
  if (route === 'ballot') return 'province';
  if (sections.has(route) || /^riding\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) return route;
  return null;
}

export function routeHref(route = 'province', language = new URLSearchParams(globalThis.location?.search || '').get('lang')) {
  return `${siteHref(routePath(route))}${language === 'en' || language === 'fr' ? `?lang=${language}` : ''}`;
}

export const siteHref = path => `${siteBase}${path}`;
export const currentRoute = () => routeFromPath(location.pathname);

export function refreshRouteLinks(root = document) {
  for (const link of root.querySelectorAll('a[data-route]')) link.setAttribute('href', routeHref(link.dataset.route));
}

function announceNavigation() {
  window.dispatchEvent(new Event('routechange'));
}

export function navigate(route, { replace = false } = {}) {
  const href = routeHref(route);
  if (`${location.pathname}${location.search}${location.hash}` === href) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', href);
  announceNavigation();
}

export function installRouter() {
  const redirectLegacy = () => {
    const route = legacyRoute(location.hash);
    if (!route) return false;
    history.replaceState(history.state, '', routeHref(route));
    return true;
  };
  redirectLegacy();
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.hash || !routeFromPath(url.pathname)) return;
    event.preventDefault();
    const href = `${url.pathname}${url.search}`;
    if (href === `${location.pathname}${location.search}`) return;
    history.pushState(null, '', href);
    announceNavigation();
  });
  window.addEventListener('popstate', announceNavigation);
  window.addEventListener('hashchange', () => { if (redirectLegacy()) announceNavigation(); });
}
