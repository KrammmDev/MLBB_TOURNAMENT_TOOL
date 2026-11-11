'use strict';
function installMatchRoutes(app, getStore) {
  function headers(res, revision) {
    res.set('ETag', revision);
    res.set('X-Match-Revision', revision);
    res.set('Cache-Control', 'no-store');
  }
  app.get('/api/matchdata', (req, res) => {
    const { data, revision } = getStore().snapshot();
    headers(res, revision);
    res.json(data); // Keep existing consumers' response shape.
  });
  async function save(req, res, patch) {
    try {
      const store = getStore();
      const expected = req.get('If-Match');
      const result = patch
        ? await store.patch(req.body?.changes, req.body?.guards, expected)
        : await store.replace(req.body, expected);
      headers(res, result.revision);
      res.json({ message: 'Match data saved', ...result });
    } catch (error) {
      const status = error.status || 503;
      if (status === 503) console.error('Match persistence failed:', error.message);
      res.status(status).json({
        message: status === 503 ? 'Match could not be saved. Check server storage and reload before retrying.' : error.message,
        conflicts: error.conflicts,
      });
    }
  }
  app.post('/api/matchdata', (req, res) => save(req, res, false));
  app.patch('/api/matchdata', (req, res) => save(req, res, true));
}
module.exports = { installMatchRoutes };
