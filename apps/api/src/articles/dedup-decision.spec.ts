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
    expect(decideDedupAction([], FEED_A)).toEqual({ kind: 'process' });
  });

  it('ready sibling from a different feed → insert a duplicate row anchored to the original', () => {
    const decision = decideDedupAction(
      [sibling({ status: 'ready', feedId: FEED_A })],
      FEED_B,
    );
    expect(decision).toEqual({
      kind: 'insert-duplicate-row',
      originalId: ORIGINAL_ID,
    });
  });

  it('ready sibling from the SAME feed → mark duplicate but do not insert (same-feed re-pull)', () => {
    expect(
      decideDedupAction([sibling({ status: 'ready', feedId: FEED_A })], FEED_A),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('pending sibling → mark duplicate (analyze queue owns retry, no new row)', () => {
    expect(
      decideDedupAction(
        [sibling({ status: 'pending', feedId: FEED_B })],
        FEED_A,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('failed sibling → mark duplicate (analyze queue owns retry, no new row)', () => {
    expect(
      decideDedupAction(
        [sibling({ status: 'failed', feedId: FEED_B })],
        FEED_A,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('sibling with detached feed (feedId=null after US-3 delete) is still treated as different-feed', () => {
    expect(
      decideDedupAction([sibling({ status: 'ready', feedId: null })], FEED_A),
    ).toEqual({ kind: 'insert-duplicate-row', originalId: ORIGINAL_ID });
  });

  // Regression: a feed re-pulling an item it already anchored must NOT insert a
  // second duplicate row. Previously the lookup ignored 'duplicate'/'filtered'
  // siblings, so every sweep re-found the cross-feed ready original and
  // appended another duplicate row, inflating similarCount unboundedly.
  it('same-feed duplicate row already exists → mark duplicate, no second insert (re-pull)', () => {
    expect(
      decideDedupAction(
        [sibling({ id: 'dup', status: 'duplicate', feedId: FEED_B })],
        FEED_B,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('the exact growth scenario: cross-feed ready original + own duplicate row → mark duplicate (same-feed wins)', () => {
    expect(
      decideDedupAction(
        [
          sibling({ id: ORIGINAL_ID, status: 'ready', feedId: FEED_A }),
          sibling({ id: 'dup', status: 'duplicate', feedId: FEED_B }),
        ],
        FEED_B,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('same-feed filtered row already exists → mark duplicate, no re-filter/re-insert', () => {
    expect(
      decideDedupAction(
        [sibling({ id: 'flt', status: 'filtered', feedId: FEED_A })],
        FEED_A,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });

  it('cross-feed duplicate/filtered only (no ready original) → mark duplicate, no new anchor', () => {
    expect(
      decideDedupAction(
        [sibling({ id: 'flt', status: 'filtered', feedId: FEED_A })],
        FEED_B,
      ),
    ).toEqual({ kind: 'mark-duplicate' });
  });
});
