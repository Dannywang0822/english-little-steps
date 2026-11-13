(function () {
  "use strict";

  var STORAGE_KEY = "sc_test_w1";
  var data = null;
  var lex = {};
  var matchers = [];
  var tts = { supported: false, voice: null, unlocked: false };
  var syncingHash = false;

  var state = {
    view: "hub",
    inAfter: false,
    scene: 0,
    openZh: {},
    afterStep: "questions",
    qIndex: 0,
    qRevealed: false,
    answers: ["", "", ""],
    retell: { who: "", where: "", what: "" },
    practiceId: null,
    practiceDone: [],
    finished: false
  };

  function $(id) { return document.getElementById(id); }

  function isStoryHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    return h === "story" || h === "w1" || h === "weekend-1";
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s === "object") {
        if (typeof s.scene === "number") state.scene = s.scene;
        if (s.afterStep) state.afterStep = s.afterStep;
        if (typeof s.qIndex === "number") state.qIndex = s.qIndex;
        if (s.answers) state.answers = s.answers;
        if (s.retell) state.retell = s.retell;
        if (s.practiceDone) state.practiceDone = s.practiceDone;
        if (s.finished) state.finished = s.finished;
        if (s.inAfter) state.inAfter = true;
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scene: state.scene,
        afterStep: state.afterStep,
        qIndex: state.qIndex,
        answers: state.answers,
        retell: state.retell,
        practiceDone: state.practiceDone,
        finished: state.finished,
        inAfter: state.view === "after" || (state.view !== "hub" && state.inAfter)
      }));
    } catch (e) {}
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildLex() {
    lex = {};
    matchers = [];
    (data.chunks || []).forEach(function (ch) {
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
        for (k = start; k < end; k++) {
          if (flags[k]) { overlap = true; break; }
        }
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
          '" data-id="' + esc(flags[i].id) + '" aria-label="' + esc(text.slice(i, end)) + '">' +
          esc(text.slice(i, end)) + "</button>";
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

  function pickVoice() {
    if (!tts.supported) return;
    try {
      var list = window.speechSynthesis.getVoices() || [];
      var prefer = null;
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        var lang = (v.lang || "").toLowerCase();
        if (lang.indexOf("en-gb") === 0) { prefer = v; break; }
        if (!prefer && lang.indexOf("en") === 0) prefer = v;
      }
      tts.voice = prefer;
    } catch (e) {}
  }

  function unlockTts() {
    if (tts.unlocked || !tts.supported) return;
    tts.unlocked = true;
    try {
      var u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function speak(text) {
    if (!tts.supported || !text) return;
    unlockTts();
    try {
      var s = window.speechSynthesis;
      s.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      if (!tts.voice) pickVoice();
      if (tts.voice) { u.voice = tts.voice; u.lang = tts.voice.lang; }
      else u.lang = "en-GB";
      u.rate = 0.95;
      s.speak(u);
    } catch (e) {}
  }

  function closePopover() {
    var mask = $("pop-mask");
    var pop = $("popover");
    if (mask) mask.hidden = true;
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }

  function openPopover(id) {
    var entry = lex[id];
    if (!entry) return;
    var ch = entry.item;
    var tags = (ch.collocations || []).slice(0, 2).map(function (c) {
      return '<span class="tag">' + esc(c) +
        (tts.supported ? '<button type="button" class="spk" data-say="' + esc(c) + '" aria-label="朗读">🔊</button>' : "") +
        "</span>";
    }).join("");
    var badge = entry.kind === "new" ? '<span class="badge badge-new">本周新词</span>' : '<span class="badge badge-old">已学过</span>';
    $("pop-mask").hidden = false;
    var pop = $("popover");
    pop.hidden = false;
    pop.innerHTML =
      '<div class="pop-head">' +
        '<div><div class="pop-word">' + esc(ch.lemma) +
          (tts.supported ? '<button type="button" class="spk" data-say="' + esc(ch.lemma) + '" aria-label="朗读">🔊</button>' : "") +
        "</div><div class=\"pop-ipa\">" + esc(ch.phonetic || "") + "</div></div>" +
        badge +
      "</div>" +
      '<div class="pop-gloss">' + esc(ch.gloss) + "</div>" +
      (tags ? '<div class="label">搭配</div>' + tags : "") +
      '<button type="button" class="btn btn-ghost btn-full" id="pop-close">关闭</button>';
  }

  function dotsHtml(current) {
    var html = '<div class="dots" aria-hidden="true">';
    for (var i = 0; i < 6; i++) {
      html += '<span class="dot' + (i === current ? " on" : "") + '"></span>';
    }
    html += "</div>";
    return html;
  }

  function hubMeta() {
    return data.hub || {};
  }

  function renderHeader() {
    var el = $("header");
    if (!el) return;
    var hub = hubMeta();
    if (state.view === "hub") {
      el.className = "top";
      el.innerHTML =
        '<div class="preview-pill">' + esc(hub.previewLabel || "试读预览") + "</div>" +
        '<h1 class="title-en">' + esc(hub.titleEn || "Saturday Club") + "</h1>" +
        '<div class="title-zh">' + esc(hub.titleZh || "周六俱乐部") + "</div>" +
        '<div class="intro">' +
          '<div class="en">' + esc(hub.introEn || "") + "</div>" +
          '<div class="zh">' + esc(hub.introZh || "") + "</div>" +
        "</div>";
      document.title = "Saturday Club / 周六俱乐部（试读预览）";
    } else {
      el.className = "top story-top";
      el.innerHTML =
        '<button type="button" class="back" id="btn-back" aria-label="返回封面">← 返回</button>' +
        '<div class="story-head">' +
          '<div class="hi">' + esc(hub.previewLabel || "试读预览") + "</div>" +
          "<h1>周六俱乐部</h1>" +
          '<p class="sub">Weekend 1 · The Message on the Board</p>' +
          '<p class="sub-en">《黑板上的留言》</p>' +
        "</div>";
      document.title = "Weekend 1: The Message on the Board · Saturday Club";
    }
  }

  function renderHub() {
    var hub = hubMeta();
    var chars = (hub.characters || []).map(function (c) {
      return '<div class="char">' +
        '<div class="initial">' + esc((c.name || "?").charAt(0)) + "</div>" +
        '<div class="name">' + esc(c.name) + "</div>" +
        '<div class="pro">(' + esc(c.pronoun) + ")</div>" +
        '<div class="blurb">' + esc(c.blurbEn) + "<br>" + esc(c.blurbZh) + "</div>" +
      "</div>";
    }).join("");
    var cur = hub.currentWeekend || { n: 1, titleEn: "The Message on the Board", titleZh: "黑板上的留言" };
    var locked = "";
    var from = hub.lockedFrom || 2;
    var to = hub.lockedTo || 8;
    var i;
    for (i = from; i <= to; i++) {
      locked += '<div class="week-locked"><span>Weekend ' + i + '</span><span class="soon">即将推出</span></div>';
    }
    $("main").innerHTML =
      '<div class="card-block">' +
        '<div class="label">三位同学</div>' +
        '<div class="chars">' + chars + "</div>" +
      "</div>" +
      '<div class="card-block">' +
        '<div class="label">本周故事</div>' +
        '<div class="week-now">' +
          '<div class="wk">Weekend ' + cur.n + "</div>" +
          "<h3 lang=\"en\">" + esc(cur.titleEn) + "</h3>" +
          '<div class="zh">《' + esc(cur.titleZh) + "》</div>" +
          '<button type="button" class="btn btn-primary btn-full" id="btn-start">开始阅读</button>' +
        "</div>" +
      "</div>" +
      '<div class="card-block">' +
        '<div class="label">即将推出</div>' +
        locked +
        '<p class="series-note">' + esc(hub.seriesNote || "") + "</p>" +
      "</div>";
  }

  function renderScene() {
    var scene = data.scenes[state.scene];
    var n = state.scene + 1;
    var sents = scene.sentences.map(function (s, idx) {
      var open = !!(state.openZh[state.scene] && state.openZh[state.scene][idx]);
      return '<div class="sent' + (open ? " open" : "") + '" data-si="' + idx + '" role="button" tabindex="0">' +
        '<div class="sent-en" lang="en">' + highlight(s.en) + "</div>" +
        '<div class="sent-zh">' + esc(s.zh) + "</div>" +
        "</div>";
    }).join("");

    $("main").innerHTML =
      '<div class="notice">这是测试页，主站还没合进这篇故事。可选阅读，不计入打卡。</div>' +
      '<div class="card-block">' +
        dotsHtml(state.scene) +
        '<div class="label">第 ' + n + " / 6 场</div>" +
        "<h2 class=\"scene-title\">" + esc(scene.title) + "</h2>" +
        (n === 1 ? '<p class="hint-line">点句子看中文；点彩色词看意思和发音。</p>' : "") +
        '<div class="story">' + sents + "</div>" +
      "</div>" +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" id="btn-prev"' + (state.scene === 0 ? " disabled" : "") + ">上一场</button>" +
        '<button type="button" class="btn btn-primary" id="btn-next">' + (state.scene === 5 ? "读完了" : "下一场") + "</button>" +
      "</div>";
  }

  function renderQuestions() {
    var q = data.questions[state.qIndex];
    var revealed = state.qRevealed;
    $("main").innerHTML =
      '<div class="notice">读后三问是可选的，不影响复习和打卡。</div>' +
      '<div class="card-block">' +
        '<div class="label">读后三问 ' + (state.qIndex + 1) + " / 3</div>" +
        "<h2 class=\"scene-title\">" + esc(q.q) + "</h2>" +
        '<p class="hint-line">' + esc(q.qZh) + "</p>" +
        '<textarea id="q-ans" rows="3" placeholder="可以写关键词，也可以先想一想">' + esc(state.answers[state.qIndex] || "") + "</textarea>" +
        (revealed ? '<div class="model"><div class="label">参考答案</div><p lang="en">' + esc(q.model) + "</p><p class=\"zh\">" + esc(q.modelZh) + "</p></div>" : "") +
      "</div>" +
      '<div class="btn-row">' +
        (revealed
          ? '<button type="button" class="btn btn-primary btn-full" id="btn-q-next">' + (state.qIndex >= 2 ? "去复述" : "下一题") + "</button>"
          : '<button type="button" class="btn btn-ghost" id="btn-q-skip">跳过</button><button type="button" class="btn btn-primary" id="btn-q-try">看看参考答案</button>') +
      "</div>" +
      (!revealed ? '<button type="button" class="linkish" id="btn-q-skip-all">跳过全部问题</button>' : "");
  }

  function renderRetell() {
    var cards = data.retell.map(function (r) {
      return '<div class="retell-card">' +
        "<h3>" + esc(r.label) + "</h3>" +
        '<p class="hint-line">' + esc(r.hint) + "</p>" +
        '<input type="text" id="rt-' + esc(r.key) + '" value="' + esc(state.retell[r.key] || "") + '" placeholder="可以写关键词，也可以只说出来" />' +
      "</div>";
    }).join("");
    $("main").innerHTML =
      '<div class="notice">复述可以口头说，也可以写关键词。本页不录音、不上传。</div>' +
      '<div class="card-block">' +
        '<div class="label">读后复述</div>' +
        "<h2 class=\"scene-title\">谁 / 在哪 / 发生了什么</h2>" +
        cards +
      "</div>" +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" id="btn-rt-skip">跳过</button>' +
        '<button type="button" class="btn btn-primary" id="btn-rt-done">去做造句</button>' +
      "</div>";
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function normSent(s) {
    return String(s)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^a-z0-9'\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderPractice() {
    var doneN = state.practiceDone.length;
    if (state.finished || (doneN >= 1 && state.practiceId === null && state.afterStep === "done")) {
      renderDone();
      return;
    }
    var items = data.practice.map(function (p) {
      var done = state.practiceDone.indexOf(p.id) !== -1;
      return '<button type="button" class="pick' + (done ? " done" : "") + (state.practiceId === p.id ? " on" : "") +
        '" data-pid="' + p.id + '" lang="en">' + (done ? "✓ " : "") + esc(p.target) + "</button>";
    }).join("");

    var body = "";
    var p = null;
    if (state.practiceId) {
      p = data.practice.filter(function (x) { return x.id === state.practiceId; })[0];
      var bank = shuffle(p.wordBank);
      body =
        '<div class="label">词库（点一下加入）</div>' +
        '<textarea id="p-text" rows="3" placeholder="点下面的词，组成句子"></textarea>' +
        '<div class="bank" id="wbank">' + bank.map(function (w) {
          return '<button type="button" data-w="' + esc(w) + '">' + esc(w) + "</button>";
        }).join("") + "</div>" +
        '<div class="hint-box" id="p-fb" hidden></div>' +
        '<div class="btn-row" style="margin-top:10px">' +
          '<button type="button" class="btn btn-ghost" id="btn-p-clear">清空</button>' +
          '<button type="button" class="btn btn-primary" id="btn-p-check">检查一下</button>' +
        "</div>";
    } else {
      body = '<p class="hint-line">选一句来练。做对任意一句就可以结束试读，也可以多练几句。</p>';
    }

    $("main").innerHTML =
      '<div class="notice">本测试页先在这里练造句；合进主站后会跳到现有造句任务。</div>' +
      '<div class="card-block">' +
        '<div class="label">词库造句' + (doneN ? " · 已完成 " + doneN + " 句" : "") + "</div>" +
        "<h2 class=\"scene-title\">选一句，用词库排出来</h2>" +
        '<div class="picks">' + items + "</div>" +
        body +
      "</div>" +
      (doneN >= 1
        ? '<button type="button" class="btn btn-green btn-full" id="btn-finish">完成试读</button>'
        : '<button type="button" class="linkish" id="btn-p-skip">暂时跳过造句</button>');
  }

  function renderDone() {
    state.finished = true;
    state.afterStep = "done";
    state.inAfter = true;
    saveState();
    $("main").innerHTML =
      '<div class="card-block end-card">' +
        "<h2>读完啦 🎉</h2>" +
        '<p class="hint-line">你读完了《黑板上的留言》。Leo、Mia 和 Jay 下周六还会再来。</p>' +
        '<div class="end-note">合进主站后，读完故事会算当天新学完成，造句会跳到现有造句任务；本测试页先独立体验。</div>' +
        '<button type="button" class="btn btn-primary btn-full" id="btn-reread" style="margin-top:14px">再读一遍</button>' +
        '<button type="button" class="btn btn-ghost btn-full" id="btn-back-done" style="margin-top:8px">返回封面</button>' +
      "</div>";
  }

  function render() {
    closePopover();
    renderHeader();
    if (state.view === "hub") renderHub();
    else if (state.view === "scene") renderScene();
    else if (state.afterStep === "questions") renderQuestions();
    else if (state.afterStep === "retell") renderRetell();
    else if (state.afterStep === "done") renderDone();
    else renderPractice();
    saveState();
  }

  function enterStory() {
    if (state.finished) {
      state.view = "scene";
      state.scene = 0;
      state.openZh = {};
      state.afterStep = "questions";
      state.qIndex = 0;
      state.qRevealed = false;
      state.finished = false;
      state.inAfter = false;
      state.practiceId = null;
    } else if (state.inAfter) {
      state.view = "after";
    } else {
      state.view = "scene";
    }
  }

  function goHub() {
    state.view = "hub";
    state.inAfter = state.inAfter || false;
    closePopover();
    syncingHash = true;
    if (history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    } else {
      location.hash = "";
    }
    syncingHash = false;
    render();
  }

  function goStory() {
    enterStory();
    if (!isStoryHash()) {
      syncingHash = true;
      location.hash = "story";
      syncingHash = false;
    }
    render();
  }

  function onHash() {
    if (syncingHash) return;
    if (isStoryHash()) goStory();
    else goHub();
  }

  function goAfter(step) {
    state.view = "after";
    state.inAfter = true;
    state.afterStep = step;
    if (step === "questions") { state.qIndex = 0; state.qRevealed = false; }
    render();
  }

  function onClick(e) {
    unlockTts();
    var t = e.target.closest("button, .sent, .pick, .linkish");
    if (!t) {
      if (e.target.id === "pop-mask") closePopover();
      return;
    }
    if (t.classList.contains("spk")) {
      e.preventDefault();
      e.stopPropagation();
      speak(t.getAttribute("data-say") || "");
      return;
    }
    if (t.classList.contains("chunk")) {
      e.preventDefault();
      e.stopPropagation();
      openPopover(t.getAttribute("data-id"));
      return;
    }
    if (t.id === "pop-close" || t.id === "pop-mask") { closePopover(); return; }

    if (t.id === "btn-back" || t.id === "btn-back-done") { goHub(); return; }
    if (t.id === "btn-start") { goStory(); return; }

    if (t.classList.contains("sent")) {
      var si = +t.getAttribute("data-si");
      if (!state.openZh[state.scene]) state.openZh[state.scene] = {};
      state.openZh[state.scene][si] = !state.openZh[state.scene][si];
      t.classList.toggle("open", state.openZh[state.scene][si]);
      return;
    }

    if (t.id === "btn-prev" && state.scene > 0) { state.scene--; render(); return; }
    if (t.id === "btn-next") {
      if (state.scene < 5) { state.scene++; render(); }
      else goAfter("questions");
      return;
    }

    if (t.id === "btn-q-try" || t.id === "btn-q-skip") {
      var ta = $("q-ans");
      if (ta) state.answers[state.qIndex] = ta.value;
      state.qRevealed = true;
      render();
      return;
    }
    if (t.id === "btn-q-next") {
      if (state.qIndex >= 2) goAfter("retell");
      else { state.qIndex++; state.qRevealed = false; render(); }
      return;
    }
    if (t.id === "btn-q-skip-all") { goAfter("retell"); return; }

    if (t.id === "btn-rt-skip" || t.id === "btn-rt-done") {
      ["who", "where", "what"].forEach(function (k) {
        var el = $("rt-" + k);
        if (el) state.retell[k] = el.value;
      });
      goAfter("practice");
      return;
    }

    if (t.classList.contains("pick")) {
      state.practiceId = t.getAttribute("data-pid");
      render();
      return;
    }
    if (t.getAttribute && t.getAttribute("data-w") && t.closest && t.closest("#wbank")) {
      var box = $("p-text");
      if (box) {
        var cur = box.value.replace(/\s+$/, "");
        box.value = (cur ? cur + " " : "") + t.getAttribute("data-w");
        box.focus();
      }
      return;
    }
    if (t.id === "btn-p-clear") {
      var box2 = $("p-text");
      if (box2) box2.value = "";
      var fb0 = $("p-fb");
      if (fb0) { fb0.hidden = true; fb0.textContent = ""; }
      return;
    }
    if (t.id === "btn-p-check") {
      var p = data.practice.filter(function (x) { return x.id === state.practiceId; })[0];
      var box3 = $("p-text");
      var fb = $("p-fb");
      if (!p || !box3 || !fb) return;
      var ok = normSent(box3.value) === normSent(p.target);
      fb.hidden = false;
      if (ok) {
        fb.className = "hint-box ok";
        fb.textContent = "对啦！ " + p.target;
        if (state.practiceDone.indexOf(p.id) === -1) state.practiceDone.push(p.id);
        saveState();
        t.textContent = "再练一句也可以";
        t.id = "btn-p-again";
        var finish = document.createElement("button");
        finish.type = "button";
        finish.className = "btn btn-green btn-full";
        finish.id = "btn-finish";
        finish.textContent = "完成试读";
        finish.style.marginTop = "10px";
        t.parentNode.parentNode.appendChild(finish);
      } else {
        fb.className = "hint-box bad";
        fb.textContent = "再排一排看，目标句是：" + p.target;
      }
      return;
    }
    if (t.id === "btn-p-again") {
      state.practiceId = null;
      render();
      return;
    }
    if (t.id === "btn-p-skip" || t.id === "btn-finish") {
      renderDone();
      return;
    }
    if (t.id === "btn-reread") {
      state.view = "scene";
      state.scene = 0;
      state.openZh = {};
      state.afterStep = "questions";
      state.qIndex = 0;
      state.qRevealed = false;
      state.finished = false;
      state.inAfter = false;
      state.practiceId = null;
      render();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") closePopover();
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("sent")) {
      e.preventDefault();
      e.target.click();
    }
  }

  function initTts() {
    tts.supported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    if (tts.supported) {
      pickVoice();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = pickVoice;
      }
    }
  }

  function boot(json) {
    data = json;
    if (data.storageKey) STORAGE_KEY = data.storageKey;
    buildLex();
    loadState();
    if (state.scene > 5) state.scene = 0;
    initTts();
    document.body.addEventListener("click", onClick);
    document.body.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    if (isStoryHash()) {
      enterStory();
    } else {
      state.view = "hub";
    }
    render();
  }

  function fail(msg) {
    var el = $("main");
    if (el) el.innerHTML = '<div class="notice">' + esc(msg) + "</div>";
  }

  fetch("data.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(boot)
    .catch(function () { fail("故事数据加载失败，请刷新再试。"); });
})();
