/* ================= Rendering & input ================= */
const $ = id => document.getElementById(id);
const els = { seats: [], bets: [] };
const ui = { advice: null, amount: 0, tab: 'coach', chartPos: null };
const narrow = window.matchMedia('(max-width:640px)');
const stacked = window.matchMedia('(max-width:1060px)');

function setHTML(el, html) { if (el._h !== html) { el.innerHTML = html; el._h = html; } }
function cardHTML(c, extra = '') {
  const s = suitOf(c);
  return `<div class="card ${SUIT_CLASS[s]} ${extra}" role="img" aria-label="${RANK_NAME[rankOf(c)]} of ${SUIT_WORD[s]}"><span class="r">${rankLabel(rankOf(c))}</span><span class="cs">${SUIT_SYM[s]}</span><span class="cb">${SUIT_SYM[s]}</span></div>`;
}
const backHTML = () => '<div class="card back" role="img" aria-label="Face-down card"></div>';
const avatarHTML = p => p.human
  ? `<div class="avatar" style="--c:var(--accent);font-family:var(--suit)" aria-hidden="true">${SUIT_SYM[0]}</div>`
  : `<div class="avatar" style="--c:${PERSONAS[p.persona].color}" aria-hidden="true">${PERSONAS[p.persona].sigil}</div>`;

/* ---------- table ---------- */
function buildTable() {
  const t = $('table');
  G.players.forEach((p, i) => {
    const s = document.createElement('div');
    s.className = `seat s${i}${p.human ? ' hero' : ''}`;
    s.innerHTML = `<div class="cards"></div><div class="plate">${avatarHTML(p)}<div class="meta"><span class="nm">${p.name}</span><span class="stk"></span></div></div><div class="pill"></div>`;
    t.appendChild(s);
    els.seats[i] = { root: s, cards: s.querySelector('.cards'), stk: s.querySelector('.stk'), pill: s.querySelector('.pill') };
    const b = document.createElement('div'); b.className = 'bet'; b.hidden = true; t.appendChild(b); els.bets[i] = b;
  });
  const d = document.createElement('div'); d.className = 'dbtn'; d.textContent = 'D'; d.setAttribute('aria-label', 'Dealer button');
  t.appendChild(d); els.dbtn = d;
}
function placeChips() {
  const m = narrow.matches;
  const BETS = m ? [[50, 64], [12, 52], [23, 31], [77, 31], [88, 52]] : [[50, 66], [23, 56], [32, 28], [68, 28], [77, 56]];
  const DB = m ? [[74, 88], [31, 62], [36, 12], [64, 12], [69, 62]] : [[62.5, 88], [19, 57], [34, 10], [66, 10], [81, 57]];
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
    S.root.classList.toggle('active', !G.over && G.toAct === i && (G.thinking === i || (p.human && G.waitingHuman)));
    S.root.classList.toggle('folded', p.folded && !p.human);
    S.root.classList.toggle('winner', G.over && winners.has(i));
    let cards = '';
    if (p.hole.length) {
      if (p.human) cards = p.hole.map(c => cardHTML(c, p.folded ? 'dim' : '')).join('');
      else if (p.shown) cards = p.hole.map(c => cardHTML(c)).join('');
      else if (!p.folded) cards = backHTML() + backHTML();
    }
    setHTML(S.cards, cards);
    setHTML(S.stk, (p.allIn && !G.over ? 'All-in' : fmt(p.stack)) + (p.human && G.handNo ? `<span class="ps">${positionOf(i)}</span>` : ''));
    let pill = '', cls = 'pill';
    const cat = p.shown && p.handDesc ? CAT_NAME[catOf(p.value)] : '';
    if (G.thinking === i) pill = '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    else if (G.over && winners.has(i)) { pill = `Wins ${fmt(p.won)}${cat ? ' · ' + cat : ''}`; cls += ' win'; }
    else if (G.over && cat) { pill = cat; cls += ' hand'; }
    else if (!(G.over && p.folded)) { pill = p.lastAction; if (/bet|raise|all-in/i.test(pill)) cls += ' hot'; }
    S.pill.className = cls; setHTML(S.pill, pill);
    const b = els.bets[i];
    b.hidden = !(p.bet > 0);
    if (p.bet > 0) setHTML(b, `<span class="chip"></span>${fmt(p.bet)}`);
  });
  placeChips();
  const slots = [];
  for (let k = 0; k < 5; k++) slots.push(G.board[k] !== undefined ? cardHTML(G.board[k]) : '<div class="slot"></div>');
  setHTML($('board'), slots.join(''));
  const pot = potNow(), potEl = $('pot');
  potEl.classList.toggle('empty', G.over || !pot);
  setHTML(potEl, `<span class="chip"></span><small>POT</small>${fmt(pot)}`);
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
  k.textContent = (net > 0 ? '+' : net < 0 ? '−' : '') + fmt(Math.abs(net));
  k.className = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
}

