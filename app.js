'use strict';
const VERSION = '0.2.0';
const REGIONS = {europe:'欧洲',westasia:'西亚北非',southasia:'南亚·东南亚',eastasia:'东亚（除中国）',america:'美洲',africa:'撒哈拉以南非洲',oceania:'大洋洲'};
const QTYPE = {order:'谁先谁后',year:'年份',person:'人物配对',same:'同时代判断',cause:'前因后果'};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem('zy.' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('zy.' + k, JSON.stringify(v)); }catch(e){} }
};

const D = {events:[], people:[], periods:[], rulers:[], sm:null, ev:{}, pp:{}, per:{}, maps:{}, effects:{}, links:{}};
const S = {
  tab:'slice', year: store.get('year', 755), playing:null, mode: store.get('mode','both'), regions: new Set(store.get('regions', [])), person:null,
  fav: new Set(store.get('fav', [])), seen: new Set(store.get('seen', [])),
  quiz:null, pFilter:{side:'all', role:'all'}, qScope:'all'
};
const saveSets = () => { store.set('fav',[...S.fav]); store.set('seen',[...S.seen]); };

/* ---------- formatting ---------- */
const y1 = y => y < 0 ? '前' + (-y) : String(y);
const yLabel = e => (e.approx ? '约' : '') + y1(e.year);
const yRange = e => (e.approx ? '约' : '') + (e.endYear ? `${y1(e.year)}—${y1(e.endYear)}年` : `${y1(e.year)}年`);
const lifeSpan = p => `${p.approx ? '约' : ''}${y1(p.birth)}—${y1(p.death)}`;
const sideName = e => e.side === 'cn' ? '中国史' : '世界史 · ' + (e.region || []).map(r => REGIONS[r]).join('、');
const sc = side => side === 'cn' ? 'cn' : 'w';

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- boot ---------- */
async function boot(){
  const [events, people, periods, rulers, sm] = await Promise.all(['events','people','periods','rulers','slice-map'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
  events.sort((a,b) => a.year - b.year || (a.side < b.side ? -1 : 1));
  Object.assign(D, {events, people, periods, rulers, sm});
  for (const e of events) {
    (e.causes || []).forEach(c => (D.effects[c] = D.effects[c] || []).push(e.id));
    (e.links || []).forEach(l => {
      (D.links[e.id] = D.links[e.id] || []).push(l);
      (D.links[l.id] = D.links[l.id] || []).push({id: e.id, n: l.n});
    });
  }
  events.forEach(e => D.ev[e.id] = e);
  people.forEach(p => D.pp[p.id] = p);
  periods.forEach(p => D.per[p.id] = p);
  bindChrome();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !navigator.serviceWorker.controller) return;
      reloaded = true; location.reload();
    });
  }
}

function bindChrome(){
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    stopPlay(); S.tab = b.dataset.tab; render(); window.scrollTo(0,0);
  });
  $('#sheet').addEventListener('click', e => { if (e.target.hasAttribute('data-close')) closeSheet(); });
  $('#btn-search').addEventListener('click', openSearch);
  $('#search-close').addEventListener('click', () => $('#search').hidden = true);
  $('#search-input').addEventListener('input', e => renderSearch(e.target.value.trim()));
  $('#map-close').addEventListener('click', () => { $('#mapview').hidden = true; document.body.style.overflow=''; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); $('#search').hidden = true; $('#mapview').hidden = true; } });
  document.addEventListener('click', delegated);
}

/* one delegated handler for data-* actions anywhere */
function delegated(e){
  const t = e.target.closest('[data-ev],[data-person],[data-map],[data-act]');
  if (!t) return;
  if (t.dataset.ev) { openEvent(t.dataset.ev); return; }
  if (t.dataset.person) { openPerson(t.dataset.person); return; }
  if (t.dataset.map) { t.dataset.map === 'slice' ? showMap(sliceSVG(S.year, true), S.year + '年的世界（示意）') : openMap(t.dataset.map, t.dataset.title); return; }
  const a = t.dataset.act, v = t.dataset.v;
  const acts = {
    mode(){ switchMode(v); },
    ystep(){ stopPlay(); setYear(S.year + +v); },
    yjump(){ stopPlay(); const ys = [...new Set(D.events.map(e => e.year))]; const y = +v > 0 ? ys.find(y => y > S.year) : [...ys].reverse().find(y => y < S.year); if (y != null) setYear(y); },
    yplay(){ S.playing ? stopPlay() : startPlay(); },
    goSlice(){ closeSheet(); $('#search').hidden = true; stopPlay(); S.tab = 'slice'; S.year = +v; store.set('year', S.year); render(); window.scrollTo(0,0); },
    period(){ jumpPeriod(v); },
    region(){ S.regions.has(v) ? S.regions.delete(v) : S.regions.add(v); store.set('regions',[...S.regions]); keepPos(renderTimeline); },
    regionAll(){ S.regions.clear(); store.set('regions',[]); keepPos(renderTimeline); },
    clearPerson(){ S.person = null; renderTimeline(); },
    fav(){ toggleFav(v); t.classList.toggle('fav-on', S.fav.has(v)); t.textContent = S.fav.has(v) ? '★ 已收藏' : '☆ 收藏'; },
    locate(){ closeSheet(); $('#search').hidden = true; locate(v); },
    onlyPerson(){ closeSheet(); $('#search').hidden = true; S.person = v; S.tab = 'timeline'; render(); window.scrollTo(0,0); },
    pside(){ S.pFilter.side = v; renderPeople(); },
    prole(){ S.pFilter.role = v; renderPeople(); },
    qscope(){ S.qScope = v; renderQuiz(); },
    qstart(){ startQuiz(); },
    qans(){ answerQuiz(+v); },
    qnext(){ S.quiz.i++; S.quiz.picked = null; renderQuiz(); window.scrollTo(0,0); },
    qquit(){ S.quiz = null; renderQuiz(); },
    reset(){ if (confirm('清除收藏、浏览进度和自测记录？')) { ['fav','seen','qstat','qhist'].forEach(k => store.set(k, k==='qstat'?{}:[])); S.fav.clear(); S.seen.clear(); renderMe(); toast('已清除'); } },
    update(){ checkUpdate(); }
  };
  if (acts[a]) acts[a]();
}

