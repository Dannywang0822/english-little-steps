/**
 * Copy to cloudbase-config.js (or edit that file) and fill envId + accessKey.
 * envId and Publishable accessKey are public-by-design. Never put Admin / secret keys here.
 *
 * 1) CloudBase console → Environment → copy Environment ID
 * 2) Auth → enable username/password (email+password login path)
 * 3) For in-app register: enable email OTP (built-in sender) OR SMTP email verify
 * 4) Document DB → collection user_bundles, PRIVATE / auth.uid == doc._id
 * 5) Web → copy Publishable Key into accessKey (required for Web Auth)
 * 6) MVP domain: host on CloudBase static (*.tcloudbaseapp.com); see docs/cloudbase-domain.md
 */
window.__CLOUDBASE_CONFIG__ = {
  envId: "YOUR_ENV_ID",
  region: "ap-shanghai",
  accessKey: "YOUR_PUBLISHABLE_KEY"
};