/* ---------- action dock ---------- */
function myTurn() { return G.waitingHuman && G.toAct === 0 && !G.over; }
function raiseBounds() {
  const h = G.players[0];
  const max = h.bet + h.stack;
  const min = Math.min(G.currentBet + G.minRaise, max);
  return { min, max, can: myTurn() && h.stack > G.currentBet - h.bet && G.players.some(p => !p.human && canAct(p)) };
}
function presetList() {
  const h = G.players[0];
  const L = [];
  if (G.street === 0 && G.raiseCount === 0) L.push(['2.5 BB', clampTo(h, BB * 2.5)], ['3 BB', clampTo(h, BB * 3)], ['4 BB', clampTo(h, BB * 4)]);
  else if (G.street === 0) L.push(['3×', clampTo(h, G.currentBet * 3)], ['4×', clampTo(h, G.currentBet * 4)]);
  else L.push(['⅓', potBet(h, 1 / 3)], ['½', potBet(h, .5)], ['⅔', potBet(h, 2 / 3)], ['Pot', potBet(h, 1)]);
  L.push(['All-in', h.bet + h.stack]);
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
  const rb = raiseBounds();
  $('bNext').hidden = !G.over;
  $('actBtns').hidden = G.over;
  $('sizer').hidden = G.over || !rb.can;
  $('bTip').disabled = !my;
  const st = $('status');
  if (G.over) {
    const d = h.won - h.total;
    setHTML(st, d > 0 ? `You won <b>+${fmt(d)}</b> this hand.` : d < 0 ? `You lost <b>${fmt(-d)}</b> this hand.` : 'Hand over.');
  } else if (my) setHTML(st, `<b>Your turn</b> · ${toCall ? `${fmt(toCall)} to call` : 'no bet to you'}`);
  else if (h.folded) setHTML(st, 'You folded. Watching the rest of the hand.');
  else if (G.thinking >= 0) setHTML(st, `<b>${G.players[G.thinking].name}</b> is thinking…`);
  else setHTML(st, h.allIn ? 'Running out the board…' : 'Dealing…');

  const bF = $('bFold'), bC = $('bCall'), bR = $('bRaise');
  bF.disabled = !my || toCall === 0;
  bF.title = toCall === 0 ? 'Checking is free, so there is no reason to fold' : '';
  bC.textContent = toCall ? (toCall >= h.stack ? `Call all-in ${fmt(h.stack)}` : `Call ${fmt(toCall)}`) : 'Check';
  bC.disabled = !my;
  if (ui.amount < rb.min || ui.amount > rb.max) ui.amount = rb.min;
  bR.disabled = !rb.can;
  bR.textContent = ui.amount >= rb.max ? `All-in ${fmt(rb.max)}` : G.currentBet === 0 ? `Bet ${fmt(ui.amount)}` : `Raise to ${fmt(ui.amount)}`;
  const r = $('rAmt');
  r.min = rb.min; r.max = rb.max; r.value = ui.amount; r.disabled = !rb.can;
  const pl = rb.can ? presetList() : [];
  setHTML($('presets'), pl.map(([l, v]) => `<button type="button" data-v="${v}" class="${v === ui.amount ? 'on' : ''}"${v < rb.min ? ' disabled' : ''}>${l}</button>`).join(''));
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
    if ($('optAlerts').checked) showToast(j.level, { good: 'Good play', ok: 'Worth knowing', leak: 'Leak' }[j.level], j.text);
    else $('toast').hidden = true;
  }
  act(G.players[0], type, type === 'raise' ? ui.amount : 0);
}
function showToast(level, title, html) {
  const t = $('toast');
  t.className = `toast ${level}`;
  t.innerHTML = `<span class="dot"></span><div><b>${title}.</b> ${html}</div><button class="x" type="button" aria-label="Dismiss">×</button>`;
  t.hidden = false;
}

function onHumanTurn() {
  const h = G.players[0];
  if (G.street === 0 && G.raiseCount === 0) ui.amount = clampTo(h, BB * 2.5 + G.players.filter(p => !p.human && p.actions.some(a => a.type === 'call')).length * BB);
  else if (G.street === 0) ui.amount = clampTo(h, G.currentBet * 3);
  else ui.amount = potBet(h, 2 / 3);
  renderActions();
}
function onHandOver() { renderActions(); renderCoach(); }

