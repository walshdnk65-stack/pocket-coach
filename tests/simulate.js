// Headless check: plays hundreds of hands (bots + a coach-driven hero, with some random deviations)
// and verifies that chips are conserved, the coach always answers, and the hand evaluator is sane.
// Run with: node tests/simulate.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src');
const src = ['engine.js', 'game.js', 'coach.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const queue = [];
const ctx = { console, Math, setTimeout: fn => queue.push(fn) };
vm.createContext(ctx);
vm.runInContext(src + `
var hands = 0, errors = [], verdicts = {}, leaks = 0, decisions = 0;
function render() {}
function onHandOver() {
  const total = G.players.reduce((s, p) => s + p.stack, 0);
  const expected = G.players.reduce((s, p) => s + p.buyins * START_STACK, 0);
  if (total !== expected) errors.push('hand ' + G.handNo + ': chips ' + total + ' vs ' + expected);
  hands++;
  if (hands < 400) setTimeout(startHand);
}
function onHumanTurn() {
  const a = getAdvice(250);
  verdicts[a.action] = (verdicts[a.action] || 0) + 1;
  if (!a.verdict || !a.summary || !a.reasons.length) errors.push('empty advice on hand ' + G.handNo);
  const r = Math.random();
  const t = r < .15 ? 'call' : r < .2 ? 'fold' : a.action;
  decisions++;
  if (judge(a, t).level === 'leak') leaks++;
  act(G.players[0], t, a.amount || clampTo(G.players[0], G.currentBet * 2));
}
makePlayers(); G.dealer = 0; startHand();
`, ctx);

let steps = 0;
while (queue.length && steps < 500000) { queue.shift()(); steps++; }

const check = vm.runInContext(`
const c = s => RANKS.indexOf(s[0]) * 4 + 'shdc'.indexOf(s[1]);
const H = s => s.split(' ').map(c);
const cases = [
  ['As Ks Qs Js Ts 2d 3c', 'Royal flush'],
  ['Ah 2d 3c 4s 5h Kd Kc', 'Straight, Five high'],
  ['Kh Kd Kc 2s 2h 2d 9c', 'Full house, Kings full of Twos'],
  ['Ah Kh 7h 2h 9h 9d 9c', 'Flush, Ace high'],
  ['Ah Ad Kc Ks Qh Qd 2c', 'Two pair, Aces and Kings'],
];
for (const [cards, want] of cases) { const got = describe(evaluate(H(cards))); if (got !== want) errors.push(cards + ': ' + got + ' (expected ' + want + ')'); }
if (COMBOS.length !== 1326) errors.push('combo count ' + COMBOS.length);
({ hands, steps: ${steps}, errors, verdicts, leaks, decisions });
`, ctx);

console.log(`Played ${check.hands} hands in ${check.steps} steps`);
console.log('Coach verdicts:', JSON.stringify(check.verdicts), `| leaks flagged: ${check.leaks}/${check.decisions}`);
if (check.errors.length) { console.error('FAILED:\n' + check.errors.slice(0, 10).join('\n')); process.exit(1); }
console.log('All checks passed.');
