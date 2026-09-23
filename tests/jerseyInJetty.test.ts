import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * JAX-RS without a platform around it.
 *
 * `traccar/traccar` serves its API through Jersey in an embedded Jetty and hashes passwords
 * with `SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`. With no Spring anywhere it
 * came out with no backend and nobody to sign in, and no profile was inferred for a server
 * with users, devices and permissions. The Maven coordinates are the ecosystem's and the
 * algorithm name is the JCA registry's.
 */
describe('Jersey in Jetty', () => {
  it('finds the backend from its coordinates', async () => {
    const analysis = await analyzeProject(fixture('jersey-in-jetty'));

    expect(analysis.stack.backend).toEqual(expect.arrayContaining(['jersey', 'jetty']));
  });

  it('reads JCA\'s PBKDF2 as somebody to sign in', async () => {
    const analysis = await analyzeProject(fixture('jersey-in-jetty'));

    expect(analysis.detectors['auth.core']?.present).toBe(true);
  });

  /**
   * JAX-RS names a resource without the slash: `@Path("session")` is where traccar signs
   * people in, and with no `/login` anywhere its English routes read as unreadable.
   */
  it('reads a JAX-RS sign-in resource as a route in English', async () => {
    const analysis = await analyzeProject(fixture('jersey-in-jetty'));

    expect(analysis.detectors['auth.routesAreReadable']?.present).toBe(true);
  });

  /** And Jakarta Mail, declared in build.gradle, is a way to reach a user. */
  it('reads Jakarta Mail from the build file', async () => {
    const analysis = await analyzeProject(fixture('jersey-in-jetty'));

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
