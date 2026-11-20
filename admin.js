/* SicksBET — página admin. */
(() => {
  'use strict';
  const { $, esc, toast, mult, score, diffMin, current, toMin } = AB;
  const PIN_KEY = 'sicksbet.admin';

  let D = { rodadas: [], apostas: [], emprestimos: [] };
  let ok = false; try { ok = sessionStorage.getItem(PIN_KEY) === '1'; } catch (e) { /* ignore */ }
  let loaded = false, error = '';
  const cur = () => current(D.rodadas);

  async function load(silent) {
    try { D = await AB.loadAll(); error = ''; } catch (e) { error = e.message; if (!silent) toast(e.message, true); }
    loaded = true; render();
  }

  // Aplica uma alteração na rodada atual e grava rodadas.csv.
  async function patchRound(changes, okMsg) {
    const id = cur().rodada;
    try {
      await AB.mutate('rodadas', (rows) => { const r = rows.find((x) => x.rodada === id); if (r) Object.assign(r, changes); return rows; }, `Rodada ${id}: ${Object.keys(changes).join(', ')}`);
      toast(okMsg || 'Salvo!');
    } catch (e) { AB.handleErr(e, () => patchRound(changes, okMsg)); }
    await load(true);
  }

  function preview() {
    const r = cur();
    const came = ($('#rCame') || {}).value === 'sim', time = ($('#rTime') || {}).value;
    const sim = { ...r, status: 'encerrada', veio: came ? 'sim' : 'nao', chegada: came ? time : '' };
    const list = D.apostas.filter((a) => a.rodada === r.rodada);
    if (!list.length) return '<p class="empty">Ninguém palpitou nesta rodada.</p>';
    return `<ul class="list">${list.map((a) => ({ a, p: score(a, sim) })).sort((x, y) => y.p - x.p).map(({ a, p }) => {
      const d = came && a.palpite === 'sim' ? diffMin(a, sim) : null;
      return `<li class="row"><div class="row__main"><b>${esc(a.usuario)}</b>
        <small>${a.palpite === 'nao' ? 'Não vem' : 'Chega às ' + esc(a.horario)} · apostou ${esc(a.valor || 0)}${d !== null ? ' · erro de ' + d + ' min' : ''}</small></div>
        <span class="row__pts">recebe ${p} <small style="color:var(--mute)">(${p - (Number(a.valor) || 0) >= 0 ? '+' : ''}${p - (Number(a.valor) || 0)})</small></span></li>`;
    }).join('')}</ul>`;
  }

  function view() {
    if (!ok) {
      return `<section class="card" style="max-width:420px;margin:8vh auto 0"><div class="card__t">🔐 Acesso do gerente</div>
        <form class="form" id="pinForm"><label class="f" for="pin">PIN</label>
        <input class="inp" id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">
        <button class="btn btn--go" type="submit">Entrar</button></form></section>`;
    }
    if (!loaded) return '<p class="empty">Carregando…</p>';
    const r = cur();
    const where = AB.isGH ? `GitHub: <b>${esc(AB.CFG.owner)}/${esc(AB.CFG.repo)}</b> (${esc(AB.CFG.branch)})` : 'Modo local (teste): dados só neste navegador';
    const n = D.apostas.filter((a) => a.rodada === r.rodada).length;
    const st = { aberta: 'Apostas abertas', fechada: 'Apostas fechadas', encerrada: 'Rodada encerrada' }[r.status] || r.status;
    return `
      ${error ? `<div class="banner banner--info">⚠️ ${esc(error)}</div>` : ''}
      <div class="stats">
        <div class="stat"><b>#${esc(r.rodada)}</b><small>Rodada</small></div>
        <div class="stat"><b>${n}</b><small>Palpites</small></div>
        <div class="stat"><b style="font-size:.95rem">${st}</b><small>Status</small></div>
      </div>
      <div class="grid grid--admin">
        <div class="grid">
          <section class="card"><div class="card__t">🎯 Resultado: a que horas ele chegou?</div>
            <form class="form" id="resForm">
              <div class="two">
                <div><label class="f" for="rCame">Ele veio?</label>
                  <select class="inp" id="rCame"><option value="sim" ${r.veio !== 'nao' ? 'selected' : ''}>Sim, veio</option><option value="nao" ${r.veio === 'nao' ? 'selected' : ''}>Não veio</option></select></div>
                <div><label class="f" for="rTime">Chegou às</label>
                  <input class="inp" id="rTime" type="time" value="${esc(r.chegada || r.combinado)}"></div>
              </div>
              <div class="sub" style="margin:4px 0 0">Prévia da pontuação</div>
              <div id="prev">${preview()}</div>
              <button class="btn btn--red" type="submit">${r.status === 'encerrada' ? 'Corrigir resultado' : 'Encerrar rodada e pontuar'}</button>
            </form>
            ${r.status === 'encerrada' ? '<div class="danger"><button class="btn btn--go" id="newRound">➕ Abrir nova rodada</button></div>' : ''}
          </section>
        </div>
        <div class="grid">
          <section class="card"><div class="card__t">⚙️ Rodada atual</div>
            <form class="form" id="cfgForm">
              <div class="two">
                <div><label class="f" for="cName">Nome do amigo</label><input class="inp" id="cName" value="${esc(r.amigo)}" maxlength="20"></div>
                <div><label class="f" for="cTime">Horário combinado</label><input class="inp" id="cTime" type="time" value="${esc(r.combinado)}"></div>
              </div>
              <button class="btn btn--ghost" type="submit">Salvar</button>
            </form>
            ${r.status !== 'encerrada' ? `<div class="danger"><button class="btn btn--ghost" id="toggle">${r.status === 'aberta' ? '🔒 Fechar apostas' : '🔓 Reabrir apostas'}</button></div>` : ''}
          </section>
          <section class="card"><div class="card__t">🏦 Dívidas e saldos</div>
            ${(() => { const l = AB.standings(D.rodadas, D.apostas, D.emprestimos); return l.length ? `<ul class="list">${l.map((u) => `<li class="row"><div class="row__main"><b>${esc(u.nome)}</b><small>saldo ${u.saldo} · deve ${u.divida}</small></div><span class="row__pts">${u.liquido}</span></li>`).join('')}</ul>` : '<p class="empty">Sem jogadores ainda.</p>'; })()}
          </section>
          <section class="card"><div class="card__t">🔑 Dados e acesso</div>
            <p class="meta">${where}</p>
            ${AB.isGH ? `<form class="form" id="tokenForm2"><label class="f" for="tk">Chave de acesso (token do GitHub)</label>
              <input class="inp" id="tk" type="password" autocomplete="off" placeholder="${AB.getToken() ? '•••••• salva neste aparelho' : 'github_pat_...'}">
              <div class="btnrow"><button class="btn btn--ghost btn--sm" type="submit">Salvar chave</button><button class="btn btn--ghost btn--sm" type="button" id="clearTk">Remover</button></div></form>` : ''}
            <div class="btnrow" style="margin-top:12px"><button class="btn btn--ghost btn--sm" id="refresh">🔄 Atualizar</button>
              <a class="btn btn--ghost btn--sm" href="data/apostas.csv" target="_blank" rel="noopener">apostas.csv</a>
              <a class="btn btn--ghost btn--sm" href="data/rodadas.csv" target="_blank" rel="noopener">rodadas.csv</a></div>
          </section>
        </div>
      </div>`;
  }

  function render() {
    $('#app').innerHTML = view();
    if ($('#prev')) $('#prev').innerHTML = preview(); // recalcula com os campos já na tela
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'toggle') return patchRound({ status: cur().status === 'aberta' ? 'fechada' : 'aberta' }, 'Status atualizado.');
    if (t.id === 'refresh') return load();
    if (t.id === 'clearTk') { AB.setToken(''); toast('Chave removida.'); return render(); }
    if (t.id === 'newRound') {
      const r = cur(), id = String(Number(r.rodada) + 1);
      try {
        await AB.mutate('rodadas', (rows) => { rows.push({ rodada: id, amigo: r.amigo, combinado: r.combinado, status: 'aberta', veio: '', chegada: '' }); return rows; }, 'Nova rodada ' + id);
        toast('Rodada #' + id + ' aberta!');
      } catch (er) { AB.handleErr(er); }
      await load(true);
    }
  });

  document.addEventListener('input', (e) => { if (e.target.id === 'rCame' || e.target.id === 'rTime') $('#prev').innerHTML = preview(); });
  document.addEventListener('change', (e) => { if (e.target.id === 'rCame') $('#prev').innerHTML = preview(); });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = e.target.id;
    if (id === 'pinForm') {
      if ($('#pin').value === String(AB.CFG.adminPin)) { ok = true; try { sessionStorage.setItem(PIN_KEY, '1'); } catch (x) { /* ignore */ } load(); }
      else toast('PIN incorreto.', true);
    } else if (id === 'cfgForm') {
      const n = $('#cName').value.trim().replace(/[,"]/g, ''), t = $('#cTime').value;
      if (!n || toMin(t) === null) return toast('Preencha nome e horário.', true);
      patchRound({ amigo: n, combinado: t }, 'Configuração salva.');
    } else if (id === 'resForm') {
      const came = $('#rCame').value === 'sim', time = $('#rTime').value;
      if (came && toMin(time) === null) return toast('Informe o horário de chegada.', true);
      if (confirm(came ? `Confirmar chegada às ${time} e pontuar todo mundo?` : 'Confirmar que ele NÃO veio e pontuar todo mundo?')) {
        patchRound({ status: 'encerrada', veio: came ? 'sim' : 'nao', chegada: came ? time : '' }, 'Pontuação calculada! 💰');
      }
    } else if (id === 'tokenForm2') {
      const v = $('#tk').value.trim(); if (!v) return;
      AB.setToken(v); toast('Chave salva neste aparelho.'); render();
    }
  });

  render();
  if (ok) load();
})();
