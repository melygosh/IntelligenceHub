import { decideDedupAction, type ExistingSibling } from './dedup-decision';

const FEED_A = '11111111-1111-1111-1111-111111111111';
const FEED_B = '22222222-2222-2222-2222-222222222222';
const ORIGINAL_ID = '33333333-3333-3333-3333-333333333333';

const sibling = (overrides: Partial<ExistingSibling>): ExistingSibling => ({
  id: ORIGINAL_ID,
  status: 'ready',
  feedId: FEED_A,
  ...overrides,
});

describe('decideDedupAction (FR-5)', () => {
  it('no sibling → process the article through pre-filter + analyze', () => {
    expect(decideDedupAction(undefined, FEED_A)).toEqual({ kind: 'process' });
  });

  it('ready sibling from a different feed → insert a duplicate row anchored to the original', () => {
    const decision = decideDedupAction(
      sibling({ status: 'ready', feedId: FEED_A }),
      FEED_B,
    );
    expect(decision).toEqual({
      kind: 'insert-duplicate-row',
      originalId: ORIGINAL_ID,
    });
  });

  it('ready sibling from the SAME feed → mark duplicate but do not insert (same-feed re-pull)', () => {
    expect(
      decideDedupAction(sibling({ status: 'ready', feedId: FEED_A }), FEED_A),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('pending sibling → mark duplicate (analyze queue owns retry, no new row)', () => {
    expect(
      decideDedupAction(sibling({ status: 'pending', feedId: FEED_B }), FEED_A),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('failed sibling → mark duplicate (analyze queue owns retry, no new row)', () => {
    expect(
      decideDedupAction(sibling({ status: 'failed', feedId: FEED_B }), FEED_A),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('sibling with detached feed (feedId=null after US-3 delete) is still treated as different-feed', () => {
    expect(
      decideDedupAction(sibling({ status: 'ready', feedId: null }), FEED_A),
    ).toEqual({ kind: 'insert-duplicate-row', originalId: ORIGINAL_ID });
  });
});
