/* ================= The coach ================= */
const POS_LONG = { BTN: 'the button', SB: 'the small blind', BB: 'the big blind', UTG: 'under the gun', CO: 'the cutoff' };
const POS_NOTE = {
  UTG: 'you act first, with four players still to come after you',
  CO: 'only the button and the blinds act after you',
  BTN: 'the best seat: after the flop you always act last',
  SB: 'after the flop you act first, which is the hardest seat',
  BB: 'you already have 20 in the pot, so calling costs less',
};
const OPEN_RANGE = { UTG: .17, CO: .27, BTN: .45, SB: .35, BB: .12 };
const pctTxt = x => `${Math.round(x * 100)}%`;
const pctTop = x => (x < .015 ? 'top 1%' : `top ${Math.round(x * 100)}%`);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Plain-language numbers ---------- */
// Nearest simple fraction, preferring small denominators: 0.42 -> 2 in 5, 0.25 -> 1 in 4.
function nearFrac(p) {
  let best = null;
  const dens = p < .15 || p > .85 ? [2, 3, 4, 5, 6, 8, 10, 12, 15, 20] : [2, 3, 4, 5, 10];
  for (const b of dens) for (let a = 1; a < b; a++) {
    const err = Math.abs(a / b - p) + b * .002;
    if (!best || err < best.err) best = { a, b, err };
  }
  return best;
}
// Short label: "2 in 5", "almost always", "almost never".
function fracShort(p) {
  if (p >= .97) return 'almost always';
  if (p <= .03) return 'almost never';
  if (Math.abs(p - .5) < .025) return '1 in 2';
  const f = nearFrac(p); return `${f.a} in ${f.b}`;
}
// Sentence form: "about 2 in 5 times", "about half the time".
function often(p) {
  if (p >= .97) return 'almost every time';
  if (p <= .03) return 'almost never';
  if (Math.abs(p - .5) < .025) return 'about half the time';
  const f = nearFrac(p); return `about ${f.a} in ${f.b} times`;
}
// For a minimum: "at least 1 in 4 times".
function atLeast(p) { const f = nearFrac(Math.max(.05, p)); return `at least ${f.a} in ${f.b} times`; }

// Starting-hand strength tiers. pct = share of all hands at least this good.
const TIERS = [
  { name: 'Weak', max: 1, min: .55 }, { name: 'Marginal', max: .55, min: .35 }, { name: 'Playable', max: .35, min: .15 },
  { name: 'Strong', max: .15, min: .05 }, { name: 'Premium', max: .05, min: 0 },
];
function tierOf(pct) { const i = TIERS.findIndex(t => pct > t.min || t.min === 0); return { i, ...TIERS[i] }; }
function tierPos(pct) { const t = tierOf(pct); return (t.i + (t.max - pct) / (t.max - t.min)) / TIERS.length; }
function betterThan(pct) {
  const b = 1 - pct;
  if (b < .03) return 'one of the weakest starting hands';
  if (b > .985) return 'one of the very best starting hands';
  return `better than ${pctTxt(b)} of all starting hands`;
}
const handsWord = w => (w >= .97 ? 'almost any two cards' : `about ${fracShort(w)} hands`);