function render(){
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  ({slice:renderSlice, timeline:renderTimeline, people:renderPeople, quiz:renderQuiz, me:renderMe})[S.tab]();
}

/* ---------- timeline ---------- */
function filteredEvents(){
  return D.events.filter(e => {
    if (S.person && !(e.people || []).includes(S.person)) return false;
    if (S.mode === 'cn' && e.side !== 'cn') return false;
    if (S.mode === 'world') {
      if (e.side !== 'world') return false;
      if (S.regions.size && !(e.region || []).some(r => S.regions.has(r))) return false;
    }
    return true;
  });
}

function evCard(e, single){
  const cls = ['ev', 'i' + (e.importance || 1), S.seen.has(e.id) ? 'seen' : ''].join(' ');
  const star = S.fav.has(e.id) ? '<i class="star">★</i>' : '';
  if (!single) {
    const meta = e.endYear ? `<div class="ev-m">至${y1(e.endYear)}年</div>` : '';
    return `<button class="${cls}" data-ev="${e.id}">${star}<div class="ev-t">${esc(e.title)}</div>${meta}</button>`;
  }
  const tags = [];
  if (e.endYear) tags.push(`<span class="tag">${y1(e.year)}—${y1(e.endYear)}</span>`);
  if (e.side === 'world') (e.region || []).forEach(r => tags.push(`<span class="tag w">${REGIONS[r]}</span>`));
  if (e.place) tags.push(`<span class="tag">${esc(e.place)}</span>`);
  return `<button class="${cls}" data-ev="${e.id}">${star}<div class="ev-t">${esc(e.title)}</div><div class="ev-s">${esc(e.summary)}</div><div class="tags">${tags.join('')}</div></button>`;
}

function renderTimeline(){
  const m = S.mode;
  let h = `<div class="controls"><div class="seg">
    <button data-act="mode" data-v="both" class="${m==='both'?'on':''}">中外对照</button>
    <button data-act="mode" data-v="cn" data-mode="cn" class="${m==='cn'?'on':''}">只看中国</button>
    <button data-act="mode" data-v="world" data-mode="world" class="${m==='world'?'on':''}">只看世界</button></div>
    <div class="chips" id="pchips">${D.periods.map(p => `<button class="chip ${p.ready?'cn on':'dim'}" data-act="period" data-v="${p.id}">${p.name}</button>`).join('')}</div>`;
  if (m === 'world') {
    h += `<div class="chips"><button class="chip w ${S.regions.size?'':'on'}" data-act="regionAll">全部地区</button>${
      Object.entries(REGIONS).map(([k,v]) => `<button class="chip w ${S.regions.has(k)?'on':''}" data-act="region" data-v="${k}">${v}</button>`).join('')}</div>`;
  }
  if (S.person) h += `<div class="banner"><span>只显示与「${esc(D.pp[S.person].name)}」相关的事件</span><button data-act="clearPerson">显示全部</button></div>`;
  h += `</div><div class="tl ${m==='both'?'both':'single ' + m}">`;

  const evs = filteredEvents();
  for (const p of D.periods.filter(p => p.ready)) {
    const pe = evs.filter(e => e.period === p.id);
    h += `<section class="period" id="p-${p.id}"><div class="period-head">
      <div class="ph-top"><span class="ph-name">${p.name}</span><span class="ph-years">${y1(p.start)}—${y1(p.end)}年</span></div>
      <div class="ph-world">同期世界：${p.world}</div>
      <div class="maps">
        <button class="map-thumb cn" data-map="cn-${p.id}" data-title="${p.name}·中国形势示意"><div class="mt" data-src="cn-${p.id}"></div><span>中国地图</span></button>
        <button class="map-thumb w" data-map="w-${p.id}" data-title="${p.name}·同期世界示意"><div class="mt" data-src="w-${p.id}"></div><span>世界地图</span></button>
      </div></div><div class="rows">`;
    if (!pe.length) h += `<div class="empty">当前筛选下没有事件</div>`;
    const years = [...new Set(pe.map(e => e.year))];
    for (const y of years) {
      const ys = pe.filter(e => e.year === y);
      const approx = ys.every(e => e.approx) ? '约' : '';
      if (m === 'both') {
        const L = ys.filter(e => e.side === 'cn'), R = ys.filter(e => e.side === 'world');
        h += `<div class="row" data-year="${y}"><div class="cell l">${L.map(e => evCard(e)).join('')}</div><div class="axis"><span class="yr">${approx}${y1(y)}</span></div><div class="cell r">${R.map(e => evCard(e)).join('')}</div></div>`;
      } else {
        h += `<div class="row" data-year="${y}"><div class="axis"><span class="yr">${approx}${y1(y)}</span></div><div class="cell">${ys.map(e => evCard(e, true)).join('')}</div></div>`;
      }
    }
    h += `</div></section>`;
  }
  const todo = D.periods.filter(p => !p.ready).map(p => p.name).join('、');
  h += `<div class="todo">样板版仅含隋唐时期。<br>${todo} 将在下一阶段补齐。</div></div>`;
  $('#view').innerHTML = h;
  const pc = $('#pchips'), on = pc.querySelector('.chip.on');
  if (on) pc.scrollLeft = on.offsetLeft - pc.clientWidth / 2 + on.offsetWidth / 2;
  loadThumbs();
}

