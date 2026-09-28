import { translate } from './i18n.js';
import { routePath } from './routes.js';

export const publishedSite = 'https://sixprime.github.io/bc-elections-2026/';
export const districtSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const sections = {
  province: ['British Columbia Election 2026', 'Explore British Columbia election candidates, ridings, original party quotations, professional polls and official 2024 results. Independent and unofficial.'],
  ridings: ['BC Ridings and Candidates 2026', 'Find all 93 British Columbia ridings, source-linked 2026 candidate records, official district boundaries and historical election results.'],
  candidates: ['BC Candidates 2026', 'Browse source-linked candidate records for the 2026 British Columbia election. Accepted nominations and party announcements are identified separately.'],
  parties: ['BC Party Programmes 2026', 'Read exact quotations from official BC party sources, compare topics and follow links to the original programmes. No paraphrased policies or predictions.'],
  polls: ['BC Election Polls 2026', 'Explore professional British Columbia election polls, fieldwork dates, historical observations and original pollster releases. No seat forecast.'],
  about: ['About BC Election Guide', 'Read about the independent BC Election Guide, its sources, candidate verification, polling methodology, privacy and contact information.']
};

export function pageInfo(route, election, base = publishedSite) {
  const name = route?.startsWith('riding/') ? election.districts.find(district => districtSlug(district) === route.slice(7)) : null;
  const available = Boolean(name || Object.hasOwn(sections, route));
  const heading = name ? translate('{riding} Candidates 2026', { riding: name }) : available ? translate(sections[route][0]) : translate('Page not found');
  const description = name ? translate('Explore {riding} candidates for the 2026 BC election, source-linked candidacy records, the MLA at dissolution and official 2024 results.', { riding: name }) : available ? translate(sections[route][1]) : translate('This page is not available. Choose a riding or return to the overview.');
  const imagePath = `assets/previews/${available ? route.replace('riding/', 'riding-') : 'province'}.png`;
  return {
    route,
    name,
    section: name ? 'ridings' : available ? route : 'not-found',
    heading,
    title: `${heading} | BC Election Guide`,
    description,
    url: new URL(available ? routePath(route) : '404.html', base).href,
    image: new URL(imagePath, base).href,
    imagePath,
    imageAlt: translate('{title}. Official British Columbia riding boundaries.', { title: heading }),
    indexable: available
  };
}

export function sitePages(election, base = publishedSite) {
  return [...Object.keys(sections), ...election.districts.map(name => `riding/${districtSlug(name)}`)].map(route => pageInfo(route, election, base));
}

export function updatePageMetadata(info) {
  document.title = info.title;
  for (const [selector, content] of [
    ['meta[name="description"]', info.description],
    ['meta[property="og:title"]', info.title],
    ['meta[property="og:description"]', info.description],
    ['meta[property="og:url"]', info.url],
    ['meta[property="og:image"]', info.image],
    ['meta[property="og:image:secure_url"]', info.image],
    ['meta[property="og:image:alt"]', info.imageAlt],
    ['meta[name="twitter:title"]', info.title],
    ['meta[name="twitter:description"]', info.description],
    ['meta[name="twitter:image"]', info.image],
    ['meta[name="twitter:image:alt"]', info.imageAlt],
    ['meta[name="robots"]', info.indexable ? 'index,follow' : 'noindex,follow']
  ]) document.querySelector(selector)?.setAttribute('content', content);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', info.url);
  document.querySelector('meta[property="og:locale"]')?.setAttribute('content', document.documentElement.lang.replace('-', '_'));
  const structured = document.querySelector('script[data-page-schema]');
  if (structured) structured.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: info.title, description: info.description, url: info.url, image: info.image, inLanguage: document.documentElement.lang });
}
