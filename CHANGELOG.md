# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Adding a required field to `ProductionReadinessReport` is a breaking change for
library consumers, because it changes a type they construct in tests and fixtures.
Several such fields have landed without a version bump so far; from 0.3.0 onward they
are called out here.

## [Unreleased]

### Added
- Product profiles now ask domain-specific questions. Marketplace expects distinct
  buyer and seller roles, payouts, a commission and dispute handling; AI SaaS expects
  inference cost controls and model input validation; B2C expects an onboarding flow
  and transactional notifications.
- `ProductExpectationResult.gap` reports how many expected capabilities are missing,
  partial and satisfied, by importance. Two profiles can score similarly while
  demanding very different amounts of work.
- `ProductionReadinessReport.executiveSummary`: a verdict, a launch-ready flag, the
  blocking themes in plain language, what already works, and a calendar estimate.
- `ProductionReadinessReport.categoryScores`: per-area readiness, so a report can say
  where a product is weak rather than only how weak it is.
- `ProductionReadinessReport.compliance`: advisory mapping onto GDPR articles, NIS2
  obligations and the OWASP Top 10. Not a certification, and obligations nothing maps
  to are omitted rather than reported as met.
- `Finding.businessImpact`: what happens if the finding is left as it is, in plain
  language.
- MCP server (`prodkit-mcp`) exposing `analyze_project`, `plan_remediation`,
  `compare_profiles` and `list_profiles`. Deterministic analysis only, no network
  calls.

### Changed
- The AI layer is extracted into `@prodkit/ai`, a separate commercial package. This
  package no longer contains it, depends on it, or ships it; the CLI resolves it at run
  time and degrades when it is absent. `readTextFileSafe` and `readJsonSafe` are now
  exported so a consumer sampling a repository gets the same safety guarantees the
  analyzer relies on.
- `npm run build` cleans `dist` first, and `prepublishOnly` refuses to publish if any
  AI artefact is present — tsc does not clean its output, and a stale build from before
  the extraction would otherwise have shipped the paid layer under MIT.
- The optional AI layer moved behind its own entry point (`@prodkit/core/ai`) and is
  excluded from the published package. The deterministic analysis is what ships under
  MIT; the AI review is the paid part of the product. A published install runs the
  deterministic analysis only, and `--ai` says so instead of failing.
- `@anthropic-ai/sdk` is no longer declared as an optional dependency, since only the
  excluded layer uses it.
- Expected-capability scoring no longer saturates. It previously computed
  `100 - Σ penalty` clamped at zero, and a demanding profile accumulates more than 100
  points of penalty on a repository that satisfies nothing, so every demanding profile
  reported an identical score. It now decays exponentially, keeping the penalty
  absolute while staying comparable across profiles.
- A missing authentication baseline is now P0. It was P1 while the work depending on
  it was P0, so a repository with no authentication produced no P0 task at all.
- Remediation plans are sorted so no task appears before a task it depends on. They
  were ordered by priority, severity and title, which put "enforce tenant isolation"
  above "implement authentication".

### Fixed
- A repository no longer inherits the stack and the defects of its own test fixtures.
  `fixtures`, `__fixtures__`, `testdata` and `__snapshots__` are excluded from
  scanning; previously prodkit analysing itself reported express, next, nestjs, flask,
  fastapi, django, react, vue and electron, none of which it uses.
- Marketplace and AI detectors match only in files where a domain concept would be
  declared. Searching the whole tree produced confident false positives: `vendor:`
  from a bundler chunk rule, "listing teams" from a log message, and `arbitration`
  from a glossary.

## [0.2.0]

- Deterministic hardening, multi-package scanning, product profiles, remediation
  planning, report diagnostics, and the optional AI layer.
