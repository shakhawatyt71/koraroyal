#!/usr/bin/env node
/* ================================================================
   KORA ROYAL — worker.js অটো-প্যাচার
   ----------------------------------------------------------------
   কাজ : আপনার অরিজিনাল worker.js পড়ে, autoBookPathao() ফাংশনটা
         খুঁজে বের করে (brace-matching দিয়ে), নতুন ভার্সন + নতুন
         হেল্পার বসিয়ে **সম্পূর্ণ ফাইল** লিখে দেয়।

         অরিজিনাল ফাইলের বাকি ৩৫০০+ লাইন হুবহু অক্ষত থাকে —
         একটা ক্যারেক্টারও বদলায় না।

   ব্যবহার :
       node apply-worker-patch.mjs  <আপনার-worker.js>  [আউটপুট.js]

   উদাহরণ :
       node apply-worker-patch.mjs worker.js worker.fixed.js

   নিরাপত্তা :
     • অরিজিনাল ফাইল কখনো বদলায় না (আউটপুট আলাদা ফাইলে)
     • আউটপুটে node --check চালিয়ে syntax যাচাই করে
     • অ্যাঙ্কর না মিললে থেমে যায়, কিছু লেখে না
   ================================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH_FILE = join(HERE, 'worker-pathao-fix.js');

const RED = '\x1b[31m', GRN = '\x1b[32m', YEL = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m';
const fail = (m) => { console.error(RED + '✖ ' + m + OFF); process.exit(1); };
const ok   = (m) => console.log(GRN + '✔ ' + m + OFF);
const info = (m) => console.log(DIM + '  ' + m + OFF);

/* ---------- ১. ইনপুট ---------- */
const inPath  = process.argv[2];
const outPath = process.argv[3] || (inPath ? inPath.replace(/\.js$/i, '') + '.fixed.js' : null);
if (!inPath) fail('ব্যবহার: node apply-worker-patch.mjs <worker.js> [আউটপুট.js]');
if (!existsSync(inPath)) fail('ফাইল পাওয়া যায়নি: ' + inPath);
if (!existsSync(PATCH_FILE)) fail('প্যাচ ফাইল পাওয়া যায়নি: ' + PATCH_FILE);

const src   = readFileSync(inPath, 'utf8');
const patch = readFileSync(PATCH_FILE, 'utf8');

/* ---------- ২. প্যাচ ফাইল থেকে দুইটা ব্লক তোলা ---------- */
function between(text, startMarker, endMarker, label) {
  const a = text.indexOf(startMarker);
  if (a < 0) fail('প্যাচ ফাইলে ' + startMarker + ' মার্কার নেই');
  const from = a + startMarker.length;
  let to;
  if (endMarker === null) { to = text.length; }
  else { to = text.indexOf(endMarker, from); if (to < 0) fail('প্যাচ ফাইলে ' + endMarker + ' মার্কার নেই'); }
  const body = text.slice(from, to).replace(/^\s*\n/, '').replace(/\s+$/, '');
  if (!body.trim()) fail(label + ' ব্লক খালি');
  return body;
}
// PATCH B = নতুন হেল্পার (B-START → PATCH A ব্যানারের আগে পর্যন্ত)
const patchB = between(patch, '// @KR-PATCH-B-START\n', '\n\n\n/* ═', 'PATCH B');
// PATCH A = নতুন autoBookPathao (A-START → A-END)
const patchA = between(patch, '// @KR-PATCH-A-START\n', '\n// @KR-PATCH-A-END', 'PATCH A');

