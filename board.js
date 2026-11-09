(() => {
  'use strict';
  const D = window.TDATA;
  const { h, esc, seal, post, fmt, confetti } = window.UI;
  const $ = (s, el = document) => el.querySelector(s);
  let S = null, key = '', endAt = null, totalMs = null, info = null, qrSvg = '';
  let animKey = '', timers = [];
  const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); };
  const clearAnim = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- suoni ----------
  let actx = null, soundOn = localStorage.getItem('tr_sound') !== '0';
  const ensure = () => { if (!soundOn) return false; if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; } } if (actx.state !== 'running') actx.resume(); return actx.state === 'running'; };
  ['pointerdown', 'click', 'touchend'].forEach((e) => document.addEventListener(e, ensure, { passive: true }));
  const tone = (f, t0, d, type, vol) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'sine'; o.frequency.value = f; const t = actx.currentTime + t0; g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.05); };
  const SFX = {
    gong: () => { tone(110, 0, 2.4, 'sine', 0.32); tone(165, 0, 1.8, 'triangle', 0.16); tone(220.5, 0, 1.2, 'sine', 0.1); },
    dawn: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.16, 0.9, 'sine', 0.16)); },
    tick: () => tone(880, 0, 0.09, 'square', 0.08),
    vote: () => { tone(330, 0, 0.14, 'triangle', 0.2); tone(247, 0.08, 0.2, 'triangle', 0.16); },
    traitor: () => { tone(196, 0, 1.2, 'sawtooth', 0.12); tone(207.7, 0, 1.2, 'sawtooth', 0.1); tone(98, 0.1, 1.6, 'sine', 0.3); },
    faithful: () => { [392, 494, 587].forEach((f, i) => tone(f, i * 0.12, 0.8, 'sine', 0.16)); },
    win: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, 0.5, 'triangle', 0.18)); },
    pot: () => { tone(988, 0, 0.1, 'sine', 0.14); tone(1319, 0.08, 0.2, 'sine', 0.14); },
    shield: () => { tone(660, 0, 0.12, 'triangle', 0.14); tone(990, 0.1, 0.4, 'triangle', 0.14); },
  };
  const sfx = (k) => { if (soundOn && ensure() && SFX[k]) SFX[k](); };

  // ---------- rete ----------
  function connect() {
    const es = new EventSource('/events?role=board');
    es.onmessage = (ev) => {
      let s; try { s = JSON.parse(ev.data); } catch (e) { return; }
      const k = JSON.stringify(s, (n, v) => (n === 'left' ? undefined : n === 'connected' && s.status !== 'lobby' ? undefined : v));
      if (k === key) return;
      key = k; onState(s);
    };
    es.onerror = () => { if (es.readyState === 2) setTimeout(connect, 2000); };
  }
  fetch('/api/info').then((r) => r.json()).then((i) => { info = i; if (S) render(); }).catch(() => {});

  const P = (id) => S.players.find((p) => p.id === id);
  const gamers = () => S.players.filter((p) => !p.narrator);
  const joinUrl = () => {
    const hn = location.hostname;
    if (hn && hn !== 'localhost' && hn !== '127.0.0.1') return `${location.protocol}//${location.host}/play`;
    if (info && info.addresses && info.addresses.length) return `http://${info.addresses[0]}:${info.port}/play`;
    return `${location.origin}/play`;
  };

  function onState(s) {
    const prev = S;
    S = s;
    endAt = s.until && !s.paused ? Date.now() + s.left : null;
    if (!prev || prev.until !== s.until || prev.phase !== s.phase) totalMs = s.left;
    document.body.dataset.phase = s.phase;
    document.body.classList.toggle('night', s.phase === 'night' || s.phase === 'recruit');
    if (!prev || prev.phase !== s.phase) phaseSfx(prev, s);
    render();
  }
  function phaseSfx(prev, s) {
    if (!prev) return;
    if (s.phase === 'night') sfx('gong');
    else if (s.phase === 'dawn') sfx('dawn');
    else if (s.phase === 'ended') { sfx('win'); }
    else if (s.phase === 'vote') sfx('vote');
    else if (s.phase === 'missionEnd') { sfx('pot'); if (s.missionRes && s.missionRes.shield) setTimeout(() => sfx('shield'), 700); }
  }

  // ---------- disegno ----------
  const seatPos = (i, n) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: 50 + 43.5 * Math.cos(a), y: 50 + 35.5 * Math.sin(a) }; };
  const PH = { lobby: 'Sala d\'attesa', reveal: 'I ruoli', night: 'Notte', recruit: 'Notte', dawn: 'Alba', mission: 'Missione', missionEnd: 'Missione', table: 'Tavola rotonda', vote: 'Il voto', banish: 'Il verdetto', ended: 'Fine' };

  function seatsHTML() {
    const list = gamers();
    const sz = list.length <= 6 ? 13.5 : list.length <= 9 ? 12 : 10.5;
    return list.map((p, i) => {
      const { x, y } = seatPos(i, list.length);
      const dead = !p.alive && S.status !== 'lobby';
      const voted = S.vote && S.vote.done.includes(p.id);
      const readyT = S.table && S.table.ready.includes(p.id);
      const rdy = S.phase === 'reveal' && p.ready;
      const role = dead && p.role ? `<b class="rb ${p.role}">${p.role === 'traitor' ? '🗡️ Traditrice' : '🕊️ Fedele'}</b>` : '';
      const ended = S.status === 'ended' && p.role;
      const roleEnd = ended && !dead ? `<b class="rb ${p.role}">${p.role === 'traitor' ? '🗡️ Traditrice' : '🕊️ Fedele'}</b>` : '';
      return `<div class="seat${dead ? ' dead' : ''}" id="seat${p.id}" style="left:${x}%;top:${y}%;--s:${sz}vmin">
        <div class="sealw">${seal(p.seal, 100, { dead })}<em class="mark ${voted || readyT || rdy ? 'on' : ''}">✓</em><span class="tally" id="tal${p.id}"></span>${p.connected === false && S.status === 'lobby' ? '<em class="off">📵</em>' : ''}</div>
        <div class="nm">${esc(p.name)}${p.id === S.hostId && S.status === 'lobby' ? ' ⭐' : ''}</div>${role}${roleEnd}</div>`;
    }).join('');
  }

  function headerHTML() {
    if (S.status === 'lobby') return `<header><div class="logo">${esc(S.title)}</div></header>`;
    const tl = S.traitorsLeft;
    return `<header><div class="hl"><b>Giorno ${Math.max(1, S.day)}</b><span>${PH[S.phase] || ''}</span></div>
      <div class="logo sm">${esc(S.title)}</div>
      <div class="hr"><div class="pot">💰 Premio <b id="pot">€${S.pot}</b></div><div class="tleft">🗡️ ${tl} ${tl === 1 ? 'traditrice' : 'traditrici'} tra voi · 👥 ${S.alive} in gioco</div></div></header>`;
  }

  function timerHTML() { return S.until ? `<div class="timer"><span id="tm">${fmt(S.left)}</span><div class="bar"><i id="bar"></i></div></div>` : ''; }

  function centerHTML() {
    const ph = S.phase;
    if (S.status === 'lobby') {
      const url = joinUrl();
      try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qrSvg = q.createSvgTag(5, 0); } catch (e) { qrSvg = ''; }
      const n = gamers().length;
      return `<div class="cbox lobby"><h2>Chi ha il coraggio di entrare?</h2><div class="qr">${qrSvg}</div>
        <p class="url">${esc(url.replace(/^https?:\/\//, ''))}</p>
        <p class="hint">Scansiona il QR, scrivi il tuo nome e scegli un sigillo.</p>
        <p class="cnt">${n} ${n === 1 ? 'ospite' : 'ospiti'}${n < 4 ? ` · ne servono almeno ${4 - n} ${4 - n === 1 ? 'altra' : 'altre'}` : ` · ${S.traitorCount} ${S.traitorCount === 1 ? 'traditrice' : 'traditrici'} tra voi`}</p>
        ${n >= 4 ? '<button class="btn big" id="btnStart">🕯️ Cominciamo!</button>' : ''}</div>`;
    }
    if (ph === 'reveal') {
      const r = gamers().filter((p) => p.ready).length;
      return `<div class="cbox"><div class="big">🕯️</div><h2>Il convento apre le porte</h2><p class="hint">Guardate il telefono: lì scoprite se siete <b>Fedeli</b> o <b>Traditrici</b>.<br>Non fate vedere a nessuno!</p><p class="cnt">${r} / ${gamers().length} hanno visto il loro ruolo</p>${timerHTML()}</div>`;
    }
    if (ph === 'night' || ph === 'recruit') {
      return `<div class="cbox nightbox"><div class="moon">🌙</div><h2>Notte ${S.day}</h2><p class="hint big2">Il convento dorme.<br><b>Chiudete gli occhi</b> e tenete il telefono sul tavolo.</p><p class="hint soft">${ph === 'recruit' ? 'Nel buio qualcuno riceve un\'offerta…' : 'Le Traditrici stanno scegliendo in silenzio…'}</p>${timerHTML()}</div>`;
    }
    if (ph === 'dawn') return `<div class="cbox dawnbox" id="dawn"></div>`;
    if (ph === 'mission' && S.mission) {
      const M = D.MISSIONS[S.mission.type];
      return `<div class="cbox"><div class="big">${M.icon}</div><h2>${M.name}</h2><p class="hint">${M.how}</p>
        <div class="prog"><i style="width:${Math.round((S.mission.done / Math.max(1, S.mission.total)) * 100)}%"></i></div><p class="cnt">${S.mission.done} / ${S.mission.total} hanno finito</p>${timerHTML()}</div>`;
    }
    if (ph === 'missionEnd' && S.missionRes) {
      const r = S.missionRes;
      const rows = r.ranking.slice().sort((a, b) => b.pts - a.pts).slice(0, 12).map((x) => { const p = P(x.id); return p ? `<div class="rk">${seal(p.seal, 34)}<span>${esc(p.name)}</span><div class="rkb"><i style="width:${x.pts * 20}%"></i></div><b>${x.pts}</b></div>` : ''; }).join('');
      return `<div class="cbox"><h2>${D.MISSIONS[r.type].icon} Missione conclusa</h2>
        <div class="potadd">+€<span id="addv" data-v="${r.add}">0</span></div>
        ${r.sabotaged ? '<p class="bad">🗡️ Qualcosa è andato storto… il premio si è dimezzato!</p>' : '<p class="hint">Tutte insieme avete messo da parte dei soldi.</p>'}
        ${r.shield ? '<p class="gold">🛡️ Uno scudo è stato assegnato in segreto a una di voi.</p>' : ''}
        <div class="rklist">${rows}</div></div>`;
    }
    if (ph === 'table') {
      const n = S.table.ready.length;
      return `<div class="cbox"><div class="big">🗣️</div><h2>Tavola rotonda</h2><p class="hint big2">Chi è la Traditrice?<br>Accusate, difendetevi, <b>mentite</b>.</p>
        <p class="cnt">${n} / ${S.alive} pronte a votare</p>${timerHTML()}</div>`;
    }
    if (ph === 'vote' && S.vote) {
      return `<div class="cbox"><div class="big">🗳️</div><h2>${S.vote.revote ? 'Pareggio! Si rivota' : 'Si vota!'}</h2><p class="hint">${S.vote.revote ? 'Solo tra le più votate.' : 'Ognuna sceglie in segreto sul suo telefono.'}</p>
        <p class="cnt">${S.vote.done.length} / ${S.alive} hanno votato</p>${timerHTML()}</div>`;
    }
    if (ph === 'banish') return `<div class="cbox" id="banbox"><div class="big">⚖️</div><h2>I voti</h2><p class="hint" id="bancap">Ora si scoprono i voti, uno alla volta…</p></div>`;
    if (ph === 'ended') {
      const w = S.winner === 'faithful';
      const win = gamers().filter((p) => p.alive && (w ? p.role === 'faithful' : p.role === 'traitor'));
      return `<div class="cbox ended ${w ? 'f' : 't'}"><div class="big">${w ? '🕊️' : '🗡️'}</div><h2>${w ? 'Le Fedeli hanno vinto!' : 'Le Traditrici hanno vinto!'}</h2>
        <p class="hint">${w ? 'Tutte le Traditrici sono state smascherate.' : 'Le Traditrici hanno preso il convento.'}</p>
        <div class="prize">€${S.prize}<small>a testa</small></div>
        <div class="winners">${win.map((p) => `<span>${seal(p.seal, 40)}<b>${esc(p.name)}</b></span>`).join('')}</div>
        <button class="btn" id="btnNew">🔄 Nuova partita</button></div>`;
    }
    return '';
  }

  function feedHTML() {
    if (S.status === 'lobby' || ['dawn', 'banish', 'ended'].includes(S.phase)) return ''; // niente anticipazioni
    return `<div class="feed">${S.log.slice(-3).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function render() {
    if (!S) return;
    const app = $('#app');
    app.innerHTML = `${headerHTML()}<main class="table"><div class="cloth"></div>${seatsHTML()}<div class="center">${centerHTML()}</div></main>${feedHTML()}
      <button id="btnRules" class="gear rul">📖</button><button id="btnMenu" class="gear">⚙️</button><button id="btnSnd" class="gear snd">${soundOn ? '🔊' : '🔇'}</button>`;
    if (S.status === 'lobby') { $('#btnStart') && $('#btnStart').addEventListener('click', async () => { const r = await post('/api/board', { type: 'start' }); if (!r.ok) alert(r.error); }); }
    const nb = $('#btnNew'); if (nb) nb.addEventListener('click', async () => { if (confirm('Cominciare una nuova partita?')) { await post('/api/board', { type: 'reset' }); } });
    $('#btnMenu').addEventListener('click', openMenu);
    $('#btnRules').addEventListener('click', () => window.UI.rulesModal());
    $('#btnSnd').addEventListener('click', () => { soundOn = !soundOn; localStorage.setItem('tr_sound', soundOn ? '1' : '0'); if (soundOn) { ensure(); sfx('dawn'); } render(); });
    const k = `${S.gameId}:${S.day}:${S.phase}:${S.ban ? 'b' : ''}${S.dawn ? 'd' : ''}`;
    if (k !== animKey) { animKey = k; clearAnim(); $('#over').classList.add('hidden'); runPhaseAnim(); if (S.phase === 'ended') endShow(); }
    updateTimer();
    const av = $('#addv'); if (av) countUp(av);
  }

  function countUp(el) {
    const to = Number(el.dataset.v); let n = 0; const step = Math.max(10, Math.round(to / 30 / 10) * 10 || 10);
    const iv = setInterval(() => { n = Math.min(to, n + step); el.textContent = n; if (n >= to) clearInterval(iv); }, 40);
    timers.push(iv);
  }
  function updateTimer() {
    const tm = $('#tm'); if (!tm || !S.until) return;
    const left = S.paused ? S.left : Math.max(0, (endAt || 0) - Date.now());
    tm.textContent = fmt(left) + (S.paused ? ' ⏸' : '');
    const bar = $('#bar'); if (bar && totalMs) bar.style.width = Math.max(0, Math.min(100, (left / totalMs) * 100)) + '%';
  }
  setInterval(updateTimer, 250);

  function runPhaseAnim() {
    if (S.phase === 'dawn' && S.dawn) dawnShow();
    else if (S.phase === 'banish' && S.ban) banShow();
  }
  function dawnShow() {
    const box = $('#dawn'); const d = S.dawn;
    box.innerHTML = `<div class="sun">☀️</div><h2>È mattina…</h2><p class="hint">Vediamo se qualcuna manca all'appello.</p>`;
    later(3500, () => {
      const b = $('#dawn'); if (!b) return;
      if (d.victim) {
        const p = P(d.victim);
        b.innerHTML = `<div class="victim">${seal(p.seal, 130, { dead: true })}</div><h2>${esc(p.name)} è stata eliminata</h2><p class="hint">Nella notte, le Traditrici hanno colpito.</p>`;
        sfx('traitor');
        later(3500, () => { const bb = $('#dawn'); if (bb) { bb.innerHTML += `<div class="role faithful">🕊️ Era una Fedele</div>`; sfx('faithful'); } });
      } else if (d.saved) { b.innerHTML = `<div class="big">🛡️</div><h2>Qualcuna è stata attaccata…</h2><p class="gold big2">…ma uno scudo l'ha salvata!</p>`; sfx('shield'); }
      else b.innerHTML = `<div class="big">🕊️</div><h2>Nessun delitto stanotte</h2><p class="hint">Sono tutte qui. Per ora.</p>`;
    });
  }
  function banShow() {
    const ban = S.ban; const votes = ban.votes; const tally = {};
    const cap = (t) => { const c = $('#bancap'); if (c) c.innerHTML = t; };
    votes.forEach((v, i) => {
      later(2800 + i * 1100, () => {
        const a = P(v.from), b = P(v.to);
        document.querySelectorAll('.seat.speak').forEach((e) => e.classList.remove('speak'));
        const sa = $('#seat' + v.from); if (sa) sa.classList.add('speak');
        cap(`<b>${esc(a.name)}</b> vota <b>${esc(b.name)}</b>`);
        tally[v.to] = (tally[v.to] || 0) + 1;
        const tl = $('#tal' + v.to); if (tl) { tl.textContent = tally[v.to]; tl.classList.remove('pop'); void tl.offsetWidth; tl.classList.add('pop'); }
        sfx('tick');
      });
    });
    const t0 = 2800 + votes.length * 1100 + 700;
    later(t0, () => {
      document.querySelectorAll('.seat.speak').forEach((e) => e.classList.remove('speak'));
      const ov = $('#over'); ov.classList.remove('hidden');
      if (!ban.target) { ov.innerHTML = `<div class="ovbox"><div class="big">🤷</div><h1>${ban.tie ? 'Pareggio!' : 'Nessun voto'}</h1><p>Nessuna viene bandita.</p></div>`; sfx('vote'); return; }
      const p = P(ban.target);
      ov.innerHTML = `<div class="ovbox"><div class="ovseal">${seal(p.seal, 190)}</div><h1>${esc(p.name)} è bandita</h1><p class="sus">…era una…</p></div>`;
      sfx('vote');
      later(2600, () => {
        const t = ban.role === 'traitor';
        ov.innerHTML = `<div class="ovbox ${t ? 'tr' : 'fa'}"><div class="ovseal">${seal(p.seal, 190)}</div><h1>${esc(p.name)} è bandita</h1><div class="rolebig ${t ? 'traitor' : 'faithful'}">${t ? '🗡️ TRADITRICE!' : '🕊️ FEDELE…'}</div></div>`;
        sfx(t ? 'win' : 'traitor');
        if (t) confetti(60);
      });
    });
    later(Math.max(t0 + 6500, 0), () => $('#over').classList.add('hidden'));
  }
  function endShow() {
    const w = S.winner === 'faithful';
    confetti(120); sfx('win');
  }

  // ---------- menu ----------
  function openMenu() {
    const m = $('#menu'); m.classList.remove('hidden');
    const playing = S.status === 'playing';
    m.innerHTML = `<div class="menuBox"><h3>Menu</h3>
      ${playing ? `<button class="btn big" data-m="skip">⏭ Salta alla fase successiva</button><button class="btn big ghost" data-m="extend">⏱ +1 minuto</button><button class="btn big ghost" data-m="pause">${S.paused ? '▶ Riprendi' : '⏸ Pausa'}</button>
      <div id="mDrop"></div><button class="btn big wine" data-m="endgame">🏁 Termina ora</button>` : ''}
      <button class="btn big wine" data-m="reset">🗑 Nuova partita (cancella tutto)</button><button class="btn big ghost" data-m="close">Chiudi</button></div>`;
    const drop = $('#mDrop');
    if (drop) drop.innerHTML = gamers().filter((p) => p.alive).length ? `<p class="mh">Una è andata via?</p><div class="mdrop">${gamers().filter((p) => p.alive).map((p) => `<button class="chip" data-kick="${p.id}">${seal(p.seal, 26)} ${esc(p.name)}</button>`).join('')}</div>` : '';
  }
  document.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kick]');
    if (k) { if (confirm('Far uscire questa giocatrice dalla partita?')) { const r = await post('/api/board', { type: 'kick', id: Number(k.dataset.kick) }); if (!r.ok) alert(r.error); $('#menu').classList.add('hidden'); } return; }
    const b = e.target.closest('[data-m]'); if (!b) return;
    const a = b.dataset.m;
    if (a === 'close') { $('#menu').classList.add('hidden'); return; }
    if (a === 'reset') { if (confirm('Cancellare tutto e ricominciare?')) await post('/api/board', { type: 'reset' }); $('#menu').classList.add('hidden'); return; }
    if (a === 'endgame' && !confirm('Terminare la partita adesso?')) return;
    const r = await post('/api/board', { type: a, sec: 60 }); if (!r.ok) alert(r.error);
    $('#menu').classList.add('hidden');
  });
  $('#over').addEventListener('click', () => $('#over').classList.add('hidden'));
  connect();
})();
