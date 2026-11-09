(() => {
  'use strict';
  const D = window.TDATA;
  const { h, esc, seal, post, fmt, toast, confetti, rulesModal } = window.UI;
  const $ = (s, el = document) => el.querySelector(s);
  let token = localStorage.getItem('tr_token');
  let S = null, key = '', es = null, endAt = null;
  let selSeal = null, typedName = '';
  let peek = 0;                  // mostra il ruolo fino a…
  let nightSel = null, recruitFlag = false;
  let voteSel = null;
  let revealedFor = sessionStorage.getItem('tr_revealed') || '';
  let fb = null;                 // risposta appena data nel quiz
  let mini = null;               // stato del mini-gioco in corso
  let lastShield = null, lastPhase = null, lastAlive = null, rulesOpen = false;

  const P = (id) => S.players.find((p) => p.id === id);
  const me = () => (S && S.you ? P(S.you) : null);
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* */ } };

  // ---------- rete ----------
  function connect() {
    if (es) es.close();
    es = new EventSource('/events' + (token ? '?token=' + encodeURIComponent(token) : ''));
    es.onmessage = (ev) => {
      let s; try { s = JSON.parse(ev.data); } catch (e) { return; }
      const k = JSON.stringify(s, (n, v) => (n === 'left' ? undefined : v));
      if (k === key) return;
      key = k; onState(s);
    };
    es.onerror = async () => {
      if (token) { const r = await post('/api/act', { token, type: 'noop' }); if (/Sessione scaduta/.test(r.error || '')) { logout(); return; } }
      if (es.readyState === 2) setTimeout(connect, 2000);
    };
  }
  function logout() { token = null; localStorage.removeItem('tr_token'); key = ''; connect(); }
  let busy = 0;
  async function act(a) {
    if (Date.now() < busy) return { ok: false };
    busy = Date.now() + 350;
    const r = await post('/api/act', Object.assign({ token }, a));
    if (!r.ok && r.error) { if (/Sessione scaduta/.test(r.error)) logout(); else toast(r.error, true); }
    return r;
  }

  function onState(s) {
    const prev = S;
    S = s;
    endAt = s.until && !s.paused ? Date.now() + s.left : null;
    if (s.you && !me()) { logout(); return; }
    const m = s.me;
    if (prev && m) {
      if (lastShield === false && m.shield) toast('🛡️ Hai vinto uno scudo! Una volta, ti salva dall\'eliminazione notturna.');
      if (lastShield === true && !m.shield && m.alive && s.phase === 'dawn') toast('🛡️ Lo scudo ti ha salvata stanotte!');
      if (lastAlive === true && !m.alive) { buzz([300, 100, 300]); }
      if (prev.phase !== s.phase) phaseBuzz(s, m);
    }
    if (m) { lastShield = !!m.shield; lastAlive = !!m.alive; }
    // la prima volta, le regole si aprono da sole appena entri
    if (me() && !localStorage.getItem('tr_rules_seen') && !rulesOpen) { rulesOpen = true; setTimeout(() => rulesModal(() => { localStorage.setItem('tr_rules_seen', '1'); }), 400); }
    if (!prev || prev.phase !== s.phase || (prev.mission && s.mission && prev.mission.seq !== s.mission.seq)) { nightSel = null; recruitFlag = false; voteSel = null; fb = null; if (!prev || prev.phase !== 'mission') mini = null; }
    if (prev && prev.phase === 'vote' && s.phase === 'vote' && prev.vote && s.vote && prev.vote.revote !== s.vote.revote) voteSel = null;
    render();
  }
  function phaseBuzz(s, m) {
    if (!m || !m.alive) return;
    if (s.phase === 'night' && m.role === 'traitor' && s.night && s.night.murder) buzz([200, 80, 200]);
    else if (['mission', 'table', 'vote'].includes(s.phase)) buzz([120, 60, 120]);
    else if (s.phase === 'recruit' && s.recruit && s.recruit.mine) buzz([300, 100, 300]);
  }

  // ---------- pezzi di interfaccia ----------
  const roleName = (r) => (r === 'traitor' ? 'Traditrice' : 'Fedele');
  function header() {
    const m = me(); const mm = S.me;
    const showing = Date.now() < peek;
    const chip = mm && mm.role ? `<button class="rolechip ${showing ? mm.role : ''}" data-act="peek">${showing ? (mm.role === 'traitor' ? '🗡️ Traditrice' : '🕊️ Fedele') : '🔒 Il mio ruolo'}</button>` : mm && mm.narrator ? '<span class="rolechip narr">🎙️ Narratrice</span>' : '';
    return `<header class="top"><div class="who">${seal(m.seal, 44, { dead: !m.alive && S.status === 'playing' })}<div><b>${esc(m.name)}</b>${S.status === 'playing' ? `<small>Giorno ${Math.max(1, S.day)} · 💰 €${S.pot}</small>` : ''}</div></div>${chip}<button class="hq" data-act="help">?</button></header>`;
  }
  function timerBar() {
    if (!S.until) return '';
    return `<div class="tbar"><span id="tm">${fmt(S.left)}</span><div class="bar"><i id="bar"></i></div></div>`;
  }
  const waitCard = (icon, title, text) => `<div class="card center"><div class="bigi">${icon}</div><h2>${title}</h2><p>${text}</p>${timerBar()}</div>`;
  const seals = (list, cls, sel, dis) => `<div class="tiles">${list.map((p) => `<button class="tile ${sel === p.id ? 'sel' : ''} ${cls || ''}" data-id="${p.id}" ${dis && dis(p) ? 'disabled' : ''}>${seal(p.seal, 56, { dead: !p.alive })}<span>${esc(p.name)}</span>${p.role === 'traitor' && S.me && S.me.role === 'traitor' ? '<em>🗡️</em>' : ''}</button>`).join('')}</div>`;

  // ---------- schermate ----------
  function renderJoin() {
    const taken = new Set(S.players.map((p) => p.seal));
    const lobby = S.status === 'lobby';
    return `<div class="wrap"><div class="logo">${esc(S.title)}</div><div class="sub">${lobby ? 'Scegli il tuo nome e il tuo sigillo' : 'La partita è già iniziata'}</div>
      ${lobby ? `<div class="card"><input id="nm" maxlength="14" placeholder="Il tuo nome" value="${esc(typedName)}" autocomplete="off">
      <div class="sealgrid">${D.SEALS.map((s) => `<button class="sg ${selSeal === s.id ? 'sel' : ''}" data-act="pickSeal" data-id="${s.id}" ${taken.has(s.id) ? 'disabled' : ''}>${seal(s.id, 54)}<small>${s.name}</small></button>`).join('')}</div>
      <button class="btn big" data-act="join">Entra nel convento</button></div>`
      : `<div class="card"><p>Se eri già dentro, riprendi il tuo posto:</p>${S.players.map((p) => `<button class="btn ghost" data-act="claim" data-id="${p.id}" style="margin:4px 0;display:flex;align-items:center;gap:10px">${seal(p.seal, 36)} ${esc(p.name)}</button>`).join('')}</div>`}
    </div>`;
  }

  function renderLobby() {
    const m = me(); const host = S.hostId === m.id;
    const st = S.settings; const n = S.players.filter((p) => !p.narrator).length;
    const narr = S.players.find((p) => p.narrator);
    return `<div class="wrap">
      <div class="card"><h3>Ospiti (${n}${narr ? ' + narratrice' : ''})</h3>${S.players.map((p) => `<div class="prow">${seal(p.seal, 40)}<b>${esc(p.name)}</b>${p.id === S.hostId ? ' ⭐' : ''}${p.narrator ? ' 🎙️' : ''}${p.id === m.id ? '<small> (tu)</small>' : ''}</div>`).join('')}
        <p class="muted">${n < 4 ? `Ne servono almeno 4 per giocare.` : `Con ${n} giocatrici: ${S.traitorCount} ${S.traitorCount === 1 ? 'traditrice' : 'traditrici'}.`}</p></div>
      <div class="card"><label class="sw"><input type="checkbox" data-act="narr" ${m.narrator ? 'checked' : ''}> <span>🎙️ Faccio la <b>narratrice</b> (non gioco, vedo tutto e governo i tempi)</span></label></div>
      ${host ? `<div class="card"><h3>Impostazioni ⭐</h3><div class="chips">
        <button class="chip" data-act="set" data-k="tableSec">🗣️ Tavola: ${st.tableSec / 60} min</button>
        <button class="chip" data-act="set" data-k="traitors">🗡️ Traditrici: ${st.traitors ? st.traitors : 'automatico'}</button>
        <button class="chip ${st.recruit ? 'on' : ''}" data-act="set" data-k="recruit">🌒 Reclutamento</button>
        <button class="chip ${st.ghostsSee ? 'on' : ''}" data-act="set" data-k="ghostsSee">👻 Chi è fuori vede i ruoli</button></div>
        <button class="btn big ${n < 4 ? 'off' : ''}" data-act="start">Inizia la partita</button></div>`
        : `<div class="card"><p class="muted">Aspetta che ${esc(P(S.hostId).name)} ⭐ avvii la partita (o dal tabellone).</p></div>`}
      <button class="btn ghost" data-act="help">❓ Come si gioca</button><button class="btn ghost" data-act="leave">Esci</button></div>`;
  }

  function renderReveal() {
    const mm = S.me; const m = me();
    if (mm.narrator) return `<div class="wrap">${waitCard('🎙️', 'I ruoli sono assegnati', 'Le giocatrici stanno scoprendo il loro ruolo.')}${narrPanel()}</div>`;
    const shown = revealedFor === S.gameId;
    if (!shown) return `<div class="wrap"><div class="card center flip" data-act="reveal"><div class="bigi">🕯️</div><h2>Il tuo ruolo è un segreto</h2><p>Assicurati che nessuna guardi lo schermo, poi tocca la carta.</p><button class="btn big" data-act="reveal">Scopri il mio ruolo</button></div></div>`;
    const t = mm.role === 'traitor';
    const mates = S.players.filter((p) => p.role === 'traitor' && p.id !== m.id);
    return `<div class="wrap"><div class="card rolecard ${mm.role}"><div class="bigi">${t ? '🗡️' : '🕊️'}</div><h2>Sei ${t ? 'una TRADITRICE' : 'una Fedele'}</h2>
      <p>${t ? 'Di notte elimini una Fedele. Di giorno mentì, accusa e non farti scoprire.' : 'Scopri chi sono le Traditrici e bandiscile prima che sia troppo tardi.'}</p>
      ${t ? `<div class="mates"><b>Le tue compagne:</b>${mates.length ? mates.map((p) => `<span>${seal(p.seal, 34)} ${esc(p.name)}</span>`).join('') : ' sei da sola!'}</div>` : ''}
      </div>${m.ready ? '<div class="card center"><p>Perfetto! Aspettiamo le altre… 🕯️</p></div>' : '<button class="btn big" data-act="ready">Ho capito, sono pronta</button>'}
      <button class="btn ghost" data-act="hide">🙈 Nascondi</button></div>`;
  }

  function ghostBox() {
    return `<div class="card ghost"><h3>👻 Sei fuori dal gioco</h3><p class="muted">${S.settings.ghostsSee ? 'Ora vedi i ruoli di tutte: guarda in silenzio, non rovinare il gioco!' : 'Guarda il tabellone e fai il tifo.'}</p>
      ${S.settings.ghostsSee ? S.players.filter((p) => !p.narrator).map((p) => `<div class="prow">${seal(p.seal, 34, { dead: !p.alive })}<b>${esc(p.name)}</b><span class="rb ${p.role}">${p.role === 'traitor' ? '🗡️' : '🕊️'}</span>${p.shield ? ' 🛡️' : ''}${p.alive ? '' : ' 💀'}</div>`).join('') : ''}</div>`;
  }
  function narrPanel() {
    const rows = S.players.filter((p) => !p.narrator).map((p) => `<div class="prow">${seal(p.seal, 34, { dead: !p.alive })}<b>${esc(p.name)}</b><span class="rb ${p.role}">${p.role === 'traitor' ? '🗡️ Traditrice' : '🕊️ Fedele'}</span>${p.shield ? ' 🛡️' : ''}${p.alive ? '' : ' 💀'}</div>`).join('');
    const picks = S.night && S.night.picks ? Object.entries(S.night.picks).map(([k, x]) => `<p>🗡️ ${esc(P(Number(k)).name)} → ${esc(P(x.target).name)}${x.recruit ? ' (recluta)' : ''}</p>`).join('') : '';
    return `<div class="card narr"><h3>🎙️ Narratrice</h3>${S.until ? timerBar() : ''}
      <div class="row"><button class="btn small" data-act="nskip">⏭ Avanti</button><button class="btn small ghost" data-act="next60">⏱ +1 min</button><button class="btn small ghost" data-act="npause">${S.paused ? '▶ Riprendi' : '⏸ Pausa'}</button></div>
      ${picks}<div class="rolelist">${rows}</div></div>`;
  }

  function renderNight() {
    const mm = S.me; const m = me();
    if (mm.narrator) return `<div class="wrap">${waitCard('🌙', `Notte ${S.day}`, 'Le Traditrici scelgono in silenzio.')}${narrPanel()}</div>`;
    if (!mm.alive) return `<div class="wrap">${waitCard('🌙', 'È notte', 'Il convento dorme.')}${ghostBox()}</div>`;
    if (mm.role === 'traitor') {
      const n = S.night;
      if (!n.murder) return `<div class="wrap dark">${waitCard('🗡️', 'Stanotte riposi', 'È ancora presto (o siete troppo poche) per colpire. Fingi di dormire.')}</div>`;
      const cands = S.players.filter((p) => !p.narrator && p.alive && p.role !== 'traitor');
      const mine = n.myPick;
      const others = Object.entries(n.picks || {}).filter(([k]) => Number(k) !== m.id).map(([k, x]) => `<p class="muted">🗡️ ${esc(P(Number(k)).name)} ha scelto <b>${esc(P(x.target).name)}</b>${x.recruit ? ' (recluta)' : ''}</p>`).join('');
      return `<div class="wrap dark"><div class="card"><h2>🗡️ Chi eliminate stanotte?</h2><p class="muted">Se siete più Traditrici, scegliete la stessa persona. Parlate a bassa voce… o meglio, non parlate!</p>
        ${seals(cands, '', nightSel || (mine && mine.target))}${others}
        ${n.canRecruit ? `<label class="sw"><input type="checkbox" data-act="rec" ${recruitFlag || (mine && mine.recruit) ? 'checked' : ''}> <span>🌒 <b>Recluta</b> invece di eliminare: se accetta diventa Traditrice, se rifiuta viene eliminata.</span></label>` : ''}
        <button class="btn big" data-act="nightGo" ${nightSel || mine ? '' : 'disabled'}>${mine ? 'Cambia scelta' : 'Conferma'}</button>${mine ? '<p class="muted">✅ Scelta inviata. Aspetta le altre.</p>' : ''}${timerBar()}</div></div>`;
    }
    return `<div class="wrap dark"><div class="card center night"><div class="candle">🕯️</div><h2>Chiudi gli occhi</h2><p>È notte. Posa il telefono sul tavolo e non aprire gli occhi finché non lo dice il tabellone.</p>${timerBar()}</div></div>`;
  }
  function renderRecruit() {
    const mm = S.me; const r = S.recruit;
    if (r && r.mine) return `<div class="wrap dark"><div class="card center night"><div class="bigi">🌒</div><h2>Un sussurro nel buio…</h2><p>Le Traditrici ti offrono un posto con loro. <b>Accetti di tradire?</b><br><small>Se rifiuti, verrai eliminata.</small></p><button class="btn big wine" data-act="recYes">🗡️ Accetto</button><button class="btn big ghost" data-act="recNo">Rifiuto</button>${timerBar()}</div></div>`;
    if (mm.narrator) return `<div class="wrap">${waitCard('🌒', 'Reclutamento', 'Una Fedele sta decidendo se tradire.')}${narrPanel()}</div>`;
    if (mm.role === 'traitor' && mm.alive) return `<div class="wrap dark">${waitCard('🌒', 'Hai fatto la tua offerta', 'Aspetta la risposta…')}</div>`;
    return mm.alive ? renderNightQuiet() : `<div class="wrap">${waitCard('🌙', 'È notte', 'Il convento dorme.')}${ghostBox()}</div>`;
  }
  const renderNightQuiet = () => `<div class="wrap dark"><div class="card center night"><div class="candle">🕯️</div><h2>Chiudi gli occhi</h2><p>È ancora notte. Tieni il telefono sul tavolo.</p>${timerBar()}</div></div>`;

  function renderDawn() {
    const mm = S.me; const d = S.dawn || {};
    const was = d.victim === S.you;
    if (mm.narrator) return `<div class="wrap">${waitCard('☀️', 'Mattina', 'Guarda il tabellone.')}${narrPanel()}</div>`;
    return `<div class="wrap">${waitCard(was ? '💀' : '☀️', was ? 'Sei stata eliminata' : 'Guarda il tabellone', was ? 'Le Traditrici ti hanno colpita. Da ora guardi in silenzio.' : 'Si scopre cosa è successo stanotte…')}${!mm.alive ? ghostBox() : ''}</div>`;
  }

  // ---------- missioni ----------
  function renderMission() {
    const mm = S.me; const M = D.MISSIONS[S.mission.type];
    if (mm.narrator) return `<div class="wrap">${waitCard(M.icon, M.name, `${S.mission.done}/${S.mission.total} hanno finito`)}${narrPanel()}</div>`;
    if (!mm.alive) return `<div class="wrap">${waitCard(M.icon, M.name, 'Le altre stanno giocando.')}${ghostBox()}</div>`;
    let body;
    if (S.mission.myDone) body = waitCard('✅', 'Fatto!', `Aspetta le altre (${S.mission.done}/${S.mission.total})…`);
    else if (S.mission.type === 'quiz') body = quizHTML();
    else if (S.mission.type === 'memory') body = memoryHTML();
    else body = intruderHTML();
    const sab = mm.canSabotage ? `<button class="btn small wine sab" data-act="sab">🗡️ Sabota la missione (una volta sola)</button>` : '';
    return `<div class="wrap"><div class="mhead">${M.icon} <b>${M.name}</b></div>${body}${sab}</div>`;
  }
  function quizHTML() {
    const q = S.mission.qs, my = S.mission.my || [];
    let i = my.findIndex((x) => x === null);
    if (fb && my[fb.q] && Date.now() < fb.until) i = fb.q; else if (fb && Date.now() >= fb.until) fb = null;
    if (i < 0) return waitCard('✅', 'Fatto!', 'Aspetta le altre…');
    const cur = q[i], ans = my[i];
    return `<div class="card"><div class="qdots">${q.map((_, k) => `<i class="${my[k] ? (my[k].ok ? 'ok' : 'ko') : k === i ? 'cur' : ''}"></i>`).join('')}</div><h2 class="qq">${esc(cur.q)}</h2>
      <div class="opts">${cur.opts.map((o, k) => `<button class="opt ${ans ? (ans.c === k ? (ans.ok ? 'ok' : 'ko') : '') : (fb && fb.c === k ? 'sel' : '')}" data-act="ans" data-q="${i}" data-c="${k}" ${ans ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>${timerBar()}</div>`;
  }
  // numeri casuali ripetibili (stessa sequenza per tutte)
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const CANDLE = ['#e2b559', '#c2453d', '#4a7ad1', '#3d9a6b'];
  function startMini() {
    const M = S.mission;
    if (mini && mini.seq === M.seq) return;
    const r = rng(M.seed);
    mini = { seq: M.seq, type: M.type, r, submitted: false, startedAt: Date.now() };
    if (M.type === 'memory') { mini.pat = Array.from({ length: 12 }, () => Math.floor(r() * 4)); mini.level = 1; mini.state = 'intro'; mini.pos = 0; mini.lit = -1; }
    if (M.type === 'intruder') { mini.found = 0; mini.lock = 0; mini.round = null; mini.endsAt = Date.now() + D.MISSIONS.intruder.sec * 1000; newGrid(); }
  }
  // --- le candele ---
  function memoryHTML() {
    startMini();
    if (mini.state === 'intro') { mini.state = 'wait'; setTimeout(() => memShow(), 900); }
    const status = mini.state === 'show' ? 'Guarda…' : mini.state === 'input' ? 'Tocca a te!' : mini.state === 'fail' ? 'Sbagliato!' : 'Preparati…';
    return `<div class="card center"><div class="lvl">Livello ${Math.min(5, mini.level)} / 5</div><div class="status">${status}</div>
      <div class="candles">${CANDLE.map((c, i) => `<button class="cdl ${mini.lit === i ? 'lit' : ''}" style="--c:${c}" data-act="cdl" data-i="${i}" ${mini.state === 'input' ? '' : 'disabled'}><span>🕯️</span></button>`).join('')}</div>${timerBar()}</div>`;
  }
  async function memShow() {
    if (!mini || mini.type !== 'memory' || mini.submitted) return;
    mini.state = 'show'; mini.pos = 0; render();
    const len = mini.level + 1;
    for (let i = 0; i < len; i++) {
      await new Promise((r) => setTimeout(r, 450));
      if (!mini || mini.submitted) return;
      mini.lit = mini.pat[i]; render();
      await new Promise((r) => setTimeout(r, 520));
      mini.lit = -1; render();
    }
    await new Promise((r) => setTimeout(r, 250));
    if (mini && !mini.submitted) { mini.state = 'input'; mini.pos = 0; render(); }
  }
  function memTap(i) {
    if (!mini || mini.state !== 'input') return;
    mini.lit = i; render(); setTimeout(() => { if (mini) { mini.lit = -1; render(); } }, 160);
    if (mini.pat[mini.pos] !== i) { mini.state = 'fail'; render(); setTimeout(() => submitMini(mini.level - 1), 900); return; }
    mini.pos++;
    if (mini.pos >= mini.level + 1) {
      if (mini.level >= 5) { submitMini(5); return; }
      mini.level++; mini.state = 'wait'; render(); setTimeout(memShow, 700);
    }
  }
  // --- l'intruso ---
  const PAIRS = [['🌹', '🥀'], ['🕯️', '🔦'], ['🦇', '🦉'], ['🔔', '🛎️'], ['🗝️', '🔑'], ['🌙', '🌛'], ['⚜️', '🔱'], ['📜', '📃'], ['🕊️', '🐦'], ['🍇', '🫐']];
  function newGrid() {
    const a = PAIRS[Math.floor(mini.r() * PAIRS.length)];
    const flip = mini.r() < 0.5;
    mini.round = { main: flip ? a[0] : a[1], odd: flip ? a[1] : a[0], at: Math.floor(mini.r() * 16) };
  }
  function intruderHTML() {
    startMini();
    const r = mini.round;
    const left = Math.max(0, mini.endsAt - Date.now());
    return `<div class="card center"><div class="lvl">Trovati: <b id="found">${mini.found}</b> · <span id="itm">${fmt(left)}</span></div><div class="grid16">${Array.from({ length: 16 }, (_, i) => `<button class="gc ${mini.lock > Date.now() ? 'lock' : ''}" data-act="gc" data-i="${i}">${i === r.at ? r.odd : r.main}</button>`).join('')}</div><p class="muted">Tocca il simbolo diverso dagli altri.</p></div>`;
  }
  function gcTap(i) {
    if (!mini || mini.type !== 'intruder' || mini.submitted || mini.lock > Date.now()) return;
    if (i === mini.round.at) { mini.found++; newGrid(); } else mini.lock = Date.now() + 1200;
    render();
    if (mini.lock > Date.now()) setTimeout(render, 1250);
  }
  async function submitMini(score) {
    if (!mini || mini.submitted) return;
    mini.submitted = true;
    await act({ type: 'mSubmit', score });
  }
  // fine tempo dei mini-giochi (client)
  setInterval(() => {
    if (!S || S.phase !== 'mission' || !mini || mini.submitted || (S.me && S.me.narrator)) return;
    if (mini.type === 'intruder' && Date.now() >= mini.endsAt) submitMini(mini.found);
    if (mini.type === 'memory' && endAt && Date.now() >= endAt - 2500) submitMini(mini.state === 'fail' ? mini.level - 1 : mini.level - 1);
    const f = $('#found'), t = $('#itm'); if (f && mini.type === 'intruder') { f.textContent = mini.found; t.textContent = fmt(mini.endsAt - Date.now()); }
  }, 500);

  function renderMissionEnd() {
    const r = S.missionRes; const mm = S.me;
    if (mm.narrator) return `<div class="wrap">${waitCard('🏆', 'Risultati', 'Guarda il tabellone.')}${narrPanel()}</div>`;
    const my = r.ranking.find((x) => x.id === S.you);
    return `<div class="wrap">${waitCard(D.MISSIONS[r.type].icon, 'Missione conclusa', `Il premio cresce di <b>€${r.add}</b>.${r.sabotaged ? '<br>🗡️ Qualcosa è andato storto…' : ''}`)}
      ${r.myShield ? '<div class="card shieldc"><div class="bigi">🛡️</div><h3>Hai vinto uno scudo!</h3><p>Una volta, ti salva dall\'eliminazione notturna. Nessuna sa che ce l\'hai: <b>non dirlo a nessuno</b>.</p></div>' : ''}
      ${my ? `<p class="muted center">Il tuo punteggio: <b>${my.pts}</b></p>` : ''}${!mm.alive ? ghostBox() : ''}</div>`;
  }

  // ---------- tavola e voto ----------
  function renderTable() {
    const mm = S.me; const m = me();
    if (mm.narrator) return `<div class="wrap">${waitCard('🗣️', 'Tavola rotonda', `${S.table.ready.length}/${S.alive} pronte a votare`)}${narrPanel()}</div>`;
    const isReady = S.table.ready.includes(S.you);
    return `<div class="wrap">${waitCard('🗣️', 'Tavola rotonda', 'Parlate! Chi è la Traditrice? Accusate, difendetevi, mentite.')}
      ${mm.alive ? (isReady ? '<div class="card center"><p>✅ Sei pronta a votare. Aspetta le altre.</p></div>' : '<button class="btn big" data-act="tready">🗳️ Sono pronta a votare</button>') : ghostBox()}
      <div class="card"><h3>Ancora in gioco (${S.alive})</h3>${S.players.filter((p) => !p.narrator && p.alive).map((p) => `<div class="prow">${seal(p.seal, 34)}<b>${esc(p.name)}</b>${S.table.ready.includes(p.id) ? ' ✅' : ''}</div>`).join('')}</div></div>`;
  }
  function renderVote() {
    const mm = S.me; const v = S.vote;
    if (mm.narrator) return `<div class="wrap">${waitCard('🗳️', 'Si vota', `${v.done.length}/${S.alive} hanno votato`)}${narrPanel()}</div>`;
    if (!mm.alive) return `<div class="wrap">${waitCard('🗳️', 'Si vota', `${v.done.length}/${S.alive} hanno votato`)}${ghostBox()}</div>`;
    const cands = S.players.filter((p) => !p.narrator && p.alive && p.id !== S.you && (!v.cands || v.cands.includes(p.id)));
    const sel = voteSel || v.mine;
    return `<div class="wrap"><div class="card"><h2>${v.revote ? '⚖️ Pareggio: rivota' : '🗳️ Chi bandisci?'}</h2><p class="muted">Il tuo voto sarà pubblico quando si scopriranno i voti sul tabellone.</p>
      ${seals(cands, '', sel)}<button class="btn big wine" data-act="voteGo" ${sel ? '' : 'disabled'}>${v.mine ? 'Cambia voto' : 'Conferma il voto'}</button>${v.mine ? `<p class="muted">✅ Hai votato <b>${esc(P(v.mine).name)}</b>. (${v.done.length}/${S.alive})</p>` : ''}${timerBar()}</div></div>`;
  }
  function renderBanish() {
    if (S.me.narrator) return `<div class="wrap">${waitCard('⚖️', 'Il verdetto', 'Guarda il tabellone.')}${narrPanel()}</div>`;
    return `<div class="wrap">${waitCard('⚖️', 'Il verdetto', 'Guarda il tabellone: si scoprono i voti uno alla volta…')}${!S.me.alive ? ghostBox() : ''}</div>`;
  }
  function renderEnded() {
    const mm = S.me; const w = S.winner === 'faithful';
    const won = mm && mm.role && ((w && mm.role === 'faithful') || (!w && mm.role === 'traitor'));
    return `<div class="wrap"><div class="card center ${w ? 'fa' : 'tr'}"><div class="bigi">${w ? '🕊️' : '🗡️'}</div><h2>${w ? 'Hanno vinto le Fedeli!' : 'Hanno vinto le Traditrici!'}</h2>
      ${mm && mm.role ? `<p class="resline">${won ? '🎉 Hai vinto!' : '😈 Peccato, stavolta no.'}</p>` : ''}<p>Premio: <b>€${S.prize}</b> a testa per chi ha vinto ed era ancora in gioco.</p></div>
      <div class="card"><h3>Chi era chi</h3>${S.players.filter((p) => !p.narrator).map((p) => `<div class="prow">${seal(p.seal, 36, { dead: !p.alive })}<b>${esc(p.name)}</b><span class="rb ${p.role}">${p.role === 'traitor' ? '🗡️ Traditrice' : '🕊️ Fedele'}</span>${p.alive ? '' : ' 💀'}</div>`).join('')}</div>
      <button class="btn ghost" data-act="help">❓ Regole</button></div>`;
  }

  // ---------- disegno ----------
  let lastFx = '';
  function render() {
    if (!S) return;
    const app = $('#app');
    const m = me();
    let html;
    if (!m) html = renderJoin();
    else {
      let body;
      switch (S.phase) {
        case 'lobby': body = renderLobby(); break;
        case 'reveal': body = renderReveal(); break;
        case 'night': body = renderNight(); break;
        case 'recruit': body = renderRecruit(); break;
        case 'dawn': body = renderDawn(); break;
        case 'mission': body = renderMission(); break;
        case 'missionEnd': body = renderMissionEnd(); break;
        case 'table': body = renderTable(); break;
        case 'vote': body = renderVote(); break;
        case 'banish': body = renderBanish(); break;
        case 'ended': body = renderEnded(); break;
        default: body = '';
      }
      html = header() + body;
    }
    const active = document.activeElement && document.activeElement.id === 'nm';
    if (active) return; // non ridisegnare mentre scrive il nome
    app.innerHTML = html;
    document.body.classList.toggle('dk', ['night', 'recruit'].includes(S.phase) && !!(m && S.me && !S.me.narrator));
    if (S.phase === 'ended' && lastFx !== S.gameId) { lastFx = S.gameId; if (S.me && S.me.role && ((S.winner === 'faithful') === (S.me.role === 'faithful'))) confetti(80); }
    updateTimer();
  }
  function updateTimer() {
    const tm = $('#tm'); if (!tm || !S || !S.until) return;
    const left = S.paused ? S.left : Math.max(0, (endAt || 0) - Date.now());
    tm.textContent = fmt(left) + (S.paused ? ' ⏸' : '');
    const bar = $('#bar'); if (bar && S.until) { const tot = Math.max(1, (S.settings.tableSec || 240) * 1000); bar.style.width = Math.min(100, (left / Math.max(left, S.phase === 'table' ? tot : S.phase === 'night' ? 75000 : S.phase === 'vote' ? 60000 : 90000)) * 100) + '%'; }
  }
  setInterval(updateTimer, 300);

  // ---------- eventi ----------
  document.addEventListener('input', (e) => { if (e.target.id === 'nm') typedName = e.target.value; });
  document.addEventListener('change', async (e) => {
    const c = e.target.closest('[data-act]'); if (!c || !S) return;
    if (c.dataset.act === 'narr') await act({ type: 'narrator', on: c.checked });
    if (c.dataset.act === 'rec') { recruitFlag = c.checked; }
  });
  document.addEventListener('click', async (e) => {
    if (!S) return;
    const tile = e.target.closest('.tile');
    if (tile && !tile.disabled) {
      const id = Number(tile.dataset.id);
      if (S.phase === 'night') nightSel = id; else if (S.phase === 'vote') voteSel = id;
      render(); return;
    }
    const b = e.target.closest('[data-act]'); if (!b || b.type === 'checkbox') return;
    const a = b.dataset.act, d = b.dataset;
    switch (a) {
      case 'pickSeal': selSeal = d.id; render(); break;
      case 'join': {
        const nm = ($('#nm') ? $('#nm').value : typedName).trim(); typedName = nm;
        if (!nm) { toast('Scrivi il tuo nome', true); return; }
        if (!selSeal) { toast('Scegli un sigillo', true); return; }
        const r = await post('/api/join', { name: nm, seal: selSeal });
        if (!r.ok) { toast(r.error, true); return; }
        token = r.token; localStorage.setItem('tr_token', token); key = ''; connect(); break;
      }
      case 'claim': { const r = await post('/api/claim', { id: Number(d.id) }); if (!r.ok) { toast(r.error, true); return; } token = r.token; localStorage.setItem('tr_token', token); key = ''; connect(); break; }
      case 'help': rulesModal(); break;
      case 'peek': peek = Date.now() + 3000; render(); setTimeout(render, 3050); break;
      case 'start': await act({ type: 'start' }); break;
      case 'leave': if (confirm('Uscire dalla partita?')) { await act({ type: 'leave' }); logout(); } break;
      case 'set': {
        const st = S.settings;
        if (d.k === 'tableSec') { const o = [120, 240, 360]; await act({ type: 'settings', tableSec: o[(o.indexOf(st.tableSec) + 1) % 3] }); }
        else if (d.k === 'traitors') await act({ type: 'settings', traitors: (st.traitors + 1) % 4 });
        else await act({ type: 'settings', [d.k]: !st[d.k] });
        break;
      }
      case 'reveal': revealedFor = S.gameId; sessionStorage.setItem('tr_revealed', revealedFor); render(); break;
      case 'hide': revealedFor = ''; sessionStorage.removeItem('tr_revealed'); render(); break;
      case 'ready': await act({ type: 'ready' }); break;
      case 'nightGo': {
        const mine = S.night.myPick; const target = nightSel || (mine && mine.target);
        const rec = $('[data-act=rec]') ? $('[data-act=rec]').checked : false;
        await act({ type: 'nightPick', target, recruit: rec }); break;
      }
      case 'recYes': await act({ type: 'recruit', yes: true }); break;
      case 'recNo': await act({ type: 'recruit', yes: false }); break;
      case 'sab': if (confirm('Sabotare la missione? Il premio si dimezza e nessuna saprà che sei stata tu.')) { const r = await act({ type: 'mSabotage' }); if (r.ok) toast('🗡️ Fatto… nessuna ha visto.'); } break;
      case 'ans': { fb = { q: Number(d.q), c: Number(d.c), until: Date.now() + 750 }; render(); const r = await act({ type: 'mAnswer', q: Number(d.q), c: Number(d.c) }); setTimeout(() => { fb = null; render(); }, 800); break; }
      case 'cdl': memTap(Number(d.i)); break;
      case 'gc': gcTap(Number(d.i)); break;
      case 'tready': await act({ type: 'tableReady' }); break;
      case 'voteGo': { const t = voteSel || (S.vote && S.vote.mine); if (t) { const r = await act({ type: 'vote', target: t }); if (r.ok) { voteSel = null; toast('🗳️ Voto registrato'); } } break; }
      case 'nskip': await act({ type: 'skip' }); break;
      case 'next60': await act({ type: 'extend', sec: 60 }); break;
      case 'npause': await act({ type: 'pause' }); break;
      default:
    }
  });

  connect();
})();
