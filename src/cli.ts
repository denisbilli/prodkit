import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';
import { analyzeProject } from './analyzer/analyzeProject';
import { buildReport } from './report/buildReport';
import { renderMarkdown } from './report/markdownReport';
import { renderJson } from './report/jsonReport';
import { buildPlan } from './planner/buildPlan';
import { renderMarkdownPlan } from './planner/markdownPlan';
import { renderJsonPlan } from './planner/jsonPlan';
import { resolveProjectPath } from './utils/pathUtils';
import type { ProductProfile } from './expectations/types';
import type { MaturityLevel } from './report/types';
import type { ProjectAnalysis } from './analyzer/types';
import { PRODKit_VERSION } from './version';

type OutputFormat = 'markdown' | 'json';
const allowedProfiles = ['observed-only', 'static-site', 'internal-tool', 'b2c-app', 'b2b-saas', 'ai-saas', 'marketplace', 'game', 'auto'] as const;
const maturityOrder: MaturityLevel[] = ['prototype', 'early', 'partial', 'production_ready'];

function normalizeProfile(profile: string | undefined): ProductProfile {
  if (!profile) return 'observed-only';
  if (!allowedProfiles.includes(profile as ProductProfile)) {
    throw new Error(`Invalid profile "${profile}". Allowed profiles: ${allowedProfiles.join(', ')}.`);
  }
  return profile as ProductProfile;
}

async function resolveExistingProjectPath(input: string): Promise<string> {
  const resolved = resolveProjectPath(input);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(`Project path does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolved}`);
  }
  return resolved;
}

