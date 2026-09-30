import type { RankingQuery } from '../schemas/ranking';
import type { DlsiteClient, DlsiteListingResult } from './client';
import { parseWorkListing } from './parser';

export async function getRankingsFromDlsite(client: DlsiteClient, query: RankingQuery): Promise<DlsiteListingResult> {
  const url = client.url(`${query.site}/ranking/${query.period}/`);
  url.searchParams.set('page', String(query.page));
  const html = await client.html(url, 'page');
  const listing = parseWorkListing(html, url.href, query.limit, query.page);
  return { works: listing.items, hasMore: listing.hasMore };
}
