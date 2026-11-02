const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [1100, 900], [960, 900], [400, 780]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto((process.env.GAME_URL || 'http://localhost:8080/harry-potter/')); await p.waitForTimeout(600);
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.reload(); await p.waitForTimeout(600);
    await p.click('#tNew'); 
    // computer Voldemort should take its turn on its own
    let turned = false;
    for (let i = 0; i < 120; i++) { await p.waitForTimeout(150); const s = await p.evaluate(() => ({ t: window.__game.state.turn, ph: window.__game.state.phase, b: window.__game.busy, c: !document.getElementById('cardActions').hidden })); if (s.t === 'H' && !s.b && !s.c) { turned = true; break; } }
    ok(turned, `${w}: computer Voldemort finished its turn`);
    await p.waitForTimeout(400);
    // info bar must not cover any board space
    const ov = await p.evaluate(() => { const pr = document.getElementById('prompt'); if (pr.hidden) return 'hidden'; const r = pr.getBoundingClientRect(); let worst = -1e9;
      document.querySelectorAll('.node').forEach(n => { const q = n.getBoundingClientRect(); if (q.right > r.left && q.left < r.right) worst = Math.max(worst, q.bottom - r.top); }); return worst; });
    ok(ov !== 'hidden' && ov <= 0, `${w}: info bar clear of spaces (overlap ${ov}px)`);
    await p.screenshot({ path: `s_ai_${w}.png` });
    // human cannot act for Voldemort: play several full rounds as Harry by clicking
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < 200; i++) { const s = await p.evaluate(() => ({ t: window.__game.state.turn, ph: window.__game.state.phase, b: window.__game.busy, c: !document.getElementById('cardActions').hidden && !document.getElementById('castBtn').disabled, win: window.__game.state.winner, ctl: window.__game.E.controller(window.__game.state) }));
        if (s.win) break; if (s.c) { await p.click('#castBtn'); await p.waitForTimeout(900); continue; }
        if (s.ctl === 'H' && !s.b) { if (s.ph === 'skipped') { await p.click('#prompt [data-a=skip]'); continue; } if (s.ph === 'choose' && s.t === 'H') break; if (s.ph === 'moving') { const n = await p.evaluate(() => { const el = document.querySelector('.node.step'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); if (n) await p.mouse.click(n.x, n.y); } else if (s.ph === 'removeObstacle') { await p.click('#prompt [data-a=cancel]').catch(() => {}); } }
        await p.waitForTimeout(150); }
      const st = await p.evaluate(() => window.__game.state); if (st.winner) break;
      const dbg = await p.evaluate(() => { const s = window.__game.state; return { t: s.turn, ph: s.phase, busy: window.__game.busy, roll: s.roll, log: s.log.slice(-5).map(l => l.msg), title: document.getElementById('title').hidden, ov: document.getElementById('overlayHost').innerHTML.length, cards: document.getElementById('cardActions').hidden }; });
      ok(!(await p.evaluate(() => document.getElementById('slotMove').disabled)), 'Harry can roll on his turn ' + JSON.stringify(dbg)); if (fail) break;
      await p.click('#slotMove');
      await p.waitForTimeout(300);
    }
    ok(errs.length === 0, `${w}: no errors ${errs}`);
    await p.close();
  }
  await b.close(); console.log(`${pass} passed, ${fail} failed`);
})();
