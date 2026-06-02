import { loadEnv } from '../common/config/env';

export type PreFilterReason = 'too_short' | 'empty' | 'spam';

export type PreFilterResult =
  | { filtered: false }
  | { filtered: true; reason: PreFilterReason; detail: string };

export type PreFilterInput = {
  title: string;
  body: string;
};

/**
 * Configuration for the pre-filter. Each check can be switched off, and the
 * spam thresholds (as a fraction of body length, 0..1) are tunable. Sourced
 * from env (see prefilterConfigFromEnv) but injectable for tests.
 */
export type PreFilterConfig = {
  minLength: number;
  titleRatio: number;
  linkDensityRatio: number;
  checks: {
    empty: boolean;
    minLength: boolean;
    spamTitleRatio: boolean;
    spamLinkDensity: boolean;
  };
};

/** Build the pre-filter config from validated env vars. */
export function prefilterConfigFromEnv(): PreFilterConfig {
  const env = loadEnv();
  return {
    minLength: env.PREFILTER_MIN_LENGTH,
    titleRatio: env.PREFILTER_TITLE_RATIO,
    linkDensityRatio: env.PREFILTER_LINK_DENSITY_RATIO,
    checks: {
      empty: env.PREFILTER_EMPTY_ENABLED,
      minLength: env.PREFILTER_MIN_LENGTH_ENABLED,
      spamTitleRatio: env.PREFILTER_SPAM_TITLE_RATIO_ENABLED,
      spamLinkDensity: env.PREFILTER_SPAM_LINK_DENSITY_ENABLED,
    },
  };
}

/**
 * Deterministic, configurable rejection layer that runs BEFORE any LLM call
 * (Phase 2 Day 5). Drops obviously-garbage articles cheaply so we don't burn
 * tokens on them. Returns a human `detail` so the pull log can explain each drop.
 */
export function runPreFilter(
  input: PreFilterInput,
  config: PreFilterConfig = prefilterConfigFromEnv(),
): PreFilterResult {
  const title = input.title.trim();
  const body = input.body.trim();
  const { checks } = config;

  // Empty covers "no extractable text" (FR-4): a body can be non-empty raw HTML
  // yet carry no readable words (markup/whitespace only). We strip to visible
  // text for the emptiness test so those are caught. The length floor below
  // stays on the RAW body on purpose — many legitimate feeds (WIRED, BBC,
  // DeepMind, HN) publish short ~150-char excerpts that clear 200 raw chars but
  // not 200 stripped; measuring the floor on stripped text would wrongly drop
  // them. So: strip for "is there any text at all", raw length for "is it long
  // enough".
  const hasText = extractableText(body).length > 0;
  if (checks.empty && (title.length === 0 || !hasText)) {
    const which =
      title.length === 0 && !hasText
        ? 'title and body are both empty'
        : title.length === 0
          ? 'title is empty'
          : body.length === 0
            ? 'body is empty'
            : 'body has no extractable text (markup only)';
    return { filtered: true, reason: 'empty', detail: which };
  }

  if (checks.minLength && body.length < config.minLength) {
    return {
      filtered: true,
      reason: 'too_short',
      detail: `body is ${body.length} chars, below the ${config.minLength}-char minimum`,
    };
  }

  // Spam heuristic 1: title is more than `titleRatio` of the body (SEO stub).
  if (checks.spamTitleRatio && title.length > body.length * config.titleRatio) {
    return {
      filtered: true,
      reason: 'spam',
      detail: `title (${title.length} chars) is over ${pct(config.titleRatio)} of the body (${body.length} chars) — likely an SEO/placeholder stub`,
    };
  }

  // Spam heuristic 2: link density — anchor inner-text > `linkDensityRatio` of body.
  if (checks.spamLinkDensity) {
    const linkTextChars = sumLinkTextChars(body);
    if (linkTextChars > body.length * config.linkDensityRatio) {
      return {
        filtered: true,
        reason: 'spam',
        detail: `link text (${linkTextChars} chars) is over ${pct(config.linkDensityRatio)} of the body (${body.length} chars) — likely a link farm`,
      };
    }
  }

  return { filtered: false };
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Visible text remaining after stripping HTML tags and the common blank entity,
 * with whitespace collapsed. Deterministic (regex only, no parser) — enough to
 * tell whether a body carries real words or is markup/whitespace padding.
 */
function extractableText(body: string): string {
  return body
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sumLinkTextChars(body: string): number {
  let total = 0;
  // `.*?` + the `s` flag captures the full anchor body (including any nested
  // tags / newlines); strip inner tags so e.g. `<a><b>Click</b></a>` counts
  // "Click" rather than zero — otherwise styled-anchor link farms evade the
  // link-density check.
  for (const m of body.matchAll(/<a\b[^>]*>(.*?)<\/a>/gis)) {
    const innerText = (m[1] ?? '').replace(/<[^>]*>/g, '');
    total += innerText.length;
  }
  return total;
}
