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

const host = load("js/host-backend.js", { location: { hostname: "dannywang0822.github.io", pathname: "/", search: "" } });
check("Pages host selects Firebase", host.HostBackend.select() === "firebase");
check("Pages host selector ignores a CloudBase hostname argument", host.HostBackend.select("english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com") === "cloudbase");
check("CloudBase hostname stays CloudBase", host.HostBackend.select("english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com") === "cloudbase");
check("portal IP selects portal", host.HostBackend.select("43.142.236.188", "/") === "portal");
check("dannywang.cloud selects portal", host.HostBackend.select("els.dannywang.cloud", "/") === "portal");
check("app path selects portal off Pages", host.HostBackend.select("43.142.236.188", "/apps/english-little-steps/") === "portal");
check("Pages stays Firebase on the app path", host.HostBackend.select("dannywang0822.github.io", "/apps/english-little-steps/") === "firebase");
check("portal login path stays same-origin", host.HostBackend.portalLoginPath() === "/login");
const flagged = load("js/host-backend.js", {
  location: { hostname: "127.0.0.1", pathname: "/", search: "" },
  __ELS_PORTAL__: true
});
check("portal flag selects portal off Pages", flagged.HostBackend.select() === "portal");
check("portal flag does not move Pages off Firebase", load("js/host-backend.js", {
  location: { hostname: "dannywang0822.github.io", pathname: "/", search: "?portal=1" },
  __ELS_PORTAL__: true
}).HostBackend.select() === "firebase");
const queried = load("js/host-backend.js", { location: { hostname: "127.0.0.1", pathname: "/", search: "?portal=1" } });
check("portal query selects portal off Pages", queried.HostBackend.select() === "portal");

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

