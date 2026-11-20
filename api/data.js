const { loadFiles, stateOf } = require('./_store.js');

// GET /api/data -> { rodadas, apostas, emprestimos }
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.status(200).json(stateOf(await loadFiles()));
  } catch (e) {
    res.status(502).json({ error: e.message || 'Erro ao ler os dados.' });
  }
};
