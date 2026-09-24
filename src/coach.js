/* ================= The coach ================= */
const POS_LONG = { BTN: 'the button', SB: 'the small blind', BB: 'the big blind', UTG: 'under the gun', CO: 'the cutoff' };
const POS_NOTE = {
  UTG: 'first to act, with four players still to come',
  CO: 'one seat before the button, a good stealing seat',
  BTN: 'the best seat: you act last on every street after the flop',
  SB: 'you will be first to act after the flop, the worst position',
  BB: 'you already have 20 in the pot, so calling costs less',
};
const OPEN_RANGE = { UTG: .17, CO: .27, BTN: .45, SB: .35, BB: .12 };
const pctTxt = x => `${Math.round(x * 100)}%`;
const pctTop = x => (x < .015 ? 'top 1%' : `top ${Math.round(x * 100)}%`);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const LESSONS = {
  potOdds: ['Pot odds', 'Compare the price of a call with how often you win. Calling 50 into a pot of 150 risks 50 to win 200, so you need to win at least 25% of the time. If your equity is higher than that, the call makes money in the long run.'],
  rule42: ['The rule of 4 and 2', 'Count your outs: the cards that make you a likely winner. With two cards to come, multiply by 4. With one card to come, multiply by 2. Nine flush outs on the flop is about 36%; on the turn it is about 18%.'],
  impliedOdds: ['Implied odds', "When you hit a draw you often win more than what's in the pot now. Against players who pay off, a draw can be worth calling even when the pot odds alone say fold. Against tight players, don't count on it."],
  valueBet: ['Bet for value', 'When you are likely ahead, bet so worse hands pay you. Checking a strong hand gives free cards and earns nothing. Bet bigger on boards with lots of draws and against players who call too much.'],
  semiBluff: ['The semi-bluff', 'Betting a draw wins two ways: they fold now, or you make your hand later. That makes it far stronger than a pure bluff. It works best against players who can fold.'],
  cbet: ['Continuation bet', 'As the preflop raiser you represent the strongest hands. On a dry, unconnected board a small bet (about a third of the pot) wins often, because most hands missed the flop.'],
  position: ['Position', 'Acting last lets you see what everyone else does before you decide. Play more hands from the button and cutoff, and fewer under the gun and from the blinds.'],
  handSelection: ['Starting-hand discipline', 'Most chips are lost by playing too many weak hands. Folding preflop costs nothing; losing a big pot with a second-best hand costs a lot.'],
  setMining: ['Set mining', 'A small pocket pair flops three of a kind about 1 time in 8. Call a raise with one only when the stacks are deep enough to win 15 to 20 times the call when you hit.'],
  threeBet: ['Re-raise for value', "Re-raise (3-bet) with your strongest hands. It builds the pot while you're ahead and often wins it right away. Just calling with a premium hand lets others in cheaply."],
  isolate: ['The isolation raise', 'When players limp in, raise instead of limping behind. You take control, charge the weak hands, and often end up heads-up against the weakest player.'],
  potControl: ['Pot control', 'Medium-strength hands want medium-sized pots. Checking keeps the pot small, lets you see the next card cheaply, and avoids a raise that forces you to fold.'],
  exploit: ['Exploit their style', 'Adjust to the player in front of you. Against a Station, value bet thin and never bluff. Against a Maniac, let them do the betting. Against a Rock, steal often and believe their raises.'],
  trap: ['Let the aggressor bet', 'Against a player who bets too often, checking or just calling with a strong hand can win more than raising. They keep bluffing, and you keep collecting.'],
  blindDefense: ['Defending the big blind', "You already have chips in the pot, so you get a discount to call. Defend wider against small raises, but fold hands that are often dominated, like weak offsuit aces."],
  readRange: ['Think in ranges', "Don't put an opponent on one exact hand. Picture every hand their actions could mean, then narrow that range with each bet, call and check."],
  freeCard: ['Take the free card', 'With a draw and no bet to face, checking shows you the next card for nothing. Do it when a bet would just get called by someone who never folds.'],
  giveUp: ['Know when to give up', "Not every pot is worth fighting for. With no hand, no draw and no reason to think they'll fold, check and let it go. The chips you save count just as much as the ones you win."],
  domination: ['Domination', 'King-jack against ace-king shares a card and wins only about a quarter of the time. Hands with weak kickers win small pots and lose big ones.'],
};

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
  if (w <= .035) return 'only premium hands: big pairs and ace-king';
  if (w <= .08) return 'strong hands: tens or better and big aces';
  if (w <= .16) return 'good hands: middle pairs, big aces and suited high cards';
  if (w <= .3) return 'a solid range: any pair, most aces, high cards and suited connectors';
  if (w <= .6) return 'a wide range that includes weak aces, suited cards and gappers';
  return 'almost any two cards';
}