const LESSONS = {
  potOdds: ['Is the call worth it?', "Compare what the call costs with how often you'll win. If calling 50 would make the pot 200, you need to win at least 1 in 4 times to break even (50 is a quarter of 200). Win more often than that and calling makes money over time, even though you'll still lose some hands."],
  rule42: ['Counting helpful cards', 'Count the cards left in the deck that would give you a winning hand (poker players call these "outs"). With two cards still to come, multiply by 4 to get your rough percentage. With one card to come, multiply by 2. Nine helpful cards on the flop ≈ 36%, a bit better than 1 in 3.'],
  impliedOdds: ['Winning more later', "When you hit your card, you often win extra chips on the later betting rounds. Against players who keep paying, that makes some slightly-too-expensive calls worth it. Against careful players, don't count on it."],
  valueBet: ['Bet when you are ahead', "When you probably have the best hand, bet so worse hands put more chips in. Checking a strong hand earns you nothing and lets others see free cards. Bet bigger against players who call too much."],
  semiBluff: ['Betting a draw', "A draw is a hand that isn't made yet but could be. Betting it wins two ways: they fold now, or you hit your card later. It works best against players who are willing to fold."],
  cbet: ['Follow-up bet', "If you raised before the flop, a small follow-up bet on the flop often wins straight away, because most hands miss most flops. It works best when the board has few ways to make straights and flushes."],
  position: ['Why your seat matters', 'Acting last lets you see what everyone else does before you decide. Play more hands from the button and the cutoff, and fewer when you have to act first.'],
  handSelection: ['Pick your hands', 'Beginners lose most chips by playing too many weak hands. Folding before the flop costs nothing. Losing a big pot with the second-best hand costs a lot.'],
  setMining: ['Small pairs', "A small pair turns into three of a kind on the flop only about 1 in 8 times. That's worth a call only when you could win a big pot (15 to 20 times the call) when it happens."],
  threeBet: ['Re-raise your best hands', "With a very strong hand, re-raise. It builds a bigger pot while you're ahead and often wins it right away. Just calling lets other players in cheaply."],
  isolate: ['Raise over callers', 'When players just call the big blind ("limp"), they usually have weak hands. Raising takes control, makes those weak hands pay, and often leaves you against just one of them.'],
  potControl: ['Keep the pot small', "An okay-but-not-great hand wants a small pot. Checking keeps it small and lets you see the next card cheaply, instead of betting and getting raised off your hand."],
  exploit: ['Play the player', "Adjust to each opponent. Against the Station, bet your good hands and don't bluff. Against the Maniac, let them do the betting. Against the Rock, steal their blinds and believe their raises."],
  trap: ['Let the aggressive player bet', 'Against someone who bets too often, checking or just calling with a strong hand can win more than raising. They keep betting, and you collect at the end.'],
  blindDefense: ['Defending the big blind', "You already have 20 in the pot, so calling a small raise is cheaper for you than for anyone else. Defend with decent hands, but still fold the weak ones."],
  readRange: ['What might they have?', "Don't try to guess one exact hand. Think about all the hands their bets and calls could mean, and narrow it down as the hand goes on."],
  freeCard: ['Take the free card', "With a draw and no bet to call, checking shows you the next card for nothing. Do it when a bet would just get called by someone who never folds."],
  giveUp: ['Know when to let go', "Not every pot is worth fighting for. With no hand, no draw and no reason to think they'll fold, check and give up. Chips you save count as much as chips you win."],
  domination: ['Watch your second card', "King-jack against ace-king shares the king, but loses because of the second card. It wins only about 1 in 4 times. Hands with a weak second card win small pots and lose big ones."],
};

// Shown under "What do these numbers mean?"
const GLOSSARY = [
  ['Chance to win', "If this exact spot were played 10 times, how many you'd expect to win. The coach works it out by dealing out the rest of the hand thousands of times, giving each bot the kind of hands its bets suggest."],
  ['Needed to call', "Calling costs chips, so you have to win often enough to get them back. This is the break-even point. A cheap call into a big pot needs few wins; an expensive call needs a lot."],
  ['The rule of thumb', "If your chance to win is higher than what you need, calling makes money over time. If it's lower, calling loses money over time, even if it works this once."],
  ['Helpful cards', 'Cards still in the deck that would probably make you the winner. Poker players call them "outs".'],
];

/* ---------- Reading opponents ---------- */
// Each bot action records the range it represents (w) and how often it's taken without a real hand (loose).
function estimateRange(p) {
  const pre = p.actions.filter(a => a.street === 0 && a.w != null);
  const width = pre.length ? Math.min(1, pre[pre.length - 1].w) : 1;
  const post = p.actions.filter(a => a.street > 0);
  const aggrActs = post.filter(a => a.type === 'raise');
  const callActs = post.filter(a => a.type === 'call');
  let cond = false, loose = 1;
  if (aggrActs.length) { cond = true; loose = aggrActs[aggrActs.length - 1].loose ?? .25; }
  else if (callActs.length) { cond = true; loose = callActs[callActs.length - 1].loose ?? .3; }
  return { width, cond, loose, aggr: aggrActs.length > 0, called: callActs.length > 0 };
}
const rangeOpt = p => { const r = estimateRange(p); return { width: r.width, cond: r.cond, loose: r.loose }; };

function rangeWords(w) {
  if (w <= .035) return 'only the very best hands: big pairs and ace-king';
  if (w <= .08) return 'strong hands: high pairs and big aces';
  if (w <= .16) return 'good hands: medium pairs, big aces and high cards of the same suit';
  if (w <= .3) return 'decent hands: most pairs and aces, high cards and connected cards';
  if (w <= .6) return 'lots of hands, including weak aces and suited cards';
  return 'almost any two cards';
}

