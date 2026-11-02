const E = require('../src/engine.js');
const G = require('../src/board-graph.json');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } }
function D(st, a) { const r = E.dispatch(st, G, a); if (r.error) throw new Error(a.type + ': ' + r.error); return r.state; }
function Dx(st, a) { return E.dispatch(st, G, a); }
const adj = E.buildAdj(G);
const dev = (st, o) => D(st, Object.assign({ type: 'DEV' }, o));

// graph sanity
const dist = E.bfsDist(G, 6);
ok(G.nodes.length >= 90, 'board has ~91 spaces');
ok(G.nodes.every(n => dist[n.id] != null), 'graph connected');
ok(G.nodes.filter(n => n.type === 'money').length === 11, '11 money blocks');
ok(G.nodes.filter(n => n.type === 'card').length === 8, '8 card blocks');
ok(G.nodes.filter(n => n.type === 'wand').length === 1, '1 wand');

// 1,2 initial state
let s = E.createGame(G, { seed: 1 });
ok(s.players.H.galleons === 10 && s.players.V.galleons === 5, 'start galleons');
ok(s.turn === 'V', 'Voldemort first');
ok(s.players.V.node === 6 && s.players.H.node === 66, 'start nodes');
ok(Object.values(s.money).every(v => v === 3), 'money blocks hold 3');
ok(s.deck.length === 17, '17 spell cards');

// 3,4 dice ranges
const facesV = new Set(), facesH = new Set();
for (let i = 0; i < 400; i++) {
  let g = E.createGame(G, { seed: i + 10 });
  let r = E.dispatch(g, G, { type: 'ROLL_MOVE' }); facesV.add(r.state.roll.face);
  g = dev(g, { op: 'setTurn', who: 'H' });
  r = E.dispatch(g, G, { type: 'ROLL_MOVE' }); facesH.add(r.state.roll.face);
}
ok([...facesV].every(f => f >= 1 && f <= 3) && facesV.size === 3, 'V die 1-3: ' + [...facesV]);
ok([...facesH].every(f => f >= 1 && f <= 6) && facesH.size === 6, 'H die 1-6: ' + [...facesH]);
ok(Dx(s, { type: 'ROLL_MOVE', force: 4 }).error, 'V cannot roll 4');

// 5,6 graph-valid movement and branching, no back-and-forth
s = E.createGame(G, { seed: 2 });
s = D(s, { type: 'ROLL_MOVE', force: 3 });
ok(s.phase === 'moving' && s.stepsLeft === 3, 'moving phase');
let legal = E.legalSteps(s, G);
ok(JSON.stringify(legal) === JSON.stringify([36]), 'V start only to 36');
ok(Dx(s, { type: 'STEP', to: 65 }).error, 'cannot jump non-adjacent');
s = D(s, { type: 'STEP', to: 36 });
legal = E.legalSteps(s, G).sort((a, b) => a - b);
ok(JSON.stringify(legal) === JSON.stringify([29, 65]), 'branch at 36 offers 29/65 (no going back to 6): ' + legal);
ok(Dx(s, { type: 'STEP', to: 6 }).error, 'no back-and-forth');
s = D(s, { type: 'STEP', to: 29 });
s = D(s, { type: 'STEP', to: 25 });
ok(s.turn === 'H' && s.players.V.node === 25, 'exactly 3 steps then turn passes');
ok(Dx(s, { type: 'STEP', to: 89 }).error, 'cannot move more than rolled');
ok(Dx(s, { type: 'ROLL_MOVE', force: 1 }).error === undefined, 'H can roll');
let s2 = D(s, { type: 'ROLL_MOVE', force: 1 });
ok(Dx(s2, { type: 'ROLL_MOVE', force: 1 }).error, 'no double roll');

