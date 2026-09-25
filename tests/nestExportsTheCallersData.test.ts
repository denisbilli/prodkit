import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function exportRoute(controller: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-nest-export-'));
  const files: Record<string, string> = {
    'package.json': '{"name":"wealth","dependencies":{"@nestjs/core":"^10.0.0","@nestjs/common":"^10.0.0"}}',
    'apps/api/src/app/export/export.controller.ts': controller,
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const present = (await analyzeProject(root)).detectors['gdpr.export.route']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return present;
}

/**
 * ghostfolio's `@Controller('export')` hands the caller their own portfolio, narrowed by
 * `this.request.user.id`, and was told at `high` it offers no data export.
 */
describe('a NestJS export of the caller\'s own data', () => {
  it('reads an export controller narrowed to the caller', async () => {
    expect(await exportRoute(`@Controller('export')
export class ExportController {
  public constructor(@Inject(REQUEST) private readonly request: RequestWithUser) {}

  @Get()
  public async export() {
    return this.exportService.export({ userId: this.request.user.id });
  }
}
`)).toBe(true);
  });

  /** `/export` with nobody's id in it is an administrator's export of everybody. */
  it('does not read an export of every account as a personal one', async () => {
    expect(await exportRoute(`@Controller('export')
export class ExportController {
  @Get()
  public async export() {
    return this.exportService.exportAllAccounts();
  }
}
`)).toBe(false);
  });
});
