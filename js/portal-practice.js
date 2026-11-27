/* Optional bounded practice for the self-hosted portal. Not a daily check-in.
   POST /api/els/chat with the portal cookie. Pages does not mount this. */
(function (global) {
  "use strict";

  var MAX_TURNS = 10;
  var MAX_MS = 8 * 60 * 1000;
  var MAX_RECENT = 4;
  var MAX_INPUT = 400;
  var MAX_CHUNKS = 24;
  var CHARACTERS = ["Leo", "Mia", "Jay", "Alex", "Sam", "Ms. Reed"];

  var SYSTEM_PROMPT = [
    "You are a KET/A2 English practice partner for a child.",
    "Use American English. Keep each reply to 1–3 sentences.",
    "First recast the child's sentence more naturally.",
    "Point out only one key grammar or collocation issue per turn.",
    "Give one immediately imitable rewrite.",
    "A short Chinese explanation is allowed.",
    "In situational or role-play mode, recast with you, not I.",
    "In correction mode, you may recast in the first person.",
    "Use only these characters: Leo, Mia, Jay, Alex, Sam, Ms. Reed.",
    "Do not invent characters. Do not use the child's real name.",
    "If you are unsure of a usage, do not teach it.",
    "Stay inside the practice context: learned chunks, one unlocked Saturday Club scenario, or one pasted sentence.",
    "This is optional practice, not an open chatbot and not a daily check-in."
  ].join(" ");

  function chatUrl() {
    return (global.HostBackend && HostBackend.portalChatUrl) || "/api/els/chat";
  }

  function learnedChunks(state, topics, clubData) {
    var cards = (state && state.cards) || {};
    var byId = {};
    (topics || []).forEach(function (topic) {
      (topic.chunks || []).forEach(function (chunk) { if (chunk && chunk.id) byId[chunk.id] = chunk; });
    });
    var episodes = (clubData && clubData.episodes) || {};
    Object.keys(episodes).forEach(function (key) {
      (episodes[key].chunks || []).forEach(function (chunk) { if (chunk && chunk.id) byId[chunk.id] = chunk; });
    });
    var rows = [];
    Object.keys(cards).forEach(function (id) {
      var card = cards[id];
      var chunk = byId[id];
      if (!card || !card.seen || !chunk || !chunk.lemma) return;
      rows.push({
        lemma: String(chunk.lemma).slice(0, 40),
        gloss: String(chunk.gloss || "").slice(0, 20),
        updatedAt: card.updatedAt || 0
      });
    });
    rows.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    return rows.slice(0, MAX_CHUNKS).map(function (row) {
      return { lemma: row.lemma, gloss: row.gloss };
    });
  }

  function unlockedScenarios(club) {
    if (!club || typeof club.isUnlocked !== "function" || typeof club.episode !== "function") return [];
    var max = typeof club.slots === "function" ? club.slots() : 30;
    var list = [];
    var n, episode;
    for (n = 1; n <= max; n++) {
      if (!club.isUnlocked(n)) continue;
      episode = club.episode(n) || {};
      list.push({
        n: n,
        titleEn: String(episode.titleEn || "").slice(0, 80),
        titleZh: String(episode.titleZh || "").slice(0, 40)
      });
    }
    return list;
  }

  function allows(session, now) {
    now = now || Date.now();
    if (!session || typeof session.startedAt !== "number") return { ok: true };
    if (session.turns >= MAX_TURNS) return { ok: false, reason: "turns" };
    if (now - session.startedAt >= MAX_MS) return { ok: false, reason: "time" };
    return { ok: true };
  }

  function contextBlock(practice) {
    var lines = ["Practice context:", "Mode: " + practice.mode + "."];
    if (practice.mode === "scenario") {
      lines.push("Situational role-play. Recast with you, not I.");
      if (practice.scenario) {
        lines.push("Unlocked story only: " + practice.scenario.titleEn + " / " + practice.scenario.titleZh + ".");
      }
    } else if (practice.mode === "chunks") {
      lines.push("Correction mode. Recasting in the first person is allowed.");
      lines.push("Use only these learned chunks:");
      (practice.chunks || []).forEach(function (chunk) {
        lines.push("- " + chunk.lemma + (chunk.gloss ? " (" + chunk.gloss + ")" : ""));
      });
    } else {
      lines.push("Correction mode. The child pasted one sentence. Recasting in the first person is allowed.");
      lines.push("Do not open a new scene and do not add new target words.");
    }
    lines.push("Characters allowed: " + CHARACTERS.join(", ") + ".");
    return lines.join("\n");
  }

  function buildRequest(session, text, practice) {
    var history = (session && session.messages ? session.messages : []).filter(function (item) {
      return item && (item.role === "user" || item.role === "assistant");
    }).slice(-MAX_RECENT);
    var messages = [{ role: "system", content: SYSTEM_PROMPT + "\n\n" + contextBlock(practice) }];
    history.forEach(function (item) {
      messages.push({ role: item.role, content: String(item.content || "").slice(0, MAX_INPUT) });
    });
    messages.push({ role: "user", content: String(text || "").slice(0, MAX_INPUT) });
    return {
      messages: messages,
      practice: {
        mode: practice.mode,
        system: SYSTEM_PROMPT,
        characters: CHARACTERS.slice(),
        chunks: practice.mode === "chunks" ? (practice.chunks || []).slice(0, MAX_CHUNKS) : [],
        scenario: practice.mode === "scenario" ? practice.scenario : null
      }
    };
  }

  function postChat(payload) {
    return global.fetch(chatUrl(), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 401) {
        var denied = new Error("请先在门户登录");
        denied.code = "portal_unauthorized";
        throw denied;
      }
      var type = "";
      try { type = (res.headers && res.headers.get && res.headers.get("content-type")) || ""; } catch (e) { type = ""; }
      if (!res.ok || type.indexOf("json") === -1) {
        var bad = new Error("练习暂时不可用");
        bad.status = res.status;
        throw bad;
      }
      return res.json();
    }).then(function (data) {
      var reply = data && typeof data.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new Error("练习没有返回内容");
      return reply.slice(0, 600);
    });
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mount(root, hooks) {
    if (!root || root._mounted) return;
    root._mounted = true;
    hooks = hooks || {};
    var session = null;
    var sending = false;
    var mode = "rewrite";
    var scenarioN = 0;

    root.innerHTML =
      '<div class="ai-modes" role="tablist">' +
        '<button type="button" class="on" data-mode="rewrite">改写一句</button>' +
        '<button type="button" data-mode="chunks">已学词块</button>' +
        '<button type="button" data-mode="scenario">故事情景</button>' +
      '</div>' +
      '<label class="ai-scenario" hidden>已解锁的故事' +
        '<select id="ai-scenario"></select>' +
      '</label>' +
      '<textarea id="ai-input" maxlength="400" placeholder="贴一句英文，例如 I get up at seven."></textarea>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary" id="ai-send">请它改一改</button>' +
        '<button type="button" class="btn btn-ghost" id="ai-reset">重新开始</button></div>' +
      '<div class="ai-log" id="ai-log"></div>' +
      '<p class="ai-note" id="ai-cap">可选练习，不算今天的打卡。这次最多 10 轮，或 8 分钟。只用 Leo、Mia、Jay、Alex、Sam、Ms. Reed，不要写真名。</p>';

    var input = root.querySelector("#ai-input");
    var log = root.querySelector("#ai-log");
    var cap = root.querySelector("#ai-cap");
    var scenarioWrap = root.querySelector(".ai-scenario");
    var scenarioSelect = root.querySelector("#ai-scenario");

    function club() { return hooks.club ? hooks.club() : null; }
    function scenarios() { return unlockedScenarios(club()); }

    function fillScenarios() {
      var list = scenarios();
      scenarioSelect.innerHTML = list.map(function (item) {
        return '<option value="' + item.n + '">' + esc(item.titleZh || item.titleEn || ("Weekend " + item.n)) + "</option>";
      }).join("");
      scenarioN = list.length ? list[0].n : 0;
      scenarioWrap.hidden = mode !== "scenario";
    }

    function setMode(next) {
      mode = next;
      Array.prototype.forEach.call(root.querySelectorAll(".ai-modes button"), function (button) {
        button.classList.toggle("on", button.getAttribute("data-mode") === next);
      });
      if (next === "rewrite") input.placeholder = "贴一句英文，例如 I get up at seven.";
      if (next === "chunks") input.placeholder = "用刚学的词写一句，例如 I get up at seven.";
      if (next === "scenario") input.placeholder = "用故事里的人写一句，例如 Look at the board.";
      fillScenarios();
    }

    function note(text) { cap.textContent = text; }

    function addLine(kind, text) {
      var p = document.createElement("p");
      p.className = kind;
      p.textContent = text;
      log.appendChild(p);
      log.scrollTop = log.scrollHeight;
    }

    function practiceBody() {
      var body = { mode: mode, chunks: [], scenario: null };
      if (mode === "chunks") {
        body.chunks = learnedChunks(
          hooks.getState ? hooks.getState() : null,
          hooks.topics || [],
          hooks.clubData ? hooks.clubData() : null
        );
      }
      if (mode === "scenario") {
        var picked = scenarios().filter(function (item) { return item.n === scenarioN; })[0];
        body.scenario = picked || null;
      }
      return body;
    }

    function localBlock(text, practice) {
      if (!text) return "先写一句英文。";
      if (mode === "chunks" && !practice.chunks.length) return "还没有学过的词块。可以先去学习，或改用「改写一句」。";
      if (mode === "scenario" && !practice.scenario) return "这个故事还没解锁。请选已经能读的一篇，或改用「改写一句」。";
      var gate = !session || session.mode !== mode ? { ok: true } : allows(session, Date.now());
      if (!gate.ok) return gate.reason === "time" ? "这 8 分钟用完了。下次再练，不算打卡。" : "这 10 轮用完了。下次再练，不算打卡。";
      return "";
    }

    function closedCopy() {
      var gate = allows(session, Date.now());
      if (gate.ok) return "可选练习，不算今天的打卡。这次最多 10 轮，或 8 分钟。只用 Leo、Mia、Jay、Alex、Sam、Ms. Reed，不要写真名。";
      return gate.reason === "time" ? "这 8 分钟用完了。下次再练，不算打卡。" : "这 10 轮用完了。下次再练，不算打卡。";
    }

    root.querySelector(".ai-modes").addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("button");
      if (!button) return;
      setMode(button.getAttribute("data-mode"));
    });
    scenarioSelect.addEventListener("change", function () { scenarioN = +scenarioSelect.value || 0; });
    root.querySelector("#ai-reset").addEventListener("click", function () {
      session = null;
      sending = false;
      log.innerHTML = "";
      note(closedCopy());
    });
    root.querySelector("#ai-send").addEventListener("click", function () {
      if (sending) return;
      var text = String(input.value || "").trim().slice(0, MAX_INPUT);
      var practice = practiceBody();
      var blocked = localBlock(text, practice);
      if (blocked) { note(blocked); return; }
      if (!session) session = { mode: mode, startedAt: Date.now(), turns: 0, messages: [] };
      if (session.mode !== mode) {
        session = { mode: mode, startedAt: Date.now(), turns: 0, messages: [] };
        log.innerHTML = "";
      }
      sending = true;
      addLine("me", text);
      input.value = "";
      var payload = buildRequest(session, text, practice);
      var send = hooks.chat || postChat;
      Promise.resolve(send(payload)).then(function (reply) {
        session.messages.push({ role: "user", content: text });
        session.messages.push({ role: "assistant", content: reply });
        session.turns += 1;
        addLine("ai", reply);
        note(closedCopy());
      }).catch(function (err) {
        var code = err && err.code;
        note(code === "portal_unauthorized" ? "请先在门户登录，再来做这个练习。" : "这次没有改成。句子还在上面，可以再试一次。");
      }).then(function () { sending = false; });
    });

    setMode("rewrite");
  }

  global.PortalPractice = {
    LIMITS: { turns: MAX_TURNS, ms: MAX_MS, recent: MAX_RECENT, input: MAX_INPUT, chunks: MAX_CHUNKS },
    CHARACTERS: CHARACTERS.slice(),
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    learnedChunks: learnedChunks,
    unlockedScenarios: unlockedScenarios,
    allows: allows,
    buildRequest: buildRequest,
    mount: mount
  };
})(window);