if (!/^async function autoBookPathao\(env, order\) \{/m.test(patchA))
  fail('PATCH A-তে autoBookPathao ঘোষণা নেই');

/* ---------- ৩. JS-সচেতন brace matcher ----------
   স্ট্রিং / টেমপ্লেট লিটারেল / কমেন্ট / রেগেক্স-এর ভেতরের { } গুনে ফেলে না। */
function findFunctionEnd(text, startIdx) {
  let i = text.indexOf('{', startIdx);
  if (i < 0) return -1;
  const openIdx = i;
  let depth = 0;
  const n = text.length;
  const REGEX_PREV = new Set(['(', ',', '=', ':', '!', '&', '|', '?', '{', '}', ';', '\n']);

  while (i < n) {
    const c = text[i];
    const nx = text[i + 1];

    if (c === '/' && nx === '/') {                       // লাইন কমেন্ট
      const e = text.indexOf('\n', i); i = e < 0 ? n : e; continue;
    }
    if (c === '/' && nx === '*') {                       // ব্লক কমেন্ট
      const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') {           // স্ট্রিং / টেমপ্লেট
      const q = c; i++;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {  // ${...} — গভীরতা বাড়ে
          let d = 1; i += 2;
          while (i < n && d > 0) {
            if (text[i] === '{') d++;
            else if (text[i] === '}') d--;
            else if (text[i] === '\\') i++;
            else if (text[i] === "'" || text[i] === '"' || text[i] === '`') {
              const q2 = text[i]; i++;
              while (i < n && text[i] !== q2) { if (text[i] === '\\') i++; i++; }
            }
            i++;
          }
          continue;
        }
        if (text[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/') {                                     // রেগেক্স লিটারেল?
      let j = i - 1; while (j >= 0 && /[ \t]/.test(text[j])) j--;
      if (j >= 0 && REGEX_PREV.has(text[j])) {
        let k = i + 1, inClass = false, closed = false;
        while (k < n) {
          const ch = text[k];
          if (ch === '\\') { k += 2; continue; }
          if (ch === '\n') break;
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { closed = true; break; }
          k++;
        }
        if (closed) { i = k + 1; continue; }
      }
      i++; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { openIdx, endIdx: i }; }
    i++;
  }
  return -1;
}

/* ---------- ৪. অরিজিনাল ফাইলে autoBookPathao খোঁজে বের করা ---------- */
const ANCHOR = /^async function autoBookPathao\(env, order\) \{/m;
const hits = src.match(new RegExp(ANCHOR.source, 'gm')) || [];
if (hits.length === 0) fail('অরিজিনাল ফাইলে `async function autoBookPathao(env, order) {` পাওয়া যায়নি');
if (hits.length > 1)  fail('autoBookPathao ' + hits.length + ' বার ঘোষিত — নিরাপত্তার জন্য থামছি (ম্যানুয়ালি দেখুন)');

const m = src.match(ANCHOR);
const startIdx = m.index;
const bounds = findFunctionEnd(src, startIdx);
if (bounds === -1) fail('autoBookPathao-এর শেষ brace খুঁজে পাওয়া যায়নি (ফাইল অসম্পূর্ণ?)');

const endIdx   = bounds.endIdx + 1;                       // '}' সহ
const before   = src.slice(0, startIdx);
const after    = src.slice(endIdx);
const oldFn    = src.slice(startIdx, endIdx);

const lineOf = (i) => src.slice(0, i).split('\n').length;

console.log('');
console.log('\x1b[1mKORA ROYAL — worker.js অটো-প্যাচার\x1b[0m');
console.log(DIM + '─'.repeat(64) + OFF);
info('ইনপুট      : ' + resolve(inPath));
info('অরিজিনাল   : ' + src.split('\n').length + ' লাইন, ' + Buffer.byteLength(src) + ' বাইট');
info('autoBookPathao : লাইন ' + lineOf(startIdx) + ' → ' + lineOf(endIdx) +
     '  (' + oldFn.split('\n').length + ' লাইন)');

/* ---------- ৫. স্প্লাইস ---------- */
const NL = src.includes('\r\n') ? '\r\n' : '\n';           // অরিজিনালের লাইন-এন্ডিং রাখা
const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').join(NL);

const replacement = norm(patchB) + NL + NL + NL + norm(patchA);
const result = before + replacement + after;

/* ---------- ৬. যাচাই ---------- */
console.log('');
const srcOpen = (src.match(/\{/g) || []).length,    srcClose = (src.match(/\}/g) || []).length;
const outOpen = (result.match(/\{/g) || []).length, outClose = (result.match(/\}/g) || []).length;
info('brace ভারসাম্য  ইনপুট  { ' + srcOpen + '  } ' + srcClose +
     (srcOpen === srcClose ? '  ✅' : '  ⚠️ (স্ট্রিঙেও থাকতে পারে)'));
info('brace ভারসাম্য  আউটপুট { ' + outOpen + '  } ' + outClose);

if (existsSync(outPath)) {
  const bak = outPath + '.bak-' + Date.now();
  writeFileSync(bak, readFileSync(outPath));
  info('পুরনো আউটপুট ব্যাকআপ → ' + bak);
}
writeFileSync(outPath, result);

let syntaxOk = false;
try { execFileSync(process.execPath, ['--check', outPath], { stdio: 'pipe' }); syntaxOk = true; }
catch (e) { console.error(RED + (e.stderr || e.message).toString() + OFF); }

console.log('');
if (!syntaxOk) fail('আউটপুটে syntax error — ফাইল ব্যবহার করবেন না');
ok('node --check পাস');
ok('সম্পূর্ণ ফাইল লেখা হয়েছে → ' + resolve(outPath));
info('আউটপুট     : ' + result.split('\n').length + ' লাইন, ' + Buffer.byteLength(result) + ' বাইট');
info('পরিবর্তন   : ' + oldFn.split('\n').length + ' লাইন সরে ' +
     replacement.split(NL).length + ' লাইন বসেছে (বাকি সব অক্ষত)');

/* ---------- ৭. অক্ষততার প্রমাণ ---------- */
const untouchedHead = src.slice(0, startIdx) === result.slice(0, startIdx);
const untouchedTail = src.slice(endIdx) === result.slice(result.length - after.length);
if (untouchedHead) ok('ফাংশনের আগের ' + before.split('\n').length + ' লাইন হুবহু অক্ষত');
else fail('ফাংশনের আগের অংশ বদলে গেছে!');
if (untouchedTail) ok('ফাংশনের পরের ' + after.split('\n').length + ' লাইন হুবহু অক্ষত');
else fail('ফাংশনের পরের অংশ বদলে গেছে!');

const mustExist = ['maybeAutoBookPathao', 'pathaoCachedList', 'export default',
                   'KR_CITY_ALIASES', 'krFindPathaoCity'];
const missing = mustExist.filter(k => !result.includes(k));
console.log('');
if (missing.length) console.log(YEL + '⚠ আউটপুটে নেই: ' + missing.join(', ') + OFF);
else ok('গুরুত্বপূর্ণ সব চিহ্নিতকারী উপস্থিত');

console.log('');
console.log(GRN + '✅ সম্পন্ন। Cloudflare → Worker → Quick Edit → পুরো কোড মুছে\x1b[0m');
console.log(GRN + '   ' + resolve(outPath) + ' -এর সবকিছু পেস্ট করে Deploy করুন।\x1b[0m');
console.log('');
