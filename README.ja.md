# DLsite Public Metadata API

[日本語](README.ja.md) | [English](README.md)

DLsite が一般公開しているページおよびエンドポイントからメタデータを取得し、独自の形式に正規化して返す非公式・読み取り専用 REST API です。ログイン、購入履歴、保護されたコンテンツやダウンロード可能なファイルにはアクセスしません。

## 必要環境

- Bun 1.4 以降
- デプロイ時は Cloudflare アカウント

## セットアップと開発

```sh
bun install
bun run dev
```

Wrangler が Worker をローカルで起動します。Scalar API リファレンスは `http://localhost:8787/docs`、OpenAPI 3.1 定義は `http://localhost:8787/openapi.json` で確認できます。

## テストと型チェック

```sh
bun test
bun run typecheck
```

ユニットテストは固定fixtureを使い、DLsiteへ接続しません。実際のDLsiteに接続するテストは別に実行します。

```sh
bun run test:integration
```

ライブテストは公開作品とサークルの情報を確認します。DLsite側からアクセスが許可されるネットワークが必要です。このプロジェクトの作成環境ではDLsiteから `Site Unavailable` が返されたため、ライブテストは検証できていません。ライブ接続の失敗は上流サービスの利用不可として報告し、ユニットテストの結果には影響しません。

## Cloudflareへデプロイ

Wranglerで認証してデプロイします。

```sh
bunx wrangler login
bunx wrangler deploy
```

Wranglerをグローバルにインストール済み、または `PATH` に設定済みなら `wrangler deploy` でデプロイできます。

`wrangler.jsonc` にWorkerのエントリーポイントを設定しています。KV、Durable Object、シークレット、ビルド手順は不要です。キャッシュAPIが利用できないローカル環境でも動作します。

### 上流への接続エラーを調べる

`Could not connect to DLsite.` は、HTTPレスポンスを受け取る前にWorkerの外向き `fetch()` が例外になった場合のメッセージです。DLsiteからHTTP 403や5xxが返った場合とは異なります。デプロイ後、次のコマンドでWorkerログを確認してください。

```sh
bunx wrangler tail dlsite-public-api
```

`DLsite upstream fetch failed` を探します。ログにはエラー名、URLを除去したメッセージ、所要時間、検索語やIDを伏せたパスが記録されます。`DLsite request timed out.` の場合は上流リクエストが12秒でタイムアウトしています。ログからタイムアウト、DNS、TLSなどの接続失敗を切り分けられます。

## APIエンドポイント

すべて読み取り専用の `GET` リクエストです。

| エンドポイント | 説明 | クエリパラメーター |
| --- | --- | --- |
| `/v1/works/{productId}` | 作品情報 | `site`（省略可） |
| `/v1/search` | 作品検索 | `keyword`（必須）、`site`、`sort`、`page`、`limit` |
| `/v1/circles/{makerId}` | サークル情報 | `site` |
| `/v1/circles/{makerId}/works` | サークル作品一覧 | `site`、`page`、`limit` |
| `/v1/rankings` | ランキング | `site`、`period`、`page`、`limit` |
| `/openapi.json` | OpenAPI 3.1 定義 | — |
| `/docs` | Scalar API リファレンス | — |

`site` は `home`、`maniax`、`books`、`pro`、`soft` を指定できます。商品IDから自動判定する場合、RJは `maniax`、VJは `pro`、BJは `books` が既定値です。別の売り場に掲載された作品では `site` を明示してください。

検索の `sort` は `trend`、`release_d`、`dl_d`、`price_d`、`price_a`、ランキングの `period` は `day`、`week`、`month`、`year`、`total` に対応します。`page` は1〜100、`limit` は1〜50です。

## 使用例

```sh
curl 'http://localhost:8787/v1/works/RJ01234567'
curl 'http://localhost:8787/v1/search?keyword=ASMR&sort=release_d&limit=10'
curl 'http://localhost:8787/v1/circles/RG01032287'
curl 'http://localhost:8787/v1/circles/RG01032287/works?page=1&limit=20'
curl 'http://localhost:8787/v1/rankings?period=week&limit=10'
curl 'http://localhost:8787/openapi.json'
```

