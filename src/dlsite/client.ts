import { ApiError, upstreamStatusError } from '../errors';
import type { Circle } from '../schemas/circle';
import type { DlsiteSite } from '../schemas/common';
import type { SearchQuery } from '../schemas/search';
import type { RankingQuery } from '../schemas/ranking';
import type { Work, WorkListItem } from '../schemas/work';
import { getCircleFromDlsite, getCircleWorksFromDlsite } from './circles';
import { getRankingsFromDlsite } from './rankings';
import { searchDlsite } from './search';
import { getWorkFromDlsite } from './works';

const DLSITE_ORIGIN = 'https://www.dlsite.com';
const REQUEST_TIMEOUT_MS = 12_000;

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type UpstreamResource = 'work' | 'circle' | 'page';

export interface DlsiteListingResult {
  works: WorkListItem[];
  hasMore: boolean;
}

export interface CircleWorkListingResult extends DlsiteListingResult {
  circle: Circle;
}

export class DlsiteClient {
  constructor(private readonly fetcher: Fetcher = (input, init) => globalThis.fetch(input, init)) {}

  url(path: string): URL {
    return new URL(path, `${DLSITE_ORIGIN}/`);
  }

  async json(url: URL, resource: UpstreamResource): Promise<unknown> {
    const response = await this.request(url, resource);
    const body = await this.responseText(response);
    if (/site unavailable|access denied|just a moment\.\.\./i.test(body)) {
      throw new ApiError(503, 'DLSITE_UNAVAILABLE', 'DLsite returned an access or availability page.');
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ApiError(502, 'DLSITE_UPSTREAM_ERROR', 'DLsite returned invalid JSON.');
    }
  }

  async html(url: URL, resource: 'circle' | 'page'): Promise<string> {
    const response = await this.request(url, resource);
    return this.responseText(response);
  }

  getWork(productId: string, site?: DlsiteSite): Promise<Work> {
    return getWorkFromDlsite(this, productId, site);
  }

  search(query: SearchQuery): Promise<DlsiteListingResult> {
    return searchDlsite(this, query);
  }

  getCircle(makerId: string, site: DlsiteSite): Promise<Circle> {
    return getCircleFromDlsite(this, makerId, site);
  }

  getCircleWorks(makerId: string, site: DlsiteSite, page: number, limit: number): Promise<CircleWorkListingResult> {
    return getCircleWorksFromDlsite(this, makerId, site, page, limit);
  }

  getRankings(query: RankingQuery): Promise<DlsiteListingResult> {
    return getRankingsFromDlsite(this, query);
  }

  private async request(url: URL, resource: UpstreamResource): Promise<Response> {
    let response: Response;
    const startedAt = Date.now();
    try {
      response = await this.fetcher(url, {
        headers: {
          accept: 'application/json, text/html;q=0.9, */*;q=0.8',
          'accept-language': 'ja-JP,ja;q=0.9,en-US;q=0.7',
          'user-agent': 'Mozilla/5.0 (compatible; DlsitePublicApi/0.1; +https://github.com/)',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const timedOut = errorName === 'TimeoutError' || /timed out|timeout/i.test(errorMessage);
      const safePath = url.pathname
        .replace(/\/keyword\/[^/]+/g, '/keyword/[redacted]')
        .replace(/\/maker_id\/[^/.]+/g, '/maker_id/[redacted]')
        .replace(/\/product_id\/[^/.]+/g, '/product_id/[redacted]');
      const safeMessage = errorMessage.replace(/https?:\/\/[^\s"']+/g, '[upstream URL]');

      console.error('DLsite upstream fetch failed', {
        host: url.host,
        path: safePath,
        resource,
        elapsedMs: Date.now() - startedAt,
        errorName,
        errorMessage: safeMessage,
      });

      throw new ApiError(
        503,
        'DLSITE_UNAVAILABLE',
        timedOut ? 'DLsite request timed out.' : 'Could not connect to DLsite.',
      );
    }

    if (!response.ok) throw upstreamStatusError(response.status, resource);
    return response;
  }

  private async responseText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      throw new ApiError(503, 'DLSITE_UNAVAILABLE', 'DLsite response could not be read.');
    }
  }
}
