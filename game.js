'use strict';
// Motore di "Tradimento al Collegio": tutte le regole stanno qui, il server decide tutto.
const crypto = require('crypto');
const DATA = require('./data.js');
const { SEALS, QUIZ, MISSIONS } = DATA;

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };

const MAX_PLAYERS = 12;
const MIN_PLAYERS = 4;
const DEFAULTS = { tableSec: 240, recruit: true, ghostsSee: true, traitors: 0 }; // traitors 0 = automatico
const NIGHT_SEC = 75, QUIET_NIGHT_SEC = 14, DAWN_SEC = 10, RECRUIT_SEC = 45, VOTE_SEC = 60, REVOTE_SEC = 45, RESULT_SEC = 12, REVEAL_SEC = 150;
const POT_PER_POINT = 20;

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const traitorsFor = (n) => (n <= 5 ? 1 : n <= 8 ? 2 : 3);

class Game {
  constructor(rng) { this.rng = rng || Math.random; this.init(); }

  init() {
    this.status = 'lobby'; // lobby | playing | ended
    this.phase = 'lobby';  // lobby | reveal | night | recruit | dawn | mission | missionEnd | table | vote | banish | ended
    this.gameId = '';
    this.createdAt = Date.now();
    this.settings = { ...DEFAULTS };
    this.players = [];
    this.nextId = 1;
    this.hostId = null;
    this.day = 0;
    this.pot = 0;
    this.until = null;       // scadenza della fase (ms)
    this.pausedLeft = null;
    this.night = null; this.recruitO = null; this.dawn = null; this.mission = null; this.missionRes = null;
    this.table = null; this.vote = null; this.ban = null;
    this.recruited = false;
    this.lastMission = null;
    this.winner = null; this.prize = 0;
    this.log = []; this.logSeq = 0;
    this.shieldSeq = 0;
    this.missionSeq = 0;
  }

  // ---------- utilità ----------
  player(id) { return this.players.find((p) => p.id === id); }
  byToken(t) { return t ? this.players.find((p) => p.token === t) : undefined; }
  get gamers() { return this.players.filter((p) => !p.narrator); }
  alive() { return this.gamers.filter((p) => p.alive); }
  aliveT() { return this.alive().filter((p) => p.role === 'traitor'); }
  aliveF() { return this.alive().filter((p) => p.role === 'faithful'); }
  addLog(kind, text) { this.log.push({ id: ++this.logSeq, kind, text, day: this.day }); if (this.log.length > 60) this.log.shift(); }
  setUntil(sec) { this.until = Date.now() + sec * 1000; this.pausedLeft = null; }
  nm(p) { return p ? p.name : 'qualcuna'; }

  toJSON() { const o = {}; for (const k of Object.keys(this)) if (k !== 'rng') o[k] = this[k]; return o; }
  static fromJSON(obj, rng) {
    const g = new Game(rng);
    Object.assign(g, obj);
    g.settings = { ...DEFAULTS, ...(obj.settings || {}) };
    return g;
  }