function actionStory(p) {
  const bits = [];
  for (let s = 0; s <= G.street; s++) {
    const acts = p.actions.filter(a => a.street === s);
    if (!acts.length) continue;
    const words = acts.map(a => {
      if (a.type === 'raise') return s === 0 ? (a.level >= 2 ? 're-raised' : 'raised') : (a.level >= 2 ? 'raised' : 'bet');
      if (a.type === 'call') return s === 0 && a.to <= BB ? 'just called the big blind' : 'called';
      return a.type === 'check' ? 'checked' : 'folded';
    });
    bits.push(`${words.join(' then ')} ${s === 0 ? 'before the flop' : 'on the ' + STREETS[s].toLowerCase()}`);
  }
  return bits.length ? bits.join(', ') : "hasn't acted yet";
}

function readFor(p) {
  const P = PERSONAS[p.persona], r = estimateRange(p);
  let line = cap(actionStory(p)) + '. ';
  if (r.width < 1) line += `From ${P.name}, that usually means ${rangeWords(r.width)}.`;
  else line += p.actions.length ? 'They could still have almost anything.' : P.blurb;
  if (r.aggr) line += r.loose <= .12 ? ' They rarely bluff, so take their bets seriously.' : r.loose >= .4 ? " They bluff a lot, so don't fold good hands too easily." : ' Their bets usually mean a pair or a draw.';
  else if (r.called) line += r.loose >= .45 ? " They call with almost anything, so their calls don't mean much." : r.loose <= .15 ? ' When they call, they usually have something.' : ' Their calls usually mean a pair or a draw.';
  return { p, P, line, width: r.width, badge: r.width < .97 ? `best ${fracShort(r.width)}` : '' };
}

/* ---------- Hand description ---------- */
const aCard = r => `${r === 12 || r === 6 ? 'an' : 'a'} ${RANK_NAME[r]}`;
function madeInfo(hole, board) {
  const v = evaluate(hole.concat(board)), cat = catOf(v), bcat = catOf(evaluate(board));
  const br = board.map(rankOf).sort((a, b) => b - a), hr = hole.map(rankOf).sort((a, b) => b - a);
  let label = describe(v);
  if (cat === bcat && cat > 0) label = `Only what's on the board (your best card is ${aCard(hr[0])})`;
  else if (cat === 1) {
    const pr = kickersOf(v)[0];
    if (hr[0] === hr[1]) label = pr > br[0] ? `A pair of ${RANK_PL[pr]}, higher than every board card` : pr < br[br.length - 1] ? `A pair of ${RANK_PL[pr]}, lower than every board card` : `A pair of ${RANK_PL[pr]}, below the top board card`;
    else if (pr === br[0]) { const k = hr.find(x => x !== pr); label = `Top pair (${RANK_PL[pr]}) with ${aCard(k)} as your second card`; }
    else if (pr === br[br.length - 1]) label = `Bottom pair (${RANK_PL[pr]})`;
    else label = `Middle pair (${RANK_PL[pr]})`;
  } else if (cat === 3) {
    const t = kickersOf(v)[0];
    label = hr[0] === hr[1] ? `Three of a kind (${RANK_PL[t]}), using your pair` : `Three of a kind (${RANK_PL[t]})`;
  } else if (cat === 0) label = `Nothing yet: your best card is ${aCard(hr[0])}`;
  return { v, cat, label };
}

function heroInPosition() {
  const order = s => { const d = (s - G.dealer + N) % N; return d === 0 ? N : d; };
  return G.players.filter(p => !p.folded && !p.human && !p.allIn).every(p => order(p.id) < order(0));
}

function boardWords(tex) {
  const bits = [];
  if (tex.maxS >= 3) bits.push(`${tex.maxS} cards of one suit, so a flush is possible`);
  else if (tex.maxS === 2 && G.board.length < 5) bits.push('two cards of one suit, so flush draws are possible');
  if (tex.conn >= 3) bits.push('cards close together in rank, so straights are possible');
  if (tex.paired) bits.push('a pair on the board');
  if (!bits.length) return "The board has no obvious straights or flushes, so hands don't change much on later cards.";
  return `The board has ${bits.join(', and ')}.${tex.wet ? ' With lots of possible draws, strong hands should bet to make chasers pay.' : ''}`;
}

