/* Núcleo compartilhado: CSV, armazenamento (GitHub ou local), pontuação e helpers de UI. */
(() => {
  'use strict';

  const CFG = Object.assign({ owner: '', repo: '', branch: 'main', adminPin: '1234' }, window.CFG || {});
  const TOKEN_KEY = 'sicksbet.token';
  const isGH = !!(CFG.owner && CFG.repo);

  const FILES = {
    apostas: { path: 'data/apostas.csv', cols: ['rodada', 'usuario', 'palpite', 'horario', 'valor', 'criado_em'] },
    emprestimos: { path: 'data/emprestimos.csv', cols: ['id', 'usuario', 'tipo', 'valor', 'criado_em'] },
    rodadas: { path: 'data/rodadas.csv', cols: ['rodada', 'amigo', 'combinado', 'status', 'veio', 'chegada'] },
  };
  const SEED = {
    apostas: [],
    emprestimos: [],
    rodadas: [{ rodada: '1', amigo: 'John Sick', combinado: '08:00', status: 'aberta', veio: '', chegada: '' }],
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- pontuação ---------- */
  const START = 100;
  const LOAN = { valor: 50, juros: 0.2, limiteSaldo: 20, maxDivida: 150 };
  const MULT = { exato: 5, max: 3, zeraEm: 90, nao: 2.5 };

  function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function toHHMM(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  // Multiplicador do palpite dado o resultado (null se a rodada ainda não acabou).
  function mult(a, r) {
    if (!r || r.status !== 'encerrada') return null;
    if (r.veio === 'nao') return a.palpite === 'nao' ? MULT.nao : 0;
    if (a.palpite !== 'sim') return 0;
    const g = toMin(a.horario), c = toMin(r.chegada);
    if (g === null || c === null) return 0;
    const d = Math.abs(g - c);
    if (d === 0) return MULT.exato;
    return Math.max(0, MULT.max * (1 - d / MULT.zeraEm));
  }
  // Pontos devolvidos (valor apostado × multiplicador).
  function score(a, r) {
    const m = mult(a, r);
    return m === null ? null : Math.round((Number(a.valor) || 0) * m);
  }
  function diffMin(a, r) {
    const g = toMin(a.horario), c = toMin(r.chegada);
    return g === null || c === null ? null : Math.abs(g - c);
  }
  const current = (rodadas) => rodadas.slice().sort((a, b) => Number(b.rodada) - Number(a.rodada))[0];

  function standings(rodadas, apostas, emp) {
    const byId = new Map(rodadas.map((r) => [r.rodada, r]));
    const map = new Map();
    const who = (nome) => {
      const k = nome.toLowerCase();
      if (!map.has(k)) map.set(k, { nome, saldo: START, divida: 0, liquido: START, jogos: 0, cravadas: 0 });
      return map.get(k);
    };
    (emp || []).forEach((e) => {
      const u = who(e.usuario), v = Number(e.valor) || 0;
      if (e.tipo === 'pegou') { u.saldo += v; u.divida += Math.round(v * (1 + LOAN.juros)); }
      else if (e.tipo === 'pagou') { u.saldo -= v; u.divida -= v; }
    });
    apostas.forEach((a) => {
      const u = who(a.usuario), r = byId.get(a.rodada);
      u.saldo -= Number(a.valor) || 0;
      const p = score(a, r);
      if (p === null) return;
      u.saldo += p; u.jogos += 1;
      if (mult(a, r) === MULT.exato) u.cravadas += 1;
    });
    const list = [...map.values()];
    list.forEach((u) => { u.liquido = u.saldo - u.divida; });
    return list.sort((x, y) => y.liquido - x.liquido || x.nome.localeCompare(y.nome));
  }
  function balanceOf(nome, rodadas, apostas, emp) {
    const u = standings(rodadas, apostas, emp).find((x) => x.nome.toLowerCase() === (nome || '').toLowerCase());
    return u || { nome, saldo: START, divida: 0, liquido: START };
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); if (row.some((x) => x !== '')) rows.push(row); }
    return rows;
  }
  function toObjects(text, cols) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const head = rows[0];
    return rows.slice(1).map((r) => {
      const o = {};
      cols.forEach((c) => { const i = head.indexOf(c); o[c] = i >= 0 ? (r[i] || '').trim() : ''; });
      return o;
    });
  }
  function toCSV(objs, cols) {
    const q = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    return [cols.join(','), ...objs.map((o) => cols.map((c) => q(String(o[c] == null ? '' : o[c]))).join(','))].join('\n') + '\n';
  }

  /* ---------- armazenamento ---------- */
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } };

  const b64enc = (s) => { const b = new TextEncoder().encode(s); let bin = ''; b.forEach((x) => { bin += String.fromCharCode(x); }); return btoa(bin); };
  const b64dec = (s) => { const bin = atob(s.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
  const err = (code, msg) => Object.assign(new Error(msg), { code });

  async function get(path) {
    if (!isGH) {
      let t = null; try { t = localStorage.getItem('sicksbet.csv.' + path); } catch (e) { /* ignore */ }
      return { text: t || '', sha: null };
    }
    const h = { Accept: 'application/vnd.github+json' };
    if (getToken()) h.Authorization = 'Bearer ' + getToken();
    const r = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${encodeURIComponent(CFG.branch)}&_=${Date.now()}`, { headers: h, cache: 'no-store' });
    if (r.status === 404) return { text: '', sha: null };
    if (r.status === 401) throw err('BAD_TOKEN', 'Chave de acesso inválida.');
    if (r.status === 403 || r.status === 429) throw err('RATE', 'Limite do GitHub atingido. Tente de novo em alguns minutos (ou informe a chave de acesso).');
    if (!r.ok) throw err('HTTP', 'Erro ao ler os dados (' + r.status + ').');
    const j = await r.json();
    return { text: b64dec(j.content || ''), sha: j.sha };
  }

  async function put(path, text, sha, msg) {
    if (!isGH) { try { localStorage.setItem('sicksbet.csv.' + path, text); } catch (e) { throw err('LOCAL', 'Não consegui salvar no navegador.'); } return; }
    const tk = getToken();
    if (!tk) throw err('NO_TOKEN', 'Informe a chave de acesso para gravar.');
    const body = { message: msg, content: b64enc(text), branch: CFG.branch };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, {
      method: 'PUT', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.status === 401 || r.status === 403) throw err('BAD_TOKEN', 'Chave de acesso inválida ou sem permissão.');
    if (r.status === 409 || r.status === 422) throw err('CONFLICT', 'Conflito ao gravar.');
    if (!r.ok) throw err('HTTP', 'Erro ao gravar (' + r.status + ').');
  }

  async function read(name) {
    const f = FILES[name];
    const { text } = await get(f.path);
    return text ? toObjects(text, f.cols) : clone(SEED[name]);
  }
  async function loadAll() {
    const [rodadas, apostas, emprestimos] = await Promise.all([read('rodadas'), read('apostas'), read('emprestimos')]);
    return { rodadas, apostas, emprestimos };
  }
  // Lê → aplica fn → grava (com novas tentativas se alguém gravou ao mesmo tempo).
  async function mutate(name, fn, msg) {
    const f = FILES[name];
    for (let a = 0; a < 4; a++) {
      const { text, sha } = await get(f.path);
      let rows = text ? toObjects(text, f.cols) : clone(SEED[name]);
      rows = fn(rows) || rows;
      try { await put(f.path, toCSV(rows, f.cols), sha, msg || 'SicksBET: atualiza ' + name); return rows; }
      catch (e) { if (e.code === 'CONFLICT' && a < 3) { await new Promise((r) => setTimeout(r, 400 * (a + 1))); continue; } throw e; }
    }
    return null;
  }

  /* ---------- UI ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' toast--err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }
  const openModal = (html) => { $('#modalBody').innerHTML = html; $('#modal').hidden = false; };
  const closeModal = () => { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; };

  function tokenModal(onSaved) {
    openModal(`
      <img src="assets/logo.webp" alt="" width="96" height="96">
      <h2 id="modalTitle">Chave de acesso</h2>
      <p>Para gravar no CSV do GitHub é preciso a chave que o gerente passou pra galera. Ela fica só neste aparelho.</p>
      <form class="form" id="tokenForm">
        <input class="inp" id="tokenInp" type="password" autocomplete="off" placeholder="github_pat_..." required>
        <button class="btn btn--go" type="submit">Salvar chave</button>
      </form>`);
    $('#tokenForm').addEventListener('submit', (e) => {
      e.preventDefault();
      setToken($('#tokenInp').value.trim()); closeModal(); onSaved && onSaved();
    });
  }
  // Trata erros de gravação: pede a chave quando necessário.
  function handleErr(e, retry) {
    if (e && (e.code === 'NO_TOKEN' || e.code === 'BAD_TOKEN')) { if (e.code === 'BAD_TOKEN') setToken(''); tokenModal(() => { toast('Chave salva. Tente de novo.'); retry && retry(); }); return; }
    toast((e && e.message) || 'Algo deu errado.', true);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  window.AB = { CFG, isGH, FILES, START, MULT, LOAN, mult, balanceOf, read, loadAll, mutate, score, diffMin, standings, current, toMin, toHHMM, getToken, setToken, $, esc, toast, openModal, closeModal, tokenModal, handleErr };
})();
