import { ApiError } from '../errors';
import type { Circle } from '../schemas/circle';
import type { DlsiteSite } from '../schemas/common';
import type { CircleWorkListingResult, DlsiteClient } from './client';
import { parseCirclePage, parseWorkListing } from './parser';

export async function getCircleFromDlsite(client: DlsiteClient, makerId: string, site: DlsiteSite): Promise<Circle> {
  const url = client.url(`${site}/circle/profile/=/maker_id/${makerId.toUpperCase()}.html`);
  const html = await client.html(url, 'circle');
  const circle = parseCirclePage(html, makerId, site, url.href);
  if (!circle) throw new ApiError(404, 'CIRCLE_NOT_FOUND', 'The requested circle was not found.');
  return circle;
}

export async function getCircleWorksFromDlsite(
  client: DlsiteClient,
  makerId: string,
  site: DlsiteSite,
  page: number,
  limit: number,
): Promise<CircleWorkListingResult> {
  const url = client.url(`${site}/circle/profile/=/maker_id/${makerId.toUpperCase()}.html`);
  url.searchParams.set('page', String(page));
  const html = await client.html(url, 'circle');
  const circle = parseCirclePage(html, makerId, site, url.href);
  if (!circle) throw new ApiError(404, 'CIRCLE_NOT_FOUND', 'The requested circle was not found.');
  const listing = parseWorkListing(html, url.href, limit, page);
  return { circle, works: listing.items, hasMore: listing.hasMore };
}
