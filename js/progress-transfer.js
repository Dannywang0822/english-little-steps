/* Explicit progress file. No network. Rejects secrets and bad dates before any write. */
(function (global) {
  "use strict";

  var FORMAT = "english-little-steps-bundle";
  var SCHEMA = 1;
  var MAX_BYTES = 900000;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var BACKENDS = { local: 1, cloudbase: 1, firebase: 1 };
  var FORBIDDEN = /password|token|secret|apikey|credential|authorization|serviceaccount|session/i;
  var DANGEROUS = { __proto__: 1, constructor: 1, prototype: 1 };

  function walk(value, path, errors) {
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

  function checkState(state, errors) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      errors.push("state must be an object");
      return;
    }
    ["lastActiveDate", "planStartedAt", "stage0PassedAt"].forEach(function (key) {
      if (state[key] != null && state[key] !== "" && !validDate(state[key])) errors.push("bad date " + key);
    });
    if (state.cards != null) {
      if (typeof state.cards !== "object" || Array.isArray(state.cards)) errors.push("cards");
      else Object.keys(state.cards).forEach(function (id) {
        var card = state.cards[id];
        if (!card || typeof card !== "object" || Array.isArray(card)) errors.push("card " + id);
        else {
          if (card.intervalIdx != null && typeof card.intervalIdx !== "number") errors.push("interval " + id);
          if (card.due != null && card.due !== "" && !validDate(card.due)) errors.push("due " + id);
        }
      });
    }
    if (state.sentences != null && !Array.isArray(state.sentences)) errors.push("sentences");
    if (state.checkins != null) {
      if (typeof state.checkins !== "object" || Array.isArray(state.checkins)) errors.push("checkins");
      else Object.keys(state.checkins).forEach(function (day) {
        if (!validDate(day)) errors.push("checkin " + day);
      });
    }
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
