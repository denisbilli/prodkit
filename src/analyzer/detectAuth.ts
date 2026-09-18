import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';

function depEvidence(deps: string[]): DetectorEvidence[] {
  return deps.map((d) => ({ type: 'dependency', value: d }));
}

function snippetEvidence(matches: Array<{ snippet: string; file: string; line: number }>): DetectorEvidence[] {
  return matches.map((m) => ({ type: 'snippet', value: m.snippet, file: m.file, line: m.line }));
}

export async function detectAuth(ctx: DetectContext): Promise<DetectorResult[]> {
  const sourceFiles = ctx.files.source;
  // Hand-rolled Express auth is only one shape. Most repositories written in the last
  // few years — and nearly everything produced by AI app builders — reach for a managed
  // auth library instead, and looking only for jsonwebtoken/bcrypt reported those as
  // having no authentication at all.
  const managedAuthDeps = hasAnyDep(ctx, [
    'next-auth',
    '@auth/core',
    '@auth/prisma-adapter',
    '@clerk/nextjs',
    '@clerk/clerk-react',
    '@clerk/backend',
    '@supabase/supabase-js',
    '@supabase/auth-helpers-nextjs',
    '@supabase/ssr',
    'lucia',
    'better-auth',
    '@kinde-oss/kinde-auth-nextjs',
    '@workos-inc/node',
    '@auth0/nextjs-auth0',
    'firebase-admin',
    'passport',
  ]);
  const managedAuthPyDeps = hasAnyPyDep(ctx, ['django-allauth', 'authlib', 'python-jose', 'fastapi-users', 'flask-login']);
  const authDeps = [
    ...hasAnyDep(ctx, ['jsonwebtoken', 'bcrypt', 'bcryptjs', 'express-session', 'cookie-parser']),
    ...managedAuthDeps,
    ...managedAuthPyDeps,
  ];
  const sessionDeps = [...hasAnyDep(ctx, ['express-session', 'cookie-session']), ...managedAuthDeps];
  const twoFaDeps = hasAnyDep(ctx, ['speakeasy', 'pyotp', 'qrcode', '@simplewebauthn/server', 'otplib']);

  const routeSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /\/(login|register|logout|signin|signup|sign-in|sign-up)\b/i,
      /requireAuth/i,
      /auth\s*middleware/i,
      /django\.contrib\.auth/i,
      /AUTH_USER_MODEL/i,
      // Framework-native shapes: NextAuth handlers, Clerk and Supabase helpers.
      /NextAuth\(/,
      /\bauth\(\)/,
      /getServerSession/,
      /currentUser\(/,
      /createServerClient/,
      /\[\.\.\.nextauth\]/i,
    ],
    30
  );
  const twoFaSignals = await searchInFiles(ctx.root, sourceFiles, [/two[_-]?factor/i, /otp/i, /totp/i], 20);
  const apiKeySignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /**
       * A key this project checks, not a key it holds.
       *
       * `apiKey` and `API_KEY` matched both, and almost every project that calls a
       * model or a maps service has one of its own. `--api-key YOUR_API_KEY_HERE`, in
       * the usage text of a script that downloads from YouTube, was enough to decide a
       * one-page Streamlit application offers an API to other callers — and it was then
       * asked at medium severity to restrict cross-origin access to it.
       *
       * What distinguishes a provider is reading a key out of an incoming request, or
       * looking one up to see whether it is valid. Holding a secret is what a client
       * does.
       */
      /x-api-key/i,
      /**
       * `authorization` on its own is how every session and bearer-token guard reads
       * its header: `if (!req.headers.authorization) return res.status(401)` is
       * authentication, not API keys, and matching it made a hardened Express fixture
       * claim an API-key scheme it does not have.
       */
      /headers?\s*[[.(]\s*['"]?x-api-key/i,
      /**
       * A verb on its own does not say which side you are on. `check_api_key(api_key)`
       * in a script that downloads from YouTube is a client making sure its own key
       * looks right before spending a request on it. What it cannot be is a store of
       * keys you issued.
       */
      /api[_-]?keys?\s*\.\s*(find|where|get|create)/i,
      /hashed?[_-]?(api[_-]?)?key/i,
      /token\s*scope/i,
    ],
    20
  );
  const passwordResetSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /forgot\s*password/i,
      /password[_-]?reset/i,
      /reset\s*token/i,
      /**
       * Django ships the whole flow — token, expiry, single use — behind one include.
       * A report on a real school platform called password reset missing while
       * `path("accounts/", include("django.contrib.auth.urls"))` sat in its urls.py:
       * the words "password" and "reset" appear nowhere, because the framework
       * supplies them.
       */
      /django\.contrib\.auth\.urls/,
      /PasswordReset(View|ConfirmView|DoneView|CompleteView)/,
      /auth_views\.PasswordReset/,
      // The same shape in other frameworks that hand you the flow rather than the words.
      /Devise|devise_for/,
      /Auth::routes\(/,
    ],
    20
  );
  const emailVerificationSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/verify\s*email/i, /email[_-]?verification/i, /confirm\s*email/i, /isEmailVerified/i],
    20
  );
  const sessionSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/session/i, /cookie/i, /jwt/i, /refresh\s*token/i, /httpOnly/i],
    25
  );

  const roleSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /requireRole/i,
      /isAdmin/i,
      /SUPER_ADMIN/i,
      /req\.user\.role/i,
      /user\.role/i,
      /role\s*===/i,
      /roles\.includes\(/i,
    ],
    20
  );
  const permissionSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/requirePermission/i, /permission_classes/i, /permissions\.py/i, /authorize\(/i, /\bcan\(/i],
    20
  );
  const resourceLevelSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /requirePermission/i,
      /permission_classes/i,
      /authorize\(/i,
      /\bcanAccess\(/i,
      /\bhasAccessTo\(/i,
      /ownerId/i,
      /createdBy/i,
      /req\.user\.id/i,
      /userId\s*===/i,
      /organizationId/i,
      /tenantId/i,
      /workspaceId/i,
      /**
       * Django checks ownership inside the view, not in middleware before it.
       *
       * A report said "no resource-level authorization signals detected" of a codebase
       * whose view reads
       * `if not request.user.is_staff and request.user.pk != user.pk: raise
       * PermissionDenied`, with visibility helpers called in every other view. The
       * patterns above are all Express and DRF shaped, so none of that was visible.
       */
      /raise\s+PermissionDenied/,
      /request\.user\.pk\s*!?==/,
      /request\.user\.is_staff/,
      /UserPassesTestMixin/,
      /PermissionRequiredMixin/,
      /@user_passes_test/,
      /get_queryset\([^)]*\)[\s\S]{0,120}filter\([^)]*user/,
      /\bis_visible_to\b/,
    ],
    20
  );

  /**
   * Words that only mean tenancy, and words that usually mean something else.
   *
   * `organizationId` and `tenantId` are not written by accident. `workspaceId` and
   * `companyId` are common in SaaS and also in code that talks *about* somebody else's
   * product, so they are corroborated across files before they count.
   *
   * `teamId` was a signal and is gone. In the JavaScript ecosystem it is overwhelmingly
   * Apple's Developer Team ID: `usebruno/bruno`, a desktop API client with no accounts
   * of any kind, was classified as a B2B SaaS with high confidence on the strength of
   * `const teamId = 'W7LPPWA48L'` in its notarization script.
   */
  const STRONG_TENANCY = [/organizationId/i, /organization_id/i, /tenantId/i, /tenant_id/i];
  const WEAK_TENANCY = [/workspaceId/i, /workspace_id/i, /companyId/i];

  const strongOrganization = await searchInFiles(ctx.root, sourceFiles, STRONG_TENANCY, 25);
  const weakOrganization = await searchInFiles(ctx.root, sourceFiles, WEAK_TENANCY, 25);

  // A weak word never stands on its own, however many files it appears in. Bruno says
  // `workspaceId` in three — it has workspaces, and they are local folders, not
  // customers. A tenant boundary is named somewhere by a word that means only that.
  const organizationSignals = strongOrganization.length > 0
    ? [...strongOrganization, ...weakOrganization]
    : [];

  const strongMembership = await searchInFiles(ctx.root, sourceFiles, [/memberId/i, ...STRONG_TENANCY], 25);
  const weakMembership = await searchInFiles(ctx.root, sourceFiles, WEAK_TENANCY, 25);

  const membershipSignals = strongMembership.length > 0 ? [...strongMembership, ...weakMembership] : [];
  const b2bSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /stripe/i,
      /subscription/i,
      /\/admin/i,
      /\/users/i,
      /organizationId/i,
      /tenantId/i,
      /workspaceId/i,
      /teamId/i,
      /companyId/i,
    ],
    20
  );

  const hasAuth = authDeps.length > 0 || routeSignals.length > 0;
  const hasAuthz = permissionSignals.length > 0 || roleSignals.length > 0;
  const b2bHint = b2bSignals.length > 0;
  const hasOrganization = organizationSignals.length > 0;

  return [
    {
      key: 'auth.core',
      present: hasAuth,
      complete: hasAuth && hasAuthz,
      evidence: [...depEvidence(authDeps), ...snippetEvidence(routeSignals)],
      details: {
        hasAuth,
        hasAuthz,
      },
    },
    {
      // True when authentication goes exclusively through an external identity
      // provider and the repository stores no password of its own. Downstream this
      // makes password reset not applicable rather than missing — there is no
      // password to reset.
      key: 'auth.externalIdentityOnly',
      present:
        managedAuthDeps.length > 0 &&
        hasAnyDep(ctx, ['bcrypt', 'bcryptjs', 'argon2', 'scrypt-kdf', 'passport-local']).length === 0 &&
        passwordResetSignals.length === 0,
      evidence: depEvidence(managedAuthDeps),
      details: { managedProviders: managedAuthDeps.length },
    },
    {
      key: 'auth.2fa',
      present: twoFaDeps.length > 0 || twoFaSignals.length > 0,
      evidence: [...depEvidence(twoFaDeps), ...snippetEvidence(twoFaSignals)],
    },
    {
      key: 'auth.apiKeys',
      present: apiKeySignals.length > 0,
      evidence: snippetEvidence(apiKeySignals),
    },
    {
      key: 'auth.passwordReset',
      present: passwordResetSignals.length > 0,
      // The terms, where nothing matched. "No direct evidence captured" reads like
      // "we did not look"; this lets a reader whose flow is called `recoverAccess`
      // see in one line why it was missed.
      evidence: passwordResetSignals.length > 0
        ? snippetEvidence(passwordResetSignals)
        : searchedFor('a password reset flow', ['"forgot password"', 'password_reset', 'password-reset', '"reset token"', 'django.contrib.auth.urls', 'PasswordResetView', 'devise_for', 'Auth::routes(']),
    },
    {
      key: 'auth.emailVerification',
      present: emailVerificationSignals.length > 0,
      evidence: emailVerificationSignals.length > 0
        ? snippetEvidence(emailVerificationSignals)
        : searchedFor('email verification', ['"verify email"', 'email_verification', 'email-verification', '"confirm email"', 'isEmailVerified']),
    },
    {
      key: 'auth.sessionStrategy',
      present: sessionDeps.length > 0 || sessionSignals.length > 0,
      evidence: [...depEvidence(sessionDeps), ...snippetEvidence(sessionSignals)],
    },
    {
      key: 'authz.roles',
      present: roleSignals.length > 0,
      evidence: snippetEvidence(roleSignals),
    },
    {
      key: 'authz.permissions',
      present: permissionSignals.length > 0,
      evidence: snippetEvidence(permissionSignals),
    },
    {
      key: 'authz.resourceLevel',
      present: resourceLevelSignals.length > 0 || permissionSignals.length > 0,
      evidence: snippetEvidence(resourceLevelSignals),
    },
    {
      key: 'tenancy.organization',
      present: hasOrganization,
      evidence: snippetEvidence(organizationSignals),
      details: {
        b2bHint,
        missingTenantRisk: b2bHint && !hasOrganization,
      },
    },
    {
      key: 'tenancy.membership',
      present: membershipSignals.length > 0,
      evidence: snippetEvidence(membershipSignals),
    },
  ];
}
