import { parseHTML } from 'linkedom';
import { ApiError } from '../errors';
import type { Circle } from '../schemas/circle';
import type { DlsiteSite } from '../schemas/common';
import type { WorkListItem } from '../schemas/work';

const PRODUCT_ID_RE = /(?:product_id|workno)[=/]+((?:RJ|VJ|BJ|EB|AC|RE|VT)\d{5,10})/i;
const MAKER_ID_RE = /maker_id[=/]+([A-Z]{2}\d{4,12})/i;

export interface ParsedListing {
  items: WorkListItem[];
  hasMore: boolean;
}

export function normalizeAbsoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.startsWith('data:')) return null;
  try {
    const absolute = new URL(candidate, baseUrl);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null;
    return absolute.href;
  } catch {
    return null;
  }
}

function assertUsableHtml(html: string): void {
  const normalized = html.toLowerCase();
  if (
    normalized.includes('<title>site unavailable</title>') ||
    normalized.includes('access denied') ||
    normalized.includes('too many requests') ||
    normalized.includes('service temporarily unavailable') ||
    normalized.includes('just a moment...')
  ) {
    throw new ApiError(503, 'DLSITE_UNAVAILABLE', 'DLsite returned an access or availability page.');
  }
}

function textOf(element: Element | null | undefined): string | null {
  const text = element?.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function productIdFromHref(href: string | null): string | null {
  if (!href) return null;
  return PRODUCT_ID_RE.exec(href)?.[1]?.toUpperCase() ?? null;
}

function findCard(anchor: Element): Element {
  let current: Element | null = anchor;
  let fallback: Element = anchor;
  for (let depth = 0; current && depth < 8; depth += 1) {
    fallback = current;
    const tag = current.tagName.toLowerCase();
    const classes = current.getAttribute('class') ?? '';
    if (
      tag === 'li' || tag === 'article' ||
      /(?:work|product|ranking|search)[-_ ]?(?:item|card|content|result|list)/i.test(classes)
    ) return current;
    current = current.parentElement;
  }
  return fallback;
}

function priceFromText(text: string): number | null {
  const yen = /[¥￥]\s*([\d,]+)/.exec(text);
  const yenSuffix = /([\d,]+)\s*円/.exec(text);
  const match = yen ?? yenSuffix;
  if (!match?.[1]) return null;
  const amount = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseCard(anchor: Element, baseUrl: string): WorkListItem | null {
  const href = anchor.getAttribute('href');
  const id = productIdFromHref(href);
  if (!id || !href) return null;

  const card = findCard(anchor);
  const titleNode = card.querySelector(
    '.work_name, .work_name_masked, .work_name_link, [class*="work_name"], h2, h3, h4',
  );
  const title = textOf(titleNode) ?? anchor.getAttribute('title')?.trim() ?? textOf(anchor) ?? id;
  const image = card.querySelector('img');
  const rawImage = image?.getAttribute('data-src') ??
    image?.getAttribute('data-original') ??
    image?.getAttribute('data-lazy-src') ??
    image?.getAttribute('src');
  const imageUrl = normalizeAbsoluteUrl(rawImage, baseUrl);
  const makerAnchor = card.querySelector('a[href*="maker_id/"]');
  const makerId = makerAnchor?.getAttribute('href')?.match(MAKER_ID_RE)?.[1] ?? null;
  const makerName = textOf(makerAnchor);
  const amount = priceFromText(card.textContent ?? '');
  const absoluteUrl = normalizeAbsoluteUrl(href, baseUrl);
  if (!absoluteUrl) return null;

  return {
    id,
    title,
    url: absoluteUrl,
    image: imageUrl,
    price: { amount, currency: 'JPY' },
    circle: makerId || makerName ? { id: makerId, name: makerName } : null,
  };
}

export function parseWorkListing(html: string, baseUrl: string, limit: number, page = 1): ParsedListing {
  assertUsableHtml(html);
  const { document } = parseHTML(html);
  const unique = new Map<string, WorkListItem>();
  for (const anchor of document.querySelectorAll('a[href]')) {
    const item = parseCard(anchor, baseUrl);
    if (item && !unique.has(item.id)) unique.set(item.id, item);
  }
  const allItems = [...unique.values()];
  const linkedPages = [...document.querySelectorAll('a[href]')]
    .map((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const pathPage = /(?:^|\/)page\/(\d+)(?:\/|$)/.exec(href)?.[1];
      const queryPage = /[?&]page=(\d+)/.exec(href)?.[1];
      return Number(pathPage ?? queryPage ?? 0);
    })
    .filter(Number.isFinite);
  return {
    items: allItems.slice(0, limit),
    hasMore: linkedPages.some((candidate) => candidate > page) || allItems.length >= limit,
  };
}

function fromJsonLd(document: Document): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? 'null');
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        if (value && typeof value === 'object') entries.push(value as Record<string, unknown>);
      }
    } catch {
      // A broken JSON-LD block should not prevent the HTML fallback from being read.
    }
  }
  return entries;
}

function descriptionFromLd(document: Document): string | null {
  for (const item of fromJsonLd(document)) {
    const description = item.description;
    if (typeof description === 'string' && description.trim()) return description.trim();
  }
  const meta = document.querySelector('meta[name="description"]')?.getAttribute('content');
  return meta?.trim() || null;
}

export function parseCirclePage(
  html: string,
  makerId: string,
  site: DlsiteSite,
  url: string,
): Circle | null {
  assertUsableHtml(html);
  if (!html.toUpperCase().includes(makerId.toUpperCase())) return null;
  const { document } = parseHTML(html);
  const title = document.querySelector('h1, .prof_maker_name, [class*="maker_name"]');
  const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const pageTitle = textOf(title) ?? metaTitle?.trim() ?? null;
  if (!pageTitle || /not found|見つかりません|存在しません/i.test(pageTitle)) return null;

  const name = pageTitle
    .replace(/\s*[|｜-]\s*DLsite.*$/i, '')
    .replace(/\s*の作品一覧.*$/, '')
    .trim();
  if (!name) return null;
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const circleUrl = normalizeAbsoluteUrl(canonical, url) ??
    `https://www.dlsite.com/${site}/circle/profile/=/maker_id/${makerId}.html`;

  return {
    id: makerId.toUpperCase(),
    name,
    url: circleUrl,
    description: descriptionFromLd(document),
  };
}

export function parseListingJsonLd(html: string): unknown[] {
  assertUsableHtml(html);
  const { document } = parseHTML(html);
  return fromJsonLd(document);
}
