import type { SearchQuery } from '../schemas/search';
import type { DlsiteClient, DlsiteListingResult } from './client';
import { parseWorkListing } from './parser';

export async function searchDlsite(client: DlsiteClient, query: SearchQuery): Promise<DlsiteListingResult> {
  const keyword = encodeURIComponent(query.keyword).replaceAll('%20', '+');
  const url = client.url(`${query.site}/fsr/=/keyword/${keyword}/order[0]/${query.sort}/per_page/${query.limit}/page/${query.page}/from/fs.header`);
  const html = await client.html(url, 'page');
  const listing = parseWorkListing(html, url.href, query.limit, query.page);
  return { works: listing.items, hasMore: listing.hasMore };
}
