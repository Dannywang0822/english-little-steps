/**
 * In-memory checks for the progress file and host pick.
 * Not a browser cache, not a live CloudBase or Firebase call, and not cross-cloud sync.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(name, cond, detail) {
  if (cond) console.log("ok", name);
  else {
    failures.push(name + (detail ? " — " + detail : ""));
    console.error("FAIL", name, detail || "");
  }
}

function load(file, extra) {
  const sandbox = Object.assign({
    window: {},
    console: { warn() {}, log() {} },
    Date,
    JSON,
    Object,
    Array,
    String,
    Error
  }, extra || {});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  return sandbox;
}

const host = load("js/host-backend.js", { location: { hostname: "dannywang0822.github.io" } });
check("Pages host selects Firebase", host.HostBackend.select() === "firebase");
check("Pages host selector ignores a CloudBase hostname argument", host.HostBackend.select("english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com") === "cloudbase");
check("domestic host stays CloudBase", host.HostBackend.select("english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com") === "cloudbase");

const transfer = load("js/progress-transfer.js");
const PT = transfer.ProgressTransfer;
const good = {
  format: PT.FORMAT,
  schemaVersion: 1,
  source: { backend: "cloudbase", uid: "cb-user" },
  bundle: {
    state: {
      cards: { "sc-w1-01": { seen: true, intervalIdx: 2, due: "2026-11-25" } },
      sentences: [],
      checkins: { "2026-11-23": true },
      lastActiveDate: "2026-11-23"
    },
    logs: [],
    tts: { slow: false },
    updatedAt: 10
  }
};
const ok = PT.validateImport(JSON.stringify(good));
check("valid progress file passes", ok.ok);
const secret = JSON.parse(JSON.stringify(good));
secret.bundle.state.password = "nope";
check("a password field is rejected before any write", !PT.validateImport(JSON.stringify(secret)).ok);
const badDate = JSON.parse(JSON.stringify(good));
badDate.bundle.state.cards["sc-w1-01"].due = "2026-02-31";
check("an impossible due date is rejected", !PT.validateImport(JSON.stringify(badDate)).ok);
const huge = "x".repeat(PT ? 900001 : 1);
check("an oversized file is rejected", !PT.validateImport(huge).ok);
const badInterval = JSON.parse(JSON.stringify(good));
badInterval.bundle.state.cards["sc-w1-01"].intervalIdx = "2";
check("a non-numeric interval is rejected", !PT.validateImport(JSON.stringify(badInterval)).ok);
const hugeInterval = JSON.parse(JSON.stringify(good));
hugeInterval.bundle.state.cards["sc-w1-01"].intervalIdx = 99;
check("an interval outside the SRS range is rejected", !PT.validateImport(JSON.stringify(hugeInterval)).ok);
const longSentence = JSON.parse(JSON.stringify(good));
longSentence.bundle.state.sentences = [{ text: "x".repeat(401), date: "2026-11-23" }];
check("an oversized sentence is rejected", !PT.validateImport(JSON.stringify(longSentence)).ok);
const longNote = JSON.parse(JSON.stringify(good));
longNote.bundle.state.daily = { date: "2026-11-23", note: "n".repeat(2001) };
check("an oversized nested string is rejected", !PT.validateImport(JSON.stringify(longNote)).ok);
const many = JSON.parse(JSON.stringify(good));
many.bundle.state.cards = {};
for (let i = 0; i < 801; i++) many.bundle.state.cards["c" + i] = { seen: true };
check("more than 800 cards are rejected", !PT.validateImport(JSON.stringify(many)).ok);
const existing = JSON.parse(JSON.stringify(good));
existing.bundle.state.cards["sc-w1-01"] = {
  id: "sc-w1-01", intervalIdx: 2, due: "2026-11-25", seen: true, reviews: 1,
  remembers: 1, lastResult: "right", openOk: true, lastReviewDate: "2026-11-23",
  errors: 0, stubborn: false, stubIdx: 0, consecRight: 1, mastered: false,
  priority: false, relearn: null, fromClub: 1
};
existing.bundle.state.club = { episodes: { "1": { finished: true, finishedAt: "2026-11-23", coverLearnDates: ["2026-11-23", "2026-11-24"] } } };
check("a current card and episode bundle still passes", PT.validateImport(JSON.stringify(existing)).ok);
const view = PT.preview(ok.data, "firebase", "fb-user");
check("preview shows different backend scope", view.cards === 1 && view.sameScope === false && view.sourceBackend === "cloudbase");
const exported = PT.buildExport(good.bundle, { backend: "local", uid: "" });
check("export round-trip keeps the card and has no token field", exported.includes("sc-w1-01") && !/token|password|apiKey/i.test(exported));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const boot = html.slice(html.indexOf("function bootAuth"), html.indexOf("bootAuth();"));
check("Pages boot returns before CloudBase bootstrap", boot.indexOf("HostBackend.select()===\"firebase\"") !== -1 && boot.indexOf("HostBackend.select()===\"firebase\"") < boot.indexOf("cloudApi().bootstrap()"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("all in-memory transfer checks passed; not a live cloud result");