// 7 money collection + freeze (8)
s = E.createGame(G, { seed: 3 });
s = dev(s, { op: 'teleport', who: 'V', node: 2 });
s = D(s, { type: 'ROLL_MOVE', force: 1 });
s = D(s, { type: 'STEP', to: 53 });
ok(s.players.V.galleons === 6 && s.money[53] === 2, 'collected 1 galleon, block down to 2');
ok(s.players.V.freeze === 5, 'freeze 5 after money');
// Harry turn, then V returns to money block while frozen
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: E.legalSteps(s, G)[0] });
ok(s.players.V.freeze === 5, 'freeze not decremented on opponent turn');
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: 2 });
ok(s.players.V.freeze === 4, 'freeze ticks down');
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: E.legalSteps(s, G)[0] });
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: 53 });
ok(s.players.V.galleons === 6 && s.money[53] === 2, 'frozen player cannot collect');
// thaw fully and collect again
s = dev(s, { op: 'freeze', who: 'V', value: 0 }); s = dev(s, { op: 'setTurn', who: 'V' });
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: 58 });
s = dev(s, { op: 'setTurn', who: 'V' }); s = dev(s, { op: 'freeze', who: 'V', value: 0 });
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: 53 });
ok(s.players.V.galleons === 7 && s.money[53] === 1, 'collect again after thaw');
// empty block
s = dev(s, { op: 'setTurn', who: 'V' });
const emptyTest = JSON.parse(JSON.stringify(s)); emptyTest.money[53] = 0; emptyTest.players.V.freeze = 0;
let e1 = D(emptyTest, { type: 'ROLL_MOVE', force: 1 }); e1 = D(e1, { type: 'STEP', to: 2 });
e1 = dev(e1, { op: 'setTurn', who: 'V' }); e1 = D(e1, { type: 'ROLL_MOVE', force: 1 }); e1 = D(e1, { type: 'STEP', to: 53 });
ok(e1.players.V.galleons === 7 && e1.players.V.freeze === 0, 'empty money block gives nothing and no freeze');

// 9,10 special dice, obstacles
s = E.createGame(G, { seed: 4 });
s = D(s, { type: 'ROLL_SPECIAL', force: 'flame' });
ok(s.players.V.galleons === 4 && s.phase === 'placeObstacle', 'V pays 1 to roll special');
ok(Dx(s, { type: 'PLACE_OBSTACLE', node: 53 }).error, 'cannot place on money');
ok(Dx(s, { type: 'PLACE_OBSTACLE', node: 63 }).error, 'cannot place on card');
ok(Dx(s, { type: 'PLACE_OBSTACLE', node: 66 }).error, 'cannot place on start/occupied');
ok(Dx(s, { type: 'PLACE_OBSTACLE', node: 90 }).error, 'cannot place on wand');
s = D(s, { type: 'PLACE_OBSTACLE', node: 54 });
ok(s.obstacles[54] === 'flame' && s.turn === 'H', 'obstacle placed, turn passes');
s = D(s, { type: 'ROLL_MOVE', force: 2 });
ok(!E.legalSteps(s, G).includes(54), 'obstacle blocks movement');
s = D(s, { type: 'STEP', to: 26 }); s = D(s, { type: 'STEP', to: E.legalSteps(s, G)[0] });
s = D(s, { type: 'ROLL_SPECIAL', force: 'flame' });
ok(s.phase === 'placeObstacle', 'V placing again');
ok(Dx(s, { type: 'PLACE_OBSTACLE', node: 54 }).error, 'no two obstacles on same block');
s = D(s, { type: 'PLACE_OBSTACLE', node: 55 });
const hg = s.players.H.galleons;
s = D(s, { type: 'ROLL_SPECIAL', force: 'moon' });
ok(s.players.H.galleons === hg - 1 && s.turn === 'V' && s.obstacles[54], 'H misses with wrong symbol, still pays');
s = D(s, { type: 'ROLL_MOVE', force: 1 }); s = D(s, { type: 'STEP', to: E.legalSteps(s, G)[0] });
s = D(s, { type: 'ROLL_SPECIAL', force: 'flame' });
ok(s.phase === 'removeObstacle' && s.pending.candidates.length === 2, 'H matches symbol: choose');
s = D(s, { type: 'REMOVE_OBSTACLE', node: 54 });
ok(!s.obstacles[54] && s.obstacles[55], 'obstacle removed');
// cannot use normal + special in same turn
s = D(s, { type: 'ROLL_MOVE', force: 1 });
ok(Dx(s, { type: 'ROLL_SPECIAL' }).error, 'no special after normal');
// no galleons
let poor = E.createGame(G, { seed: 5 }); poor = dev(poor, { op: 'galleons', who: 'V', value: 0 });
ok(Dx(poor, { type: 'ROLL_SPECIAL' }).error, 'special requires galleon');
ok(Dx(dev(poor, { op: 'setTurn', who: 'H' }), { type: 'ROLL_SPECIAL' }).error, 'H special requires obstacles');
// obstacle cap
let cap = E.createGame(G, { seed: 6 });
let freeNodes = E.validObstacleTargets(cap, G);
for (let i = 0; i < 15; i++) cap = dev(cap, { op: 'obstacle', node: freeNodes[i], symbol: 'star' });
cap = dev(cap, { op: 'setTurn', who: 'V' });
ok(Dx(cap, { type: 'ROLL_SPECIAL' }).error, 'max 15 obstacles');

