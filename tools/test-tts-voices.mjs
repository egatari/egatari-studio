// 既定の声（tts/voices.json・tts/refvoices.py）の試験：npm の包みには wav を入れず、初めての egatari tts で取り寄せる
// test-all: unit
//   node tools/test-tts-voices.mjs
// 1. tts/voices.json の sha256 が tts/voices/ のファイルと合い、package.json の files は wav を入れない（voices.json と README は入れる）
// 2. checkout：tts/voices/ にあれば、取り寄せずにそれを使う（URL が届かなくても。キャッシュも作らない）。core.resolve_voice も同じ
// 3. 取り寄せ：sha256 の合うものをキャッシュに置き、次からはキャッシュを使う。壊れたキャッシュは取り寄せ直す
// 4. sha256 の合わないものは断り、キャッシュに置かない
// 5. 届かない（オフライン）：手で落とす URL と置き場所を言う
// 2〜5 は uv があれば（ネットワークは使わない。file: の URL と、閉じたポート）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TTS = path.join(ROOT, 'tts');
const lock = JSON.parse(fs.readFileSync(path.join(TTS, 'voices.json'), 'utf8'));
let fail = 0;
const ok = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

ok('tts/voices.json pins the sha256 of every wav in tts/voices/, at a release tag; the package leaves the wavs out', () => {
  assert.match(lock.tag, /^v\d+\.\d+\.\d+$/);
  assert.match(lock.url, /^https:\/\/raw\.githubusercontent\.com\/egatari\/egatari-studio\/\{tag\}\/tts\/voices\/\{file\}$/);
  const wavs = fs.readdirSync(path.join(TTS, 'voices')).filter((f) => f.endsWith('.wav') && fs.statSync(path.join(TTS, 'voices', f)).isFile());
  const tracked = spawnSync('git', ['ls-files', 'tts/voices/*.wav'], { cwd: ROOT, encoding: 'utf8' });
  const want = tracked.status === 0 ? tracked.stdout.split('\n').filter(Boolean).map((f) => path.basename(f)).sort() : wavs.sort();
  assert.deepEqual(Object.keys(lock.files).sort(), want);
  for (const f of want) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(TTS, 'voices', f))).digest('hex'), lock.files[f], f);
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).files;
  assert.ok(files.includes('tts/voices.json') && files.includes('tts/voices/README.md') && files.includes('tts/*.py'));
  assert.deepEqual(files.filter((f) => /\.wav$|^tts\/voices\/?$|^tts\/voices\/\*/.test(f)), []);
});

const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
if (uv.error || uv.status !== 0) console.log('     (skipped the Python part: uv is not installed)');
else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-voices-'));
  const py = `
import sys, json, hashlib, shutil
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(TTS)})
import refvoices as R
tmp = Path(${JSON.stringify(tmp)})
lock = R.load_lock()
good = (R.LOCAL_DIR / "bob.wav").read_bytes()
def with_url(url):
    return dict(lock, url=url)
def src(name, data):
    d = tmp / name; d.mkdir(); (d / "bob.wav").write_bytes(data); return d.as_uri() + "/{file}"
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
step = sys.argv[1]
if step == "local":
    # 届かない URL でも、tts/voices/ のファイルを使い、キャッシュを作らない
    c = tmp / "c-local"
    p = R.default_voice("bob.wav", cache=c, lock=with_url("https://127.0.0.1:9/{file}"), timeout=2)
    assert p == R.LOCAL_DIR / "bob.wav", p
    assert not c.exists()
elif step == "fetch":
    url = src("src", good)
    empty = tmp / "empty"; empty.mkdir(); c = tmp / "c-fetch"
    p = R.default_voice("bob.wav", local_dir=empty, cache=c, lock=with_url(url))
    assert p == c / "bob.wav" and sha(p) == lock["files"]["bob.wav"], p
    shutil.rmtree(tmp / "src")   # 次はキャッシュから（取り寄せない）
    assert R.default_voice("bob.wav", local_dir=empty, cache=c, lock=with_url(url)) == p
    (c / "bob.wav").write_bytes(b"broken")   # 壊れたキャッシュ：取り寄せ直す
    url = src("src2", good)
    assert sha(R.default_voice("bob.wav", local_dir=empty, cache=c, lock=with_url(url))) == lock["files"]["bob.wav"]
    assert not [f for f in c.iterdir() if f.name.endswith(".part")]
elif step == "mismatch":
    url = src("bad", good + b"x")
    empty = tmp / "empty2"; empty.mkdir(); c = tmp / "c-bad"
    try:
        R.default_voice("bob.wav", local_dir=empty, cache=c, lock=with_url(url)); raise SystemExit("no refusal")
    except R.VoiceFetchError as e:
        assert "sha256" in str(e) and lock["files"]["bob.wav"] in str(e), e
    assert not (c / "bob.wav").exists()
    assert not c.exists() or not list(c.iterdir())
elif step == "offline":
    empty = tmp / "empty3"; empty.mkdir(); c = tmp / "c-off"
    try:
        R.default_voice("alice.wav", local_dir=empty, cache=c, lock=with_url("https://127.0.0.1:9/{tag}/{file}"), timeout=5); raise SystemExit("no error")
    except R.VoiceFetchError as e:
        m = str(e)
        assert "offline" in m and "by hand" in m and "https://127.0.0.1:9/" + lock["tag"] + "/alice.wav" in m and str(c / "alice.wav") in m and lock["files"]["alice.wav"] in m, m
    assert not (c / "alice.wav").exists()
print("ok")
`;
  const pf = path.join(tmp, 't.py');
  fs.writeFileSync(pf, py);
  const run = (step) => {
    const r = spawnSync('uv', ['run', '--quiet', '--no-project', 'python', '-I', pf, step], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || '') + (r.error ? r.error.message : ''));
  };
  ok('checkout: the files in tts/voices/ are used as they are (no download, no cache), even when the URL is unreachable', () => run('local'));
  ok('download: a file whose sha256 matches is kept in the cache and used from there next time; a broken cache is downloaded again', () => run('fetch'));
  ok('a download whose sha256 does not match tts/voices.json is refused and not cached', () => run('mismatch'));
  ok('offline: the error names the URL to download by hand, where to put it and its sha256', () => run('offline'));
  ok('core.resolve_voice in a checkout: the default name resolves to tts/voices/<name>.wav; voice_available knows the default voices', () => {
    const code = `import sys; sys.path.insert(0, ${JSON.stringify(TTS)}); import core as M
p = M.resolve_voice("bob", M.DEFAULT_REF_DIR)
assert p == M.DEFAULT_REF_DIR / "bob.wav", p
assert M.voice_available("bob_en", M.DEFAULT_REF_DIR) and not M.voice_available("nobody", M.DEFAULT_REF_DIR)
print("ok")`;
    const r = spawnSync('uv', ['run', '--quiet', '--frozen', '--project', TTS, 'python', '-I', '-c', code], { encoding: 'utf8', timeout: 300000, env: { ...process.env, IRODORI_URL: 'http://localhost:8882' } });
    if (r.status !== 0 && /error: .*(resolve|download|network|connect|fetch)/i.test(r.stderr || '')) { console.log('     (skipped: uv cannot install the tts project here)'); return; }
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  });
  if (!fail) fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