function askCoach() {
  if (!myTurn()) return;
  $('bTip').disabled = true;
  setHTML($('status'), '<b>The coach is thinking…</b>');
  setTimeout(() => {
    ui.advice = getAdvice(1600);
    selectTab('coach');
    render();
    if (stacked.matches) showToast('tip', ui.advice.verdict, `${ui.advice.summary} <a href="#coach" class="seewhy">Why?</a>`);
  }, 30);
}

/* ---------- coach panel ---------- */
function renderCoach() {
  const a = ui.advice;
  if (!a || a.hand !== G.handNo) setHTML($('paneCoach'), idleHTML());
  else setHTML($('paneCoach'), tipHTML(a, a.decisionId === G.decisionId && !G.over));
}
function profileHTML() {
  if (HS.hands < 4) return '';
  const vp = HS.vpip / HS.hands, pr = HS.pfr / HS.hands;
  const style = `${vp < .2 ? 'Tight' : vp < .33 ? 'Solid' : 'Loose'}, ${pr / Math.max(vp, .01) >= .55 ? 'aggressive' : 'passive'}`;
  const agree = G.stats.decisions ? `${G.stats.agreed}/${G.stats.decisions}` : '—';
  return `<div><p class="eyebrow">How the bots see you</p>
    <div class="profile">
      <div class="mini"><div class="k">Play</div><div class="v">${pctTxt(vp)}</div></div>
      <div class="mini"><div class="k">Raise</div><div class="v">${pctTxt(pr)}</div></div>
      <div class="mini"><div class="k">Coach match</div><div class="v">${agree}</div></div>
    </div>
    <p class="note">They read you as <b>${style.toLowerCase()}</b> and adjust to it. The Shark adjusts the most.</p></div>`;
}
function idleHTML() {
  const my = myTurn();
  return `<div class="stack">
    <div>
      <p class="eyebrow">${my ? 'Your turn' : G.over ? 'Between hands' : 'Watching'}</p>
      <h2 class="h2">${my ? 'Stuck? Ask the coach.' : 'Who you’re up against'}</h2>
      <p class="muted">${my ? 'You’ll get a recommendation based on your cards, the pot odds and how each bot has played this hand.' : 'Each bot has its own style. Spotting it and adjusting is most of winning poker.'}</p>
    </div>
    <ul class="roster">${Object.values(PERSONAS).map(P => `<li><div class="avatar" style="--c:${P.color}" aria-hidden="true">${P.sigil}</div><div><b>${P.name}</b><span class="t">${P.tag}</span><p>${P.beat}</p></div></li>`).join('')}</ul>
    ${profileHTML()}
  </div>`;
}
function tipHTML(a, fresh) {
  const eq = a.equity, need = a.need;
  const meter = eq != null ? `<div>
      <div class="meter-bar"><div class="meter-fill" style="width:${(eq * 100).toFixed(1)}%"></div>${need != null ? `<div class="meter-need" style="left:calc(${(need * 100).toFixed(1)}% - 1px)"></div>` : ''}</div>
      <div class="meter-legend"><span>You win <b>${pctTxt(eq)}</b></span>${need != null ? `<span>Needed to call <b>${pctTxt(need)}</b></span>` : '<span>No bet to call</span>'}</div>
    </div>` : '';
  const L = LESSONS[a.concept];
  const main = a.reasons.slice(0, 3), extra = a.reasons.slice(3);
  return `<div class="tip stack${fresh ? '' : ' stale'}">
    ${fresh ? '' : `<p class="stale-note">${G.over ? 'This hand is over.' : 'The action has moved on. Ask again for a fresh read.'}</p>`}
    <div><p class="eyebrow">Coach · ${STREETS[a.street]}</p><p class="verdict ${a.tone}">${a.verdict}</p><p class="summary">${a.summary}</p></div>
    ${meter}
    <div class="minis">${a.stats.map(s => `<div class="mini"><div class="k">${s.k}</div><div class="v">${s.v}${s.sub ? `<small>${s.sub}</small>` : ''}</div></div>`).join('')}</div>
    <div><p class="eyebrow">Why</p><ul class="why">${main.map(r => `<li>${r}</li>`).join('')}</ul></div>
    ${L ? `<div class="lesson"><h3>${L[0]}</h3><p>${L[1]}</p></div>` : ''}
    ${extra.length ? `<details class="fold-out"><summary>More detail</summary><div><ul class="why">${extra.map(r => `<li>${r}</li>`).join('')}</ul></div></details>` : ''}
    ${a.reads.length ? `<details class="fold-out"><summary>Opponent reads (${a.reads.length})</summary><div class="reads">${a.reads.map(r => `<div class="read"><div class="avatar" style="--c:${r.P.color}" aria-hidden="true">${r.P.sigil}</div><div><b>${r.P.name}</b>${r.width < 1 ? `<span class="w">${pctTop(r.width)}</span>` : ''}<p>${r.line}</p></div></div>`).join('')}</div></details>` : ''}
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
    const pct = PRE[key].pct;
    cells += `<div class="${pct <= w ? 'in' : ''}${key === mine ? ' me' : ''}" style="--a:${(1 - .45 * pct / w).toFixed(2)}" title="${key}: top ${Math.max(1, Math.round(pct * 100))}%">${key}</div>`;
  }
  const mineTxt = mine ? ` Your ${mine} is in the ${pctTop(PRE[mine].pct)}, so it's <b>${PRE[mine].pct <= w ? 'a raise' : 'a fold'}</b> from here.` : '';
  setHTML($('paneChart'), `<div>
      <p class="eyebrow">Opening ranges</p>
      <h2 class="h2">Which hands to raise first in</h2>
      <p class="muted">When nobody has raised yet, raise the highlighted hands and fold the rest. Later seats can play more hands.</p>
      <div class="chart-pos" role="group" aria-label="Position">${['UTG', 'CO', 'BTN', 'SB'].map(p => `<button type="button" data-pos="${p}" aria-pressed="${p === pos}">${p}${p === heroPos ? ' · you' : ''}</button>`).join('')}</div>
      <div class="grid13" role="img" aria-label="Starting hand chart for ${POS_LONG[pos]}">${cells}</div>
      <div class="chart-key"><span><i style="background:var(--accent)"></i>Raise</span><span><i style="background:var(--surface-2)"></i>Fold</span><span>Suited above the diagonal</span></div>
      <p class="note">From ${POS_LONG[pos]}, open about the <b>${pctTop(w)}</b> of hands.${mineTxt}</p>
    </div>`);
}

