/**
 * Decide a feed's next state after a failed pull. Extracted as a pure function
 * so the give-up boundary is regression-tested without the DB/fetch machinery.
 *
 * A feed is auto-disabled (quarantined out of the sweep) once its CONSECUTIVE
 * failure count reaches `giveUpAfter`. The counter is reset to 0 elsewhere on
 * any success or manual re-activate, so only an unbroken run of failures trips
 * the threshold.
 */
export function nextFeedFailureState(
  prevFailures: number | null | undefined,
  giveUpAfter: number,
): { consecutiveFailures: number; disabled: boolean } {
  const consecutiveFailures = (prevFailures ?? 0) + 1;
  return { consecutiveFailures, disabled: consecutiveFailures >= giveUpAfter };
}
