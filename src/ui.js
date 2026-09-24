/* ================= Rendering & input ================= */
const $ = id => document.getElementById(id);
const els = { seats: [], bets: [] };
const ui = { advice: null, amount: 0, tab: 'coach', chartPos: null };
const narrow = window.matchMedia('(max-width:640px)');
const stacked = window.matchMedia('(max-width:1060px)');

function setHTML(el, html) { if (el._h !== html) { el.innerHTML = html; el._h = html; } }
function cardHTML(c, size = '', extra = '') {
  return `<div class="card ${SUIT_CLASS[suitOf(c)]} ${size} ${extra}" role="img" aria-label="${RANK_NAME[rankOf(c)]} of ${SUIT_WORD[suitOf(c)]}"><span class="r">${rankLabel(rankOf(c))}</span><span class="s">${SUIT_SYM[suitOf(c)]}</span></div>`;
}
const backHTML = size => `<div class="card back ${size}" role="img" aria-label="Face-down card"></div>`;
const sigilHTML = p => p.human ? `<div class="sigil" style="--c:var(--paper)">Y</div>` : `<div class="sigil" style="--c:${PERSONAS[p.persona].color}">${PERSONAS[p.persona].sigil}</div>`;

function buildTable() {
  const t = $('table');
  G.players.forEach((p, i) => {
    const s = document.createElement('div');
    s.className = `seat s${i}${p.human ? ' hero' : ''}`;
    s.innerHTML = `<div class="hole"></div><div class="plate">${sigilHTML(p)}<div class="who"><b>${p.name}</b><span></span></div></div><div class="bubble"></div><div class="sd"></div>`;
    t.appendChild(s);
    els.seats[i] = { root: s, hole: s.querySelector('.hole'), stack: s.querySelector('.who span'), bubble: s.querySelector('.bubble'), sd: s.querySelector('.sd') };
    const b = document.createElement('div'); b.className = 'bet'; b.hidden = true; t.appendChild(b); els.bets[i] = b;
  });
  const d = document.createElement('div'); d.className = 'dbtn'; d.textContent = 'D'; d.setAttribute('aria-label', 'Dealer button');
  t.appendChild(d); els.dbtn = d;
}
function placeChips() {
  const m = narrow.matches;
  const BETS = m ? [[50, 67], [31, 62], [22, 31], [78, 31], [69, 62]] : [[50, 68], [24, 57], [31, 28], [69, 28], [76, 57]];
  const DB = m ? [[77, 80], [9, 52], [36, 12], [64, 12], [91, 52]] : [[63, 79], [19, 49], [33, 14], [67, 14], [81, 49]];
  els.bets.forEach((b, i) => { b.style.left = BETS[i][0] + '%'; b.style.top = BETS[i][1] + '%'; });
  els.dbtn.style.left = DB[G.dealer][0] + '%'; els.dbtn.style.top = DB[G.dealer][1] + '%';
}

function render() {
  renderTable(); renderKpis(); renderActions(); renderCoach();
  if (ui.tab === 'chart') renderChart();
  if (ui.tab === 'log') renderLog();
}

