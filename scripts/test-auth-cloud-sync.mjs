/**
 * Mocked CloudBase auth and sync checks. No network, no email, no OTP.
 * These mocks are not the live gateway.
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

const sandbox = {
  console: { warn() {}, log() {} },
  document: {
    createElement() { return { async: true }; },
    head: { appendChild() {} }
  },
  Promise,
  setTimeout,
  clearTimeout,
  Date,
  Object,
  Array,
  String,
  Error
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "js/cloud-sync.js"), "utf8"), sandbox, { filename: "js/cloud-sync.js" });
const K = sandbox.window.KetCloud;

const logs = [];
sandbox.console.warn = function () {
  logs.push(Array.prototype.join.call(arguments, " "));
};

const calls = [];
K.enabled = true;
K._auth = {
  getVerification(body) {
    calls.push({ op: "getVerification", body: body });
    return Promise.resolve({ data: { verification_id: "vid-1", is_user: false } });
  },
  verify(body) {
    calls.push({ op: "verify", body: body });
    return Promise.resolve({ data: { verification_token: "tok-1" } });
  },
  signUp(body) {
    calls.push({ op: "signUp", body: body });
    return Promise.resolve({ data: { user: { uid: "user-a", email: body.email } } });
  },
  signInWithPassword(body) {
    calls.push({ op: "signInWithPassword", body: body });
    return Promise.resolve({ data: { user: { uid: "user-b", email: body.email } } });
  },
  getSession() {
    return Promise.resolve({ data: { session: { user: { uid: "user-a", email: "a@example.com" } } } });
  },
  signOut() { return Promise.resolve({}); }
};

const email = "learner+tag@example.com";
const password = "correct7horse";
await K.sendRegisterCode(email);
check("send uses email, usage email, and target ANY", calls[0].op === "getVerification" && calls[0].body.email === email && calls[0].body.usage === "email" && calls[0].body.target === "ANY");
check("send does not log the address", !logs.some((line) => line.includes(email) || line.includes("learner+tag")));

await K.register(email, password, "123456");
const verify = calls.find((c) => c.op === "verify");
const signup = calls.find((c) => c.op === "signUp");
check("verify uses the stored verification id, not a logged code", verify && verify.body.verification_id === "vid-1" && verify.body.verification_code === "123456" && !logs.some((line) => line.includes("123456")));
check("signup stays on the same email", signup && signup.body.email === email && signup.body.verification_token === "tok-1");

const store = {};
K._db = {
  collection() {
    return {
      doc(id) {
        return {
          get() { return Promise.resolve({ data: store[id] || null }); },
          set(payload) { store[id] = JSON.parse(JSON.stringify(payload)); return Promise.resolve(); }
        };
      }
    };
  }
};

function bundle(cards, sentence) {
  return {
    state: {
      cards: cards,
      sentences: sentence ? [{ topicId: "school", chunkId: "sch-01", text: sentence }] : [],
      checkins: {},
      daily: {}
    },
    logs: [],
    tts: null,
    updatedAt: 1
  };
}

let applied = null;
K.user = { uid: "user-a", email: email };
K.mode = "cloud";
K._hooks.getLocalBundle = function () { return bundle({ "sc-w1-01": { seen: true, intervalIdx: 4, due: "2026-12-01" } }, "local sentence"); };
K._hooks.confirmImport = function () { return false; };
K._hooks.applyMerged = function (b) { applied = b; };
await K.syncAfterLogin();
check("declining import does not write local progress into an empty cloud", !store["user-a"] || !store["user-a"].state);

store["user-a"] = {
  state: { cards: { "sc-w2-01": { seen: true, intervalIdx: 2, due: "2026-09-01" } }, sentences: [], checkins: {}, daily: {} },
  logs: [],
  tts: null,
  updatedAtMs: 5
};
applied = null;
await K.syncAfterLogin();
check(
  "declining a merge does not replace cloud cards with local cards",
  store["user-a"].state.cards["sc-w2-01"] && !store["user-a"].state.cards["sc-w1-01"]
);
check("declining a merge applies the cloud cards, not the local ones", applied && applied.state.cards["sc-w2-01"] && !applied.state.cards["sc-w1-01"]);

K.user = { uid: "user-b", email: "other@example.com" };
K._hooks.getLocalBundle = function () { return bundle({ "sc-w3-01": { seen: true, intervalIdx: 1, due: "2026-08-01" } }); };
K._hooks.confirmImport = function () { return true; };
await K.syncAfterLogin();
check("a second account does not read the first account bundle", store["user-b"] && store["user-b"].state.cards["sc-w3-01"] && !store["user-b"].state.cards["sc-w2-01"]);
check("the first account still does not contain the second account's card", store["user-a"].state.cards["sc-w2-01"] && !store["user-a"].state.cards["sc-w3-01"]);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
check("login page does not disable CloudBase on GitHub Pages", !html.includes("applyPagesMirrorGate") && !/if\(isPagesMirror\(\)\)/.test(html));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("all mocked auth checks passed", "failures", 0);
