import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filterMarketingOptedInUserIds, getUserProfile } from '../src/services/firestore';

describe('marketing opt-in default (PDPA opt-out-by-default posture)', () => {
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;

  beforeEach(() => {
    // No Firestore configured — matches CI/local dev. getUserProfile falls
    // back to its in-memory default, which must never silently read as
    // "opted in" just because the data store is unreachable.
    delete process.env.GOOGLE_CLOUD_PROJECT;
  });

  afterEach(() => {
    if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalProject;
  });

  it('a brand-new profile defaults to marketingOptIn: false', async () => {
    const profile = await getUserProfile(`test-user-${Date.now()}`);
    expect(profile.marketingOptIn).toBe(false);
  });

  it('filters out every candidate when nothing has opted in', async () => {
    const candidates = [`u1-${Date.now()}`, `u2-${Date.now()}`, `u3-${Date.now()}`];
    const optedIn = await filterMarketingOptedInUserIds(candidates);
    expect(optedIn).toEqual([]);
  });
});