function renderTable() {
  const winners = new Set((G.result ? G.result.winners : []).map(w => w.id));
  G.players.forEach((p, i) => {
    const S = els.seats[i];
    const mine = !G.over && G.toAct === i && (G.thinking === i || (p.human && G.waitingHuman));
    S.root.classList.toggle('active', mine);
    S.root.classList.toggle('folded', p.folded && !p.human);
    S.root.classList.toggle('winner', G.over && winners.has(i));
    let cards = '';
    if (p.hole.length) {
      if (p.human) cards = p.hole.map(c => cardHTML(c, 'xl', p.folded ? 'dim' : '')).join('');
      else if (p.shown) cards = p.hole.map(c => cardHTML(c, 'sm')).join('');
      else if (!p.folded) cards = backHTML('sm') + backHTML('sm');
    }
    setHTML(S.hole, cards);
    setHTML(S.stack, `${p.allIn && !G.over ? 'All-in' : fmt(p.stack)} · <em class="ps">${positionOf(i)}</em>`);
    let bub = '', cls = 'bubble';
    if (G.thinking === i) bub = '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    else if (G.over && winners.has(i)) { bub = `Wins ${fmt(p.won)}`; cls += ' win'; }
    else { bub = p.lastAction; if (/bet|raise|all-in/i.test(bub)) cls += ' hot'; }
    S.bubble.className = cls; setHTML(S.bubble, bub);
    setHTML(S.sd, p.shown && p.handDesc ? `<span class="showname">${p.handDesc}</span>` : '');
    const b = els.bets[i];
    b.hidden = !(p.bet > 0);
    if (p.bet > 0) setHTML(b, `<span class="chip"></span>${fmt(p.bet)}`);
  });
  placeChips();
  const slots = [];
  for (let k = 0; k < 5; k++) slots.push(G.board[k] !== undefined ? cardHTML(G.board[k], 'lg') : '<div class="slot"></div>');
  setHTML($('board'), slots.join(''));
  $('street').textContent = G.over ? (G.result && G.board.length === 5 && G.players.filter(p => !p.folded).length > 1 ? 'Showdown' : 'Hand over') : STREETS[G.street];
  const pot = potNow();
  setHTML($('pot'), !G.over && pot > 0 ? `<span class="chip"></span>Pot ${fmt(pot)}` : '');
  const ban = $('banner');
  ban.hidden = !G.result;
  if (G.result) setHTML(ban, G.result.text.replace(/(You|The \w+)( wins?)/g, '<b>$1</b>$2'));
}

function renderKpis() {
  const h = G.players[0];
  $('kHand').textContent = G.handNo || '—';
  $('kStack').textContent = fmt(h.stack);
  const net = h.stack - START_STACK * h.buyins + (G.over ? 0 : h.total);
  const k = $('kNet');
  k.textContent = (net > 0 ? '+' : '') + fmt(net);
  k.className = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  $('kAgree').textContent = G.stats.decisions ? `${G.stats.agreed} of ${G.stats.decisions}` : '—';
}

/* ---------- action bar ---------- */
function myTurn() { return G.waitingHuman && G.toAct === 0 && !G.over; }
function raiseBounds() {
  const h = G.players[0];
  const max = h.bet + h.stack;
  const min = Math.min(G.currentBet + G.minRaise, max);
  const othersCanAct = G.players.some(p => !p.human && canAct(p));
  return { min, max, can: myTurn() && h.stack > G.currentBet - h.bet && othersCanAct };
}
function presetList() {
  const h = G.players[0];
  const max = h.bet + h.stack;
  const L = [];
  if (G.street === 0 && G.raiseCount === 0) L.push(['2.5 BB', clampTo(h, BB * 2.5)], ['3 BB', clampTo(h, BB * 3)], ['4 BB', clampTo(h, BB * 4)]);
  else if (G.street === 0) L.push(['3×', clampTo(h, G.currentBet * 3)], ['4×', clampTo(h, G.currentBet * 4)]);
  else L.push(['⅓ pot', potBet(h, 1 / 3)], ['½ pot', potBet(h, .5)], ['⅔ pot', potBet(h, 2 / 3)], ['Pot', potBet(h, 1)]);
  L.push(['All-in', max]);
  return L;
}
function setAmount(v) {
  const { min, max } = raiseBounds();
  v = Math.round(v / 5) * 5;
  if (v >= max || max - v < 5) v = max;
  ui.amount = Math.max(min, Math.min(max, v));
  renderActions();
}