async function getMap(id){
  if (!D.maps[id]) D.maps[id] = fetch(`maps/${id}.svg`).then(r => r.ok ? r.text() : '').catch(() => '');
  return D.maps[id];
}
function loadThumbs(){
  document.querySelectorAll('.mt[data-src]').forEach(async el => { el.innerHTML = await getMap(el.dataset.src); });
}

/* keep the year at the top of the screen across re-renders */
function topYear(){
  const lim = ($('.controls')?.getBoundingClientRect().bottom || 120) + 4;
  for (const r of document.querySelectorAll('.row[data-year]')) if (r.getBoundingClientRect().bottom > lim) return +r.dataset.year;
  return null;
}
function scrollToYear(y){
  if (y == null) return;
  const rows = [...document.querySelectorAll('.row[data-year]')];
  const r = rows.find(r => +r.dataset.year >= y) || rows[rows.length - 1];
  if (r) r.scrollIntoView({block:'start'});
}
function keepPos(fn){
  const y = window.scrollY > 200 ? topYear() : null;
  fn(); if (y != null) scrollToYear(y);
}
function switchMode(m){ S.mode = m; store.set('mode', m); keepPos(renderTimeline); }

function jumpPeriod(id){
  const p = D.per[id];
  if (!p.ready) { toast(`「${p.name}」内容将在下一阶段补齐`); return; }
  $('#p-' + id)?.scrollIntoView({block:'start'});
  window.scrollBy(0, -($('.controls').getBoundingClientRect().height + 50));
}

function locate(id){
  const e = D.ev[id];
  S.tab = 'timeline'; S.person = null;
  if (S.mode === 'cn' && e.side !== 'cn' || S.mode === 'world' && e.side !== 'world') { S.mode = 'both'; store.set('mode','both'); }
  if (S.mode === 'world' && S.regions.size && !(e.region||[]).some(r => S.regions.has(r))) { S.regions.clear(); store.set('regions',[]); }
  render();
  const el = document.querySelector(`.ev[data-ev="${id}"]`);
  if (el) { el.closest('.row').scrollIntoView({block:'center'}); el.classList.add('flash'); }
}

