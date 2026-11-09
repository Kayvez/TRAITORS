(() => {
  'use strict';
  const D = window.TDATA;
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sealOf = (id) => D.SEALS.find((s) => s.id === id) || D.SEALS[0];
  // sigillo di ceralacca con il simbolo
  const seal = (id, size, o) => {
    o = o || {};
    const s = sealOf(id);
    return `<span class="seal${o.dead ? ' dead' : ''}${o.cls ? ' ' + o.cls : ''}" style="--c:${s.color};--sz:${size || 64}px"><i>${s.icon}</i></span>`;
  };
  const toast = (msg, bad) => { const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); document.body.append(t); setTimeout(() => t.remove(), 3200); };
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Connessione assente. Riprovo…' }));
  const fmt = (ms) => { ms = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(ms / 60) + ':' + String(ms % 60).padStart(2, '0'); };
  const confetti = (n) => {
    const cols = ['#e2b559', '#f6dc93', '#b3263f', '#fff3d0', '#6aa3b8'];
    for (let i = 0; i < (n || 90); i++) {
      const c = h('div', { class: 'confetti' });
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDuration = 2.6 + Math.random() * 2.4 + 's'; c.style.animationDelay = Math.random() * 1.2 + 's';
      document.body.append(c); setTimeout(() => c.remove(), 7000);
    }
  };
  const rulesModal = (onClose) => {
    let i = 0;
    const box = h('div', { class: 'sheet rules' });
    const m = h('div', { class: 'modal' }, box);
    const draw = () => {
      const r = D.RULES[i];
      box.innerHTML = `<div class="rpage"><div class="ricon">${r.icon}</div><div class="rnum">${i + 1} / ${D.RULES.length}</div><h2>${esc(r.t)}</h2><div class="rtext">${esc(r.x)}</div><div class="rtip">💡 ${esc(r.tip)}</div></div>
        <div class="rdots">${D.RULES.map((_, k) => `<span class="${k === i ? 'on' : ''}" data-i="${k}"></span>`).join('')}</div>
        <div style="display:flex;gap:10px"><button class="btn ghost" data-a="prev" ${i === 0 ? 'disabled' : ''}>◀</button><button class="btn" data-a="next" style="flex:1">${i === D.RULES.length - 1 ? 'Ho capito!' : 'Avanti ▶'}</button></div>`;
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a],[data-i]'); if (!b) return;
      if (b.dataset.i) i = Number(b.dataset.i);
      else if (b.dataset.a === 'prev') i = Math.max(0, i - 1);
      else if (i === D.RULES.length - 1) { m.remove(); if (onClose) onClose(); return; } else i++;
      draw();
    });
    draw(); document.body.append(m);
    return m;
  };
  window.UI = { h, esc, seal, sealOf, toast, post, fmt, confetti, rulesModal };
})();
