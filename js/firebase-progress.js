/* Pages-only Firebase adapter. Absent or placeholder config stays local. No invented keys. */
(function (global) {
  "use strict";

  var SDK = "11.6.0";
  var COL = "englishLittleSteps";
  var app = null;
  var auth = null;
  var db = null;
  var mods = null;

  function config() {
    return global.__FIREBASE_CONFIG__ || null;
  }

  var ENGLISH_APP_ID = "1:1097055286825:web:48491debc167064026ce38";

  function configReady(c) {
    if (!c || typeof c !== "object") return false;
    var keys = ["apiKey", "authDomain", "projectId", "appId"];
    for (var i = 0; i < keys.length; i++) {
      var value = c[keys[i]];
      if (typeof value !== "string" || !value || /YOUR_|REPLACE_|xxxxx/i.test(value)) return false;
    }
    return c.projectId === "english-subject-ket" && c.appId === ENGLISH_APP_ID;
  }

  function userOf(user) {
    if (!user || !user.uid) return null;
    return { uid: String(user.uid), email: user.email || "", raw: null };
  }

  var api = {
    enabled: false,
    ready: false,
    lastError: null,
    user: null,
    mode: "local",
    _hooks: {},
    _timer: null,

    configureHooks: function (hooks) {
      for (var key in hooks) if (Object.prototype.hasOwnProperty.call(hooks, key)) this._hooks[key] = hooks[key];
    },

    bootstrap: function () {
      var self = this;
      if (!global.HostBackend || HostBackend.select() !== "firebase") {
        self.enabled = false;
        self.ready = true;
        self.lastError = null;
        return Promise.resolve(false);
      }
      return loadConfigScript().then(function () {
        if (!configReady(config())) {
          self.enabled = false;
          self.ready = true;
          self.lastError = "Firebase 网页配置还没放上，进度只留在这台浏览器。";
          return false;
        }
        return loadSdk().then(function (loaded) {
          mods = loaded;
          app = mods.initializeApp(config());
          auth = mods.getAuth(app);
          db = mods.getFirestore(app);
          return new Promise(function (resolve) {
            var first = true;
            mods.onAuthStateChanged(auth, function (user) {
              self.user = userOf(user);
              if (self._hooks.onAuth) self._hooks.onAuth(self.user);
              if (first) {
                first = false;
                self.enabled = true;
                self.ready = true;
                self.lastError = null;
                resolve(true);
              }
            });
          });
        });
      }).catch(function (err) {
        self.enabled = false;
        self.ready = true;
        self.lastError = (err && err.message) || "Firebase 没有连上";
        return false;
      });
    },

    register: function (email, password) {
      var self = this;
      if (!self.enabled || !auth) return Promise.reject(new Error(self.lastError || "云端未就绪"));
      return mods.createUserWithEmailAndPassword(auth, String(email || "").trim(), String(password || "")).then(function (cred) {
        self.user = userOf(cred.user);
        return self.user;
      });
    },

    login: function (email, password) {
      var self = this;
      if (!self.enabled || !auth) return Promise.reject(new Error(self.lastError || "云端未就绪"));
      return mods.signInWithEmailAndPassword(auth, String(email || "").trim(), String(password || "")).then(function (cred) {
        self.user = userOf(cred.user);
        return self.user;
      });
    },

    logout: function () {
      var self = this;
      return self.flush().catch(function () {}).then(function () {
        if (auth && mods) return mods.signOut(auth);
      }).then(function () {
        self.user = null;
        self.mode = "local";
      });
    },

    currentUser: function () { return this.user; },

    schedulePush: function () {
      var self = this;
      if (!self.enabled || !self.user || self.mode !== "cloud") return;
      clearTimeout(self._timer);
      self._timer = setTimeout(function () { self.flush().catch(function () {}); }, 1500);
    },

    flush: function () {
      var self = this;
      if (!self.enabled || !self.user || self.mode !== "cloud" || !db) return Promise.resolve();
      var bundle = self._hooks.getLocalBundle ? self._hooks.getLocalBundle() : null;
      if (!bundle || !bundle.state) return Promise.resolve();
      var ref = mods.doc(db, COL, self.user.uid);
      var payload = {
        schemaVersion: 1,
        app: "english-little-steps",
        uid: self.user.uid,
        state: bundle.state,
        logs: (bundle.logs || []).slice(0, 120),
        tts: bundle.tts || {},
        updatedAtMs: Date.now()
      };
      return mods.setDoc(ref, payload);
    },

    syncAfterLogin: function () {
      var self = this;
      if (!self.user) return Promise.reject(new Error("未登录"));
      self.mode = "cloud";
      var local = self._hooks.getLocalBundle ? self._hooks.getLocalBundle() : null;
      var ref = mods.doc(db, COL, self.user.uid);
      return mods.getDoc(ref).then(function (snap) {
        var cloud = snap.exists() ? fromDoc(snap.data()) : null;
        var localHas = !!(local && local.state && local.state.cards && Object.keys(local.state.cards).length);
        var cloudHas = !!(cloud && cloud.state && cloud.state.cards && Object.keys(cloud.state.cards).length);
        if (localHas && !cloudHas) {
          return ask(self, true).then(function (ok) {
            if (!ok) return cloud || { state: null, logs: [], tts: null, updatedAt: 0 };
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
        return local || { state: null, logs: [], tts: null, updatedAt: 0 };
      }).then(function (bundle) {
        if (self._hooks.applyMerged && bundle && bundle.state) self._hooks.applyMerged(bundle);
        return bundle;
      });
    }
  };

  function ask(self, empty) {
    var msg = empty ? "发现本机进度，是否导入到这个 Firebase 账号？" : "本机和这个 Firebase 账号都有进度，是否合并？取消则保留云端。";
    if (self._hooks.confirmImport) return Promise.resolve(self._hooks.confirmImport(msg, empty));
    return Promise.resolve(global.confirm ? global.confirm(msg) : false);
  }

  function fromDoc(data) {
    if (!data) return null;
    return {
      state: data.state || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tts: data.tts || null,
      updatedAt: data.updatedAtMs || 0
    };
  }

  function writeMerged(self, bundle) {
    var ref = mods.doc(db, COL, self.user.uid);
    return mods.setDoc(ref, {
      schemaVersion: 1,
      app: "english-little-steps",
      uid: self.user.uid,
      state: bundle.state,
      logs: (bundle.logs || []).slice(0, 120),
      tts: bundle.tts || {},
      updatedAtMs: Date.now()
    });
  }

  function loadConfigScript() {
    if (configReady(config())) return Promise.resolve();
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      script.src = "firebase-config.js";
      script.onload = function () { resolve(); };
      script.onerror = function () { resolve(); };
      document.head.appendChild(script);
    });
  }

  function loadSdk() {
    var base = "https://www.gstatic.com/firebasejs/" + SDK + "/";
    return Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js")
    ]).then(function (parts) {
      return {
        initializeApp: parts[0].initializeApp,
        getAuth: parts[1].getAuth,
        createUserWithEmailAndPassword: parts[1].createUserWithEmailAndPassword,
        signInWithEmailAndPassword: parts[1].signInWithEmailAndPassword,
        signOut: parts[1].signOut,
        onAuthStateChanged: parts[1].onAuthStateChanged,
        getFirestore: parts[2].getFirestore,
        doc: parts[2].doc,
        getDoc: parts[2].getDoc,
        setDoc: parts[2].setDoc
      };
    });
  }

  global.FirebaseProgress = api;
})(window);
