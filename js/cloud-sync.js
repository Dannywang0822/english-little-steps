/**
 * KetCloud — Phase1+2 sync scaffold (Firebase Auth + Firestore).
 * Loads only when window.__FIREBASE_CONFIG__ is a real (non-placeholder) config.
 * Without config: enabled=false; app stays on localStorage.
 *
 * Paths (see docs/cloud-sync-proposal.md):
 *   users/{uid}
 *   users/{uid}/meta/settings   — tts, activeTopicId, newCapShared
 *   users/{uid}/meta/progress   — streak, checkins, litCelebrated, daily, sentences...
 *   users/{uid}/cards/{chunkId}
 *   users/{uid}/logs/{autoId}
 *   users/{uid}/sentences/{autoId}
 */
(function (global) {
  "use strict";
  var DEBOUNCE_MS = 1500;
  var PLACEHOLDER = /YOUR_|REPLACE_|xxxxx/i;

  function isValidConfig(c) {
    if (!c || typeof c !== "object") return false;
    if (!c.apiKey || !c.projectId || !c.appId) return false;
    return !PLACEHOLDER.test(String(c.apiKey) + c.projectId + c.appId);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  var KetCloud = {
    enabled: false,
    ready: false,
    user: null,
    mode: "local", /* local | guest | cloud */
    _db: null,
    _auth: null,
    _timer: null,
    _hooks: { getLocalBundle: null, applyMerged: null, onAuth: null, confirmImport: null },

    configureHooks: function (h) {
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) this._hooks[k] = h[k];
    },

    /** Try load firebase-config.js then CDN; resolve with enabled bool */
    bootstrap: function () {
      var self = this;
      return self._loadConfig()
        .then(function (cfg) {
          if (!isValidConfig(cfg)) {
            self.enabled = false;
            self.ready = true;
            return false;
          }
          global.__FIREBASE_CONFIG__ = cfg;
          return self._initFirebase(cfg).then(function () {
            self.enabled = true;
            self.ready = true;
            return true;
          });
        })
        .catch(function (err) {
          console.warn("[KetCloud] bootstrap failed, staying local:", err && err.message);
          self.enabled = false;
          self.ready = true;
          return false;
        });
    },

    _loadConfig: function () {
      if (isValidConfig(global.__FIREBASE_CONFIG__)) {
        return Promise.resolve(global.__FIREBASE_CONFIG__);
      }
      return new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = "firebase-config.js";
        s.async = true;
        s.onload = function () {
          resolve(global.__FIREBASE_CONFIG__ || null);
        };
        s.onerror = function () {
          resolve(null); /* missing file = local mode */
        };
        document.head.appendChild(s);
      });
    },

    _initFirebase: function (cfg) {
      var self = this;
      var base = "https://www.gstatic.com/firebasejs/10.14.1/";
      return loadScript(base + "firebase-app-compat.js")
        .then(function () { return loadScript(base + "firebase-auth-compat.js"); })
        .then(function () { return loadScript(base + "firebase-firestore-compat.js"); })
        .then(function () {
          if (!global.firebase) throw new Error("firebase global missing");
          if (!firebase.apps.length) firebase.initializeApp(cfg);
          self._auth = firebase.auth();
          self._db = firebase.firestore();
          try {
            self._db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
          } catch (e) {}
          self._auth.onAuthStateChanged(function (u) {
            self.user = u;
            if (self._hooks.onAuth) self._hooks.onAuth(u);
          });
        });
    },

    register: function (email, password) {
      var self = this;
      if (!self.enabled) return Promise.reject(new Error("云端未配置"));
      return self._auth.createUserWithEmailAndPassword(email, password).then(function (cred) {
        var uid = cred.user.uid;
        return self._db.collection("users").doc(uid).set({
          email: email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          profile: { displayName: "小学员" }
        }, { merge: true }).then(function () { return cred.user; });
      });
    },

    login: function (email, password) {
      if (!this.enabled) return Promise.reject(new Error("云端未配置"));
      return this._auth.signInWithEmailAndPassword(email, password).then(function (c) { return c.user; });
    },

    logout: function () {
      var self = this;
      return self.flush().catch(function () {}).then(function () {
        if (self._auth) return self._auth.signOut();
      }).then(function () {
        self.user = null;
        self.mode = "local";
      });
    },

    currentUser: function () { return this.user || (this._auth && this._auth.currentUser) || null; },

    schedulePush: function () {
      var self = this;
      if (!self.enabled || !self.currentUser() || self.mode !== "cloud") return;
      clearTimeout(self._timer);
      self._timer = setTimeout(function () { self.flush().catch(function (e) { console.warn("[KetCloud] push", e); }); }, DEBOUNCE_MS);
    },

    flush: function () {
      var self = this;
      var u = self.currentUser();
      if (!self.enabled || !u || self.mode !== "cloud") return Promise.resolve();
      if (!self._hooks.getLocalBundle) return Promise.resolve();
      var bundle = self._hooks.getLocalBundle();
      return self._pushBundle(u.uid, bundle);
    },

    /** After cloud login: pull, maybe import wizard, merge, apply */
    syncAfterLogin: function () {
      var self = this;
      var u = self.currentUser();
      if (!u) return Promise.reject(new Error("未登录"));
      self.mode = "cloud";
      var local = self._hooks.getLocalBundle ? self._hooks.getLocalBundle() : null;
      return self._pullBundle(u.uid).then(function (cloud) {
        var localHas = self._bundleHasProgress(local);
        var cloudHas = self._bundleHasProgress(cloud);
        if (localHas && !cloudHas) {
          return self._askImport(true).then(function (ok) {
            if (ok) return self._pushBundle(u.uid, local).then(function () { return local; });
            return cloud || self._emptyBundle();
          });
        }
        if (localHas && cloudHas) {
          return self._askImport(false).then(function (merge) {
            if (merge === false) return cloud;
            return self._mergeBundles(local, cloud);
          }).then(function (merged) {
            return self._pushBundle(u.uid, merged).then(function () { return merged; });
          });
        }
        if (!localHas && cloudHas) return cloud;
        return local || self._emptyBundle();
      }).then(function (bundle) {
        if (self._hooks.applyMerged) self._hooks.applyMerged(bundle);
        return bundle;
      });
    },

    _askImport: function (cloudEmpty) {
      var msg = cloudEmpty
        ? "发现本机游客进度，是否导入到这个账号？"
        : "本机和云端都有进度，是否合并？（卡片取较新/更保守；打卡取并集；句子取较大值）";
      if (this._hooks.confirmImport) return Promise.resolve(this._hooks.confirmImport(msg, cloudEmpty));
      return Promise.resolve(window.confirm(msg));
    },

    _emptyBundle: function () {
      return { state: null, logs: [], tts: null, updatedAt: 0 };
    },

    _bundleHasProgress: function (b) {
      if (!b || !b.state) return false;
      var s = b.state;
      if (s.cards && Object.keys(s.cards).length) return true;
      if (s.sentences && s.sentences.length) return true;
      if (s.checkins && Object.keys(s.checkins).length) return true;
      if (s.daily && s.daily.newLearned) return true;
      return false;
    },

    _pullBundle: function (uid) {
      var db = this._db;
      var root = db.collection("users").doc(uid);
      return Promise.all([
        root.get(),
        root.collection("meta").doc("settings").get(),
        root.collection("meta").doc("progress").get(),
        root.collection("cards").get(),
        root.collection("logs").orderBy("timestamp", "desc").limit(120).get().catch(function () { return { empty: true, docs: [] }; }),
        root.collection("sentences").get().catch(function () { return { empty: true, docs: [] }; })
      ]).then(function (parts) {
        var userDoc = parts[0], settings = parts[1], progress = parts[2], cardsSnap = parts[3], logsSnap = parts[4], sentSnap = parts[5];
        if (!userDoc.exists && (!progress.exists)) {
          return null;
        }
        var prog = progress.exists ? progress.data() : {};
        var set = settings.exists ? settings.data() : {};
        var cards = {};
        cardsSnap.forEach(function (d) { cards[d.id] = d.data(); });
        var logs = [];
        if (logsSnap.forEach) logsSnap.forEach(function (d) { logs.push(d.data()); });
        var sentences = [];
        if (sentSnap.forEach) sentSnap.forEach(function (d) { sentences.push(d.data()); });
        var state = {
          topicId: set.activeTopicId || "school",
          cards: cards,
          daily: prog.daily || {},
          streak: prog.streak || 0,
          lastActiveDate: prog.lastActiveDate || null,
          sentences: sentences,
          activeDays: prog.activeDays || {},
          checkins: prog.checkinDays || prog.checkins || {},
          litCelebrated: prog.litCelebrated || {},
          allLitCelebrated: !!prog.allLitCelebrated,
          _litSeeded: true
        };
        return {
          state: state,
          logs: logs,
          tts: set.tts || null,
          updatedAt: (prog.updatedAtMs) || 0
        };
      });
    },

    _pushBundle: function (uid, bundle) {
      if (!bundle || !bundle.state) return Promise.resolve();
      var db = this._db;
      var root = db.collection("users").doc(uid);
      var s = bundle.state;
      var now = Date.now();
      var batch = db.batch();
      batch.set(root, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        profile: { displayName: "小学员" }
      }, { merge: true });
      batch.set(root.collection("meta").doc("settings"), {
        tts: bundle.tts || { slow: false, autoRead: true },
        activeTopicId: s.topicId || "school",
        newCapShared: false,
        updatedAtMs: now
      }, { merge: true });
      batch.set(root.collection("meta").doc("progress"), {
        streak: s.streak || 0,
        lastActiveDate: s.lastActiveDate || null,
        checkinDays: s.checkins || {},
        litCelebrated: s.litCelebrated || {},
        allLitCelebrated: !!s.allLitCelebrated,
        activeDays: s.activeDays || {},
        daily: s.daily || {},
        updatedAtMs: now
      }, { merge: true });
      return batch.commit().then(function () {
        var writes = [];
        var cards = s.cards || {};
        Object.keys(cards).forEach(function (id) {
          var c = Object.assign({}, cards[id]);
          if (!c.updatedAt) c.updatedAt = now;
          writes.push(root.collection("cards").doc(id).set(c, { merge: true }));
        });
        /* sentences: replace-ish — write each with stable id if present */
        (s.sentences || []).slice(-200).forEach(function (sent, i) {
          var sid = sent.id || ("s_" + (sent.ts || i) + "_" + (sent.chunkId || i));
          writes.push(root.collection("sentences").doc(String(sid)).set(sent, { merge: true }));
        });
        (bundle.logs || []).slice(0, 80).forEach(function (log) {
          var lid = log.id || ("l_" + (log.timestamp || Date.now()) + "_" + Math.random().toString(36).slice(2, 7));
          writes.push(root.collection("logs").doc(String(lid)).set(log, { merge: true }));
        });
        /* chunk writes to avoid huge Promise.all */
        var chain = Promise.resolve();
        for (var i = 0; i < writes.length; i += 40) {
          (function (chunk) {
            chain = chain.then(function () { return Promise.all(chunk); });
          })(writes.slice(i, i + 40));
        }
        return chain;
      });
    },

    _mergeBundles: function (local, cloud) {
      local = local || this._emptyBundle();
      cloud = cloud || this._emptyBundle();
      var ls = local.state || {};
      var cs = cloud.state || {};
      var cards = {};
      var ids = {};
      Object.keys(ls.cards || {}).forEach(function (k) { ids[k] = 1; });
      Object.keys(cs.cards || {}).forEach(function (k) { ids[k] = 1; });
      Object.keys(ids).forEach(function (id) {
        cards[id] = mergeCard(ls.cards && ls.cards[id], cs.cards && cs.cards[id]);
      });
      var checkins = Object.assign({}, cs.checkins || {}, ls.checkins || {});
      var lit = Object.assign({}, cs.litCelebrated || {}, ls.litCelebrated || {});
      var activeDays = Object.assign({}, cs.activeDays || {}, ls.activeDays || {});
      var sentences = mergeSentences(ls.sentences || [], cs.sentences || []);
      var tts = newerTts(local.tts, cloud.tts, local.updatedAt, cloud.updatedAt);
      var streak = Math.max(ls.streak || 0, cs.streak || 0);
      return {
        state: {
          topicId: ls.topicId || cs.topicId || "school",
          cards: cards,
          daily: mergeDaily(ls.daily, cs.daily),
          streak: streak,
          lastActiveDate: newerDate(ls.lastActiveDate, cs.lastActiveDate),
          sentences: sentences,
          activeDays: activeDays,
          checkins: checkins,
          litCelebrated: lit,
          allLitCelebrated: !!(ls.allLitCelebrated || cs.allLitCelebrated),
          _litSeeded: true
        },
        logs: (local.logs || []).concat(cloud.logs || []).slice(0, 120),
        tts: tts,
        updatedAt: Date.now()
      };
    }
  };

  function mergeCard(a, b) {
    if (!a) return Object.assign({}, b);
    if (!b) return Object.assign({}, a);
    var aU = a.updatedAt || 0, bU = b.updatedAt || 0;
    var newer = aU >= bU ? a : b;
    var older = aU >= bU ? b : a;
    var out = Object.assign({}, older, newer);
    /* conservative: higher errors, shorter due wins if close */
    out.errors = Math.max(a.errors || 0, b.errors || 0);
    if ((a.stubborn || b.stubborn)) out.stubborn = true;
    if (a.due && b.due) out.due = a.due < b.due ? a.due : b.due;
    var ia = typeof a.intervalIdx === "number" ? a.intervalIdx : -1;
    var ib = typeof b.intervalIdx === "number" ? b.intervalIdx : -1;
    if (Math.abs(aU - bU) < 2000) out.intervalIdx = Math.min(ia, ib);
    out.updatedAt = Math.max(aU, bU);
    return out;
  }

  function mergeSentences(a, b) {
    var map = {};
    a.concat(b).forEach(function (s) {
      var k = (s.topicId || "") + "|" + (s.chunkId || "") + "|" + (s.text || "");
      if (!map[k] || (s.ts || 0) > (map[k].ts || 0)) map[k] = s;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function mergeDaily(a, b) {
    if (!a) return b || {};
    if (!b) return a;
    if ((a.date || "") === (b.date || "")) {
      /* same day: prefer max counters, union topic maps */
      var out = Object.assign({}, b, a);
      out.newLearned = Math.max(a.newLearned || 0, b.newLearned || 0);
      out.topics = Object.assign({}, b.topics || {}, a.topics || {});
      return out;
    }
    return (a.date || "") > (b.date || "") ? a : b;
  }

  function newerTts(a, b, aU, bU) {
    if (!a) return b;
    if (!b) return a;
    return (aU || 0) >= (bU || 0) ? a : b;
  }

  function newerDate(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a >= b ? a : b;
  }

  global.KetCloud = KetCloud;
})(window);
