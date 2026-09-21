import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const authz = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === 'authz.resource-level');
};

/**
 * Spring says all of this with names it owns, and none of them were here.
 *
 * mall is a Spring Boot shop with a full authorization model — a filter chain built
 * with `authorizeHttpRequests`, a `DynamicAuthorizationManager` comparing the caller's
 * `GrantedAuthority` against the one a path requires, and a `UmsAdminRoleRelationDao`
 * that loads an administrator's roles from the database — and it was told at `medium`
 * that it has no role checks and no permission checks at all.
 *
 * Every word that matters there is Spring Security's or the JSR's: `GrantedAuthority`,
 * `@PreAuthorize`, `@Secured`, `@RolesAllowed`, `hasAuthority`, `authorizeHttpRequests`
 * and the `antMatchers` it replaced. What mall chose was `Ums`, the prefix on its own
 * classes, and that is exactly what a search must not depend on.
 *
 * mall goes from 61 and `early` to 66 and `partial`.
 */
describe('Spring says it in its own words', () => {
  it('reads an authority check as an authorization model', async () => {
    const found = await authz('spring-authorizes-by-authority');

    expect(found?.status).toBe('partial');
  });

  /**
   * And cites the line that decides. `import
   * org.springframework.security.core.GrantedAuthority;` names the type and decides
   * nothing — the first version of this rule cited exactly that, which is the
   * complaint pocketbase earned two releases ago. Filtered inside the search rather
   * than after it: a Java project has one import per file and they would spend the
   * whole budget.
   */
  it('does not cite the import that names the type', async () => {
    const found = await authz('spring-authorizes-by-authority');

    expect(found?.evidence.some((e) => String(e.value).startsWith('import '))).toBe(false);
    expect(found?.evidence.some((e) => String(e.value).includes('getAuthorities()'))).toBe(true);
  });
});