  // ---------- lobby ----------
  join(name, seal) {
    if (this.status !== 'lobby') fail('La partita è già iniziata.');
    name = String(name || '').trim().slice(0, 14);
    if (!name) fail('Scrivi il tuo nome.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('C\'è già qualcuna con questo nome.');
    if (this.players.length >= MAX_PLAYERS + 1) fail('Il convento è pieno (massimo 12 giocatrici + la narratrice).');
    const s = SEALS.find((x) => x.id === seal);
    if (!s) fail('Scegli un sigillo.');
    if (this.players.some((p) => p.seal === s.id)) fail('Questo sigillo è già stato preso.');
    const p = { id: this.nextId++, token: crypto.randomBytes(12).toString('hex'), name, seal: s.id, narrator: false, role: null, alive: true, shield: false, ready: false, sabotage: true, left: false };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }
  leave(p) {
    if (this.status !== 'lobby') fail('Ormai si gioca.');
    this.players = this.players.filter((q) => q.id !== p.id);
    if (this.hostId === p.id) this.hostId = this.players.length ? this.players[0].id : null;
  }
  setNarrator(p, on) {
    if (this.status !== 'lobby') fail('Si sceglie prima di iniziare.');
    if (on && this.players.some((q) => q.narrator && q.id !== p.id)) fail('C\'è già una narratrice.');
    if (!on && p.narrator && this.gamers.length >= MAX_PLAYERS) fail('Siete già in 12: una deve restare narratrice.');
    p.narrator = !!on;
  }
  setSettings(s) {
    if (this.status !== 'lobby') fail('Le regole si cambiano prima di iniziare.');
    if (s.tableSec !== undefined) { const v = Number(s.tableSec); if (![120, 240, 360].includes(v)) fail('Tempo non valido.'); this.settings.tableSec = v; }
    if (s.recruit !== undefined) this.settings.recruit = !!s.recruit;
    if (s.ghostsSee !== undefined) this.settings.ghostsSee = !!s.ghostsSee;
    if (s.traitors !== undefined) { const v = Number(s.traitors); if (![0, 1, 2, 3].includes(v)) fail('Numero non valido.'); this.settings.traitors = v; }
  }
  traitorCount() {
    const n = this.gamers.length;
    const t = this.settings.traitors || traitorsFor(n);
    return Math.max(1, Math.min(t, Math.floor((n - 1) / 2))); // sempre meno della metà
  }

  start() {
    if (this.status !== 'lobby') fail('Partita già avviata.');
    if (this.gamers.length > MAX_PLAYERS) fail('Siete più di 12: una può fare la narratrice.');
    if (this.gamers.length < MIN_PLAYERS) fail(`Servono almeno ${MIN_PLAYERS} giocatrici (senza la narratrice).`);
    const order = shuffle(this.gamers.map((p) => p.id), this.rng);
    const nT = this.traitorCount();
    for (const p of this.gamers) { p.role = order.indexOf(p.id) < nT ? 'traitor' : 'faithful'; p.alive = true; p.shield = false; p.ready = false; p.sabotage = true; }
    for (const p of this.players.filter((q) => q.narrator)) { p.role = null; p.ready = true; }
    this.gameId = crypto.randomBytes(4).toString('hex');
    this.status = 'playing';
    this.phase = 'reveal';
    this.day = 0; this.pot = 0; this.recruited = false; this.winner = null; this.lastMission = null; this.nT = nT;
    this.setUntil(REVEAL_SEC);
    this.addLog('start', `Il convento apre le porte: ${this.gamers.length} ospiti, ${nT} ${nT === 1 ? 'traditrice' : 'traditrici'} tra loro…`);
  }

  ready(p) {
    if (this.phase !== 'reveal') fail('Non adesso.');
    if (p.narrator) fail('Tu sei la narratrice.');
    p.ready = true;
    if (this.gamers.every((q) => q.ready)) this.startNight();
  }

  // ---------- notte ----------
  // la prima notte con meno di 6 giocatrici è tranquilla; con meno di 4 ancora in gioco non si colpisce più (decide il voto)
  canMurder() { return (this.day >= 2 || this.gamers.length >= 6) && this.alive().length >= 4; }
  canRecruit() { return this.settings.recruit && !this.recruited && this.day >= 2 && this.aliveT().length === 1 && this.aliveF().length >= 3; }

