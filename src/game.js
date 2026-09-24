/* ================= Table & game flow ================= */
const SB = 10, BB = 20, START_STACK = 2000, N = 5;
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

// vpip: how often they put money in preflop; pfr: how often they raise; threeBet: re-raise;
// agg: how often they bet their good hands; bluff: bet/raise with nothing; sticky: how loosely they call; float: call postflop without a hand
const PERSONAS = {
  rock:    { name: 'The Rock',    sigil: 'R', color: '#9bb1bf', tag: 'Tight · passive',   vpip: .15, pfr: .09, threeBet: .03, agg: .35, bluff: .05, sticky: -.04, float: .12,
             blurb: 'Plays very few hands and almost never bluffs.', beat: 'Steal their blinds and fold when they suddenly bet big.' },
  maniac:  { name: 'The Maniac',  sigil: 'M', color: '#e3806b', tag: 'Loose · aggressive', vpip: .55, pfr: .38, threeBet: .14, agg: .85, bluff: .42, sticky: .05, float: .45,
             blurb: 'Raises constantly, often with weak hands.', beat: 'Call down lighter with good hands and let them bluff into you.' },
  station: { name: 'The Station', sigil: 'S', color: '#8fc59a', tag: 'Loose · passive',   vpip: .52, pfr: .06, threeBet: .02, agg: .2,  bluff: .06, sticky: .22, float: .65,
             blurb: 'Calls almost everything and rarely raises.', beat: 'Never bluff them. Bet your good hands big, because they will pay.' },
  shark:   { name: 'The Shark',   sigil: 'K', color: '#d4af63', tag: 'Tight · aggressive', vpip: .24, pfr: .18, threeBet: .07, agg: .62, bluff: .22, sticky: .02, float: .25,
             blurb: 'A solid player: selective preflop, aggressive after.', beat: 'Respect their re-raises and avoid big pots without a big hand.' },
};

const G = {
  players: [], dealer: 0, handNo: 0, board: [], deck: [], street: 0, pot: 0,
  currentBet: 0, minRaise: BB, toAct: -1, raiseCount: 0, lastAggressor: -1, preflopRaiser: -1,
  over: true, waitingHuman: false, thinking: -1, result: null, log: [], decisionId: 0,
  stats: { decisions: 0, agreed: 0, leaks: 0 }, fast: false,
};

function makePlayers() {
  const seats = [{ human: true, name: 'You' }, { persona: 'rock' }, { persona: 'maniac' }, { persona: 'station' }, { persona: 'shark' }];
  G.players = seats.map((s, i) => ({
    id: i, human: !!s.human, persona: s.persona || null,
    name: s.human ? 'You' : PERSONAS[s.persona].name,
    stack: START_STACK, buyins: 1, hole: [], bet: 0, total: 0, folded: false, allIn: false,
    acted: false, lastAction: '', actions: [], shown: false, won: 0, value: 0, handDesc: '',
  }));
}

const fmt = n => Math.round(n).toLocaleString('en-US');
const canAct = p => !p.folded && !p.allIn;
const potNow = () => G.pot + G.players.reduce((s, p) => s + p.bet, 0);
const liveOpponents = () => G.players.filter(p => !p.human && !p.folded);
function positionOf(seat) { return ['BTN', 'SB', 'BB', 'UTG', 'CO'][(seat - G.dealer + N) % N]; }
function nextActor(from) {
  for (let k = 1; k <= N; k++) { const i = (from + k) % N; if (canAct(G.players[i])) return i; }
  return -1;
}
function log(text, kind = '') {
  G.log.push({ text, kind, hand: G.handNo });
  if (G.log.length > 400) G.log.splice(0, G.log.length - 400);
}
function post(p, amt) {
  const a = Math.max(0, Math.min(amt, p.stack));
  p.stack -= a; p.bet += a; p.total += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}
function later(fn, ms) { setTimeout(fn, G.fast ? Math.min(ms, 160) : ms); }

function startHand() {
  G.handNo++; G.decisionId++;
  G.over = false; G.board = []; G.pot = 0; G.street = 0; G.raiseCount = 0; G.result = null;
  G.lastAggressor = -1; G.preflopRaiser = -1; G.waitingHuman = false; G.thinking = -1;
  log(`Hand ${G.handNo}`, 'hand');
  for (const p of G.players) {
    if (p.stack <= 0) { p.stack = START_STACK; p.buyins++; log(`${p.name} ${p.human ? 'reload' : 'reloads'} to ${fmt(START_STACK)}.`); }
    Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, lastAction: '', actions: [], shown: false, won: 0, value: 0, handDesc: '' });
  }
  G.dealer = (G.dealer + 1) % N;
  G.deck = freshDeck();
  const sb = G.players[(G.dealer + 1) % N], bb = G.players[(G.dealer + 2) % N];
  post(sb, SB); sb.lastAction = 'Small blind';
  post(bb, BB); bb.lastAction = 'Big blind';
  for (let r = 0; r < 2; r++) for (let k = 1; k <= N; k++) G.players[(G.dealer + k) % N].hole.push(G.deck.pop());
  G.currentBet = BB; G.minRaise = BB;
  G.toAct = nextActor((G.dealer + 2) % N);
  log(`You are on ${POS_LONG[positionOf(0)]} with ${G.players[0].hole.map(cardText).join(' ')}.`, 'me');
  render();
  later(step, 500);
}