/* ---------- Sizing helpers ---------- */
function clampTo(hero, to) {
  to = Math.max(to, G.currentBet + G.minRaise);
  to = Math.round(to / 5) * 5;
  return Math.min(to, hero.bet + hero.stack);
}
function potBet(hero, frac) {
  const toCall = G.currentBet - hero.bet;
  return clampTo(hero, G.currentBet + frac * (potNow() + toCall));
}

/* ---------- Advice ---------- */
function getAdvice(iters = 1600) {
  const hero = G.players[0];
  const toCall = Math.max(0, G.currentBet - hero.bet);
  const pot = potNow();
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const opps = liveOpponents();
  const core = G.street === 0 ? preflopAdvice(hero, toCall, pot, potOdds, opps, iters) : postflopAdvice(hero, toCall, pot, potOdds, opps, iters);
  const max = hero.bet + hero.stack;
  let verdict;
  if (core.action === 'fold') verdict = 'Fold';
  else if (core.action === 'check') verdict = 'Check';
  else if (core.action === 'call') verdict = toCall >= hero.stack ? `Call all-in` : `Call ${fmt(toCall)}`;
  else verdict = core.amount >= max ? `All-in ${fmt(max)}` : G.currentBet === 0 ? `Bet ${fmt(core.amount)}` : `Raise to ${fmt(core.amount)}`;
  const tone = core.action === 'fold' ? 'stop' : core.action === 'check' || core.close ? 'caution' : 'go';
  return Object.assign(core, { verdict, tone, toCall, pot, potOdds, reads: opps.map(readFor), street: G.street, decisionId: G.decisionId, hand: G.handNo });
}

