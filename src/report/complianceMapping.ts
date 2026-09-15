import type { Finding } from './types';

export type ComplianceFramework = 'gdpr' | 'nis2' | 'owasp-top-10';

export interface ComplianceReference {
  framework: ComplianceFramework;
  /** Article, control or category identifier within the framework. */
  reference: string;
  title: string;
}

export interface ComplianceObligation extends ComplianceReference {
  /** Findings that leave this obligation unmet. */
  findingIds: string[];
  met: boolean;
}

/**
 * Maps findings onto the obligations a reader has to answer to.
 *
 * This is not a compliance certification and the report says so. It exists because
 * "add a data export endpoint" and "GDPR article 20 is unmet" are the same fact
 * addressed to two different people, and only the second one unlocks a budget.
 */
const RULES: ReadonlyArray<{ prefix: string; references: ComplianceReference[] }> = [
  {
    prefix: 'expectation.gdpr.consent',
    references: [{ framework: 'gdpr', reference: 'Art. 6', title: 'Lawfulness of processing' }],
  },
  {
    prefix: 'expectation.gdpr.export',
    references: [{ framework: 'gdpr', reference: 'Art. 20', title: 'Right to data portability' }],
  },
  {
    prefix: 'expectation.gdpr.erasure',
    references: [{ framework: 'gdpr', reference: 'Art. 17', title: 'Right to erasure' }],
  },
  {
    prefix: 'expectation.gdpr.retention',
    references: [{ framework: 'gdpr', reference: 'Art. 5(1)(e)', title: 'Storage limitation' }],
  },
  {
    prefix: 'expectation.tenancy',
    references: [
      { framework: 'gdpr', reference: 'Art. 32', title: 'Security of processing' },
      { framework: 'owasp-top-10', reference: 'A01', title: 'Broken access control' },
    ],
  },
  {
    prefix: 'expectation.authz',
    references: [{ framework: 'owasp-top-10', reference: 'A01', title: 'Broken access control' }],
  },
  {
    prefix: 'expectation.auth',
    references: [
      { framework: 'owasp-top-10', reference: 'A07', title: 'Identification and authentication failures' },
      { framework: 'nis2', reference: 'Art. 21(2)(i)', title: 'Access control and authentication' },
    ],
  },
  {
    prefix: 'expectation.security',
    references: [
      { framework: 'owasp-top-10', reference: 'A05', title: 'Security misconfiguration' },
      { framework: 'gdpr', reference: 'Art. 32', title: 'Security of processing' },
    ],
  },
  {
    prefix: 'security.weak-secret',
    references: [{ framework: 'owasp-top-10', reference: 'A02', title: 'Cryptographic failures' }],
  },
  {
    prefix: 'security.',
    references: [{ framework: 'owasp-top-10', reference: 'A05', title: 'Security misconfiguration' }],
  },
  {
    prefix: 'uploads.',
    references: [{ framework: 'owasp-top-10', reference: 'A01', title: 'Broken access control' }],
  },
  {
    prefix: 'expectation.uploads',
    references: [{ framework: 'owasp-top-10', reference: 'A01', title: 'Broken access control' }],
  },
  {
    prefix: 'expectation.audit',
    references: [
      { framework: 'owasp-top-10', reference: 'A09', title: 'Security logging and monitoring failures' },
      { framework: 'nis2', reference: 'Art. 21(2)(b)', title: 'Incident handling' },
    ],
  },
  {
    prefix: 'expectation.observability',
    references: [{ framework: 'owasp-top-10', reference: 'A09', title: 'Security logging and monitoring failures' }],
  },
  {
    prefix: 'expectation.billing.webhook-integrity',
    references: [{ framework: 'owasp-top-10', reference: 'A08', title: 'Software and data integrity failures' }],
  },
];

function referencesFor(finding: Finding): ComplianceReference[] {
  for (const rule of RULES) {
    if (finding.id.startsWith(rule.prefix)) return rule.references;
  }
  return [];
}

function keyOf(reference: ComplianceReference): string {
  return `${reference.framework}::${reference.reference}`;
}

/**
 * Returns every obligation touched by the analysis, marking as unmet those with at
 * least one actionable finding attached. An obligation nothing mapped to is omitted
 * rather than reported as met, because silence is not evidence of compliance.
 */
export function buildComplianceMapping(findings: Finding[]): ComplianceObligation[] {
  const obligations = new Map<string, ComplianceObligation>();

  for (const finding of findings) {
    const actionable = finding.status !== 'passed' && finding.severity !== 'info';

    for (const reference of referencesFor(finding)) {
      const key = keyOf(reference);
      const existing = obligations.get(key);

      if (!existing) {
        obligations.set(key, {
          ...reference,
          findingIds: actionable ? [finding.id] : [],
          met: !actionable,
        });
        continue;
      }

      if (actionable) {
        existing.findingIds.push(finding.id);
        existing.met = false;
      }
    }
  }

  return [...obligations.values()].sort(
    (left, right) => left.framework.localeCompare(right.framework) || left.reference.localeCompare(right.reference),
  );
}