/* ---------- history ---------- */
function renderLog() {
  const p = $('paneLog');
  const atBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 30;
  setHTML($('log'), G.log.slice(-160).map(e => `<li class="${e.kind}">${e.text}</li>`).join(''));
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
function toggleMenu(open) {
  const m = $('menu'), b = $('bMenu');
  open = open ?? m.hidden;
  m.hidden = !open; b.setAttribute('aria-expanded', String(open));
}
function bind() {
  $('bFold').onclick = () => humanAct('fold');
  $('bCall').onclick = () => humanAct(G.currentBet - G.players[0].bet > 0 ? 'call' : 'check');
  $('bRaise').onclick = () => humanAct('raise');
  $('bTip').onclick = askCoach;
  $('bNext').onclick = () => { $('toast').hidden = true; ui.advice = null; startHand(); };
  $('rAmt').oninput = e => setAmount(+e.target.value);
  $('presets').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) setAmount(+b.dataset.v); };
  $('tCoach').onclick = () => selectTab('coach');
  $('tChart').onclick = () => selectTab('chart');
  $('tLog').onclick = () => selectTab('log');
  $('paneChart').onclick = e => { const b = e.target.closest('[data-pos]'); if (b) { ui.chartPos = b.dataset.pos; renderChart(); } };
  $('toast').onclick = e => {
    if (e.target.closest('.x')) $('toast').hidden = true;
    if (e.target.closest('.seewhy')) { e.preventDefault(); selectTab('coach'); $('coach').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  $('bMenu').onclick = e => { e.stopPropagation(); toggleMenu(); };
  document.addEventListener('click', e => { if (!$('menu').hidden && !e.target.closest('#menu')) toggleMenu(false); });
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  if (read('pc-fast') === '1') $('optFast').checked = true;
  if (read('pc-alerts') === '0') $('optAlerts').checked = false;
  G.fast = $('optFast').checked;
  $('optFast').onchange = e => { G.fast = e.target.checked; store('pc-fast', e.target.checked ? '1' : '0'); };
  $('optAlerts').onchange = e => { store('pc-alerts', e.target.checked ? '1' : '0'); if (!e.target.checked) $('toast').hidden = true; };
  narrow.addEventListener('change', placeChips);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { toggleMenu(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key.toLowerCase();
    const press = id => { const b = $(id); if (!b.disabled && !b.hidden && !b.closest('[hidden]')) b.click(); };
    if (k === 'f') press('bFold');
    else if (k === 'c') press('bCall');
    else if (k === 'r') press('bRaise');
    else if (k === 't') press('bTip');
    else if (k === 'n') press('bNext');
  });
}

makePlayers();
G.dealer = Math.floor(Math.random() * N);
buildTable();
bind();
startHand();