  startNight() {
    this.day++;
    this.phase = 'night';
    this.night = { picks: {}, murder: this.canMurder(), recruit: this.canRecruit() };
    this.dawn = null; this.ban = null; this.vote = null; this.table = null; this.missionRes = null;
    this.setUntil(this.night.murder ? NIGHT_SEC : QUIET_NIGHT_SEC);
    this.addLog('night', `🌙 Notte ${this.day}: il convento dorme…`);
  }
  nightPick(p, target, recruit) {
    if (this.phase !== 'night') fail('Non è notte.');
    if (!p.alive || p.role !== 'traitor') fail('Non puoi farlo.');
    if (!this.night.murder) fail('È troppo presto per colpire.');
    const t = this.player(Number(target));
    if (!t || t.narrator || !t.alive || t.role === 'traitor') fail('Scelta non valida.');
    const rec = !!recruit && this.night.recruit;
    this.night.picks[p.id] = { target: t.id, recruit: rec };
    if (this.aliveT().every((q) => this.night.picks[q.id])) this.resolveNight();
  }
  resolveNight() {
    const picks = Object.values(this.night.picks);
    this.dawn = { victim: null, saved: false, none: false, role: null };
    if (!picks.length) { this.dawn.none = true; this.addLog('dawn', this.night.murder ? 'Le traditrici non hanno colpito nessuno.' : 'Una notte tranquilla: è ancora presto per colpire.'); return this.toDawn(); }
    const rec = picks.find((x) => x.recruit);
    if (rec) return this.startRecruit(rec.target);
    const count = {};
    for (const x of picks) count[x.target] = (count[x.target] || 0) + 1;
    const max = Math.max(...Object.values(count));
    const top = Object.keys(count).filter((k) => count[k] === max).map(Number);
    const victim = this.player(top[Math.floor(this.rng() * top.length)]);
    this.hit(victim);
    this.toDawn();
  }
  hit(victim) {
    if (victim.shield) {
      victim.shield = false;
      this.dawn.saved = true;
      this.addLog('dawn', '🛡️ Qualcuna è stata attaccata ma uno scudo l\'ha salvata!');
    } else {
      victim.alive = false;
      this.dawn.victim = victim.id; this.dawn.role = victim.role;
      this.addLog('dawn', `💀 ${victim.name} è stata eliminata durante la notte. Era una ${victim.role === 'traitor' ? 'Traditrice' : 'Fedele'}.`);
    }
  }
  toDawn() {
    this.phase = 'dawn';
    this.night = null;
    this.setUntil(DAWN_SEC);
    if (!this.dawn.victim && !this.dawn.saved && !this.dawn.none) this.dawn.none = true;
  }
  afterDawn() {
    if (this.checkWin()) return;
    this.startMission();
  }

  // reclutamento
  startRecruit(targetId) {
    this.phase = 'recruit';
    this.recruitO = { target: targetId };
    this.setUntil(RECRUIT_SEC);
    this.addLog('night', '🌒 Nel buio qualcuno riceve un\'offerta…');
  }
  recruitAnswer(p, yes) {
    if (this.phase !== 'recruit' || !this.recruitO || this.recruitO.target !== p.id) fail('Non adesso.');
    this.resolveRecruit(!!yes);
  }
  resolveRecruit(yes) {
    const t = this.player(this.recruitO.target);
    this.dawn = { victim: null, saved: false, none: false, role: null };
    this.recruitO = null;
    if (yes && t) {
      t.role = 'traitor'; this.recruited = true; this.dawn.none = true;
      this.addLog('dawn', 'Nessun delitto stanotte… ma qualcosa è cambiato nel convento.');
    } else if (t) {
      t.alive = false; this.dawn.victim = t.id; this.dawn.role = t.role;
      this.addLog('dawn', `💀 ${t.name} ha rifiutato l'offerta ed è stata eliminata. Era una Fedele.`);
    }
    this.toDawn();
  }

