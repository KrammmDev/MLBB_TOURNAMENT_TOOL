(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.CasterVDO = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function safeURL(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    if (value.length > 2048) return "";
    try {
      const u = new URL(value.trim());
      if (
        u.protocol !== "https:" ||
        u.hostname !== "vdo.ninja" ||
        u.port ||
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        !u.searchParams.get("view") ||
        u.searchParams.has("push") ||
        u.searchParams.has("room")
      )
        return "";
      return u.href;
    } catch {
      return "";
    }
  }
  function embedURL(value) {
    const url = safeURL(value);
    if (!url) return "";
    const u = new URL(url);
    u.searchParams.set("autostart", "");
    u.searchParams.set("cleanoutput", "");
    return u.href;
  }
  return { safeURL, embedURL };
});