function preflopAdvice(hero, toCall, pot, potOdds, opps, iters) {
  const [a, b] = hero.hole;
  const pct = prePct(a, b), cls = handClass(a, b), pos = positionOf(0);
  const hi = Math.max(rankOf(a), rankOf(b)), lo = Math.min(rankOf(a), rankOf(b));
  const pair = hi === lo, suited = suitOf(a) === suitOf(b), gap = hi - lo - 1;
  const openW = OPEN_RANGE[pos];
  const tier = tierOf(pct);
  const invested = opps.filter(p => p.actions.some(x => x.street === 0 && (x.type === 'raise' || x.type === 'call')));
  const eq = invested.length ? equity(hero.hole, [], invested.map(rangeOf), iters) : null;
  const reasons = [`${cls} is a ${tier.name.toLowerCase()} hand: ${betterThan(pct)}.`, `You're on ${POS_LONG[pos]}: ${POS_NOTE[pos]}.`];
  let action, amount = 0, concept, summary, close = false;

  if (G.raiseCount === 0) {
    const limpers = invested.length;
    if (limpers) reasons.push(`${limpers === 1 ? 'One player has' : limpers + ' players have'} just called the big blind. That usually means a weak or so-so hand.`);
    if (toCall === 0) {
      if (pct <= .12) {
        action = 'raise'; amount = clampTo(hero, BB * (3 + limpers)); concept = 'isolate';
        summary = `Raise to ${fmt(amount)}. You have a strong hand, and players who just called are usually weak. Make them pay to see the flop.`;
      } else {
        action = 'check'; concept = 'potControl';
        summary = "Check. Seeing the flop is free, and your hand isn't strong enough to raise.";
      }
    } else if (pct <= openW * (limpers ? .8 : 1)) {
      action = 'raise'; amount = clampTo(hero, BB * (pos === 'SB' ? 3 : 2.5) + limpers * BB);
      concept = limpers ? 'isolate' : 'position';
      summary = limpers ? `Raise to ${fmt(amount)}. Your hand is good, and raising makes the weaker hands pay more or fold.`
                        : `Raise to ${fmt(amount)}. From ${POS_LONG[pos]}, good players raise with ${handsWord(openW)} and fold the rest. ${cls} is good enough.`;
      reasons.push(`From this seat, good players raise with ${handsWord(openW)} (the best ${pctTxt(openW)}).`);
    } else if (limpers && ['BTN', 'CO', 'SB'].includes(pos) && pct <= openW * 1.5 && (pair || (suited && gap <= 1))) {
      action = 'call'; concept = 'impliedOdds';
      summary = `Call ${fmt(toCall)}. It's cheap, and small pairs and connected cards of the same suit can win big pots when they hit.`;
    } else {
      action = 'fold'; concept = 'handSelection';
      summary = `Fold. ${cls} is too weak to play from ${POS_LONG[pos]}, and folding now costs nothing.`;
      reasons.push(`From this seat, good players raise with ${handsWord(openW)} (the best ${pctTxt(openW)}). This hand isn't one of them.`);
      if (pos === 'SB') reasons.push("Calling from the small blind with weak hands is a common mistake: you'll act first for the rest of the hand.");
    }
  } else {
    const raiser = G.players[G.lastAggressor];
    const R = estimateRange(raiser), w = R.width;
    const n = G.raiseCount;
    const eff = Math.min(hero.stack + hero.bet, raiser.stack + raiser.bet);
    const valueW = n >= 2 ? Math.min(.03, w * .45) : Math.max(.03, Math.min(.09, w * .4));
    let callW = w * (pos === 'BB' ? 1.5 : (pos === 'BTN' || pos === 'CO') ? 1.1 : .8);
    if (n >= 2) callW = w * .6;
    const weakAce = !pair && hi >= 11 && lo < 8 && !suited;
    reasons.push(`${raiser.name} ${n >= 2 ? 're-raised' : 'raised'} to ${fmt(G.currentBet)}. From them, that usually means ${rangeWords(w)}.`);
    if (eq !== null) reasons.push(`Against those hands you'd win ${often(eq)}. Calling ${fmt(toCall)} pays off if you win ${atLeast(potOdds)}.`);
    if (pct <= valueW) {
      action = 'raise';
      amount = clampTo(hero, G.currentBet * (n >= 2 ? 2.3 : (pos === 'BTN' || pos === 'CO') ? 3 : 3.5));
      if (amount >= (hero.stack + hero.bet) * .4) amount = hero.stack + hero.bet;
      concept = 'threeBet';
      summary = `Re-raise to ${fmt(amount)}. ${cls} beats almost every hand ${raiser.name} raises with, so build the pot now.`;
    } else if (pair && n === 1 && toCall * 15 <= eff - toCall) {
      action = 'call'; concept = 'setMining';
      summary = `Call and hope to hit three of a kind. That happens about 1 in 8 times, and there's ${fmt(eff)} to win when it does.`;
    } else if (pct <= callW && (eq === null || eq >= potOdds)) {
      action = 'call'; close = pct > callW * .8;
      concept = pos === 'BB' ? 'blindDefense' : 'position';
      summary = `Call ${fmt(toCall)}. Your hand is good enough to keep playing against what ${raiser.name} likely has${pos === 'BB' ? ", and you already have 20 in" : ''}.`;
    } else {
      action = 'fold';
      concept = weakAce ? 'domination' : (w < .12 ? 'readRange' : 'handSelection');
      summary = `Fold. ${cls} usually loses to the hands ${raiser.name} raises with.`;
      if (weakAce) reasons.push(`${cls} often runs into a bigger ace or king. When both players have the same high card, the second card decides it, and yours is weak.`);
    }
    if (action === 'call') reasons.push(pos === 'BTN' || pos === 'CO' ? "You'll act after them for the rest of the hand, which makes calling easier." : pos === 'BB' ? 'You already have 20 in the pot, so calling costs less.' : "You'll have to act first for the rest of the hand, which makes close calls worse.");
    if (raiser.persona === 'maniac') reasons.push('The Maniac raises with lots of hands, so you can play back at them with more hands than usual.');
    if (raiser.persona === 'rock') reasons.push('The Rock only raises with good hands. Keep playing with a very strong hand or a pair, and fold the rest.');
  }
  return { action, amount, concept, summary, reasons, equity: eq, need: toCall > 0 ? potOdds : null, close, handLabel: cls, pct, openW };
}