/* ---------- sheets ---------- */
function openSheet(html){
  $('#sheet-body').innerHTML = html; $('#sheet').hidden = false;
  $('#sheet-body').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function closeSheet(){ $('#sheet').hidden = true; document.body.style.overflow = ''; }

function contemporaries(e, n = 3){
  const win = e.year >= 1800 ? 5 : 25;
  return D.events.filter(o => o.side !== e.side && Math.abs(o.year - e.year) <= win)
    .sort((a,b) => Math.abs(a.year - e.year) - Math.abs(b.year - e.year)).slice(0, n)
    .sort((a,b) => a.year - b.year);
}

const evRow = (o, note) => `<button data-ev="${o.id}"><span class="sy ${sc(o.side)}">${yLabel(o)}</span><span class="st">${esc(o.title)}${note ? `<small>${esc(note)}</small>` : ''}</span></button>`;
function openEvent(id){
  const e = D.ev[id]; if (!e) return;
  if (!S.seen.has(id)) { S.seen.add(id); saveSets(); }
  const ppl = (e.people || []).map(pid => D.pp[pid]).filter(Boolean);
  const same = contemporaries(e);
  const other = e.side === 'cn' ? '世界' : '中国';
  const causes = (e.causes || []).map(c => D.ev[c]).filter(Boolean);
  const effects = (D.effects[id] || []).map(c => D.ev[c]);
  const links = (D.links[id] || []).filter((l, i, a) => a.findIndex(x => x.id === l.id) === i);
  let h = `<div class="s-side ${sc(e.side)}">${sideName(e)} · ${D.per[e.period].name}</div>
    <h2 class="s-title">${esc(e.title)}</h2>
    <div class="s-when">${yRange(e)}${e.place ? ' · ' + esc(e.place) : ''}</div>
    <p class="s-sum">${esc(e.summary)}</p>`;
  if (e.bg) h += `<div class="s-block"><h4>背景</h4><p>${esc(e.bg)}</p></div><div class="s-block"><h4>经过</h4><p>${esc(e.proc)}</p></div><div class="s-block"><h4>影响</h4><p>${esc(e.impact)}</p></div>`;
  else h += `<p class="s-detail">${esc(e.detail)}</p>`;
  if (e.quote) h += `<figure class="s-quote ${sc(e.side)}"><blockquote>${esc(e.quote.t)}</blockquote><figcaption>${esc(e.quote.src)}</figcaption></figure>`;
  if (e.debate) h += `<div class="s-block s-debate"><h4>史家怎么看</h4><p>${esc(e.debate)}</p></div>`;
  if (e.note) h += `<div class="s-note">年代说明：${esc(e.note)}</div>`;
  if (causes.length || effects.length) {
    h += `<div class="s-sec">前因后果</div><div class="chain">`;
    if (causes.length) h += `<div class="ch-l">前因</div><div class="same">${causes.map(o => evRow(o)).join('')}</div>`;
    if (effects.length) h += `<div class="ch-l">后果</div><div class="same">${effects.map(o => evRow(o)).join('')}</div>`;
    h += `</div>`;
  }
  if (links.length) h += `<div class="s-sec">中外关联</div><div class="same">${links.map(l => evRow(D.ev[l.id], l.n)).join('')}</div>`;
  if (ppl.length) h += `<div class="s-sec">相关人物</div><div class="pchips">${ppl.map(p => `<button class="pchip ${sc(p.side)}" data-person="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
  h += `<div class="s-sec">同一时期的${other}</div>`;
  h += same.length ? `<div class="same">${same.map(o => evRow(o)).join('')}</div>`
                   : `<div class="center" style="font-size:13px">前后 25 年内暂无收录</div>`;
  h += `<div class="s-actions three"><button class="btn ${S.fav.has(id)?'fav-on':''}" data-act="fav" data-v="${id}">${S.fav.has(id)?'★ 已收藏':'☆ 收藏'}</button>
    <button class="btn" data-act="goSlice" data-v="${e.year}">看${y1(e.year)}年</button>
    <button class="btn pri" data-act="locate" data-v="${id}">对照定位</button></div>`;
  openSheet(h);
  if (S.tab === 'timeline') { const c = document.querySelector(`.ev[data-ev="${id}"]`); c && c.classList.add('seen'); }
}

function openPerson(id){
  const p = D.pp[id]; if (!p) return;
  const evs = D.events.filter(e => (e.people || []).includes(id));
  const fav = S.fav.has('P:' + id);
  let h = `<div class="s-side ${sc(p.side)}">${p.side==='cn'?'中国':'世界'} · ${esc(p.role)}</div>
    <h2 class="s-title">${esc(p.name)}</h2>
    <div class="s-when">${lifeSpan(p)}</div>
    <p class="s-sum">${esc(p.oneline)}</p>
    <p class="s-detail">${esc(p.bio)}</p>`;
  if (p.note) h += `<div class="s-note">一说：${esc(p.note)}</div>`;
  h += `<div class="s-sec">相关事件 · ${evs.length}</div>`;
  h += evs.length ? `<div class="same">${evs.map(o => `<button data-ev="${o.id}"><span class="sy ${sc(o.side)}">${yLabel(o)}</span><span class="st">${esc(o.title)}</span></button>`).join('')}</div>` : '';
  h += `<div class="s-actions"><button class="btn ${fav?'fav-on':''}" data-act="fav" data-v="P:${id}">${fav?'★ 已收藏':'☆ 收藏'}</button>
    <button class="btn pri" data-act="onlyPerson" data-v="${id}" ${evs.length?'':'disabled'}>时间轴只看 TA</button></div>`;
  openSheet(h);
}

function toggleFav(k){ S.fav.has(k) ? S.fav.delete(k) : S.fav.add(k); saveSets(); toast(S.fav.has(k) ? '已收藏' : '已取消收藏'); }

/* ---------- search ---------- */
function openSearch(){ $('#search').hidden = false; const i = $('#search-input'); i.value = ''; renderSearch(''); setTimeout(() => i.focus(), 50); }
function hi(s, q){ s = esc(s); if (!q) return s; const qq = esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); return s.replace(new RegExp(qq,'gi'), m => `<mark>${m}</mark>`); }
function renderSearch(q){
  const box = $('#search-results');
  if (!q) { box.innerHTML = `<div class="empty">可以搜「玄奘」「巴格达」「755」</div>`; return; }
  const ql = q.toLowerCase();
  const evs = D.events.filter(e => [e.title, e.summary, e.bg, e.proc, e.impact, e.place, yLabel(e), String(e.year)].join(' ').toLowerCase().includes(ql));
  const ps = D.people.filter(p => [p.name, p.role, p.oneline, p.bio].join(' ').toLowerCase().includes(ql));
  let h = '';
  if (ps.length) h += `<div class="res-h">人物 · ${ps.length}</div>` + ps.map(p => `<button class="res" data-person="${p.id}"><b>${hi(p.name,q)}</b><small>${lifeSpan(p)} · ${esc(p.oneline)}</small></button>`).join('');
  if (evs.length) h += `<div class="res-h">事件 · ${evs.length}</div>` + evs.map(e => `<button class="res" data-ev="${e.id}"><b>${hi(e.title,q)}</b><small>${yRange(e)} · ${e.side==='cn'?'中国':'世界'} · ${esc(e.summary)}</small></button>`).join('');
  box.innerHTML = h || `<div class="empty">没有找到「${esc(q)}」</div>`;
}

/* ---------- map viewer (pinch / pan) ---------- */
const MV = {s:1, x:0, y:0, pts:new Map(), base:null};
async function openMap(id, title){ showMap(await getMap(id), title); }
function showMap(html, title){
  $('#map-title').textContent = title || '';
  $('#mapview').hidden = false; document.body.style.overflow = 'hidden';
  $('#map-inner').innerHTML = html;
  fitMap();
}
function fitMap(){
  const st = $('#map-stage').getBoundingClientRect(), inner = $('#map-inner');
  inner.style.width = st.width + 'px';
  MV.s = 1; MV.x = 0; MV.y = 0; applyMap();
  const h = inner.getBoundingClientRect().height;
  const s = st.width < 600 ? Math.max(1, Math.min(1.7, st.height * 0.6 / h)) : 1;
  MV.s = s; MV.x = (st.width - st.width * s) / 2; MV.y = (st.height - h * s) / 2; applyMap();
}
function applyMap(){ $('#map-inner').style.transform = `translate(${MV.x}px,${MV.y}px) scale(${MV.s})`; }
function zoomAt(f, cx, cy){
  const ns = Math.min(6, Math.max(1, MV.s * f)); const k = ns / MV.s;
  MV.x = cx - (cx - MV.x) * k; MV.y = cy - (cy - MV.y) * k; MV.s = ns; applyMap();
}
(function bindMap(){
  const st = () => $('#map-stage');
  document.addEventListener('DOMContentLoaded', () => {
    const el = st();
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); MV.pts.set(e.pointerId, {x:e.clientX, y:e.clientY}); MV.base = null; });
    el.addEventListener('pointermove', e => {
      if (!MV.pts.has(e.pointerId)) return;
      const prev = MV.pts.get(e.pointerId); const cur = {x:e.clientX, y:e.clientY};
      const r = el.getBoundingClientRect();
      if (MV.pts.size === 1) { MV.x += cur.x - prev.x; MV.y += cur.y - prev.y; applyMap(); }
      else if (MV.pts.size === 2) {
        const [a, b] = [...MV.pts.entries()].map(([id, p]) => id === e.pointerId ? cur : p);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (MV.base) zoomAt(d / MV.base, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        MV.base = d;
      }
      MV.pts.set(e.pointerId, cur);
    });
    const up = e => { MV.pts.delete(e.pointerId); MV.base = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1/1.15, e.clientX - r.left, e.clientY - r.top); }, {passive:false});
    const mid = () => { const r = el.getBoundingClientRect(); return [r.width/2, r.height/2]; };
    $('#map-in').onclick = () => zoomAt(1.5, ...mid());
    $('#map-out').onclick = () => zoomAt(1/1.5, ...mid());
    $('#map-reset').onclick = fitMap;
  });
})();

