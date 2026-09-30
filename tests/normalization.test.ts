import { describe, expect, it } from 'bun:test';
import { WorkSchema } from '../src/schemas/work';
import { normalizeWork } from '../src/dlsite/works';

describe('DLsite work normalization', () => {
  it('maps the public product JSON and info JSON into the stable work schema', () => {
    const work = normalizeWork(
      [{
        workno: 'RJ01234567',
        work_name: 'サンプル作品',
        work_name_masked: 'サンプル作品',
        circle_id: 'RG12345',
        maker_name: 'サンプルサークル',
        work_type: 'SOU',
        work_type_string: 'ボイス・ASMR',
        age_category_string: 'general',
        regist_date: '2026-09-01 00:00:00',
        genres_replaced: [{ id: 497, name: 'ASMR' }, { id: 496, name: 'バイノーラル' }],
        image_main: { url: '//img.dlsite.jp/work/main.jpg', width: '560', height: '420' },
        image_samples: [{ url: '//img.dlsite.jp/work/sample-1.jpg' }],
        intro_s: '<p>作品の紹介です。</p>',
      }],
      {
        RJ01234567: {
          price: '1,100',
          rate_average_2dp: 4.7,
          rate_count: 123,
          regist_date: '2026-09-01 00:00:00',
        },
      },
      'RJ01234567',
      'maniax',
    );

    expect(work).toEqual({
      id: 'RJ01234567',
      title: 'サンプル作品',
      circle: { id: 'RG12345', name: 'サンプルサークル' },
      price: { amount: 1100, currency: 'JPY' },
      rating: { average: 4.7, count: 123 },
      releaseDate: '2026-09-01',
      genres: ['ASMR', 'バイノーラル'],
      images: {
        main: 'https://img.dlsite.jp/work/main.jpg',
        samples: ['https://img.dlsite.jp/work/sample-1.jpg'],
      },
      workType: 'ボイス・ASMR',
      ageRating: 'general',
      description: '作品の紹介です。',
      url: 'https://www.dlsite.com/maniax/work/=/product_id/RJ01234567.html',
    });
    expect(WorkSchema.safeParse(work).success).toBe(true);
  });

  it('keeps unavailable public fields nullable and normalizes a single keyed record', () => {
    const work = normalizeWork(
      { RJ000001: { work_name: '最低限', image_main: { url: '//img.dlsite.jp/a.jpg' } } },
      {},
      'RJ000001',
      'maniax',
    );
    expect(work.price.amount).toBeNull();
    expect(work.rating.average).toBeNull();
    expect(work.circle).toBeNull();
    expect(work.images.main).toBe('https://img.dlsite.jp/a.jpg');
  });
});