function postflopAdvice(hero, toCall, pot, potOdds, opps, iters) {
  const board = G.board, street = G.street, toCome = 3 - street;
  const eq = equity(hero.hole, board, opps.map(rangeOf), iters);
  const made = madeInfo(hero.hole, board);
  const dr = drawInfo(hero.hole, board);
  const { outs, pairOuts } = countOuts(hero.hole, board);
  const tex = boardTexture(board);
  const multi = opps.length > 1;
  const hasStation = opps.some(p => p.persona === 'station');
  const heroPFR = G.preflopRaiser === 0;
  const unseen = 52 - 2 - board.length;
  const hit = toCome === 2 ? 1 - ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1)) : toCome === 1 ? outs / unseen : 0;
  const suitName = dr.fdSuit >= 0 ? SUIT_WORD[dr.fdSuit].replace(/s$/, '') : '';
  const drawTxt = dr.flushDraw && dr.oesd ? `a flush draw and a straight draw (one more ${suitName} makes a flush; a card at either end makes a straight)`
    : dr.flushDraw ? `a flush draw (four ${suitName}s: one more makes a flush)`
    : dr.oesd ? 'a straight draw (four cards in a row: a card at either end makes a straight)'
    : dr.gutshot ? 'an inside straight draw (one exact rank fills the gap)' : '';
  const strongDraw = outs >= 8 && toCome > 0;
  let action, amount = 0, concept, summary, close = false;

  if (toCall === 0) {
    if (eq >= .65) {
      if (!multi && opps[0].persona === 'maniac' && street < 3) {
        action = 'check'; concept = 'trap';
        summary = "Check and let the Maniac bet for you. You're well ahead, and they bluff a lot.";
      } else {
        action = 'raise'; amount = potBet(hero, hasStation ? .8 : tex.wet ? .7 : .55); concept = hasStation ? 'exploit' : 'valueBet';
        summary = `Bet ${fmt(amount)}. You probably have the best hand, so make the worse hands pay${hasStation ? '. The Station will call with worse' : ''}.`;
      }
    } else if (eq >= .45 && !multi && ((tex.wet && street < 3) || (street === 3 && eq >= .55))) {
      action = 'raise'; amount = potBet(hero, street === 3 ? .4 : .5); concept = 'valueBet';
      summary = street === 3 ? 'Make a small bet. Plenty of worse hands will pay a small bet on the last card.'
                             : "Bet about half the pot. You're probably ahead, and betting makes players chasing draws pay.";
    } else if (eq >= .45) {
      action = 'check'; concept = 'potControl';
      summary = multi ? 'Check. Your hand is okay, but against several players it wants a small pot.' : 'Check. Your hand is okay but not great, so keep the pot small.';
    } else if (strongDraw) {
      if (hasStation) { action = 'check'; concept = 'freeCard'; summary = "Check and see the next card for free. The Station almost never folds, so betting your draw won't scare them off."; }
      else { action = 'raise'; amount = potBet(hero, .6); concept = 'semiBluff'; summary = `Bet ${fmt(amount)} with your draw. They might fold now, and if they call you can still hit one of your ${outs} helpful cards.`; }
    } else if (heroPFR && street === 1 && !multi && !tex.wet && opps[0].persona !== 'station') {
      action = 'raise'; amount = potBet(hero, .33); concept = 'cbet';
      summary = `Make a small bet of ${fmt(amount)}. You raised before the flop, and this board probably missed them.`;
    } else {
      action = 'check';
      concept = eq >= .3 ? 'potControl' : hasStation ? 'exploit' : 'giveUp';
      summary = eq >= .3 ? 'Check. You might have the best hand, but not by enough to bet.'
              : hasStation ? "Check. Bluffing the Station doesn't work, because they almost never fold."
              : "Check, and fold if they bet. You're unlikely to win this one, and there's no good bluff.";
    }
  } else {
    const bettor = G.players[G.lastAggressor];
    const BP = bettor && !bettor.human ? PERSONAS[bettor.persona] : null;
    const lastAgg = bettor ? [...bettor.actions].reverse().find(a => a.type === 'raise') : null;
    const bluffy = (lastAgg && lastAgg.loose != null ? lastAgg.loose : .2) >= .2;
    const impl = outs >= 4 && toCome > 0 ? (opps.some(p => p.persona === 'station' || p.persona === 'maniac') ? .06 : .03) : 0;
    if (eq >= .72 && G.raiseCount < 3) {
      if (!multi && BP && bettor.persona === 'maniac' && street < 3) {
        action = 'call'; concept = 'trap';
        summary = "Just call. You're well ahead, and the Maniac will keep betting into you.";
      } else {
        action = 'raise'; amount = clampTo(hero, G.currentBet * 3); concept = 'valueBet';
        summary = `Raise to ${fmt(amount)}. You very likely have the best hand, so make them pay more.`;
      }
    } else if (eq + impl >= potOdds + .03) {
      action = 'call';
      const needImpl = eq < potOdds + .03;
      concept = needImpl ? 'impliedOdds' : strongDraw && made.cat < 2 ? 'rule42' : 'potOdds';
      summary = needImpl ? "Call. The price is a little high, but if you hit you'll probably win extra chips later, which makes it worth it."
                         : `Call. You'll win ${often(eq)}, and calling only needs ${fracShort(potOdds)} to pay off.`;
    } else if (eq + impl >= potOdds - .04) {
      close = true;
      if (BP && bluffy) { action = 'call'; concept = 'readRange'; summary = `A close call, but lean towards calling. ${bettor.name} bluffs often enough that folding gives up too much.`; }
      else { action = 'fold'; concept = 'potOdds'; summary = `A close call, but fold. ${bettor ? bettor.name + ' rarely bluffs' : 'Their bet is usually real'}, so you're probably behind.`; }
    } else {
      action = 'fold'; concept = outs > 0 ? 'rule42' : 'potOdds';
      summary = `Fold. Calling only pays off if you win ${atLeast(potOdds)}, but you'll win just ${often(eq)}.`;
    }
  }

  const reasons = [];
  reasons.push(`You have ${made.label.charAt(0).toLowerCase() + made.label.slice(1)}${drawTxt ? `, plus ${drawTxt}` : ''}.`);
  if (toCall > 0) reasons.push(`Calling costs ${fmt(toCall)} and the pot would then be ${fmt(pot + toCall)}, so calling pays off if you win ${atLeast(potOdds)}. Against the hands they likely have, you win ${often(eq)}.`);
  else reasons.push(`Against the hands they likely have, you win ${often(eq)}${multi ? `. With ${opps.length} opponents, winning ${fracShort(1 / (opps.length + 1))} would be your fair share` : ''}.`);
  if (outs > 0 && toCome > 0) {
    const m = toCome === 2 ? 4 : 2;
    reasons.push(`${outs} cards left in the deck would give you a very strong hand. Quick trick: ${outs} × ${m} ≈ ${outs * m}%, so you'll hit ${often(hit)} ${toCome === 2 ? 'by the last card' : 'on the last card'}.`);
  }
  reasons.push(boardWords(tex));
  if (pairOuts > 0 && toCome > 0) reasons.push(`${pairOuts} more cards would pair one of your high cards. Those help less, because one pair often isn't enough.`);
  reasons.push(heroInPosition() ? "You act last, so you get to see what they do before you decide." : "You act before them, so they get to see what you do first.");

  return { action, amount, concept, summary, reasons, equity: eq, need: toCall > 0 ? potOdds : null, close, handLabel: made.label, outs, toCome };
}