  // ---------- missione ----------
  startMission() {
    const types = Object.keys(MISSIONS).filter((k) => k !== this.lastMission);
    const type = types[Math.floor(this.rng() * types.length)];
    this.lastMission = type;
    const m = { type, seq: ++this.missionSeq, seed: Math.floor(this.rng() * 1e9), scores: {}, sabotaged: false };
    if (type === 'quiz') {
      const idx = shuffle(QUIZ.map((_, i) => i), this.rng).slice(0, 5);
      m.qs = idx.map((i) => { const q = QUIZ[i]; const order = shuffle([0, 1, 2, 3], this.rng); return { q: q[0], opts: order.map((o) => q[1][o]), a: order.indexOf(q[2]) }; });
      m.ans = {};
    }
    this.mission = m;
    this.phase = 'mission';
    this.setUntil(MISSIONS[type].sec + 8);
    this.addLog('mission', `${MISSIONS[type].icon} Missione: ${MISSIONS[type].name}`);
  }
  mAnswer(p, q, c) {
    this.needMission(p);
    const m = this.mission;
    if (m.type !== 'quiz') fail('Non adesso.');
    q = Number(q); c = Number(c);
    if (!(q >= 0 && q < m.qs.length) || !(c >= 0 && c < 4)) fail('Risposta non valida.');
    const a = (m.ans[p.id] = m.ans[p.id] || []);
    if (a[q] !== undefined) return;
    a[q] = c;
    const done = m.qs.every((_, i) => a[i] !== undefined);
    if (done) {
      const correct = m.qs.filter((x, i) => a[i] === x.a).length;
      m.scores[p.id] = { pts: correct, t: Date.now() };
      this.checkMissionDone();
    }
  }
  mSubmit(p, score) {
    this.needMission(p);
    const m = this.mission;
    if (m.type === 'quiz') fail('Non adesso.');
    if (m.scores[p.id]) return;
    let v = Math.max(0, Math.floor(Number(score) || 0));
    v = m.type === 'memory' ? Math.min(5, v) : Math.min(5, Math.floor(Math.min(v, 14) / 2));
    m.scores[p.id] = { pts: v, t: Date.now() };
    this.checkMissionDone();
  }
  mSabotage(p) {
    this.needMission(p);
    if (p.role !== 'traitor') fail('Non puoi farlo.');
    if (!p.sabotage) fail('Hai già sabotato una volta.');
    p.sabotage = false;
    this.mission.sabotaged = true;
  }
  needMission(p) {
    if (this.phase !== 'mission' || !this.mission) fail('Non adesso.');
    if (!p.alive || p.narrator) fail('Non puoi giocare.');
  }
  checkMissionDone() {
    if (this.alive().every((q) => this.mission.scores[q.id])) this.endMission();
  }
  endMission() {
    const m = this.mission;
    if (m.type === 'quiz') { // chi non ha finito conta per quello che ha risposto
      for (const q of this.alive()) if (!m.scores[q.id]) { const a = m.ans[q.id] || []; m.scores[q.id] = { pts: m.qs.filter((x, i) => a[i] === x.a).length, t: Date.now() + 99999 }; }
    }
    for (const q of this.alive()) if (!m.scores[q.id]) m.scores[q.id] = { pts: 0, t: Date.now() + 99999 };
    const rows = this.alive().map((q) => ({ id: q.id, pts: m.scores[q.id].pts, t: m.scores[q.id].t })).sort((a, b) => b.pts - a.pts || a.t - b.t);
    const total = rows.reduce((n, r) => n + r.pts, 0);
    let add = total * POT_PER_POINT;
    if (m.sabotaged) add = Math.round(add / 2 / 10) * 10;
    this.pot += add;
    let shieldTo = null;
    const cand = rows.find((r) => r.pts > 0 && !this.player(r.id).shield);
    if (cand) { shieldTo = cand.id; this.player(cand.id).shield = true; this.shieldSeq++; }
    this.missionRes = { type: m.type, add, sabotaged: m.sabotaged, total, shield: !!shieldTo, shieldTo, ranking: rows.map((r) => ({ id: r.id, pts: r.pts })) };
    this.phase = 'missionEnd';
    this.setUntil(RESULT_SEC);
    this.addLog('mission', `${MISSIONS[m.type].icon} Missione conclusa: +€${add}${m.sabotaged ? ' (sabotata!)' : ''}`);
  }

