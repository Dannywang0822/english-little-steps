/**
 * KetCloud — CloudBase Auth + document DB (mainland China).
 * Loads only when window.__CLOUDBASE_CONFIG__ has a real envId.
 * Without config: enabled=false; app stays on localStorage.
 *
 * MVP schema (single-doc bundle for speed; collections may still be created by HR):
 *   user_bundles/{uid}  — { state, logs, tts, updatedAt, email, updatedAtMs }
 *
 * Public API unchanged: bootstrap, register, login, logout, currentUser,
 * syncAfterLogin, schedulePush, flush, merge helpers, mode, hooks.
 * No Firebase dual-write.
 */
(function (global) {
  "use strict";
  var DEBOUNCE_MS = 1500;
  var PLACEHOLDER = /YOUR_|REPLACE_|xxxxx/i;
  var SDK_CDN = "https://static.cloudbase.net/cloudbase-js-sdk/3.0.1/cloudbase.full.js";
  var BUNDLE_COL = "user_bundles";

  function isValidConfig(c) {
    if (!c || typeof c !== "object") return false;
    if (!c.envId || typeof c.envId !== "string") return false;
    return !PLACEHOLDER.test(c.envId);
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

  function normalizeUser(u) {
    if (!u) return null;
    var uid = u.uid || u.id || u._id || (u.user && (u.user.uid || u.user.id)) || null;
    var email = u.email || (u.user && u.user.email) || "";
    if (!email && u.user_metadata) email = u.user_metadata.email || u.user_metadata.username || "";
    if (!uid) return null;
    return { uid: String(uid), email: email || "", raw: u };
  }

  function authError(err, fallback) {
    if (!err) return new Error(fallback || "云端错误");
    if (err instanceof Error) return err;
    var msg = err.message || err.msg || err.code || fallback || "云端错误";
    var e = new Error(String(msg));
    if (err.code) e.code = err.code;
    if (err.category) e.category = err.category;
    return e;
  }

  function unwrapAuth(res) {
    if (!res) return { data: null, error: new Error("空响应") };
    if (res.error) return { data: null, error: authError(res.error) };
    return { data: res.data != null ? res.data : res, error: null };
  }

  function docData(res) {
    if (!res) return null;
    var d = res.data;
    if (Array.isArray(d)) return d.length ? d[0] : null;
    if (d && typeof d === "object") return d;
    return null;
  }

  var KetCloud = {
    enabled: false,
    ready: false,
    user: null,
    mode: "local", /* local | guest | cloud */
    _app: null,
    _db: null,
    _auth: null,
    _timer: null,
    _hooks: { getLocalBundle: null, applyMerged: null, onAuth: null, confirmImport: null },

    configureHooks: function (h) {
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) this._hooks[k] = h[k];
    },

    /** Load cloudbase-config.js then CDN; resolve with enabled bool */
    bootstrap: function () {
      var self = this;
      return self._loadConfig()
        .then(function (cfg) {
          if (!isValidConfig(cfg)) {
            self.enabled = false;
            self.ready = true;
            return false;
          }
          global.__CLOUDBASE_CONFIG__ = cfg;
          return self._initCloudBase(cfg).then(function () {
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
      if (isValidConfig(global.__CLOUDBASE_CONFIG__)) {
        return Promise.resolve(global.__CLOUDBASE_CONFIG__);
      }
      return new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = "cloudbase-config.js";
        s.async = true;
        s.onload = function () {
          resolve(global.__CLOUDBASE_CONFIG__ || null);
        };
        s.onerror = function () {
          resolve(null);
        };
        document.head.appendChild(s);
      });
    },

    _initCloudBase: function (cfg) {
      var self = this;
      return loadScript(SDK_CDN).then(function () {
        var cb = global.cloudbase || global.cloud;
        if (!cb || typeof cb.init !== "function") {
          throw new Error("cloudbase global missing");
        }
        var initOpts = { env: cfg.envId, region: cfg.region || "ap-shanghai" };
        if (cfg.accessKey) initOpts.accessKey = cfg.accessKey;
        self._app = cb.init(initOpts);

        /* v2: auth(); v3: auth property — support both */
        var authRef = self._app.auth;
        if (typeof authRef === "function") {
          try {
            self._auth = self._app.auth({ persistence: "local" });
          } catch (e1) {
            self._auth = self._app.auth();
          }
        } else {
          self._auth = authRef;
        }
        if (!self._auth) throw new Error("CloudBase auth unavailable");

        self._db = typeof self._app.database === "function"
          ? self._app.database()
          : self._app.database;
        if (!self._db) throw new Error("CloudBase database unavailable");

        return self._bindAuthListener().then(function () {
          return self._hydrateSession();
        });
      });
    },

    _bindAuthListener: function () {
      var self = this;
      var auth = self._auth;
      try {
        if (typeof auth.onAuthStateChange === "function") {
          auth.onAuthStateChange(function (event, session) {
            var u = null;
            if (session && session.user) u = normalizeUser(session.user);
            else if (event === "SIGNED_OUT") u = null;
            self.user = u;
            if (self._hooks.onAuth) self._hooks.onAuth(u);
          });
          return Promise.resolve();
        }
        if (typeof auth.onLoginStateChanged === "function") {
          auth.onLoginStateChanged(function (params) {
            var et = params && params.data && params.data.eventType;
            if (et === "sign_out" || et === "credentials_error") {
              self.user = null;
            } else {
              self.user = normalizeUser(auth.currentUser || (params && params.user));
            }
            if (self._hooks.onAuth) self._hooks.onAuth(self.user);
          });
          return Promise.resolve();
        }
      } catch (e) {
        console.warn("[KetCloud] auth listener", e);
      }
      return Promise.resolve();
    },

    _hydrateSession: function () {
      var self = this;
      var auth = self._auth;
      /* v3 getSession */
      if (typeof auth.getSession === "function") {
        return auth.getSession().then(function (res) {
          var u = unwrapAuth(res);
          if (u.error) return;
          var sess = u.data && (u.data.session || u.data);
          var user = (sess && sess.user) || (u.data && u.data.user) || null;
          self.user = normalizeUser(user);
          if (self._hooks.onAuth) self._hooks.onAuth(self.user);
        }).catch(function () {});
      }
      /* v2 getLoginState / hasLoginState */
      if (typeof auth.getLoginState === "function") {
        return Promise.resolve(auth.getLoginState()).then(function (state) {
          var user = state && (state.user || state);
          if (state && state.loginType === undefined && !state.user && auth.currentUser) {
            user = auth.currentUser;
          }
          self.user = normalizeUser(user || auth.currentUser);
          if (self._hooks.onAuth) self._hooks.onAuth(self.user);
        }).catch(function () {});
      }
      if (auth.currentUser) {
        self.user = normalizeUser(auth.currentUser);
        if (self._hooks.onAuth) self._hooks.onAuth(self.user);
      }
      return Promise.resolve();
    },

    register: function (email, password) {
      var self = this;
      if (!self.enabled) return Promise.reject(new Error("云端未配置"));
      email = String(email || "").trim();
      password = String(password || "");
      if (!email || !password) return Promise.reject(new Error("请填写邮箱和密码"));
      if (password.length < 8) return Promise.reject(new Error("密码至少 8 位，且需包含字母和数字"));

      var auth = self._auth;

      /* Prefer Auth v3 signUp (may require email OTP if enabled in console) */
      if (typeof auth.signUp === "function") {
        return auth.signUp({ email: email, password: password }).then(function (res) {
          var u = unwrapAuth(res);
          if (u.error) throw u.error;
          var data = u.data || {};
          /* OTP gate: console has email OTP on — UI is password-only for now */
          if (typeof data.verifyOtp === "function") {
            var err = new Error("注册需要邮箱验证码，请在 CloudBase 控制台开启邮箱验证码（可用内置发信）后重试；或先用游客继续。");
            err.code = "otp_required";
            throw err;
          }
          var user = normalizeUser(data.user || (data.session && data.session.user) || data);
          if (!user) {
            /* Some builds return session only after verify; try password login */
            return self.login(email, password);
          }
          self.user = user;
          return self._ensureUserBundleMeta(user).then(function () { return user; });
        });
      }

      /* Legacy v1-style email register (sends activation mail; needs SMTP) */
      if (typeof auth.signUpWithEmailAndPassword === "function") {
        return auth.signUpWithEmailAndPassword(email, password).then(function () {
          var err = new Error("验证邮件已发送，请打开邮箱点击激活链接后再登录；也可先用游客继续。");
          err.code = "email_activation_sent";
          throw err;
        });
      }

      return Promise.reject(new Error("当前 SDK 不支持注册，请升级或检查 CloudBase 登录方式"));
    },

    login: function (email, password) {
      var self = this;
      if (!self.enabled) return Promise.reject(new Error("云端未配置"));
      email = String(email || "").trim();
      password = String(password || "");
      var auth = self._auth;

      function afterUser(user) {
        self.user = user;
        return user;
      }

      /* Auth v3 */
      if (typeof auth.signInWithPassword === "function") {
        return auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          var u = unwrapAuth(res);
          if (u.error) throw u.error;
          var data = u.data || {};
          var user = normalizeUser(data.user || (data.session && data.session.user) || data);
          if (!user) throw new Error("登录成功但未返回用户信息");
          return afterUser(user);
        });
      }

      /* Legacy email password */
      if (typeof auth.signInWithEmailAndPassword === "function") {
        return auth.signInWithEmailAndPassword(email, password).then(function (loginState) {
          var user = normalizeUser(
            (loginState && loginState.user) ||
            (loginState && loginState.data && loginState.data.user) ||
            auth.currentUser ||
            loginState
          );
          if (!user) throw new Error("登录成功但未返回用户信息");
          return afterUser(user);
        });
      }

      /* v2 unified signIn */
      if (typeof auth.signIn === "function") {
        return auth.signIn({ username: email, password: password }).then(function (loginState) {
          var user = normalizeUser((loginState && loginState.user) || auth.currentUser);
          if (!user) throw new Error("登录成功但未返回用户信息");
          return afterUser(user);
        });
      }

      return Promise.reject(new Error("当前 SDK 不支持密码登录"));
    },

    logout: function () {
      var self = this;
      return self.flush().catch(function () {}).then(function () {
        if (!self._auth) return;
        if (typeof self._auth.signOut === "function") {
          return self._auth.signOut().then(function (res) {
            if (res && res.error) throw authError(res.error);
          });
        }
      }).then(function () {
        self.user = null;
        self.mode = "local";
      });
    },

    currentUser: function () {
      if (this.user) return this.user;
      if (this._auth && this._auth.currentUser) {
        this.user = normalizeUser(this._auth.currentUser);
        return this.user;
      }
      return null;
    },

    schedulePush: function () {
      var self = this;
      if (!self.enabled || !self.currentUser() || self.mode !== "cloud") return;
      clearTimeout(self._timer);
      self._timer = setTimeout(function () {
        self.flush().catch(function (e) { console.warn("[KetCloud] push", e); });
      }, DEBOUNCE_MS);
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

    _ensureUserBundleMeta: function (user) {
      if (!user || !this._db) return Promise.resolve();
      var now = Date.now();
      return this._db.collection(BUNDLE_COL).doc(user.uid).set({
        email: user.email || "",
        profile: { displayName: "小学员" },
        updatedAtMs: now,
        updatedAt: now
      }).catch(function (e) {
        console.warn("[KetCloud] ensure meta", e);
      });
    },

    _pullBundle: function (uid) {
      var db = this._db;
      return db.collection(BUNDLE_COL).doc(uid).get().then(function (res) {
        var doc = docData(res);
        if (!doc) return null;
        /* Full bundle stored on the doc (MVP). Ignore meta-only rows. */
        if (!doc.state && !doc.logs && !doc.tts) {
          if (doc.updatedAtMs || doc.email) return null;
          return null;
        }
        return {
          state: doc.state || null,
          logs: Array.isArray(doc.logs) ? doc.logs : [],
          tts: doc.tts || null,
          updatedAt: doc.updatedAtMs || doc.updatedAt || 0
        };
      }).catch(function (err) {
        console.warn("[KetCloud] pull", err);
        /* Missing collection / permission → treat as empty cloud */
        return null;
      });
    },

    _pushBundle: function (uid, bundle) {
      if (!bundle || !bundle.state) return Promise.resolve();
      var db = this._db;
      var now = Date.now();
      var u = this.currentUser();
      var payload = {
        uid: uid,
        email: (u && u.email) || "",
        state: bundle.state,
        logs: (bundle.logs || []).slice(0, 120),
        tts: bundle.tts || null,
        updatedAt: now,
        updatedAtMs: now,
        profile: { displayName: "小学员" }
      };
      return db.collection(BUNDLE_COL).doc(uid).set(payload).catch(function (err) {
        console.warn("[KetCloud] push failed", err);
        throw authError(err, "云端暂存失败，本机进度已保存，稍后再试同步。");
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
