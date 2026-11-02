const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [1180, 760], [820, 1000], [400, 780]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto((process.env.GAME_URL || 'http://localhost:8080/harry-potter/')); await p.waitForTimeout(700);
    // dev hidden by default
    ok(await p.evaluate(() => document.getElementById('dev').hidden), 'dev panel hidden');
    ok(await p.evaluate(() => document.getElementById('devSvg').innerHTML === ''), 'no dev lines');
    ok(await p.evaluate(() => [...document.querySelectorAll('.node .lbl')].every(l => getComputedStyle(l).display === 'none')), 'no node ids');
    await p.click('#tNew2'); await p.waitForTimeout(1600);
    const idle = async () => { for (let i = 0; i < 150; i++) { if (!(await p.evaluate(() => window.__game.busy))) return; await p.waitForTimeout(80); } };
    // alignment: piece base vs node centre, at zoom 1 and zoomed
    const align = () => p.evaluate(() => { const g = window.__game, out = [];
      for (const who of ['H', 'V']) { const n = document.querySelector(`.node[data-id="${g.state.players[who].node}"]`).getBoundingClientRect(); const s = document.querySelector('#p' + who + ' .shadowSpot').getBoundingClientRect();
        out.push(Math.hypot((n.left + n.width / 2) - (s.left + s.width / 2), (n.top + n.height / 2) - (s.top + s.height / 2)) / n.width); }
      // node hitbox vs image ring: node 90 (wand) centre relative to slab
      return out; });
    let a = await align(); ok(a.every(d => d < 0.12), `${w}: pieces aligned ${a}`);
    // board fits in viewport
    const sr = await p.evaluate(() => { const r = document.getElementById('slab').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    ok(sr[0] >= -2 && sr[2] <= w + 2, `${w}: board within width ${sr}`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}: no horizontal scroll`);
    await p.click('#zIn'); await p.click('#zIn'); await p.waitForTimeout(700);
    a = await align(); ok(a.every(d => d < 0.12), `${w}: aligned when zoomed ${a}`);
    await p.click('#zReset'); await p.waitForTimeout(700);
    // V raises an obstacle through the UI
    await p.click('#slotSpecial'); await idle();
    ok(await p.evaluate(() => window.__game.state.phase === 'placeObstacle'), 'placing obstacle');
    const tgt = await p.evaluate(() => { const el = document.querySelector('.node.target[data-id="54"]') || document.querySelector('.node.target'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: +el.dataset.id }; });
    await p.mouse.click(tgt.x, tgt.y); await idle();
    ok(await p.evaluate(id => window.__game.state.obstacles[id] && window.__game.state.turn === 'H', tgt.id), `obstacle placed by click on ${tgt.id}`);
    ok(await p.evaluate(() => window.__game.state.players.V.galleons === 4), 'galleon spent');
    if (w === 1440) await p.screenshot({ path: 's_obstacle.png' });
    // Harry: force a card draw by teleporting next to card block 85 and stacking Accio
    await p.evaluate(() => { const g = window.__game, E = g.E; let s = g.state; const D = o => { s = E.dispatch(s, g.graph, Object.assign({ type: 'DEV' }, o)).state; };
      D({ op: 'teleport', who: 'H', node: 14 }); D({ op: 'stackCard', card: 'accio' }); window.__setState(s); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.__force = 1);
    await p.click('#slotMove'); await idle();
    // click node 85
    const c85 = await p.evaluate(() => { const r = document.querySelector('.node[data-id="85"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(c85.x, c85.y); await idle();
    await p.waitForSelector('#castBtn', { timeout: 5000 }); await p.waitForTimeout(500);
    if (w === 1440 || w === 400) await p.screenshot({ path: `s_card_${w}.png` });
    await p.click('#castBtn'); await p.waitForTimeout(1300); await idle();
    { const q = await p.evaluate(() => ({ g: window.__game.state.players.H.galleons, t: window.__game.state.turn, ph: window.__game.state.phase, n: window.__game.state.players.H.node, log: window.__game.state.log.slice(-4).map(l => l.msg) })); ok(q.g === 11 && q.t === 'V', 'accio resolved via UI ' + JSON.stringify(q)); }
    // wand + win: teleport H next to wand, V nearby
    await p.evaluate(() => { const g = window.__game, E = g.E; let s = g.state; const D = o => { s = E.dispatch(s, g.graph, Object.assign({ type: 'DEV' }, o)).state; };
      D({ op: 'teleport', who: 'H', node: 37 }); D({ op: 'teleport', who: 'V', node: 43 }); D({ op: 'setTurn', who: 'H' }); window.__setState(s); });
    await p.evaluate(() => window.__force = 2);
    await p.click('#slotMove'); await idle();
    const c90 = await p.evaluate(() => { const r = document.querySelector('.node[data-id="90"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(c90.x, c90.y); await p.waitForTimeout(700);
    if (w === 1440) await p.screenshot({ path: 's_wand.png' });
    await idle();
    ok(await p.evaluate(() => window.__game.state.wand.holder === 'H'), 'wand via UI');
    // V moves 1 (forced), then Harry catches
    await p.evaluate(() => window.__force = 1); await p.click('#slotMove'); await idle();
    let st = await p.evaluate(() => window.__game.state.phase); if (st === 'moving') { const n = await p.evaluate(() => { const el = document.querySelector('.node.step'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await p.mouse.click(n.x, n.y); await idle(); }
    if (await p.evaluate(() => window.__game.state.phase === 'card')) { await p.waitForSelector('#castBtn'); await p.click('#castBtn'); await p.waitForTimeout(300); await idle(); }
    await p.evaluate(() => { const g = window.__game, E = g.E; let s = g.state; const D = o => { s = E.dispatch(s, g.graph, Object.assign({ type: 'DEV' }, o)).state; };
      const adj = E.buildAdj(g.graph); const vn = s.players.V.node; const nb = adj[vn].find(n => !s.obstacles[n]); D({ op: 'teleport', who: 'H', node: nb }); D({ op: 'setTurn', who: 'H' }); window.__setState(s); });
    if (await p.evaluate(() => window.__game.state.phase === 'skipped')) { await p.click('#prompt [data-a=skip]'); await idle(); }
    await p.evaluate(() => window.__force = 1); await p.click('#slotMove'); await idle();
    const vNode = await p.evaluate(() => { const s = window.__game.state; const r = document.querySelector(`.node[data-id="${s.players.V.node}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, step: document.querySelector(`.node[data-id="${s.players.V.node}"]`).classList.contains('step') }; });
    ok(vNode.step, 'V space is a legal target for armed Harry');
    await p.mouse.click(vNode.x, vNode.y); await p.waitForTimeout(1600);
    ok(await p.evaluate(() => window.__game.state.winner === 'H'), 'Harry wins via UI');
    ok(await p.evaluate(() => !!document.getElementById('rematch')), 'end screen shown');
    if (w === 1440 || w === 400) await p.screenshot({ path: `s_end_${w}.png` });
    await p.click('#rematch'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => { const s = window.__game.state; return !s.winner && s.turn === 'V' && s.players.H.galleons === 10; }), 'rematch resets');
    // dev mode opens only on request
    await p.click('#btnMenu'); await p.click('#devToggle'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.getElementById('dev').hidden && document.querySelectorAll('#devSvg line').length > 100), 'dev mode shows overlays');
    if (w === 1440) await p.screenshot({ path: 's_dev.png' });
    await p.click('#dClose');
    ok(await p.evaluate(() => document.getElementById('dev').hidden && document.getElementById('devSvg').innerHTML === ''), 'dev closes cleanly');
    if (w !== 1440) await p.screenshot({ path: `s_game_${w}.png` });
    ok(errs.length === 0, `${w}: no page errors ${errs}`);
    await p.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`);
})();
