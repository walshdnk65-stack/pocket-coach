/* ================= Table & game flow ================= */
const SB = 10, BB = 20, START_STACK = 2000, N = 5;
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

// open: opening-range multiplier · threeBet: re-raise multiplier · bluff: bluff multiplier · aggr: how readily they bet strong hands
// callAdj: extra equity they demand before calling (negative = calls lighter) · trap: slowplay rate · limp: limp instead of raising
// adapt: how much they adjust to your tendencies (0–1)
const PERSONAS = {
  rock:    { name: 'The Rock',    sigil: 'R', color: '#8fb4dc', tag: 'Tight, patient',       open: .7,  threeBet: .8,  bluff: .45, aggr: .8, callAdj: .03,  trap: .2,  limp: 0,   adapt: .5,
             blurb: 'Plays few hands, but bets them hard.', beat: 'Steal their blinds. Respect their big bets.' },
  maniac:  { name: 'The Maniac',  sigil: 'M', color: '#f2896a', tag: 'Loose, aggressive',    open: 1.5, threeBet: 1.9, bluff: 1.6, aggr: 1,  callAdj: -.02, trap: .05, limp: 0,   adapt: .5,
             blurb: 'Plays lots of hands and keeps up the pressure.', beat: 'Call down wider with strong hands. Bluff them less.' },
  station: { name: 'The Station', sigil: 'S', color: '#6ed3a3', tag: 'Loose, sticky',        open: 1.1, threeBet: .6,  bluff: .5,  aggr: .65, callAdj: -.06, trap: .25, limp: .35, adapt: .3,
             blurb: 'Hates to fold and calls down light.', beat: 'Bet your good hands for value. Rarely bluff.' },
  shark:   { name: 'The Shark',   sigil: 'K', color: '#c3a3ff', tag: 'Balanced, adaptive',   open: 1.1, threeBet: 1.2, bluff: 1,   aggr: .9, callAdj: 0,    trap: .12, limp: 0,   adapt: 1,
             blurb: 'Balanced, hard to read, and learns your habits.', beat: "Mix up your play. Don't repeat the same mistake." },
};

const G = {
  players: [], dealer: 0, handNo: 0, board: [], deck: [], street: 0, pot: 0,
  currentBet: 0, minRaise: BB, toAct: -1, raiseCount: 0, lastAggressor: -1, preflopRaiser: -1,
  over: true, waitingHuman: false, thinking: -1, result: null, log: [], decisionId: 0,
  stats: { decisions: 0, agreed: 0, leaks: 0 }, fast: false, heroFlags: {},
};

// What the bots have learned about you this session.
const HS = { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, f3Opp: 0, f3: 0, cbOpp: 0, cbFold: 0, aggr: 0, calls: 0, folds: 0, rvBets: 0, rvBluffs: 0 };
const blend = (count, n, prior, k = 10) => (count + prior * k) / (n + k);
function heroProfile() {
  return {
    vpip: blend(HS.vpip, HS.hands, .28),
    pfr: blend(HS.pfr, HS.hands, .18),
    threeBet: blend(HS.tb, HS.tbOpp, .07),
    foldTo3b: blend(HS.f3, HS.f3Opp, .5, 6),
    foldToCbet: blend(HS.cbFold, HS.cbOpp, .45, 6),
    af: (HS.aggr + 1.5 * 6) / (HS.calls + 6),
    bluff: blend(HS.rvBluffs, HS.rvBets, .25, 6),
    callDown: blend(HS.calls, HS.calls + HS.folds, .5),
  };
}
function trackHero(type, toCall) {
  const f = G.heroFlags;
  if (G.street === 0) {
    if (G.raiseCount >= 1 && !f.pfr && !f.tbSeen) { f.tbSeen = true; HS.tbOpp++; if (type === 'raise') HS.tb++; }
    if (f.pfr && G.raiseCount >= 2 && G.lastAggressor !== 0 && !f.f3Seen) { f.f3Seen = true; HS.f3Opp++; if (type === 'fold') HS.f3++; }
    if ((type === 'call' || type === 'raise') && !f.vpip) { f.vpip = true; HS.vpip++; }
    if (type === 'raise' && !f.pfr) { f.pfr = true; HS.pfr++; }
  } else {
    if (type === 'raise') HS.aggr++; else if (type === 'call') HS.calls++; else if (type === 'fold') HS.folds++;
    if (G.street === 1 && toCall > 0 && G.raiseCount === 1 && G.preflopRaiser > 0 && G.lastAggressor === G.preflopRaiser && !f.cbSeen) {
      f.cbSeen = true; HS.cbOpp++; if (type === 'fold') HS.cbFold++;
    }
    if (G.street === 3 && type === 'raise') f.riverAggr = true;
  }
}
// The range the bots put you on, from your actions this hand and your habits.
function heroRange() {
  const h = G.players[0], hp = heroProfile();
  const pre = h.actions.filter(a => a.street === 0);
  const lvl = Math.max(0, ...pre.filter(a => a.type === 'raise').map(a => a.level));
  let width = 1;
  if (lvl >= 2) width = Math.max(.025, hp.threeBet * .9);
  else if (lvl === 1) width = Math.max(.05, hp.pfr);
  else if (pre.some(a => a.type === 'call' && a.to > BB)) width = Math.max(.08, hp.vpip - hp.pfr + .08);
  else if (pre.some(a => a.type === 'call')) width = Math.max(.1, hp.vpip);
  const post = h.actions.filter(a => a.street > 0);
  if (post.some(a => a.type === 'raise')) return { width, cond: true, loose: Math.min(.6, Math.max(.08, hp.bluff * hp.af / 1.5)) };
  if (post.some(a => a.type === 'call')) return { width, cond: true, loose: Math.min(.7, Math.max(.15, hp.callDown * .6)) };
  return { width, cond: false, loose: 1 };
}
const rangeOf = p => (p.human ? heroRange() : rangeOpt(p));