function renderActions() {
  const h = G.players[0];
  const my = myTurn();
  const toCall = Math.max(0, G.currentBet - h.bet);
  $('bNext').hidden = !G.over;
  $('actBtns').hidden = G.over;
  $('sizer').hidden = G.over;
  $('bTip').disabled = !my;
  const st = $('status');
  if (G.over) setHTML(st, "<b>Hand over.</b> Deal the next one when you're ready.");
  else if (my) setHTML(st, `<b>Your turn.</b> ${toCall ? `${fmt(toCall)} to call` : 'No bet to you'} · pot ${fmt(potNow())}`);
  else if (h.folded) setHTML(st, 'You folded. Watch how the bots play it out.');
  else if (G.thinking >= 0) setHTML(st, `Waiting for <b>${G.players[G.thinking].name}</b>…`);
  else setHTML(st, h.allIn ? "You're all-in. Running out the board…" : 'Dealing…');

  const bF = $('bFold'), bC = $('bCall'), bR = $('bRaise');
  bF.disabled = !my || toCall === 0;
  bF.title = toCall === 0 ? 'Checking is free, so there is no reason to fold' : '';
  setHTML(bC, (toCall ? (toCall >= h.stack ? `Call all-in ${fmt(h.stack)}` : `Call ${fmt(toCall)}`) : 'Check') + '<kbd>C</kbd>');
  bC.disabled = !my;
  const rb = raiseBounds();
  if (ui.amount < rb.min || ui.amount > rb.max) ui.amount = rb.min;
  bR.disabled = !rb.can;
  const allIn = ui.amount >= rb.max;
  setHTML(bR, (allIn ? `All-in ${fmt(rb.max)}` : G.currentBet === 0 ? `Bet ${fmt(ui.amount)}` : `Raise to ${fmt(ui.amount)}`) + '<kbd>R</kbd>');
  const sz = $('sizer');
  sz.classList.toggle('off', !rb.can);
  const r = $('rAmt'), n = $('nAmt');
  r.min = rb.min; r.max = rb.max; r.value = ui.amount;
  n.min = rb.min; n.max = rb.max; if (document.activeElement !== n) n.value = ui.amount;
  r.disabled = n.disabled = !rb.can;
  const pl = rb.can ? presetList() : [];
  setHTML($('presets'), pl.map(([l, v]) => `<button class="preset" type="button" data-v="${v}"${v < rb.min ? ' disabled' : ''}>${l}</button>`).join(''));
}

function humanAct(type) {
  if (!myTurn()) return;
  let adv = ui.advice && ui.advice.decisionId === G.decisionId ? ui.advice : null;
  if (!adv) { try { adv = getAdvice(900); } catch (e) { adv = null; } }
  if (adv) {
    const j = judge(adv, type);
    G.stats.decisions++;
    if (j.level === 'good' || (adv.close && j.level !== 'leak')) G.stats.agreed++;
    if (j.level === 'leak') G.stats.leaks++;
    log(`Coach: ${j.text}`, j.level === 'leak' ? 'leak' : '');
    if ($('optAlerts').checked) showAlert(j.level, { good: 'Good play', ok: 'Worth knowing', leak: 'Leak' }[j.level], j.text);
    else $('alert').hidden = true;
  }
  act(G.players[0], type, type === 'raise' ? ui.amount : 0);
}
function showAlert(level, tag, text) {
  const a = $('alert');
  a.className = `alert ${level}`;
  a.innerHTML = `<span class="tag">${tag}</span><span>${text}</span>`;
  a.hidden = false;
}

function onHumanTurn() {
  const h = G.players[0];
  let d;
  if (G.street === 0 && G.raiseCount === 0) d = clampTo(h, BB * 2.5 + G.players.filter(p => !p.human && p.actions.some(a => a.type === 'call')).length * BB);
  else if (G.street === 0) d = clampTo(h, G.currentBet * 3);
  else d = potBet(h, 2 / 3);
  ui.amount = d;
  renderActions();
}
function onHandOver() { renderActions(); renderCoach(); }

function askCoach() {
  if (!myTurn()) return;
  const b = $('bTip');
  b.disabled = true;
  setHTML($('status'), '<b>The coach is thinking…</b> Simulating how this hand could run out.');
  setTimeout(() => {
    ui.advice = getAdvice(1600);
    selectTab('coach');
    render();
    if (stacked.matches) {
      const a = ui.advice;
      showAlert('tip', 'Coach', `<b>${a.verdict}.</b> ${a.summary} <a href="#coach" class="seewhy">See why ↓</a>`);
    }
  }, 30);
}

