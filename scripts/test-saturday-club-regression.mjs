/**
 * Saturday Club regression for the episodes 2–5 content merge.
 * Local test only: docs/cloudbase-hosting-deploy.sh does not copy scripts/.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    console.log("ok", name);
    return;
  }
  failures.push(name + (detail ? " — " + detail : ""));
  console.error("FAIL", name, detail || "");
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function tokens(sentence) {
  return String(sentence).match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || [];
}

function tally(list) {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

function sameTally(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

const EP_HASH = {
  2: "29484232d9fd88d5e09f1b5034fa7cd8ddfb9960d5925cdbf6ac627304c9b7a3",
  3: "d0b54a024872680e2b47ff160f83bb3328df6abcb48d1b67d7bc08a16bb2b10f",
  4: "4d4f002369f4da8a77fb1a8fda3c67b2cbed1a2c79be6b7bd09404fb56e60566",
  5: "4497c1bae0daad0f97fd585dec1c89f01ccf0942e095a6136557934b8c002959"
};
const EP_6_30_HASH = "95a2e9073face713e86f87e9889eb0da4e54a1216222fdaad5b77d1a6bded40f";
const PRIOR_RECYCLED_IDS = ["fam-02","fam-03","sch-02","sch-09","sch-06","sch-11","sch-01","sch-10","fam-12","fam-15","phone","sch-15","sch-16","food-17","sc-w1-02","sc-w1-08","sc-w1-09","fam-05","sc-w1-06","sc-w2-06","sch-13","food-08","sc-w2-01","sc-w3-01","sc-w3-03","food-09","food-12","food-20","sc-w4-05"];
const PRIOR_RECYCLED_HASH = "6288163f9586e94b432f53a80cee26c259dbdcd1f9ecb8ff67710fdabf79efb8";
const PRIOR_CHARACTER_HASH = "8087b0a70540072de1d803d3b4d5a381ab7c578a9982f225ebf9f89f4b6bdaee";

const now = JSON.parse(read("data/saturday-club.json"));
const base = JSON.parse(
  spawnSync("git", ["show", "origin/main:data/saturday-club.json"], { cwd: root, encoding: "utf8" }).stdout
);

check("episode 1 content matches default branch", JSON.stringify(now.episodes["1"]) === JSON.stringify(base.episodes["1"]));
check("slots stay 30", now.slots === 30);
check(
  "all 30 episode slots have story content",
  JSON.stringify(Object.keys(now.episodes).map(Number).sort((a, b) => a - b)) === JSON.stringify(Array.from({ length: 30 }, (_, i) => i + 1))
);
check("content package flag is not the master document", now.contentOnly !== true);

for (const old of base.recycled) {
  const found = now.recycled.filter((r) => r.id === old.id);
  check("existing recycled id preserved " + old.id, found.length === 1 && JSON.stringify(found[0]) === JSON.stringify(old));
}
check("recycled ids are unique", new Set(now.recycled.map((r) => r.id)).size === now.recycled.length);
check(
  "recycled entries from episodes 1–5 were not replaced",
  sha256(JSON.stringify(PRIOR_RECYCLED_IDS.map((id) => now.recycled.find((r) => r.id === id)))) === PRIOR_RECYCLED_HASH
);
const bannedSurfaces = ["beded", "brothered", "friended", "librarys", "homeworked", "musiced", "likeed", "fathered", "mothered", "booked"];
const surfaces = now.recycled.flatMap((r) => r.surface || []);
check("invented derived forms are not in the lookup pool", bannedSurfaces.every((s) => !surfaces.includes(s)));
check("sch-11 keeps the existing surface order", JSON.stringify(now.recycled.find((r) => r.id === "sch-11").surface) === JSON.stringify(["books", "book"]));

for (const old of base.characters) {
  const found = now.characters.filter((c) => c.name === old.name);
  check("existing character preserved " + old.name, found.length === 1 && JSON.stringify(found[0]) === JSON.stringify(old));
}
check(
  "Leo through Ben are unchanged",
  sha256(JSON.stringify(now.characters.slice(0, 5))) === PRIOR_CHARACTER_HASH
);
check("Alex merged once", now.characters.filter((c) => c.name === "Alex").length === 1);
check("Ben merged once", now.characters.filter((c) => c.name === "Ben").length === 1);
check(
  "Alex blurb is the approved text",
  now.characters.find((c) => c.name === "Alex").blurbEn === "a student at the same school" &&
    now.characters.find((c) => c.name === "Alex").blurbZh === "同校的学生"
);
check(
  "Ben is one episode-four character",
  now.characters.find((c) => c.name === "Ben").blurbEn === "a student in episode four" &&
    now.characters.find((c) => c.name === "Ben").blurbZh === "第四篇出现的同学"
);
const reed = now.characters.find((c) => c.name === "Ms. Reed");
const sam = now.characters.find((c) => c.name === "Sam");
check("Sam merged once", now.characters.filter((c) => c.name === "Sam").length === 1 && sam.blurbEn === "a new friend who likes trains");
check(
  "Ms. Reed cover blurb does not spoil the hat",
  now.characters.filter((c) => c.name === "Ms. Reed").length === 1 &&
    reed.blurbEn === "a teacher at school" &&
    reed.blurbZh === "学校老师" &&
    !/hat|cap|蓝帽|帽子|留言/.test(reed.blurbEn + reed.blurbZh)
);

for (const n of [2, 3, 4, 5]) {
  const ep = now.episodes[String(n)];
  check(
    "episode " + n + " approved payload",
    sha256(JSON.stringify(ep)) === EP_HASH[n],
    sha256(JSON.stringify(ep))
  );
  check(
    "episode " + n + " has 6 new chunks and 0 PET",
    ep.newChunkCount === 6 && ep.chunks.length === 6 && Array.isArray(ep.petPreview) && ep.petPreview.length === 0
  );
  check("episode " + n + " has 6 scenes and 3 questions", ep.scenes.length === 6 && ep.questions.length === 3);
  const ids = ep.chunks.map((c) => c.id);
  check("episode " + n + " chunk ids", JSON.stringify(ids) === JSON.stringify(ids.map((_, i) => "sc-w" + n + "-0" + (i + 1))));
  for (const item of ep.practice || []) {
    const need = tokens(item.target);
    const have = item.wordBank || [];
    check(
      "episode " + n + " " + item.id + " practice tokens cover the target, including repeats",
      need.length > 0 && have.length === need.length && sameTally(tally(need), tally(have)),
      item.target + " bank=" + JSON.stringify(have)
    );
  }
}

const laterParts = [];
for (let n = 6; n <= 30; n++) {
  const ep = now.episodes[String(n)];
  laterParts.push(JSON.stringify(ep));
  check(
    "episode " + n + " has 6 chunks, 6 scenes, 3 questions, 6 optional sentences, 0 PET",
    ep && ep.newChunkCount === 6 && ep.chunks.length === 6 && ep.scenes.length === 6 &&
      ep.questions.length === 3 && ep.practice.length === 6 && Array.isArray(ep.petPreview) && ep.petPreview.length === 0
  );
  for (const item of ep.practice) {
    const need = tokens(item.target);
    const have = item.wordBank || [];
    check(
      "episode " + n + " " + item.id + " practice tokens cover the target, including repeats",
      need.length > 0 && have.length === need.length && sameTally(tally(need), tally(have)),
      item.target
    );
  }
}
check("episodes 6–30 match the approved payload", sha256(laterParts.join("\n")) === EP_6_30_HASH);
check("episode 3 title is The First Job", now.episodes["3"].titleEn === "The First Job" && now.episodes["3"].titleZh === "第一次任务");
check("episode 6 title is The Photo", now.episodes["6"].titleEn === "The Photo" && now.episodes["6"].titleZh === "那张照片");
check("episode 30 title is See You Soon", now.episodes["30"].titleEn === "See You Soon" && now.episodes["30"].titleZh === "再见");
check("episode 2 opening sentence", now.episodes["2"].scenes[0].sentences[0].en === "It is the next Saturday morning.");
check("episode 2 opening translation", now.episodes["2"].scenes[0].sentences[0].zh === "这是下一个星期六的早晨。");
check(
  "episode 5 closing sentence",
  now.episodes["5"].scenes[5].sentences[4].en === '"We need a real photo of our club," she says.'
);

const jsText = read("js/saturday-club-data.js");
const dataJs = vm.runInNewContext(jsText + "\nwindow.__SATURDAY_CLUB__;", { window: {} });
check("embedded JS data matches data/saturday-club.json", JSON.stringify(dataJs) === JSON.stringify(now));

const jsFiles = fs.readdirSync(path.join(root, "js")).filter((name) => name.endsWith(".js"));
for (const name of jsFiles) {
  const res = spawnSync(process.execPath, ["--check", path.join(root, "js", name)], { encoding: "utf8" });
  check("node --check js/" + name, res.status === 0, (res.stderr || "").trim());
}

const html = read("index.html");
const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let sm;
let inlineN = 0;
while ((sm = scriptRe.exec(html))) {
  if (/\ssrc\s*=/.test(sm[1] || "")) continue;
  inlineN++;
  const file = path.join("/tmp", "els-inline-" + inlineN + ".js");
  fs.writeFileSync(file, sm[2]);
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  check("node --check index inline script " + inlineN, res.status === 0, (res.stderr || "").slice(0, 400));
}
check("index has inline scripts", inlineN >= 2);

check("JSON master parses", !!now.version);
check("review pause stays above 24 minutes", /var REVIEW_STOP_MIN = 24;/.test(html));
check("daily cap stays 40 minutes", /var DAILY_CAP_MIN = 40;/.test(html));
check("per-topic new cap stays 12", /var NEW_CAP = 12;/.test(html) && /var NEW_CAP_SHARED = false;/.test(html));
const steps = [...html.matchAll(/data-step="([^"]+)"/g)].map((m) => m[1]);
check("four check-in rows only", JSON.stringify(steps) === JSON.stringify(["review", "learn", "practice", "wrap"]));
check("Pages client no longer refuses CloudBase login", !html.includes("applyPagesMirrorGate") && !/if\(isPagesMirror\(\)\)/.test(html));
check("practice bank is shuffled and keeps the array", html.includes("SaturdayClub.shuffleWordBank(ch.wordBank||[])"));

const startLearn = html.slice(html.indexOf("function startLearn()"), html.indexOf("function renderLearnSwipe"));
check(
  "review overload pauses new learning before a story replaces topic cards",
  startLearn.indexOf("if(newBlocked())") !== -1 &&
    startLearn.indexOf("if(newBlocked())") < startLearn.indexOf("storyMode") &&
    startLearn.indexOf("storyMode") < startLearn.indexOf("availableNew()")
);
check(
  "story day substitutes new learning and other days keep the topic path",
  /if\(mode && mode\.type==="read"\)/.test(html) &&
    /if\(mode && mode\.type==="recap"\)/.test(html) &&
    html.includes("新学 \"+n+\"/\"+cap")
);

const clubSrc = read("js/saturday-club.js");
const finishSrc = clubSrc.slice(clubSrc.indexOf("function markEpisodeFinished"), clubSrc.indexOf("function preferPracticeChunks"));
check("finishing a story does not read question or retell answers", !/answers|retell/.test(finishSrc));
check("skip paths still exist for questions and retell", clubSrc.includes('id === "club-q-skip"') && clubSrc.includes('id === "club-rt-skip"'));
check("reader uses Asia/Shanghai dates", clubSrc.includes('timeZone: "Asia/Shanghai"') && html.includes('timeZone:"Asia/Shanghai"'));

const readme = read("README.md");
check("README says the 30 stories are published", readme.includes("第 1–30 篇故事已在 GitHub Pages 和 CloudBase 正式站发布"));
check("README does not claim the shared login is already live", readme.includes("还没有部署") && readme.includes("线上现在还没有这项能力") && readme.includes("D → D+2"));
check("README keeps the two-day unlock", readme.includes("两个自然日"));

const padAndCal = new Function(
  read("index.html").match(/function todayStr\(\)\{[\s\S]*?\n    \}/)[0].replace(/^    /gm, "") +
    "\n" +
    read("index.html").match(/function addDays\(dateStr, days\)\{[\s\S]*?\n    \}/)[0].replace(/^    /gm, "") +
    "\nfunction pad(n){ return n<10?'0'+n:''+n; }\nreturn {todayStr: todayStr, addDays: addDays};"
);
const indexCal = padAndCal();

function makeEl() {
  return {
    hidden: true,
    className: "",
    innerHTML: "",
    textContent: "",
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; }
  };
}
const els = {};
function $(id) {
  if (!els[id]) els[id] = makeEl();
  return els[id];
}
["club-main", "club-header", "club", "home", "flow", "club-pop-mask", "club-popover", "btn-club-entry"].forEach($);

const cards = {};
const ensured = [];
function ensureCard(id) {
  ensured.push(id);
  if (!cards[id]) {
    cards[id] = {
      id: id, intervalIdx: -1, due: null, seen: false, reviews: 0, remembers: 0,
      errors: 0, stubborn: false, relearn: null, mastered: false, consecRight: 0
    };
  }
  return cards[id];
}

const state = { club: { episodes: {} }, cards: cards };
const toasts = [];
const sandbox = {
  window: {},
  document: { getElementById: $, addEventListener() {} },
  location: { pathname: "/", search: "", hash: "" },
  history: { replaceState() {} },
  console,
  Intl,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number
};
sandbox.window.document = sandbox.document;
sandbox.window.location = sandbox.location;
sandbox.window.addEventListener = function () {};
sandbox.window.__SATURDAY_CLUB__ = now;
vm.createContext(sandbox);
vm.runInContext(read("js/saturday-club.js"), sandbox, { filename: "js/saturday-club.js" });
const SC = sandbox.window.SaturdayClub;

function withClock(iso, fn) {
  const Real = globalThis.Date;
  const fixed = new Real(iso);
  function MockDate(...args) {
    if (!new.target) return args.length ? new Real(...args) : new Real(fixed.getTime());
    if (args.length === 0) return new Real(fixed.getTime());
    return new Real(...args);
  }
  MockDate.now = function () { return fixed.getTime(); };
  MockDate.UTC = Real.UTC;
  MockDate.parse = Real.parse;
  MockDate.prototype = Real.prototype;
  globalThis.Date = MockDate;
  sandbox.Date = MockDate;
  try { return fn(); }
  finally {
    globalThis.Date = Real;
    sandbox.Date = Real;
  }
}

SC.configure({
  getState: function () { return state; },
  save: function () {},
  refreshHome: function () {},
  toast: function (m) { toasts.push(m); },
  ensureCard: ensureCard,
  INTERVALS: [1, 3, 7, 14, 30, 60],
  todayStr: function () { return indexCal.todayStr(); },
  addDays: function (d, n) { return indexCal.addDays(d, n); }
});

function reset(day) {
  state.club = { episodes: {} };
  for (const k of Object.keys(cards)) delete cards[k];
  ensured.length = 0;
  toasts.length = 0;
  SC.setToday(day || "2026-03-01");
}

reset("2026-03-01");
check("episode 1 is unlocked immediately", SC.isUnlocked(1) === true && SC.storyMode().type === "read" && SC.storyMode().ep === 1);
check("episode 2 stays locked before episode 1 is finished", SC.isUnlocked(2) === false && SC.currentUnread() === 1);
check("episode 30 content does not unlock it on day one", SC.hasContent(30) === true && SC.isUnlocked(30) === false && SC.isUnlocked(6) === false && SC.currentUnread() === 1);

SC.openHub();
const hub = $("club-main").innerHTML;
check("hub lists every later episode as written but locked", Array.from({ length: 29 }, (_, i) => i + 2).every((n) => hub.includes('data-waiting="' + n + '"')));
const waitingBlocks = [...hub.matchAll(/data-waiting="(\d+)"[\s\S]*?<\/div>/g)];
check(
  "written episodes are not labeled coming soon",
  waitingBlocks.length === 29 && waitingBlocks.every((m) => !m[0].includes("即将推出"))
);
check("fresh cover has no unwritten coming-soon rows", !hub.includes("data-soon="));
check("locked episode 3 shows The First Job", hub.includes("The First Job") && hub.includes("第一次任务"));
check("locked later titles are visible", hub.includes("The Photo") && hub.includes("See You Soon"));
check("cover shows Ms. Reed without the hat spoiler", hub.includes("Ms. Reed") && hub.includes("a teacher at school") && !hub.includes("蓝帽"));

toasts.length = 0;
SC.openStory(2);
check("locked episode 2 cannot be opened", toasts.includes("这篇还没有开放"));

reset("2026-01-31");
SC.markEpisodeFinished(1);
check("finish day does not unlock the next episode", SC.isUnlocked(2) === false);
SC.setToday("2026-02-01");
check("D+1 stays locked", SC.isUnlocked(2) === false && SC.storyMode().type === "recap" && SC.storyMode().ep === 1);
SC.setToday("2026-02-02");
check("D+2 unlocks only the next written episode", SC.isUnlocked(2) === true && SC.isUnlocked(3) === false && SC.currentUnread() === 2);

reset("2026-12-31");
SC.markEpisodeFinished(1);
SC.setToday("2027-01-01");
check("year boundary D+1 stays locked", SC.isUnlocked(2) === false);
SC.setToday("2027-01-02");
check("year boundary D+2 unlocks", SC.isUnlocked(2) === true);

reset("2024-02-28");
SC.markEpisodeFinished(1);
SC.setToday("2024-02-29");
check("leap-day D+1 stays locked", SC.isUnlocked(2) === false);
SC.setToday("2024-03-01");
check("leap-day D+2 unlocks", SC.isUnlocked(2) === true);

reset("2025-02-28");
SC.markEpisodeFinished(1);
SC.setToday("2025-03-01");
check("non-leap March 1 is still D+1", SC.isUnlocked(2) === false);
SC.setToday("2025-03-02");
check("non-leap D+2 unlocks", SC.isUnlocked(2) === true);

reset("2026-03-01");
state.club.episodes["1"] = { finished: true, finishedAt: "2026-01-01", coverLearnDates: ["2026-01-01", "2026-01-02"] };
SC.setToday(null);
const early = withClock("2026-01-02T15:30:00.000Z", function () {
  return { day: indexCal.todayStr(), club: SC.todayStr(), open: SC.isUnlocked(2), mode: SC.storyMode() };
});
const late = withClock("2026-01-02T16:30:00.000Z", function () {
  return { day: indexCal.todayStr(), club: SC.todayStr(), open: SC.isUnlocked(2), mode: SC.storyMode() };
});
check("Shanghai date is still Jan 2 at 15:30Z", early.day === "2026-01-02" && early.club === "2026-01-02" && early.open === false, JSON.stringify(early));
check("Shanghai date becomes Jan 3 at 16:30Z and unlocks", late.day === "2026-01-03" && late.club === "2026-01-03" && late.open === true && late.mode.type === "read" && late.mode.ep === 2, JSON.stringify(late));

reset("2026-01-01");
SC.markEpisodeFinished(1);
SC.setToday("2026-01-01");
check("story day substitutes new learning with recap", SC.storyMode().type === "recap" && SC.currentUnread() === null);
check("story day home text is not the topic fallback", SC.entryText().includes("已在故事里学过"));
SC.setToday("2026-01-02");
check("next calendar day still substitutes new learning", SC.storyMode().type === "recap" && SC.isUnlocked(2) === false);
SC.setToday("2026-06-01");
check("slow reader does not unlock a backlog", SC.currentUnread() === 2 && SC.isUnlocked(3) === false && SC.isUnlocked(4) === false && SC.isUnlocked(5) === false);
check("while the next story is waiting, new learning is that story", SC.storyMode().type === "read" && SC.storyMode().ep === 2);

reset("2026-01-01");
SC.markEpisodeFinished(1);
SC.setToday("2026-04-01");
SC.markEpisodeFinished(2);
check("finishing episode 2 late does not open episode 3 the same day", SC.isUnlocked(3) === false && SC.storyMode().type === "recap");
SC.setToday("2026-04-02");
check("no catch-up on the following day", SC.isUnlocked(3) === false && SC.isUnlocked(4) === false);
SC.setToday("2026-04-03");
check("only the immediate next episode opens", SC.isUnlocked(3) === true && SC.currentUnread() === 3 && SC.isUnlocked(4) === false && SC.isUnlocked(5) === false);

function finishThrough(n, startDay) {
  reset(startDay);
  let day = startDay;
  for (let i = 1; i <= n; i++) {
    SC.setToday(day);
    SC.markEpisodeFinished(i);
    day = indexCal.addDays(day, 2);
  }
  return day;
}
const after5 = finishThrough(5, "2026-05-01");
const finish5 = state.club.episodes["5"].finishedAt;
SC.setToday(finish5);
check("episode 5 story day is recap even though episode 6 exists", SC.storyMode().type === "recap" && SC.storyMode().ep === 5 && SC.isUnlocked(6) === false);
SC.setToday(indexCal.addDays(finish5, 1));
check("day after episode 5 is still the story substitute", SC.storyMode().type === "recap" && SC.isUnlocked(6) === false);
SC.setToday(indexCal.addDays(finish5, 2));
check("D+2 opens only episode 6", SC.isUnlocked(6) === true && SC.currentUnread() === 6 && SC.isUnlocked(7) === false && SC.storyMode().type === "read");
check("after5 date agrees", after5 === indexCal.addDays(finish5, 2));

finishThrough(30, "2026-01-01");
const finish30 = state.club.episodes["30"].finishedAt;
SC.setToday(finish30);
check("episode 30 story day substitutes new learning", SC.storyMode().type === "recap" && SC.storyMode().ep === 30);
SC.setToday(indexCal.addDays(finish30, 1));
check("day after the last story still substitutes new learning", SC.storyMode().type === "recap");
SC.setToday(indexCal.addDays(finish30, 2));
check("after the last cover day, new learning falls back to topic cards", SC.storyMode() === null && SC.currentUnread() === null);
check("finished season tells the reader to use topic study", SC.entryText().includes("主题新学") && SC.entryText().includes("30 篇都读完了"));

SC.openHub();
const hubAfter = $("club-main").innerHTML;
check("finished episodes stay rereadable", [1, 2, 3, 4, 5].every((n) => hubAfter.includes('data-ep="' + n + '"') && hubAfter.includes("再读一遍")));
check("finished early episodes do not turn episode 6 into coming soon", !hubAfter.includes('data-soon="6"') && (hubAfter.includes('data-waiting="6"') || hubAfter.includes('data-ep="6"')));
SC.openStory(1);
check("a finished episode can be reread", $("club-main").innerHTML.includes("It is Saturday") && $("club-main").innerHTML.includes("morning"));

reset("2026-03-10");
const learned = {
  id: "sc-w2-01", seen: true, intervalIdx: 3, due: "2026-08-01", reviews: 4, remembers: 4,
  errors: 1, stubborn: false, relearn: null, mastered: true, consecRight: 3
};
cards["sc-w2-01"] = learned;
const learnedTopic = {
  id: "sc-w2-06", seen: true, intervalIdx: 5, due: "2026-09-01", reviews: 8, remembers: 7,
  errors: 0, stubborn: false, relearn: null, mastered: false, consecRight: 2
};
cards["sc-w2-06"] = learnedTopic;
ensured.length = 0;
SC.markEpisodeFinished(2);
check("already learned chunk is not reset", JSON.stringify(cards["sc-w2-01"]) === JSON.stringify(learned) && cards["sc-w2-01"] === learned);
check("sibling learned chunk is not reset either", JSON.stringify(cards["sc-w2-06"]) === JSON.stringify(learnedTopic));
const fresh = cards["sc-w2-02"];
check(
  "unseen chunk enters review once",
  fresh && fresh.seen === true && fresh.intervalIdx === 0 && fresh.due === "2026-03-11" && fresh.reviews === 0 && fresh.fromClub === 2
);
check(
  "recycled hint ids are not new cards",
  now.episodes["2"].recycledIds.every((id) => !ensured.includes(id) && !cards[id])
);
const due = fresh.due;
fresh.intervalIdx = 4;
fresh.due = "2026-12-01";
fresh.reviews = 6;
SC.markEpisodeFinished(2);
check("rereading does not reset SRS", fresh.intervalIdx === 4 && fresh.due === "2026-12-01" && fresh.reviews === 6 && cards["sc-w2-01"].due === "2026-08-01");
check("first review due was the next day", due === "2026-03-11");

const kinds2 = SC.lexKinds(2);
check("episode 2 targets stay new even if the id is also a review hint later", kinds2["sc-w2-01"] === "new" && kinds2["sc-w2-06"] === "new");
check("episode 2 review hints stay recycled", now.episodes["2"].recycledIds.every((id) => kinds2[id] === "recycled"));
check("episode 2 does not treat another episode's chunk as its target", kinds2["sc-w3-01"] == null);
const kinds4 = SC.lexKinds(4);
check("a later story treats an earlier target as a review hint", kinds4["sc-w2-01"] === "recycled" && kinds4["sc-w4-01"] === "new");
const kinds1 = SC.lexKinds(1);
check("episode 1 targets are not relabeled by recycled additions", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((i) => kinds1["sc-w1-" + String(i).padStart(2, "0")] === "new"));

SC.setToday("2026-03-20");
state.club.episodes["1"] = { finished: true, finishedAt: "2026-03-01", coverLearnDates: ["2026-03-01", "2026-03-02"] };
SC.openStory(2);
const scene = $("club-main").innerHTML;
check("new phrase is tappable as new", /chunk-new[^>]*>wait for</.test(scene));
check("recycled library is a review hint, not a new card", /chunk-recycled[^>]*>library</.test(scene));

const shuffled = SC.shuffleWordBank(["the", "cat", "the", "sat"], function () { return 0; });
check(
  "shuffle keeps repeated tokens",
  shuffled.length === 4 && tally(shuffled).get("the") === 2 && shuffled.join(" ") !== "the cat the sat"
);
const same = SC.shuffleWordBank(["Only"], function () { return 0; });
check("single-token bank stays intact", JSON.stringify(same) === JSON.stringify(["Only"]));

const practiceBanks = [];
for (let n = 2; n <= 30; n++) {
  for (const item of now.episodes[String(n)].practice) practiceBanks.push(item.wordBank.slice());
}
check("display shuffle does not drop tokens from any practice bank", practiceBanks.every((bank) => {
  const out = SC.shuffleWordBank(bank.slice(), Math.random);
  return sameTally(tally(out), tally(bank));
}));

check("episode 1 still prefers its original chunk list", SC.optionalPracticePool(1).length === 0 && SC.preferPracticeChunks(1).length === 12);
check("episode 6 keeps six practice sentences in the pool", SC.optionalPracticePool(6).length === 6 && SC.practicePoolCap() === 3);
const poolTargets = new Set(now.episodes["6"].practice.map((p) => p.target));
let sawShort = true;
for (let i = 0; i < 20; i++) {
  const picked = SC.pickOptionalPractice(6);
  if (picked.length !== 3) sawShort = false;
  if (!picked.every((p) => poolTargets.has(p.target))) sawShort = false;
}
check("one sitting uses three of the six optional sentences, not all six", sawShort);
const prompts = SC.promptsForPractice(6, SC.pickOptionalPractice(6, function () { return 0; }));
check(
  "optional sentences reuse existing chunk ids",
  prompts.length === 3 && prompts.every((ch) => /^sc-w6-/.test(ch.id) && (ch.wordBank || []).length > 0)
);
check(
  "practice check-in is still 8 sentences, not 6 required story sentences",
  /var SENT_MIN = 8, SENT_MAX = 10;/.test(html) && html.includes("SaturdayClub.practicePoolCap") === false &&
    html.includes("pickOptionalPractice(epN)")
);
const qHandler = clubSrc.slice(clubSrc.indexOf('t.id === "club-q-try"'), clubSrc.indexOf('t.id === "club-q-next"'));
check(
  "question answers are not graded against the model sentence",
  !/model|correct|score|逐字/.test(qHandler.slice(qHandler.indexOf("{"))) && clubSrc.includes("不用写得一模一样")
);

reset("2026-08-01");
const oldCard = {
  id: "sc-w1-01", seen: true, intervalIdx: 4, due: "2026-11-01", reviews: 9, remembers: 9,
  errors: 0, stubborn: false, relearn: null, mastered: true, consecRight: 4
};
const oldTopic = {
  id: "sch-11", seen: true, intervalIdx: 2, due: "2026-08-20", reviews: 3, remembers: 2,
  errors: 1, stubborn: false, relearn: null, mastered: false, consecRight: 1
};
cards["sc-w1-01"] = oldCard;
cards["sch-11"] = oldTopic;
ensured.length = 0;
SC.markEpisodeFinished(6);
check("older episode card survives a later story", cards["sc-w1-01"] === oldCard && oldCard.intervalIdx === 4 && oldCard.due === "2026-11-01" && oldCard.reviews === 9);
check("an already learned topic card is not reissued", cards["sch-11"] === oldTopic && oldTopic.seen === true && oldTopic.intervalIdx === 2);
check(
  "episode 6 introduces only its own unseen chunks",
  ensured.length === 6 && ensured.every((id) => /^sc-w6-/.test(id)) && !ensured.includes("sch-11") && !ensured.includes("sc-w1-01")
);
const again = cards["sc-w6-01"];
again.intervalIdx = 3;
again.due = "2027-01-01";
again.reviews = 5;
SC.markEpisodeFinished(6);
check("finishing episode 6 again does not reset its card", again.intervalIdx === 3 && again.due === "2027-01-01" && again.reviews === 5 && oldCard.due === "2026-11-01");

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("all saturday-club regression checks passed");
