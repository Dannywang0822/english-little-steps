/**
 * Emulator-only attacker checks for the English progress rules.
 * Uses project id demo-els. Does not deploy and does not touch english-subject-ket.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const modules = process.env.FBTEST_MODULES || "/tmp/fbtest/node_modules";
const rulesTesting = await import(pathToFileURL(path.join(modules, "@firebase/rules-unit-testing/dist/esm/index.esm.js")).href);
const firestore = await import(pathToFileURL(path.join(modules, "firebase/firestore/dist/index.mjs")).href);
const { initializeTestEnvironment, assertFails, assertSucceeds } = rulesTesting;
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = firestore;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = fs.readFileSync(path.join(root, "firebase/emulator/english-little-steps.rules.test"), "utf8");
const failures = [];
function check(name, cond) {
  if (cond) console.log("ok", name);
  else {
    failures.push(name);
    console.error("FAIL", name);
  }
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

const env = await initializeTestEnvironment({
  projectId: "demo-els",
  firestore: { rules: rules, host: "127.0.0.1", port: 8080 }
});

const owner = env.authenticatedContext("owner-a").firestore();
const other = env.authenticatedContext("owner-b").firestore();
const anon = env.unauthenticatedContext().firestore();
const ref = (db, uid) => doc(db, "englishLittleSteps", uid);

await assertFails(getDoc(ref(anon, "owner-a")));
check("anonymous read is denied", true);
await assertFails(setDoc(ref(anon, "owner-a"), good("owner-a")));
check("anonymous create is denied", true);
await assertFails(getDoc(ref(other, "owner-a")));
check("another uid cannot read", true);
await assertFails(setDoc(ref(other, "owner-a"), good("owner-a")));
check("another uid cannot write this document", true);
await assertSucceeds(setDoc(ref(owner, "owner-a"), good("owner-a")));
check("owner create succeeds", true);
await assertFails(setDoc(ref(owner, "owner-a"), Object.assign(good("owner-b"), { uid: "owner-b" })));
check("owner cannot create a document whose uid is someone else", true);
const stolen = good("owner-a");
stolen.uid = "owner-b";
await assertFails(updateDoc(ref(owner, "owner-a"), stolen));
check("owner cannot update uid", true);
await assertFails(updateDoc(ref(owner, "owner-a"), { schemaVersion: 2 }));
check("owner cannot change schemaVersion", true);
const extra = good("owner-a");
extra.password = "nope";
await assertFails(setDoc(ref(owner, "owner-a"), extra));
check("a password field is denied", true);
const bulky = good("owner-a");
bulky.logs = new Array(121).fill("x");
await assertFails(setDoc(ref(owner, "owner-a"), bulky));
check("too many log rows are denied", true);
await assertSucceeds(updateDoc(ref(owner, "owner-a"), { updatedAtMs: Date.now() }));
check("owner can update the timestamp", true);
await assertFails(deleteDoc(ref(owner, "owner-a")));
check("delete is denied and the document remains", true);
const still = await getDoc(ref(owner, "owner-a"));
check("owner can still read after rejected writes", still.exists() && still.data().uid === "owner-a");

await env.cleanup();
if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("firestore emulator attacker checks passed for demo-els only");
