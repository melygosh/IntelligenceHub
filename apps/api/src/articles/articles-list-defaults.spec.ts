import { resolveStatuses } from './articles.service';

describe('resolveStatuses (US-7 processing-state default)', () => {
  it('defaults to ready when caller passes nothing', () => {
    expect(resolveStatuses(undefined)).toEqual(['ready']);
  });

  it('defaults to ready when caller passes empty list', () => {
    expect(resolveStatuses([])).toEqual(['ready']);
  });

  it('honors a specific status request', () => {
    expect(resolveStatuses(['failed'])).toEqual(['failed']);
  });

  it('honors a multi-status request and preserves order', () => {
    expect(resolveStatuses(['pending', 'ready'])).toEqual(['pending', 'ready']);
  });

  it('returns a fresh array — caller cannot mutate the default', () => {
    const out = resolveStatuses(undefined);
    out.push('failed');
    expect(resolveStatuses(undefined)).toEqual(['ready']);
  });
});
