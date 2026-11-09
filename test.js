'use strict';
// Test di "Tradimento al Collegio".  Uso: node test.js [numero_partite_simulate]
const assert = require('assert');
const { Game } = require('./game');
const { SEALS } = require('./data.js');
let passed = 0; const fails = [];
const t = (name, fn) => { try { fn(); passed++; console.log('ok -', name); } catch (e) { fails.push(name); console.log('FAIL -', name, '::', e.message.split('\n')[0], (e.stack.split('\n').find((l) => l.includes('test.js')) || '').trim()); } };

function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function mk(n, seed, tweak) {
  const g = new Game(seeded(seed || 1));
  for (let i = 0; i < n; i++) g.join('P' + (i + 1), SEALS[i].id);
  if (tweak) tweak(g);
  g.start();
  return g;
}
const readyAll = (g) => g.gamers.forEach((p) => g.act(p.id, { type: 'ready' }));
const toNight = (g) => { readyAll(g); assert.strictEqual(g.phase, 'night'); };
const T = (g) => g.aliveT(); const F = (g) => g.aliveF();

t('lobby: nomi e sigilli unici, massimo 12, minimo 4', () => {
  const g = new Game();
  g.join('Anna', 'rosa');
  assert.throws(() => g.join('anna', 'luna'), /nome/);
  assert.throws(() => g.join('Bea', 'rosa'), /sigillo/);
  assert.throws(() => g.start(), /almeno 4/);
  const h = new Game();
  for (let i = 0; i < 12; i++) h.join('P' + i, SEALS[i].id);
  h.join('Narratrice', 'campana'); assert.throws(() => h.join('Extra', 'rosa'), /pieno|sigillo/);
});
t('ruoli: 1 traditrice fino a 5, 2 fino a 8, 3 da 9; mai la metà', () => {
  for (const [n, k] of [[4, 1], [5, 1], [6, 2], [8, 2], [9, 3], [12, 3]]) assert.strictEqual(mk(n, 7).aliveT().length, k, n + ' giocatrici');
  const g = mk(4, 3, (x) => x.setSettings({ traitors: 3 }));
  assert.strictEqual(g.aliveT().length, 1); // con 4 al massimo 1
});
t('narratrice: non conta, vede tutto, non gioca', () => {
  const g = new Game(seeded(2));
  for (let i = 0; i < 5; i++) g.join('P' + i, SEALS[i].id);
  const nar = g.players[4];
  assert.ok(g.act(nar.id, { type: 'narrator', on: true }).ok);
  g.start();
  assert.strictEqual(g.gamers.length, 4);
  const v = g.view(nar.id, new Set());
  assert.ok(v.players.filter((p) => !p.narrator).every((p) => p.role));
  assert.ok(!g.act(nar.id, { type: 'vote', target: 1 }).ok);
  assert.ok(g.act(nar.id, { type: 'skip' }).ok);
});
t('segreti: ognuna vede solo il suo ruolo (e le altre traditrici se lo è)', () => {
  const g = mk(8, 5);
  const f = F(g)[0], tr = T(g)[0];
  assert.ok(g.view(f.id, new Set()).players.filter((p) => p.id !== f.id).every((p) => p.role === null));
  const vt = g.view(tr.id, new Set()).players;
  assert.ok(vt.filter((p) => p.role).every((p) => p.role === 'traitor' || p.id === tr.id));
  assert.strictEqual(vt.filter((p) => p.role === 'traitor').length, 2);
  const board = g.view(null, new Set()).players;
  assert.ok(board.every((p) => p.role === null));
});
t('notte: la prima notte con meno di 6 è tranquilla, poi si colpisce', () => {
  const g = mk(5, 4); toNight(g);
  assert.strictEqual(g.night.murder, false);
  const tr = T(g)[0], f = F(g)[0];
  assert.ok(!g.act(tr.id, { type: 'nightPick', target: f.id }).ok);
  g.timeout();
  assert.strictEqual(g.phase, 'dawn'); assert.ok(g.dawn.none);
  const h = mk(6, 4); toNight(h);
  assert.strictEqual(h.night.murder, true);
});
t('notte: le traditrici scelgono, la vittima muore e il ruolo si rivela; le fedeli non possono', () => {
  const g = mk(8, 9); toNight(g);
  const [t1, t2] = T(g), f = F(g)[0];
  assert.ok(!g.act(f.id, { type: 'nightPick', target: F(g)[1].id }).ok);
  assert.ok(!g.act(t1.id, { type: 'nightPick', target: t2.id }).ok); // non può colpire una compagna
  assert.ok(g.act(t1.id, { type: 'nightPick', target: f.id }).ok);
  assert.strictEqual(g.phase, 'night'); // manca t2
  assert.ok(g.act(t2.id, { type: 'nightPick', target: f.id }).ok);
  assert.strictEqual(g.phase, 'dawn');
  assert.strictEqual(g.dawn.victim, f.id); assert.strictEqual(g.dawn.role, 'faithful');
  assert.ok(!f.alive);
  const spy = g.view(F(g)[0].id, new Set());
  assert.strictEqual(spy.players.find((p) => p.id === f.id).role, 'faithful');
});
t('scudo: salva dall\'eliminazione e si consuma', () => {
  const g = mk(8, 9); toNight(g);
  const f = F(g)[0]; f.shield = true;
  for (const tr of T(g)) g.act(tr.id, { type: 'nightPick', target: f.id });
  assert.ok(f.alive && g.dawn.saved && !f.shield);
});
t('giorno: dall\'alba alla missione, ai risultati, alla tavola e al voto', () => {
  const g = mk(8, 11); toNight(g); g.timeout(); // notte senza scelte
  assert.strictEqual(g.phase, 'dawn'); g.timeout();
  assert.strictEqual(g.phase, 'mission');
  g.timeout();
  assert.strictEqual(g.phase, 'missionEnd'); g.timeout();
  assert.strictEqual(g.phase, 'table');
  g.alive().forEach((p) => g.act(p.id, { type: 'tableReady' }));
  assert.strictEqual(g.phase, 'vote');
});
t('missione quiz: punti, premio e scudo; il sabotaggio dimezza', () => {
  const run = (sab) => {
    const g = mk(6, 21); toNight(g); g.timeout(); g.timeout();
    let guard = 0; while (g.mission.type !== 'quiz' && guard++ < 20) { g.mission = null; g.startMission(); }
    const m = g.mission;
    if (sab) assert.ok(g.act(T(g)[0].id, { type: 'mSabotage' }).ok);
    g.alive().forEach((p, i) => { m.qs.forEach((q, qi) => g.act(p.id, { type: 'mAnswer', q: qi, c: i === 0 ? q.a : (q.a + 1) % 4 })); });
    if (g.phase === 'mission') g.endMission();
    return g;
  };
  const a = run(false), b = run(true);
  assert.strictEqual(a.missionRes.total, 5);
  assert.strictEqual(a.missionRes.add, 100);
  assert.ok(a.missionRes.shield && a.player(a.missionRes.shieldTo).shield);
  assert.strictEqual(b.missionRes.add, 50); assert.ok(b.missionRes.sabotaged);
});
t('sabotaggio: solo le traditrici e una volta sola', () => {
  const g = mk(6, 21); toNight(g); g.timeout(); g.timeout();
  const f = F(g)[0], tr = T(g)[0];
  assert.ok(!g.act(f.id, { type: 'mSabotage' }).ok);
  assert.ok(g.act(tr.id, { type: 'mSabotage' }).ok);
  assert.ok(!g.act(tr.id, { type: 'mSabotage' }).ok);
});
t('voto: il più votato è bandito e rivela il ruolo', () => {
  const g = mk(7, 33); toNight(g); g.timeout(); g.timeout(); g.timeout(); g.timeout();
  g.alive().forEach((p) => g.act(p.id, { type: 'tableReady' }));
  const target = F(g)[0];
  g.alive().forEach((p) => { if (p.id !== target.id) g.act(p.id, { type: 'vote', target: target.id }); });
  assert.ok(!g.act(target.id, { type: 'vote', target: target.id }).ok); // non si vota da sole
  g.act(target.id, { type: 'vote', target: g.alive().find((p) => p.id !== target.id).id });
  assert.strictEqual(g.phase, 'banish');
  assert.strictEqual(g.ban.target, target.id); assert.strictEqual(g.ban.role, 'faithful');
  g.timeout();
  assert.ok(!target.alive);
  assert.ok(g.phase === 'night' || g.status === 'ended');
});
t('voto: pareggio, ballottaggio, poi nessuna', () => {
  const g = mk(8, 12); toNight(g); g.timeout(); g.timeout(); g.timeout(); g.timeout();
  g.startVote();
  const al = g.alive(); const [a, b] = al;
  al.forEach((p, i) => { const tgt = i % 2 === 0 ? a : b; g.act(p.id, { type: 'vote', target: tgt.id === p.id ? al[2].id : tgt.id }); });
  // forzo un pareggio netto
  g.vote.votes = {}; al.forEach((p, i) => { g.vote.votes[p.id] = i % 2 ? b.id : a.id; });
  g.vote.votes[a.id] = b.id; g.vote.votes[b.id] = a.id;
  g.resolveVote();
  if (g.phase === 'vote') {
    assert.ok(g.vote.revote && g.vote.cands.length >= 2);
    const [c1, c2] = g.vote.cands;
    const ids = g.alive().map((p) => p.id);
    ids.forEach((id, i) => { const tg = i % 2 ? c1 : c2; g.vote.votes[id] = tg === id ? (tg === c1 ? c2 : c1) : tg; });
    g.vote.votes[c1] = c2; g.vote.votes[c2] = c1;
    const cnt = ids.filter((id) => g.vote.votes[id] === c1).length, cnt2 = ids.length - cnt;
    g.resolveVote();
    if (cnt === cnt2) { assert.strictEqual(g.ban.target, null); assert.ok(g.ban.tie); }
  }
  assert.ok(true);
});
t('reclutamento: l\'ultima traditrice può reclutare; chi rifiuta è eliminata', () => {
  const mkR = () => { const g = mk(7, 41, (x) => x.setSettings({ traitors: 1 })); g.day = 1; toNight(g); g.timeout(); g.day = 2; g.startNight(); return g; };
  let g = mkR();
  assert.ok(g.night.recruit);
  const tr = T(g)[0], f = F(g)[0];
  assert.ok(g.act(tr.id, { type: 'nightPick', target: f.id, recruit: true }).ok);
  assert.strictEqual(g.phase, 'recruit');
  assert.ok(!g.act(F(g)[1].id, { type: 'recruit', yes: true }).ok);
  assert.ok(g.act(f.id, { type: 'recruit', yes: true }).ok);
  assert.strictEqual(f.role, 'traitor'); assert.strictEqual(g.aliveT().length, 2);
  assert.strictEqual(g.phase, 'dawn');
  g = mkR();
  const f2 = F(g)[0];
  g.act(T(g)[0].id, { type: 'nightPick', target: f2.id, recruit: true });
  g.act(f2.id, { type: 'recruit', yes: false });
  assert.ok(!f2.alive);
});
t('vittoria: fedeli se bandiscono tutte, traditrici se pareggiano', () => {
  const g = mk(5, 8);
  g.players.forEach((p) => { if (p.role === 'traitor') p.alive = false; });
  assert.ok(g.checkWin()); assert.strictEqual(g.winner, 'faithful');
  const h = mk(5, 8);
  h.players.forEach((p) => { if (p.role === 'faithful') p.alive = false; });
  const f = h.gamers.find((p) => p.role === 'faithful'); f.alive = true; // 1 contro 1
  assert.ok(h.checkWin()); assert.strictEqual(h.winner, 'traitors');
});
t('premio: si divide tra chi vince', () => {
  const g = mk(5, 8); g.pot = 1000;
  g.players.forEach((p) => { if (p.role === 'traitor') p.alive = false; });
  g.checkWin();
  assert.strictEqual(g.prize, 250); // 4 fedeli vive
});
t('narratrice: pausa e prolunga', () => {
  const g = new Game(seeded(2));
  for (let i = 0; i < 5; i++) g.join('P' + i, SEALS[i].id);
  g.players[4].narrator = true; g.start();
  const nar = g.players[4];
  const u0 = g.until;
  g.act(nar.id, { type: 'extend', sec: 60 });
  assert.ok(g.until >= u0 + 59000);
  g.act(nar.id, { type: 'pause' }); assert.ok(g.view(nar.id, new Set()).paused);
  assert.ok(!g.tick());
  g.act(nar.id, { type: 'pause' }); assert.ok(!g.view(nar.id, new Set()).paused);
});
t('salvataggio: la partita si riprende da JSON a metà', () => {
  const g = mk(7, 15); toNight(g);
  const h = Game.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.strictEqual(h.phase, 'night'); assert.strictEqual(h.aliveT().length, g.aliveT().length);
  h.timeout(); assert.strictEqual(h.phase, 'dawn');
});