function makePlayers() {
  const seats = [{ human: true }, { persona: 'rock' }, { persona: 'maniac' }, { persona: 'station' }, { persona: 'shark' }];
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
const postflopOrder = s => { const d = (s - G.dealer + N) % N; return d === 0 ? N : d; };
const actsAfter = (a, b) => postflopOrder(a) > postflopOrder(b);
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
  G.handNo++; G.decisionId++; HS.hands++;
  G.over = false; G.board = []; G.pot = 0; G.street = 0; G.raiseCount = 0; G.result = null;
  G.lastAggressor = -1; G.preflopRaiser = -1; G.waitingHuman = false; G.thinking = -1; G.heroFlags = {};
  log(`Hand ${G.handNo}`, 'hand');
  for (const p of G.players) {
    if (p.stack <= 0) { p.stack = START_STACK; p.buyins++; log(`${p.name} ${p.human ? 'reload' : 'reloads'} to ${fmt(START_STACK)}.`); }
    Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, lastAction: '', actions: [], shown: false, won: 0, value: 0, handDesc: '' });
  }
  G.dealer = (G.dealer + 1) % N;
  G.deck = freshDeck();
  const sb = G.players[(G.dealer + 1) % N], bb = G.players[(G.dealer + 2) % N];
  post(sb, SB);
  post(bb, BB);
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
    act(p, d.type, d.amount, d);
  }, 650 + Math.random() * 500);
}

function roundComplete() {
  const actors = G.players.filter(canAct);
  if (actors.every(p => p.acted && p.bet >= G.currentBet)) return true;
  if (actors.length === 1 && actors[0].bet >= G.currentBet && G.players.filter(p => !p.folded).length > 1) return true;
  return false;
}

