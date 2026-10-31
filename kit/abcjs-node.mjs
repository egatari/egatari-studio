// Synchronous build API; only score fields start the DOM helper. No renderer in the deck runtime.
import abcjsPackage from 'abcjs/package.json' with { type: 'json' };
import markup from '../vendor/egatari-spec/schema/rendered-markup-1.json' with { type: 'json' };
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ABCJS_OPTIONS, renderScore } from './core/abcjs.mjs';
const require = createRequire(import.meta.url);
const here = fileURLToPath(import.meta.url);
export const abcjs = {
  version: abcjsPackage.version,
  defaults: ABCJS_OPTIONS,
  render(abc, options) {
    const r = spawnSync(process.execPath, [here], { input: JSON.stringify({ abc, options }), encoding: 'utf8', timeout: 45000, maxBuffer: 32 * 1024 * 1024 });
    if (r.error || r.status !== 0) throw new Error(r.error?.message || r.stderr.trim() || 'abcjs helper failed');
    return JSON.parse(r.stdout);
  },
};
if (process.argv[1] === here) {
  let browser;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw new Error('abcjs input exceeds 32 MiB');
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const { launch } = await import('./browser.mjs');
    browser = await launch();
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ path: require.resolve('abcjs/dist/abcjs-basic.js') });
    process.stdout.write(JSON.stringify(await page.evaluate(renderScore, { ...input, markup })));
  } catch (e) { process.stderr.write(String(e.message)); process.exitCode = 1; }
  finally { if (browser) await browser.close(); }
}