  // ---------- tavola rotonda e voto ----------
  startTable() {
    this.phase = 'table';
    this.table = { ready: {} };
    this.setUntil(this.settings.tableSec);
    this.addLog('table', '🗣️ Tavola rotonda: chi non è come sembra?');
  }
  tableReady(p) {
    if (this.phase !== 'table' || !p.alive || p.narrator) fail('Non adesso.');
    this.table.ready[p.id] = true;
    if (this.alive().every((q) => this.table.ready[q.id])) this.startVote();
  }
  startVote(cands) {
    this.phase = 'vote';
    this.vote = { votes: {}, cands: cands || null, revote: !!cands };
    this.setUntil(cands ? REVOTE_SEC : VOTE_SEC);
    this.addLog('vote', cands ? '⚖️ Pareggio! Si rivota tra le più votate.' : '🗳️ Si vota!');
  }
  castVote(p, target) {
    if (this.phase !== 'vote' || !p.alive || p.narrator) fail('Non adesso.');
    const t = this.player(Number(target));
    if (!t || t.narrator || !t.alive || t.id === p.id) fail('Scelta non valida.');
    if (this.vote.cands && !this.vote.cands.includes(t.id)) fail('Puoi votare solo tra le più votate.');
    this.vote.votes[p.id] = t.id;
    if (this.alive().every((q) => this.vote.votes[q.id])) this.resolveVote();
  }
  resolveVote() {
    const v = this.vote;
    const count = {};
    for (const to of Object.values(v.votes)) count[to] = (count[to] || 0) + 1;
    const max = Object.keys(count).length ? Math.max(...Object.values(count)) : 0;
    const top = Object.keys(count).filter((k) => count[k] === max).map(Number);
    if (top.length > 1 && !v.revote) return this.startVote(top);
    const target = top.length === 1 ? this.player(top[0]) : null;
    const votes = shuffle(Object.entries(v.votes).map(([from, to]) => ({ from: Number(from), to })), this.rng);
    this.ban = { votes, count, target: target ? target.id : null, role: target ? target.role : null, tie: top.length > 1 };
    this.phase = 'banish';
    this.setUntil(6 + votes.length * 1.1 + 7);
  }
  afterBanish() {
    const b = this.ban;
    const t = b.target ? this.player(b.target) : null;
    if (t) { t.alive = false; this.addLog('ban', `🚪 ${t.name} è stata bandita. Era una ${t.role === 'traitor' ? 'TRADITRICE' : 'Fedele'}!`); }
    else this.addLog('ban', '🤷 Nessuna è stata bandita.');
    if (this.checkWin()) return;
    this.startNight();
  }

  // ---------- fine ----------
  checkWin() {
    const t = this.aliveT().length, f = this.aliveF().length;
    if (t === 0) return this.finish('faithful');
    if (t >= f) return this.finish('traitors');
    return false;
  }
  finish(winner) {
    this.winner = winner;
    const side = winner === 'faithful' ? this.alive().filter((p) => p.role === 'faithful') : this.alive().filter((p) => p.role === 'traitor');
    this.prize = side.length ? Math.floor(this.pot / side.length / 10) * 10 : 0;
    this.status = 'ended'; this.phase = 'ended'; this.until = null;
    this.addLog('end', winner === 'faithful' ? '🏆 Le Fedeli hanno smascherato tutte le Traditrici!' : '🗡️ Le Traditrici hanno conquistato il convento!');
    return true;
  }

  // ---------- tempo ----------
  tick() {
    if (this.status !== 'playing' || !this.until || this.pausedLeft !== null) return false;
    if (Date.now() < this.until) return false;
    this.timeout();
    return true;
  }
  timeout() {
    switch (this.phase) {
      case 'reveal': for (const p of this.gamers) p.ready = true; this.startNight(); break;
      case 'night': this.resolveNight(); break;
      case 'recruit': this.resolveRecruit(false); break;
      case 'dawn': this.afterDawn(); break;
      case 'mission': this.endMission(); break;
      case 'missionEnd': this.startTable(); break;
      case 'table': this.startVote(); break;
      case 'vote': this.resolveVote(); break;
      case 'banish': this.afterBanish(); break;
      default: break;
    }
  }

