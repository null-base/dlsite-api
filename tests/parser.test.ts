import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';
import { parseCirclePage, parseWorkListing } from '../src/dlsite/parser';

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('HTML fallback parsers', () => {
  it('extracts and normalizes work cards without exposing DLsite markup', async () => {
    const html = await fixture('search.html');
    const result = parseWorkListing(html, 'https://www.dlsite.com/maniax/fsr/', 10);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'RJ01234567',
      title: 'サンプル作品',
      image: 'https://img.dlsite.jp/work/main.jpg',
      price: { amount: 1100, currency: 'JPY' },
      circle: { id: 'RG12345', name: 'サンプルサークル' },
    });
    expect(result.items[1]?.id).toBe('RJ01234568');
  });

  it('reads a circle name and public works from the profile page fixture', async () => {
    const html = await fixture('circle.html');
    const circle = parseCirclePage(
      html,
      'RG12345',
      'maniax',
      'https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG12345.html',
    );
    const works = parseWorkListing(html, 'https://www.dlsite.com/maniax/circle/profile/', 10);

    expect(circle).toMatchObject({ id: 'RG12345', name: 'サンプルサークル' });
    expect(circle?.description).toBe('サークルの公開プロフィールです。');
    expect(works.items[0]?.id).toBe('RJ01234567');
  });

  it('rejects an upstream availability interstitial instead of returning an empty list', () => {
    expect(() => parseWorkListing('<html><head><title>Site Unavailable</title></head></html>', 'https://www.dlsite.com', 20))
      .toThrow('DLsite returned an access or availability page.');
  });
});