function step() {
  if (G.over) return;
  const live = G.players.filter(p => !p.folded);
  if (live.length === 1) return winUncontested(live[0]);
  if (roundComplete()) return endStreet();
  const p = G.players[G.toAct];
  if (!p || !canAct(p)) { G.toAct = nextActor(G.toAct); return step(); }
  if (p.human) { G.waitingHuman = true; G.decisionId++; render(); onHumanTurn(); return; }
  G.thinking = p.id; render();
  later(() => {
    G.thinking = -1;
    const d = decideBot(p);
    act(p, d.type, d.amount);
  }, 650 + Math.random() * 500);
}

function roundComplete() {
  const actors = G.players.filter(canAct);
  if (actors.every(p => p.acted && p.bet >= G.currentBet)) return true;
  // Everyone else is all-in and the last player has matched: nothing left to decide.
  if (actors.length === 1 && actors[0].bet >= G.currentBet && G.players.filter(p => !p.folded).length > 1) return true;
  return false;
}

function act(p, type, amount = 0) {
  if (G.over) return;
  G.waitingHuman = false;
  const toCall = G.currentBet - p.bet;
  if ((type === 'bet' || type === 'raise') && Math.min(amount, p.bet + p.stack) <= G.currentBet) type = 'call';
  if (type === 'call' && toCall <= 0) type = 'check';
  if (type === 'check' && toCall > 0) type = 'fold';
  let label = '', rec = type;
  if (type === 'fold') { p.folded = true; label = 'Fold'; }
  else if (type === 'check') { label = 'Check'; }
  else if (type === 'call') { const a = post(p, toCall); label = p.allIn ? `All-in ${fmt(p.bet)}` : `Call ${fmt(a)}`; }
  else {
    const to = Math.min(Math.max(amount, G.currentBet + G.minRaise), p.bet + p.stack);
    const prev = G.currentBet;
    post(p, to - p.bet);
    const inc = p.bet - prev;
    if (inc >= G.minRaise) { G.minRaise = inc; for (const o of G.players) if (o !== p) o.acted = false; }
    else for (const o of G.players) if (o !== p && o.bet < p.bet) o.acted = false;
    G.currentBet = p.bet; G.raiseCount++; G.lastAggressor = p.id;
    if (G.street === 0) G.preflopRaiser = p.id;
    rec = 'raise';
    label = p.allIn ? `All-in ${fmt(p.bet)}` : (prev === 0 ? `Bet ${fmt(p.bet)}` : `Raise to ${fmt(p.bet)}`);
  }
  p.acted = true; p.lastAction = label;
  p.actions.push({ street: G.street, type: rec, to: p.bet, level: rec === 'raise' ? G.raiseCount : 0, facing: toCall });
  log(`${p.name}: ${label.toLowerCase()}`, p.human ? 'me' : '');
  G.toAct = nextActor(p.id);
  render();
  later(step, 280);
}

function collectBets() {
  for (const p of G.players) { G.pot += p.bet; p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.lastAction = ''; }
  G.currentBet = 0; G.minRaise = BB; G.raiseCount = 0;
}

function endStreet() {
  collectBets();
  if (G.street === 3) return showdown();
  G.street++;
  const n = G.street === 1 ? 3 : 1;
  G.deck.pop(); // burn
  for (let i = 0; i < n; i++) G.board.push(G.deck.pop());
  log(`${STREETS[G.street]}: ${G.board.map(cardText).join(' ')}  (pot ${fmt(G.pot)})`, 'street');
  G.decisionId++;
  const actors = G.players.filter(canAct);
  if (actors.length <= 1) {
    // No more betting possible: turn the cards face up and run out the board.
    G.players.forEach(p => { if (!p.folded) p.shown = true; });
    G.toAct = -1; render();
    later(endStreet, 1100);
    return;
  }
  G.toAct = nextActor(G.dealer);
  render();
  later(step, 550);
}

function winUncontested(w) {
  collectBets();
  w.stack += G.pot; w.won = G.pot;
  G.result = { winners: [w], text: `${w.name} ${w.human ? 'win' : 'wins'} ${fmt(G.pot)}. Everyone else folded.` };
  log(`${w.name} ${w.human ? 'take' : 'takes'} the pot of ${fmt(G.pot)} uncontested.`, 'win');
  finishHand();
}

