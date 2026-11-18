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
        u.searchParams.has("push")
      )
        return "";
      return u.href;
    } catch {
      return "";
    }
  }
  function embedURL(value) {
    return safeURL(value);
  }
  return { safeURL, embedURL };
});
