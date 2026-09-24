'use strict';
/* ================= Cards & hand evaluation ================= */
// A card is an int 0..51: rank = c>>2 (0 = deuce … 12 = ace), suit = c&3 (♠ ♥ ♦ ♣)
const RANKS = '23456789TJQKA';
const SUIT_SYM = ['♠︎', '♥︎', '♦︎', '♣︎'];
const SUIT_CLASS = ['sp', 'he', 'di', 'cl'];
const SUIT_WORD = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANK_NAME = ['Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Jack','Queen','King','Ace'];
const RANK_PL = ['Twos','Threes','Fours','Fives','Sixes','Sevens','Eights','Nines','Tens','Jacks','Queens','Kings','Aces'];
const rankOf = c => c >> 2;
const suitOf = c => c & 3;
const rankLabel = r => (r === 8 ? '10' : RANKS[r]);
const cardText = c => rankLabel(rankOf(c)) + SUIT_SYM[suitOf(c)];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function freshDeck() { const d = []; for (let i = 0; i < 52; i++) d.push(i); return shuffle(d); }
function remainingDeck(exclude) {
  const used = new Uint8Array(52); for (const c of exclude) used[c] = 1;
  const d = []; for (let i = 0; i < 52; i++) if (!used[i]) d.push(i); return d;
}

function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) { const m = 0x1f << (h - 4); if ((mask & m) === m) return h; }
  if ((mask & 0x100f) === 0x100f) return 3; // wheel A-2-3-4-5
  return -1;
}

const CAT_BASE = 1048576; // 16^5
const catOf = v => Math.floor(v / CAT_BASE);
const CAT_NAME = ['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
function pack(cat, ks) { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] ?? 0); return v; }
function kickersOf(v) { const k = []; let t = v % CAT_BASE; for (let i = 0; i < 5; i++) { k.unshift(t % 16); t = Math.floor(t / 16); } return k; }