function showdown() {
  const live = G.players.filter(p => !p.folded);
  for (const p of live) { p.shown = true; p.value = evaluate(p.hole.concat(G.board)); p.handDesc = describe(p.value); }
  const levels = [...new Set(G.players.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
  let prev = 0;
  for (const lv of levels) {
    let amt = 0; for (const p of G.players) amt += Math.max(0, Math.min(p.total, lv) - prev);
    prev = lv;
    if (!amt) continue;
    let elig = live.filter(p => p.total >= lv); if (!elig.length) elig = live;
    const best = Math.max(...elig.map(p => p.value));
    const ws = elig.filter(p => p.value === best);
    const share = Math.floor(amt / ws.length); let rem = amt - share * ws.length;
    for (const w of ws) { const x = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; w.stack += x; w.won += x; }
  }
  for (const p of live) log(`${p.name} ${p.human ? 'show' : 'shows'} ${p.hole.map(cardText).join(' ')} — ${p.handDesc}`);
  // Winners are those who ended up ahead on the hand (a refunded, uncalled bet doesn't count).
  let top = live.filter(p => p.won > p.total);
  if (!top.length) { const best = Math.max(...live.map(q => q.value)); top = live.filter(p => p.value === best); }
  const lc = s => s.replace(/^./, c => c.toLowerCase());
  const text = top.map(w => `${w.name} ${w.human ? 'win' : 'wins'} ${fmt(w.won)} with ${lc(w.handDesc)}`).join('; ') + '.';
  G.result = { winners: top, text };
  log(G.result.text, 'win');
  finishHand();
}

function finishHand() {
  G.over = true; G.toAct = -1; G.waitingHuman = false; G.thinking = -1;
  render();
  onHandOver();
}

/* ================= Bot brains ================= */
function roundChips(x) { return Math.max(BB, Math.round(x / 5) * 5); }
function botRaise(p, to) {
  to = Math.max(roundChips(to), G.currentBet + G.minRaise);
  if (to >= (p.bet + p.stack) * 0.85) to = p.bet + p.stack; // commit rather than leave a sliver behind
  return { type: 'raise', amount: to };
}

function decideBot(p) {
  const P = PERSONAS[p.persona];
  const toCall = G.currentBet - p.bet;
  const pot = potNow();
  const r = Math.random();
  const opps = G.players.filter(o => !o.folded && o !== p).length;

  if (G.street === 0) {
    const pct = prePct(p.hole[0], p.hole[1]);
    const posAdj = { UTG: .8, CO: 1, BTN: 1.3, SB: .9, BB: 1 }[positionOf(p.id)];
    const j = 0.85 + Math.random() * 0.3;
    if (G.raiseCount === 0) {
      const limpers = G.players.filter(o => o.bet === BB && o.actions.some(a => a.street === 0 && a.type === 'call')).length;
      if (pct <= P.pfr * posAdj * j) return botRaise(p, BB * (P === PERSONAS.maniac && r < .4 ? 4 : 3) + limpers * BB);
      if (toCall === 0) return { type: 'check' };
      if (pct <= P.vpip * posAdj * j) return { type: 'call' };
      return { type: 'fold' };
    }
    const sizeBB = G.currentBet / BB;
    const tight = (G.raiseCount >= 2 ? .45 : 1) * (sizeBB > 12 ? .6 : 1);
    if (pct <= P.threeBet * tight * j) return botRaise(p, G.currentBet * 3);
    const callW = P.vpip * .55 * tight * j + (P.sticky > .1 ? .08 : 0);
    if (pct <= callW || (toCall <= BB && pct <= P.vpip)) return { type: 'call' };
    return toCall === 0 ? { type: 'check' } : { type: 'fold' };
  }

  const eq = equity(p.hole, G.board, new Array(opps).fill(null), 260);
  const edge = eq * (opps + 1); // 1.0 = fair share of the pot
  if (toCall === 0) {
    if (edge > 1.35 && r < .45 + P.agg * .55) return botRaise(p, pot * (.55 + Math.random() * .25));
    if (edge > 1.05 && r < P.agg * .5) return botRaise(p, pot * .5);
    if (r < P.bluff * (opps === 1 ? 1 : .5)) return botRaise(p, pot * (.4 + Math.random() * .3));
    return { type: 'check' };
  }
  const potOdds = toCall / (pot + toCall);
  const facingBig = toCall > pot * .9;
  const eqAdj = eq * (P.sticky > .1 ? 1 : facingBig ? .8 : .9);
  if (edge > 1.6 && r < P.agg && G.raiseCount < 3) return botRaise(p, G.currentBet * 2.6 + pot * .3);
  if (eqAdj >= potOdds - P.sticky) return { type: 'call' };
  if (r < P.bluff * .2 && G.raiseCount < 2 && G.street < 3) return botRaise(p, G.currentBet * 2.6);
  return { type: 'fold' };
}
