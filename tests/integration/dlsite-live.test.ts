import { describe, expect, it } from 'bun:test';
import { DlsiteClient } from '../../src/dlsite/client';

const enabled = process.env.DLSITE_LIVE_TESTS === '1';

describe.skipIf(!enabled)('DLsite live smoke tests', () => {
  const client = new DlsiteClient();

  it('loads a known public work through the JSON endpoints', async () => {
    const work = await client.getWork('RJ01671823');
    expect(work.id).toBe('RJ01671823');
    expect(work.title.length).toBeGreaterThan(0);
  });

  it('loads a public circle profile page', async () => {
    const circle = await client.getCircle('RG38262', 'maniax');
    expect(circle.id).toBe('RG38262');
    expect(circle.name.length).toBeGreaterThan(0);
  });
});