// 11 spell cards
function drawWith(card, who, setup) {
  let g = E.createGame(G, { seed: 7 });
  g = dev(g, { op: 'stackCard', card });
  if (setup) g = setup(g);
  g = dev(g, { op: 'setTurn', who });
  const cardNode = 63, pre = adj[cardNode].find(n => n !== 6 && n !== 66);
  g = dev(g, { op: 'teleport', who, node: pre });
  g = D(g, { type: 'ROLL_MOVE', force: 1 });
  g = D(g, { type: 'STEP', to: cardNode });
  ok(g.phase === 'card' && g.pending.card === card, 'drew ' + card);
  return g;
}
let c;
c = D(drawWith('petrificus', 'H'), { type: 'RESOLVE_CARD' });
ok(c.turn === 'V' && c.phase === 'skipped', 'petrificus: V skips');
c = D(c, { type: 'ACK_SKIP' }); ok(c.turn === 'H' && c.phase === 'choose' && !c.players.V.petrified, 'skip consumed');
c = D(drawWith('stupefy', 'V'), { type: 'RESOLVE_CARD' }); ok(c.turn === 'H' && c.phase === 'skipped', 'stupefy');
c = D(drawWith('relashio', 'V'), { type: 'RESOLVE_CARD' }); ok(c.players.H.galleons === 9, 'relashio');
c = D(drawWith('accio', 'H'), { type: 'RESOLVE_CARD' }); ok(c.players.H.galleons === 11 && Object.values(c.money).reduce((a, b) => a + b) === 32, 'accio');
c = D(drawWith('homenum', 'H'), { type: 'RESOLVE_CARD' }); ok(c.peek && c.peek.card === c.deck[0], 'homenum peek');
c = D(drawWith('incarcerous', 'H'), { type: 'RESOLVE_CARD' }); c = D(c, { type: 'ROLL_MOVE', force: 2 }); ok(c.roll.steps === 1 && c.stepsLeft === 1, 'incarcerous -1');
c = D(drawWith('cloak', 'H'), { type: 'RESOLVE_CARD' });
ok(c.players.H.shield, 'cloak shield');
{ let g = dev(c, { op: 'teleport', who: 'V', node: adj[c.players.H.node][0] }); g = D(g, { type: 'ROLL_MOVE', force: 1 }); ok(!E.legalSteps(g, G).includes(g.players.H.node), 'shielded Harry cannot be caught'); }
c = D(drawWith('evanesco', 'V'), { type: 'RESOLVE_CARD' }); ok(c.players.V.shield, 'evanesco');
c = D(drawWith('imperio', 'V'), { type: 'RESOLVE_CARD' }); ok(c.players.H.imperioBy === 'V' && !E.availableActions(c, G).rollSpecial, 'imperio forces movement');
c = D(c, { type: 'ROLL_MOVE', force: 2 }); ok(c.roll.imperioBy === 'V', 'imperio applied to roll');
c = D(drawWith('incendio', 'H'), { type: 'RESOLVE_CARD' }); ok(c.players.H.held.includes('incendio'), 'incendio held');
{ let g = dev(c, { op: 'obstacle', node: 54, symbol: 'skull' }); g = dev(g, { op: 'setTurn', who: 'H' });
  g = D(g, { type: 'USE_HELD', card: 'incendio' }); g = D(g, { type: 'REMOVE_OBSTACLE', node: 54 });
  ok(!g.obstacles[54] && !g.players.H.held.includes('incendio') && g.phase === 'choose' && g.turn === 'H', 'incendio removes free and turn continues');
  ok(g.players.H.galleons === 10, 'incendio is free'); }
