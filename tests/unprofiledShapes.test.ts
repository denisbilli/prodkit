import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';
import { scoreProfiles } from '../src/expectations/profileSignals';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

describe('a backend somebody else runs is still a backend', () => {
  it('reads a consumer application on Supabase as one', async () => {
    // Two consumer applications in the verification corpus — accounts, a Postgres
    // database, user data — received no profile at all because their server is
    // Supabase's rather than their own. Nothing about what the product is depends on
    // where the server is hosted; once judged, they raised nineteen findings between
    // them that nothing had been looking for.
    const analysis = await analyzeProject(fixture('vite-supabase-app'));

    expect(analysis.stack.backend).toEqual([]);
    expect(inferProductProfile(analysis).inferredProfile).toBe('b2c-app');
  });
});

describe('an application with nothing to sign in to', () => {
  it('is a client application, not an unidentifiable repository', async () => {
    // A server, a user interface, and no accounts is exactly what this profile
    // describes — and until now the only thing that identified one was logic held in
    // the browser, so six repositories with backends and front ends scored two against
    // a floor of three.
    const analysis = await analyzeProject(fixture('flask-tool'));
    const inferred = inferProductProfile(analysis);

    expect(inferred.inferredProfile).toBe('client-app');
    expect(inferred.confidence).toBe('high');
  });

  it('does not take a project from the profiles that need accounts or money', async () => {
    const base = {
      backend: true, managedBackend: false, frontend: true, database: true, auth: false,
      billing: false, tenancy: false, adminSurface: false, marketplaceVocabulary: false,
      callsAModel: false, jobs: false, uploads: false, clientLogic: false,
      passwordReset: false, emailVerification: false, socialLogin: false, realtime: false,
      apiSurface: false, containerised: false, gameEngine: false, gameSignals: 0,
      publishable: false, entrypoints: false, packagedLicense: false, tests: false,
      mobilePlatforms: [] as string[], sourceFiles: 60,
    };

    expect(scoreProfiles({ ...base, auth: true })[0].profile).toBe('b2c-app');
    expect(scoreProfiles({ ...base, billing: true, tenancy: true })[0].profile).toBe('b2b-saas');
    expect(scoreProfiles({ ...base, callsAModel: true })[0].profile).toBe('ai-saas');
  });

  it('does not let a second reading of one identity halve the confidence of the first', async () => {
    // The two readings — logic held in the browser, or a server with no sign-in — are
    // alternative descriptions of one thing, not evidence that accumulates. Saturation
    // divides what a profile earned by what it could earn, so expressing them as two
    // signals quietly dropped every matching browser application to medium confidence.
    const analysis = await analyzeProject(fixture('browser-app'));
    const inferred = inferProductProfile(analysis);

    expect(inferred.inferredProfile).toBe('client-app');
    expect(inferred.confidence).toBe('high');
  });
});