作品情報はDLsite側のキーを公開せず、安定したスキーマで返します。

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

作品によって取得できないフィールドは `null` または空配列になります。検索、サークル作品一覧、ランキングでは簡易作品情報とページネーション情報を返します。

## データ取得元と正規化

上流との通信処理は `src/dlsite/`、公開APIの契約は `src/schemas/` と `src/routes/` に分離しています。

- 作品情報：`/{site}/api/=/product.json?workno={productId}&locale=ja_JP`
- 価格と評価：`/{site}/product/info/ajax?cdn_cache_min=1&product_id={productId}`
- 検索：公開ページ `/{site}/fsr/=/keyword/.../order[0]/.../per_page/.../page/.../from/fs.header`
- サークル：公開ページ `/{site}/circle/profile/=/maker_id/{makerId}.html`
- ランキング：公開ページ `/{site}/ranking/{period}/`

JSONのパスやフィールドは、これらのエンドポイントを呼び出す公開クライアントコードの例と照合しています。公開ページのパス形式はコミュニティの実装例も参考にしています。作成時の環境から実際のDLsiteへ接続できなかったため、HTMLセレクターとレスポンスの挙動は、DLsiteに接続できる環境で `bun run test:integration` を実行して確認してください。HTMLの抽出処理は `src/dlsite/parser.ts` にまとめ、構造変更の影響を局所化しています。

参考情報：

- [公開商品JSONと作品フィールド](https://greasyfork.org/en/scripts/433939-dlsite-product-information-injector/code)
- [商品JSONと商品情報エンドポイントの利用例](https://greasyfork.org/en/scripts/556637-dlsite%E8%B4%AD%E7%89%A9%E8%BD%A6%E5%A2%9E%E5%BC%BA/code)
- [サークル、作品、ランキングのパス例](https://github.com/RoxyCoding/DLsite-API)
- [DLsiteの公開サークルプロフィールURL形式](https://www.wikidata.org/wiki/Property:P14044)

## キャッシュ方針

成功した `/v1/*` のGETレスポンスをWorkers Cache API（`caches.default`）で5分間キャッシュします。キャッシュキーにはリクエストパスとクエリ文字列を含めるため、検索語、ページ、フィルターごとに別のキャッシュになります。エラーはキャッシュしません。短時間のエッジキャッシュにKVは使用しません。

Cache APIの内容はリクエストを処理するデータセンター内に保存されます。ローカルプレビューや一部のWorkerドメインでは利用できないことがあります。その場合はキャッシュミスとして処理し、DLsiteへリクエストします。

## エラー形式

エラーは統一した形式で返します。

```json
{
  "error": {
    "code": "DLSITE_UNAVAILABLE",
    "message": "DLsite is temporarily unavailable."
  }
}
```

状況に応じて `400 INVALID_REQUEST`、`404 WORK_NOT_FOUND`、`404 CIRCLE_NOT_FOUND`、`429 RATE_LIMITED`、`502 DLSITE_UPSTREAM_ERROR`、`503 DLSITE_UNAVAILABLE` を返します。

## DLsite側の変更に対応する

1. DLsiteにアクセスできるネットワークから、任意のライブテストを実行します。
2. 公開レスポンスまたはページを取得し、必要な範囲に絞ったfixtureを `tests/fixtures/` に追加します。
3. 対応する抽出・変換処理を `src/dlsite/` で更新します。
4. 意図的なAPIバージョン変更でない限り、公開Zodスキーマは維持します。
5. デプロイ前に `bun test` と `bun run typecheck` を実行します。

このプロジェクトは非公式のコミュニティ実装です。DLsiteとの提携や承認を受けたものではありません。DLsiteは予告なく公開ページやエンドポイントを変更したり、アクセスを制限したりする場合があります。
