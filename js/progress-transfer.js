/* Explicit progress file. No network. Rejects secrets and bad dates before any write. */
(function (global) {
  "use strict";

  var FORMAT = "english-little-steps-bundle";
  var SCHEMA = 1;
  var MAX_BYTES = 900000;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var BACKENDS = { local: 1, cloudbase: 1, firebase: 1, portal: 1 };
  var FORBIDDEN = /password|token|secret|apikey|credential|authorization|serviceaccount|session/i;
  var DANGEROUS = { __proto__: 1, constructor: 1, prototype: 1 };

  function walk(value, path, errors) {
    if (typeof value === "string") {
      if (value.length > 2000) errors.push(path + " is too long");
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (value.length > 5000) errors.push(path + " is too long");
      for (var i = 0; i < value.length; i++) walk(value[i], path + "[" + i + "]", errors);
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (DANGEROUS[key] || FORBIDDEN.test(key)) errors.push("forbidden key " + key);
      walk(value[key], path + "." + key, errors);
    }
  }

  function validDate(value) {
    if (typeof value !== "string" || !DATE_RE.test(value)) return false;
    var p = value.split("-");
    var y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  var STATE_KEYS = {
    topicId: 1, cards: 1, daily: 1, streak: 1, lastActiveDate: 1, sentences: 1,
    activeDays: 1, checkins: 1, litCelebrated: 1, allLitCelebrated: 1,
    planStartedAt: 1, stage0PassedAt: 1, wn: 1, club: 1, _litSeeded: 1
  };
  var CARD_KEYS = {
    id: 1, intervalIdx: 1, due: 1, seen: 1, reviews: 1, remembers: 1, lastResult: 1,
    openOk: 1, lastReviewDate: 1, errors: 1, stubborn: 1, stubIdx: 1, consecRight: 1,
    mastered: 1, priority: 1, relearn: 1, fromClub: 1, updatedAt: 1
  };

  function smallInt(value, max) {
    return typeof value === "number" && value >= 0 && value <= max && Math.floor(value) === value;
  }

  function checkState(state, errors) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      errors.push("state must be an object");
      return;
    }
    Object.keys(state).forEach(function (key) {
      if (!STATE_KEYS[key]) errors.push("unknown state field " + key);
    });
    if (state.topicId != null && (typeof state.topicId !== "string" || state.topicId.length > 40)) errors.push("topicId");
    if (state.streak != null && !smallInt(state.streak, 10000)) errors.push("streak");
    ["lastActiveDate", "planStartedAt", "stage0PassedAt"].forEach(function (key) {
      if (state[key] != null && state[key] !== "" && !validDate(state[key])) errors.push("bad date " + key);
    });
    if (state.allLitCelebrated != null && typeof state.allLitCelebrated !== "boolean") errors.push("allLitCelebrated");
    if (state._litSeeded != null && typeof state._litSeeded !== "boolean") errors.push("_litSeeded");
    if (state.cards != null) {
      if (typeof state.cards !== "object" || Array.isArray(state.cards)) errors.push("cards");
      else {
        var ids = Object.keys(state.cards);
        if (ids.length > 800) errors.push("too many cards");
        ids.forEach(function (id) {
          if (id.length > 64) errors.push("card id");
          var card = state.cards[id];
          if (!card || typeof card !== "object" || Array.isArray(card)) errors.push("card " + id);
          else {
            Object.keys(card).forEach(function (key) {
              if (!CARD_KEYS[key]) errors.push("card field " + key);
            });
            if (card.intervalIdx != null && (typeof card.intervalIdx !== "number" || card.intervalIdx < -1 || card.intervalIdx > 20)) errors.push("interval " + id);
            ["due", "lastReviewDate", "relearn"].forEach(function (key) {
              if (card[key] != null && card[key] !== "" && !validDate(card[key])) errors.push(key + " " + id);
            });
            ["reviews", "remembers", "errors", "stubIdx", "consecRight"].forEach(function (key) {
              if (card[key] != null && !smallInt(card[key], 10000)) errors.push(key + " " + id);
            });
            ["seen", "openOk", "stubborn", "mastered", "priority"].forEach(function (key) {
              if (card[key] != null && typeof card[key] !== "boolean") errors.push(key + " " + id);
            });
            if (card.lastResult != null && (typeof card.lastResult !== "string" || card.lastResult.length > 40)) errors.push("lastResult " + id);
            if (card.fromClub != null && !smallInt(card.fromClub, 30)) errors.push("fromClub " + id);
          }
        });
      }
    }
    if (state.sentences != null) {
      if (!Array.isArray(state.sentences) || state.sentences.length > 500) errors.push("sentences");
      else state.sentences.forEach(function (sentence) {
        if (!sentence || typeof sentence !== "object") errors.push("sentence");
        else if (sentence.text != null && (typeof sentence.text !== "string" || sentence.text.length > 400)) errors.push("sentence text");
        else if (sentence.date != null && sentence.date !== "" && !validDate(sentence.date)) errors.push("sentence date");
      });
    }
    ["checkins", "activeDays"].forEach(function (key) {
      var bag = state[key];
      if (bag == null) return;
      if (typeof bag !== "object" || Array.isArray(bag) || Object.keys(bag).length > 2000) errors.push(key);
      else Object.keys(bag).forEach(function (day) {
        if (!validDate(day)) errors.push(key + " " + day);
      });
    });
    if (state.club != null) {
      if (typeof state.club !== "object" || Array.isArray(state.club)) errors.push("club");
      else if (state.club.episodes != null) {
        var episodes = state.club.episodes;
        if (typeof episodes !== "object" || Array.isArray(episodes) || Object.keys(episodes).length > 30) errors.push("episodes");
        else Object.keys(episodes).forEach(function (n) {
          var episode = episodes[n];
          if (!episode || typeof episode !== "object") errors.push("episode " + n);
          else if (episode.finishedAt != null && episode.finishedAt !== "" && !validDate(episode.finishedAt)) errors.push("finishedAt " + n);
          else if (episode.coverLearnDates != null && (!Array.isArray(episode.coverLearnDates) || episode.coverLearnDates.length > 8 || episode.coverLearnDates.some(function (day) { return !validDate(day); }))) errors.push("cover " + n);
        });
      }
    }
    if (state.daily != null && (typeof state.daily !== "object" || Array.isArray(state.daily))) errors.push("daily");
    else if (state.daily && state.daily.date != null && state.daily.date !== "" && !validDate(state.daily.date)) errors.push("daily date");
  }

  function validateImport(rawText) {
    var errors = [];
    if (typeof rawText !== "string") return { ok: false, errors: ["not text"], data: null };
    if (rawText.length > MAX_BYTES) return { ok: false, errors: ["file too large"], data: null };
    var data;
    try { data = JSON.parse(rawText); } catch (e) { return { ok: false, errors: ["not json"], data: null }; }
    if (!data || typeof data !== "object" || Array.isArray(data)) errors.push("shape");
    if (errors.length) return { ok: false, errors: errors, data: null };
    walk(data, "$", errors);
    if (data.format !== FORMAT) errors.push("format");
    if (data.schemaVersion !== SCHEMA) errors.push("schemaVersion");
    if (!data.bundle || typeof data.bundle !== "object" || Array.isArray(data.bundle)) errors.push("bundle");
    else {
      checkState(data.bundle.state, errors);
      if (data.bundle.logs != null && !Array.isArray(data.bundle.logs)) errors.push("logs");
      if (data.bundle.logs && data.bundle.logs.length > 120) errors.push("logs size");
      if (data.bundle.updatedAt != null && typeof data.bundle.updatedAt !== "number") errors.push("updatedAt");
    }
    if (data.source != null) {
      if (!data.source || typeof data.source !== "object" || Array.isArray(data.source)) errors.push("source");
      else {
        if (!BACKENDS[data.source.backend]) errors.push("backend");
        if (data.source.uid != null && (typeof data.source.uid !== "string" || data.source.uid.length > 128)) errors.push("uid");
      }
    }
    return { ok: errors.length === 0, errors: errors, data: errors.length ? null : data };
  }

  function preview(parsed, currentBackend, currentUid) {
    var state = (parsed.bundle && parsed.bundle.state) || {};
    var source = parsed.source || {};
    return {
      schemaVersion: parsed.schemaVersion,
      sourceBackend: source.backend || "",
      sourceUid: source.uid || "",
      currentBackend: currentBackend || "",
      currentUid: currentUid || "",
      cards: Object.keys(state.cards || {}).length,
      sentences: (state.sentences || []).length,
      checkins: Object.keys(state.checkins || {}).length,
      sameScope: !!(currentUid && source.uid && currentUid === source.uid && currentBackend === source.backend)
    };
  }

  function buildExport(bundle, source) {
    var copy = {
      format: FORMAT,
      schemaVersion: SCHEMA,
      exportedAt: new Date().toISOString(),
      source: { backend: (source && source.backend) || "local", uid: (source && source.uid) || "" },
      bundle: {
        state: bundle && bundle.state ? bundle.state : null,
        logs: bundle && bundle.logs ? bundle.logs.slice(0, 120) : [],
        tts: bundle && bundle.tts ? bundle.tts : null,
        updatedAt: bundle && typeof bundle.updatedAt === "number" ? bundle.updatedAt : Date.now()
      }
    };
    var text = JSON.stringify(copy);
    var checked = validateImport(text);
    if (!checked.ok) {
      var err = new Error("export rejected");
      err.errors = checked.errors;
      throw err;
    }
    return text;
  }

  global.ProgressTransfer = {
    FORMAT: FORMAT,
    SCHEMA: SCHEMA,
    validateImport: validateImport,
    preview: preview,
    buildExport: buildExport
  };
})(window);
