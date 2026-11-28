// CLI の TTS エンジン、鍵、品質チェック。サーバーと鍵は試験用。
// test-all: unit
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-tts-engines-')));
const deck = path.join(tmp, 'deck');
const config = path.join(tmp, 'tts.json');
const cli = path.join(ROOT, 'bin/egatari.mjs');
const key = 'sk-fixture-' + 'X'.repeat(28);
const rotatedKey = 'sk-fixture-' + 'Y'.repeat(28);
const googleKey = 'AIza' + 'Z'.repeat(35);
const bearerKey = 'Q'.repeat(32);
const env = {
  ...process.env,
  APPDATA: path.join(tmp, 'appdata'),
  XDG_CONFIG_HOME: path.join(tmp, 'xdg'),
  EGATARI_TTS_CONFIG: config,
  IRODORI_URL: 'http://127.0.0.1:9',
  IRODORI_REF_DIR: '',
  MOTION_YOMI: '',
  NETRC: path.join(tmp, 'no-netrc'),
  NO_PROXY: '*',
  no_proxy: '*',
  PYTHONPATH: '',
  STUDIO_TTS_KEY: key,
  UV_ENV_FILE: '',
  UV_NO_ENV_FILE: '1',
  UV_OFFLINE: '1',
  UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || path.join(tmp, 'venv'),
};
delete env.UV_ENV_FILE;
const runFile = promisify(execFile);
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const voice = (v = {}) => writeJson(path.join(deck, 'voice.json'), { expert: 'teacher', novice: 'student', ...v });
const entries = () => Object.values(JSON.parse(fs.readFileSync(path.join(deck, 'audio', 'manifest.json'))).segments);
const meta = (e) => JSON.parse(fs.readFileSync(path.join(deck, 'audio', `seg_${e.digest}.json`)));
const narration = (lang) => {
  fs.writeFileSync(path.join(deck, 'deck.html'), `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>TTS fixture</title></head>
<body><div id="stage"><section class="slide static noconcl" id="speech"><h2>Speech</h2>
<div class="body"><p>Speech synthesis fixture.</p></div></section></div></body></html>`);
  fs.writeFileSync(path.join(deck, 'narration.md'), '## Speech {#speech}\n[0] 閾値を読みます。\n[1] 次の文です。\n');
};
function noSecrets(output) {
  for (const secret of [key, rotatedKey, googleKey, bearerKey]) {
    assert.equal(output.includes(secret), false, 'a fake key leaked');
  }
}
async function run(args, overrides, status = 0) {
  const options = { cwd: ROOT, env: { ...env, ...overrides }, timeout: 60000 };
  const r = await runFile(process.execPath, [cli, ...args], options).catch((error) => error);
  noSecrets(r.stdout + r.stderr);
  assert.equal(r.code || 0, status, r.stdout + r.stderr || r.message);
  return r;
}
const tts = (args = [], overrides = {}, status = 0) => run(['tts', deck, ...args], overrides, status);
const check = (...args) => run(['check', deck, '--no-browser', '--lang', 'en', ...args]);

