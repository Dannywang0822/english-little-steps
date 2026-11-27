/* Self-hosted portal progress. Same-origin cookie session. No second login.
   GET/PUT /api/els/progress. GitHub Pages never calls this. */
(function (global) {
  "use strict";

  var DEBOUNCE_MS = 1500;

  function progressUrl() {
    return (global.HostBackend && HostBackend.portalProgressUrl) || "/api/els/progress";
  }

  function hasProgress(bundle) {
    if (global.KetCloud && typeof KetCloud._bundleHasProgress === "function") {
      return KetCloud._bundleHasProgress(bundle);
    }
    return !!(bundle && bundle.state && bundle.state.cards && Object.keys(bundle.state.cards).length);
  }

  function fromBody(data) {
    if (!data || typeof data !== "object") return null;
    var uid = "";
    if (typeof data.uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.uid)) uid = data.uid;
    return {
      state: data.state || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tts: data.tts || null,
      updatedAt: data.updatedAtMs || data.updatedAt || 0,
      uid: uid
    };
  }

  function portalError(status, fallback) {
    var err = new Error(fallback || "门户进度暂时不可用");
    err.status = status;
    if (status === 401) err.code = "portal_unauthorized";
    return err;
  }

  function request(method, body) {
    if (typeof global.fetch !== "function") {
      return Promise.reject(portalError(0, "这个浏览器没有 fetch，进度只留在本机"));
    }
    var opts = {
      method: method,
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return global.fetch(progressUrl(), opts).then(function (res) {
      var type = "";
      try { type = (res.headers && res.headers.get && res.headers.get("content-type")) || ""; } catch (e) { type = ""; }
      if (res.status === 401) throw portalError(401, "请先在门户登录");
      /* GET 404 JSON (or no type) means this account has no bundle yet.
         An HTML 404 is a missing route, not an empty account. */
      if (res.status === 404 && method === "GET" && (type === "" || type.indexOf("json") !== -1)) return null;
      if (!res.ok) {
        throw portalError(res.status, res.status === 404 ? "进度接口还没打开。可以先在本机学习。" : "门户进度暂时不可用（" + res.status + "）");
      }
      if (method === "PUT") return null;
      if (type.indexOf("json") === -1) throw portalError(res.status, "请先在门户登录");
      return res.json().then(fromBody);
    });
  }

  var api = {
    enabled: false,
    ready: false,
    lastError: null,
    user: null,
    mode: "local",
    _hooks: {},
    _timer: null,
    _accountUid: "",

    configureHooks: function (hooks) {
      for (var key in hooks) if (Object.prototype.hasOwnProperty.call(hooks, key)) this._hooks[key] = hooks[key];
    },

    bootstrap: function () {
      var self = this;
      self.lastError = null;
      if (!global.HostBackend || HostBackend.select() !== "portal") {
        self.enabled = false;
        self.ready = true;
        self.user = null;
        return Promise.resolve(false);
      }
      return request("GET").then(function (bundle) {
        self.enabled = true;
        self.ready = true;
        self.lastError = null;
        self._accountUid = (bundle && bundle.uid) || "";
        self.user = { uid: self._accountUid, email: "", raw: null };
        self._cached = bundle;
        self._hasCache = true;
        return true;
      }).catch(function (err) {
        self.enabled = false;
        self.ready = true;
        self.user = null;
        self._cached = null;
        self.lastError = (err && err.message) || "请先在门户登录";
        return false;
      });
    },

    login: function () {
      return Promise.reject(portalError(401, "请到门户登录。这里不填写邮箱或验证码。"));
    },

    register: function () {
      return Promise.reject(portalError(401, "请到门户注册。这里不发验证码。"));
    },

    sendRegisterCode: function () {
      return Promise.reject(portalError(401, "这里不发验证码。"));
    },

    logout: function () {
      var self = this;
      return self.flush().catch(function () {}).then(function () {
        self.user = null;
        self.mode = "local";
      });
    },

    currentUser: function () { return this.user; },

    schedulePush: function () {
      var self = this;
      if (!self.enabled || !self.user || self.mode !== "cloud") return;
      clearTimeout(self._timer);
      self._timer = setTimeout(function () {
        self.flush().catch(function (err) { console.warn("[PortalProgress] push", err); });
      }, DEBOUNCE_MS);
    },

    flush: function () {
      var self = this;
      if (!self.enabled || !self.user || self.mode !== "cloud") return Promise.resolve();
      var bundle = self._hooks.getLocalBundle ? self._hooks.getLocalBundle() : null;
      if (!bundle || !bundle.state) return Promise.resolve();
      var now = Date.now();
      return request("PUT", {
        state: bundle.state,
        logs: (bundle.logs || []).slice(0, 120),
        tts: bundle.tts || null,
        updatedAt: now,
        updatedAtMs: now
      }).then(function () { return null; });
    },

    syncAfterLogin: function () {
      var self = this;
      if (!self.user) return Promise.reject(new Error("未登录门户"));
      self.mode = "cloud";
      var local = self._hooks.getLocalBundle ? self._hooks.getLocalBundle() : null;
      var pull = self._hasCache ? Promise.resolve(self._cached) : request("GET");
      self._cached = null;
      self._hasCache = false;
      return pull.then(function (cloud) {
        var localHas = hasProgress(local);
        var cloudHas = hasProgress(cloud);
        if (localHas && !cloudHas) {
          return ask(self, true).then(function (ok) {
            if (!ok) return cloud || emptyBundle();
            return self.flush().then(function () { return local; });
          });
        }
        if (localHas && cloudHas) {
          return ask(self, false).then(function (merge) {
            if (merge === false) return cloud;
            var merged = global.KetCloud && KetCloud._mergeBundles ? KetCloud._mergeBundles(local, cloud) : local;
            return writeMerged(self, merged).then(function () { return merged; });
          });
        }
        if (!localHas && cloudHas) return cloud;
        return local || emptyBundle();
      }).then(function (bundle) {
        if (self._hooks.applyMerged && bundle && bundle.state) self._hooks.applyMerged(bundle);
        return bundle;
      });
    }
  };

  function emptyBundle() {
    return { state: null, logs: [], tts: null, updatedAt: 0 };
  }

  function ask(self, empty) {
    var msg = empty
      ? "发现本机进度，是否导入到这个门户账号？"
      : "本机和门户都有进度，是否合并？取消则保留门户上的进度。";
    if (self._hooks.confirmImport) return Promise.resolve(self._hooks.confirmImport(msg, empty));
    return Promise.resolve(global.confirm ? global.confirm(msg) : false);
  }

  function writeMerged(self, bundle) {
    var now = Date.now();
    return request("PUT", {
      state: bundle.state,
      logs: (bundle.logs || []).slice(0, 120),
      tts: bundle.tts || null,
      updatedAt: now,
      updatedAtMs: now
    });
  }

  global.PortalProgress = api;
})(window);