const cfgText = fs.readFileSync(path.join(root, "firebase-config.js"), "utf8");
check("public config has no service-account fields", !/private_key|client_email|BEGIN PRIVATE/.test(cfgText));
const cfg = load("firebase-config.js");
const web = cfg.__FIREBASE_CONFIG__;
check("public config is the English web app", web && web.projectId === "english-subject-ket" && web.appId === "1:1097055286825:web:48491debc167064026ce38");
check("public config keeps the CLI storage bucket", web && web.storageBucket === "english-subject-ket.firebasestorage.app");
check("public config has the six web fields and no invented database URL", web && ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"].every((key) => typeof web[key] === "string" && web[key].length > 0) && web.databaseURL == null && web.measurementId == null);
const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
check("firebase-config.js is tracked and service accounts stay ignored", !/^firebase-config\.js$/m.test(ignore) && /^serviceAccount\*\.json$/m.test(ignore));
const pages = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
check("Pages workflow still uploads the git tree and has no secret injection", pages.includes("path: .") && !/secrets\./.test(pages));
const adapter = fs.readFileSync(path.join(root, "js/firebase-progress.js"), "utf8");
check("adapter accepts only the English web app id", adapter.includes("1:1097055286825:web:48491debc167064026ce38") && adapter.includes('c.projectId === "english-subject-ket"'));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const boot = html.slice(html.indexOf("function bootAuth"), html.indexOf("bootAuth();"));
check("Pages boot returns before CloudBase bootstrap", boot.indexOf("HostBackend.select()===\"firebase\"") !== -1 && boot.indexOf("HostBackend.select()===\"firebase\"") < boot.indexOf("cloudApi().bootstrap()"));
check("portal boot returns before CloudBase bootstrap", boot.indexOf("HostBackend.select()===\"portal\"") !== -1 && boot.indexOf("HostBackend.select()===\"portal\"") < boot.indexOf("cloudApi().bootstrap()"));
check("portal page removes CloudBase login copy", html.includes('["tab-login","tab-register","pane-login","pane-register"]') && boot.includes("preparePortalChrome()"));
check("optional practice is not a check-in row", html.includes('id="ai-practice"') && !html.includes('data-step="ai"'));

const portalExport = JSON.parse(PT.buildExport(good.bundle, { backend: "portal", uid: "acct_1" }));
check("portal progress file names its own backend", portalExport.source.backend === "portal" && PT.validateImport(JSON.stringify(portalExport)).ok);

function portalResponse(status, body, type) {
  return {
    status: status,
    ok: status >= 200 && status < 300,
    headers: { get: function (name) { return String(name).toLowerCase() === "content-type" ? (type == null ? "application/json" : type) : ""; } },
    json: function () { return Promise.resolve(body); }
  };
}
function bootPortal(handler, hostname) {
  const box = load("js/host-backend.js", {
    location: { hostname: hostname || "43.142.236.188", pathname: "/apps/english-little-steps/", search: "" },
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: function (url, opts) { return Promise.resolve(handler(url, opts)); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "js/portal-progress.js"), "utf8"), box, { filename: "js/portal-progress.js" });
  return box;
}
const missing = bootPortal(function () { return portalResponse(404, "<html>", "text/html"); });
await missing.PortalProgress.bootstrap();
check("HTML 404 does not pretend there is a portal account", missing.PortalProgress.enabled === false && missing.PortalProgress.user == null);
const denied = bootPortal(function () { return portalResponse(401, { error: "no" }); });
await denied.PortalProgress.bootstrap();
check("401 leaves the portal logged out", denied.PortalProgress.enabled === false && /门户/.test(denied.PortalProgress.lastError || ""));
let putBody = null;
let putCred = "";
const signedIn = bootPortal(function (url, opts) {
  if (opts.method === "PUT") {
    putBody = JSON.parse(opts.body);
    putCred = opts.credentials;
    return portalResponse(200, {});
  }
  return portalResponse(200, {
    state: { topicId: "school", cards: { "sch-01": { seen: true, intervalIdx: 0, due: "2026-11-28" } }, sentences: [], checkins: {} },
    logs: [],
    tts: { slow: false },
    updatedAtMs: 9,
    uid: "parent-1"
  });
});
check("signed-in bootstrap uses the portal", await signedIn.PortalProgress.bootstrap() === true && signedIn.PortalProgress.currentUser().uid === "parent-1");
signedIn.PortalProgress.configureHooks({
  getLocalBundle: function () {
    return { state: { topicId: "school", cards: { "sch-01": { seen: true } }, sentences: [], checkins: {} }, logs: [], tts: null };
  }
});
await signedIn.PortalProgress.syncAfterLogin();
await signedIn.PortalProgress.flush();
check("portal save sends the bundle with the cookie and no password", putCred === "include" && putBody && putBody.state.cards["sch-01"].seen === true && putBody.updatedAtMs && !("password" in putBody) && !("email" in putBody));
const pagesPortal = bootPortal(function () { throw new Error("Pages must not call the portal"); }, "dannywang0822.github.io");
check("Pages bootstrap does not call the portal", await pagesPortal.PortalProgress.bootstrap() === false && pagesPortal.PortalProgress.enabled === false);
check("portal login is not a second account form", await signedIn.PortalProgress.login().then(function () { return false; }, function (err) { return /验证码|门户/.test(err.message); }));

const practiceBox = load("js/portal-practice.js");
const practice = practiceBox.PortalPractice;
check("practice closes after 10 turns", practice.allows({ startedAt: 1000, turns: 10, messages: [] }, 1000).ok === false);
check("practice closes after 8 minutes", practice.allows({ startedAt: 0, turns: 1, messages: [] }, 8 * 60 * 1000).ok === false);
const seenOnly = practice.learnedChunks(
  { cards: { a: { seen: true, updatedAt: 2 }, b: { seen: false, updatedAt: 9 } } },
  [{ chunks: [{ id: "a", lemma: "get up", gloss: "起床" }, { id: "b", lemma: "password", gloss: "no" }] }],
  null
);
check("practice context keeps seen chunks only", seenOnly.length === 1 && seenOnly[0].lemma === "get up");
const history = [];
for (let i = 0; i < 8; i++) history.push({ role: i % 2 ? "assistant" : "user", content: "turn " + i });
const built = practice.buildRequest({ messages: history }, "I get up at seven.", { mode: "scenario", scenario: { n: 1, titleEn: "The Message on the Board", titleZh: "黑板上的留言" }, chunks: [] });
check("chat body keeps the system prompt and a short tail", built.messages.length === 6 && built.messages[0].role === "system" && built.messages[5].content === "I get up at seven.");
check("scenario prompt recasts with you", built.messages[0].content.indexOf("Recast with you, not I.") !== -1 && built.practice.mode === "scenario");
check("practice characters stay on the course list", practice.CHARACTERS.join(",") === "Leo,Mia,Jay,Alex,Sam,Ms. Reed" && built.practice.characters.indexOf("Ben") === -1);
check("client files do not carry cloud secrets", !/tokenhub|private_key|secretId|secretKey|BEGIN PRIVATE/i.test(
  fs.readFileSync(path.join(root, "js/portal-progress.js"), "utf8") + fs.readFileSync(path.join(root, "js/portal-practice.js"), "utf8")
));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("all in-memory transfer checks passed; not a live cloud result");