let server;
try {
  fs.mkdirSync(deck);
  narration('ja');
  voice({ engine: 'cloud', aPiKeY: key });
  fs.writeFileSync(path.join(deck, '.env'), `# fake key\nGOOGLE_KEY=${googleKey}\n`);
  fs.writeFileSync(path.join(deck, 'extra.json'), `{"auth": "Bearer ${bearerKey}", "label": "sk-short"}\n`);
  fs.writeFileSync(path.join(deck, 'short.json'), '{"auth": "Bearer example", "id": "sk-short"}');
  fs.mkdirSync(path.join(deck, 'attachments'));
  fs.writeFileSync(path.join(deck, 'egatari.json'), `{"dummy": '${key}'}\n`);
  const report = JSON.parse((await check('--json')).stdout);
  assert.deepEqual(report.results.filter((r) => r.code === 'keyLike').map((r) => [r.sev, r.data]), [
    ['warn', { file: '.env', line: 2 }],
    ['warn', { file: 'egatari.json', line: 1 }],
    ['warn', { file: 'extra.json', line: 1 }],
    ['warn', { file: 'voice.json', line: 5 }],
  ]);
  assert.equal(report.rules.find((r) => r.id === 'C-keys').state, 'checked');
  assert.match((await check()).stdout, /\[warning\] \.env line 2 may contain an API key/);
  console.log('ok  CLI check reports only the location of possible keys');

  const python = spawnSync('uv', ['run', '--quiet', '--frozen', '--project', path.join(ROOT, 'tts'), 'python', '-c', 'import requests, yaml'], {
    cwd: ROOT, env: { ...env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8', timeout: 60000,
  });
  if (python.error?.code === 'ENOENT' || (python.status !== 0 && /offline|network|failed to download/i.test(python.stderr))) {
    console.log('skipped  TTS cases require uv and the Python dependencies in its offline cache');
  } else {
    assert.equal(python.status, 0, python.stderr || python.error?.message);
    const cloud = { model: 'fixture/model', voiceBy: 'name', apiKeyEnv: 'STUDIO_TTS_KEY', url: env.IRODORI_URL };
    const engines = (overrides = {}) => writeJson(config, { engines: { cloud, ...overrides } });
    engines();
    for (const field of ['aPiKeY', 'KEY', 'tOkEn', 'Authorization']) {
      voice({ engine: 'cloud', [field]: key });
      assert.match((await tts([], {}, 1)).stderr, /voice\.json.*tts\.json/);
    }
    voice({ engine: 'cloud' });
    const inside = path.join(deck, 'fake-key');
    fs.writeFileSync(inside, key);
    engines({ cloud: { ...cloud, apiKeyFile: inside } });
    assert.match((await tts([], {}, 1)).stderr, /apiKeyFile.*作業フォルダの外/);
    const insideConfig = path.join(deck, 'tts.json');
    fs.copyFileSync(config, insideConfig);
    assert.match((await tts(['--dry-run'], { EGATARI_TTS_CONFIG: insideConfig }, 1)).stderr, /tts\.json.*作業フォルダの外/);
    if (process.platform !== 'win32') {
      const link = path.join(tmp, 'key-link');
      fs.symlinkSync(inside, link);
      engines({ cloud: { ...cloud, apiKeyFile: link } });
      assert.match((await tts([], {}, 1)).stderr, /apiKeyFile.*作業フォルダの外/);
    }
    assert.match((await tts(['--dry-run', '--engine', 'missing'], {}, 2)).stderr, /cloud, irodori, voxcpm2/);
    assert.equal(fs.existsSync(path.join(deck, 'audio')), false);
    console.log('ok  deck credentials and in-folder key/config paths are refused before synthesis');

    engines({ irodori: { ...cloud, model: 'override-irodori', yomi: false } });
    const base = process.platform === 'win32' ? env.APPDATA : env.XDG_CONFIG_HOME;
    fs.mkdirSync(path.join(base, 'egatari'), { recursive: true });
    fs.copyFileSync(config, path.join(base, 'egatari', 'tts.json'));
    await tts(['--dry-run', '--engine', 'irodori'], { EGATARI_TTS_CONFIG: '' });
    assert.equal(entries()[0].recipe.model, 'override-irodori');
    assert.equal(meta(entries()[0]).voice.selectedEngine, 'irodori');
    fs.rmSync(path.join(base, 'egatari', 'tts.json'));
    for (const [lang, engine, model] of [
      ['ja', 'irodori', 'mlx-community/Irodori-TTS-v4.1-Small-fp16'],
      ['en', 'voxcpm2', 'mlx-community/VoxCPM2-8bit'],
    ]) {
      narration(lang);
      voice();
      await tts(['--dry-run'], { EGATARI_TTS_CONFIG: '' });
      assert.equal(meta(entries()[0]).voice.selectedEngine, engine);
      assert.equal(entries()[0].recipe.model, model);
    }
    narration('ja');
    voice({ lang: 'en' });
    await tts(['--dry-run'], { EGATARI_TTS_CONFIG: '' });
    assert.equal(meta(entries()[0]).voice.selectedEngine, 'voxcpm2', 'voice.json lang still overrides the default language');
    console.log('ok  config discovery, engine precedence, and built-ins without a config');

    const encode = (...args) => spawnSync('ffmpeg', [
      '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', ...args, 'pipe:1',
    ]);
    const wav = encode('-f', 'wav');
    const mp3 = encode('-f', 'mp3');
    if (wav.error?.code === 'ENOENT') {
      console.log('skipped  synthesis cases require ffmpeg');
    } else {
      assert.equal(wav.status, 0, String(wav.stderr));
      assert.equal(mp3.status, 0, String(mp3.stderr));
      fs.writeFileSync(path.join(tmp, 'test.wav'), wav.stdout);
      fs.writeFileSync(path.join(tmp, 'test.mp3'), mp3.stdout);
      let requests = [];
      let media = 'test.mp3';
      let modelsStatus = 404;
      let postStatus = 200;
      let expectedAuth = `Bearer ${key}`;
      const postError = `Authorization: Bearer ${key}`;
      server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
        const supplied = req.headers.authorization ?? null;
        const status = supplied !== expectedAuth ? 401 : req.url.endsWith('/v1/models') ? modelsStatus : postStatus;
        res.writeHead(status, status === 200 ? {} : { 'x-test-error': postError });
        res.end(status === 200 ? fs.readFileSync(path.join(tmp, media)) : postError);
      });
      let url;
      let transport = {};
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        url = `http://127.0.0.1:${server.address().port}`;
      } catch (e) {
        if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
        console.log('info  loopback bind is restricted; exercising the CLI with an in-process Requests transport');
        url = 'https://tts.example.invalid';
        transport = { PYTHONPATH: tmp, TTS_TEST_FIXTURE: tmp };
        fs.writeFileSync(path.join(tmp, 'sitecustomize.py'), `
import json, os
from pathlib import Path
from urllib.parse import urlsplit
from requests.adapters import HTTPAdapter
from requests import Response

def fake_send(self, request, **kwargs):
    root = Path(os.environ["TTS_TEST_FIXTURE"])
    state = json.loads((root / "server.json").read_text())
    url = urlsplit(request.url).path
    with (root / "requests.jsonl").open("a") as log:
        print(json.dumps(dict(method=request.method, url=url,
                              auth=request.headers.get("Authorization"),
                              body=json.loads(request.body) if request.body else None)), file=log)
    response = Response()
    response.status_code = state["models"] if url.endswith("/v1/models") else state["status"]
    if request.headers.get("Authorization") != state["auth"]:
        response.status_code = 401
    response.reason = state["error"]
    response._content = (root / state["media"]).read_bytes() if response.ok else response.reason.encode()
    response.url = request.url
    return response

HTTPAdapter.send = fake_send
`);
      }
      async function speech(args = [], overrides = {}, status = 0) {
        requests = [];
        const log = path.join(tmp, 'requests.jsonl');
        if (transport.PYTHONPATH) {
          fs.writeFileSync(log, '');
          writeJson(path.join(tmp, 'server.json'), { status: postStatus, models: modelsStatus, auth: expectedAuth, media, error: postError });
        }
        const result = await tts(args, { ...transport, ...overrides }, status);
        if (transport.PYTHONPATH) requests = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
        return result;
      }

      narration('ja');
      voice({ engine: 'cloud' });
      engines({ cloud: { ...cloud, url: 'http://127.0.0.1:9' } });
      const running = await speech(['--tts-url', url + '/v1/', '--tts-model', 'one-run/model']);
      assert.match(running.stderr, /GET \/v1\/models: HTTP 404/);
      assert.equal((running.stdout.match(/原稿の文を .* へ送ります/g) || []).length, transport.PYTHONPATH ? 1 : 0);
      assert.deepEqual(requests.map(({ method, url: route }) => [method, route]), [
        ['GET', '/v1/models'], ['POST', '/v1/audio/speech'], ['POST', '/v1/audio/speech'],
      ]);
      assert.ok(requests.every((r) => r.auth === `Bearer ${key}`), 'the server requires the fake Bearer key');
      assert.deepEqual(requests[1].body, { input: '閾値を読みます。', model: 'one-run/model', response_format: 'wav', voice: 'teacher' });
      const first = entries()[0];
      assert.equal(first.engine, 'cloud');
      assert.equal(first.recipe.dictionary, null);
      assert.equal(first.recipe.model, 'one-run/model');
      assert.deepEqual(first.recipe.voice, { expert: 'teacher', novice: 'student' });
      assert.equal(meta(first).voice.voiceBy, 'name');
      assert.equal(fs.readFileSync(path.join(deck, 'audio', first.file)).subarray(0, 4).toString(), 'RIFF');
      assert.equal(fs.existsSync(path.join(deck, '.cache')), false);
      console.log('ok  Bearer auth, name-only payload, non-fatal model ping, and MP3 to WAV');

      media = 'test.wav';
      fs.writeFileSync(path.join(tmp, 'fake.env'), `# comment\nOTHER=wrong\nSTUDIO_TTS_KEY=older\nexport STUDIO_TTS_KEY = "${rotatedKey}" # comment\n`);
      engines({ cloud: { ...cloud, url, model: 'one-run/model', apiKeyFile: 'fake.env' } });
      expectedAuth = `Bearer ${rotatedKey}`;
      await speech();
      assert.equal(entries()[0].digest, first.digest);
      assert.equal(requests.length, 1, 'cached segments do not synthesize again');
      await speech(['--force']);
      assert.ok(requests.every((r) => r.auth === `Bearer ${rotatedKey}`), 'a named dotenv assignment wins over the environment');
      fs.writeFileSync(path.join(tmp, 'fake.env'), `export STUDIO_TTS_KEY='${rotatedKey}' # comment\n`);
      await speech(['--force']);
      assert.ok(requests.every((r) => r.auth === `Bearer ${rotatedKey}`), 'single quotes are accepted');
      fs.writeFileSync(path.join(tmp, 'fake.env'), rotatedKey + '\n');
      engines({ cloud: { ...cloud, url, yomi: true, apiKeyFile: 'fake.env' } });
      await speech();
      assert.ok(requests.every((r) => r.auth === `Bearer ${rotatedKey}`), 'the single bare key is accepted with apiKeyEnv present');
      assert.equal(requests[1].body.input, 'しきいちを読みます。');
      assert.ok(entries()[0].recipe.dictionary);
      assert.notEqual(entries()[0].digest, first.digest);
      narration('en');
      await speech();
      assert.equal(requests[1].body.input, '閾値を読みます。');
      assert.equal(entries()[0].recipe.dictionary, null);
      assert.equal(requests[1].body.voice, 'teacher');
      console.log('ok  dotenv and bare keys, cache identity, and the Japanese reading dictionary');

      expectedAuth = `Bearer ${key}`;
      engines({ cloud: { ...cloud, url, model: 'one-run/model', voiceBy: 'ref' } });
      const refFile = path.join(tmp, 'teacher.wav');
      fs.copyFileSync(path.join(tmp, 'test.wav'), refFile);
      voice({ engine: 'cloud', expert: refFile });
      await speech();
      assert.ok(requests[1].body.ref_audio.endsWith('.wav'));
      assert.equal(requests[1].body.voice, undefined);
      assert.equal(entries()[0].recipe.voice.expert, 'teacher');
      assert.notEqual(entries()[0].digest, first.digest);

      engines({ cloud: { ...cloud, url } });
      voice({ engine: 'cloud' });
      postStatus = 401;
      const failure = await speech(['--force'], {}, 1);
      assert.equal(requests.length, 2, 'stop on the first synthesis failure');
      assert.match(failure.stdout + failure.stderr, /POST \/v1\/audio\/speech: HTTP 401/);
      assert.doesNotMatch(failure.stdout + failure.stderr, /Authorization|Bearer/);

      modelsStatus = postStatus = 200;
      expectedAuth = null;
      narration('ja');
      voice({ expert: refFile });
      await speech([], { EGATARI_TTS_CONFIG: '', IRODORI_URL: url });
      assert.equal(requests[1].body.model, 'mlx-community/Irodori-TTS-v4.1-Small-fp16');
      assert.ok(requests[1].body.ref_audio.endsWith('.wav'));
      assert.equal(requests[1].auth ?? null, null);
      assert.equal(entries()[0].engine, 'irodori');
      // 既定のエンジン（ref）では digest の voice に voiceBy を入れない。入れると、今までに作った音声がすべて作り直しになる
      assert.equal(meta(entries()[0]).voice.voiceBy, undefined);
      for (const name of fs.readdirSync(path.join(deck, 'audio')).filter((name) => name.endsWith('.json'))) {
        const json = fs.readFileSync(path.join(deck, 'audio', name), 'utf8');
        noSecrets(json);
        assert.doesNotMatch(json, /apiKey|example\.invalid|127\.0\.0\.1|Authorization/);
      }
      console.log('ok  reference mode, fail-fast synthesis, and credential-free diagnostics and artifacts');
    }
  }
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
