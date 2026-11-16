"use strict";
/* Lazy local Tesseract baseline. Its worker thread never runs on Express's event loop. */
function createEngine() {
  let worker, initializing;
  async function get() {
    if (worker) return worker;
    if (!initializing)
      initializing = (async () => {
        let lib, language;
        try {
          lib = require("tesseract.js");
          language = require("@tesseract.js-data/eng");
        } catch {
          throw new Error(
            "OCR engine is not installed. Run npm install in the project folder, then restart the server.",
          );
        }
        const instance = await lib.createWorker("eng", 1, {
          langPath: language.langPath,
          gzip: true,
          cacheMethod: "none",
        });
        await instance.setParameters({
          tessedit_pageseg_mode: lib.PSM.SINGLE_LINE,
          tessedit_char_whitelist: "0123456789:kKmM.,",
          preserve_interword_spaces: "0",
        });
        worker = instance;
        return instance;
      })().finally(() => {
        initializing = null;
      });
    return initializing;
  }
  return {
    async recognize(image) {
      const active = await get();
      let timeout;
      try {
        const { data } = await Promise.race([
          active.recognize(image),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    "OCR worker timed out. Verify the crop and start preview again.",
                  ),
                ),
              10000,
            );
          }),
        ]);
        return { rawText: data.text.trim(), score: data.confidence };
      } catch (error) {
        await active.terminate().catch(() => {});
        worker = null;
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
    async close() {
      if (initializing) await initializing.catch(() => {});
      if (worker) await worker.terminate();
      worker = null;
    },
  };
}
module.exports = { createEngine };