/* ---------- coach panel ---------- */
function renderCoach() {
  const pane = $('paneCoach');
  const a = ui.advice;
  if (!a || a.hand !== G.handNo) { setHTML(pane, idleHTML()); return; }
  setHTML(pane, tipHTML(a, a.decisionId === G.decisionId && !G.over));
}
function idleHTML() {
  const my = myTurn();
  return `<div class="stack">
    <div>
      <p class="eyebrow">${my ? 'Your turn' : G.over ? 'Between hands' : 'Watching the action'}</p>
      <h2 class="h2">${my ? 'Not sure? Ask the coach.' : 'Meet the table'}</h2>
      <p class="muted">${my ? 'Press <b>Ask the coach</b> (or T) for a recommendation based on your cards, the board, the pot odds and how each bot has played this hand.'
                            : 'Every bot has a style. Spotting a style and adjusting to it is most of what makes a winning player.'}</p>
    </div>
    <ul class="roster">${Object.values(PERSONAS).map(P => `<li><div class="sigil" style="--c:${P.color}">${P.sigil}</div><div><b>${P.name}</b><span class="tagline">${P.tag}</span><p>${P.blurb} <em>${P.beat}</em></p></div></li>`).join('')}</ul>
  </div>`;
}
function tipHTML(a, fresh) {
  const eq = a.equity, need = a.need;
  const meter = eq != null ? `<div class="meter"><p class="eyebrow">How often you win vs. what you need</p>
      <div class="meter-bar"><div class="meter-fill" style="width:${(eq * 100).toFixed(1)}%"></div>${need != null ? `<div class="meter-need" style="left:calc(${(need * 100).toFixed(1)}% - 1px)"></div>` : ''}</div>
      <div class="meter-legend"><span>Equity <b>${pctTxt(eq)}</b></span>${need != null ? `<span>Needed to call <b>${pctTxt(need)}</b></span>` : '<span>No bet to call</span>'}</div></div>` : '';
  const L = LESSONS[a.concept];
  return `<div class="tip stack${fresh ? '' : ' stale'}">
    ${fresh ? '' : `<p class="stale-note">${G.over ? 'This hand is over. Deal the next one to keep practising.' : 'The action has moved on. Ask again for a fresh read.'}</p>`}
    <div><p class="eyebrow">Coach says · ${STREETS[a.street]}</p><p class="verdict ${a.tone}">${a.verdict}</p><p class="summary">${a.summary}</p></div>
    ${meter}
    <div class="statgrid">${a.stats.map(s => `<div class="stat"><div class="k">${s.k}</div><div class="v${s.num ? ' num' : ''}">${s.v}${s.sub ? ` <small>${s.sub}</small>` : ''}</div></div>`).join('')}</div>
    <div><p class="eyebrow">Why</p><ul class="reasons">${a.reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>
    ${a.reads.length ? `<div><p class="eyebrow">Reading the table</p><div class="reads">${a.reads.map(r => `<div class="read"><div class="sigil" style="--c:${r.P.color}">${r.P.sigil}</div><div><b>${r.P.name}</b>${r.width < 1 ? `<span class="w">${pctTop(r.width)}</span>` : ''}<p>${r.line}</p></div></div>`).join('')}</div></div>` : ''}
    ${L ? `<div class="lesson"><p class="eyebrow">Lesson</p><h3>${L[0]}</h3><p>${L[1]}</p></div>` : ''}
  </div>`;
}

/* ---------- starting-hand chart ---------- */
function renderChart() {
  const heroPos = G.handNo ? positionOf(0) : 'BTN';
  const pos = ui.chartPos || (heroPos === 'BB' ? 'BTN' : heroPos);
  const w = OPEN_RANGE[pos];
  const h = G.players[0].hole;
  const mine = h.length === 2 ? handClass(h[0], h[1]) : null;
  let cells = '';
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
    const rr = 12 - r, cr = 12 - c;
    const key = r === c ? RANKS[rr] + RANKS[rr] : c > r ? RANKS[rr] + RANKS[cr] + 's' : RANKS[cr] + RANKS[rr] + 'o';
    const pct = PRE[key].pct, inR = pct <= w;
    cells += `<div class="${inR ? 'in' : ''}${key === mine ? ' me' : ''}" style="--a:${(1 - .5 * pct / w).toFixed(2)}" title="${key}: top ${Math.max(1, Math.round(pct * 100))}%">${key}</div>`;
  }
  const mineTxt = mine ? ` Your ${mine} is in the ${pctTop(PRE[mine].pct)}, <b>${PRE[mine].pct <= w ? 'inside' : 'outside'}</b> this range.` : '';
  setHTML($('paneChart'), `<div class="stack"><div>
      <p class="eyebrow">Opening ranges</p>
      <h2 class="h2">Which hands to raise first in</h2>
      <p class="muted">When nobody has raised yet, open-raise the highlighted hands and fold the rest. The later your position, the more hands you can play.</p>
      <div class="chart-pos" role="group" aria-label="Position">${['UTG', 'CO', 'BTN', 'SB'].map(p => `<button type="button" data-pos="${p}" aria-pressed="${p === pos}">${p}${p === heroPos ? ' · you' : ''}</button>`).join('')}</div>
      <div class="grid13" role="img" aria-label="Starting hand chart for ${POS_LONG[pos]}">${cells}</div>
      <div class="chart-key"><span><i style="background:var(--brass)"></i>Raise from ${pos}</span><span><i style="background:var(--panel-2)"></i>Fold</span><span>Suited above the diagonal, offsuit below</span></div>
    </div>
    <p class="muted">From ${POS_LONG[pos]}, open about the <b>${pctTop(w)}</b> of hands.${mineTxt} Facing a raise, play much tighter than this.</p></div>`);
}

