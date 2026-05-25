import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';
import { analyzeProject } from './analyzer/analyzeProject';
import { buildReport } from './report/buildReport';
import { renderMarkdown } from './report/markdownReport';
import { renderJson } from './report/jsonReport';
import { resolveProjectPath } from './utils/pathUtils';

type OutputFormat = 'markdown' | 'json';

function summarize(report: ReturnType<typeof buildReport>): string {
  const counts = {
    critical: report.findings.filter((f) => f.severity === 'critical' && f.status !== 'passed').length,
    high: report.findings.filter((f) => f.severity === 'high' && f.status !== 'passed').length,
    medium: report.findings.filter((f) => f.severity === 'medium' && f.status !== 'passed').length,
  };

  const top = report.findings
    .filter((f) => f.status !== 'passed' && f.status !== 'unknown')
    .slice(0, 10)
    .map((f, i) => `${i + 1}. [${f.severity}] ${f.title} (${f.category})`)
    .join('\n');

  return [
    'ProdKit Analysis Summary',
    `Project: ${report.projectPath}`,
    `Detected frontend: ${report.detectedStack.frontend.join(', ') || 'unknown'}`,
    `Detected backend: ${report.detectedStack.backend.join(', ') || 'unknown'}`,
    `Detected databases: ${report.detectedStack.databases.join(', ') || 'unknown'}`,
    `Package manager: ${report.detectedStack.packageManager} (${report.detectedStack.packageManagerConfidence})`,
    report.detectedStack.warnings.length > 0 ? `Warnings: ${report.detectedStack.warnings.join('; ')}` : 'Warnings: none',
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

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('prodkit')
    .description('Analyze web application repositories for production-readiness.')
    .version('0.2.0');

  program
    .command('analyze')
    .argument('<path-to-project>', 'Path to target repository')
    .option('--format <format>', 'Output format: markdown|json')
    .option('--summary', 'Print summary only')
    .option('--output <path>', 'Output file path (optional)')
    .action(async (targetPath: string, options: { format?: OutputFormat; summary?: boolean; output?: string }) => {
      const format = options.format === 'json' ? 'json' : 'markdown';
      const formatSpecified = typeof options.format === 'string';
      const resolved = resolveProjectPath(targetPath);
      const analysis = await analyzeProject(resolved);
      const report = buildReport(analysis);
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

  await program.parseAsync(argv);
}
