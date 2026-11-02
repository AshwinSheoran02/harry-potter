/* ===== Battle for the Wizarding World: rules engine (pure, UI-independent) ===== */
(function (root) {
  'use strict';

  var CFG = {
    harryStartGalleons: 10,
    voldyStartGalleons: 5,
    moneyBlockGalleons: 3,
    freezeMoves: 5,
    wandMoves: 15,
    specialCost: 1,
    maxObstacles: 15,
    harryDie: 6,
    voldyDie: 3
  };

  var SYMBOLS = ['bolt', 'flame', 'serpent', 'skull', 'star', 'moon'];
  var SYMBOL_NAMES = { bolt: 'Bolt', flame: 'Flame', serpent: 'Serpent', skull: 'Skull', star: 'Star', moon: 'Moon' };

  var CARDS = [
    { id: 'petrificus', name: 'Petrificus Totalus', text: 'Your opponent is frozen solid and loses their next turn: no movement and no special die.', targeted: true },
    { id: 'cloak', name: 'Invisibility Cloak', text: 'You cannot be caught during your opponent’s next turn.' },
    { id: 'relashio', name: 'Relashio', text: 'Your opponent must release 1 Galleon to the bank.', targeted: true },
    { id: 'accio', name: 'Accio', text: 'Summon 1 Galleon from the nearest money block that still holds coins.' },
    { id: 'homenum', name: 'Homenum Revelio', text: 'See the next card waiting in the spell box.' },
    { id: 'incarcerous', name: 'Incarcerous', text: 'Ropes bind your opponent. Subtract 1 from their next movement roll.', targeted: true },
    { id: 'stupefy', name: 'Stupefy', text: 'Your opponent is stunned and loses their next turn: no movement and no special die.', targeted: true },
    { id: 'evanesco', name: 'Evanesco', text: 'You vanish. You cannot be caught during your opponent’s next turn.' },
    { id: 'patronum', name: 'Expecto Patronum', text: 'No effect on the opponent. (LOL)' },
    { id: 'imperio', name: 'Imperio', text: 'You decide your opponent’s next move: they must roll the movement die and you choose their path.', targeted: true },
    { id: 'incendio', name: 'Incendio', text: 'Keep this card. On any of your turns, burn away one obstacle free of cost.', hold: true },
    { id: 'expelliarmus', name: 'Expelliarmus', text: 'Harry loses the wand and it returns to its original position.', targeted: true },
    { id: 'reducio', name: 'Reducio', text: 'Keep this card. On any of your turns, shrink away one obstacle free of cost.', hold: true },
    { id: 'portus', name: 'Portus', text: 'You and your opponent switch places.' },
    { id: 'leviosa', name: 'Wingardium Leviosa', text: 'Lift one obstacle and set it down on a different space.' },
    { id: 'riddikulus', name: 'Riddikulus', text: 'Does nothing to the opponent. (LOL again)' },
    { id: 'protego', name: 'Protego', text: 'Keep this card. The next spell your opponent draws against you rebounds onto them.', hold: true }
  ];
  var CARD_BY_ID = {};
  CARDS.forEach(function (c) { CARD_BY_ID[c.id] = c; });

  var NAMES = { H: 'Harry', V: 'Voldemort' };
  function opp(p) { return p === 'H' ? 'V' : 'H'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- graph helpers ---------- */
  function buildAdj(graph) {
    var adj = {};
    graph.nodes.forEach(function (n) { adj[n.id] = []; });
    graph.edges.forEach(function (e) {
      var a = e[0], b = e[1];
      if (!adj[a] || !adj[b] || a === b) return;
      if (adj[a].indexOf(b) < 0) adj[a].push(b);
      if (adj[b].indexOf(a) < 0) adj[b].push(a);
    });
    return adj;
  }
  function nodeById(graph, id) {
    for (var i = 0; i < graph.nodes.length; i++) if (graph.nodes[i].id === id) return graph.nodes[i];
    return null;
  }
  function startNode(graph, who) {
    for (var i = 0; i < graph.nodes.length; i++) if (graph.nodes[i].start === who) return graph.nodes[i].id;
    return graph.nodes[0].id;
  }
  function wandHome(graph) {
    for (var i = 0; i < graph.nodes.length; i++) if (graph.nodes[i].type === 'wand') return graph.nodes[i].id;
    return null;
  }
  function bfsDist(graph, from) {
    var adj = buildAdj(graph), dist = {}, q = [from];
    dist[from] = 0;
    while (q.length) {
      var c = q.shift();
      adj[c].forEach(function (n) { if (dist[n] === undefined) { dist[n] = dist[c] + 1; q.push(n); } });
    }
    return dist;
  }

  /* ---------- RNG ---------- */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- state ---------- */
  function newPlayer(node, galleons) {
    return { node: node, galleons: galleons, freeze: 0, frozeThisTurn: false, held: [], petrified: false, shield: false, penalty: 0, imperioBy: null };
  }

  function createGame(graph, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    var rng = makeRng(seed);
    var money = {};
    graph.nodes.forEach(function (n) { if (n.type === 'money') money[n.id] = CFG.moneyBlockGalleons; });
    var deck = shuffle(CARDS.map(function (c) { return c.id; }), rng);
    var st = {
      v: 1,
      seed: seed,
      rngCalls: 0,
      turn: 'V',
      turnNo: 1,
      players: {
        H: newPlayer(startNode(graph, 'H'), CFG.harryStartGalleons),
        V: newPlayer(startNode(graph, 'V'), CFG.voldyStartGalleons)
      },
      money: money,
      wand: { home: wandHome(graph), node: wandHome(graph), holder: null, movesLeft: null, pickedTurn: null },
      obstacles: {},
      deck: deck,
      discard: [],
      peek: null,
      phase: 'choose',
      roll: null,
      stepsLeft: 0,
      visited: [],
      pending: null,
      winner: null,
      reason: null,
      log: [],
      lastEvent: null
    };
    addLog(st, 'The battle begins. Voldemort moves first.');
    beginTurn(st, graph, []);
    return st;
  }

  function addLog(st, msg) {
    st.log.push({ t: st.turnNo, who: st.turn, msg: msg });
    if (st.log.length > 200) st.log.splice(0, st.log.length - 200);
  }

  function rand(st, n, rngFn) {
    // deterministic from seed + call counter unless an external rng is supplied
    var r;
    if (rngFn) r = rngFn();
    else { var g = makeRng((st.seed + st.rngCalls * 2654435761) >>> 0); g(); r = g(); }
    st.rngCalls++;
    return Math.floor(r * n);
  }

  /* ---------- movement rules ---------- */
  function canEnter(st, mover, nodeId) {
    if (st.obstacles[nodeId]) return false;
    var o = opp(mover), op = st.players[o];
    if (op.node === nodeId) {
      if (mover === 'V' && !st.wand.holder && !op.shield) return true; // Voldemort catches Harry
      if (mover === 'H' && st.wand.holder === 'H' && !op.shield) return true; // Harry strikes with the wand
      return false;
    }
    return true;
  }

  function legalSteps(st, graph) {
    if (st.phase !== 'moving') return [];
    var p = st.players[st.turn], adj = buildAdj(graph);
    return (adj[p.node] || []).filter(function (n) {
      return st.visited.indexOf(n) < 0 && canEnter(st, st.turn, n);
    });
  }

  function hasFreeRemover(p) { return p.held.indexOf('incendio') >= 0 || p.held.indexOf('reducio') >= 0; }

  function isTrapped(st, graph, who) {
    var p = st.players[who], adj = buildAdj(graph);
    var nb = adj[p.node] || [];
    if (!nb.length) return false;
    var blocked = nb.every(function (n) { return !canEnter(st, who, n); });
    if (!blocked) return false;
    var anyObstacle = nb.some(function (n) { return st.obstacles[n]; });
    if (!anyObstacle) return false; // only blocked by a piece, not a trap
    if (hasFreeRemover(p)) return false;
    if (who === 'H' && p.galleons >= CFG.specialCost) return false;
    return true;
  }

  function validObstacleTargets(st, graph) {
    return graph.nodes.filter(function (n) {
      if (n.type !== 'normal') return false;
      if (st.obstacles[n.id]) return false;
      if (st.players.H.node === n.id || st.players.V.node === n.id) return false;
      if (st.wand.node === n.id) return false;
      return true;
    }).map(function (n) { return n.id; });
  }

  function availableActions(st, graph) {
    var a = { rollMove: false, rollSpecial: false, useHeld: [], specialReason: null };
    if (st.winner || st.phase !== 'choose') return a;
    var p = st.players[st.turn];
    a.rollMove = true;
    if (p.imperioBy) { a.specialReason = 'Under Imperio: movement only'; }
    else if (p.galleons < CFG.specialCost) { a.specialReason = 'Needs 1 Galleon'; }
    else if (st.turn === 'V') {
      if (Object.keys(st.obstacles).length >= CFG.maxObstacles) a.specialReason = 'All 15 obstacles are on the board';
      else if (!validObstacleTargets(st, graph).length) a.specialReason = 'No free space for an obstacle';
      else a.rollSpecial = true;
    } else {
      if (!Object.keys(st.obstacles).length) a.specialReason = 'No obstacles to break';
      else a.rollSpecial = true;
    }
    if (!p.imperioBy && Object.keys(st.obstacles).length) {
      p.held.forEach(function (c) { if (c === 'incendio' || c === 'reducio') a.useHeld.push(c); });
    }
    return a;
  }

  /* ---------- turn flow ---------- */
  function beginTurn(st, graph, ev) {
    var p = st.players[st.turn];
    st.phase = 'choose';
    st.roll = null; st.stepsLeft = 0; st.visited = []; st.pending = null;
    p.frozeThisTurn = false;
    if (p.petrified) {
      st.phase = 'skipped';
      ev.push({ type: 'skipped', who: st.turn });
      return;
    }
    if (isTrapped(st, graph, st.turn)) {
      if (st.turn === 'H') endGame(st, 'V', 'Harry is walled in by obstacles and cannot break free.', ev);
      else endGame(st, 'H', 'Voldemort has sealed himself in behind his own obstacles.', ev);
    }
  }

  function endGame(st, winner, reason, ev) {
    st.winner = winner; st.reason = reason; st.phase = 'over';
    addLog(st, reason);
    ev.push({ type: 'win', who: winner, reason: reason });
  }

  function endTurn(st, graph, ev) {
    if (st.winner) return;
    var who = st.turn, p = st.players[who], o = st.players[opp(who)];
    if (p.freeze > 0 && !p.frozeThisTurn) p.freeze--;
    p.frozeThisTurn = false;
    // a shield granted by a card protects its owner only during the opponent's following turn
    if (o.shield) o.shield = false;
    if (who === 'H' && st.wand.holder === 'H' && st.wand.pickedTurn !== st.turnNo) {
      st.wand.movesLeft--;
      ev.push({ type: 'countdown', left: st.wand.movesLeft });
      if (st.wand.movesLeft <= 0) {
        endGame(st, 'V', 'Harry ran out of moves: exhaustion from carrying the wand gave Voldemort the win.', ev);
        return;
      }
    }
    st.turn = opp(who);
    if (st.turn === 'V') st.turnNo++;
    ev.push({ type: 'turn', who: st.turn });
    beginTurn(st, graph, ev);
  }

  function collectAt(st, graph, ev) {
    var who = st.turn, p = st.players[who], node = nodeById(graph, p.node);
    if (!node) return false;
    if (node.type === 'money') {
      if (p.freeze > 0) { ev.push({ type: 'frozen', who: who, node: node.id, kind: 'money' }); addLog(st, NAMES[who] + ' is still frozen (' + p.freeze + ') and cannot use the money block.'); return false; }
      if ((st.money[node.id] || 0) <= 0) { ev.push({ type: 'emptyMoney', node: node.id }); addLog(st, 'The money block is empty.'); return false; }
      st.money[node.id]--; p.galleons++;
      p.freeze = CFG.freezeMoves; p.frozeThisTurn = true;
      addLog(st, NAMES[who] + ' collects 1 Galleon.');
      ev.push({ type: 'collect', who: who, node: node.id, amount: 1 });
      return false;
    }
    if (node.type === 'card') {
      if (p.freeze > 0) { ev.push({ type: 'frozen', who: who, node: node.id, kind: 'card' }); addLog(st, NAMES[who] + ' is still frozen (' + p.freeze + ') and cannot draw.'); return false; }
      var cid = drawCard(st);
      if (!cid) { addLog(st, 'The spell box is empty.'); return false; }
      p.freeze = CFG.freezeMoves; p.frozeThisTurn = true;
      st.peek = null;
      st.phase = 'card';
      st.pending = { card: cid };
      addLog(st, NAMES[who] + ' draws ' + CARD_BY_ID[cid].name + '.');
      ev.push({ type: 'draw', who: who, card: cid });
      return true;
    }
    return false;
  }

  function drawCard(st) {
    if (!st.deck.length) {
      if (!st.discard.length) return null;
      st.deck = shuffle(st.discard.slice(), makeRng((st.seed + st.turnNo * 7919 + st.rngCalls) >>> 0));
      st.discard = [];
    }
    return st.deck.shift();
  }

  function finishMovement(st, graph, ev) {
    var interrupted = st.visited.length > 1 ? collectAt(st, graph, ev) : false;
    if (!interrupted && !st.winner) endTurn(st, graph, ev);
  }

  function pickupWand(st, ev) {
    var h = st.players.H;
    if (!st.wand.holder && st.wand.node != null && h.node === st.wand.node) {
      st.wand.holder = 'H'; st.wand.node = null; st.wand.movesLeft = CFG.wandMoves; st.wand.pickedTurn = st.turn === 'H' ? st.turnNo : -1;
      addLog(st, 'Harry seizes the wand! He has ' + CFG.wandMoves + ' moves to catch Voldemort.');
      ev.push({ type: 'wand', who: 'H' });
      return true;
    }
    return false;
  }

  /* ---------- card effects ---------- */
  function applyCard(st, graph, cid, ev) {
    var who = st.turn, p = st.players[who], o = opp(who), op = st.players[o];
    var card = CARD_BY_ID[cid];
    var target = who; // who the card's effect acts for
    // Protego: opponent holding Protego reflects targeted spells
    if (card.targeted && op.held.indexOf('protego') >= 0) {
      op.held.splice(op.held.indexOf('protego'), 1); st.discard.push('protego');
      addLog(st, NAMES[o] + '’s Protego rebounds ' + card.name + '!');
      ev.push({ type: 'protego', who: o, card: cid });
      if (cid === 'expelliarmus') { st.discard.push(cid); return; }
      // reflected: the caster suffers it
      who = o; o = st.turn; p = st.players[who]; op = st.players[o];
    }
    var done = true;
    switch (cid) {
      case 'petrificus':
      case 'stupefy':
        op.petrified = true; addLog(st, NAMES[o] + ' will lose their next turn.'); break;
      case 'cloak':
      case 'evanesco':
        p.shield = true; addLog(st, NAMES[who] + ' cannot be caught during the next turn.'); break;
      case 'relashio':
        if (op.galleons > 0) { op.galleons--; addLog(st, NAMES[o] + ' drops 1 Galleon.'); ev.push({ type: 'lose', who: o, amount: 1 }); }
        else addLog(st, NAMES[o] + ' has no Galleons to drop.');
        break;
      case 'accio':
        var d = bfsDist(graph, p.node), best = null;
        Object.keys(st.money).forEach(function (k) {
          var id = +k; if (st.money[k] > 0 && d[id] != null && (best === null || d[id] < d[best])) best = id;
        });
        if (best !== null) { st.money[best]--; p.galleons++; addLog(st, NAMES[who] + ' summons a Galleon.'); ev.push({ type: 'collect', who: who, node: best, amount: 1, accio: true }); }
        else addLog(st, 'Every money block is empty. Accio fizzles.');
        break;
      case 'homenum':
        if (!st.deck.length && st.discard.length) { st.deck = shuffle(st.discard.slice(), makeRng(st.seed + st.turnNo)); st.discard = []; }
        st.peek = st.deck.length ? { for: who, card: st.deck[0] } : null;
        addLog(st, NAMES[who] + ' sees the next card.');
        break;
      case 'incarcerous':
        op.penalty++; addLog(st, NAMES[o] + '’s next movement roll is reduced by 1.'); break;
      case 'imperio':
        op.imperioBy = who; addLog(st, NAMES[who] + ' will choose ' + NAMES[o] + '’s next path.'); break;
      case 'incendio':
      case 'reducio':
      case 'protego':
        st.players[st.turn].held.push(cid); addLog(st, NAMES[st.turn] + ' keeps ' + card.name + '.'); done = false; break;
      case 'expelliarmus':
        if (who === 'V' && st.wand.holder === 'H') {
          st.wand.holder = null; st.wand.node = st.wand.home; st.wand.movesLeft = null; st.wand.pickedTurn = null;
          addLog(st, 'Expelliarmus! The wand flies back to its resting place.'); ev.push({ type: 'disarm' });
        } else addLog(st, 'Expelliarmus has nothing to disarm.');
        break;
      case 'portus':
        var a = st.players.H.node; st.players.H.node = st.players.V.node; st.players.V.node = a;
        addLog(st, 'Portus! Harry and Voldemort switch places.'); ev.push({ type: 'swap' });
        pickupWand(st, ev);
        break;
      case 'leviosa':
        if (Object.keys(st.obstacles).length && validObstacleTargets(st, graph).length) {
          st.phase = 'leviosaPick'; st.pending = { card: cid };
          addLog(st, NAMES[who] + ' may lift an obstacle.');
          return 'continue';
        }
        addLog(st, 'There is no obstacle to lift.');
        break;
      case 'patronum':
        addLog(st, 'Expecto Patronum: a silver glow, and no effect on the opponent.'); break;
      case 'riddikulus':
        addLog(st, 'Riddikulus: nothing happens.'); break;
    }
    if (done) st.discard.push(cid);
  }

  /* ---------- dispatcher ---------- */
  function dispatch(st0, graph, action, rngFn) {
    var st = clone(st0), ev = [];
    var err = function (m) { return { state: st0, events: [], error: m }; };
    if (st.winner && action.type !== 'DEV') return err('The game is over.');
    var who = st.turn, p = st.players[who];

    switch (action.type) {
      case 'ROLL_MOVE': {
        if (st.phase !== 'choose') return err('You cannot roll now.');
        var sides = who === 'H' ? CFG.harryDie : CFG.voldyDie;
        var face = action.force != null ? action.force : rand(st, sides, rngFn) + 1;
        if (face < 1 || face > sides) return err('Bad roll.');
        var steps = Math.max(0, face - p.penalty);
        var pen = p.penalty; p.penalty = 0;
        st.roll = { kind: 'move', face: face, steps: steps, penalty: pen, imperioBy: p.imperioBy || null };
        p.imperioBy = null;
        addLog(st, NAMES[who] + ' rolls ' + face + (pen ? ' (bound by ropes: ' + steps + ')' : '') + '.');
        ev.push({ type: 'roll', who: who, kind: 'move', face: face, steps: steps });
        st.phase = 'moving'; st.stepsLeft = steps; st.visited = [p.node];
        if (steps === 0 || !legalSteps(st, graph).length) {
          if (steps > 0) { addLog(st, 'No open path. ' + NAMES[who] + ' stays put.'); ev.push({ type: 'blocked', who: who }); }
          st.phase = 'resolving';
          finishMovement(st, graph, ev);
        }
        break;
      }
      case 'STEP': {
        if (st.phase !== 'moving') return err('Not moving.');
        var to = action.to;
        if (legalSteps(st, graph).indexOf(to) < 0) return err('That space is not reachable.');
        var from = p.node;
        p.node = to; st.visited.push(to); st.stepsLeft--;
        ev.push({ type: 'step', who: who, from: from, to: to, left: st.stepsLeft });
        var o = st.players[opp(who)];
        if (o.node === to) {
          if (who === 'V') { endGame(st, 'V', 'Voldemort caught Harry before he could reach the wand.', ev); break; }
          endGame(st, 'H', 'Harry caught Voldemort with the wand.', ev); break;
        }
        if (who === 'H' && pickupWand(st, ev)) {
          st.stepsLeft = 0; st.phase = 'resolving';
          endTurn(st, graph, ev);
          break;
        }
        if (st.stepsLeft <= 0 || !legalSteps(st, graph).length) {
          if (st.stepsLeft > 0) { addLog(st, 'The path ends. ' + NAMES[who] + ' stops with ' + st.stepsLeft + ' step' + (st.stepsLeft > 1 ? 's' : '') + ' unused.'); ev.push({ type: 'blocked', who: who }); }
          st.phase = 'resolving';
          finishMovement(st, graph, ev);
        }
        break;
      }
      case 'ROLL_SPECIAL': {
        var av = availableActions(st, graph);
        if (!av.rollSpecial) return err(av.specialReason || 'Special die unavailable.');
        p.galleons -= CFG.specialCost;
        var sym = action.force != null ? action.force : SYMBOLS[rand(st, SYMBOLS.length, rngFn)];
        if (SYMBOLS.indexOf(sym) < 0) return err('Bad symbol.');
        st.roll = { kind: 'special', symbol: sym };
        ev.push({ type: 'roll', who: who, kind: 'special', symbol: sym });
        ev.push({ type: 'spend', who: who, amount: CFG.specialCost });
        if (who === 'V') {
          st.phase = 'placeObstacle'; st.pending = { symbol: sym };
          addLog(st, 'Voldemort pays 1 Galleon and rolls ' + SYMBOL_NAMES[sym] + '. Choose a space for the obstacle.');
        } else {
          var matches = Object.keys(st.obstacles).filter(function (k) { return st.obstacles[k] === sym; }).map(Number);
          if (matches.length) {
            st.phase = 'removeObstacle'; st.pending = { symbol: sym, candidates: matches, free: false };
            addLog(st, 'Harry pays 1 Galleon and rolls ' + SYMBOL_NAMES[sym] + '. Choose a matching obstacle to break.');
          } else {
            addLog(st, 'Harry pays 1 Galleon and rolls ' + SYMBOL_NAMES[sym] + '. No obstacle matches.');
            ev.push({ type: 'miss', who: who });
            st.phase = 'resolving';
            endTurn(st, graph, ev);
          }
        }
        break;
      }
      case 'PLACE_OBSTACLE': {
        if (st.phase !== 'placeObstacle') return err('Not placing.');
        if (validObstacleTargets(st, graph).indexOf(action.node) < 0) return err('Obstacles cannot go there.');
        st.obstacles[action.node] = st.pending.symbol;
        addLog(st, 'An obstacle rises on the board.');
        ev.push({ type: 'obstaclePlaced', node: action.node, symbol: st.pending.symbol });
        st.phase = 'resolving';
        endTurn(st, graph, ev);
        break;
      }
      case 'REMOVE_OBSTACLE': {
        if (st.phase !== 'removeObstacle') return err('Not removing.');
        if (st.pending.candidates.indexOf(action.node) < 0) return err('That obstacle cannot be removed.');
        delete st.obstacles[action.node];
        ev.push({ type: 'obstacleRemoved', node: action.node });
        if (st.pending.free) {
          var c = st.pending.card;
          p.held.splice(p.held.indexOf(c), 1); st.discard.push(c);
          addLog(st, NAMES[who] + ' casts ' + CARD_BY_ID[c].name + ' and clears an obstacle.');
          st.phase = 'choose'; st.pending = null;
        } else {
          addLog(st, 'Harry shatters the obstacle.');
          st.phase = 'resolving';
          endTurn(st, graph, ev);
        }
        break;
      }
      case 'USE_HELD': {
        var avh = availableActions(st, graph);
        if (avh.useHeld.indexOf(action.card) < 0) return err('Cannot use that card now.');
        st.phase = 'removeObstacle';
        st.pending = { free: true, card: action.card, candidates: Object.keys(st.obstacles).map(Number) };
        break;
      }
      case 'CANCEL': {
        if (st.phase === 'removeObstacle' && st.pending && st.pending.free) { st.phase = 'choose'; st.pending = null; break; }
        return err('Nothing to cancel.');
      }
      case 'RESOLVE_CARD': {
        if (st.phase !== 'card') return err('No card to resolve.');
        var cid = st.pending.card;
        var r = applyCard(st, graph, cid, ev);
        if (r === 'continue') break;
        st.pending = null; st.phase = 'resolving';
        if (!st.winner) endTurn(st, graph, ev);
        break;
      }
      case 'LEVIOSA_PICK': {
        if (st.phase !== 'leviosaPick') return err('Not lifting.');
        if (!st.obstacles[action.node]) return err('No obstacle there.');
        st.pending.from = action.node; st.phase = 'leviosaDrop';
        break;
      }
      case 'LEVIOSA_DROP': {
        if (st.phase !== 'leviosaDrop') return err('Not dropping.');
        if (validObstacleTargets(st, graph).indexOf(action.node) < 0) return err('Obstacles cannot go there.');
        var symb = st.obstacles[st.pending.from];
        delete st.obstacles[st.pending.from];
        st.obstacles[action.node] = symb;
        ev.push({ type: 'obstacleMoved', from: st.pending.from, to: action.node, symbol: symb });
        addLog(st, 'The obstacle floats to a new space.');
        st.discard.push('leviosa');
        st.pending = null; st.phase = 'resolving';
        endTurn(st, graph, ev);
        break;
      }
      case 'ACK_SKIP': {
        if (st.phase !== 'skipped') return err('Nothing to skip.');
        addLog(st, NAMES[who] + ' is frozen and loses the turn.');
        p.petrified = false;
        endTurn(st, graph, ev);
        break;
      }
      case 'DEV': {
        devApply(st, graph, action, ev);
        break;
      }
      default:
        return err('Unknown action ' + action.type);
    }
    st.lastEvent = ev.length ? ev[ev.length - 1].type : null;
    return { state: st, events: ev };
  }

  function devApply(st, graph, a, ev) {
    switch (a.op) {
      case 'teleport': st.players[a.who].node = a.node; if (a.who === 'H') pickupWand(st, ev); break;
      case 'galleons': st.players[a.who].galleons = Math.max(0, a.value | 0); break;
      case 'obstacle': if (a.symbol) st.obstacles[a.node] = a.symbol; else delete st.obstacles[a.node]; break;
      case 'clearObstacles': st.obstacles = {}; break;
      case 'wandGive': st.wand.holder = 'H'; st.wand.node = null; st.wand.movesLeft = a.moves || CFG.wandMoves; st.wand.pickedTurn = null; break;
      case 'wandReset': st.wand.holder = null; st.wand.node = st.wand.home; st.wand.movesLeft = null; st.wand.pickedTurn = null; break;
      case 'wandMoves': if (st.wand.holder) st.wand.movesLeft = Math.max(1, a.value | 0); break;
      case 'setTurn': st.turn = a.who; beginTurn(st, graph, ev); break;
      case 'stackCard': var i = st.deck.indexOf(a.card); if (i >= 0) st.deck.splice(i, 1); else { var j = st.discard.indexOf(a.card); if (j >= 0) st.discard.splice(j, 1); } st.deck.unshift(a.card); break;
      case 'freeze': st.players[a.who].freeze = Math.max(0, a.value | 0); break;
      case 'refillMoney': Object.keys(st.money).forEach(function (k) { st.money[k] = CFG.moneyBlockGalleons; }); break;
    }
    addLog(st, '[dev] ' + a.op);
  }


  /* ---------- computer opponent (plays Voldemort) ---------- */
  function distAvoid(st, graph, from, extraBlock) {
    var adj = buildAdj(graph), dist = {}, q = [from];
    dist[from] = 0;
    while (q.length) {
      var c = q.shift();
      (adj[c] || []).forEach(function (n) {
        if (dist[n] !== undefined) return;
        if (st.obstacles[n] || n === extraBlock) return;
        dist[n] = dist[c] + 1; q.push(n);
      });
    }
    return dist;
  }
  function dget(d, n) { return d[n] === undefined ? 40 : d[n]; }
  function harryGoal(st) { return st.wand.holder === 'H' ? st.players.V.node : st.wand.node; }

  // value of a position from Voldemort's point of view
  function valueForV(st, graph, mover, landed) {
    if (st.winner === 'V') return 1e6;
    if (st.winner === 'H') return -1e6;
    var h = st.players.H.node, v = st.players.V.node;
    var dH = distAvoid(st, graph, h);
    var d = dget(dH, v), score;
    if (st.wand.holder !== 'H') {
      var dw = dget(dH, st.wand.node);
      score = -d * 10 + dw * 4;
      if (dw <= 6) score -= dget(distAvoid(st, graph, v), st.wand.node) * 3;
    } else {
      score = Math.min(d, 14) * 10 - (d <= 6 ? 45 : 0) - (d <= 3 ? 60 : 0);
    }
    if (mover === 'V' && landed != null) {
      var n = nodeById(graph, landed), p = st.players.V;
      if (n && n.type === 'money' && p.frozeThisTurn) score += 7;
      if (n && n.type === 'card' && p.frozeThisTurn) score += 6;
    }
    return score;
  }

  function bestPath(st, graph) {
    var mover = st.turn, best = null, bestScore = -Infinity, seen = {};
    function dfs(s, path) {
      var L = legalSteps(s, graph);
      if (s.phase !== 'moving' || !L.length) {
        if (!path.length) return;
        var sc = valueForV(s, graph, mover, path[path.length - 1]);
        if (mover === 'H') sc = valueForV(s, graph, 'H', null);
        if (sc > bestScore) { bestScore = sc; best = path.slice(); }
        return;
      }
      for (var i = 0; i < L.length; i++) {
        var key = L[i] + '|' + path.join(',');
        if (seen[key]) continue; seen[key] = 1;
        var r = dispatch(s, graph, { type: 'STEP', to: L[i] });
        if (r.error) continue;
        dfs(r.state, path.concat(L[i]));
      }
    }
    dfs(st, []);
    return best;
  }

  function bestObstacleSpot(st, graph, exclude) {
    var targets = validObstacleTargets(st, graph).filter(function (n) { return n !== exclude; });
    if (!targets.length) return null;
    var h = st.players.H.node, goal = harryGoal(st), adj = buildAdj(graph);
    var base = dget(distAvoid(st, graph, h), goal);
    var dV = distAvoid(st, graph, st.players.V.node), best = null, bestScore = -Infinity;
    targets.forEach(function (n) {
      // never wall Voldemort himself in
      var vn = adj[st.players.V.node] || [];
      var openAfter = vn.filter(function (x) { return x !== n && !st.obstacles[x]; }).length;
      if (!openAfter) return;
      var dh = distAvoid(st, graph, h);
      if (dget(dh, n) > 8) return;
      var after = dget(distAvoid(st, graph, h, n), goal);
      var sc = (after - base) * 20 - dget(dh, n);
      if (st.wand.holder === 'H') sc += Math.min(dget(dV, n), 6);
      if (sc > bestScore) { bestScore = sc; best = n; }
    });
    if (best === null) best = targets[0];
    return best;
  }

  function aiAction(st, graph, rngFn) {
    var r = rngFn || Math.random, p = st.players.V;
    switch (st.phase) {
      case 'skipped': return { type: 'ACK_SKIP' };
      case 'card': return { type: 'RESOLVE_CARD' };
      case 'moving': { var path = bestPath(st, graph); return { type: 'STEP', to: path ? path[0] : legalSteps(st, graph)[0] }; }
      case 'placeObstacle': return { type: 'PLACE_OBSTACLE', node: bestObstacleSpot(st, graph) };
      case 'leviosaPick': {
        var h = st.players.H.node, dh = distAvoid(st, graph, h), far = null;
        Object.keys(st.obstacles).forEach(function (k) { k = +k; if (far === null || dget(dh, k) > dget(dh, far)) far = k; });
        return { type: 'LEVIOSA_PICK', node: far };
      }
      case 'leviosaDrop': return { type: 'LEVIOSA_DROP', node: bestObstacleSpot(st, graph, st.pending.from) };
      case 'removeObstacle': {
        var adjR = buildAdj(graph)[p.node] || [];
        var c = st.pending.candidates.filter(function (n) { return adjR.indexOf(n) >= 0; });
        return { type: 'REMOVE_OBSTACLE', node: (c.length ? c : st.pending.candidates)[0] };
      }
      case 'choose': {
        var av = availableActions(st, graph);
        var adjC = buildAdj(graph)[p.node] || [];
        var stuck = adjC.every(function (n) { return st.obstacles[n]; });
        if (stuck && av.useHeld.length) return { type: 'USE_HELD', card: av.useHeld[0] };
        var dH = distAvoid(st, graph, st.players.H.node), d = dget(dH, p.node);
        if (av.rollSpecial) {
          if (st.wand.holder !== 'H') {
            var dw = dget(dH, st.wand.node);
            if (d > 3 && dw <= 10 && r() < 0.6) return { type: 'ROLL_SPECIAL' };
          } else if (d <= 9 && r() < 0.5) return { type: 'ROLL_SPECIAL' };
        }
        return { type: 'ROLL_MOVE' };
      }
    }
    return null;
  }
  // which side decides the current step (Imperio hands path choice to the caster)
  function controller(st) {
    if (st.phase === 'moving' && st.roll && st.roll.imperioBy) return st.roll.imperioBy;
    return st.turn;
  }

  var api = {
    CFG: CFG, SYMBOLS: SYMBOLS, SYMBOL_NAMES: SYMBOL_NAMES, CARDS: CARDS, CARD_BY_ID: CARD_BY_ID, NAMES: NAMES,
    createGame: createGame, dispatch: dispatch, legalSteps: legalSteps, availableActions: availableActions,
    validObstacleTargets: validObstacleTargets, isTrapped: isTrapped, buildAdj: buildAdj, opp: opp, bfsDist: bfsDist, aiAction: aiAction, controller: controller
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HPEngine = api;
})(this);