// Best 5-card value from any 1–7 cards; higher is better.
function evaluate(cards) {
  const rc = new Array(13).fill(0), sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) { const r = c >> 2, s = c & 3; rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) { const h = straightHigh(sm[fs]); if (h >= 0) return pack(8, [h]); }
  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) { if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r); }
  const kick = (ex, n) => { const out = []; for (let r = 12; r >= 0 && out.length < n; r--) if (rc[r] && !ex.includes(r)) out.push(r); return out; };
  if (quads.length) return pack(7, [quads[0], ...kick([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = trips.length > 1 ? Math.max(trips[1], pairs.length ? pairs[0] : -1) : pairs[0];
    return pack(6, [trips[0], p]);
  }
  if (fs >= 0) { const out = []; for (let r = 12; r >= 0 && out.length < 5; r--) if ((sm[fs] >> r) & 1) out.push(r); return pack(5, out); }
  const sh = straightHigh(mask); if (sh >= 0) return pack(4, [sh]);
  if (trips.length) return pack(3, [trips[0], ...kick([trips[0]], 2)]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return pack(1, [pairs[0], ...kick([pairs[0]], 3)]);
  return pack(0, kick([], 5));
}

function describe(v) {
  const k = kickersOf(v);
  switch (catOf(v)) {
    case 8: return k[0] === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAME[k[0]]} high`;
    case 7: return `Four ${RANK_PL[k[0]]}`;
    case 6: return `Full house, ${RANK_PL[k[0]]} full of ${RANK_PL[k[1]]}`;
    case 5: return `Flush, ${RANK_NAME[k[0]]} high`;
    case 4: return `Straight, ${RANK_NAME[k[0]]} high`;
    case 3: return `Three ${RANK_PL[k[0]]}`;
    case 2: return `Two pair, ${RANK_PL[k[0]]} and ${RANK_PL[k[1]]}`;
    case 1: return `Pair of ${RANK_PL[k[0]]}`;
    default: return `${RANK_NAME[k[0]]} high`;
  }
}

/* ================= Preflop hand ranking ================= */
// Chen-formula score (unrounded) with a small high-card tiebreak orders the 169 starting hands.
function chenScore(hi, lo, suited) {
  const pts = r => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  if (hi === lo) return Math.max(5, pts(hi) * 2);
  let s = pts(hi) + (suited ? 2 : 0);
  const gap = hi - lo - 1;
  s -= [0, 1, 2, 4][gap] ?? 5;
  if (gap <= 1 && hi < 10) s += 1;
  return s;
}
function classKey(hi, lo, suited) { return hi === lo ? RANKS[hi] + RANKS[lo] : RANKS[hi] + RANKS[lo] + (suited ? 's' : 'o'); }
function handClass(c1, c2) {
  let a = rankOf(c1), b = rankOf(c2); if (b > a) [a, b] = [b, a];
  return classKey(a, b, suitOf(c1) === suitOf(c2));
}
const PRE = {};           // class -> { pct: fraction of all hands at least this good, order }
const COMBOS = [];        // all 1326 two-card combos, strongest first
(function buildPreflop() {
  const list = [];
  for (let a = 12; a >= 0; a--) for (let b = a; b >= 0; b--) {
    if (a === b) list.push({ hi: a, lo: b, s: false, n: 6 });
    else { list.push({ hi: a, lo: b, s: true, n: 4 }); list.push({ hi: a, lo: b, s: false, n: 12 }); }
  }
  for (const h of list) { h.k = classKey(h.hi, h.lo, h.s); h.score = chenScore(h.hi, h.lo, h.s) + (h.hi + h.lo) / 100 + (h.hi === h.lo ? 0.05 : 0); }
  list.sort((x, y) => y.score - x.score);
  let cum = 0;
  list.forEach((h, i) => {
    cum += h.n; PRE[h.k] = { pct: cum / 1326, order: i + 1 };
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
      const c1 = h.hi * 4 + s1, c2 = h.lo * 4 + s2;
      if (h.hi === h.lo) { if (s2 > s1) COMBOS.push([c1, c2]); }
      else if (h.s ? s1 === s2 : s1 !== s2) COMBOS.push([c1, c2]);
    }
  });
})();
const prePct = (c1, c2) => PRE[handClass(c1, c2)].pct;

/* ================= Draws, outs, board texture ================= */
function drawInfo(hole, board) {
  const all = hole.concat(board);
  const sc = [0, 0, 0, 0], hs = [0, 0, 0, 0];
  for (const c of all) sc[suitOf(c)]++;
  for (const c of hole) hs[suitOf(c)]++;
  let flushDraw = false, fdSuit = -1;
  if (board.length < 5) for (let s = 0; s < 4; s++) if (sc[s] === 4 && hs[s] > 0) { flushDraw = true; fdSuit = s; }
  let mask = 0, bmask = 0;
  for (const c of all) mask |= 1 << rankOf(c);
  for (const c of board) bmask |= 1 << rankOf(c);
  const straightRanks = [];
  if (board.length < 5 && straightHigh(mask) < 0) {
    for (let r = 0; r < 13; r++) {
      if ((mask >> r) & 1) continue;
      if (straightHigh(mask | (1 << r)) >= 0 && straightHigh(bmask | (1 << r)) < 0) straightRanks.push(r);
    }
  }
  return { flushDraw, fdSuit, oesd: straightRanks.length >= 2, gutshot: straightRanks.length === 1, straightRanks };
}

// Cards that turn hero's hand into a straight or better (using a hole card).
function countOuts(hole, board) {
  if (board.length >= 5) return { outs: 0, pairOuts: 0 };
  const cur = catOf(evaluate(hole.concat(board)));
  let outs = 0, pairOuts = 0;
  const topBoard = Math.max(...board.map(rankOf));
  for (const c of remainingDeck(hole.concat(board))) {
    const nc = catOf(evaluate(hole.concat(board, [c])));
    const bc = catOf(evaluate(board.concat([c])));
    if (nc >= 4 && cur < 4 && nc > bc) outs++;
    else if (cur === 0 && nc === 1 && bc === 0 && rankOf(c) > topBoard && hole.some(h => rankOf(h) === rankOf(c))) pairOuts++;
  }
  return { outs, pairOuts };
}

function boardTexture(board) {
  const sc = [0, 0, 0, 0]; board.forEach(c => sc[suitOf(c)]++);
  const maxS = Math.max(...sc);
  const rs = board.map(rankOf);
  const paired = new Set(rs).size < rs.length;
  let mask = 0; rs.forEach(r => (mask |= 1 << r));
  let conn = 0;
  for (let lo = -1; lo <= 8; lo++) {
    let n = 0; for (let r = lo; r < lo + 5; r++) { const rr = r === -1 ? 12 : r; if ((mask >> rr) & 1) n++; }
    conn = Math.max(conn, n);
  }
  const flushy = maxS >= 3;
  const wet = flushy || conn >= 3 || (maxS === 2 && board.length === 3 && conn >= 2);
  const bits = [];
  if (board.length === 3) bits.push(maxS === 3 ? 'monotone' : maxS === 2 ? 'two-tone' : 'rainbow');
  else if (flushy) bits.push('flush possible');
  if (paired) bits.push('paired');
  if (conn >= 3) bits.push('connected');
  return { wet, flushy, paired, conn, maxS, desc: bits.join(', ') };
}

/* ================= Equity (Monte Carlo) ================= */
// Does this hole hand interact with the board (made hand using a hole card, or a real draw)?
function connects(h, board) {
  if (catOf(evaluate(h.concat(board))) > catOf(evaluate(board))) return true;
  if (board.length < 5) { const d = drawInfo(h, board); if (d.flushDraw || d.oesd) return true; }
  return false;
}

// opps: array of null (any two cards) or { width, cond, loose } describing a likely range.
function equity(hero, board, opps, iters = 1000) {
  const dead = new Uint8Array(52);
  for (const c of hero) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const used = new Uint8Array(52);
  let score = 0;
  const heroFixed = hero.slice();
  for (let it = 0; it < iters; it++) {
    used.set(dead);
    const holes = [];
    for (const o of opps) {
      const lim = Math.max(6, Math.min(1326, Math.round((o ? o.width : 1) * 1326)));
      let h = null;
      for (let t = 0; t < 60; t++) {
        const cb = COMBOS[(Math.random() * lim) | 0];
        if (used[cb[0]] || used[cb[1]]) continue;
        h = cb;
        if (o && o.cond && board.length >= 3 && t < 45 && Math.random() > o.loose && !connects(cb, board)) continue;
        break;
      }
      if (!h) {
        let a, b;
        do { a = (Math.random() * 52) | 0; } while (used[a]);
        used[a] = 1;
        do { b = (Math.random() * 52) | 0; } while (used[b]);
        used[a] = 0; h = [a, b];
      }
      used[h[0]] = 1; used[h[1]] = 1; holes.push(h);
    }
    const run = board.slice();
    while (run.length < 5) { const c = (Math.random() * 52) | 0; if (!used[c]) { used[c] = 1; run.push(c); } }
    const hv = evaluate(heroFixed.concat(run));
    let mx = hv; const vs = [];
    for (const h of holes) { const v = evaluate(h.concat(run)); vs.push(v); if (v > mx) mx = v; }
    if (hv === mx) { let n = 1; for (const v of vs) if (v === mx) n++; score += 1 / n; }
  }
  return score / iters;
}
