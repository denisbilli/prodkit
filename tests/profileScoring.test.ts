import { describe, expect, it } from 'vitest';
import { scoreProfiles, type ProfileFacts } from '../src/expectations/profileSignals';

const nothing: ProfileFacts = {
  backend: false,
  frontend: false,
  database: false,
  auth: false,
  billing: false,
  tenancy: false,
  adminSurface: false,
  marketplaceVocabulary: false,
  callsAModel: false,
  jobs: false,
  uploads: false,
  clientLogic: false,
  gameEngine: false,
  gameSignals: 0,
  sourceFiles: 0,
};

const facts = (over: Partial<ProfileFacts>): ProfileFacts => ({ ...nothing, ...over });

describe('profile scoring', () => {
  it('prefers a specialisation that earned its place', () => {
    // An AI SaaS is a B2B SaaS that calls models. Scored flat, the general profile wins
    // whenever it shares the specific one's evidence and adds any of its own — which is
    // exactly how a transcription SaaS came out as b2b-saas.
    const ranked = scoreProfiles(facts({ backend: true, auth: true, billing: true, tenancy: true, callsAModel: true, jobs: true }));

    expect(ranked[0]?.profile).toBe('ai-saas');
    // And the general reading stays available as the second opinion.
    expect(ranked.map((r) => r.profile)).toContain('b2b-saas');
  });

  it('does not let a specialisation inherit a claim it did not earn', () => {
    // One weak game signal is not a game, however little else is present.
    const ranked = scoreProfiles(facts({ frontend: true, clientLogic: true, sourceFiles: 40, gameSignals: 1 }));

    expect(ranked[0]?.profile).not.toBe('game');
  });

  it('treats an absence as evidence against, never as evidence for', () => {
    // "No billing, no tenants, no accounts" was worth three points towards a client
    // application, which is also an exact description of an empty repository.
    const ranked = scoreProfiles(nothing);

    expect(ranked.every((entry) => entry.score < 3)).toBe(true);
  });

  it('does not reward a narrow profile for filling its short list', () => {
    // b2c-app has fewer signals than b2b-saas. Normalised, accounts plus a front end
    // maxed it out and beat a b2b-saas holding four signals of seven.
    const ranked = scoreProfiles(facts({ backend: true, frontend: true, auth: true, tenancy: true, billing: true, adminSurface: true }));

    expect(ranked[0]?.profile).toBe('b2b-saas');
  });

  it('ranks every admissible profile rather than stopping at the first match', () => {
    // The property the cascade could not have: adding a profile cannot silence another,
    // and an unreachable rule cannot exist.
    const ranked = scoreProfiles(facts({ backend: true, frontend: true, auth: true }));

    expect(ranked.length).toBeGreaterThan(1);
    expect(ranked).toEqual([...ranked].sort((a, b) => b.score - a.score || 0));
  });
});
