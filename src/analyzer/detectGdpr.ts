import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectGdpr(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const signals = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/gdpr/i, /consent/i, /export user data/i, /dataExport/i, /erasure/i, /delete account/i, /retention/i, /privacy/i],
    20
  );
  for (const m of signals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  return {
    key: 'gdpr.privacy',
    present: signals.length > 0,
    evidence,
    details: { signals: signals.length },
  };
}