function actionStory(p) {
  const bits = [];
  for (let s = 0; s <= G.street; s++) {
    const acts = p.actions.filter(a => a.street === s);
    if (!acts.length) continue;
    const words = acts.map(a => {
      if (a.type === 'raise') return s === 0 ? (a.level >= 2 ? 're-raised' : 'raised') : (a.level >= 2 ? 'raised' : 'bet');
      if (a.type === 'call') return s === 0 && a.to <= BB ? 'limped' : 'called';
      return a.type === 'check' ? 'checked' : 'folded';
    });
    bits.push(`${words.join(' then ')} ${s === 0 ? 'preflop' : 'the ' + STREETS[s].toLowerCase()}`);
  }
  return bits.length ? bits.join(', ') : "hasn't acted yet";
}

function readFor(p) {
  const P = PERSONAS[p.persona], r = estimateRange(p);
  let line = cap(actionStory(p)) + '. ';
  if (r.width < 1) line += `For ${P.name}, that usually means ${rangeWords(r.width)}.`;
  else line += p.actions.length ? 'Their range is still wide open.' : P.blurb;
  if (r.aggr) line += r.loose <= .12 ? ' They rarely bluff, so take their bets seriously.' : r.loose >= .4 ? " They bluff a lot, so don't fold good hands too easily." : ' Their bets usually mean a pair or a draw.';
  else if (r.called) line += r.loose >= .45 ? " They call with almost anything, so their calls don't mean much." : r.loose <= .15 ? ' When they call, they usually have something.' : ' Their calls usually mean a pair or a draw.';
  return { p, P, line, width: r.width };
}

/* ---------- Hand description ---------- */
function madeInfo(hole, board) {
  const v = evaluate(hole.concat(board)), cat = catOf(v), bcat = catOf(evaluate(board));
  const br = board.map(rankOf).sort((a, b) => b - a), hr = hole.map(rankOf).sort((a, b) => b - a);
  let label = describe(v);
  if (cat === bcat && cat > 0) label = `Only the board's ${CAT_NAME[cat].toLowerCase()} (you have ${RANK_NAME[hr[0]]} high)`;
  else if (cat === 1) {
    const pr = kickersOf(v)[0];
    if (hr[0] === hr[1]) label = pr > br[0] ? `Overpair (${RANK_PL[pr]})` : pr < br[br.length - 1] ? `Underpair (${RANK_PL[pr]})` : `Pocket ${RANK_PL[pr]} below the top card`;
    else if (pr === br[0]) { const k = hr.find(x => x !== pr); label = `Top pair, ${RANK_NAME[k]} kicker`; }
    else if (pr === br[br.length - 1]) label = `Bottom pair (${RANK_PL[pr]})`;
    else label = `Middle pair (${RANK_PL[pr]})`;
  } else if (cat === 3) {
    const t = kickersOf(v)[0];
    label = hr[0] === hr[1] ? `A set of ${RANK_PL[t]}` : `Trips (${RANK_PL[t]})`;
  }
  return { v, cat, label };
}