function parseFailUnder(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid --fail-under value "${value}". Expected an integer between 0 and 100.`);
  }
  return parsed;
}

function parseMinMaturity(value: string | undefined): MaturityLevel | undefined {
  if (value === undefined) return undefined;
  if (!maturityOrder.includes(value as MaturityLevel)) {
    throw new Error(`Invalid --min-maturity value "${value}". Allowed levels: ${maturityOrder.join(', ')}.`);
  }
  return value as MaturityLevel;
}

function enforceThresholds(
  report: ReturnType<typeof buildReport>,
  failUnder: number | undefined,
  minMaturity: MaturityLevel | undefined,
): void {
  if (failUnder !== undefined && report.overallScore < failUnder) {
    throw new Error(`Score gate failed: overall score ${report.overallScore} is below --fail-under ${failUnder}.`);
  }
  if (minMaturity !== undefined && maturityOrder.indexOf(report.maturityLevel) < maturityOrder.indexOf(minMaturity)) {
    throw new Error(`Maturity gate failed: maturity "${report.maturityLevel}" is below --min-maturity "${minMaturity}".`);
  }
}

function summarize(report: ReturnType<typeof buildReport>): string {
  const counts = {
    critical: report.findings.filter((f) => f.severity === 'critical' && f.status !== 'passed' && f.status !== 'unknown').length,
    high: report.findings.filter((f) => f.severity === 'high' && f.status !== 'passed' && f.status !== 'unknown').length,
    medium: report.findings.filter((f) => f.severity === 'medium' && f.status !== 'passed' && f.status !== 'unknown').length,
  };

  const top = report.findings
    .filter((f) => f.status !== 'passed' && f.status !== 'unknown')
    .slice(0, 10)
    .map((f, i) => `${i + 1}. [${f.severity}] ${f.title} (${f.category})`)
    .join('\n');

  const workspaceSummary = report.detectedStack.workspaces.length === 0
    ? 'none'
    : report.detectedStack.workspaces
      .map((ws) => `${ws.root}:${ws.packageManager}/${ws.packageManagerConfidence}`)
      .join(' | ');

  return [
    'ProdKit Analysis Summary',
    `Project: ${report.projectPath}`,
    `Detected frontend: ${report.detectedStack.frontend.join(', ') || 'unknown'}`,
    `Detected backend: ${report.detectedStack.backend.join(', ') || 'unknown'}`,
    `Detected databases: ${report.detectedStack.databases.join(', ') || 'unknown'}`,
    // Named on their own line rather than folded into the databases list. A reader
    // whose data layer is entirely Supabase needs to see that the tool recognised
    // Supabase, not only that it worked out the engine underneath is Postgres.
    ...(report.detectedStack.dataPlatforms.length > 0
      ? [`Data platform: ${report.detectedStack.dataPlatforms.join(', ')}`]
      : []),
    ...(report.detectedStack.orms.length > 0 ? [`ORM: ${report.detectedStack.orms.join(', ')}`] : []),
    `Package manager: ${report.detectedStack.packageManager} (${report.detectedStack.packageManagerConfidence})`,
    report.detectedStack.warnings.length > 0 ? `Warnings: ${report.detectedStack.warnings.join('; ')}` : 'Warnings: none',
    `Workspaces: ${workspaceSummary}`,
    `Score: ${report.overallScore}/100`,
    `Maturity: ${report.maturityLevel}${report.inconclusive ? ' (INCONCLUSIVE: project not recognized, score capped)' : ''}`,
    `Critical/High/Medium: ${counts.critical}/${counts.high}/${counts.medium}`,
    '',
    'Top findings:',
    top || 'none',
  ].join('\n');
}

function renderByFormat(format: OutputFormat, report: ReturnType<typeof buildReport>): string {
  return format === 'json' ? renderJson(report) : renderMarkdown(report);
}

function summarizePlan(plan: ReturnType<typeof buildPlan>): string {
  const phaseCount = plan.phases.filter((phase) => phase.tasks.length > 0).length;
  const quickWins = plan.quickWins.length;
  const highRisk = plan.highRiskTasks.length;

  return [
    'ProdKit Remediation Plan Summary',
    `Project: ${plan.projectPath}`,
    `Score: ${plan.score}/100`,
    `Maturity: ${plan.maturityLevel}`,
    `Tasks: ${plan.tasks.length}`,
    `Phases with work: ${phaseCount}`,
    `Quick wins: ${quickWins}`,
    `High risk: ${highRisk}`,
    `Summary: ${plan.summary}`,
  ].join('\n');
}

function renderPlanByFormat(format: OutputFormat, plan: ReturnType<typeof buildPlan>): string {
  return format === 'json' ? renderJsonPlan(plan) : renderMarkdownPlan(plan);
}

/**
 * Loads the optional AI layer.
 *
 * `@produtype/ai` is a separate, commercial package. It is not a dependency of this one,
 * so the import is resolved at run time and its absence is the normal case: the
 * deterministic CLI is complete without it, and `--ai` says the feature is not
 * installed rather than the binary failing to start.
 */
interface AiLayer {
  inferStackWithAi(analysis: ProjectAnalysis): Promise<{
    frontend: string[];
    backend: string[];
    databases: string[];
    architecture: string;
    confidence: string;
  }>;
  reviewCodeWithAi(analysis: ProjectAnalysis): Promise<{
    findings: Array<{
      title: string;
      severity: string;
      confidence: string;
      recommendation: string;
      file?: string;
      line?: number;
    }>;
  }>;
}

// A variable specifier, so `tsc` does not require the commercial package to be
// installed in order to build the open source one. webpackIgnore keeps bundlers from
// trying to resolve it: it is meant to be found by Node at run time, if it is there.
const AI_PACKAGE = '@produtype/ai';

async function loadAiLayer(): Promise<AiLayer | null> {
  try {
    return (await import(/* webpackIgnore: true */ AI_PACKAGE)) as unknown as AiLayer;
  } catch {
    return null;
  }
}

async function runAiEnrichment(
  analysis: ProjectAnalysis,
  opts: { ai?: boolean; aiReview?: boolean },
): Promise<void> {
  if (!opts.ai && !opts.aiReview) return;

  const ai = await loadAiLayer();
  if (!ai) {
    console.error(
      '\nAI features require the @produtype/ai package, which is not installed. The deterministic analysis above is complete.',
    );
    return;
  }

  if (opts.ai) {
    const hint = await ai.inferStackWithAi(analysis);
    console.log('\n## AI Stack Insight (advisory — does not affect score)');
    console.log(`- Frontend: ${hint.frontend.join(', ') || 'unknown'}`);
    console.log(`- Backend: ${hint.backend.join(', ') || 'unknown'}`);
    console.log(`- Databases: ${hint.databases.join(', ') || 'unknown'}`);
    console.log(`- Architecture: ${hint.architecture}`);
    console.log(`- Confidence: ${hint.confidence}`);
  }
  if (opts.aiReview) {
    const review = await ai.reviewCodeWithAi(analysis);
    console.log('\n## AI Code Review (advisory — does not affect score)');
    if (review.findings.length === 0) {
      console.log('- No issues reported.');
    }
    for (const f of review.findings) {
      const loc = f.file ? ` (${f.file}${f.line !== undefined ? `:${f.line}` : ''})` : '';
      console.log(`- [${f.severity}/${f.confidence}] ${f.title}${loc}: ${f.recommendation}`);
    }
  }
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('prodkit')
    .description('Analyze web application repositories for production-readiness and remediation planning.')
    .version(PRODKit_VERSION);

  program
    .command('analyze')
    .argument('<path-to-project>', 'Path to target repository')
    .option('--format <format>', 'Output format: markdown|json')
    .option('--profile <profile>', 'Product profile: observed-only|static-site|internal-tool|b2c-app|b2b-saas|ai-saas|marketplace|auto')
    .option('--summary', 'Print summary only')
    .option('--output <path>', 'Output file path (optional)')
    .option('--fail-under <score>', 'Exit with an error if overall score is below this threshold (0-100)')
    .option('--min-maturity <level>', `Exit with an error if maturity is below this level: ${maturityOrder.join('|')}`)
    .option('--ai', 'Add an AI stack/architecture insight (opt-in; requires @produtype/ai; advisory only)')
    .option('--ai-review', 'Add an AI semantic code review of fine-grained issues (opt-in; requires @produtype/ai; advisory only)')
    .action(async (targetPath: string, options: { format?: OutputFormat; profile?: string; summary?: boolean; output?: string; failUnder?: string; minMaturity?: string; ai?: boolean; aiReview?: boolean }) => {
      const format = options.format === 'json' ? 'json' : 'markdown';
      const formatSpecified = typeof options.format === 'string';
      const profile = normalizeProfile(options.profile);
      const failUnder = parseFailUnder(options.failUnder);
      const minMaturity = parseMinMaturity(options.minMaturity);
      const resolved = await resolveExistingProjectPath(targetPath);
      const analysis = await analyzeProject(resolved);
      const report = buildReport(analysis, { profile });
      const payload = renderByFormat(format, report);

      if (options.output) {
        const outPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outPath, payload, 'utf8');
        console.log(summarize(report));
        console.log(`\nReport written to: ${outPath}`);
      } else if (options.summary || !formatSpecified) {
        console.log(summarize(report));
      } else {
        console.log(payload);
      }

      await runAiEnrichment(analysis, options);
      enforceThresholds(report, failUnder, minMaturity);
    });

  program
    .command('plan')
    .argument('<path-to-project>', 'Path to target repository')
    .option('--format <format>', 'Output format: markdown|json')
    .option('--profile <profile>', 'Product profile: observed-only|static-site|internal-tool|b2c-app|b2b-saas|ai-saas|marketplace|auto')
    .option('--summary', 'Print summary only')
    .option('--output <path>', 'Output file path (optional)')
    .action(async (targetPath: string, options: { format?: OutputFormat; profile?: string; summary?: boolean; output?: string }) => {
      const format = options.format === 'json' ? 'json' : 'markdown';
      const profile = normalizeProfile(options.profile);
      const resolved = await resolveExistingProjectPath(targetPath);
      const analysis = await analyzeProject(resolved);
      const report = buildReport(analysis, { profile });
      const plan = buildPlan(report);
      const payload = renderPlanByFormat(format, plan);

      if (options.output) {
        const outPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outPath, payload, 'utf8');
        if (options.summary) {
          console.log(summarizePlan(plan));
          return;
        }
        console.log(summarizePlan(plan));
        console.log(`\nPlan written to: ${outPath}`);
        return;
      }

      if (options.summary) {
        console.log(summarizePlan(plan));
        return;
      }

      console.log(payload);
    });

  await program.parseAsync(argv);
}
