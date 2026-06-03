import {
  parseAnthropicAnalysis,
  parseOpenAiAnalysis,
  parseAnthropicCategorize,
  parseOpenAiCategorize,
} from './parse-analysis';

// A schema-valid ArticleAnalysisResult payload. entities/categoryNames/
// axisAssignments have Zod defaults, so a summary + importance is the minimum.
const VALID = {
  summary: 'A concise valid summary of the article body.',
  importance: 'normal',
  entities: [{ canonicalName: 'Acme', type: 'company', aliases: [] }],
  categoryNames: ['Tech'],
  axisAssignments: [],
};

describe('parseAnthropicAnalysis', () => {
  it('returns the validated result from the tool_use block', () => {
    const out = parseAnthropicAnalysis([
      { type: 'text' },
      { type: 'tool_use', input: VALID },
    ]);
    expect(out.summary).toBe(VALID.summary);
    expect(out.importance).toBe('normal');
    expect(out.entities[0].canonicalName).toBe('Acme');
  });

  it('throws when no tool_use block is present', () => {
    expect(() => parseAnthropicAnalysis([{ type: 'text' }])).toThrow(
      /missing tool_use block/,
    );
  });

  it('throws when the tool_use input fails schema validation', () => {
    expect(() =>
      parseAnthropicAnalysis([
        { type: 'tool_use', input: { importance: 'banana' } },
      ]),
    ).toThrow(/failed Zod validation/);
  });
});

describe('parseOpenAiAnalysis', () => {
  it('parses + validates the JSON content', () => {
    const out = parseOpenAiAnalysis(JSON.stringify(VALID));
    expect(out.summary).toBe(VALID.summary);
    expect(out.categoryNames).toEqual(['Tech']);
  });

  it('throws on empty/null content', () => {
    expect(() => parseOpenAiAnalysis(null)).toThrow(/no content/);
    expect(() => parseOpenAiAnalysis('')).toThrow(/no content/);
  });

  it('throws on non-JSON content', () => {
    expect(() => parseOpenAiAnalysis('not json {')).toThrow(/not valid JSON/);
  });

  it('throws when the JSON fails schema validation', () => {
    expect(() => parseOpenAiAnalysis(JSON.stringify({ summary: 42 }))).toThrow(
      /failed Zod validation/,
    );
  });
});

describe('entity-type unknown fallback', () => {
  // The exact failure mode observed live: the model emits an entity type outside
  // the offered enum (e.g. "organization" for NATO). Pre-fix this rejected the
  // WHOLE analysis; now the one entity is coerced to 'unknown' and the rest
  // survives.
  const withStrayType = {
    summary: 'NATO secretary general visited the capital today.',
    importance: 'normal',
    entities: [
      { canonicalName: 'NATO', type: 'organization', aliases: [] },
      { canonicalName: 'Jens Stoltenberg', type: 'person', aliases: [] },
    ],
    categoryNames: [],
    axisAssignments: [],
  };

  it('coerces an out-of-enum entity type to "unknown" (anthropic) without rejecting the analysis', () => {
    const out = parseAnthropicAnalysis([
      { type: 'tool_use', input: structuredClone(withStrayType) },
    ]);
    expect(out.entities[0].type).toBe('unknown'); // organization -> unknown
    expect(out.entities[1].type).toBe('person'); // valid type untouched
    expect(out.summary).toBe(withStrayType.summary); // rest of analysis preserved
  });

  it('coerces an out-of-enum entity type to "unknown" (openai)', () => {
    const out = parseOpenAiAnalysis(JSON.stringify(withStrayType));
    expect(out.entities[0].type).toBe('unknown');
    expect(out.entities[1].type).toBe('person');
  });

  it('leaves all-valid entity types unchanged', () => {
    const out = parseOpenAiAnalysis(JSON.stringify(VALID));
    expect(out.entities[0].type).toBe('company');
  });
});

describe('parseAnthropicCategorize', () => {
  it('extracts categories + axes from a tool_use block', () => {
    const out = parseAnthropicCategorize([
      {
        type: 'tool_use',
        input: { categoryNames: ['Tech'], axisAssignments: [] },
      },
    ]);
    expect(out.categoryNames).toEqual(['Tech']);
    expect(out.axisAssignments).toEqual([]);
  });

  it('throws when the tool_use block is missing', () => {
    expect(() => parseAnthropicCategorize([{ type: 'text' }])).toThrow();
  });

  it('throws on an invalid shape', () => {
    expect(() =>
      parseAnthropicCategorize([
        { type: 'tool_use', input: { categoryNames: 'nope' } },
      ]),
    ).toThrow();
  });
});

describe('parseOpenAiCategorize', () => {
  it('parses a JSON string payload', () => {
    const out = parseOpenAiCategorize(
      JSON.stringify({
        categoryNames: [],
        axisAssignments: [{ axisName: 'Tone', value: 'neutral' }],
      }),
    );
    expect(out.axisAssignments[0]).toEqual({
      axisName: 'Tone',
      value: 'neutral',
    });
  });

  it('throws on empty content', () => {
    expect(() => parseOpenAiCategorize(null)).toThrow();
  });

  it('throws on non-JSON', () => {
    expect(() => parseOpenAiCategorize('not json')).toThrow();
  });
});
