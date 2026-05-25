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

type OutputFormat = 'markdown' | 'json';
const allowedProfiles = ['observed-only', 'static-site', 'internal-tool', 'b2c-app', 'b2b-saas', 'ai-saas', 'marketplace', 'auto'] as const;

function normalizeProfile(profile: string | undefined): ProductProfile {
  if (!profile) return 'observed-only';
  return (allowedProfiles.includes(profile as ProductProfile) ? profile : 'observed-only') as ProductProfile;
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
    `Package manager: ${report.detectedStack.packageManager} (${report.detectedStack.packageManagerConfidence})`,
    report.detectedStack.warnings.length > 0 ? `Warnings: ${report.detectedStack.warnings.join('; ')}` : 'Warnings: none',
    `Workspaces: ${workspaceSummary}`,
    `Score: ${report.overallScore}/100`,
    `Maturity: ${report.maturityLevel}`,
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

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('prodkit')
    .description('Analyze web application repositories for production-readiness and remediation planning.')
    .version('0.2.0');

  program
    .command('analyze')
    .argument('<path-to-project>', 'Path to target repository')
    .option('--format <format>', 'Output format: markdown|json')
    .option('--profile <profile>', 'Product profile: observed-only|static-site|internal-tool|b2c-app|b2b-saas|ai-saas|marketplace|auto')
    .option('--summary', 'Print summary only')
    .option('--output <path>', 'Output file path (optional)')
    .action(async (targetPath: string, options: { format?: OutputFormat; profile?: string; summary?: boolean; output?: string }) => {
      const format = options.format === 'json' ? 'json' : 'markdown';
      const formatSpecified = typeof options.format === 'string';
      const profile = normalizeProfile(options.profile);
      const resolved = resolveProjectPath(targetPath);
      const analysis = await analyzeProject(resolved);
      const report = buildReport(analysis, { profile });
      const payload = renderByFormat(format, report);

      if (options.output) {
        const outPath = path.resolve(process.cwd(), options.output);
        await fs.writeFile(outPath, payload, 'utf8');
        console.log(summarize(report));
        console.log(`\nReport written to: ${outPath}`);
        return;
      }

      if (options.summary || !formatSpecified) {
        console.log(summarize(report));
        return;
      }

      console.log(payload);
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
      const resolved = resolveProjectPath(targetPath);
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
