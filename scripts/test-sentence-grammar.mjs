import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(__dirname, "../js/sentence-grammar.js")).href);
const check = globalThis.checkSentenceGrammar;
const cases = [
  ["I have a English book", false, /an|元音/],
  ["I have an English book.", true, null],
  ["an apple", true, null],
  ["a apple", false, /an|元音/],
  ["He have a book.", false, /has/],
  ["He has a book.", true, null],
  ["I am a student.", true, null],
  ["I is a student.", false, /am/],
  ["a books", false, /复数|单数/],
  ["i like apples.", false, /大写/],
];
let fail = 0;
for (const [text, expectOk, tipRe] of cases) {
  const r = check(text);
  const okPass = !!r.ok === expectOk;
  const tipPass = expectOk || !tipRe || tipRe.test(r.tip || "");
  if (!okPass || !tipPass) {
    fail++;
    console.error("FAIL", JSON.stringify(text), r);
  } else {
    console.log("ok", JSON.stringify(text), r.ok ? "pass" : r.tip);
  }
}
if (fail) {
  console.error(fail + " failed");
  process.exit(1);
}
console.log("all passed", cases.length);
