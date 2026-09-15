import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

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
    [/x-api-key/i, /apiKey/i, /API_KEY/, /token\s*scope/i],
    20
  );
  const passwordResetSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/forgot\s*password/i, /password[_-]?reset/i, /reset\s*token/i],
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
      /teamId/i,
    ],
    20
  );

  const organizationSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [
      /organizationId/i,
      /tenantId/i,
      /workspaceId/i,
      /companyId/i,
      /teamId/i,
      /organization_id/i,
      /tenant_id/i,
      /workspace_id/i,
    ],
    25
  );
  const membershipSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/memberId/i, /organizationId/i, /tenantId/i, /workspaceId/i, /teamId/i, /companyId/i],
    25
  );
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
      evidence: snippetEvidence(passwordResetSignals),
    },
    {
      key: 'auth.emailVerification',
      present: emailVerificationSignals.length > 0,
      evidence: snippetEvidence(emailVerificationSignals),
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
