# DLsite Public Metadata API

[日本語](README.ja.md) | [English](README.md)

An unofficial, read-only REST API that normalizes metadata from DLsite's publicly accessible pages and JSON endpoints. It does not log in, access purchase history, or retrieve protected/downloadable content.

## Requirements

- Bun 1.4 or later
- A Cloudflare account for deployment

## Setup and development

```sh
bun install
bun run dev
```

Wrangler serves the Worker locally. Open `http://localhost:8787/docs` for the Scalar API reference or `http://localhost:8787/openapi.json` for the OpenAPI 3.1 document.

## Tests and type checking

```sh
bun test
bun run typecheck
```

Unit tests use fixed fixtures and do not contact DLsite. Live upstream tests are separate:

```sh
bun run test:integration
```

The live tests check a known public work and circle. They require a network path that DLsite accepts. The build environment used to create this repository received a `Site Unavailable` response from DLsite, so the live suite could not be verified here. A failed live request is reported as an upstream availability error; it does not change unit test results.

## Deploy to Cloudflare

Authenticate with Wrangler, then deploy:

```sh
bunx wrangler login
bunx wrangler deploy
```

If Wrangler is installed globally or already on `PATH`, the deploy command is simply `wrangler deploy`.

The project has a `wrangler.jsonc` entry point and no required KV, Durable Object, secret, or build step. `wrangler deploy` bundles the TypeScript Worker. Cache API operations require a supported Worker domain; local development remains functional when the cache is unavailable.

### Troubleshooting upstream connectivity

`Could not connect to DLsite.` means the Worker's outbound `fetch()` threw before receiving an HTTP response; it is different from an upstream HTTP 403/5xx response. After deploying, inspect the Worker logs with:

```sh
bunx wrangler tail dlsite-public-api
```

Look for `DLsite upstream fetch failed`. The log records the error name, a sanitized message, elapsed time, and endpoint path with search terms and IDs redacted. `DLsite request timed out.` indicates the 12-second upstream timeout was reached. These details help distinguish a timeout from a DNS, TLS, or other connection failure.

## API endpoints

All routes are read-only `GET` requests.

| Endpoint | Description | Query parameters |
| --- | --- | --- |
| `/v1/works/{productId}` | Work details | `site` (optional) |
| `/v1/search` | Search works | `keyword` (required), `site`, `sort`, `page`, `limit` |
| `/v1/circles/{makerId}` | Circle profile | `site` |
| `/v1/circles/{makerId}/works` | Circle works | `site`, `page`, `limit` |
| `/v1/rankings` | Ranked works | `site`, `period`, `page`, `limit` |
| `/openapi.json` | OpenAPI 3.1 specification | — |
| `/docs` | Scalar API reference | — |

Supported `site` values: `home`, `maniax`, `books`, `pro`, `soft`. Product IDs default to `maniax` for RJ IDs, `pro` for VJ IDs, and `books` for BJ IDs. Set `site` explicitly if a product is listed in a different area.

Search sorting values are `trend`, `release_d`, `dl_d`, `price_d`, and `price_a`. Ranking periods are `day`, `week`, `month`, `year`, and `total`. `page` is 1–100; `limit` is 1–50.

## Examples

```sh
curl 'http://localhost:8787/v1/works/RJ01234567'
curl 'http://localhost:8787/v1/search?keyword=ASMR&sort=release_d&limit=10'
curl 'http://localhost:8787/v1/circles/RG01032287'
curl 'http://localhost:8787/v1/circles/RG01032287/works?page=1&limit=20'
curl 'http://localhost:8787/v1/rankings?period=week&limit=10'
curl 'http://localhost:8787/openapi.json'
```

Work responses use a stable schema rather than DLsite's source keys:

```json
{
  "id": "RJ01234567",
  "title": "…",
  "circle": { "id": "RG12345", "name": "…" },
  "price": { "amount": 1100, "currency": "JPY" },
  "rating": { "average": 4.7, "count": 123 },
  "releaseDate": "2026-01-01",
  "genres": [],
  "images": { "main": "https://img.dlsite.jp/…", "samples": [] },
  "workType": "…",
  "ageRating": "…",
  "description": "…",
  "url": "https://www.dlsite.com/maniax/work/=/product_id/RJ01234567.html"
}
```

Fields that are not available on a particular work are returned as `null` or an empty array. Search, circle-work, and ranking endpoints return compact work summaries and pagination metadata.

## Data sources and normalization

The upstream adapter is isolated under `src/dlsite/`; route contracts live under `src/schemas/` and `src/routes/`.

- Work metadata: `/{site}/api/=/product.json?workno={productId}&locale=ja_JP`
- Price and rating: `/{site}/product/info/ajax?cdn_cache_min=1&product_id={productId}`
- Search: public `/{site}/fsr/=/keyword/.../order[0]/.../per_page/.../page/.../from/fs.header` page
- Circle: public `/{site}/circle/profile/=/maker_id/{makerId}.html` page
- Ranking: public `/{site}/ranking/{period}/` page

The JSON paths and fields are cross-checked against public client-side code examples that call these endpoints. Public page path patterns are also documented in community integrations. The live website itself was unreachable from the build environment, so HTML selectors and response behavior should be checked with `bun run test:integration` when a DLsite-accessible network is available. The implementation deliberately keeps HTML extraction permissive and localized to `src/dlsite/parser.ts`.

Useful references:

- [Public product JSON and work fields](https://greasyfork.org/en/scripts/433939-dlsite-product-information-injector/code)
- [Current product JSON and product-info endpoint usage](https://greasyfork.org/en/scripts/556637-dlsite%E8%B4%AD%E7%89%A9%E8%BD%A6%E5%A2%9E%E5%BC%BA/code)
- [Circle, work, and ranking path examples](https://github.com/RoxyCoding/DLsite-API)
- [DLsite public circle profile URL pattern](https://www.wikidata.org/wiki/Property:P14044)

## Cache strategy

Successful `/v1/*` GET responses are cached with the Workers Cache API (`caches.default`) for five minutes. Cache keys include the request path and query string, so different search terms, pages, and filters do not share entries. Errors are not cached. No KV is needed for this short-lived, edge-local cache.

The Cache API is local to the data center serving a request and may be unavailable in local previews or on unsupported Worker domains. Cache failures are treated as misses, and requests continue to DLsite.

## Error format

Errors have one shape:

```json
{
  "error": {
    "code": "DLSITE_UNAVAILABLE",
    "message": "DLsite is temporarily unavailable."
  }
}
```

The API uses `400 INVALID_REQUEST`, `404 WORK_NOT_FOUND`, `404 CIRCLE_NOT_FOUND`, `429 RATE_LIMITED`, `502 DLSITE_UPSTREAM_ERROR`, and `503 DLSITE_UNAVAILABLE` as applicable.

## Handling DLsite changes

1. Run the optional live smoke tests from a network that can access DLsite.
2. Capture a fresh public response or page and add a minimized fixture under `tests/fixtures/`.
3. Update the relevant extractor or mapping under `src/dlsite/`.
4. Keep the public Zod schema stable unless there is a deliberate API version change.
5. Run `bun test` and `bun run typecheck` before deployment.

This is an unofficial community project. DLsite may change, rate-limit, or block public access to its pages and endpoints without notice. No affiliation with or endorsement by DLsite is implied.