function heroInPosition() {
  const order = s => { const d = (s - G.dealer + N) % N; return d === 0 ? N : d; };
  return G.players.filter(p => !p.folded && !p.human && !p.allIn).every(p => order(p.id) < order(0));
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
  const invested = opps.filter(p => p.actions.some(x => x.street === 0 && (x.type === 'raise' || x.type === 'call')));
  const eq = invested.length ? equity(hero.hole, [], invested.map(rangeOpt), iters) : null;
  const reasons = [`${cls} is in the ${pctTop(pct)} of starting hands.`, `You're in ${POS_LONG[pos]}: ${POS_NOTE[pos]}.`];
  let action, amount = 0, concept, summary, close = false;

  if (G.raiseCount === 0) {
    const limpers = invested.length;
    if (limpers) reasons.push(`${limpers === 1 ? 'One player has' : limpers + ' players have'} limped in. Limping usually shows a weak or speculative hand.`);
    if (toCall === 0) {
      if (pct <= .12) {
        action = 'raise'; amount = clampTo(hero, BB * (3 + limpers)); concept = 'isolate';
        summary = `Raise to ${fmt(amount)}. You have a strong hand and the limpers are weak. Make them pay to see a flop.`;
      } else {
        action = 'check'; concept = 'potControl';
        summary = "Check and see the flop for free. Your hand isn't strong enough to build a pot out of position.";
      }
    } else if (pct <= openW * (limpers ? .8 : 1)) {
      action = 'raise'; amount = clampTo(hero, BB * (pos === 'SB' ? 3 : 2.5) + limpers * BB);
      concept = limpers ? 'isolate' : 'position';
      summary = limpers ? `Raise to ${fmt(amount)} to isolate. Your hand plays well heads-up against a limper's range.`
                        : `Open-raise to ${fmt(amount)}. From ${POS_LONG[pos]} you should open about the ${pctTop(openW)} of hands, and ${cls} makes the cut.`;
      reasons.push(`A good opening range from here is about the ${pctTop(openW)} of hands.`);
      if (pos === 'UTG') reasons.push('Four players still act after you, so you want a hand that holds up when someone else has something.');
      if (pos === 'BTN' || pos === 'CO') reasons.push('Only the blinds are left to beat, and they will play the hand out of position against you.');
    } else if (limpers && ['BTN', 'CO', 'SB'].includes(pos) && pct <= openW * 1.5 && (pair || (suited && gap <= 1))) {
      action = 'call'; concept = 'impliedOdds';
      summary = `Limp behind for ${fmt(toCall)}. Small pairs and suited connectors play well in cheap multiway pots, because when they hit they hit big.`;
    } else {
      action = 'fold'; concept = 'handSelection';
      summary = `Fold. ${cls} is outside a sensible range from ${POS_LONG[pos]} (about the ${pctTop(openW)}).`;
      reasons.push(`A good opening range from here is about the ${pctTop(openW)} of hands.`);
      if (pos === 'SB') reasons.push("Completing the small blind with weak hands is a classic leak: you'll play the whole hand out of position.");
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
    reasons.push(`${raiser.name} ${n >= 2 ? 're-raised' : 'raised'} to ${fmt(G.currentBet)}. The way they play, that's roughly the ${pctTop(w)}: ${rangeWords(w)}.`);
    if (eq !== null) reasons.push(`Against those hands you win about ${pctTxt(eq)} of the time. Calling ${fmt(toCall)} needs ${pctTxt(potOdds)}.`);
    if (pct <= valueW) {
      action = 'raise';
      amount = clampTo(hero, G.currentBet * (n >= 2 ? 2.3 : (pos === 'BTN' || pos === 'CO') ? 3 : 3.5));
      if (amount >= (hero.stack + hero.bet) * .4) amount = hero.stack + hero.bet;
      concept = 'threeBet';
      summary = `Re-raise to ${fmt(amount)}. ${cls} is ahead of almost everything ${raiser.name} raises with. Build the pot now.`;
    } else if (pair && n === 1 && toCall * 15 <= eff - toCall) {
      action = 'call'; concept = 'setMining';
      summary = `Call and try to flop a set. ${cls} makes three of a kind about 12% of the time, and there's ${fmt(eff)} behind to win when it does.`;
    } else if (pct <= callW && (eq === null || eq >= potOdds)) {
      action = 'call'; close = pct > callW * .8;
      concept = pos === 'BB' ? 'blindDefense' : 'position';
      summary = `Call ${fmt(toCall)}. Your hand is strong enough to continue against this range${pos === 'BB' ? ", and you're getting a discount from the big blind" : ''}.`;
    } else {
      action = 'fold';
      concept = weakAce ? 'domination' : (w < .12 ? 'readRange' : 'handSelection');
      summary = `Fold. ${cls} doesn't do well against ${raiser.name}'s raising range.`;
      if (weakAce) reasons.push(`${cls} is often dominated: a raiser holds a better ace or king much more often than a worse one.`);
    }
    if (action === 'call') reasons.push(pos === 'BTN' || pos === 'CO' ? "You'll have position after the flop, which makes calling easier." : pos === 'BB' ? 'You already have 20 in the pot, so the price is lower.' : "You'll be out of position after the flop, which makes close calls worse.");
    if (raiser.persona === 'maniac') reasons.push('The Maniac raises light, so you can play back at them wider than usual.');
    if (raiser.persona === 'rock') reasons.push("The Rock only raises good hands. Continue with a premium hand or a pair to set-mine, and fold the rest.");
  }
  const stats = [
    { k: 'Hand', v: cls, sub: pctTop(pct) },
    { k: 'Position', v: pos },
    eq !== null ? { k: 'Equity', v: pctTxt(eq) } : { k: 'Open here', v: pctTop(openW) },
  ];
  return { action, amount, concept, summary, reasons, stats, equity: eq, need: toCall > 0 ? potOdds : null, close, handLabel: cls };
}

function postflopAdvice(hero, toCall, pot, potOdds, opps, iters) {
  const board = G.board, street = G.street, toCome = 3 - street;
  const eq = equity(hero.hole, board, opps.map(rangeOpt), iters);
  const made = madeInfo(hero.hole, board);
  const dr = drawInfo(hero.hole, board);
  const { outs, pairOuts } = countOuts(hero.hole, board);
  const tex = boardTexture(board);
  const multi = opps.length > 1;
  const hasStation = opps.some(p => p.persona === 'station');
  const heroPFR = G.preflopRaiser === 0;
  const unseen = 52 - 2 - board.length;
  const hit = toCome === 2 ? 1 - ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1)) : toCome === 1 ? outs / unseen : 0;
  const drawTxt = dr.flushDraw && dr.oesd ? 'a flush draw and an open-ended straight draw' : dr.flushDraw ? 'a flush draw' : dr.oesd ? 'an open-ended straight draw' : dr.gutshot ? 'a gutshot straight draw' : '';
  const strongDraw = outs >= 8 && toCome > 0;
  let action, amount = 0, concept, summary, close = false;

  if (toCall === 0) {
    if (eq >= .65) {
      if (!multi && opps[0].persona === 'maniac' && street < 3) {
        action = 'check'; concept = 'trap';
        summary = "Check and let the Maniac bet for you. You're well ahead and they bluff constantly.";
      } else {
        action = 'raise'; amount = potBet(hero, hasStation ? .8 : tex.wet ? .7 : .55); concept = hasStation ? 'exploit' : 'valueBet';
        summary = `Bet ${fmt(amount)} for value. You're ahead of most hands they could have${hasStation ? ', and the Station will call with worse' : ''}.`;
      }
    } else if (eq >= .45 && !multi && ((tex.wet && street < 3) || (street === 3 && eq >= .55))) {
      action = 'raise'; amount = potBet(hero, street === 3 ? .4 : .5); concept = 'valueBet';
      summary = street === 3 ? 'Make a small value bet. Plenty of worse hands will call a modest bet on the river.'
                             : "Bet about half the pot. You're probably ahead, and on this board you want draws to pay to catch up.";
    } else if (eq >= .45) {
      action = 'check'; concept = 'potControl';
      summary = multi ? 'Check. A medium-strength hand against several players wants a small pot.' : 'Check to keep the pot small with a medium-strength hand.';
    } else if (strongDraw) {
      if (hasStation) { action = 'check'; concept = 'freeCard'; summary = "Take the free card. The Station won't fold, so betting your draw has little chance of winning the pot right now."; }
      else { action = 'raise'; amount = potBet(hero, .6); concept = 'semiBluff'; summary = `Semi-bluff: bet ${fmt(amount)}. They may fold now, and if not you have ${outs} outs to make your hand.`; }
    } else if (heroPFR && street === 1 && !multi && !tex.wet && opps[0].persona !== 'station') {
      action = 'raise'; amount = potBet(hero, .33); concept = 'cbet';
      summary = `Make a small continuation bet of ${fmt(amount)}. You raised preflop, and this dry board rarely helps the player who called.`;
    } else {
      action = 'check';
      concept = eq >= .3 ? 'potControl' : hasStation ? 'exploit' : 'giveUp';
      summary = eq >= .3 ? 'Check. You have some chance to win at showdown, but not enough to bet.'
              : hasStation ? "Check. Bluffing the Station doesn't work because they almost never fold."
              : "Check, and be ready to let it go if they bet. You have little equity and no good reason to bluff.";
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
        summary = "Just call. You're well ahead, and the Maniac will keep betting into you on the next streets.";
      } else {
        action = 'raise'; amount = clampTo(hero, G.currentBet * 3); concept = 'valueBet';
        summary = `Raise to ${fmt(amount)}. You're a big favourite against their likely hands, so make them pay.`;
      }
    } else if (eq + impl >= potOdds + .03) {
      action = 'call';
      const needImpl = eq < potOdds + .03;
      concept = needImpl ? 'impliedOdds' : strongDraw && made.cat < 2 ? 'rule42' : 'potOdds';
      summary = needImpl ? `Call. The price is slightly too high on its own, but you'll win extra chips when you hit, and that makes up the difference.`
                         : `Call. You win about ${pctTxt(eq)} of the time and only need ${pctTxt(potOdds)}.`;
    } else if (eq + impl >= potOdds - .04) {
      close = true;
      if (BP && bluffy) { action = 'call'; concept = 'readRange'; summary = `A close call, and the coach leans call. ${bettor.name} bluffs often enough that folding here gives up too much.`; }
      else { action = 'fold'; concept = 'potOdds'; summary = `A close call, but fold. ${bettor ? bettor.name + ' rarely bluffs' : 'Their bet is usually real'}, so your real equity is probably lower than it looks.`; }
    } else {
      action = 'fold'; concept = outs > 0 ? 'rule42' : 'potOdds';
      summary = `Fold. You need ${pctTxt(potOdds)} to call but only win about ${pctTxt(eq)} of the time against their likely hands.`;
    }
  }

  const reasons = [];
  reasons.push(`You have ${made.label.charAt(0).toLowerCase() + made.label.slice(1)}${drawTxt ? `, plus ${drawTxt}` : ''}.`);
  if (toCall > 0) reasons.push(`Pot odds: call ${fmt(toCall)} to win ${fmt(pot + toCall)}, so you need ${pctTxt(potOdds)} equity. Against their likely hands you have about ${pctTxt(eq)}.`);
  else reasons.push(`Against their likely hands you win about ${pctTxt(eq)} of the time${multi ? ` (${opps.length} opponents, so a fair share would be ${pctTxt(1 / (opps.length + 1))})` : ''}.`);
  if (outs > 0 && toCome > 0) {
    const m = toCome === 2 ? 4 : 2;
    reasons.push(`${outs} outs to a straight or better. Rule of ${m}: ${outs} × ${m} ≈ ${outs * m}% to hit (exactly ${pctTxt(hit)}).`);
  }
  reasons.push(tex.wet ? `The board is ${tex.desc || 'coordinated'}: lots of draws are possible, so strong hands should bet to charge them.`
                       : `The board is ${tex.desc ? tex.desc + ' and ' : ''}fairly dry: few draws, so hands rarely change much on later cards.`);
  if (pairOuts > 0 && toCome > 0) reasons.push(`${pairOuts} more cards would pair one of your overcards. Count those as weaker outs, because one pair may not be enough.`);
  reasons.push(heroInPosition() ? "You're in position: you act last, so you get to see what they do first." : "You're out of position: you act before them, so you give away information every street.");

  const stats = [
    { k: 'Equity', v: pctTxt(eq) },
    toCall ? { k: 'Need', v: pctTxt(potOdds) } : { k: 'Pot', v: fmt(pot) },
    { k: 'Outs', v: toCome ? String(outs) : '—' },
  ];
  return { action, amount, concept, summary, reasons, stats, equity: eq, need: toCall > 0 ? potOdds : null, close, handLabel: made.label };
}

