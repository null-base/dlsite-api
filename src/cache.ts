import type { MiddlewareHandler } from 'hono';

export interface ResponseCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function defaultResponseCache(): ResponseCache | undefined {
  const runtimeCaches = (globalThis as typeof globalThis & { caches?: { default?: ResponseCache } }).caches;
  return runtimeCaches?.default;
}

export function cacheApiResponses(cache: ResponseCache | undefined = defaultResponseCache(), ttlSeconds = 300): MiddlewareHandler {
  return async (c, next) => {
    if (!cache || c.req.method !== 'GET') {
      await next();
      return;
    }

    const key = new Request(c.req.url, { method: 'GET' });
    try {
      const cached = await cache.match(key);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('x-cache', 'HIT');
        return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
      }
    } catch {
      // Cache API failures should not take the read-only API offline.
    }

    await next();
    const response = c.res;
    if (response.status !== 200) {
      c.header('x-cache', 'BYPASS');
      return;
    }

    const headers = new Headers(response.headers);
    headers.set('cache-control', `public, max-age=${ttlSeconds}`);
    headers.set('x-cache', 'MISS');
    const body = await response.clone().arrayBuffer();
    const cacheable = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    c.res = cacheable.clone();
    try {
      await cache.put(key, cacheable.clone());
    } catch {
      // Caches may be unavailable in Wrangler local mode or on unsupported domains.
    }
  };
}

export function withCache(cache: ResponseCache | undefined, ttlSeconds?: number) {
  return cacheApiResponses(cache, ttlSeconds);
}
