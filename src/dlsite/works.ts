import { WorkSchema, type Work } from '../schemas/work';
import type { DlsiteSite } from '../schemas/common';
import { normalizeAbsoluteUrl } from './parser';
import type { DlsiteClient } from './client';
import { ApiError } from '../errors';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : {};
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replaceAll(',', '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (iso) return iso;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function rawImage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return asText(firstValue(record.url, record.src, record.image_url));
}

function listOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : [];
    const record = asRecord(entry);
    const name = asText(firstValue(record.name, record.genre_name, record.label));
    return name ? [name] : [];
  });
}

function keyedRecord(raw: unknown, productId: string): RecordValue {
  if (Array.isArray(raw)) return asRecord(raw[0]);
  const record = asRecord(raw);
  const matched = record[productId] ?? record[productId.toLowerCase()];
  return matched === undefined ? record : asRecord(matched);
}

function stripMarkup(value: string): string {
  return value
    .replace(/<\/(p|div|li|br|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function normalizeWork(
  productRaw: unknown,
  infoRaw: unknown,
  productId: string,
  site: DlsiteSite,
): Work {
  const product = keyedRecord(productRaw, productId);
  const info = keyedRecord(infoRaw, productId);
  const circleId = asText(firstValue(product.circle_id, product.maker_id, info.maker_id));
  const circleName = asText(firstValue(product.maker_name, product.circle_name, info.maker_name));
  const circle = circleId || circleName ? { id: circleId, name: circleName } : null;

  const genres = listOfStrings(firstValue(product.genres_replaced, product.genres));
  const samplesRaw = firstValue(product.image_samples, product.sample_images);
  const samples = Array.isArray(samplesRaw)
    ? samplesRaw
      .map(rawImage)
      .map((image) => normalizeAbsoluteUrl(image, 'https://www.dlsite.com'))
      .filter((image): image is string => image !== null)
    : [];
  const mainImage = normalizeAbsoluteUrl(
    rawImage(firstValue(product.image_main, product.work_image, info.work_image)),
    'https://www.dlsite.com',
  );
  const rawDescription = asText(firstValue(product.intro_s, product.intro, product.description));
  const productUrl = `https://www.dlsite.com/${site}/work/=/product_id/${productId}.html`;

  return WorkSchema.parse({
    id: productId.toUpperCase(),
    title: asText(firstValue(product.work_name_masked, product.work_name, product.title)) ?? productId,
    circle,
    price: {
      amount: asNumber(firstValue(info.price, info.price_with_tax, product.price)),
      currency: 'JPY',
    },
    rating: {
      average: asNumber(firstValue(info.rate_average_2dp, info.rate_average, product.rate_average_2dp)),
      count: asNumber(firstValue(info.rate_count, product.rate_count)),
    },
    releaseDate: dateOnly(firstValue(info.regist_date, product.regist_date, product.release_date)),
    genres,
    images: { main: mainImage, samples },
    workType: asText(firstValue(product.work_type_string, product.work_type, info.work_type)),
    ageRating: asText(firstValue(product.age_category_string, product.age_category, info.age_category)),
    description: rawDescription ? stripMarkup(rawDescription) : null,
    url: productUrl,
  });
}

export function productSiteForId(productId: string): DlsiteSite {
  const prefix = productId.slice(0, 2).toUpperCase();
  if (prefix === 'BJ') return 'books';
  if (prefix === 'VJ') return 'pro';
  return 'maniax';
}

export async function getWorkFromDlsite(client: DlsiteClient, productId: string, site?: DlsiteSite): Promise<Work> {
  const selectedSite = site ?? productSiteForId(productId);
  const productUrl = client.url(`${selectedSite}/api/=/product.json`);
  productUrl.searchParams.set('workno', productId.toUpperCase());
  productUrl.searchParams.set('locale', 'ja_JP');

  const infoUrl = client.url(`${selectedSite}/product/info/ajax`);
  infoUrl.searchParams.set('cdn_cache_min', '1');
  infoUrl.searchParams.set('product_id', productId.toUpperCase());

  const [productRaw, infoRaw] = await Promise.all([
    client.json(productUrl, 'work'),
    client.json(infoUrl, 'work').catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') throw error;
      return {};
    }),
  ]);
  const productRecord = Array.isArray(productRaw) ? productRaw[0] : productRaw;
  if (!productRecord || typeof productRecord !== 'object' || Object.keys(productRecord).length === 0) {
    throw new ApiError(404, 'WORK_NOT_FOUND', 'The requested work was not found.');
  }
  return normalizeWork(productRaw, infoRaw, productId, selectedSite);
}
