/* Núcleo do navegador: acesso aos dados (servidor /api ou modo local) e helpers de UI.
   As regras do jogo ficam em lib/game.js (window.SB). */
(() => {
  'use strict';

  const CFG = Object.assign({ api: true, repoUrl: '' }, window.CFG || {});
  const LOCAL_PIN = '1234'; // só no modo local de teste; em produção o PIN fica no servidor
  const host = location.hostname;
  // Em localhost (sem o servidor /api) usa o modo local: dados só neste navegador.
  const useApi = !!CFG.api && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && location.protocol !== 'file:';
  const SB = window.SB;
  const err = (code, msg) => Object.assign(new Error(msg), { code });

  /* ---------- admin PIN (guardado só na sessão da aba) ---------- */
  const PIN_KEY = 'sicksbet.pin';
  const getPin = () => { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } };
  const setPin = (p) => { try { p ? sessionStorage.setItem(PIN_KEY, p) : sessionStorage.removeItem(PIN_KEY); } catch (e) { /* ignore */ } };

  /* ---------- armazenamento ---------- */
  const lsKey = (k) => 'sicksbet.csv.' + SB.FILES[k].path;
  function localLoad() {
    const t = {};
    Object.keys(SB.FILES).forEach((k) => { try { t[k] = localStorage.getItem(lsKey(k)) || ''; } catch (e) { t[k] = ''; } });
    return SB.parseState(t);
  }
  function localSave(before, after) {
    Object.keys(SB.FILES).forEach((k) => {
      const text = SB.toCSV(after[k], SB.FILES[k].cols);
      if (text !== SB.toCSV(before[k], SB.FILES[k].cols)) localStorage.setItem(lsKey(k), text);
    });
  }

  async function loadAll() {
    if (!useApi) return localLoad();
    let r;
    try { r = await fetch('/api/data', { cache: 'no-store' }); } catch (e) { throw err('NET', 'Sem conexão com o servidor.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err('HTTP', j.error || 'Erro ao carregar os dados (' + r.status + ').');
    return j;
  }

  // Executa uma ação do jogo (palpite, empréstimo ou ação de admin).
  async function act(action, payload, opts) {
    const admin = SB.ADMIN_ACTIONS.includes(action) || action === 'admin-check';
    if (!useApi) {
      if (admin && ((opts && opts.pin) || getPin()) !== LOCAL_PIN) throw err('PIN', 'PIN incorreto.');
      if (action === 'admin-check') return { ok: true };
      const before = localLoad();
      const out = SB.applyAction(before, action, payload);
      try { localSave(before, out.state); } catch (e) { throw err('LOCAL', 'Não consegui salvar no navegador.'); }
      return { ok: true, state: out.state, valor: out.valor };
    }
    let r;
    try {
      r = await fetch('/api/act', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, pin: admin ? ((opts && opts.pin) || getPin()) : undefined }),
      });
    } catch (e) { throw err('NET', 'Sem conexão com o servidor.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(r.status === 401 ? 'PIN' : (j.code || 'HTTP'), j.error || 'Erro (' + r.status + ').');
    return j;
  }

  async function adminLogin(pin) {
    await act('admin-check', {}, { pin });
    setPin(pin);
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
  function handleErr(e) {
    if (e && e.code === 'PIN') setPin('');
    toast((e && e.message) || 'Algo deu errado.', true);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  window.AB = Object.assign({}, SB, { CFG, useApi, loadAll, act, adminLogin, getPin, setPin, $, esc, toast, openModal, closeModal, handleErr });
})();
