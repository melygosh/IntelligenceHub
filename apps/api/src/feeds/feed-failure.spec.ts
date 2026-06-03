import { nextFeedFailureState } from './feed-failure';

describe('nextFeedFailureState', () => {
  const THRESHOLD = 10;

  it('increments from a null/undefined counter (first-ever failure)', () => {
    expect(nextFeedFailureState(null, THRESHOLD)).toEqual({
      consecutiveFailures: 1,
      disabled: false,
    });
    expect(nextFeedFailureState(undefined, THRESHOLD)).toEqual({
      consecutiveFailures: 1,
      disabled: false,
    });
  });

  it('stays enabled below the threshold', () => {
    expect(nextFeedFailureState(8, THRESHOLD)).toEqual({
      consecutiveFailures: 9,
      disabled: false,
    });
  });

  it('disables exactly at the threshold (boundary)', () => {
    // prev=9 → 10 === threshold → disabled. prev=8 → 9 → still enabled.
    expect(nextFeedFailureState(9, THRESHOLD)).toEqual({
      consecutiveFailures: 10,
      disabled: true,
    });
  });

  it('stays disabled past the threshold', () => {
    expect(nextFeedFailureState(15, THRESHOLD)).toEqual({
      consecutiveFailures: 16,
      disabled: true,
    });
  });

  it('honors a threshold of 1 (disable on first failure)', () => {
    expect(nextFeedFailureState(0, 1)).toEqual({
      consecutiveFailures: 1,
      disabled: true,
    });
  });
});