c = D(drawWith('reducio', 'V'), { type: 'RESOLVE_CARD' }); ok(c.players.V.held.includes('reducio'), 'reducio held');
c = D(drawWith('expelliarmus', 'V', g => dev(g, { op: 'wandGive' })), { type: 'RESOLVE_CARD' });
ok(!c.wand.holder && c.wand.node === 90, 'expelliarmus returns wand');
c = D(drawWith('expelliarmus', 'H', g => dev(g, { op: 'wandGive' })), { type: 'RESOLVE_CARD' }); ok(c.wand.holder === 'H', 'expelliarmus by Harry harmless');
{ let g = drawWith('portus', 'V'); const h = g.players.H.node, v = g.players.V.node; g = D(g, { type: 'RESOLVE_CARD' }); ok(g.players.H.node === v && g.players.V.node === h, 'portus swap'); }
{ let g = drawWith('leviosa', 'V', x => dev(x, { op: 'obstacle', node: 54, symbol: 'moon' })); g = D(g, { type: 'RESOLVE_CARD' });
  ok(g.phase === 'leviosaPick', 'leviosa pick'); g = D(g, { type: 'LEVIOSA_PICK', node: 54 }); g = D(g, { type: 'LEVIOSA_DROP', node: 55 });
  ok(!g.obstacles[54] && g.obstacles[55] === 'moon' && g.turn === 'H', 'leviosa moved'); }
c = D(drawWith('patronum', 'H'), { type: 'RESOLVE_CARD' }); ok(c.turn === 'V', 'patronum no effect');
c = D(drawWith('riddikulus', 'H'), { type: 'RESOLVE_CARD' }); ok(c.turn === 'V', 'riddikulus no effect');
{ let g = drawWith('stupefy', 'V', x => { x = JSON.parse(JSON.stringify(x)); x.players.H.held.push('protego'); return x; });
  g = D(g, { type: 'RESOLVE_CARD' }); ok(g.players.V.petrified && !g.players.H.petrified && !g.players.H.held.includes('protego'), 'protego reflects'); ok(g.turn === 'H' && g.phase === 'choose', 'H plays normally after reflect');
  g = D(g, { type: 'ROLL_MOVE', force: 1 }); g = D(g, { type: 'STEP', to: E.legalSteps(g, G)[0] }); ok(g.turn === 'V' && g.phase === 'skipped', 'reflected stun hits V on his next turn'); }
{ let g = drawWith('petrificus', 'H'); const r1 = D(g, { type: 'RESOLVE_CARD' }); ok(Dx(r1, { type: 'RESOLVE_CARD' }).error, 'card cannot apply twice'); }
c = drawWith('patronum', 'H'); ok(c.players.H.freeze === 5, 'card block freezes');
// all cards covered
ok(E.CARDS.length === 17, '17 card types');

