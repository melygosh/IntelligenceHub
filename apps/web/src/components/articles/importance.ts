/** Shared importance palette — soft background, foreground, and dot colour per
 * level. Single source for the feed's badge/dot and the article-list card so
 * the three importance shades stay in sync. */
export const IMP_STYLE: Record<
  'high' | 'normal' | 'junk',
  { bg: string; fg: string; dot: string }
> = {
  high: { bg: '#dde5d2', fg: '#2f4a26', dot: '#4d6b3e' },
  normal: { bg: '#ece6d8', fg: '#3d3a32', dot: '#6b6557' },
  junk: { bg: '#ece6d8', fg: '#857f74', dot: '#9b9486' },
};
