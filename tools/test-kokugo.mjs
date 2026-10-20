// 国語の部品の試験（ブラウザなし）：m-kanbun の読み取り・訓読の順・書き下し文を、よく知られた詩文で確かめる
//   node tools/test-kokugo.mjs
// 部品の index.js を Node の vm で読み（DECK.MotionElement がないので部品は定義せず、DECK.kanbun だけを出す）、順と書き下し文を比べる。
// 描画・決定性・品質チェックは tools/test-components.mjs（demo.html）と examples/kokugo-kanbun の check（npm test）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const load = (name) => {
  const ctx = { window: { DECK: {} }, console };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'), 'utf8'), ctx, { filename: name + '/index.js' });
  return ctx.window.DECK;
};
const K = load('kanbun').kanbun;
let n = 0, fail = 0;
const t = (name, fn) => {
  n++;
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
// 読む順（字。再読文字の二度目には ' を付ける。置き字は出ない）
const seq = (src) => {
  const p = K.parse(src), o = K.order(p.chars);
  return K.charEvents(o).map((e) => p.chars[e.c].ch + (e.kind === 'second' ? "'" : '')).join('');
};
const warnings = (src) => { const p = K.parse(src); return [...p.warnings, ...K.order(p.chars).warnings]; };

// ---------------------------------------------------------------- 返り点の規則（字の並びだけ）
t('レ点：一つ下を読んでから戻る', () => assert.equal(seq('A[レ]B'), 'BA'));
t('レ点が続く：下から順に戻る', () => assert.equal(seq('A[レ]B[レ]C'), 'CBA'));
t('レは [ ] なしでもよい', () => assert.equal(seq('AレBレC'), 'CBA'));
t('一二点', () => assert.equal(seq('A[二]BC[一]'), 'BCA'));
t('一二三点', () => assert.equal(seq('A[三]BC[二]DE[一]'), 'BDECA'));
t('一二点が二組', () => assert.equal(seq('A[二]B[一]C[二]D[一]'), 'BADC'));
t('二の上のレ点：二を読んでから戻る', () => assert.equal(seq('A[レ]B[二]CD[一]'), 'CDBA'));
t('一の上のレ点は、二より先に戻る', () => assert.equal(seq('C[二]A[レ]B[一]'), 'BAC'));
t('一レ点（人の制する所と為る）', () => assert.equal(seq('為[二]人所[一レ]制'), '人制所為'));
t('上中下点が一二点を挟む（児孫の為に美田を買はず）', () => assert.equal(seq('不[下]為[二]児孫[一]買[中]美田[上]'), '児孫為美田買不'));
t('中のない上下点', () => assert.equal(seq('A[下]B[二]C[一]D[上]'), 'CBDA'));
t('上レ点', () => assert.equal(seq('A[下]BC[上レ]D'), 'BDCA'));
t('甲乙点が上下点を挟む', () => assert.equal(seq('A[乙]B[下]C[二]D[一]E[上]F[甲]'), 'DCEBFA'));
t('竪点（熟語）：返り点はまとまりに効く', () => assert.equal(seq('A[二]B-C[一]'), 'BCA'));
t('竪点のまとまりへのレ点', () => assert.equal(seq('A[レ]B-C'), 'BCA'));
t('置き字は読まない', () => assert.equal(seq('学(ビテ)而{-}時(ニ)習(フ)[レ]之(ヲ)'), '学時之習'));
t('置き字をまたぐ一二点', () => assert.equal(seq('青(ハ)取(リテ)[二]之(ヲ)於{-}藍(ヨリ)[一]'), '青之藍取'));
t('再読文字：一度目はその場で、二度目は戻ったところで', () => assert.equal(seq('未(ダ|ず)[レ]知(ラ)[レ]生(ヲ)'), "未生知未'"));
t('再読文字と一二点', () => assert.equal(seq("将(ニ|ス)[レ]帰(ラント)[二]故郷(ニ)[一]"), "将故郷帰将'"));
t('返り点のない再読文字は、次の字を読んでから二度目', () => assert.equal(seq('猶(ホ|ごとシ)[レ]水'), "猶水猶'"));
t('列をまたいでも順は続く', () => assert.equal(seq('A[二]B\nC[一]D'), 'BCAD'));
t('戻り先のない返り点は知らせる', () => {
  assert.equal(seq('A[二]B'), 'BA');
  assert.ok(warnings('A[二]B').some((w) => /戻り先がない/.test(w)));
});
t('返り点でない字は知らせる', () => assert.ok(warnings('A[X]B').some((w) => /返り点ではない/.test(w))));
t('「不」を平仮名にしないと知らせる', () => assert.ok(warnings('不[レ]知').some((w) => /不\{=ず\}/.test(w))));
t('読み取り：送り仮名・振り仮名・平仮名・句読点・全角の括弧', () => {
  const p = K.parse('濺{そそ}（ギ）［レ］涙(ヲ)、');
  assert.equal(p.chars.length, 2);
  assert.deepEqual([p.chars[0].ruby, p.chars[0].okuri, p.chars[0].re, p.chars[1].okuri, p.chars[1].punct], ['そそ', 'ギ', true, 'ヲ', '、']);
  assert.equal(p.warnings.length, 0);
});

// ---------------------------------------------------------------- よく知られた詩文（順と書き下し文）
const SHUNGYO = `春眠不{=ず}レ覚(エ)レ暁(ヲ)
処処聞(ク)[二]啼鳥(ヲ)[一]
夜来風雨(ノ)声
花落(ツルコト)知(ル)多少`;
t('孟浩然「春暁」：順', () => assert.equal(seq(SHUNGYO), '春眠暁覚不処処啼鳥聞夜来風雨声花落知多少'));
t('孟浩然「春暁」：書き下し文', () => assert.equal(K.yomi(SHUNGYO), '春眠暁を覚えず\n処処啼鳥を聞く\n夜来風雨の声\n花落つること知る多少'));

const SHUNBO = `国破(レテ)山河在(リ)
城春(ニシテ)草木深(シ)
感(ジテハ)[レ]時(ニ)花(ニモ)濺{そそ}(ギ)[レ]涙(ヲ)
恨(ンデハ)[レ]別(レヲ)鳥(ニモ)驚(カス)[レ]心(ヲ)
烽火連(ナリ)[二]三月(ニ)[一]
家書抵{あ}(タル)[二]万金(ニ)[一]
白頭搔{か}(ケバ)更(ニ)短(ク)
渾{す}(ベテ)欲(ス)[レ]不{=ざ}(ラント)[レ]勝{た}(ヘ)[レ]簪{しん}(ニ)`;
t('杜甫「春望」：順', () => assert.equal(seq(SHUNBO), '国破山河在城春草木深時感花涙濺別恨鳥心驚烽火三月連家書万金抵白頭搔更短渾簪勝不欲'));
t('杜甫「春望」：書き下し文', () => assert.equal(K.yomi(SHUNBO), [
  '国破れて山河在り', '城春にして草木深し', '時に感じては花にも涙を濺ぎ', '別れを恨んでは鳥にも心を驚かす',
  '烽火三月に連なり', '家書万金に抵たる', '白頭搔けば更に短く', '渾べて簪に勝へざらんと欲す'].join('\n')));
t('杜甫「春望」：振り仮名は書き下し文の字に付く', () => {
  const p = K.parse(SHUNBO), o = K.order(p.chars), lines = K.kakikudashi(p.chars, o);
  const rb = (line) => Array.from(line).filter((s) => s.rb).map((s) => s.t + '|' + s.rb).join(' ');
  assert.equal(rb(lines[2]), '濺|そそ');
  assert.equal(rb(lines[7]), '渾|す 簪|しん 勝|た');
});
const SHIKI = '先(ンズレバ)即(チ)制(シ)[レ]人(ヲ)、後(ルレバ)則(チ)為(ル)[二]人(ノ)所(ト)[一レ]制(スル)';
t('史記：レ点・一二点・一レ点と句読点', () => {
  assert.equal(seq(SHIKI), '先即人制後則人制所為');
  assert.equal(K.yomi(SHIKI), '先んずれば即ち人を制し、後るれば則ち人の制する所と為る');
});
t('論語：置き字と句読点（学びて時に之を習ふ）', () => assert.equal(K.yomi('学(ビテ)而{-}時(ニ)習(フ)[レ]之(ヲ)。'), '学びて時に之を習ふ。'));
t('荀子：置き字をまたぐ返り点と句読点', () => assert.equal(K.yomi('青(ハ)取(リテ)[二]之(ヲ)於{-}藍(ヨリ)[一]、而{-}青(シ)[二]於{-}藍(ヨリモ)[一]'), '青は之を藍より取りて、藍よりも青し'));
t('論語：再読文字（未だ生を知らず）', () => assert.equal(K.yomi('未(ダ|ず)[レ]知(ラ)[レ]生(ヲ)、焉{いづく}(ンゾ)知(ラン)[レ]死(ヲ)'), '未だ生を知らず、焉んぞ死を知らん'));
t('再読文字の二度目の片仮名は左の送り仮名（将(ニ|ス) → す）', () => assert.equal(K.yomi('将(ニ|ス)[レ]帰(ラント)[二]故郷(ニ)[一]'), '将に故郷に帰らんとす'));
t('児孫の為に美田を買はず', () => assert.equal(K.yomi('不{=ず}[下]為(ニ)[二]児孫(ノ)[一]買(ハ)[中]美田(ヲ)[上]'), '児孫の為に美田を買はず'));
t('平仮名にする字の送り仮名も平仮名', () => assert.equal(K.hira('ラントヾヽ'), 'らんとゞゝ'));
// 見本のデッキの漢文がどれも知らせなしに読めること（書き下し文は口述原稿と同じ）
t('見本のデッキの漢文：知らせなし', () => {
  const html = fs.readFileSync(path.join(ROOT, 'examples/kokugo-kanbun/deck.html'), 'utf8');
  const srcs = [...html.matchAll(/<m-kanbun[^>]*>([\s\S]*?)<\/m-kanbun>/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 5);
  for (const s of srcs) assert.equal(warnings(s).join(' / '), '', s.trim().split('\n')[0]);
});

// ---------------------------------------------------------------- m-kobun（品詞分解の読み取りと助動詞の表）
const B = load('kobun').kobun;
t('古文：語・品詞・語に付く句読点・現代語訳', () => {
  const m = B.parse('春[名]/は[係助]/あけぼの[名]。\n= 春は明け方（がよい）。');
  assert.equal(m.lines.length, 1);
  const w = m.lines[0].words;
  assert.equal(w.map((x) => x.text.map((s) => s.t).join('') + '|' + x.pos.name).join(' '), '春|名詞 は|係助詞 あけぼの|名詞');
  assert.equal(w[2].tail, '。');
  assert.equal(m.lines[0].yaku, '春は明け方（がよい）。');
});
t('古文：振り仮名と活用の詳しいこと', () => {
  const w = B.parse('{紫|むらさき}だち[動・タ四・連用]').lines[0].words[0];
  assert.equal(w.text.map((s) => s.t + (s.rb ? '(' + s.rb + ')' : '')).join(''), '紫(むらさき)だち');
  assert.equal(w.pos.kind + ' ' + Array.from(w.info).join('・'), 'verb タ四・連用');
});
t('古文：助動詞の項目（なり・たりは意味で分ける）', () => {
  const aux = (tag) => B.parse('x[' + tag + ']').lines[0].words[0].aux;
  assert.equal(aux('助動・たり・存続・連体').entry.key, 'たり(完了)');
  assert.equal(aux('助動・たり・断定・終止').entry.key, 'たり(断定)');
  assert.equal(aux('助動・なり・伝聞・終止').entry.key, 'なり(伝聞推定)');
  assert.equal(aux('助動・なり・断定・連用').entry.key, 'なり(断定)');
  assert.equal(aux('助動・けり・詠嘆・終止').entry.a.f, '（けら） ○ けり ける けれ ○');
  assert.ok(B.parse('x[助動・なにか・推量・終止]').warnings.some((w) => /表にない助動詞/.test(w)));
});
t('古文：助動詞の表はどれも 6 つの活用形', () => {
  for (const [k, a] of Object.entries(B.AUX)) assert.equal(a.f.split(' ').length, 6, k);
});

// ---------------------------------------------------------------- m-gendai（段落・しるしの読み取り）
const G = load('gendai').gendai;
t('現代文：段落の役割・名前・つなぎ', () => {
  const m = G.parse('@具体例#p1>p2\nあ\n\n@主張#p2\nい\n\n@対比#p3~p1\nう');
  assert.equal(m.paras.map((p) => [p.role, p.id, p.rel, p.to].join(',')).join(' '), '具体例,p1,>,p2 主張,p2,, 対比,p3,~,p1');
  assert.equal(m.warnings.length, 0);
});
t('現代文：傍線・二重傍線・記号・指す先・指示語', () => {
  const r = G.parse('__a__と==b==と{c|_A}と{d|=B,#x}、{これ|>x}').paras[0].runs;
  assert.equal(r.filter((x) => x.line || x.id || x.ref).map((x) => [x.t, x.line, x.label, x.id, x.ref].join(',')).join(' '), 'a,1,,, b,2,,, c,1,A,, d,2,B,x, これ,0,,,x');
});
t('現代文：ない名前は知らせる', () => {
  const w = G.parse('@主張#a>zz\n{これ|>nope}').warnings;
  assert.ok(w.some((x) => /zz/.test(x)) && w.some((x) => /nope/.test(x)));
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
