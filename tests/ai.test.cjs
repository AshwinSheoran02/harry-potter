const E = require('../src/engine.js'); const G = require('../src/board-graph.json');
let res = { H: 0, V: 0, cap: 0 }, errors = 0, reasons = {}, totalT = 0;
function harryBot(st, rng) {
  const t = st.phase, av = E.availableActions(st, G);
  if (t === 'skipped') return { type: 'ACK_SKIP' };
  if (t === 'card') return { type: 'RESOLVE_CARD' };
  if (t === 'moving') { const L = E.legalSteps(st, G); const target = st.wand.holder ? st.players.V.node : st.wand.node; const d = E.bfsDist(G, target);
    if (rng() < 0.8) return { type: 'STEP', to: L.sort((a, b) => d[a] - d[b])[0] }; return { type: 'STEP', to: L[Math.floor(rng() * L.length)] }; }
  if (t === 'removeObstacle') return { type: 'REMOVE_OBSTACLE', node: st.pending.candidates[0] };
  if (t === 'leviosaPick') return { type: 'LEVIOSA_PICK', node: +Object.keys(st.obstacles)[0] };
  if (t === 'leviosaDrop' || t === 'placeObstacle') { const v = E.validObstacleTargets(st, G); return { type: t === 'leviosaDrop' ? 'LEVIOSA_DROP' : 'PLACE_OBSTACLE', node: v[0] }; }
  if (t === 'choose') { if (av.useHeld.length) return { type: 'USE_HELD', card: av.useHeld[0] }; if (av.rollSpecial && rng() < .2) return { type: 'ROLL_SPECIAL' }; return { type: 'ROLL_MOVE' }; }
}
const N = +(process.argv[2] || 300);
for (let g = 0; g < N; g++) {
  let rs = 7 + g; const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  let st = E.createGame(G, { seed: 500 + g }), n = 0;
  while (!st.winner && n < 4000) {
    const who = E.controller(st);
    const t0 = Date.now();
    const a = who === 'V' ? E.aiAction(st, G, rng) : harryBot(st, rng);
    if (who === 'V') totalT += Date.now() - t0;
    const r = E.dispatch(st, G, a);
    if (r.error) { errors++; console.log('ERR', who, r.error, a, st.phase); break; }
    st = r.state; n++;
  }
  if (st.winner) { res[st.winner]++; reasons[st.reason] = (reasons[st.reason] || 0) + 1; } else res.cap++;
}
console.log(res, 'errors', errors, 'avg AI ms per game', (totalT / N).toFixed(0)); console.log(reasons);
