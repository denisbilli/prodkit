import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectAuth(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const authDeps = hasAnyDep(ctx, ['jsonwebtoken', 'bcrypt', 'bcryptjs', 'express-session', 'cookie-parser']);
  const twoFaDeps = hasAnyDep(ctx, ['speakeasy', 'pyotp', 'qrcode']);
  const sourceFiles = ctx.files.source;

  for (const d of authDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of twoFaDeps) evidence.push({ type: 'dependency', value: d });

  const routeSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/\/(login|register|logout)\b/i, /requireAuth/i, /auth\s*middleware/i, /django\.contrib\.auth/i],
    20
  );
  for (const m of routeSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const authzSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/requireRole/i, /requirePermission/i, /isAdmin/i, /superadmin/i, /permission_classes/i, /permissions\.py/i],
    20
  );
  for (const m of authzSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const roleOnlySignals = await searchInFiles(ctx.root, sourceFiles, [/\brole\b/i, /isAdmin/i], 15);

  const tenantSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/organization/i, /tenant/i, /membership/i, /team/i, /workspace/i, /company/i],
    20
  );
  const apiKeySignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/x-api-key/i, /apiKey/i, /API_KEY/, /token\s*scope/i],
    15
  );
  for (const m of tenantSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of apiKeySignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const billingOrSaasSignals = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/stripe/i, /subscription/i, /\/admin/i, /\/users/i],
    20
  );

  const hasAuth = authDeps.length > 0 || routeSignals.length > 0;
  const hasAuthz = authzSignals.length > 0;
  const roleOnly = !hasAuthz && roleOnlySignals.length > 0;
  const b2bHint = billingOrSaasSignals.length > 0 || tenantSignals.length > 0;

  return {
    key: 'auth.core',
    present: hasAuth,
    complete: hasAuth && hasAuthz,
    evidence,
    details: {
      hasAuth,
      hasAuthz,
      roleOnly,
      twoFactor: twoFaDeps.length > 0,
      apiKeys: apiKeySignals.length > 0,
      tenantSignals: tenantSignals.length,
      b2bHint,
      missingTenantRisk: b2bHint && tenantSignals.length === 0,
    },
  };
}
