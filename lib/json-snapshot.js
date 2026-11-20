"use strict";
const { createHash } = require("node:crypto");
const { gzipSync, constants } = require("node:zlib");
// For replace-on-write snapshots only (schedule POST replaces the whole object).
function createJSONSnapshot() {
  let previous, body, compressed, etag;
  return (req, res, value) => {
    if (!body || previous !== value) {
      const next = Buffer.from(JSON.stringify(value));
      const tag =
        'W/"' + createHash("sha256").update(next).digest("base64url") + '"';
      previous = value;
      body = next;
      compressed = null;
      etag = tag;
    }
    res
      .type("json")
      .set("Cache-Control", "no-cache")
      .set("ETag", etag)
      .vary("Accept-Encoding");
    if (req.fresh) return res.status(304).end();
    if (
      body.length >= 1024 &&
      req.get("Accept-Encoding") &&
      req.acceptsEncodings("gzip")
    ) {
      if (!compressed)
        compressed = gzipSync(body, { level: constants.Z_BEST_SPEED });
      res.set("Content-Encoding", "gzip");
      return res.send(compressed);
    }
    return res.send(body);
  };
}
module.exports = { createJSONSnapshot };
