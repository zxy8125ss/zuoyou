/* ---------- 学习：单元与课 ---------- */
const MODNAME = {img:'', article:'知识篇章', steps:'时间线', box:'你知道吗', poems:'诗文', points:'要点', route:'路线图', source:'史料研读', events:'相关事件', quiz:'小测', compare:'对比', chart:'数据', map:'地图', think:'思考', cause:'因果', flow:'流程图', table:'对照表', phases:'地图演变', exchange:'关系图', people:'人物群像', spans:'年表'};
const toneCls = t => t === 'cn' || t === 'cn2' ? 'cn' : t === 'w' ? 'w' : 'o';
function geoBase(g){
  return `<rect class="m-sea" width="${g.W}" height="${g.H}"/><path class="m-grat" d="${g.grat}"/><path class="m-land" d="${g.land}"/>`;
}
function layerSVG(L){
  return L.polities.map(p => `<path class="sp t-${p.tone}" d="${p.d}"/>`).join('') +
    L.polities.map(p => `<text class="spl t-${p.tone}" x="${p.l[0]}" y="${p.l[1]}" text-anchor="middle">${p.name}</text>`).join('') +
    L.labels.map(l => `<text class="spl t-o" x="${l.l[0]}" y="${l.l[1]}" text-anchor="middle">${l.t}</text>`).join('');
}
function marksSVG(g){
  return (g.marks || []).map(([x, y, t]) => `<circle class="sc" cx="${x}" cy="${y}" r="3"/><text class="lct" x="${x + 5}" y="${y + 4}">${t}</text>`).join('');
}
function routesSVG(g){
  return (g.routes || []).map((r, i) => `<g class="rt t-${toneCls(m_tone(g, i))}" data-r="${i}"><path class="rl" d="${r.d}" pathLength="1" style="animation-delay:${i * .5}s"/><circle class="re" cx="${r.end[0]}" cy="${r.end[1]}" r="4.5" style="animation-delay:${i * .5 + 1.4}s"/></g>`).join('');
}
function m_tone(g, i){ return (g._tones || [])[i]; }
function spansHTML(m){
  const lo = m.from ?? Math.min(...m.rows.map(r => r[1])), hi = m.to ?? Math.max(...m.rows.map(r => r[2]));
  const span = hi - lo || 1, pc = y => ((y - lo) / span * 100).toFixed(2);
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => span / s <= 5) || 1000;
  const ticks = []; for (let t = Math.ceil(lo / nice) * nice; t <= hi; t += nice) ticks.push(t);
  let h = `<div class="spans">`;
  h += m.rows.map(([n, a, b, tone, note]) => `<div class="sp-r"><div class="sp-n">${esc(n)}<small>${y1(a)}—${y1(b)}</small></div><div class="sp-t">${ticks.map(t => `<i class="sp-g" style="left:${pc(t)}%"></i>`).join('')}<span class="sp-b t-${toneCls(tone)}" style="left:${pc(a)}%;width:${Math.max(1.2, (b - a) / span * 100).toFixed(2)}%"></span>${note ? `<em style="left:${pc(a)}%">${esc(note)}</em>` : ''}</div></div>`).join('');
  h += `<div class="sp-r sp-ax"><div class="sp-n"></div><div class="sp-t">${ticks.map(t => `<span style="left:${pc(t)}%">${y1(t)}</span>`).join('')}</div></div></div>`;
  return h;
}
function modHTML(m, li, mi, side){
  const key = `${li}-${mi}`;
  const k = MODNAME[m.type] || '', tt = (m.title || '').replace(/^(史料研读|本课要点)[：:]?/, '');
  const head = `${k && !tt.includes(k) ? `<div class="mod-k">${k}</div>` : ''}${tt ? `<h3 class="mod-t">${esc(tt)}</h3>` : `<h3 class="mod-t">${k}</h3>`}`;
  const g = m.geo; if (g && m.routes) g._tones = m.routes.map(r => r.tone);
  const qc = side === 'world' ? 'w' : 'cn';
  switch (m.type) {
  case 'points': return `${head}<ul class="pts">${m.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  case 'route': {
    let h = head + (m.desc ? `<p class="mod-d">${esc(m.desc)}</p>` : '');
    if (m.tabs) h += `<div class="chips rtabs"><button class="chip rtab on" data-act="rtab" data-v="all">全部</button>${m.routes.map((r, i) => `<button class="chip rtab" data-act="rtab" data-v="${i}">${esc(r.name.replace(/（.*）/, ''))}</button>`).join('')}</div>`;
    h += `<div class="lmapw"><svg viewBox="0 0 ${g.W} ${g.H}" class="lmap go">${geoBase(g)}${routesSVG(g)}${marksSVG(g)}</svg><button class="replay" data-act="replay" aria-label="重播">↻</button></div>`;
    h += `<div class="legend">${m.routes.map(r => `<span class="lg t-${toneCls(r.tone)}"><i></i>${esc(r.name)}</span>`).join('')}</div>`;
    h += m.routes.map((r, i) => r.note ? `<p class="rnote" data-r="${i}" ${m.tabs ? 'hidden' : ''}>${m.tabs ? '' : `<b>${esc(r.name.replace(/（.*）/, ''))}：</b>`}${esc(r.note)}</p>` : '').join('');
    return h;
  }
  case 'map': return head + (m.desc ? `<p class="mod-d">${esc(m.desc)}</p>` : '') + `<div class="lmapw"><svg viewBox="0 0 ${g.W} ${g.H}" class="lmap">${geoBase(g)}${layerSVG(g.layers[0])}${marksSVG(g)}</svg></div>` +
      (m.table ? `<div class="tbl"><table><tbody>${m.table.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>` : '');
  case 'phases': return head + `<div class="phase-btns">${m.steps.map((s, i) => `<button class="chip ${i ? '' : 'on'}" data-act="step" data-v="${i}">${y1(s[0])}</button>`).join('')}</div>` +
      `<div class="lmapw"><svg viewBox="0 0 ${g.W} ${g.H}" class="lmap">${geoBase(g)}${g.layers.map((L, i) => `<g class="ly" data-i="${i}" ${i ? 'style="display:none"' : ''}>${layerSVG(L)}</g>`).join('')}${marksSVG(g)}</svg></div>` +
      `<p class="cap">${m.steps.map((s, i) => `<span data-i="${i}" ${i ? 'hidden' : ''}>${esc(s[1])}</span>`).join('')}</p>`;
  case 'chart': {
    const max = Math.max(...m.data.map(d => d[2])), W = 340, H = 180, bw = W / m.data.length;
    let svg = `<svg viewBox="0 0 ${W} ${H + 40}" class="chart">`;
    m.data.forEach(([x, lab, v], i) => {
      const h = v / max * H, cx = i * bw + bw / 2;
      svg += `<rect x="${cx - bw * .3}" y="${H - h + 16}" width="${bw * .6}" height="${h}" rx="4" class="bar${v === max ? ' top' : ''}"/>` +
        `<text x="${cx}" y="${H - h + 10}" text-anchor="middle" class="bv">${v}</text>` +
        `<text x="${cx}" y="${H + 30}" text-anchor="middle" class="bx">${x}</text><text x="${cx}" y="${H + 42}" text-anchor="middle" class="bl">${lab}</text>`;
    });
    svg += `</svg>`;
    return head + `<div class="chart-u">单位：${esc(m.unit)}</div>${svg}<p class="mod-note">${esc(m.note)}</p><p class="mod-src">资料：${esc(m.src)}</p>`;
  }
  case 'compare': case 'table': {
    const cols = m.type === 'compare' ? ['', ...m.cols] : m.cols;
    return head + `<div class="tbl"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${m.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>` + (m.note ? `<p class="mod-note">${esc(m.note)}</p>` : '');
  }
  case 'flow': return head + `<div class="flow">${m.steps.map(([n, d], i) => `${i ? '<div class="fa">↓</div>' : ''}<div class="fs${i === (m.key ?? 2) ? ' key' : ''}"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join('')}${m.tail ? `<div class="fa">↓</div><div class="ftail">${m.tail.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</div>${m.note ? `<p class="mod-note">${esc(m.note)}</p>` : ''}`;
  case 'cause': return head + `<div class="cz"><div class="cz-h">原因</div><ul>${m.causes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div><div class="fa">↓</div><div class="cz-e">${esc(m.event)}</div><div class="fa">↓</div><div class="cz eff"><div class="cz-h">影响</div><ul>${m.effects.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`;
  case 'exchange': return head + `<div class="xc"><div class="xn">${esc(m.a)}</div><div class="xm"><div class="xr"><span class="xl">→ ${esc(m.abl || '给予')}</span>${m.ab.map(x => `<p>${esc(x)}</p>`).join('')}</div><div class="xr back"><span class="xl">← ${esc(m.bal || '回报')}</span>${m.ba.map(x => `<p>${esc(x)}</p>`).join('')}</div></div><div class="xn">${esc(m.b)}</div></div>${m.note ? `<p class="mod-note">${esc(m.note)}</p>` : ''}`;
  case 'source': case 'think': {
    const mine = store.get('note.' + key, '');
    let h = head;
    if (m.type === 'source') h += `<figure class="s-quote ${qc}"><blockquote>${esc(m.text)}</blockquote><figcaption>${esc(m.src)}</figcaption></figure>${m.plain ? `<button class="link" data-act="plain">看白话</button><p class="plain" hidden>${esc(m.plain)}</p>` : ''}`;
    h += `<p class="ask">${esc(m.q)}</p><textarea class="mine" data-key="${key}" placeholder="先写下你的看法（只保存在本机）" rows="3">${esc(mine)}</textarea>`;
    h += `<button class="btn reveal-btn" data-act="reveal">看分析</button><div class="ans" hidden><b>参考分析</b><p>${esc(m.a)}</p>${m.src && m.type === 'think' ? `<p class="mod-src">${esc(m.src)}</p>` : ''}</div>`;
    return h;
  }
  case 'img': return imgHTML(m.key);
  case 'article': return head + m.sections.map(s => `<div class="art">${s.h ? `<h4>${esc(s.h)}</h4>` : ''}${s.p.map(p => `<p>${esc(p)}</p>`).join('')}${s.img ? imgHTML(s.img, true) : ''}${s.quote ? `<figure class="s-quote ${qc}"><blockquote>${esc(s.quote.t)}</blockquote><figcaption>${esc(s.quote.src)}</figcaption></figure>` : ''}</div>`).join('');
  case 'steps': return head + `<ol class="tsteps">${m.items.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>` + (m.src ? `<p class="mod-src">${esc(m.src)}</p>` : '');
  case 'box': return head + `<ul class="pts">${m.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  case 'poems': return head + m.items.map(p => `<div class="poem"><blockquote>${esc(p.t)}</blockquote><cite>${esc(p.src)}</cite><p>${esc(p.tells)}</p></div>`).join('');
  case 'people': return head + (m.desc ? `<p class="mod-d">${esc(m.desc)}</p>` : '') + `<div class="pcards">${m.ids.map(id => D.pp[id]).filter(Boolean).map(p => `<button class="pcard ${sc(p.side)}" data-person="${p.id}"><div class="pc-top"><span class="pc-n">${esc(p.name)}</span><span class="pc-y">${lifeSpan(p)}</span></div><div class="pc-o">${esc(p.role)} · ${esc(p.oneline)}</div></button>`).join('')}</div>`;
  case 'spans': return head + (m.desc ? `<p class="mod-d">${esc(m.desc)}</p>` : '') + spansHTML(m) + (m.note ? `<p class="mod-note">${esc(m.note)}</p>` : '');
  case 'events': return head + `<div class="same">${m.ids.map(id => D.ev[id]).filter(Boolean).map(o => evRow(o)).join('')}</div>`;
  case 'quiz': return `<div class="mod-k">本课小测</div>` + m.items.map((q, qi) => `<div class="lq" data-ans="${q.ans}"><p class="q-p sm">${qi + 1}. ${esc(q.q)}</p><div class="q-opts">${q.opts.map((o, k) => `<button class="q-o" data-act="lq" data-v="${qi}:${k}">${esc(o)}</button>`).join('')}</div><div class="q-fb" hidden><b></b>${esc(q.exp)}</div></div>`).join('');
  }
  return '';
}
function imgHTML(key, inline){
  const im = D.images[key]; if (!im) return '';
  return `<figure class="photo${inline ? ' in' : ''}"><img src="${im.file}" alt="${esc(im.cap)}" loading="lazy" decoding="async" width="${im.w || ''}" height="${im.h || ''}"><figcaption>${esc(im.cap)}<small><a href="${im.page}" target="_blank" rel="noopener">${esc(im.credit)}</a></small></figcaption></figure>`;
}
function setStep(box, i){
  box.querySelectorAll('.phase-btns .chip').forEach((b, k) => b.classList.toggle('on', k === i));
  box.querySelectorAll('.ly').forEach((g, k) => g.style.display = k === i ? '' : 'none');
  box.querySelectorAll('.cap span').forEach((s, k) => s.hidden = k !== i);
}
function loadUnit(pid){
  if (!D.units[pid]) D.units[pid] = fetch(`data/units/${pid}.json`).then(r => { if (!r.ok) throw 0; return r.json(); }).then(u => {
    u.lessons.forEach(l => { l.unit = pid; D.lessons[l.id] = l; }); D.unitd[pid] = u; return u;
  }).catch(e => { delete D.units[pid]; throw e; });
  return D.units[pid];
}
const sideCls = s => s === 'cn' ? 'cn' : s === 'world' ? 'w' : '';
const sideTxt = s => s === 'cn' ? '中国' : s === 'world' ? '世界' : '中外';
function lessonCard(l){
  return `<button class="lcard ${S.done.has(l.id) ? 'done' : ''}" data-act="lesson" data-v="${l.id}"><span class="lc-no ${sideCls(l.side)}">${l.special ? '专' : l.no}</span><span class="lc-m"><b>${esc(l.title)}</b><small>${(l.kinds || []).join(' · ')}</small></span><span class="lc-ok">${S.done.has(l.id) ? '✓' : ''}</span></button>`;
}
function renderUnits(){
  const ps = D.periods.filter(p => p.unit);
  const total = ps.reduce((a, p) => a + p.unit.lessons.length, 0), done = ps.reduce((a, p) => a + p.unit.lessons.filter(l => S.done.has(l.id)).length, 0);
  const last = store.get('last', null), lp = last && D.lessonPid[last];
  let h = `<div class="page"><div class="unit card hero"><h2 class="u-t">从五千年前到今天</h2><p class="u-lead">十个时期，每个时期一个单元：先读几课大事，再看专题篇章，最后用小测检验。左边是中国，右边是世界。</p><div class="u-prog"><div class="pbar"><i style="width:${total ? done / total * 100 : 0}%"></i></div><span>已学 ${done} / ${total} 课</span></div></div>`;
  if (lp) { const l = D.periods.find(p => p.id === lp).unit.lessons.find(x => x.id === last); if (l) h += `<div class="lg-h">继续学习</div><button class="lcard" data-act="resume" data-v="${last}"><span class="lc-no ${sideCls(l.side)}">${l.special ? '专' : l.no}</span><span class="lc-m"><b>${esc(l.title)}</b><small>${esc(D.per[lp].name)}单元</small></span><span class="lc-ok">›</span></button>`; }
  h += `<div class="lg-h">十个单元</div><div class="units">`;
  h += ps.map((p, i) => {
    const L = p.unit.lessons, n = L.filter(l => S.done.has(l.id)).length;
    return `<button class="ucard" data-act="unit" data-v="${p.id}"><span class="uc-i">${i + 1}</span><span class="uc-m"><span class="uc-top"><b>${esc(p.name)}</b><small>${y1(p.start)}—${p.id === 'xiandai' ? '今' : y1(p.end)}</small></span><span class="uc-t">${esc(p.unit.title.split('：').pop())}</span><span class="uc-p"><span class="pbar"><i style="width:${n / L.length * 100}%"></i></span><small>${n} / ${L.length}</small></span></span></button>`;
  }).join('') + `</div>`;
  h += `<div class="lg-h">练习</div><button class="lcard" data-act="learnQuiz" data-v="all"><span class="lc-no">测</span><span class="lc-m"><b>综合自测 10 题</b><small>可选全部时期、某一时期或只考收藏</small></span><span class="lc-ok">›</span></button></div>`;
  $('#view').innerHTML = h;
}
function renderUnit(u, p){
  const L = u.lessons, n = L.filter(l => S.done.has(l.id)).length;
  const i = D.periods.indexOf(p), prev = D.periods[i - 1], next = D.periods[i + 1];
  let h = `<div class="crumb"><button data-act="units">‹ 全部单元</button><span>第 ${i + 1} 单元</span></div><div class="page"><div class="unit card"><div class="u-years">${esc(u.years)}</div><h2 class="u-t">${esc(u.title)}</h2><p class="u-lead">${esc(u.lead)}</p><div class="u-prog"><div class="pbar"><i style="width:${n / L.length * 100}%"></i></div><span>已学 ${n} / ${L.length}</span></div>${u.ref ? `<p class="u-ref">${esc(u.ref)}</p>` : ''}</div>`;
  const group = (title, arr) => arr.length ? `<div class="lg-h">${title}</div>` + arr.map(l => lessonCard({...l, kinds: [...new Set(l.modules.map(m => MODNAME[m.type]).filter(k => k && !['要点','相关事件','小测'].includes(k)))].slice(0, 3)})).join('') : '';
  h += group('中国史', L.filter(l => l.side === 'cn' && !l.special));
  h += group('中外交流', L.filter(l => l.side === 'both' && !l.special));
  h += group('世界史', L.filter(l => l.side === 'world' && !l.special));
  h += group('专题篇章', L.filter(l => l.special));
  h += `<div class="lg-h">练习与工具</div><button class="lcard" data-act="learnQuiz" data-v="${p.id}"><span class="lc-no">测</span><span class="lc-m"><b>本单元自测 10 题</b><small>${p.n.events} 个事件随机出题</small></span><span class="lc-ok">›</span></button>`;
  h += `<button class="lcard" data-act="goSlice" data-v="${p.rep}"><span class="lc-no w">切</span><span class="lc-m"><b>用年份切片看这个时期</b><small>拖动年份，看各国疆域和在世人物</small></span><span class="lc-ok">›</span></button>`;
  h += `<div class="s-actions">${prev ? `<button class="btn" data-act="unit" data-v="${prev.id}">‹ ${esc(prev.name)}</button>` : '<span></span>'}${next ? `<button class="btn" data-act="unit" data-v="${next.id}">${esc(next.name)} ›</button>` : '<span></span>'}</div></div>`;
  $('#view').innerHTML = h;
}
function renderLesson(u, l){
  const ids = u.lessons.map(x => x.id), i = ids.indexOf(l.id), p = D.per[l.unit];
  const tag = l.special ? '专题' : `第 ${l.no} 课`;
  let h = `<div class="crumb"><button data-act="learnHome">‹ ${esc(p.name)}单元</button><span>${i + 1} / ${ids.length}</span></div><div class="page lesson">
    <div class="ls-tag ${sideCls(l.side)}">${tag} · ${sideTxt(l.side)}</div><h2 class="page-h ls-h">${esc(l.title)}</h2><p class="ls-lead">${esc(l.lead)}</p>`;
  h += l.modules.map((m, mi) => { const x = modHTML(m, l.id, mi, l.side); return x ? `<section class="mod card m-${m.type}">${x}</section>` : ''; }).join('');
  h += `<div class="s-actions"><button class="btn" data-act="learnHome">返回单元</button><button class="btn pri" data-act="lessonDone" data-v="${l.id}">${S.done.has(l.id) ? '已学完 · 下一课' : '学完这一课 ✓'}</button></div></div>`;
  $('#view').innerHTML = h;
  document.querySelectorAll('textarea.mine').forEach(ta => ta.addEventListener('input', () => store.set('note.' + ta.dataset.key, ta.value)));
}
async function renderLearn(){
  if (S.learnView === 'quiz') { renderQuiz(); $('#view').insertAdjacentHTML('afterbegin', `<div class="crumb"><button data-act="learnHome">‹ 返回</button></div>`); return; }
  if ((S.learnView === 'unit' || S.learnView === 'lesson') && D.per[S.unit]) {
    const pid = S.unit;
    if (!D.unitd[pid]) $('#view').innerHTML = `<p class="empty">正在加载${esc(D.per[pid].name)}单元…</p>`;
    let u; try { u = await loadUnit(pid); } catch (e) { $('#view').innerHTML = `<p class="empty">加载失败，请检查网络后重试</p>`; return; }
    if (S.tab !== 'learn' || S.unit !== pid) return;
    if (S.learnView === 'lesson' && D.lessons[S.lesson]) return renderLesson(u, D.lessons[S.lesson]);
    S.learnView = 'unit'; return renderUnit(u, D.per[pid]);
  }
  S.learnView = 'home'; renderUnits();
}

/* ---------- 年份切片 ---------- */
const activeAt = (y, o) => (o.start == null || o.start <= y) && (o.end == null || y <= o.end);
const evActive = (e, y) => e.endYear && e.year < y && y <= e.endYear;
const periodOf = y => D.periods.find(p => y >= p.start && y <= p.end) || (y < D.periods[0].start ? D.periods[0] : D.periods[D.periods.length - 1]);
const curP = () => D.per[S.slicePid] || periodOf(S.year);
const curStep = () => curP().step || 1;
function winOf(y){ const s = curStep(), lo = y - Math.floor((s - 1) / 2); return [lo, lo + s - 1]; }
function loadSlice(pid){
  if (!D.sm[pid]) D.sm[pid] = fetch(`data/slice/${pid}.json`).then(r => { if (!r.ok) throw 0; return r.json(); }).then(x => (D.smd[pid] = x)).catch(e => { delete D.sm[pid]; throw e; });
  return D.sm[pid];
}
function rulerAt(state, y){
  const rs = D.rulers.filter(r => r.state === state && r.start <= y && y <= r.end);
  return rs.sort((a,b) => b.start - a.start)[0];
}
function reignText(r, y){
  if (!r) return '';
  const n = y - r.start + 1;
  return `${r.name} · ${n === 1 ? '即位之年' : (r.approx ? '约' : '') + '在位第 ' + n + ' 年'}`;
}
function sliceSVG(y, big){
  const m = D.smd[curP().id]; if (!m) return '';
  const [lo, hi] = winOf(y);
  const ps = m.polities.filter(p => activeAt(y, p));
  const evs = D.events.filter(e => m.ev[e.id] && (e.year >= lo && e.year <= hi || evActive(e, y)));
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.W} ${m.H}" class="smap${big ? ' big' : ''}">`;
  g += `<rect class="m-sea" width="${m.W}" height="${m.H}"/><path class="m-grat" d="${m.grat}"/><path class="m-land" d="${m.base}"/>`;
  g += ps.map(p => `<path class="sp t-${p.tone}" d="${p.d}"/>`).join('');
  g += ps.map(p => `<text class="spl t-${p.tone}" x="${p.l[0]}" y="${p.l[1]}" text-anchor="middle">${p.name}</text>` + (p.sub ? `<text class="spl t-${p.tone} s" x="${p.sub.l[0]}" y="${p.sub.l[1]}" text-anchor="middle">${p.sub.t}</text>` : '')).join('');
  g += m.labels.filter(l => activeAt(y, l)).map(l => `<text class="spl t-o" x="${l.l[0]}" y="${l.l[1]}" text-anchor="middle">${l.t}</text>`).join('');
  g += m.cities.filter(c => activeAt(y, c)).map(c => `<circle class="sc${c.cap ? ' cap' : ''}" cx="${c.p[0]}" cy="${c.p[1]}" r="${c.cap ? 2.2 : 1.7}"/><text class="sct" x="${c.p[0] + (c.dx ?? 3)}" y="${c.p[1] + (c.dy ?? 3)}"${(c.dx ?? 3) < 0 ? ' text-anchor="end"' : ''}>${c.t}</text>`).join('');
  g += evs.map(e => { const [x, yy] = m.ev[e.id]; const now = e.year >= lo && e.year <= hi; return `<g class="spin ${sc(e.side)}${now ? '' : ' on'}" data-ev="${e.id}">${now ? `<circle class="halo" cx="${x}" cy="${yy}" r="7"/>` : ''}<circle cx="${x}" cy="${yy}" r="${now ? 3.6 : 2.6}"/></g>`; }).join('');
  return g + `</svg>`;
}
function sliceBody(y){
  const [lo, hi] = winOf(y), P = curP();
  const now = D.events.filter(e => e.year >= lo && e.year <= hi), ongoing = D.events.filter(e => evActive(e, y) && !(e.year >= lo && e.year <= hi));
  const lab = lo === hi ? '这一年' : `${y1(lo)}—${y1(hi)}年`;
  let h = `<section class="sl-sec"><h3>${lab} <small>${now.length ? now.length + ' 件大事' : '无收录大事'}</small></h3>`;
  if (now.length) h += `<div class="sl-evs">${now.map(e => `<button class="sl-ev ${sc(e.side)}" data-ev="${e.id}"><span class="sl-side">${e.side === 'cn' ? '中国' : (e.region || []).map(r => REGIONS[r]).join('、')}${lo !== hi ? ' · ' + yLabel(e) : ''}</span><b>${esc(e.title)}</b><span class="sl-sum">${esc(e.summary)}</span>${e.impact ? `<span class="sl-imp">影响：${esc(e.impact.slice(0, 58))}…</span>` : ''}</button>`).join('')}</div>`;
  else {
    const before = [...D.events].reverse().find(e => e.year < lo), after = D.events.find(e => e.year > hi);
    h += `<div class="sl-near">${before ? `<button data-act="goSlice" data-v="${before.year}"><span>${lo - before.year} 年前 · ${yLabel(before)}</span>${esc(before.title)}</button>` : ''}${after ? `<button data-act="goSlice" data-v="${after.year}"><span>${after.year - hi} 年后 · ${yLabel(after)}</span>${esc(after.title)}</button>` : ''}</div>`;
  }
  if (ongoing.length) h += `<div class="sl-on"><div class="sl-lab">仍在进行</div>${ongoing.map(e => `<button class="sl-chip ${sc(e.side)}" data-ev="${e.id}">${esc(e.title)}<small>${y1(e.year)}—${y1(e.endYear)}，第 ${y - e.year + 1} 年</small></button>`).join('')}</div>`;
  h += `</section>`;
  const m = D.smd[P.id], seen = new Set(), rows = [];
  for (const p of m.polities.filter(p => activeAt(y, p))) { if (seen.has(p.state)) continue; seen.add(p.state); rows.push(p); }
  h += `<section class="sl-sec"><h3>此刻的世界 <small>${rows.length} 个主要政权</small></h3><div class="sl-states">`;
  h += rows.map(p => { const r = rulerAt(p.state, y); return `<div class="st-row"><i class="dot t-${p.tone}"></i><b>${p.name}</b><span>${r ? esc(reignText(r, y)) : esc(p.desc || '')}</span></div>`; }).join('');
  h += `</div><p class="sl-note">疆域为示意，不代表精确边界</p></section>`;
  const alive = D.people.filter(p => p.birth <= y && y <= p.death).sort((a, b) => (a.side > b.side ? 1 : a.side < b.side ? -1 : a.birth - b.birth));
  h += `<section class="sl-sec"><h3>此刻在世 <small>${alive.length} 位人物库人物</small></h3>`;
  h += alive.length ? `<div class="pchips">${alive.map(p => `<button class="pchip ${sc(p.side)}" data-person="${p.id}">${esc(p.name.replace(/（.*）/, ''))}<small>${p.approx ? '约' : ''}${y - p.birth} 岁</small></button>`).join('')}</div>` : `<p class="center" style="font-size:13px">人物库中暂无此时在世的人</p>`;
  return h + `</section>`;
}
function sliceHead(y){
  const rs = D.rulers.filter(r => r.cn && r.start <= y && y <= r.end).sort((a, b) => b.start - a.start);
  const r = rs[0];
  return `<div class="yr-big">${y < 0 ? '<span>前</span>' : ''}<b>${Math.abs(y)}</b><span>年</span></div><div class="yr-sub">${r ? esc(reignText(r, y)) : ''}</div>`;
}
async function renderSlice(){
  const P = periodOf(S.year); if (!S.slicePid || !D.per[S.slicePid] || S.year < D.per[S.slicePid].start || S.year > D.per[S.slicePid].end) S.slicePid = P.id;
  const p = curP();
  if (!D.smd[p.id]) { $('#view').innerHTML = `<p class="empty">正在加载${esc(p.name)}地图…</p>`; try { await loadSlice(p.id); } catch (e) { $('#view').innerHTML = `<p class="empty">加载失败，请检查网络后重试</p>`; return; } if (S.tab !== 'slice') return; }
  const y = S.year, span = p.end - p.start || 1, st = p.step || 1;
  const tick = D.events.filter(e => e.period === p.id).map(e => `<i class="${sc(e.side)}" style="left:${((e.year - p.start) / span * 100).toFixed(2)}%"></i>`).join('');
  $('#view').innerHTML = `<div class="sl-top">
      <div class="chips sl-pc" id="sl-pc">${D.periods.map(q => `<button class="chip ${q.id === p.id ? 'cn on' : ''}" data-act="spd" data-v="${q.id}">${q.name}</button>`).join('')}</div>
      <div class="sl-head" id="sl-head">${sliceHead(y)}</div>
      <div class="sl-track"><div class="sl-ticks">${tick}</div><input type="range" id="sl-range" min="${p.start}" max="${p.end}" step="1" value="${y}" aria-label="年份"></div>
      <div class="sl-ends"><span>${y1(p.start)}</span><span>${p.id === 'xiandai' ? '今' : y1(p.end)}</span></div>
    </div>
    <div class="sl-btns"><button data-act="yjump" data-v="-1" aria-label="上一个事件">‹ 上一事件</button><button data-act="ystep" data-v="-1" aria-label="向前">−${st}</button><button data-act="yplay" class="play" id="sl-play">${S.playing ? '暂停' : '▶ 播放'}</button><button data-act="ystep" data-v="1" aria-label="向后">+${st}</button><button data-act="yjump" data-v="1" aria-label="下一个事件">下一事件 ›</button></div>
    <div class="sl-mapwrap"><div class="sl-map" id="sl-map">${sliceSVG(y)}</div><button class="sl-full" data-map="slice" aria-label="全屏查看地图">⤢</button></div>
    <div class="sl-body" id="sl-body">${sliceBody(y)}</div>`;
  const r = $('#sl-range');
  r.addEventListener('input', () => { stopPlay(); setYear(+r.value, true); });
  const pc = $('#sl-pc'), on = pc.querySelector('.on'); if (on) pc.scrollLeft = on.offsetLeft - pc.clientWidth / 2 + on.offsetWidth / 2;
  centerMap();
}
let _raf = 0;
function setYear(y, fromRange){
  const p = curP();
  if (y < p.start || y > p.end) { S.year = y; S.slicePid = periodOf(y).id; store.set('year', y); if (S.tab === 'slice') { stopPlay(); renderSlice(); } return; }
  S.year = y; store.set('year', y);
  if (S.tab !== 'slice') return;
  cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => {
    $('#sl-head').innerHTML = sliceHead(y);
    if (!fromRange) $('#sl-range').value = y;
    const box = $('#sl-map'), sx = box.scrollLeft;
    box.innerHTML = sliceSVG(y); box.scrollLeft = sx;
    $('#sl-body').innerHTML = sliceBody(y);
    centerMap(true);
  });
}
function centerMap(smooth){
  const box = $('#sl-map'); if (!box) return;
  const m = D.smd[curP().id]; if (!m) return;
  const [lo, hi] = winOf(S.year), w = box.scrollWidth;
  const pins = D.events.filter(e => e.year >= lo && e.year <= hi && m.ev[e.id]).map(e => m.ev[e.id][0]);
  if (smooth && !pins.length) return;
  const cx = pins.length ? (Math.min(...pins) + Math.max(...pins)) / 2 : m.W * (m.cx ?? 0.62);
  box.scrollTo({left: cx / m.W * w - box.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto'});
}
function startPlay(){
  const p = curP();
  if (S.year >= p.end) setYear(p.start);
  S.playing = setInterval(() => { const q = curP(); if (S.year + curStep() > q.end) return stopPlay(); setYear(S.year + curStep()); }, 360);
  const b = $('#sl-play'); if (b) b.textContent = '暂停';
}
function stopPlay(){
  if (S.playing) clearInterval(S.playing); S.playing = null;
  const b = $('#sl-play'); if (b) b.textContent = '▶ 播放';
}

boot();