/* ---------- people ---------- */
function renderPeople(){
  const f = S.pFilter;
  const roles = [...new Set(D.people.map(p => p.role))];
  const list = D.people.filter(p => (f.side === 'all' || p.side === f.side) && (f.role === 'all' || p.role === f.role))
    .sort((a,b) => a.birth - b.birth);
  let h = `<div class="page"><h2 class="page-h">人物</h2><p class="sub">共 ${D.people.length} 位 · 按出生年排列</p>
    <div class="filters">${[['all','全部'],['cn','中国'],['world','世界']].map(([k,v]) => `<button class="chip ${k==='cn'?'cn':k==='world'?'w':''} ${f.side===k?'on':''}" data-act="pside" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="filters"><button class="chip ${f.role==='all'?'on':''}" data-act="prole" data-v="all">全部身份</button>${roles.map(r => `<button class="chip ${f.role===r?'on':''}" data-act="prole" data-v="${r}">${r}</button>`).join('')}</div>
    <div class="pcards">`;
  h += list.map(p => `<button class="pcard ${sc(p.side)}" data-person="${p.id}"><div class="pc-top"><span class="pc-n">${S.fav.has('P:'+p.id)?'★ ':''}${esc(p.name)}</span><span class="pc-y">${lifeSpan(p)}</span></div><div class="pc-o">${esc(p.role)} · ${esc(p.oneline)}</div></button>`).join('') || `<div class="empty">没有符合条件的人物</div>`;
  h += `</div></div>`;
  $('#view').innerHTML = h;
}

/* ---------- quiz ---------- */
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function quizPool(){
  const ready = D.events.filter(e => D.per[e.period].ready);
  return S.qScope === 'fav' ? ready.filter(e => S.fav.has(e.id)) : ready;
}
const QGEN = {
  order(pool){
    for (let t = 0; t < 30; t++) {
      const a = pick(pool), b = pick(D.events);
      if (a.id === b.id || Math.abs(a.year - b.year) < 5) continue;
      const [early, late] = a.year < b.year ? [a, b] : [b, a];
      const opts = shuffle([a, b]);
      return {type:'order', ev:a, prompt:'下面两件事，哪一件发生得更早？', opts:opts.map(o => o.title), ans:opts.indexOf(early),
        exp:`「${early.title}」（${yRange(early)}）早于「${late.title}」（${yRange(late)}），相差约 ${late.year - early.year} 年。`};
    }
  },
  year(pool){
    const e = pick(pool);
    const others = shuffle([...new Set(D.events.map(o => o.year))].filter(y => Math.abs(y - e.year) >= 8));
    const ys = [e.year, ...others.slice(0, 3)];
    const opts = shuffle(ys);
    return {type:'year', ev:e, prompt:`「${e.title}」${e.endYear ? '开始于' : '发生在'}哪一年？`, opts:opts.map(y => y1(y) + '年'), ans:opts.indexOf(e.year),
      exp:`${yRange(e)}。${e.summary}。`};
  },
  person(pool){
    const cand = pool.filter(e => (e.people || []).some(p => D.pp[p]));
    if (!cand.length) return null;
    const e = pick(cand); const right = D.pp[pick(e.people.filter(p => D.pp[p]))];
    const wrong = shuffle(D.people.filter(p => !e.people.includes(p.id))).slice(0, 3);
    const opts = shuffle([right, ...wrong]);
    return {type:'person', ev:e, prompt:`与「${e.title}」（${yLabel(e)}）关系最直接的人物是？`, opts:opts.map(p => p.name), ans:opts.indexOf(right),
      exp:`${right.name}（${lifeSpan(right)}）：${right.oneline}。`};
  },
  cause(pool){
    const cand = pool.filter(e => (e.causes || []).length);
    if (!cand.length) return null;
    const e = pick(cand); const right = D.ev[pick(e.causes)];
    const wrong = shuffle(D.events.filter(o => o.year > e.year && !e.causes.includes(o.id) && o.id !== e.id)).slice(0, 3);
    if (wrong.length < 3) return null;
    const opts = shuffle([right, ...wrong]);
    return {type:'cause', ev:e, prompt:`下列哪件事是「${e.title}」（${yLabel(e)}）的直接前因？`, opts:opts.map(o => o.title), ans:opts.indexOf(right),
      exp:`「${right.title}」（${yRange(right)}）→「${e.title}」。${e.bg}`};
  },
  same(pool){
    for (let t = 0; t < 30; t++) {
      const e = pick(pool);
      const near = contemporaries(e, 1)[0];
      if (!near) continue;
      const far = shuffle(D.events.filter(o => o.side !== e.side && Math.abs(o.year - e.year) > 60)).slice(0, 3);
      if (far.length < 3) continue;
      const opts = shuffle([near, ...far]);
      const where = e.side === 'cn' ? '世界上' : '中国';
      return {type:'same', ev:e, prompt:`「${e.title}」（${yLabel(e)}）前后，${where}正在发生的是？`, opts:opts.map(o => o.title), ans:opts.indexOf(near),
        exp:`「${near.title}」在${yRange(near)}，与之相差 ${Math.abs(near.year - e.year)} 年；其他选项都相差 60 年以上。`};
    }
  }
};
function startQuiz(){
  const pool = quizPool();
  if (pool.length < 4) { toast('收藏的事件少于 4 条，先多收藏一些'); return; }
  const types = shuffle(['order','order','year','year','person','person','same','same','cause','cause']);
  const qs = [];
  for (const t of types) { const q = QGEN[t](pool) || QGEN.order(pool); if (q) qs.push(q); }
  S.quiz = {qs, i:0, right:0, picked:null, by:{}};
  renderQuiz(); window.scrollTo(0,0);
}
function answerQuiz(k){
  const z = S.quiz, q = z.qs[z.i]; if (z.picked != null) return;
  z.picked = k; const ok = k === q.ans; if (ok) z.right++;
  z.by[q.type] = z.by[q.type] || [0,0]; z.by[q.type][1]++; if (ok) z.by[q.type][0]++;
  const st = store.get('qstat', {}); const pid = q.ev.period; st[pid] = st[pid] || [0,0]; st[pid][1]++; if (ok) st[pid][0]++; store.set('qstat', st);
  if (z.i === z.qs.length - 1) { const hst = store.get('qhist', []); hst.push({t:Date.now(), r:z.right, n:z.qs.length}); store.set('qhist', hst.slice(-50)); }
  renderQuiz();
}
function renderQuiz(){
  const z = S.quiz; let h = `<div class="page">`;
  if (!z) {
    const favN = D.events.filter(e => S.fav.has(e.id)).length;
    const hist = store.get('qhist', []);
    h += `<h2 class="page-h">自测</h2><p class="sub">每次 10 题：谁先谁后、年份、人物配对、同时代判断</p>
      <div class="card"><h3>出题范围</h3><div class="opt-row">
        <button class="opt ${S.qScope==='all'?'on':''}" data-act="qscope" data-v="all">全部已开放内容</button>
        <button class="opt ${S.qScope==='fav'?'on':''}" data-act="qscope" data-v="fav" ${favN<4?'disabled':''}>只考收藏（${favN}）</button></div>
        <button class="btn pri" style="width:100%" data-act="qstart">开始 10 题</button></div>`;
    if (hist.length) {
      const last = hist.slice(-5).reverse();
      h += `<div class="card"><h3>最近成绩</h3>${last.map(r => `<div class="list-btn"><span>${new Date(r.t).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${new Date(r.t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span><span>${r.r} / ${r.n}</span></div>`).join('')}</div>`;
    }
  } else if (z.i >= z.qs.length || (z.i === z.qs.length - 1 && z.done)) {
    h += endView(z);
  } else {
    const q = z.qs[z.i], n = z.qs.length, done = z.picked != null;
    h += `<div class="q-prog"><span>第 ${z.i + 1} / ${n} 题</span><span>答对 ${z.right}</span></div><div class="q-bar"><i style="width:${(z.i + (done?1:0)) / n * 100}%"></i></div>
      <div class="q-type">${QTYPE[q.type]}</div><div class="q-p">${esc(q.prompt)}</div><div class="q-opts">`;
    h += q.opts.map((o, k) => {
      let c = 'q-o'; if (done && k === q.ans) c += ' right'; else if (done && k === z.picked) c += ' wrong';
      return `<button class="${c}" data-act="qans" data-v="${k}" ${done?'disabled':''}>${esc(o)}</button>`;
    }).join('') + `</div>`;
    if (done) {
      const ok = z.picked === q.ans;
      h += `<div class="q-fb"><b class="${ok?'ok':'no'}">${ok?'答对了。':'答错了。'}</b>${esc(q.exp)}</div>
        <div class="s-actions"><button class="btn" data-ev="${q.ev.id}">查看「${esc(q.ev.title.slice(0,6))}${q.ev.title.length>6?'…':''}」</button><button class="btn pri" data-act="qnext">${z.i === n - 1 ? '看成绩' : '下一题'}</button></div>`;
    } else h += `<div class="s-actions" style="grid-template-columns:1fr"><button class="btn" data-act="qquit">退出本轮</button></div>`;
  }
  $('#view').innerHTML = h + `</div>`;
}
function endView(z){
  const n = z.qs.length;
  return `<h2 class="page-h">本轮成绩</h2><div class="card"><div class="big-score">${z.right} / ${n}</div><p class="center">正确率 ${Math.round(z.right / n * 100)}%</p>
    ${Object.entries(z.by).map(([t,[r,c]]) => `<div class="list-btn"><span>${QTYPE[t]}</span><span>${r} / ${c}</span></div>`).join('')}</div>
    <div class="s-actions"><button class="btn" data-act="qquit">返回</button><button class="btn pri" data-act="qstart">再来 10 题</button></div>`;
}

/* ---------- me ---------- */
function renderMe(){
  const ready = D.events.filter(e => D.per[e.period].ready);
  const seenN = ready.filter(e => S.seen.has(e.id)).length;
  const st = store.get('qstat', {});
  const tot = Object.values(st).reduce((a, [r, c]) => [a[0] + r, a[1] + c], [0, 0]);
  const favE = D.events.filter(e => S.fav.has(e.id));
  const favP = D.people.filter(p => S.fav.has('P:' + p.id));
  let h = `<div class="page"><h2 class="page-h">我的</h2>
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat"><b>${seenN}<small style="font-size:13px;color:var(--muted)"> / ${ready.length}</small></b><span>已读事件</span></div>
      <div class="stat"><b>${tot[1] ? Math.round(tot[0] / tot[1] * 100) + '%' : '—'}</b><span>自测正确率</span></div>
      <div class="stat"><b>${favE.length + favP.length}</b><span>收藏</span></div></div>
    <div class="card"><h3>学习进度</h3>`;
  for (const p of D.periods) {
    if (!p.ready) { h += `<div class="prow na"><span class="pn">${p.name}</span><div class="pbar"></div><span class="pv">待补齐</span></div>`; continue; }
    const pe = D.events.filter(e => e.period === p.id), sn = pe.filter(e => S.seen.has(e.id)).length;
    const q = st[p.id];
    h += `<div class="prow"><span class="pn">${p.name}</span><div class="pbar"><i style="width:${pe.length ? sn / pe.length * 100 : 0}%"></i></div><span class="pv">${sn} / ${pe.length}</span></div>`;
    if (q) h += `<div class="prow"><span class="pn" style="color:var(--muted);font-size:12.5px">自测</span><div class="pbar"><i style="width:${q[0]/q[1]*100}%;background:var(--w)"></i></div><span class="pv">${Math.round(q[0]/q[1]*100)}%</span></div>`;
  }
  h += `</div><div class="card"><h3>收藏的事件 · ${favE.length}</h3>`;
  h += favE.length ? favE.map(e => `<button class="list-btn" data-ev="${e.id}"><span>${esc(e.title)}</span><span>${yLabel(e)}</span></button>`).join('') : `<div class="center" style="font-size:13px">在事件详情里点「收藏」</div>`;
  h += `</div><div class="card"><h3>收藏的人物 · ${favP.length}</h3>`;
  h += favP.length ? favP.map(p => `<button class="list-btn" data-person="${p.id}"><span>${esc(p.name)}</span><span>${lifeSpan(p)}</span></button>`).join('') : `<div class="center" style="font-size:13px">在人物详情里点「收藏」</div>`;
  h += `</div><div class="card"><button class="list-btn" data-act="update"><span>检查更新</span><span>v${VERSION}</span></button><button class="list-btn danger" data-act="reset"><span>清除学习记录</span><span></span></button></div>
    <p class="foot-note">数据仅保存在本机浏览器 · 年代以通行说法为准，有争议处标注「约 / 一说」</p></div>`;
  $('#view').innerHTML = h;
}

async function checkUpdate(){
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
    const r = await fetch('version.json?t=' + Date.now(), {cache:'no-store'}).then(r => r.json());
    if (r.version !== VERSION) { toast('发现新版本，正在更新…'); setTimeout(() => location.reload(), 800); }
    else toast('已是最新版本 v' + VERSION);
  } catch (e) { toast('当前离线，稍后再试'); }
}

/* ---------- 年份切片 ---------- */
const SL = {min:581, max:907};
const activeAt = (y, o) => (o.start == null || o.start <= y) && (o.end == null || y <= o.end);
const evActive = (e, y) => e.year === y || (e.endYear && e.year < y && y <= e.endYear);
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
  const m = D.sm; if (!m) return '';
  const ps = m.polities.filter(p => activeAt(y, p));
  const evs = D.events.filter(e => evActive(e, y) && m.ev[e.id]);
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.W} ${m.H}" class="smap${big?' big':''}">`;
  g += `<rect class="m-sea" width="${m.W}" height="${m.H}"/><path class="m-grat" d="${m.grat}"/><path class="m-land" d="${m.base}"/>`;
  g += ps.map(p => `<path class="sp t-${p.tone}" d="${p.d}"/>`).join('');
  g += ps.map(p => `<text class="spl t-${p.tone}" x="${p.l[0]}" y="${p.l[1]}" text-anchor="middle">${p.name}</text>` + (p.sub ? `<text class="spl t-${p.tone} s" x="${p.sub.l[0]}" y="${p.sub.l[1]}" text-anchor="middle">${p.sub.t}</text>` : '')).join('');
  g += m.labels.filter(l => activeAt(y, l)).map(l => `<text class="spl t-o" x="${l.l[0]}" y="${l.l[1]}" text-anchor="middle">${l.t}</text>`).join('');
  g += m.cities.filter(c => activeAt(y, c)).map(c => `<circle class="sc${c.cap?' cap':''}" cx="${c.p[0]}" cy="${c.p[1]}" r="${c.cap?2.2:1.7}"/><text class="sct" x="${c.p[0]+(c.dx??3)}" y="${c.p[1]+(c.dy??3)}"${(c.dx??3)<0?' text-anchor="end"':''}>${c.t}</text>`).join('');
  g += evs.map(e => { const [x, yy] = m.ev[e.id]; return `<g class="spin ${sc(e.side)}" data-ev="${e.id}"><circle class="halo" cx="${x}" cy="${yy}" r="7"/><circle cx="${x}" cy="${yy}" r="3.6"/></g>`; }).join('');
  return g + `</svg>`;
}
function nearby(y){
  const before = [...D.events].reverse().find(e => e.year < y);
  const after = D.events.find(e => e.year > y);
  return {before, after};
}
function sliceBody(y){
  const evs = D.events.filter(e => evActive(e, y));
  const now = evs.filter(e => e.year === y), ongoing = evs.filter(e => e.year !== y);
  let h = `<section class="sl-sec"><h3>这一年 <small>${now.length ? now.length + ' 件大事' : '无收录大事'}</small></h3>`;
  if (now.length) h += `<div class="sl-evs">${now.map(e => `<button class="sl-ev ${sc(e.side)}" data-ev="${e.id}"><span class="sl-side">${e.side==='cn'?'中国':(e.region||[]).map(r=>REGIONS[r]).join('、')}</span><b>${esc(e.title)}</b><span class="sl-sum">${esc(e.summary)}</span>${e.impact?`<span class="sl-imp">影响：${esc(e.impact.slice(0, 58))}…</span>`:''}</button>`).join('')}</div>`;
  else {
    const {before, after} = nearby(y);
    h += `<div class="sl-near">${before ? `<button data-act="goSlice" data-v="${before.year}"><span>${y - before.year} 年前</span>${esc(before.title)}</button>` : ''}${after ? `<button data-act="goSlice" data-v="${after.year}"><span>${after.year - y} 年后</span>${esc(after.title)}</button>` : ''}</div>`;
  }
  if (ongoing.length) h += `<div class="sl-on"><div class="sl-lab">仍在进行</div>${ongoing.map(e => `<button class="sl-chip ${sc(e.side)}" data-ev="${e.id}">${esc(e.title)}<small>${y1(e.year)}—${y1(e.endYear)}，第 ${y - e.year + 1} 年</small></button>`).join('')}</div>`;
  h += `</section>`;

  // 此刻各地
  const seen = new Set(), rows = [];
  const order = ['sui','chen','tang','tujue','xitujue','tujue2','huihe','tubo','nanzhao','goguryeo','baekje','silla','bohai','japan','harsha','sasan','arab','abbas','byz','visig','andalus','lombard','franks','wfr','mfr','efr'];
  const ps = D.sm.polities.filter(p => activeAt(y, p));
  for (const p of ps) { if (seen.has(p.state)) continue; seen.add(p.state); rows.push(p); }
  if (y >= 581) rows.push({state:'japan', name: y >= 701 ? '日本' : '倭国', tone:'o', desc: y < 710 ? '飞鸟时代' : y < 794 ? '奈良时代' : '平安时代'});
  rows.sort((a,b) => order.indexOf(a.state) - order.indexOf(b.state));
  h += `<section class="sl-sec"><h3>此刻的世界 <small>${rows.length} 个主要政权</small></h3><div class="sl-states">`;
  h += rows.map(p => { const r = rulerAt(p.state, y); return `<div class="st-row"><i class="dot t-${p.tone}"></i><b>${p.name}</b><span>${r ? esc(reignText(r, y)) : esc(p.desc)}</span></div>`; }).join('');
  h += `</div></section>`;

  // 在世人物
  const alive = D.people.filter(p => p.birth <= y && y <= p.death).sort((a,b) => (a.side > b.side ? 1 : a.side < b.side ? -1 : a.birth - b.birth));
  h += `<section class="sl-sec"><h3>此刻在世 <small>${alive.length} 位人物库人物</small></h3>`;
  h += alive.length ? `<div class="pchips">${alive.map(p => `<button class="pchip ${sc(p.side)}" data-person="${p.id}">${esc(p.name.replace(/（.*）/,''))}<small>${p.approx?'约':''}${y - p.birth} 岁</small></button>`).join('')}</div>` : `<p class="center" style="font-size:13px">人物库中暂无此时在世的人</p>`;
  h += `</section>`;
  return h;
}
function sliceHead(y){
  const cn = D.sm.polities.filter(p => activeAt(y, p) && (p.state === 'tang' || p.state === 'sui'));
  const r = cn.length ? rulerAt(cn[0].state, y) : null;
  return `<div class="yr-big"><b>${y}</b><span>年</span></div><div class="yr-sub">${r ? esc(reignText(r, y)) : ''}</div>`;
}
function renderSlice(){
  const y = S.year;
  const ys = D.events.map(e => e.year);
  const tick = D.events.map(e => `<i class="${sc(e.side)}" style="left:${(e.year - SL.min) / (SL.max - SL.min) * 100}%"></i>`).join('');
  $('#view').innerHTML = `<div class="sl-top">
      <div class="sl-head" id="sl-head">${sliceHead(y)}</div>
      <div class="sl-track"><div class="sl-ticks">${tick}</div><input type="range" id="sl-range" min="${SL.min}" max="${SL.max}" value="${y}" aria-label="年份"></div>
    </div>
    <div class="sl-btns"><button data-act="yjump" data-v="-1" aria-label="上一个事件">‹ 上一事件</button><button data-act="ystep" data-v="-1" aria-label="前一年">−1</button><button data-act="yplay" class="play" id="sl-play">${S.playing?'暂停':'▶ 播放'}</button><button data-act="ystep" data-v="1" aria-label="后一年">+1</button><button data-act="yjump" data-v="1" aria-label="下一个事件">下一事件 ›</button></div>
    <div class="sl-mapwrap"><div class="sl-map" id="sl-map">${sliceSVG(y)}</div><button class="sl-full" data-map="slice" aria-label="全屏查看地图">⤢</button></div>
    <div class="sl-body" id="sl-body">${sliceBody(y)}</div>`;
  const r = $('#sl-range');
  r.addEventListener('input', () => { stopPlay(); setYear(+r.value, true); });
  centerMap();
}
let _raf = 0;
function setYear(y, fromRange){
  y = Math.max(SL.min, Math.min(SL.max, y));
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
  const m = D.sm, w = box.scrollWidth;
  const pins = D.events.filter(e => e.year === S.year && m.ev[e.id]).map(e => m.ev[e.id][0]);
  if (smooth && !pins.length) return;
  const cx = pins.length ? (Math.min(...pins) + Math.max(...pins)) / 2 : m.W * 0.62;
  box.scrollTo({left: cx / m.W * w - box.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto'});
}
function startPlay(){
  if (S.year >= SL.max) setYear(SL.min);
  S.playing = setInterval(() => { if (S.year >= SL.max) return stopPlay(); setYear(S.year + 1); }, 320);
  const b = $('#sl-play'); if (b) b.textContent = '暂停';
}
function stopPlay(){
  if (S.playing) clearInterval(S.playing); S.playing = null;
  const b = $('#sl-play'); if (b) b.textContent = '▶ 播放';
}


boot();