// 12,13,15 wand + countdown + Harry wins
s = E.createGame(G, { seed: 8 });
s = dev(s, { op: 'teleport', who: 'H', node: 75 }); s = dev(s, { op: 'setTurn', who: 'H' });
s = D(s, { type: 'ROLL_MOVE', force: 5 });
ok(E.legalSteps(s, G).includes(90), 'wand reachable');
s = D(s, { type: 'STEP', to: 90 });
ok(s.wand.holder === 'H' && s.wand.movesLeft === 15 && s.turn === 'V', 'wand acquired, movement stops, countdown 15');
let cd = s;
for (let i = 0; i < 14; i++) {
  cd = D(cd, { type: 'ROLL_MOVE', force: 1 }); if (cd.phase === 'moving') cd = D(cd, { type: 'STEP', to: E.legalSteps(cd, G)[0] }); if (cd.phase === 'card') cd = D(cd, { type: 'RESOLVE_CARD' });
  if (cd.phase === 'skipped') cd = D(cd, { type: 'ACK_SKIP' });
  cd = D(cd, { type: 'ROLL_MOVE', force: 1 }); if (cd.phase === 'moving') { const L = E.legalSteps(cd, G).filter(n => n !== cd.players.V.node); cd = D(cd, { type: 'STEP', to: L[0] }); } if (cd.phase === 'card') cd = D(cd, { type: 'RESOLVE_CARD' });
}
ok(cd.wand.movesLeft === 1 && !cd.winner, 'countdown at 1 after 14 Harry moves: ' + cd.wand.movesLeft);
// 16 Voldemort wins on expiry
cd = dev(cd, { op: 'setTurn', who: 'H' });
cd = D(cd, { type: 'ROLL_MOVE', force: 1 }); { const L = E.legalSteps(cd, G).filter(n => n !== cd.players.V.node); cd = D(cd, { type: 'STEP', to: L[0] }); }
if (cd.phase === 'card') cd = D(cd, { type: 'RESOLVE_CARD' });
ok(cd.winner === 'V' && /exhaustion/.test(cd.reason), 'V wins on countdown expiry');
ok(Dx(cd, { type: 'ROLL_MOVE' }).error, 'no actions after game over');
// Harry catches V
let hw = dev(s, { op: 'teleport', who: 'V', node: 37 }); hw = dev(hw, { op: 'setTurn', who: 'H' });
hw = D(hw, { type: 'ROLL_MOVE', force: 3 });
ok(E.legalSteps(hw, G).includes(37), 'armed Harry may enter V space');
hw = D(hw, { type: 'STEP', to: 37 });
ok(hw.winner === 'H', 'Harry wins by catching V');
// unarmed Harry cannot walk into V
let un = E.createGame(G, { seed: 9 }); un = dev(un, { op: 'teleport', who: 'V', node: 54 }); un = dev(un, { op: 'setTurn', who: 'H' });
un = D(un, { type: 'ROLL_MOVE', force: 2 }); ok(!E.legalSteps(un, G).includes(54), 'unarmed Harry cannot enter V');
// 14 Voldemort catches Harry
let vw = E.createGame(G, { seed: 10 }); vw = dev(vw, { op: 'teleport', who: 'V', node: 54 }); vw = dev(vw, { op: 'setTurn', who: 'V' });
vw = D(vw, { type: 'ROLL_MOVE', force: 1 }); vw = D(vw, { type: 'STEP', to: 66 });
ok(vw.winner === 'V' && /caught Harry/.test(vw.reason), 'V catches Harry');
// trap win conditions
let tr = E.createGame(G, { seed: 11 });
tr = dev(tr, { op: 'galleons', who: 'H', value: 0 });
adj[66].forEach(n => { tr = dev(tr, { op: 'obstacle', node: n, symbol: 'skull' }); });
tr = dev(tr, { op: 'setTurn', who: 'H' });
ok(tr.winner === 'V' && /walled/.test(tr.reason), 'Harry trapped -> V wins');
let tr2 = E.createGame(G, { seed: 12 });
adj[6].forEach(n => { tr2 = dev(tr2, { op: 'obstacle', node: n, symbol: 'skull' }); });
tr2 = dev(tr2, { op: 'setTurn', who: 'V' });
ok(tr2.winner === 'H', 'V trapped -> H wins');
let tr3 = E.createGame(G, { seed: 13 });
adj[66].forEach(n => { tr3 = dev(tr3, { op: 'obstacle', node: n, symbol: 'skull' }); });
tr3 = dev(tr3, { op: 'setTurn', who: 'H' });
ok(!tr3.winner, 'Harry with galleons is not yet trapped');