/* ---------- Reviewing the player's decision ---------- */
function judge(adv, type) {
  const A = adv.action, t = type === 'bet' ? 'raise' : type;
  const eq = adv.equity, need = adv.need;
  const odds = eq != null && need != null ? ` You'd win ${often(eq)}, and needed ${atLeast(need)}.` : '';
  // The summary opens with the action ("Bet 650."); drop that so it isn't said twice.
  const why = adv.summary.replace(/^[^.]{1,30}\.\s+/, '');
  const coachWould = `The coach would ${adv.verdict.toLowerCase()}: ${why}`;
  if (t === A) return { level: 'good', text: `The coach would do the same.${odds}` };
  if (t === 'fold' && adv.toCall === 0) return { level: 'leak', text: "You folded when checking was free. If staying in costs nothing, don't fold." };
  if (adv.close) return { level: 'ok', text: `A close call either way. The coach slightly preferred to ${adv.verdict.toLowerCase()}.${odds}` };
  if (t === 'fold') {
    if (eq != null && need != null && eq > need) return { level: 'leak', text: `Folded too soon. You'd win ${often(eq)} here, and calling only needed ${atLeast(need)} to pay off.` };
    return { level: 'leak', text: `Folded too soon. ${coachWould}` };
  }
  if (A === 'fold') {
    if (adv.street === 0) return { level: 'leak', text: `Better to fold this one. ${why}` };
    return { level: 'leak', text: `This ${t === 'raise' ? 'bet' : 'call'} loses chips over time. You needed to win ${atLeast(need ?? 0)}, but you'd only win ${often(eq)}.` };
  }
  if (A === 'raise') return { level: 'ok', text: `You could have won more. ${coachWould}` };
  if (t === 'raise' && eq != null && eq < .3 && liveOpponents().some(p => p.persona === 'station'))
    return { level: 'leak', text: 'Bluffing the Station rarely works. They call with almost anything.' };
  return { level: 'ok', text: `Not what the coach would do. ${coachWould}` };
}
