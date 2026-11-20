/* Regras do jogo, CSV e ações. Usado no navegador (window.SB) e no servidor (require). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.SB = m;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

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

  const START = 100;
  const LOAN = { valor: 50, juros: 0.2, limiteSaldo: 20, maxDivida: 150 };
  const MULT = { exato: 5, max: 3, zeraEm: 90, nao: 2.5 };

  /* ---------- horário ---------- */
  function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function toHHMM(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /* ---------- pontuação ---------- */
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
  function parseState(texts) {
    const st = {};
    Object.keys(FILES).forEach((k) => { st[k] = texts[k] ? toObjects(texts[k], FILES[k].cols) : clone(SEED[k]); });
    return st;
  }

  /* ---------- ações (validadas; rodam no servidor ou no modo local) ---------- */
  const ADMIN_ACTIONS = ['config', 'status', 'resultado', 'nova'];
  const rule = (msg) => Object.assign(new Error(msg), { code: 'RULE' });
  function cleanName(v) {
    const n = String(v == null ? '' : v).replace(/[,"\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!n) throw rule('Informe seu nome.');
    return n;
  }

  // Devolve { state, msg }. Lança erro (code 'RULE') se a ação não é permitida.
  function applyAction(input, action, p, nowIso) {
    const st = clone(input);
    p = p || {};
    const now = nowIso || new Date().toISOString();
    const r = current(st.rodadas);
    if (!r) throw rule('Nenhuma rodada criada.');

    if (action === 'palpite') {
      const nome = cleanName(p.usuario);
      if (r.status !== 'aberta') throw rule('As apostas já foram encerradas!');
      if (p.palpite !== 'sim' && p.palpite !== 'nao') throw rule('Escolha: vem ou não vem?');
      if (p.palpite === 'sim' && toMin(p.horario) === null) throw rule('Informe o horário do palpite.');
      const valor = Math.floor(Number(p.valor));
      if (!valor || valor < 1) throw rule('Informe quantos pontos quer apostar.');
      const same = (a) => a.rodada === r.rodada && a.usuario.toLowerCase() === nome.toLowerCase();
      const old = st.apostas.find(same);
      const disponivel = balanceOf(nome, st.rodadas, st.apostas, st.emprestimos).saldo + (old ? Number(old.valor) || 0 : 0);
      if (valor > disponivel) throw rule('Você não tem pontos suficientes.');
      st.apostas = st.apostas.filter((a) => !same(a));
      st.apostas.push({ rodada: r.rodada, usuario: old ? old.usuario : nome, palpite: p.palpite, horario: p.palpite === 'sim' ? toHHMM(toMin(p.horario)) : '', valor: String(valor), criado_em: now });
      return { state: st, msg: 'Palpite de ' + nome + ' na rodada ' + r.rodada };
    }

    if (action === 'emprestimo') {
      const nome = cleanName(p.usuario);
      const c = balanceOf(nome, st.rodadas, st.apostas, st.emprestimos);
      let valor;
      if (p.tipo === 'pegou') {
        if (c.saldo >= LOAN.limiteSaldo) throw rule('Você ainda tem pontos. Só empresta quem está quase zerado.');
        if (c.divida + Math.round(LOAN.valor * (1 + LOAN.juros)) > LOAN.maxDivida) throw rule('Sua dívida está alta demais. Pague antes de pegar mais.');
        valor = LOAN.valor;
      } else if (p.tipo === 'pagou') {
        valor = Math.min(c.divida, c.saldo);
        if (valor < 1) throw rule(c.divida < 1 ? 'Você não deve nada.' : 'Sem saldo para pagar.');
      } else throw rule('Ação inválida.');
      st.emprestimos.push({ id: String(Date.now()) + Math.floor(Math.random() * 1000), usuario: nome, tipo: p.tipo, valor: String(valor), criado_em: now });
      return { state: st, msg: (p.tipo === 'pegou' ? 'Empréstimo' : 'Pagamento') + ' de ' + nome, valor };
    }

    if (action === 'config') {
      const amigo = cleanName(p.amigo);
      if (toMin(p.combinado) === null) throw rule('Horário combinado inválido.');
      r.amigo = amigo; r.combinado = toHHMM(toMin(p.combinado));
      return { state: st, msg: 'Rodada ' + r.rodada + ': config' };
    }
    if (action === 'status') {
      if (r.status === 'encerrada') throw rule('A rodada já foi encerrada.');
      if (p.status !== 'aberta' && p.status !== 'fechada') throw rule('Status inválido.');
      r.status = p.status;
      return { state: st, msg: 'Rodada ' + r.rodada + ': apostas ' + (p.status === 'aberta' ? 'abertas' : 'fechadas') };
    }
    if (action === 'resultado') {
      const veio = p.veio === 'sim';
      if (!veio && p.veio !== 'nao') throw rule('Informe se ele veio.');
      if (veio && toMin(p.chegada) === null) throw rule('Informe o horário de chegada.');
      r.status = 'encerrada'; r.veio = veio ? 'sim' : 'nao'; r.chegada = veio ? toHHMM(toMin(p.chegada)) : '';
      return { state: st, msg: 'Rodada ' + r.rodada + ': resultado' };
    }
    if (action === 'nova') {
      if (r.status !== 'encerrada') throw rule('Encerre a rodada atual antes de abrir outra.');
      st.rodadas.push({ rodada: String(Number(r.rodada) + 1), amigo: r.amigo, combinado: r.combinado, status: 'aberta', veio: '', chegada: '' });
      return { state: st, msg: 'Nova rodada ' + (Number(r.rodada) + 1) };
    }
    throw rule('Ação desconhecida.');
  }

  return { FILES, SEED, START, LOAN, MULT, ADMIN_ACTIONS, toMin, toHHMM, mult, score, diffMin, current, standings, balanceOf, parseCSV, toObjects, toCSV, parseState, applyAction, clone };
});
