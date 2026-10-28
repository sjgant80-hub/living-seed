// The page carries a Content-Security-Policy that pins exactly the scripts on it (tools/csp.mjs), and lets it connect to
// nothing but its own site. An edit to the page's script without re-running the tool fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PAGES, scriptHashes, policy, withPolicy, current } from '../tools/csp.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const cspOf = (html) => (/<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/.exec(html) || [])[1] || '';
const directive = (csp, name) => (csp.split('; ').find((d) => d.startsWith(name + ' ')) || '').slice(name.length + 1).split(' ');

test('the page pins exactly its own inline scripts, nothing else may run, and it may connect nowhere but home', () => {
  for (const p of PAGES) {
    const html = read(p), csp = cspOf(html);
    assert.ok(csp, p + ' carries a policy');
    assert.equal(current(html), true, p + ': run node tools/csp.mjs after changing its scripts');
    const scripts = directive(csp, 'script-src');
    const pinned = scripts.filter((s) => s.startsWith("'sha256-")).map((s) => s.slice(8, -1));
    assert.deepEqual(pinned, scriptHashes(html), p);
    const own = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => createHash('sha256').update(m[1]).digest('base64'));
    assert.deepEqual(pinned, own, p);
    assert.deepEqual(scripts.filter((s) => !s.startsWith("'sha256-")), ["'self'", "'wasm-unsafe-eval'"], p + ': only the page itself and WebAssembly — no other script source');
    assert.ok(!scripts.includes("'unsafe-eval'") && !scripts.includes("'unsafe-inline'"), p + ': wasm-unsafe-eval permits WebAssembly only, never eval() or inline script');
    assert.deepEqual(directive(csp, 'connect-src'), ["'self'"], p + ': it can send nothing anywhere else');
    assert.deepEqual(directive(csp, 'object-src'), ["'none'"], p);
    assert.deepEqual(directive(csp, 'base-uri'), ["'self'"], p);
    assert.deepEqual(directive(csp, 'form-action'), ["'none'"], p);
    assert.deepEqual(directive(csp, 'default-src'), ["'self'"], p);
    assert.equal(html.indexOf('<meta http-equiv="Content-Security-Policy"'), html.indexOf('<meta charset="utf-8" />') + '<meta charset="utf-8" />\n'.length, p + ': first in <head>, after the charset');
    assert.doesNotMatch(html, /\son(click|load|error|change|input|submit|mouseover|focus|blur|key\w+)\s*=/i, p);
    assert.doesNotMatch(html, /href="javascript:/i, p);
  }
});

test('the tool: one policy, put back where it belongs, refused as stale the moment a script changes', () => {
  const page = '<!doctype html>\n<html><head>\n<meta charset="utf-8" />\n<title>t</title></head><body><script>a()</script><script type="module">b()</script></body></html>\n';
  const once = withPolicy(page);
  assert.equal(withPolicy(once), once, 'running it again changes nothing');
  assert.equal(current(once), true);
  assert.equal(current(page), false, 'no policy yet');
  assert.equal(once.match(/Content-Security-Policy/g).length, 1);
  const h = (s) => createHash('sha256').update(s).digest('base64');
  assert.deepEqual(scriptHashes(once), [h('a()'), h('b()')]);
  assert.equal(cspOf(once), policy([h('a()'), h('b()')]));
  assert.equal(current(once.replace('a()', 'a(1)')), false, 'a changed script is no longer pinned');
  assert.equal(current(withPolicy(once.replace('a()', 'a(1)'))), true);
  assert.deepEqual(scriptHashes('<script src="x.js"></script>'), [], 'a script by URL has no inline text to pin');
  assert.throws(() => withPolicy('<html><head></head></html>'), /no <meta charset/);
});