/* ---------- history ---------- */
function renderLog() {
  const items = G.log.slice(-160).map(e => `<li class="${e.kind}">${e.kind === 'hand' ? e.text : e.text}</li>`).join('');
  const el = $('log'); const p = $('paneLog');
  const atBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 30;
  setHTML(el, items);
  if (atBottom) p.scrollTop = p.scrollHeight;
}

function selectTab(name) {
  ui.tab = name;
  for (const [t, pane] of [['coach', 'paneCoach'], ['chart', 'paneChart'], ['log', 'paneLog']]) {
    $('t' + cap(t)).setAttribute('aria-selected', String(t === name));
    $(pane).hidden = t !== name;
  }
  if (name === 'chart') renderChart();
  if (name === 'log') { renderLog(); $('paneLog').scrollTop = $('paneLog').scrollHeight; }
}

/* ---------- wiring ---------- */
function bind() {
  $('bFold').onclick = () => humanAct('fold');
  $('bCall').onclick = () => humanAct(G.currentBet - G.players[0].bet > 0 ? 'call' : 'check');
  $('bRaise').onclick = () => humanAct('raise');
  $('bTip').onclick = askCoach;
  $('bNext').onclick = () => { $('alert').hidden = true; ui.advice = null; startHand(); };
  $('rAmt').oninput = e => setAmount(+e.target.value);
  $('nAmt').onchange = e => setAmount(+e.target.value || 0);
  $('presets').onclick = e => { const b = e.target.closest('.preset'); if (b && !b.disabled) setAmount(+b.dataset.v); };
  $('tCoach').onclick = () => selectTab('coach');
  $('tChart').onclick = () => selectTab('chart');
  $('tLog').onclick = () => selectTab('log');
  $('paneChart').onclick = e => { const b = e.target.closest('[data-pos]'); if (b) { ui.chartPos = b.dataset.pos; renderChart(); } };
  $('alert').onclick = e => { if (e.target.closest('.seewhy')) { e.preventDefault(); selectTab('coach'); $('coach').scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  if (read('pc-fast') === '1') $('optFast').checked = true;
  if (read('pc-alerts') === '0') $('optAlerts').checked = false;
  G.fast = $('optFast').checked;
  $('optFast').onchange = e => { G.fast = e.target.checked; store('pc-fast', e.target.checked ? '1' : '0'); };
  $('optAlerts').onchange = e => { store('pc-alerts', e.target.checked ? '1' : '0'); if (!e.target.checked) $('alert').hidden = true; };
  narrow.addEventListener('change', placeChips);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'f' && !$('bFold').disabled) $('bFold').click();
    else if (k === 'c' && !$('bCall').disabled) $('bCall').click();
    else if (k === 'r' && !$('bRaise').disabled) $('bRaise').click();
    else if (k === 't' && !$('bTip').disabled) $('bTip').click();
    else if (k === 'n' && !$('bNext').hidden) $('bNext').click();
  });
}

makePlayers();
G.dealer = Math.floor(Math.random() * N);
buildTable();
bind();
startHand();
