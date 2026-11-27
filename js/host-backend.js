/* Host pick only. Pages stays Firebase. The self-hosted portal is not CloudBase.
   No config or secret is invented here. */
(function (global) {
  "use strict";

  var PROGRESS_URL = "/api/els/progress";
  var CHAT_URL = "/api/els/chat";
  var DEFAULT_LOGIN = "/login";

  function pageLocation() {
    try { return global.location || {}; } catch (e) { return {}; }
  }

  function isGithub(host) {
    return /github\.io$/i.test(String(host || ""));
  }

  function isPortalHost(host, path) {
    host = String(host || "");
    path = String(path || "");
    if (host === "43.142.236.188") return true;
    if (/(^|\.)dannywang\.cloud$/i.test(host)) return true;
    if (/^\/apps\/english-little-steps(\/|$)/.test(path)) return true;
    return false;
  }

  function portalFlag(loc) {
    if (global.__ELS_PORTAL__ === true) return true;
    if (global.__ELS_HOST__ === "portal") return true;
    return /(?:^|[?&])portal=1(?:&|$)/.test(String(loc.search || ""));
  }

  /* hostname/pathname arguments describe a host, not the current page flags.
     select() with no arguments uses this page, including the portal flag. */
  function select(hostname, pathname) {
    var loc = pageLocation();
    var explicit = arguments.length > 0;
    var host = hostname == null ? loc.hostname : hostname;
    var path = pathname == null ? (explicit ? "" : loc.pathname) : pathname;
    host = String(host || "");
    path = String(path || "");
    if (isGithub(host)) return "firebase";
    if (!explicit && portalFlag(loc)) return "portal";
    if (isPortalHost(host, path)) return "portal";
    return "cloudbase";
  }

  function portalLoginPath() {
    var custom = global.__ELS_PORTAL_LOGIN__;
    if (typeof custom === "string" && custom.charAt(0) === "/" && custom.indexOf("//") === -1 && custom.indexOf("\\") === -1) {
      return custom;
    }
    return DEFAULT_LOGIN;
  }

  global.HostBackend = {
    select: select,
    portalLoginPath: portalLoginPath,
    portalProgressUrl: PROGRESS_URL,
    portalChatUrl: CHAT_URL
  };
})(window);
