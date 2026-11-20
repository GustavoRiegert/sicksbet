// Acesso aos CSVs no GitHub (servidor). O token fica só em variável de ambiente.
const SB = require('../lib/game.js');

const OWNER = process.env.GH_OWNER || 'GustavoRiegert';
const REPO = process.env.GH_REPO || 'sicksbet';
const BRANCH = process.env.GH_BRANCH || 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

const headers = () => {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'sicksbet' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return h;
};
const fail = (code, msg) => Object.assign(new Error(msg), { code });

async function getFile(path) {
  const r = await fetch(`${API}${path}?ref=${encodeURIComponent(BRANCH)}`, { headers: headers(), cache: 'no-store' });
  if (r.status === 404) return { text: '', sha: null };
  if (!r.ok) throw fail('GH', 'Erro ao ler o GitHub (' + r.status + ').');
  const j = await r.json();
  return { text: Buffer.from(j.content || '', 'base64').toString('utf8'), sha: j.sha };
}

async function putFile(path, text, sha, message) {
  const body = { message, content: Buffer.from(text, 'utf8').toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(API + path, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw fail('CONFLICT', 'Conflito ao gravar.');
  if (r.status === 401 || r.status === 403) throw fail('TOKEN', 'O servidor não tem permissão para gravar no GitHub (verifique o GITHUB_TOKEN).');
  if (!r.ok) throw fail('GH', 'Erro ao gravar no GitHub (' + r.status + ').');
}

async function loadFiles() {
  const out = {};
  await Promise.all(Object.keys(SB.FILES).map(async (k) => { out[k] = await getFile(SB.FILES[k].path); }));
  return out;
}
const stateOf = (files) => SB.parseState(Object.fromEntries(Object.keys(files).map((k) => [k, files[k].text])));

// Lê tudo → aplica a ação → grava só os arquivos que mudaram (repete se houver conflito).
async function runAction(action, payload) {
  if (!process.env.GITHUB_TOKEN) throw fail('CONFIG', 'Servidor sem GITHUB_TOKEN configurado.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const files = await loadFiles();
    const before = stateOf(files);
    const { state, msg, valor } = SB.applyAction(before, action, payload);
    try {
      for (const k of Object.keys(SB.FILES)) {
        const text = SB.toCSV(state[k], SB.FILES[k].cols);
        if (text !== SB.toCSV(before[k], SB.FILES[k].cols) || (!files[k].text && state[k].length)) {
          await putFile(SB.FILES[k].path, text, files[k].sha, 'SicksBET: ' + msg);
        }
      }
      return { state, valor };
    } catch (e) {
      if (e.code === 'CONFLICT' && attempt < 3) { await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); continue; }
      throw e;
    }
  }
  throw fail('CONFLICT', 'Muita gente gravando ao mesmo tempo. Tente de novo.');
}

module.exports = { loadFiles, stateOf, runAction, SB };