// 17 restart
let r2 = E.createGame(G, { seed: 99 }); ok(r2.turn === 'V' && !r2.winner && r2.players.H.galleons === 10, 'fresh game after finish');

// ---- random full-game simulations ----
function randomPlayer(st, rng) {
  const t = st.phase, av = E.availableActions(st, G);
  if (t === 'skipped') return { type: 'ACK_SKIP' };
  if (t === 'card') return { type: 'RESOLVE_CARD' };
  if (t === 'moving') { const L = E.legalSteps(st, G);
    // mildly greedy: V chases H before wand, H seeks wand / V
    const who = st.turn; let target = who === 'V' ? st.players.H.node : (st.wand.holder ? st.players.V.node : st.wand.node);
    if (who === 'V' && st.wand.holder) { const dd = E.bfsDist(G, st.players.H.node); return { type: 'STEP', to: L.sort((a, b) => dd[b] - dd[a])[0] }; }
    const d = E.bfsDist(G, target); if (rng() < 0.75) return { type: 'STEP', to: L.sort((a, b) => d[a] - d[b])[0] };
    return { type: 'STEP', to: L[Math.floor(rng() * L.length)] }; }
  if (t === 'placeObstacle') { const v = E.validObstacleTargets(st, G); return { type: 'PLACE_OBSTACLE', node: v[Math.floor(rng() * v.length)] }; }
  if (t === 'removeObstacle') return { type: 'REMOVE_OBSTACLE', node: st.pending.candidates[0] };
  if (t === 'leviosaPick') return { type: 'LEVIOSA_PICK', node: +Object.keys(st.obstacles)[0] };
  if (t === 'leviosaDrop') { const v = E.validObstacleTargets(st, G); return { type: 'LEVIOSA_DROP', node: v[Math.floor(rng() * v.length)] }; }
  if (t === 'choose') {
    if (av.useHeld.length && rng() < 0.3) return { type: 'USE_HELD', card: av.useHeld[0] };
    if (av.rollSpecial && rng() < 0.25) return { type: 'ROLL_SPECIAL' };
    return { type: 'ROLL_MOVE' };
  }
  throw new Error('stuck in phase ' + t);
}
const res = { H: 0, V: 0, cap: 0 }, reasons = {};
let maxTurns = 0, errors = 0;
for (let gi = 0; gi < 3000; gi++) {
  let seed = 1000 + gi, rs = seed; const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  let st = E.createGame(G, { seed });
  let n = 0;
  while (!st.winner && n < 6000) {
    const a = randomPlayer(st, rng);
    const r = E.dispatch(st, G, a);
    if (r.error) { errors++; if (errors < 5) console.log('sim error', r.error, a, st.phase); break; }
    st = r.state; n++;
    // invariants
    if (st.players.H.galleons < 0 || st.players.V.galleons < 0) { errors++; console.log('neg galleons'); break; }
    if (Object.keys(st.obstacles).length > 15) { errors++; console.log('too many obstacles'); break; }
    if (st.obstacles[st.players.H.node] || st.obstacles[st.players.V.node]) { errors++; console.log('piece on obstacle'); break; }
    if (Object.values(st.money).some(v => v < 0)) { errors++; console.log('neg money'); break; }
    const cardsTotal = st.deck.length + st.discard.length + st.players.H.held.length + st.players.V.held.length + (st.phase === 'card' || st.phase === 'leviosaPick' || st.phase === 'leviosaDrop' ? 1 : 0);
    if (cardsTotal !== 17) { errors++; console.log('card count', cardsTotal, st.phase); break; }
    if (st.wand.holder && (st.wand.movesLeft < 0 || st.wand.movesLeft > 15)) { errors++; console.log('countdown'); break; }
  }
  if (st.winner) { res[st.winner]++; reasons[st.reason] = (reasons[st.reason] || 0) + 1; maxTurns = Math.max(maxTurns, st.turnNo); } else res.cap++;
}
ok(errors === 0, 'simulation without errors/invariant breaks');
ok(res.cap === 0, 'every simulated game reached a winner');
console.log('sim results', res, 'max rounds', maxTurns); console.log(reasons);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