  // ---------- azioni ----------
  act(pid, a) {
    try {
      const p = this.player(pid);
      if (!p) fail('Giocatrice non trovata.');
      if (this.status === 'ended') fail('La partita è finita.');
      if (this.status === 'lobby') {
        switch (a.type) {
          case 'start': if (this.hostId !== p.id) fail('Solo chi ha creato la partita può avviarla.'); this.start(); break;
          case 'settings': if (this.hostId !== p.id) fail('Solo chi ha creato la partita cambia le regole.'); this.setSettings(a); break;
          case 'narrator': this.setNarrator(p, !!a.on); break;
          case 'leave': this.leave(p); break;
          default: fail('La partita non è ancora iniziata.');
        }
        return { ok: true };
      }
      if (p.narrator) {
        // la narratrice non gioca: governa il ritmo
        switch (a.type) {
          case 'skip': this.timeout(); break;
          case 'extend': this.extend(Number(a.sec) || 60); break;
          case 'pause': this.pause(); break;
          default: fail('Sei la narratrice: non puoi giocare.');
        }
        return { ok: true };
      }
      switch (a.type) {
        case 'ready': this.ready(p); break;
        case 'nightPick': this.nightPick(p, a.target, a.recruit); break;
        case 'recruit': this.recruitAnswer(p, !!a.yes); break;
        case 'mAnswer': this.mAnswer(p, a.q, a.c); break;
        case 'mSubmit': this.mSubmit(p, a.score); break;
        case 'mSabotage': this.mSabotage(p); break;
        case 'tableReady': this.tableReady(p); break;
        case 'vote': this.castVote(p, a.target); break;
        case 'noop': break;
        default: fail('Azione sconosciuta.');
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      throw e;
    }
  }
  extend(sec) {
    if (this.status !== 'playing' || !this.until) fail('Niente da prolungare.');
    sec = Math.max(10, Math.min(300, sec));
    if (this.pausedLeft !== null) this.pausedLeft += sec * 1000; else this.until += sec * 1000;
  }
  pause() {
    if (this.status !== 'playing' || !this.until) fail('Niente da fermare.');
    if (this.pausedLeft === null) { this.pausedLeft = Math.max(1000, this.until - Date.now()); this.until = Date.now() + this.pausedLeft; }
    else { this.until = Date.now() + this.pausedLeft; this.pausedLeft = null; }
  }

  // azioni del tabellone (iPad)
  admin(a) {
    try {
      switch (a.type) {
        case 'start': this.start(); break;
        case 'settings': this.setSettings(a); break;
        case 'skip': if (this.status !== 'playing') fail('La partita non è in corso.'); this.timeout(); break;
        case 'extend': this.extend(Number(a.sec) || 60); break;
        case 'pause': this.pause(); break;
        case 'endgame': if (this.status !== 'playing') fail('La partita non è in corso.'); this.finish(this.aliveT().length ? 'traitors' : 'faithful'); break;
        case 'kick': {
          const p = this.player(a.id);
          if (!p) break;
          if (this.status === 'lobby') this.leave(p);
          else if (this.status === 'playing' && p.alive && !p.narrator) {
            p.alive = false; p.left = true;
            this.addLog('ban', `🚪 ${p.name} ha lasciato il convento.`);
            if (!this.checkWin()) this.unstick();
          }
          break;
        }
        default: fail('Azione sconosciuta.');
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      throw e;
    }
  }
  // dopo che qualcuna esce, le attese complete si sbloccano
  unstick() {
    if (this.phase === 'night' && this.night && this.aliveT().length && this.aliveT().every((q) => this.night.picks[q.id])) this.resolveNight();
    else if (this.phase === 'mission') this.checkMissionDone();
    else if (this.phase === 'table' && this.alive().every((q) => this.table.ready[q.id])) this.startVote();
    else if (this.phase === 'vote' && this.alive().every((q) => this.vote.votes[q.id])) this.resolveVote();
    else if (this.phase === 'reveal' && this.gamers.every((q) => q.ready || !q.alive)) this.startNight();
  }

  // ---------- vista ----------
  view(pid, connected) {
    const me = this.player(pid) || null;
    const narr = !!(me && me.narrator);
    const ghost = !!(me && !me.narrator && !me.alive && this.settings.ghostsSee);
    const seeAll = narr || ghost || this.status === 'ended';
    const myT = !!(me && me.role === 'traitor');
    const playing = this.status === 'playing';
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, seal: p.seal, narrator: p.narrator, alive: p.alive, left: p.left,
      connected: connected ? connected.has(p.id) : true,
      ready: this.phase === 'reveal' ? p.ready : undefined,
      role: p.narrator ? null : (seeAll || (!p.alive && this.status !== 'lobby') || (myT && p.role === 'traitor') || (me && me.id === p.id)) ? p.role : null,
      shield: !!((seeAll || (me && me.id === p.id)) && p.shield),
    }));
    const left = this.until ? (this.pausedLeft !== null ? this.pausedLeft : Math.max(0, this.until - Date.now())) : null;
    const v = {
      title: DATA.TITLE, status: this.status, phase: this.phase, hostId: this.hostId, you: me ? me.id : null,
      settings: this.settings, players, day: this.day, pot: this.pot, until: this.until, left, paused: this.pausedLeft !== null,
      created: this.createdAt, gameId: this.gameId, log: this.log.slice(-25), traitorCount: this.status === 'lobby' ? this.traitorCount() : (this.nT || 0),
      traitorsLeft: this.status === 'lobby' ? null : Math.max(0, (this.nT || 0) - this.gamers.filter((p) => !p.alive && p.role === 'traitor').length),
      alive: this.alive().length, shieldSeq: this.shieldSeq,
      me: me ? { role: me.role, alive: me.alive, shield: me.shield, narrator: me.narrator, canSabotage: !!(myT && me.sabotage && me.alive), ghost, seesAll: seeAll } : null,
    };
    if (!playing && this.status !== 'ended') return v;
    // fasi
    if (this.phase === 'night' && this.night) {
      v.night = { murder: this.night.murder, canRecruit: this.night.recruit };
      if ((myT && me.alive) || narr || ghost) v.night.picks = this.night.picks;
      if (myT && me.alive) v.night.myPick = this.night.picks[me.id] || null;
    }
    if (this.phase === 'recruit' && this.recruitO) {
      v.recruit = { target: seeAll || (me && me.id === this.recruitO.target) || myT ? this.recruitO.target : null, mine: !!(me && me.id === this.recruitO.target) };
    }
    if (this.dawn && (this.phase === 'dawn')) v.dawn = this.dawn;
    if (this.mission && (this.phase === 'mission' || this.phase === 'missionEnd')) {
      const m = this.mission;
      v.mission = { type: m.type, seq: m.seq, seed: m.seed, done: Object.keys(m.scores).length, total: this.alive().length, sabotaged: seeAll ? m.sabotaged : undefined };
      if (m.type === 'quiz') {
        v.mission.qs = m.qs.map((q) => ({ q: q.q, opts: q.opts }));
        if (me) { const a = m.ans[me.id] || []; v.mission.my = m.qs.map((q, i) => (a[i] === undefined ? null : { c: a[i], ok: a[i] === q.a })); }
      }
      if (me) v.mission.myDone = !!m.scores[me.id];
    }
    if (this.missionRes && this.phase === 'missionEnd') {
      const r = this.missionRes;
      v.missionRes = { type: r.type, add: r.add, sabotaged: r.sabotaged, total: r.total, shield: r.shield, ranking: r.ranking, myShield: !!(me && r.shieldTo === me.id), shieldTo: seeAll ? r.shieldTo : undefined };
    }
    if (this.table && this.phase === 'table') v.table = { ready: Object.keys(this.table.ready).map(Number) };
    if (this.vote && (this.phase === 'vote')) v.vote = { cands: this.vote.cands, revote: this.vote.revote, done: Object.keys(this.vote.votes).map(Number), mine: me ? this.vote.votes[me.id] || null : null };
    if (this.ban && this.phase === 'banish') v.ban = this.ban;
    if (this.status === 'ended') { v.winner = this.winner; v.prize = this.prize; }
    return v;
  }
}

module.exports = { Game, GameError, MAX_PLAYERS, MIN_PLAYERS, traitorsFor };