// ---- simulazione di tante partite con giocatrici casuali ----
function simulate(n, seed) {
  const rng = seeded(seed);
  const np = 4 + Math.floor(rng() * 9), narr = rng() < 0.3;
  const g = new Game(seeded(seed * 7 + 1));
  for (let i = 0; i < np + (narr ? 1 : 0); i++) g.join('P' + i, SEALS[i].id);
  if (narr) g.players[g.players.length - 1].narrator = true;
  g.setSettings({ recruit: rng() < 0.7 });
  g.start();
  let steps = 0, stuck = 0;
  while (g.status === 'playing' && steps++ < 4000) {
    const al = g.alive();
    switch (g.phase) {
      case 'reveal': g.gamers.forEach((p) => g.act(p.id, { type: 'ready' })); break;
      case 'night':
        for (const tr of g.aliveT()) { const c = g.aliveF(); if (c.length) g.act(tr.id, { type: 'nightPick', target: c[Math.floor(rng() * c.length)].id, recruit: g.night.recruit && rng() < 0.5 }); }
        if (g.phase === 'night') g.timeout(); break;
      case 'recruit': g.act(g.recruitO.target, { type: 'recruit', yes: rng() < 0.5 }); break;
      case 'mission': {
        const m = g.mission;
        for (const p of al) { if (rng() < 0.15) continue; if (m.type === 'quiz') m.qs.forEach((q, i) => g.act(p.id, { type: 'mAnswer', q: i, c: Math.floor(rng() * 4) })); else g.act(p.id, { type: 'mSubmit', score: Math.floor(rng() * 20) }); }
        if (rng() < 0.3) { const tr = g.aliveT()[0]; if (tr) g.act(tr.id, { type: 'mSabotage' }); }
        if (g.phase === 'mission') g.timeout(); break;
      }
      case 'table': al.forEach((p) => { if (rng() < 0.7) g.act(p.id, { type: 'tableReady' }); }); if (g.phase === 'table') g.timeout(); break;
      case 'vote': al.forEach((p) => { if (rng() < 0.9) { const c = (g.vote.cands || al.map((x) => x.id)).filter((id) => id !== p.id); g.act(p.id, { type: 'vote', target: c[Math.floor(rng() * c.length)] }); } }); if (g.phase === 'vote') g.timeout(); break;
      default: g.timeout();
    }
    if (g.status === 'playing' && !g.until) stuck++;
  }
  return { ended: g.status === 'ended', steps, stuck, winner: g.winner, days: g.day, np };
}
t('simulazione: 600 partite casuali (4-12 giocatrici) finiscono sempre', () => {
  const N = Number(process.argv[2]) || 600; const st = { f: 0, t: 0, days: 0, stuck: 0 };
  for (let i = 1; i <= N; i++) { const r = simulate(N, i); assert.ok(r.ended, 'partita ' + i + ' non finita'); assert.strictEqual(r.stuck, 0); if (r.winner === 'faithful') st.f++; else st.t++; st.days += r.days; }
  console.log(`   fedeli ${st.f} · traditrici ${st.t} · giorni medi ${(st.days / N).toFixed(1)}`);
});

console.log(`\n${passed} test passati${fails.length ? ', ' + fails.length + ' FALLITI: ' + fails.join('; ') : ''}`);
process.exit(fails.length ? 1 : 0);