function act(p, type, amount = 0, meta = {}) {
  if (G.over) return;
  G.waitingHuman = false;
  const toCall = G.currentBet - p.bet;
  if ((type === 'bet' || type === 'raise') && Math.min(amount, p.bet + p.stack) <= G.currentBet) type = 'call';
  if (type === 'call' && toCall <= 0) type = 'check';
  if (type === 'check' && toCall > 0) type = 'fold';
  if (p.human) trackHero(type === 'bet' ? 'raise' : type, toCall);
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
    label = p.allIn ? `All-in ${fmt(p.bet)}` : (prev === 0 ? `Bet ${fmt(p.bet)}` : `Raise ${fmt(p.bet)}`);
  }
  p.acted = true; p.lastAction = label;
  p.actions.push({ street: G.street, type: rec, to: p.bet, level: rec === 'raise' ? G.raiseCount : 0, facing: toCall, w: meta.w, loose: meta.loose });
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
  if (G.players.filter(canAct).length <= 1) {
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
  const hero = G.players[0];
  if (!hero.folded && G.heroFlags.riverAggr) {
    HS.rvBets++;
    if (catOf(hero.value) <= catOf(evaluate(G.board)) || catOf(hero.value) === 0) HS.rvBluffs++;
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
function raiseTo(p, to) {
  to = Math.max(roundChips(to), G.currentBet + G.minRaise);
  if (to >= (p.bet + p.stack) * 0.85) to = p.bet + p.stack; // commit rather than leave a sliver behind
  return Math.min(to, p.bet + p.stack);
}
const betFrac = (p, f) => raiseTo(p, G.currentBet + f * (potNow() + G.currentBet - p.bet));

function decideBot(p) {
  const P = PERSONAS[p.persona];
  return G.street === 0 ? botPreflop(p, P) : botPostflop(p, P);
}

function botPreflop(p, P) {
  const [c1, c2] = p.hole;
  const pct = prePct(c1, c2), pos = positionOf(p.id);
  const hi = Math.max(rankOf(c1), rankOf(c2)), lo = Math.min(rankOf(c1), rankOf(c2));
  const pair = hi === lo, suited = suitOf(c1) === suitOf(c2), gap = hi - lo - 1;
  const toCall = G.currentBet - p.bet;
  const r = Math.random(), j = .9 + Math.random() * .2;
  const hp = heroProfile();

  if (G.raiseCount === 0) {
    const limpers = G.players.filter(o => o !== p && o.actions.some(a => a.street === 0 && a.type === 'call')).length;
    if (toCall === 0) {
      const w = .12 * P.open;
      if (pct <= w * j) return { type: 'raise', amount: raiseTo(p, BB * (3 + limpers)), w };
      return { type: 'check', w: 1 };
    }
    let openW = Math.min(.75, OPEN_RANGE[pos] * P.open) * (limpers ? .7 : 1);
    // Steal more often when you're in the blinds and fold too much; less when you defend a lot.
    const heroBlind = ['SB', 'BB'].includes(positionOf(0)) && !G.players[0].folded;
    if (heroBlind && ['BTN', 'CO', 'SB'].includes(pos)) openW *= 1 + P.adapt * Math.max(-.3, Math.min(.4, (.28 - hp.vpip) * 1.5));
    if (pct <= openW * j) {
      if (P.limp && r < P.limp && pct > .05) return { type: 'call', w: openW * 1.2 };
      return { type: 'raise', amount: raiseTo(p, BB * (pos === 'SB' ? 3 : 2.5) + limpers * BB), w: openW };
    }
    if (limpers && pct <= openW * 1.5 && (pair || (suited && gap <= 1))) return { type: 'call', w: openW * 1.5 };
    if (pos === 'SB' && P.limp && pct <= openW * 1.4) return { type: 'call', w: openW * 1.4 };
    return { type: 'fold' };
  }

  const raiser = G.players[G.lastAggressor];
  const rr = rangeOf(raiser);
  const n = G.raiseCount;
  const others = G.players.filter(o => o !== p && o !== raiser && !o.folded && o.actions.some(a => a.street === 0 && (a.type === 'call' || a.type === 'raise')));
  const eq = equity(p.hole, [], [rr, ...others.map(rangeOf)], 240);
  const pot = potNow();
  const potOdds = toCall / (pot + toCall);
  const ip = actsAfter(p.id, raiser.id);
  const eff = Math.min(p.stack + p.bet, raiser.stack + raiser.bet);
  let valueW = n >= 2 ? Math.min(.03, rr.width * .4) : Math.max(.025, Math.min(.1, rr.width * .3 * P.threeBet));
  if (n >= 3) valueW = .012;
  if (pct <= valueW) {
    let to = n >= 2 ? G.currentBet * 2.3 : G.currentBet * (ip ? 3 : 3.6) + others.length * G.currentBet;
    if (to > eff * .38) to = p.bet + p.stack;
    return { type: 'raise', amount: raiseTo(p, to), w: valueW + (n === 1 ? .02 * P.bluff : 0) };
  }
  // Light re-raises with suited wheel aces and suited connectors, more against players who fold to them.
  const bluffable = n === 1 && rr.width >= .14 && suited && ((hi === 12 && lo <= 3) || (gap === 0 && lo >= 3 && hi <= 9));
  const fold3 = raiser.human ? hp.foldTo3b : .5;
  if (bluffable && r < .3 * P.bluff * (1 + P.adapt * (fold3 - .5) * 1.5)) {
    return { type: 'raise', amount: raiseTo(p, G.currentBet * (ip ? 3 : 3.6)), w: valueW + .02 * P.bluff };
  }
  const callW = Math.min(.6, rr.width * 1.8);
  if (pair && n === 1 && toCall * 14 <= eff - toCall && eq >= potOdds - .1) return { type: 'call', w: callW };
  const need = potOdds + (ip ? 0 : .05) + P.callAdj * .5 + (toCall > eff * .25 ? .06 : 0);
  if (eq >= need && pct <= Math.min(.6, rr.width * 2.2 + (pos === 'BB' ? .12 : 0))) return { type: 'call', w: callW };
  return toCall === 0 ? { type: 'check', w: 1 } : { type: 'fold' };
}

function botPostflop(p, P) {
  const toCall = G.currentBet - p.bet, pot = potNow();
  const others = G.players.filter(o => o !== p && !o.folded);
  const n = others.length, street = G.street, toCome = 3 - street;
  const eq = equity(p.hole, G.board, others.map(rangeOf), 320);
  const s = n === 1 ? eq : Math.min(1, eq * (n + 1) / 2); // strength relative to a heads-up pot
  const tex = boardTexture(G.board);
  const draw = toCome > 0 && countOuts(p.hole, G.board).outs >= 8;
  const r = Math.random();
  const hp = heroProfile();
  const vsHero = others.some(o => o.human);
  const size = street === 3 ? .7 : tex.wet ? .66 : .5; // same size for value and bluffs, so sizing gives nothing away
  const callLoose = Math.max(.1, .3 - P.callAdj * 3);

  if (toCall === 0) {
    if (s >= .62) {
      if (s >= .85 && street < 3 && r < P.trap) return { type: 'check' };
      if (r < .55 + .4 * P.aggr) return { type: 'raise', amount: betFrac(p, size), loose: .1 * P.bluff };
      return { type: 'check' };
    }
    if (draw && r < .5 * P.aggr * Math.min(1.3, P.bluff)) return { type: 'raise', amount: betFrac(p, size), loose: .15 * P.bluff };
    if (G.preflopRaiser === p.id && street === 1 && n <= 2) {
      let f = (tex.wet ? .42 : .68) * (.7 + .3 * P.aggr) * (n === 2 ? .6 : 1);
      if (vsHero) f += P.adapt * (hp.foldToCbet - .45) * .9;
      if (r < f) return { type: 'raise', amount: betFrac(p, tex.wet ? .5 : .33), loose: Math.min(.7, f * .9) };
    }
    if (n === 1 && street === 3 && s >= .45 && r < .45 * P.aggr) return { type: 'raise', amount: betFrac(p, .45), loose: .25 * P.bluff };
    if (n === 1 && s < .25) {
      let f = (street === 3 ? .16 : .1) * P.bluff;
      if (vsHero) f *= 1 + P.adapt * (.5 - hp.callDown) * 1.6; // bluff less against players who call a lot
      if (r < f) return { type: 'raise', amount: betFrac(p, size), loose: .3 * P.bluff };
    }
    return { type: 'check' };
  }

  const potOdds = toCall / (pot + toCall);
  let need = potOdds + P.callAdj;
  if (toCall >= p.stack * .5 && s < .7) need += .05; // don't stack off light
  if (draw) need -= .04;                             // implied odds
  if (s >= .78 && G.raiseCount < 3) {
    if (r < .75 * P.aggr && !(s >= .9 && street < 3 && r < P.trap)) return { type: 'raise', amount: raiseTo(p, G.currentBet * 3), loose: .08 * P.bluff };
    return { type: 'call', loose: callLoose };
  }
  if (eq >= need) {
    if (draw && street === 1 && G.raiseCount === 1 && r < .18 * P.bluff) return { type: 'raise', amount: raiseTo(p, G.currentBet * 3), loose: .12 * P.bluff };
    return { type: 'call', loose: callLoose };
  }
  if (draw && street === 1 && G.raiseCount === 1 && r < .12 * P.bluff && toCall < p.stack * .25) return { type: 'raise', amount: raiseTo(p, G.currentBet * 3), loose: .12 * P.bluff };
  return { type: 'fold' };
}
