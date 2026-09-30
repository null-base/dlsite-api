import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';
import { createApp } from '../src';
import type { Fetcher } from '../src/dlsite/client';
import type { ResponseCache } from '../src/cache';

const searchHtml = await readFile(new URL('./fixtures/search.html', import.meta.url), 'utf8');
const circleHtml = await readFile(new URL('./fixtures/circle.html', import.meta.url), 'utf8');

class MemoryCache implements ResponseCache {
  private values = new Map<string, Response>();

  get size(): number {
    return this.values.size;
  }

  async match(request: Request): Promise<Response | undefined> {
    return this.values.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.values.set(request.url, response.clone());
  }
}

function fixtureFetcher(onFetch?: (url: URL) => void): Fetcher {
  return async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    onFetch?.(url);
    if (url.pathname.endsWith('/api/=/product.json')) {
      return Response.json([{
        workno: 'RJ01234567',
        work_name: 'サンプル作品',
        circle_id: 'RG12345',
        maker_name: 'サンプルサークル',
        work_type_string: 'ボイス・ASMR',
        image_main: { url: '//img.dlsite.jp/work/main.jpg' },
      }]);
    }
    if (url.pathname.endsWith('/product/info/ajax')) {
      return Response.json({ RJ01234567: { price: '1,100', rate_average_2dp: 4.7, rate_count: 123 } });
    }
    if (url.pathname.includes('/circle/profile/')) return new Response(circleHtml, { headers: { 'content-type': 'text/html' } });
    return new Response(searchHtml, { headers: { 'content-type': 'text/html' } });
  };
}

describe('REST routes', () => {
  it('returns a normalized work and uses the public JSON endpoints', async () => {
    const requested: URL[] = [];
    const app = createApp({ fetcher: fixtureFetcher((url) => requested.push(url)), cache: new MemoryCache() });
    const response = await app.request('/v1/works/rj01234567');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('MISS');
    expect(await response.json()).toMatchObject({
      id: 'RJ01234567',
      title: 'サンプル作品',
      price: { amount: 1100, currency: 'JPY' },
      rating: { average: 4.7, count: 123 },
    });
    expect(requested.map((url) => url.pathname)).toContain('/maniax/api/=/product.json');
    expect(requested.map((url) => url.pathname)).toContain('/maniax/product/info/ajax');
  });

  it('normalizes invalid request errors and does not fetch invalid identifiers', async () => {
    let calls = 0;
    const app = createApp({ fetcher: fixtureFetcher(() => { calls += 1; }) });
    const response = await app.request('/v1/works/not-a-product-id');

    expect(response.status).toBe(400);
    expect(await response.json() as unknown).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'One or more request parameters are invalid.' },
    });
    expect(calls).toBe(0);
  });

  it('serves search and circle works in the public schemas', async () => {
    const app = createApp({ fetcher: fixtureFetcher(), cache: new MemoryCache() });
    const searchResponse = await app.request('/v1/search?keyword=ASMR&limit=10');
    const circleResponse = await app.request('/v1/circles/RG12345/works?limit=10');

    expect(searchResponse.status).toBe(200);
    expect((await searchResponse.json() as { works: unknown[] }).works).toHaveLength(2);
    expect(circleResponse.status).toBe(200);
    expect(await circleResponse.json()).toMatchObject({
      circle: { id: 'RG12345', name: 'サンプルサークル' },
      works: [{ id: 'RJ01234567', title: 'サンプル作品' }],
    });
  });

  it('serves rankings and returns a not-found error for empty work metadata', async () => {
    const app = createApp({ fetcher: fixtureFetcher(), cache: new MemoryCache() });
    const rankingResponse = await app.request('/v1/rankings?period=week&limit=10');
    expect(rankingResponse.status).toBe(200);
    const rankingBody = await rankingResponse.json() as {
      period: string;
      pagination: { page: number; limit: number; count: number; hasMore: boolean };
      works: { id: string; title: string }[];
    };
    expect(rankingBody.period).toBe('week');
    expect(rankingBody.pagination).toEqual({ page: 1, limit: 10, count: 2, hasMore: false });
    expect(rankingBody.works.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'RJ01234567', title: 'サンプル作品' },
      { id: 'RJ01234568', title: '別の作品' },
    ]);

    const missingFetcher: Fetcher = async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
      return url.pathname.endsWith('/api/=/product.json') ? Response.json([]) : Response.json({});
    };
    const missingApp = createApp({ fetcher: missingFetcher });
    const missingResponse = await missingApp.request('/v1/works/RJ123456');
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json() as unknown).toEqual({
      error: { code: 'WORK_NOT_FOUND', message: 'The requested work was not found.' },
    });
  });

  it('maps upstream 429 responses to the shared RATE_LIMITED error', async () => {
    const throttledFetcher: Fetcher = async () => new Response('slow down', { status: 429 });
    const app = createApp({ fetcher: throttledFetcher });
    const response = await app.request('/v1/search?keyword=ASMR');

    expect(response.status).toBe(429);
    expect(await response.json() as unknown).toEqual({
      error: { code: 'RATE_LIMITED', message: 'DLsite temporarily rate limited the request.' },
    });
  });

  it('caches successful GET responses using the injected Cache API-compatible store', async () => {
    let calls = 0;
    const cache = new MemoryCache();
    const app = createApp({ fetcher: fixtureFetcher(() => { calls += 1; }), cache });
    const first = await app.request('/v1/search?keyword=ASMR');
    expect(cache.size).toBe(1);
    const second = await app.request('/v1/search?keyword=ASMR');

    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(calls).toBe(1);
  });

  it('serves an OpenAPI 3.1 document and Scalar docs', async () => {
    const app = createApp({ fetcher: fixtureFetcher() });
    const documentResponse = await app.request('/openapi.json');
    const document = await documentResponse.json() as { openapi: string; paths: Record<string, unknown> };
    const docsResponse = await app.request('/docs');

    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/v1/works/{productId}']).toBeDefined();
    expect(document.paths['/v1/search']).toBeDefined();
    expect(document.paths['/v1/circles/{makerId}']).toBeDefined();
    expect(document.paths['/v1/circles/{makerId}/works']).toBeDefined();
    expect(document.paths['/v1/rankings']).toBeDefined();
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get('content-type')).toContain('text/html');
  });
});
