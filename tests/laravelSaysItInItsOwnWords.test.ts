import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * koel, a Laravel music server, said three things in Laravel's own words and was
 * credited with none of them.
 */
describe('Laravel says it in its own words', () => {
  /** `throttle:10,1` — the comma stopped the pattern. */
  it('reads a throttle with both of its numbers', async () => {
    expect((await analyzeProject(fixture('laravel-music-server'))).detectors['security.core']?.details?.rateLimit).toBe(true);
  });

  /** `health: '/up'` in `withRouting()` is an endpoint the framework serves. */
  it('reads the health route Laravel 11 registers', async () => {
    expect((await analyzeProject(fixture('laravel-music-server'))).detectors['observability.core']?.details?.healthEndpoint).toBe(true);
  });

  /**
   * A form request whose rules say `'file'` takes an uploaded file, and
   * `File::mimeType(...)` reads its type from the content.
   */
  it('finds an upload behind a form request, and its content check', async () => {
    const uploads = (await analyzeProject(fixture('laravel-music-server'))).detectors['uploads.exposure'];

    expect(uploads?.present).toBe(true);
    expect(uploads?.details?.validation).toBe(true);
  });

  /**
   * BookStack clears its recycle bin of anything older than `recycle_bin_lifetime`
   * days: `subDays($lifetime)`, then `where('created_at', '<', $date)` — the operator
   * as an argument, which is how Laravel's query builder writes a comparison.
   */
  it('reads a trash emptied after a number of days as retention', async () => {
    expect((await analyzeProject(fixture('laravel-recycle-bin-lifetime'))).detectors['gdpr.retention.job']?.present).toBe(true);
  });

  /** Firefly III lines its named arguments up: `health  : '/up',`. */
  it('reads the health route with its arguments aligned', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-up-'));
    await fs.mkdir(path.join(root, 'bootstrap'), { recursive: true });
    await fs.writeFile(path.join(root, 'composer.json'), '{"name":"app/finance","type":"project","require":{"laravel/framework":"^11.0"}}');
    await fs.writeFile(path.join(root, 'bootstrap/app.php'), "<?php\nreturn Application::configure(basePath: dirname(__DIR__))\n    ->withRouting(\n        web     : __DIR__ . '/../routes/web.php',\n        health  : '/up',\n    )\n    ->create();\n");
    const health = (await analyzeProject(root)).detectors['observability.core']?.details?.healthEndpoint;
    await fs.rm(root, { recursive: true, force: true });

    expect(health).toBe(true);
  });

  /** Firefly III's login uses the framework's own lockout trait. */
  it('reads ThrottlesLogins as a rate limit', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-throttle-'));
    await fs.mkdir(path.join(root, 'app/Http/Controllers/Auth'), { recursive: true });
    await fs.writeFile(path.join(root, 'composer.json'), '{"name":"app/finance","type":"project","require":{"laravel/framework":"^11.0"}}');
    await fs.writeFile(path.join(root, 'app/Http/Controllers/Auth/LoginController.php'), "<?php\nnamespace App\\Http\\Controllers\\Auth;\n\nuse Illuminate\\Foundation\\Auth\\ThrottlesLogins;\n\nclass LoginController extends Controller\n{\n    use ThrottlesLogins;\n}\n");
    const rateLimit = (await analyzeProject(root)).detectors['security.core']?.details?.rateLimit;
    await fs.rm(root, { recursive: true, force: true });

    expect(rateLimit).toBe(true);
  });
});