/* ---------- Reviewing the player's decision ---------- */
function judge(adv, type) {
  const A = adv.action, t = type === 'bet' ? 'raise' : type;
  const verb = { fold: 'fold', check: 'check', call: 'call', raise: G.currentBet === 0 && adv.street > 0 ? 'bet' : 'raise' };
  if (t === A) return { level: 'good', text: `Same as the coach: ${adv.verdict.toLowerCase()}. ${adv.summary}` };
  if (t === 'fold' && adv.toCall === 0) return { level: 'leak', text: 'You folded when you could have checked for free. Never fold when checking costs nothing.' };
  if (adv.close) return { level: 'ok', text: `A close spot. The coach leaned towards ${adv.verdict.toLowerCase()}, but your play is reasonable too.` };
  if (t === 'fold') {
    if (adv.equity != null && adv.need != null && adv.equity > adv.need) return { level: 'leak', text: `Too tight. You had about ${pctTxt(adv.equity)} equity and only needed ${pctTxt(adv.need)}. The coach would ${adv.verdict.toLowerCase()}.` };
    return { level: 'leak', text: `Too tight. The coach would ${adv.verdict.toLowerCase()}: ${adv.summary}` };
  }
  if (A === 'fold') {
    if (adv.street === 0) return { level: 'leak', text: `Too loose. ${adv.summary}` };
    return { level: 'leak', text: `Costly ${verb[t]}. You needed ${pctTxt(adv.need ?? 0)} but had only about ${pctTxt(adv.equity)} equity. ${adv.summary}` };
  }
  if (A === 'raise') return { level: 'ok', text: `Missed value. The coach would ${adv.verdict.toLowerCase()}: ${adv.summary}` };
  if (t === 'raise' && adv.equity != null && adv.equity < .3 && liveOpponents().some(p => p.persona === 'station'))
    return { level: 'leak', text: 'Bluffing into the Station rarely works. They call with almost anything.' };
  return { level: 'ok', text: `The coach preferred to ${adv.verdict.toLowerCase()}. ${adv.summary}` };
}
