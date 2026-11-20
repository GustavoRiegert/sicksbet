/* SicksBET — página dos jogadores. */
(() => {
  'use strict';
  const { $, esc, toast, openModal, closeModal, MULT, LOAN, START, mult, balanceOf, score, diffMin, standings, current, toMin, toHHMM } = AB;

  const NAME_KEY = 'sicksbet.me';
  let D = { rodadas: [], apostas: [], emprestimos: [] };
  let me = ''; try { me = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* ignore */ }
  let ui = { tab: 'apostar', pick: null, time: '', stake: 10, busy: false, loaded: false, error: '' };

  const cur = () => current(D.rodadas);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const myBet = (r) => D.apostas.find((a) => a.rodada === r.rodada && me && same(a.usuario, me));
  const pts = (n) => (n > 0 ? '+' : '') + n.toLocaleString('pt-BR');
  const xf = (m) => String(Math.round(m * 100) / 100).replace('.', ',') + 'x';
  const conta = () => balanceOf(me, D.rodadas, D.apostas, D.emprestimos);
  const saldo = () => conta().saldo;
  const disponivel = (r) => { const b = myBet(r); return saldo() + (b ? Number(b.valor) || 0 : 0); };
  const net = (a, r) => score(a, r) - (Number(a.valor) || 0);

  /* ---------- dados ---------- */
  async function load(silent) {
    try {
      D = await AB.loadAll(); ui.error = ''; ui.loaded = true;
      const b = cur() && myBet(cur());
      if (b && ui.pick === null) { ui.pick = b.palpite; ui.time = b.horario; ui.stake = Number(b.valor) || ui.stake; }
      if (!ui.time && cur()) ui.time = cur().combinado;
    } catch (e) { ui.error = e.message; ui.loaded = true; if (!silent) toast(e.message, true); }
    render();
  }

  async function submit() {
    const r = cur();
    if (!me) return askName();
    if (!ui.pick) return toast('Escolha: vem ou não vem?', true);
    if (ui.pick === 'sim' && toMin(ui.time) === null) return toast('Informe o horário do palpite.', true);
    const stake = Math.floor(Number(ui.stake));
    if (!stake || stake < 1) return toast('Informe quantos pontos quer apostar.', true);
    if (stake > disponivel(r)) return toast('Você não tem pontos suficientes.', true);
    ui.busy = true; render();
    try {
      const fresh = (await AB.read('rodadas')).find((x) => x.rodada === r.rodada);
      if (!fresh || fresh.status !== 'aberta') { toast('As apostas já foram encerradas!', true); return; }
      await AB.mutate('apostas', (rows) => {
        rows = rows.filter((x) => !(x.rodada === r.rodada && same(x.usuario, me)));
        rows.push({ rodada: r.rodada, usuario: me, palpite: ui.pick, horario: ui.pick === 'sim' ? ui.time : '', valor: String(stake), criado_em: new Date().toISOString() });
        return rows;
      }, `Palpite de ${me} na rodada ${r.rodada}`);
      toast('Palpite cravado! 🍀');
    } catch (e) { AB.handleErr(e, submit); }
    finally { ui.busy = false; await load(true); }
  }

  async function loanAction(tipo) {
    const c = conta();
    let valor;
    if (tipo === 'pegou') {
      if (c.saldo >= LOAN.limiteSaldo) return toast('Você ainda tem pontos. Só empresta quem está quase zerado.', true);
      if (c.divida + Math.round(LOAN.valor * (1 + LOAN.juros)) > LOAN.maxDivida) return toast('Sua dívida está alta demais. Pague antes de pegar mais.', true);
      valor = LOAN.valor;
    } else {
      valor = Math.min(c.divida, c.saldo);
      if (valor < 1) return toast(c.divida < 1 ? 'Você não deve nada.' : 'Sem saldo para pagar.', true);
    }
    ui.busy = true; render();
    try {
      await AB.mutate('emprestimos', (rows) => { rows.push({ id: String(Date.now()), usuario: me, tipo, valor: String(valor), criado_em: new Date().toISOString() }); return rows; }, `${tipo === 'pegou' ? 'Empréstimo' : 'Pagamento'} de ${me}`);
      toast(tipo === 'pegou' ? `+${valor} pontos emprestados. Você deve ${Math.round(valor * (1 + LOAN.juros))}.` : `Você pagou ${valor} da dívida.`);
    } catch (e) { AB.handleErr(e, () => loanAction(tipo)); }
    finally { ui.busy = false; await load(true); }
  }

  function bankCard() {
    if (!me) return '';
    const c = conta();
    const podePegar = c.saldo < LOAN.limiteSaldo && c.divida + Math.round(LOAN.valor * (1 + LOAN.juros)) <= LOAN.maxDivida;
    return `
      <section class="card">
        <div class="card__t">🏦 Banco do Sicks <small>dívida: ${c.divida.toLocaleString('pt-BR')}</small></div>
        <p class="meta">Zerou? Pegue ${LOAN.valor} pontos emprestados e devolva ${Math.round(LOAN.valor * (1 + LOAN.juros))} (juros de ${Math.round(LOAN.juros * 100)}%). Só vale com menos de ${LOAN.limiteSaldo} pontos. O ranking desconta a dívida.</p>
        <div class="btnrow">
          <button class="btn btn--ghost btn--sm" id="borrow" ${podePegar && !ui.busy ? '' : 'disabled'}>Pegar emprestado +${LOAN.valor}</button>
          <button class="btn btn--ghost btn--sm" id="repay" ${c.divida > 0 && c.saldo > 0 && !ui.busy ? '' : 'disabled'}>Pagar dívida</button>
        </div>
      </section>`;
  }

  /* ---------- views ---------- */
  function hero(r) {
    const st = { aberta: ['live', 'Apostas abertas'], fechada: ['live is-off', 'Apostas encerradas'], encerrada: ['live is-done', 'Rodada finalizada'] }[r.status] || ['live is-off', r.status];
    return `
      <section class="hero">
        <img src="assets/logo.webp" alt="Logo SicksBET" width="128" height="128">
        <div>
          <span class="${st[0]}">${st[1]}</span>
          <h1>O <em>${esc(r.amigo)}</em> vem hoje?</h1>
          <p>Rodada #${esc(r.rodada)} · Horário combinado: <b>${esc(r.combinado)}</b></p>
        </div>
      </section>`;
  }

  function resultText(r) {
    if (r.veio === 'nao') return `🚫 ${esc(r.amigo)} FUROU! Quem cravou "não vem" levou ${xf(MULT.nao)} o valor apostado.`;
    const late = toMin(r.chegada) - toMin(r.combinado);
    return `✅ ${esc(r.amigo)} chegou às <b>${esc(r.chegada)}</b> — ${late <= 0 ? 'pontual (milagre!)' : late + ' min de atraso'}.`;
  }

  function guessForm(r) {
    const open = r.status === 'aberta';
    const b = myBet(r);
    if (!open) {
      return `<section class="card"><div class="card__t">🎫 Seu palpite</div>${
        b ? `<div class="slip__pick"><span>${b.palpite === 'nao' ? esc(r.amigo) + ' não vem' : 'Chega às ' + esc(b.horario)} · ${esc(b.valor)} pts</span>${
          r.status === 'encerrada' ? `<em>recebeu ${score(b, r)} pts</em>` : '<em>travado 🔒</em>'}</div>` :
        '<p class="empty">Você não palpitou nesta rodada.</p>'}</section>`;
    }
    return `
      <section class="card">
        <div class="card__t">⚽ Faça seu palpite <small>${b ? 'você pode mudar até fechar' : 'um palpite por rodada'}</small></div>
        <div class="q">${esc(r.amigo)} vem hoje?</div>
        <div class="odds">
          <button class="odd ${ui.pick === 'sim' ? 'is-sel' : ''}" data-pick="sim"><span>Vem<small>cravando o horário</small></span><strong>até ${xf(MULT.exato)}</strong></button>
          <button class="odd odd--nao ${ui.pick === 'nao' ? 'is-sel' : ''}" data-pick="nao"><span>Não vem<small>vai furar de novo</small></span><strong>${xf(MULT.nao)}</strong></button>
        </div>
        ${ui.pick === 'sim' ? `
          <div class="sub">A que horas ele chega?</div>
          <div class="timebox">
            <button class="chip" data-nudge="-15">−15</button><button class="chip" data-nudge="-5">−5</button>
            <input class="inp inp--time" id="tm" type="time" value="${esc(ui.time)}" aria-label="Horário do palpite">
            <button class="chip" data-nudge="5">+5</button><button class="chip" data-nudge="15">+15</button>
          </div>` : ''}
        <div class="sub">Quantos pontos você aposta? <span class="bal">Disponível: ${disponivel(r).toLocaleString('pt-BR')}</span></div>
        <input class="inp" id="stake" type="number" inputmode="numeric" min="1" step="1" value="${esc(ui.stake)}" aria-label="Pontos apostados">
        <div class="chips">${[10, 25, 50].map((v) => `<button class="chip" data-stake="${v}">${v}</button>`).join('')}<button class="chip" data-stake="all">All-in 🔥</button></div>
        ${ui.pick ? `<div class="ret"><span>Retorno máximo</span><b id="ret">${Math.round((Number(ui.stake) || 0) * (ui.pick === 'sim' ? MULT.exato : MULT.nao)).toLocaleString('pt-BR')}</b></div>` : ''}
        <button class="btn btn--go" id="send" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Gravando…' : b ? 'Atualizar palpite' : 'Cravar palpite'}</button>
      </section>`;
  }

  function guessesCard(r) {
    const list = D.apostas.filter((a) => a.rodada === r.rodada);
    const done = r.status === 'encerrada';
    const rows = list.slice().sort((a, b) => done ? score(b, r) - score(a, r) : a.usuario.localeCompare(b.usuario));
    return `
      <section class="card">
        <div class="card__t">📣 Palpites da galera <small>${list.length} nesta rodada</small></div>
        ${rows.length ? `<ul class="list">${rows.map((a) => {
          const p = done ? score(a, r) : null;
          const d = done && a.palpite === 'sim' && r.veio === 'sim' ? diffMin(a, r) : null;
          return `<li class="row ${me && same(a.usuario, me) ? 'row--me' : ''}">
            <div class="row__main"><b>${esc(a.usuario)}</b><small>${a.palpite === 'nao' ? 'Não vem' : 'Chega às ' + esc(a.horario)} · apostou ${esc(a.valor || 0)}${d !== null ? ' · errou por ' + d + ' min' : ''}</small></div>
            ${done ? `<span class="row__pts">${pts(net(a, r))}</span>` : '<span class="tag tag--open">Aberta</span>'}</li>`;
        }).join('')}</ul>` : '<p class="empty">Ninguém palpitou ainda. Seja o primeiro!</p>'}
      </section>`;
  }

  function rulesCard() {
    return `
      <section class="card">
        <div class="card__t">📘 Como pontua</div>
        <ul class="rules">
          <li>Você começa com <em>${START} pontos</em> e aposta quanto quiser deles.</li>
          <li><b>Na mosca</b> (horário exato): <em>${xf(MULT.exato)}</em> o valor</li>
          <li>Errou por minutos: <em>até ${xf(MULT.max)}</em>, caindo até zero com ${MULT.zeraEm} min de erro</li>
          <li>Cravou "não vem" e ele furou: <em>${xf(MULT.nao)}</em></li>
          <li>Errou o "vem / não vem": perde o valor apostado</li>
        </ul>
      </section>`;
  }

  function viewApostar() {
    const r = cur();
    return `${hero(r)}
      ${r.status === 'fechada' ? `<div class="banner banner--info">⏳ Apostas encerradas. Aguardando o ${esc(r.amigo)} aparecer (ou não)...</div>` : ''}
      ${r.status === 'encerrada' ? `<div class="banner banner--win">${resultText(r)}</div>` : ''}
      <div class="grid grid--2">
        <div class="grid">${guessesCard(r)}</div>
        <div class="grid slip">${guessForm(r)}${bankCard()}${rulesCard()}</div>
      </div>`;
  }

  function viewRanking() {
    const list = standings(D.rodadas, D.apostas, D.emprestimos);
    return `${hero(cur())}
      <section class="card">
        <div class="card__t">🏆 Ranking geral <small>${list.length} apostador${list.length === 1 ? '' : 'es'}</small></div>
        ${list.length ? `<ul class="list">${list.map((u, i) => `
          <li class="row ${me && same(u.nome, me) ? 'row--me' : ''}">
            <span class="pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</span>
            <div class="row__main"><b>${esc(u.nome)} ${i === 0 ? '👑' : ''}</b><small>${u.jogos} rodada${u.jogos === 1 ? '' : 's'} · ${u.cravadas} na mosca${u.divida > 0 ? ' · deve ' + u.divida : ''}</small></div>
            <span class="row__pts">${u.liquido.toLocaleString('pt-BR')}</span>
          </li>`).join('')}</ul>` : '<p class="empty">Ninguém no ranking ainda.</p>'}
      </section>`;
  }

  function viewHistorico() {
    if (!me) return `${hero(cur())}<p class="empty">Entre com seu nome para ver o histórico.</p>`;
    const mine = D.apostas.filter((a) => same(a.usuario, me)).sort((a, b) => Number(b.rodada) - Number(a.rodada));
    const total = saldo();
    return `${hero(cur())}
      <div class="stats">
        <div class="stat"><b>${total.toLocaleString('pt-BR')}</b><small>Saldo</small></div>
        <div class="stat"><b>${mine.length}</b><small>Palpites</small></div>
        <div class="stat"><b>${(standings(D.rodadas, D.apostas, D.emprestimos).findIndex((u) => same(u.nome, me)) + 1) || '–'}º</b><small>Posição</small></div>
      </div>
      <section class="card"><div class="card__t">🎫 Meus palpites</div>
        ${mine.length ? `<ul class="list">${mine.map((a) => {
          const r = D.rodadas.find((x) => x.rodada === a.rodada) || {};
          const p = score(a, r);
          return `<li class="row"><div class="row__main"><b>${a.palpite === 'nao' ? 'Não vem' : 'Chega às ' + esc(a.horario)} · ${esc(a.valor || 0)} pts</b>
            <small>Rodada #${esc(a.rodada)} · ${r.status === 'encerrada' ? (r.veio === 'nao' ? 'ele furou' : 'chegou às ' + esc(r.chegada)) : 'em andamento'}</small></div>
            ${p === null ? '<span class="tag tag--open">Aberta</span>' : `<span class="tag tag--${p > 0 ? 'won' : 'lost'}">${p > 0 ? 'Pontuou' : 'Zerou'}</span><span class="row__pts">${pts(p - (Number(a.valor) || 0))}</span>`}</li>`;
        }).join('')}</ul>` : '<p class="empty">Você ainda não palpitou. O John Sick não vai se atrasar sozinho.</p>'}
      </section>`;
  }

  /* ---------- render ---------- */
  function render() {
    const nameEl = $('#walletName');
    $('#wallet').hidden = !me;
    if (me) {
      nameEl.textContent = me;
      const s = standings(D.rodadas, D.apostas, D.emprestimos).find((u) => same(u.nome, me));
      $('#walletPts').textContent = saldo().toLocaleString('pt-BR');
    }
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === ui.tab));
    const app = $('#app');
    if (!ui.loaded) { app.innerHTML = '<p class="empty">Carregando apostas…</p>'; return; }
    if (!cur()) { app.innerHTML = '<p class="empty">Nenhuma rodada criada ainda.</p>'; return; }
    const err = ui.error ? `<div class="banner banner--info">⚠️ ${esc(ui.error)} <button class="chip" id="retry">Tentar de novo</button></div>` : '';
    app.innerHTML = err + { apostar: viewApostar, ranking: viewRanking, historico: viewHistorico }[ui.tab]();
  }

  function askName() {
    openModal(`
      <img src="assets/logo.webp" alt="" width="96" height="96">
      <h2 id="modalTitle">Bem-vindo à SicksBET</h2>
      <p>Qual é o seu nome? Ele aparece no ranking.</p>
      <form class="form" id="nameForm">
        <input class="inp" id="nameInp" placeholder="Seu nome" maxlength="20" autocomplete="nickname" required>
        <button class="btn btn--go" type="submit">Entrar</button>
      </form>`);
    setTimeout(() => $('#nameInp') && $('#nameInp').focus(), 50);
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.closest('#nav')) { ui.tab = t.dataset.tab; window.scrollTo(0, 0); return render(); }
    if (t.id === 'wallet') {
      return openModal(`<h2 id="modalTitle">${esc(me)}</h2><p>Quer entrar com outro nome?</p>
        <div class="form"><button class="btn btn--ghost" id="logout">Trocar de usuário</button><button class="btn btn--ghost" id="closeModal">Fechar</button></div>`);
    }
    if (t.id === 'closeModal') return closeModal();
    if (t.id === 'logout') { me = ''; ui.pick = null; try { localStorage.removeItem(NAME_KEY); } catch (x) { /* ignore */ } closeModal(); render(); return askName(); }
    if (t.id === 'retry') return load();
    if (t.dataset.pick) { if (!me) return askName(); ui.pick = t.dataset.pick; return render(); }
    if (t.dataset.nudge) {
      const base = toMin(ui.time); ui.time = toHHMM((base === null ? toMin(cur().combinado) : base) + Number(t.dataset.nudge));
      return render();
    }
    if (t.dataset.stake) { ui.stake = t.dataset.stake === 'all' ? disponivel(cur()) : Number(t.dataset.stake); return render(); }
    if (t.id === 'borrow') return loanAction('pegou');
    if (t.id === 'repay') return loanAction('pagou');
    if (t.id === 'send') return submit();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'tm') ui.time = e.target.value;
    if (e.target.id === 'stake') { ui.stake = e.target.value; const x = $('#ret'); if (x) x.textContent = Math.round((Number(ui.stake) || 0) * (ui.pick === 'sim' ? MULT.exato : MULT.nao)).toLocaleString('pt-BR'); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'nameForm') return;
    e.preventDefault();
    const n = $('#nameInp').value.trim().replace(/\s+/g, ' ').replace(/[,"]/g, '');
    if (!n) return;
    me = n; try { localStorage.setItem(NAME_KEY, n); } catch (x) { /* ignore */ }
    closeModal(); toast('Bem-vindo, ' + n + '!'); load(true);
  });
  let last = 0;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > 30000) { last = Date.now(); load(true); } });

  render();
  load().then(() => { last = Date.now(); if (!me) askName(); });
})();
