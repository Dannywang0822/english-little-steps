/**
 * Emulator-only checks. Project ids are demo-els-published and demo-els-candidate.
 * Does not deploy and does not touch english-subject-ket.
 *
 * The published rules are the extracted rules body. The candidate must keep the
 * /users/{userId} match and its four subcollections byte-identical, then add
 * the English bundle match.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const modules = process.env.FBTEST_MODULES || "/tmp/fbtest/node_modules";
const rulesTesting = await import(pathToFileURL(path.join(modules, "@firebase/rules-unit-testing/dist/esm/index.esm.js")).href);
const firestore = await import(pathToFileURL(path.join(modules, "firebase/firestore/dist/index.mjs")).href);
const { initializeTestEnvironment } = rulesTesting;
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = firestore;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(name, cond) {
  if (cond) console.log("ok", name);
  else {
    failures.push(name);
    console.error("FAIL", name);
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function usersBlock(text) {
  const start = text.indexOf("    match /users/{userId} {");
  const end = text.indexOf("\n    }\n", start);
  if (start < 0 || end < 0) return "";
  return text.slice(start, end + "\n    }".length);
}

function buildCandidate(published, fragment) {
  const marker = "    }\n  }\n}";
  const idx = published.indexOf(marker);
  if (idx < 0 || published.indexOf(marker, idx + 1) !== -1) return "";
  const indented = fragment.replace(/\s+$/, "").split("\n").map((line) => (line.length ? "    " + line : "")).join("\n");
  return published.slice(0, idx + "    }\n".length) + "\n" + indented + "\n" + published.slice(idx + "    }\n".length);
}

const published = fs.readFileSync(path.join(root, "firebase/published/firestore.rules"), "utf8");
const fragment = fs.readFileSync(path.join(root, "firebase/english-little-steps.rules.fragment"), "utf8");
const candidate = fs.readFileSync(path.join(root, "firebase/candidate/firestore.rules"), "utf8");
const publishedHash = sha256(published);
const candidateHash = sha256(candidate);
const usersHash = sha256(usersBlock(published));

console.log("published sha256", publishedHash);
console.log("candidate sha256", candidateHash);
console.log("users block sha256", usersHash);

check("published rules hash is the extracted source", publishedHash === "aa4e80e9af51647b4ab5bd4e7fb168dadfb26cc364dc85e33e2f63b60dca7ea7");
check("candidate hash matches this additive build", candidateHash === "db5c76a08b648b02dbd978d5012061e6a7818c3397ea76af65edcab715a2c4f0");
check("candidate is the published rules plus the fragment", buildCandidate(published, fragment) === candidate);
check("users match and four subcollections are byte-identical", usersBlock(published) === usersBlock(candidate) && usersHash === "05338d1a2df2961753f0db01c6da72f18b009dac68587b61ee136aac1b274113");
check("candidate does not add a catch-all", !candidate.includes("document=**"));

const userPaths = [
  ["users", "owner-a"],
  ["users", "owner-a", "meta", "m1"],
  ["users", "owner-a", "cards", "c1"],
  ["users", "owner-a", "logs", "l1"],
  ["users", "owner-a", "sentences", "s1"]
];

async function allowed(op) {
  try {
    await op;
    return true;
  } catch (err) {
    if (err && err.code === "permission-denied") return false;
    throw err;
  }
}

async function matrix(env) {
  const owner = env.authenticatedContext("owner-a").firestore();
  const other = env.authenticatedContext("owner-b").firestore();
  const anon = env.unauthenticatedContext().firestore();
  const out = {};
  for (const parts of userPaths) {
    const key = parts.join("/");
    const sample = { kept: true };
    out[key] = {
      anonRead: await allowed(getDoc(doc(anon, ...parts))),
      anonWrite: await allowed(setDoc(doc(anon, ...parts), sample)),
      otherRead: await allowed(getDoc(doc(other, ...parts))),
      otherWrite: await allowed(setDoc(doc(other, ...parts), sample)),
      ownerCreate: await allowed(setDoc(doc(owner, ...parts), sample)),
      ownerRead: await allowed(getDoc(doc(owner, ...parts))),
      ownerUpdate: await allowed(updateDoc(doc(owner, ...parts), { kept: false })),
      ownerDelete: await allowed(deleteDoc(doc(owner, ...parts)))
    };
  }
  out.cross = {
    ownerReadOther: await allowed(getDoc(doc(owner, "users", "owner-b"))),
    ownerWriteOtherMeta: await allowed(setDoc(doc(owner, "users", "owner-b", "meta", "m1"), { kept: true })),
    ownerWriteOtherCard: await allowed(setDoc(doc(owner, "users", "owner-b", "cards", "c1"), { kept: true })),
    ownerWriteOtherLog: await allowed(setDoc(doc(owner, "users", "owner-b", "logs", "l1"), { kept: true })),
    ownerWriteOtherSentence: await allowed(setDoc(doc(owner, "users", "owner-b", "sentences", "s1"), { kept: true }))
  };
  return out;
}

function ownerOnly(rows) {
  for (const parts of userPaths) {
    const row = rows[parts.join("/")];
    if (!row) return false;
    if (row.anonRead || row.anonWrite || row.otherRead || row.otherWrite) return false;
    if (!(row.ownerCreate && row.ownerRead && row.ownerUpdate && row.ownerDelete)) return false;
  }
  const cross = rows.cross;
  return cross && !cross.ownerReadOther && !cross.ownerWriteOtherMeta && !cross.ownerWriteOtherCard && !cross.ownerWriteOtherLog && !cross.ownerWriteOtherSentence;
}

function good(uid) {
  return {
    schemaVersion: 1,
    app: "english-little-steps",
    uid: uid,
    state: { cards: { "sc-w1-01": { seen: true } } },
    logs: [],
    tts: {},
    updatedAtMs: Date.now()
  };
}

const host = "127.0.0.1";
const port = 8080;
const publishedEnv = await initializeTestEnvironment({
  projectId: "demo-els-published",
  firestore: { rules: published, host, port }
});
const publishedRows = await matrix(publishedEnv);
const publishedEnglish = publishedEnv.authenticatedContext("owner-a").firestore();
const publishedEnglishWrite = await allowed(setDoc(doc(publishedEnglish, "englishLittleSteps", "owner-a"), good("owner-a")));
check("published rules let the owner create, read, update, and delete users/meta/cards/logs/sentences", ownerOnly(publishedRows));
if (!ownerOnly(publishedRows)) console.error(JSON.stringify(publishedRows, null, 2));
check("published rules do not allow the English path", publishedEnglishWrite === false);

const env = await initializeTestEnvironment({
  projectId: "demo-els-candidate",
  firestore: { rules: candidate, host, port }
});
const candidateRows = await matrix(env);
check("candidate users CRUD matches the published rules", JSON.stringify(candidateRows) === JSON.stringify(publishedRows));
check("candidate still lets only the owner change users/meta/cards/logs/sentences", ownerOnly(candidateRows));

const owner = env.authenticatedContext("owner-a").firestore();
const other = env.authenticatedContext("owner-b").firestore();
const anon = env.unauthenticatedContext().firestore();
const ref = (db, uid) => doc(db, "englishLittleSteps", uid);

check("owner create succeeds", await allowed(setDoc(ref(owner, "owner-a"), good("owner-a"))));
check("anonymous read is denied", !(await allowed(getDoc(ref(anon, "owner-a")))));
check("anonymous create is denied", !(await allowed(setDoc(ref(anon, "owner-b"), good("owner-b")))));
check("another uid cannot read", !(await allowed(getDoc(ref(other, "owner-a")))));
check("another uid cannot write this document", !(await allowed(setDoc(ref(other, "owner-a"), good("owner-a")))));
check("owner cannot create a document whose uid is someone else", !(await allowed(setDoc(ref(owner, "owner-b"), good("owner-b")))));
const stolen = good("owner-a");
stolen.uid = "owner-b";
check("owner cannot update uid", !(await allowed(updateDoc(ref(owner, "owner-a"), stolen))));
check("owner cannot change schemaVersion", !(await allowed(updateDoc(ref(owner, "owner-a"), { schemaVersion: 2 }))));
const extra = good("owner-a");
extra.password = "nope";
check("a password field is denied", !(await allowed(setDoc(ref(owner, "owner-a"), extra))));
const bulky = good("owner-a");
bulky.logs = new Array(121).fill("x");
check("too many log rows are denied", !(await allowed(setDoc(ref(owner, "owner-a"), bulky))));
check("owner can update the timestamp", await allowed(updateDoc(ref(owner, "owner-a"), { updatedAtMs: Date.now() })));
const badDate = good("owner-a");
badDate.state = { lastActiveDate: "not-a-date" };
check("a malformed date update is denied", !(await allowed(updateDoc(ref(owner, "owner-a"), badDate))));
const badStreak = good("owner-a");
badStreak.state = { streak: -1 };
check("a negative streak is denied", !(await allowed(setDoc(ref(owner, "owner-a"), badStreak))));
const many = good("owner-a");
many.state = { cards: {} };
for (let i = 0; i < 801; i++) many.state.cards["c" + i] = { seen: true };
check("more than 800 cards are denied", !(await allowed(setDoc(ref(owner, "owner-a"), many))));
const kept = await getDoc(ref(owner, "owner-a"));
check("rejected nested writes leave the original bundle", kept.exists() && kept.data().state.cards["sc-w1-01"].seen === true);
const loose = good("owner-a");
loose.state = { cards: { x: "not-a-card" }, lastActiveDate: "2026-02-31" };
check("rules still cannot type each card or reject an impossible calendar date", await allowed(setDoc(ref(owner, "owner-a"), loose)));
const shaped = good("owner-a");
shaped.state = {
  topicId: "school",
  cards: { "sc-w1-01": { seen: true, intervalIdx: 2, due: "2026-11-25" } },
  streak: 3,
  lastActiveDate: "2026-11-23",
  sentences: [],
  club: { episodes: { "1": { finished: true, finishedAt: "2026-11-23" } } }
};
check("a current progress shape is still accepted", await allowed(setDoc(ref(owner, "owner-a"), shaped)));
check("delete is denied and the document remains", !(await allowed(deleteDoc(ref(owner, "owner-a")))));
const still = await getDoc(ref(owner, "owner-a"));
check("owner can still read after rejected writes", still.exists() && still.data().uid === "owner-a");

await publishedEnv.cleanup();
await env.cleanup();
if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("firestore emulator checks passed for demo projects only");
