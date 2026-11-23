/* Host pick only. Pages never uses CloudBase. No config is invented here. */
(function (global) {
  "use strict";

  function select(hostname) {
    var host = hostname;
    if (host == null) {
      try { host = global.location && global.location.hostname; } catch (e) { host = ""; }
    }
    host = String(host || "");
    if (/github\.io$/i.test(host)) return "firebase";
    return "cloudbase";
  }

  global.HostBackend = { select: select };
})(window);
