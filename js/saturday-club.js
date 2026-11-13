/* Saturday Club — official Pages section (hub + stories + unlock + 新学 hooks) */
(function (global) {
  "use strict";

  var data = global.__SATURDAY_CLUB__ || null;
  var hooks = {};
  var lex = {};
  var matchers = [];
  var view = "hub"; /* hub | scene | after | recap */
  var episodeN = 1;
  var sceneIdx = 0;
  var openZh = {};
  var afterStep = "questions";
  var qIndex = 0;
  var qRevealed = false;
  var answers = ["", "", ""];
  var retell = { who: "", where: "", what: "" };
  var syncingHash = false;
  var todayOverride = null; /* tests only */

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function todayStr() {
    if (todayOverride) return todayOverride;
    if (hooks.todayStr) return hooks.todayStr();
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      function pad(n) { return n < 10 ? "0" + n : "" + n; }
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
  }
  function addDays(dateStr, days) {
    if (hooks.addDays) return hooks.addDays(dateStr, days);
    var p = String(dateStr).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + days);
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function st() { return hooks.getState ? hooks.getState() : null; }
  function clubState() {
    var s = st();
    if (!s) return { episodes: {} };
    if (!s.club) s.club = { episodes: {} };
    if (!s.club.episodes) s.club.episodes = {};
    return s.club;
  }
  function epState(n) {
    var c = clubState();
    var k = String(n);
    if (!c.episodes[k]) c.episodes[k] = {};
    return c.episodes[k];
  }
  function save() { if (hooks.save) hooks.save(); }
  function toast(m) { if (hooks.toast) hooks.toast(m); }
  function refreshHome() { if (hooks.refreshHome) hooks.refreshHome(); }

  function slots() { return (data && data.slots) || 30; }
  function episode(n) { return data && data.episodes && data.episodes[String(n)]; }
  function hasContent(n) {
    var ep = episode(n);
    return !!(ep && ep.scenes && ep.scenes.length);
  }
  function finishedAt(n) {
    var e = clubState().episodes[String(n)];
    return (e && e.finishedAt) || null;
  }
  function isFinished(n) { return !!finishedAt(n); }

  /* Episode 1 always unlocked (content exists). Later: only the next episode,
     only after previous finishedAt + 2 calendar days, and only if written. */
  function isUnlocked(n) {
    n = +n;
    if (n < 1 || n > slots()) return false;
    if (!hasContent(n)) return false;
    if (n === 1) return true;
    if (!isFinished(n - 1)) return false;
    var t = todayStr();
    return t >= addDays(finishedAt(n - 1), 2);
  }

  /* The single unread episode that may be opened now (if any). */
  function currentUnread() {
    var i;
    for (i = 1; i <= slots(); i++) {
      if (isFinished(i)) continue;
      if (isUnlocked(i) && hasContent(i)) return i;
      return null; /* next one is locked or unwritten — do not skip ahead */
    }
    return null;
  }

  function coverDates(n) {
    var e = clubState().episodes[String(n)];
    return (e && e.coverLearnDates) || [];
  }
  function isCoverDay(dateStr) {
    var i, dates;
    for (i = 1; i <= slots(); i++) {
      dates = coverDates(i);
      if (dates.indexOf(dateStr) !== -1) return i;
    }
    return null;
  }

  /* {type:'read', ep} | {type:'recap', ep} | null */
  function storyMode() {
    var unread = currentUnread();
    if (unread) return { type: "read", ep: unread };
    var recapEp = isCoverDay(todayStr());
    if (recapEp) return { type: "recap", ep: recapEp };
    return null;
  }

  function allEpisodeChunks() {
    var list = [], k, ep;
    if (!data || !data.episodes) return list;
    Object.keys(data.episodes).sort(function (a, b) { return +a - +b; }).forEach(function (key) {
      ep = data.episodes[key];
      (ep.chunks || []).forEach(function (c) {
        list.push(Object.assign({ topicId: "saturday-club", topicName: "周六俱乐部", episode: +key }, c));
      });
    });
    return list;
  }

  function injectTopic() {
    var T = global.__TOPICS__;
    if (!T || !T.topics || !data) return;
    var chunks = allEpisodeChunks();
    var existing = T.topics.filter(function (t) { return t.id === "saturday-club"; })[0];
    if (existing) { existing.chunks = chunks; return; }
    T.topics.push({
      id: "saturday-club",
      name: "周六俱乐部",
      nameEn: "Saturday Club",
      extra: true,
      club: true,
      stage0Target: 0,
      stage1Target: 0,
      chunks: chunks
    });
  }

  function buildLex(n) {
    lex = {};
    matchers = [];
    var ep = episode(n);
    if (!ep) return;
    (ep.chunks || []).forEach(function (ch) {
      lex[ch.id] = { kind: "new", item: ch };
      (ch.surface || [ch.lemma]).forEach(function (s) {
        matchers.push({ id: ch.id, kind: "new", text: s });
      });
    });
    (data.recycled || []).forEach(function (ch) {
      lex[ch.id] = { kind: "recycled", item: ch };
      (ch.surface || [ch.lemma]).forEach(function (s) {
        matchers.push({ id: ch.id, kind: "recycled", text: s });
      });
    });
    matchers.sort(function (a, b) { return b.text.length - a.text.length; });
  }

  function highlight(text) {
    var flags = new Array(text.length);
    var i, k, m, re, match, start, end, overlap;
    for (i = 0; i < matchers.length; i++) {
      m = matchers[i];
      re = new RegExp("\\b" + escapeRe(m.text).replace(/\\ /g, "\\s+") + "\\b", "gi");
      while ((match = re.exec(text))) {
        start = match.index;
        end = start + match[0].length;
        overlap = false;
        for (k = start; k < end; k++) { if (flags[k]) { overlap = true; break; } }
        if (overlap) continue;
        flags[start] = { id: m.id, kind: m.kind, end: end };
        for (k = start + 1; k < end; k++) flags[k] = true;
        if (re.lastIndex === start) re.lastIndex++;
      }
    }
    var html = "";
    i = 0;
    while (i < text.length) {
      if (flags[i] && flags[i].id) {
        end = flags[i].end;
        html += '<button type="button" class="chunk chunk-' + flags[i].kind +
          '" data-id="' + esc(flags[i].id) + '">' + esc(text.slice(i, end)) + "</button>";
        i = end;
      } else {
        start = i;
        i++;
        while (i < text.length && !(flags[i] && flags[i].id)) i++;
        html += esc(text.slice(start, i));
      }
    }
    return html;
  }

  function speak(text) {
    if (hooks.speak) { hooks.speak(text); return; }
    if (!global.speechSynthesis || !text) return;
    try {
      global.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = "en-GB";
      u.rate = 0.95;
      global.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function closePopover() {
    var mask = $("club-pop-mask"), pop = $("club-popover");
    if (mask) mask.hidden = true;
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }
  function openPopover(id) {
    var entry = lex[id];
    if (!entry) return;
    var ch = entry.item;
    var tags = (ch.collocations || []).slice(0, 2).map(function (c) {
      return '<span class="tag">' + esc(c) +
        '<button type="button" class="spk" data-say="' + esc(c) + '" aria-label="朗读">🔊</button></span>';
    }).join("");
    var badge = entry.kind === "new" ? '<span class="badge badge-new">本周新词</span>' : '<span class="badge badge-old">已学过</span>';
    $("club-pop-mask").hidden = false;
    var pop = $("club-popover");
    pop.hidden = false;
    pop.innerHTML =
      '<div class="pop-head"><div><div class="pop-word">' + esc(ch.lemma) +
        '<button type="button" class="spk" data-say="' + esc(ch.lemma) + '" aria-label="朗读">🔊</button></div>' +
        '<div class="pop-ipa">' + esc(ch.phonetic || "") + "</div></div>" + badge + "</div>" +
      '<div class="pop-gloss">' + esc(ch.gloss) + "</div>" +
      (tags ? '<div class="label">搭配</div>' + tags : "") +
      '<button type="button" class="btn btn-ghost btn-full" id="club-pop-close">关闭</button>';
  }

  /* ===== Finish / SRS / 新学 cover ===== */
  function introduceChunks(n) {
    var ep = episode(n);
    if (!ep || !hooks.ensureCard || !hooks.INTERVALS) return;
    var t = todayStr();
    var due = addDays(t, hooks.INTERVALS[0] || 1);
    (ep.chunks || []).forEach(function (ch) {
      var card = hooks.ensureCard(ch.id);
      if (card.seen) return; /* already in review: do not reset */
      card.seen = true;
      card.relearn = null;
      card.intervalIdx = 0;
      card.due = due;
      card.fromClub = n;
    });
  }

  function markEpisodeFinished(n, opts) {
    opts = opts || {};
    var e = epState(n);
    var t = todayStr();
    var first = !e.finishedAt;
    if (first) {
      e.finished = true;
      e.finishedAt = t;
      e.coverLearnDates = [t, addDays(t, 1)];
      introduceChunks(n);
    }
    save();
    refreshHome();
    return first;
  }

  function preferPracticeChunks(n) {
    n = n || episodeN || 1;
    var ep = episode(n);
    if (!ep) return [];
    var order = ep.practicePreferIds || (ep.chunks || []).map(function (c) { return c.id; });
    var byId = {};
    (ep.chunks || []).forEach(function (c) {
      byId[c.id] = Object.assign({ topicId: "saturday-club", topicName: "周六俱乐部" }, c);
    });
    var out = [];
    order.forEach(function (id) { if (byId[id]) out.push(byId[id]); });
    return out;
  }

  /* ===== Views ===== */
  function renderHeader() {
    var el = $("club-header");
    if (!el) return;
    if (view === "hub") {
      el.className = "top";
      el.innerHTML =
        '<div class="preview-pill">' + esc(data.badge || "Pages 版") + "</div>" +
        '<h1 class="title-en">' + esc(data.titleEn) + "</h1>" +
        '<div class="title-zh">' + esc(data.titleZh) + "</div>" +
        '<div class="intro"><div class="en">' + esc(data.introEn) + "</div>" +
        '<div class="zh">' + esc(data.introZh) + "</div></div>";
    } else {
      var ep = episode(episodeN) || {};
      var backLabel = "← 返回";
      el.className = "top story-top";
      el.innerHTML =
        '<button type="button" class="back" id="club-back" aria-label="返回封面">' + backLabel + "</button>" +
        '<div class="story-head">' +
          '<div class="hi">' + esc(data.badge || "Pages 版") + "</div>" +
          "<h1>" + esc(data.titleZh) + "</h1>" +
          '<p class="sub">Weekend ' + episodeN + " · " + esc(ep.titleEn || "") + "</p>" +
          '<p class="sub-en">' + (ep.titleZh ? "《" + esc(ep.titleZh) + "》" : "") + "</p>" +
        "</div>";
    }
  }

  function renderHub() {
    view = "hub";
    var chars = (data.characters || []).map(function (c) {
      return '<div class="char"><div class="initial">' + esc((c.name || "?").charAt(0)) + "</div>" +
        '<div class="name">' + esc(c.name) + "</div>" +
        '<div class="pro">(' + esc(c.pronoun) + ")</div>" +
        '<div class="blurb">' + esc(c.blurbEn) + "<br>" + esc(c.blurbZh) + "</div></div>";
    }).join("");
    var current = "";
    var i, done, unlocked, has, label, cls, btn;
    for (i = 1; i <= slots(); i++) {
      has = hasContent(i);
      done = isFinished(i);
      unlocked = isUnlocked(i);
      if (has && (unlocked || done)) {
        var ep = episode(i);
        cls = "week-now" + (done ? " done" : "");
        btn = done
          ? '<button type="button" class="btn btn-ghost btn-full club-open" data-ep="' + i + '">再读一遍</button>'
          : '<button type="button" class="btn btn-primary btn-full club-open" data-ep="' + i + '">开始阅读</button>';
        current += '<div class="' + cls + '"><div class="wk">Weekend ' + i + (done ? " · 已读完" : "") + "</div>" +
          "<h3 lang=\"en\">" + esc(ep.titleEn) + "</h3>" +
          '<div class="zh">《' + esc(ep.titleZh) + "》</div>" + btn + "</div>";
      }
    }
    if (!current) {
      current = '<p class="hint-line">现在还没有可以读的新故事。先用原来的主题新学，等下一篇写好并到解锁日再来。</p>';
    }
    var locked = "";
    for (i = 1; i <= slots(); i++) {
      if (hasContent(i) && (isUnlocked(i) || isFinished(i))) continue;
      locked += '<div class="week-locked"><span>Weekend ' + i + '</span><span class="soon">即将推出</span></div>';
    }
    $("club-main").innerHTML =
      '<div class="card-block"><div class="label">三位同学</div><div class="chars">' + chars + "</div></div>" +
      '<div class="card-block"><div class="label">可以阅读</div>' + current + "</div>" +
      '<div class="card-block"><div class="label">即将推出</div><div class="slot-list">' + locked + "</div>" +
      '<p class="series-note">' + esc(data.seriesNote || "") + "</p></div>" +
      '<button type="button" class="btn btn-ghost btn-full" id="club-home" style="margin-top:12px">回首页</button>';
  }

  function renderScene() {
    var ep = episode(episodeN);
    var scene = ep.scenes[sceneIdx];
    var n = sceneIdx + 1;
    var sents = scene.sentences.map(function (s, idx) {
      var open = !!(openZh[sceneIdx] && openZh[sceneIdx][idx]);
      return '<div class="sent' + (open ? " open" : "") + '" data-si="' + idx + '" role="button" tabindex="0">' +
        '<div class="sent-en" lang="en">' + highlight(s.en) + "</div>" +
        '<div class="sent-zh">' + esc(s.zh) + "</div></div>";
    }).join("");
    var dots = '<div class="dots" aria-hidden="true">';
    var i;
    for (i = 0; i < ep.scenes.length; i++) dots += '<span class="dot' + (i === sceneIdx ? " on" : "") + '"></span>';
    dots += "</div>";
    $("club-main").innerHTML =
      '<div class="card-block">' + dots +
        '<div class="label">第 ' + n + " / " + ep.scenes.length + " 场</div>" +
        "<h2 class=\"scene-title\">" + esc(scene.title) + "</h2>" +
        (n === 1 ? '<p class="hint-line">点句子看中文；点彩色词看意思和发音。</p>' : "") +
        '<div class="story">' + sents + "</div></div>" +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" id="club-prev"' + (sceneIdx === 0 ? " disabled" : "") + ">上一场</button>" +
        '<button type="button" class="btn btn-primary" id="club-next">' +
          (sceneIdx === ep.scenes.length - 1 ? "读完了" : "下一场") + "</button></div>";
  }

  function renderQuestions() {
    var ep = episode(episodeN);
    var q = ep.questions[qIndex];
    $("club-main").innerHTML =
      '<div class="notice">读后三问是可选的，不影响复习和打卡。</div>' +
      '<div class="card-block"><div class="label">读后三问 ' + (qIndex + 1) + " / 3</div>" +
        "<h2 class=\"scene-title\">" + esc(q.q) + "</h2>" +
        '<p class="hint-line">' + esc(q.qZh) + "</p>" +
        '<textarea id="club-q-ans" rows="3" placeholder="可以写关键词，也可以先想一想">' + esc(answers[qIndex] || "") + "</textarea>" +
        (qRevealed ? '<div class="model"><div class="label">参考答案</div><p lang="en">' + esc(q.model) + '</p><p class="zh">' + esc(q.modelZh) + "</p></div>" : "") +
      "</div>" +
      '<div class="btn-row">' +
        (qRevealed
          ? '<button type="button" class="btn btn-primary btn-full" id="club-q-next">' + (qIndex >= 2 ? "去复述" : "下一题") + "</button>"
          : '<button type="button" class="btn btn-ghost" id="club-q-skip">跳过</button><button type="button" class="btn btn-primary" id="club-q-try">看看参考答案</button>') +
      "</div>" +
      (!qRevealed ? '<button type="button" class="linkish" id="club-q-skip-all">跳过全部问题</button>' : "");
  }

  function renderRetell() {
    var ep = episode(episodeN);
    var cards = (ep.retell || []).map(function (r) {
      return '<div class="retell-card"><h3>' + esc(r.label) + "</h3>" +
        '<p class="hint-line">' + esc(r.hint) + "</p>" +
        '<input type="text" id="club-rt-' + esc(r.key) + '" value="' + esc(retell[r.key] || "") +
        '" placeholder="可以写关键词，也可以只说出来" /></div>';
    }).join("");
    $("club-main").innerHTML =
      '<div class="notice">复述可以口头说，也可以写关键词。不录音、不上传。</div>' +
      '<div class="card-block"><div class="label">读后复述</div>' +
        "<h2 class=\"scene-title\">谁 / 在哪 / 发生了什么</h2>" + cards + "</div>" +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" id="club-rt-skip">跳过</button>' +
        '<button type="button" class="btn btn-primary" id="club-rt-done">去做造句</button></div>';
  }

  function renderAfterDone() {
    var first = markEpisodeFinished(episodeN);
    var ep = episode(episodeN) || {};
    $("club-main").innerHTML =
      '<div class="card-block end-card"><h2>读完啦 🎉</h2>' +
        '<p class="hint-line">你读完了《' + esc(ep.titleZh || "") + "》。本篇新词已经进入复习，明天就会到期。</p>" +
        '<div class="end-note">读完故事，今天和明天的「新学」都算完成，不用再滑这批新卡。接下来去做现有的词库造句（会优先本篇目标词）。</div>' +
        '<button type="button" class="btn btn-primary btn-full" id="club-go-practice" style="margin-top:14px">去做造句</button>' +
        '<button type="button" class="btn btn-ghost btn-full" id="club-back-hub" style="margin-top:8px">返回封面</button></div>';
    return first;
  }

  function renderRecap(n) {
    view = "recap";
    episodeN = n;
    var ep = episode(n);
    var items = (ep.chunks || []).map(function (ch) {
      return '<div class="recap-item"><div><div class="lw">' + esc(ch.lemma) +
        ' <button type="button" class="spk" data-say="' + esc(ch.lemma) + '">🔊</button></div>' +
        '<div class="lg">' + esc(ch.phonetic || "") + " · " + esc(ch.gloss) + "</div></div></div>";
    }).join("");
    $("club-main").innerHTML =
      '<div class="notice info">本篇新词已在故事里学过。下面是大约 2 分钟的回顾，不算新学，也不会改复习间隔。</div>' +
      '<div class="card-block"><div class="label">本篇词块回顾</div>' +
        "<h2 class=\"scene-title\">Weekend " + n + " · " + esc(ep.titleEn) + "</h2>" +
        items + "</div>" +
      '<button type="button" class="btn btn-primary btn-full" id="club-back-hub" style="margin-top:12px">返回封面</button>' +
      '<button type="button" class="btn btn-ghost btn-full" id="club-reread" style="margin-top:8px">再读一遍故事</button>';
  }

  function render() {
    closePopover();
    renderHeader();
    if (view === "hub") renderHub();
    else if (view === "recap") renderRecap(episodeN);
    else if (view === "scene") renderScene();
    else if (afterStep === "questions") renderQuestions();
    else if (afterStep === "retell") renderRetell();
    else renderAfterDone();
  }

  function showClub() {
    var home = $("home"), club = $("club"), flow = $("flow");
    if (flow) flow.classList.remove("show");
    if (home) home.style.display = "none";
    if (club) { club.classList.add("show"); club.hidden = false; }
  }
  function hideClub() {
    var club = $("club");
    if (club) { club.classList.remove("show"); club.hidden = true; }
    closePopover();
  }

  function setHash(h) {
    syncingHash = true;
    var path = location.pathname + location.search + (h ? ("#" + h) : "");
    if (history.replaceState) history.replaceState(null, "", path);
    else location.hash = h || "";
    syncingHash = false;
  }

  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (!h) return { view: "none" };
    if (h === "club" || h === "saturday-club") return { view: "hub" };
    var m = h.match(/^club\/(?:story|w?(\d+))$/);
    if (m) return { view: "story", n: m[1] ? +m[1] : 1 };
    return { view: "none" };
  }

  function openHub() {
    view = "hub";
    showClub();
    setHash("club");
    render();
  }

  function openStory(n, fromLearn) {
    n = +n || 1;
    if (!(isUnlocked(n) || isFinished(n)) || !hasContent(n)) {
      toast("这篇还没有开放");
      openHub();
      return;
    }
    episodeN = n;
    view = "scene";
    sceneIdx = 0;
    openZh = {};
    afterStep = "questions";
    qIndex = 0;
    qRevealed = false;
    answers = ["", "", ""];
    retell = { who: "", where: "", what: "" };
    buildLex(n);
    showClub();
    setHash("club/story");
    render();
  }

  function openRecap(n) {
    n = +n || 1;
    episodeN = n;
    view = "recap";
    showClub();
    setHash("club");
    render();
  }

  function closeToHome() {
    hideClub();
    setHash("");
    var home = $("home");
    if (home) home.style.display = "block";
    refreshHome();
  }

  function goAfter(step) {
    view = "after";
    afterStep = step;
    if (step === "questions") { qIndex = 0; qRevealed = false; }
    render();
  }

  function goPractice() {
    markEpisodeFinished(episodeN);
    hideClub();
    setHash("");
    if (hooks.openPractice) hooks.openPractice(episodeN);
    else closeToHome();
  }

  function onClick(e) {
    var t = e.target.closest("button, .sent, .club-open, .linkish");
    if (!t) {
      if (e.target.id === "club-pop-mask") closePopover();
      return;
    }
    if (t.classList.contains("spk")) {
      e.preventDefault(); e.stopPropagation();
      speak(t.getAttribute("data-say") || "");
      return;
    }
    if (t.classList.contains("chunk")) {
      e.preventDefault(); e.stopPropagation();
      openPopover(t.getAttribute("data-id"));
      return;
    }
    if (t.id === "club-pop-close" || t.id === "club-pop-mask") { closePopover(); return; }
    if (t.id === "club-back" || t.id === "club-back-hub") { openHub(); return; }
    if (t.id === "club-home") { closeToHome(); return; }
    if (t.classList.contains("club-open")) { openStory(+t.getAttribute("data-ep")); return; }
    if (t.id === "club-reread") { openStory(episodeN); return; }

    if (t.classList.contains("sent")) {
      var si = +t.getAttribute("data-si");
      if (!openZh[sceneIdx]) openZh[sceneIdx] = {};
      openZh[sceneIdx][si] = !openZh[sceneIdx][si];
      t.classList.toggle("open", openZh[sceneIdx][si]);
      return;
    }
    if (t.id === "club-prev" && sceneIdx > 0) { sceneIdx--; render(); return; }
    if (t.id === "club-next") {
      var ep = episode(episodeN);
      if (sceneIdx < ep.scenes.length - 1) { sceneIdx++; render(); }
      else goAfter("questions");
      return;
    }
    if (t.id === "club-q-try" || t.id === "club-q-skip") {
      var ta = $("club-q-ans");
      if (ta) answers[qIndex] = ta.value;
      qRevealed = true;
      render();
      return;
    }
    if (t.id === "club-q-next") {
      if (qIndex >= 2) goAfter("retell");
      else { qIndex++; qRevealed = false; render(); }
      return;
    }
    if (t.id === "club-q-skip-all") { goAfter("retell"); return; }
    if (t.id === "club-rt-skip" || t.id === "club-rt-done") {
      ["who", "where", "what"].forEach(function (k) {
        var el = $("club-rt-" + k);
        if (el) retell[k] = el.value;
      });
      view = "after";
      afterStep = "done";
      render();
      return;
    }
    if (t.id === "club-go-practice") { goPractice(); return; }
  }

  function onHash() {
    if (syncingHash) return;
    var p = parseHash();
    if (p.view === "hub") openHub();
    else if (p.view === "story") openStory(p.n || 1);
    else if ($("club") && $("club").classList.contains("show")) closeToHome();
  }

  function entryText() {
    var mode = storyMode();
    if (mode && mode.type === "read") {
      var ep = episode(mode.ep) || {};
      return "Weekend " + mode.ep + " · " + (ep.titleEn || "") + " · 去读故事（今天的新学）";
    }
    if (mode && mode.type === "recap") {
      return "本篇新词已在故事里学过 · 可做 2 分钟回顾";
    }
    var unread = currentUnread();
    if (!unread) {
      var last = 1;
      while (last <= slots() && isFinished(last)) last++;
      last = last - 1;
      if (last >= 1 && isFinished(last)) {
        return "已读完 Weekend " + last + "。下一篇还没推出，今天可以按原来的主题新学。";
      }
    }
    var ep1 = episode(1) || {};
    return "Weekend 1 · " + (ep1.titleEn || "The Message on the Board");
  }

  function bind() {
    var club = $("club");
    if (club && !club._bound) {
      club.addEventListener("click", onClick);
      club._bound = true;
    }
    var entry = $("btn-club-entry");
    if (entry && !entry._bound) {
      entry.addEventListener("click", function () {
        openHub();
      });
      entry._bound = true;
    }
    window.addEventListener("hashchange", onHash);
  }

  function applyRoute() {
    var p = parseHash();
    if (p.view === "hub") openHub();
    else if (p.view === "story") openStory(p.n || 1);
  }

  function configure(h) { hooks = h || hooks; }

  var api = {
    ready: false,
    configure: configure,
    injectTopic: injectTopic,
    boot: function (h) {
      if (h) configure(h);
      if (!data) {
        fetch("data/saturday-club.json").then(function (r) { return r.json(); }).then(function (d) {
          data = d; injectTopic(); api.ready = true; bind(); applyRoute(); refreshHome();
        }).catch(function () {});
        return;
      }
      injectTopic();
      api.ready = true;
      bind();
      applyRoute();
    },
    storyMode: storyMode,
    isUnlocked: isUnlocked,
    isFinished: isFinished,
    hasContent: hasContent,
    currentUnread: currentUnread,
    finishedAt: finishedAt,
    coverDates: coverDates,
    preferPracticeChunks: preferPracticeChunks,
    markEpisodeFinished: markEpisodeFinished,
    openHub: openHub,
    openStory: openStory,
    openRecap: openRecap,
    closeToHome: closeToHome,
    entryText: entryText,
    todayStr: todayStr,
    setToday: function (d) { todayOverride = d || null; }, /* tests only */
    slots: slots,
    episode: episode,
    data: function () { return data; }
  };

  if (data) injectTopic();
  global.SaturdayClub = api;
})(window);
