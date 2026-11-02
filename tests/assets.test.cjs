// Loads the deployed (or local) site, records every network response and checks for 404s / JS errors.
const { chromium } = require('playwright');
(async () => {
  const url = process.env.GAME_URL || 'http://localhost:8080/harry-potter/';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const bad = [], errs = [], seen = [];
  p.on('response', r => { seen.push(r.status() + ' ' + r.url()); if (r.status() >= 400 && !r.url().includes('some/deep/link')) bad.push(r.status() + ' ' + r.url()); });
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) bad.push('FAILED ' + r.url()); });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const img = await p.evaluate(() => { const i = document.getElementById('boardImg'); return { ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth }; });
  await p.click('#tNew2'); await p.waitForTimeout(1500);
  await p.click('#slotMove'); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ phase: window.__game.state.phase, log: window.__game.state.log.length }));
  await p.screenshot({ path: process.env.SHOT || 'assets-check.png' });
  // refresh and direct-URL access
  await p.reload(); await p.waitForTimeout(800);
  const afterReload = await p.evaluate(() => !!document.getElementById('tCont'));
  const r404 = await p.goto(url + 'some/deep/link', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const landed = p.url();
  console.log(JSON.stringify({ requests: seen.length, bad, errs, boardImage: img, phaseAfterRoll: st, continueAfterReload: afterReload, deepLinkLandedOn: landed }, null, 1));
  await b.close();
  process.exit(bad.length || errs.length || !img.ok || st.log < 2 || !afterReload ? 1 : 0);
})();
