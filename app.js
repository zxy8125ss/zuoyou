'use strict';
const VERSION = '1.0.3';
const REGIONS = {europe:'欧洲',westasia:'西亚北非',southasia:'南亚·东南亚',eastasia:'东亚（除中国）',america:'美洲',africa:'撒哈拉以南非洲',oceania:'大洋洲'};
const QTYPE = {order:'谁先谁后',year:'年份',person:'人物配对',same:'同时代判断',cause:'前因后果'};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem('zy.' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('zy.' + k, JSON.stringify(v)); }catch(e){} }
};

const D = {events:[], people:[], periods:[], rulers:[], sm:{}, smd:{}, units:{}, unitd:{}, lessons:{}, lessonPid:{}, ev:{}, pp:{}, per:{}, maps:{}, effects:{}, links:{}, images:{}};
const S = {
  tab:'learn', unit:null, lesson:null, learnView:'home', slicePid:null, done: new Set(store.get('lessons', [])), year: store.get('year', 755), playing:null, mode: store.get('mode','both'), regions: new Set(store.get('regions', [])), person:null,
  fav: new Set(store.get('fav', [])), seen: new Set(store.get('seen', [])),
  quiz:null, pFilter:{side:'all', role:'all', period:'all'}, qScope:'all'
};
const saveSets = () => { store.set('fav',[...S.fav]); store.set('seen',[...S.seen]); };

/* ---------- formatting ---------- */
const y1 = y => y < 0 ? '前' + (-y) : String(y);
const yLabel = e => (e.approx ? '约' : '') + y1(e.year);
const yRange = e => (e.approx ? '约' : '') + (e.endYear ? `${y1(e.year)}—${y1(e.endYear)}年` : `${y1(e.year)}年`);
const lifeSpan = p => p.death == null ? `${y1(p.birth)}年生` : `${p.approx ? '约' : ''}${y1(p.birth)}—${y1(p.death)}`;
const sideName = e => e.side === 'cn' ? '中国史' : '世界史 · ' + (e.region || []).map(r => REGIONS[r]).join('、');
const sc = side => side === 'cn' ? 'cn' : 'w';

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- boot ---------- */
async function boot(){
  const [events, people, periods, rulers, images] = await Promise.all(['events','people','periods','rulers','images'].map(n => fetch(`data/${n}.json`).then(r => r.json())));
  events.sort((a,b) => a.year - b.year || (a.side < b.side ? -1 : 1));
  Object.assign(D, {events, people, periods, rulers, images});
  periods.forEach(p => (p.unit ? p.unit.lessons : []).forEach(l => D.lessonPid[l.id] = p.id));
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
    stopPlay(); if (b.dataset.tab === 'learn' && S.tab === 'learn') { S.lesson = null; S.unit = null; S.quiz = null; S.learnView = 'home'; } S.tab = b.dataset.tab; render(); window.scrollTo(0,0);
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
  if (t.dataset.map) { t.dataset.map === 'slice' ? showMap(sliceSVG(S.year, true), y1(S.year) + '年的世界（示意）') : openMap(t.dataset.map, t.dataset.title); return; }
  const a = t.dataset.act, v = t.dataset.v;
  var acts = {
    mode(){ switchMode(v); },
    units(){ S.unit = null; S.lesson = null; S.learnView = 'home'; S.quiz = null; render(); window.scrollTo(0,0); },
    unit(){ closeSheet(); S.tab = 'learn'; S.unit = v; S.lesson = null; S.learnView = 'unit'; render(); window.scrollTo(0,0); },
    lesson(){ S.lesson = v; S.unit = D.lessonPid[v] || S.unit; S.learnView = 'lesson'; store.set('last', v); render(); window.scrollTo(0,0); },
    resume(){ acts.lesson(); },
    learnHome(){ S.lesson = null; S.learnView = S.unit ? 'unit' : 'home'; S.quiz = null; render(); window.scrollTo(0,0); },
    learnQuiz(){ S.learnView = 'quiz'; S.quiz = null; if (v) S.qScope = v; render(); window.scrollTo(0,0); },
    lessonDone(){ S.done.add(v); store.set('lessons', [...S.done]); const L = (D.unitd[S.unit] || {lessons:[]}).lessons.map(l => l.id); const nx = L[L.indexOf(v) + 1]; toast('已完成本课'); if (nx) { S.lesson = nx; store.set('last', nx); render(); window.scrollTo(0,0); } else acts.learnHome(); },
    reveal(){ const box = t.closest('.mod'); box.querySelector('.ans').hidden = false; t.remove(); },
    plain(){ const p = t.closest('.mod').querySelector('.plain'); p.hidden = !p.hidden; t.textContent = p.hidden ? '看白话' : '收起白话'; },
    step(){ const box = t.closest('.mod'); setStep(box, +v); },
    rtab(){ const box = t.closest('.mod'); box.querySelectorAll('.rtab').forEach(b => b.classList.toggle('on', b === t)); box.querySelectorAll('.rt').forEach(p => p.classList.toggle('dim', v !== 'all' && p.dataset.r !== v)); box.querySelectorAll('.rnote').forEach(p => p.hidden = p.dataset.r !== v); },
    replay(){ const svg = t.closest('.mod').querySelector('svg'); svg.classList.remove('go'); void svg.getBoundingClientRect(); svg.classList.add('go'); },
    lq(){ const [qi, k] = v.split(':').map(Number); const box = t.closest('.lq'); if (box.dataset.done) return; box.dataset.done = 1; const ans = +box.dataset.ans; box.querySelectorAll('.q-o').forEach((b, i) => { if (i === ans) b.classList.add('right'); else if (i === k) b.classList.add('wrong'); b.disabled = true; }); box.querySelector('.q-fb').hidden = false; box.querySelector('.q-fb b').textContent = k === ans ? '答对了。' : '答错了。'; box.querySelector('.q-fb b').className = k === ans ? 'ok' : 'no'; },
    ystep(){ stopPlay(); setYear(S.year + (+v) * curStep()); },
    yjump(){ stopPlay(); const [lo, hi] = winOf(S.year); const ys = [...new Set(D.events.map(e => e.year))].sort((a,b) => a - b); const y = +v > 0 ? ys.find(y => y > hi) : [...ys].reverse().find(y => y < lo); if (y != null) setYear(y); },
    spd(){ stopPlay(); const p = D.per[v]; S.slicePid = v; S.year = p.rep; store.set('year', S.year); renderSlice(); window.scrollTo(0,0); },
    yplay(){ S.playing ? stopPlay() : startPlay(); },
    goSlice(){ closeSheet(); $('#search').hidden = true; stopPlay(); S.tab = 'slice'; S.year = +v; S.slicePid = (t.dataset.p && D.per[t.dataset.p]) ? t.dataset.p : periodOf(+v).id; store.set('year', S.year); render(); window.scrollTo(0,0); },
    period(){ jumpPeriod(v); },
    region(){ S.regions.has(v) ? S.regions.delete(v) : S.regions.add(v); store.set('regions',[...S.regions]); keepPos(renderTimeline); },
    regionAll(){ S.regions.clear(); store.set('regions',[]); keepPos(renderTimeline); },
    clearPerson(){ S.person = null; renderTimeline(); },
    fav(){ toggleFav(v); t.classList.toggle('fav-on', S.fav.has(v)); t.textContent = S.fav.has(v) ? '★ 已收藏' : '☆ 收藏'; },
    locate(){ closeSheet(); $('#search').hidden = true; locate(v); },
    onlyPerson(){ closeSheet(); $('#search').hidden = true; S.person = v; S.tab = 'timeline'; render(); window.scrollTo(0,0); },
    pside(){ S.pFilter.side = v; renderPeople(); },
    prole(){ S.pFilter.role = v; renderPeople(); },
    pper(){ S.pFilter.period = v; renderPeople(); },
    qscope(){ S.qScope = v; renderQuiz(); },
    qstart(){ startQuiz(); },
    qans(){ answerQuiz(+v); },
    qnext(){ S.quiz.i++; S.quiz.picked = null; renderQuiz(); window.scrollTo(0,0); },
    qquit(){ S.quiz = null; renderQuiz(); },
    reset(){ if (confirm('清除收藏、浏览进度和自测记录？')) { ['fav','seen','qstat','qhist','lessons'].forEach(k => store.set(k, k==='qstat'?{}:[])); S.fav.clear(); S.seen.clear(); S.done.clear(); renderMe(); toast('已清除'); } },
    update(){ checkUpdate(); }
  };
  if (acts[a]) acts[a]();
}

function render(){
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  ({learn:renderLearn, slice:renderSlice, timeline:renderTimeline, people:renderPeople, quiz:renderQuiz, me:renderMe})[S.tab]();
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
    <div class="chips" id="pchips">${D.periods.map(p => `<button class="chip" data-act="period" data-v="${p.id}">${p.name}</button>`).join('')}</div>`;
  if (m === 'world') {
    h += `<div class="chips"><button class="chip w ${S.regions.size?'':'on'}" data-act="regionAll">全部地区</button>${
      Object.entries(REGIONS).map(([k,v]) => `<button class="chip w ${S.regions.has(k)?'on':''}" data-act="region" data-v="${k}">${v}</button>`).join('')}</div>`;
  }
  if (S.person) h += `<div class="banner"><span>只显示与「${esc(D.pp[S.person].name)}」相关的事件</span><button data-act="clearPerson">显示全部</button></div>`;
  h += `</div><div class="tl ${m==='both'?'both':'single ' + m}">`;

  const evs = filteredEvents();
  for (const p of D.periods) {
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
  h += `</div>`;
  $('#view').innerHTML = h;
  loadThumbs();
}

async function getMap(id){
  if (!D.maps[id]) D.maps[id] = fetch(`maps/${id}.svg`).then(r => r.ok ? r.text() : '').catch(() => '');
  return D.maps[id];
}
function loadThumbs(){
  const els = document.querySelectorAll('.mt[data-src]');
  if (!('IntersectionObserver' in window)) { els.forEach(async el => { el.innerHTML = await getMap(el.dataset.src); }); return; }
  const io = new IntersectionObserver(es => es.forEach(async en => { if (!en.isIntersecting) return; io.unobserve(en.target); en.target.innerHTML = await getMap(en.target.dataset.src); }), {rootMargin:'800px 0px'});
  els.forEach(el => io.observe(el));
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

const eraWin = y => y < -1000 ? 100 : y < 0 ? 40 : y < 1500 ? 25 : y < 1800 ? 15 : 5;
function contemporaries(e, n = 3){
  const win = eraWin(e.year);
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
  if (D.images._ev && D.images._ev[id]) h += `<div class="s-photo">${imgHTML(D.images._ev[id])}</div>`;
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
                   : `<div class="center" style="font-size:13px">前后 ${eraWin(e.year)} 年内暂无收录</div>`;
  h += `<div class="s-actions three"><button class="btn ${S.fav.has(id)?'fav-on':''}" data-act="fav" data-v="${id}">${S.fav.has(id)?'★ 已收藏':'☆ 收藏'}</button>
    <button class="btn" data-act="goSlice" data-v="${e.year}" data-p="${e.period}">看${y1(e.year)}年</button>
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
const ROLECAT = {帝王:'帝王',政治家:'政治',政治人物:'政治',革命家:'政治',外交家:'政治',和亲使者:'政治',农民领袖:'政治',社会活动家:'政治',军事家:'军事',思想家:'思想宗教',宗教人物:'思想宗教',宗教创始人:'思想宗教',宗教改革家:'思想宗教',僧人:'思想宗教',传教士:'思想宗教',科学家:'科学发明',发明家:'科学发明',农学家:'科学发明',文学家:'文史艺术',诗人:'文史艺术',书法家:'文史艺术',剧作家:'文史艺术',艺术家:'文史艺术',史学家:'文史艺术',航海家:'探索远行',旅行家:'探索远行',宇航员:'探索远行',航天员:'探索远行',传说人物:'传说'};
const roleCat = r => ROLECAT[r] || '其他';
function renderPeople(){
  const f = S.pFilter;
  const roles = [...new Set(D.people.map(p => roleCat(p.role)))].sort((a, b) => D.people.filter(p => roleCat(p.role) === b).length - D.people.filter(p => roleCat(p.role) === a).length);
  if (f.role !== 'all' && !roles.includes(f.role)) f.role = 'all';
  const list = D.people.filter(p => (f.side === 'all' || p.side === f.side) && (f.role === 'all' || roleCat(p.role) === f.role) && (f.period === 'all' || p.period === f.period))
    .sort((a,b) => a.birth - b.birth);
  let h = `<div class="page"><h2 class="page-h">人物</h2><p class="sub">共 ${D.people.length} 位 · 当前 ${list.length} 位 · 按出生年排列</p>
    <div class="filters">${[['all','全部'],['cn','中国'],['world','世界']].map(([k,v]) => `<button class="chip ${k==='cn'?'cn':k==='world'?'w':''} ${f.side===k?'on':''}" data-act="pside" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="filters"><button class="chip ${f.period==='all'?'on':''}" data-act="pper" data-v="all">全部时期</button>${D.periods.map(p => `<button class="chip ${f.period===p.id?'on':''}" data-act="pper" data-v="${p.id}">${p.name}</button>`).join('')}</div>
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
  if (S.qScope === 'fav') return D.events.filter(e => S.fav.has(e.id));
  if (D.per[S.qScope]) return D.events.filter(e => e.period === S.qScope);
  return D.events;
}
const QGEN = {
  order(pool){
    for (let t = 0; t < 30; t++) {
      const a = pick(pool), b = pick(pool.length > 8 ? pool : D.events);
      if (a.id === b.id || Math.abs(a.year - b.year) < 5) continue;
      const [early, late] = a.year < b.year ? [a, b] : [b, a];
      const opts = shuffle([a, b]);
      return {type:'order', ev:a, prompt:'下面两件事，哪一件发生得更早？', opts:opts.map(o => o.title), ans:opts.indexOf(early),
        exp:`「${early.title}」（${yRange(early)}）早于「${late.title}」（${yRange(late)}），相差约 ${late.year - early.year} 年。`};
    }
  },
  year(pool){
    const e = pick(pool);
    const gap = Math.max(8, Math.round(eraWin(e.year) / 2)); let others = shuffle([...new Set(D.events.map(o => o.year))].filter(y => Math.abs(y - e.year) >= gap && Math.abs(y - e.year) <= gap * 30)); if (others.length < 3) others = shuffle([...new Set(D.events.map(o => o.year))].filter(y => Math.abs(y - e.year) >= gap));
    const ys = [e.year, ...others.slice(0, 3)];
    const opts = shuffle(ys);
    return {type:'year', ev:e, prompt:`「${e.title}」${e.endYear ? '开始于' : '发生在'}哪一年？`, opts:opts.map(y => y1(y) + '年'), ans:opts.indexOf(e.year),
      exp:`${yRange(e)}。${e.summary}。`};
  },
  person(pool){
    const cand = pool.filter(e => (e.people || []).some(p => D.pp[p]));
    if (!cand.length) return null;
    const e = pick(cand); const right = D.pp[pick(e.people.filter(p => D.pp[p]))];
    const near = D.people.filter(p => !e.people.includes(p.id) && Math.abs(p.birth - e.year) < 400); const wrong = shuffle(near.length >= 3 ? near : D.people.filter(p => !e.people.includes(p.id))).slice(0, 3);
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
      const fw = eraWin(e.year) * 3; const far = shuffle(D.events.filter(o => o.side !== e.side && Math.abs(o.year - e.year) > fw && Math.abs(o.year - e.year) < fw * 20)).slice(0, 3);
      if (far.length < 3) continue;
      const opts = shuffle([near, ...far]);
      const where = e.side === 'cn' ? '世界上' : '中国';
      return {type:'same', ev:e, prompt:`「${e.title}」（${yLabel(e)}）前后，${where}正在发生的是？`, opts:opts.map(o => o.title), ans:opts.indexOf(near),
        exp:`「${near.title}」在${yRange(near)}，与之相差 ${Math.abs(near.year - e.year)} 年；其他选项都相差 ${fw} 年以上。`};
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
    h += `<h2 class="page-h">自测</h2><p class="sub">每次 10 题：谁先谁后、年份、人物配对、同时代判断、前因后果</p>
      <div class="card"><h3>出题范围</h3><div class="opt-row">
        <button class="opt ${S.qScope==='all'?'on':''}" data-act="qscope" data-v="all">全部时期</button>
        <button class="opt ${S.qScope==='fav'?'on':''}" data-act="qscope" data-v="fav" ${favN<4?'disabled':''}>只考收藏（${favN}）</button></div>
        <div class="qper">${D.periods.map(p => `<button class="chip ${S.qScope===p.id?'cn on':''}" data-act="qscope" data-v="${p.id}">${p.name}</button>`).join('')}</div>
        <button class="btn pri" style="width:100%" data-act="qstart">开始 10 题${D.per[S.qScope] ? ' · ' + D.per[S.qScope].name : ''}</button></div>`;
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
  const ready = D.events;
  const seenN = ready.filter(e => S.seen.has(e.id)).length;
  const lessonsN = D.periods.reduce((a, p) => a + (p.unit ? p.unit.lessons.length : 0), 0);
  const st = store.get('qstat', {});
  const tot = Object.values(st).reduce((a, [r, c]) => [a[0] + r, a[1] + c], [0, 0]);
  const favE = D.events.filter(e => S.fav.has(e.id));
  const favP = D.people.filter(p => S.fav.has('P:' + p.id));
  let h = `<div class="page"><h2 class="page-h">我的</h2>
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat"><b>${seenN}<small style="font-size:13px;color:var(--muted)"> / ${ready.length}</small></b><span>已读事件</span></div>
      <div class="stat"><b>${tot[1] ? Math.round(tot[0] / tot[1] * 100) + '%' : '—'}</b><span>自测正确率</span></div>
      <div class="stat"><b>${S.done.size}<small style="font-size:13px;color:var(--muted)"> / ${lessonsN}</small></b><span>已学课程</span></div></div>
    <div class="card"><h3>学习进度</h3>`;
  for (const p of D.periods) {
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

/* ---------- 学习：单元与课 ---------- */
const MODNAME = {img:'', article:'知识篇章', steps:'时间线', box:'你知道吗', poems:'诗文', points:'要点', route:'路线图', source:'史料研读', events:'相关事件', quiz:'小测', compare:'对比', chart:'数据', map:'地图', think:'思考', cause:'因果', flow:'流程图', table:'对照表', phases:'地图演变', exchange:'关系图', people:'人物群像', spans:'年表'};
const toneCls = t => t === 'cn' || t === 'cn2' ? 'cn' : t === 'w' ? 'w' : 'o';
let CLIP = 0;
function geoBase(g){
  g._cid = 'lc' + (++CLIP);
  return `<clipPath id="${g._cid}"><path d="${g.land}"/></clipPath><rect class="m-sea" width="${g.W}" height="${g.H}"/><path class="m-grat" d="${g.grat}"/><path class="m-land" d="${g.land}"/>`;
}
function layerSVG(L, g){
  return `<g clip-path="url(#${g._cid})">${L.polities.map(p => `<path class="sp t-${p.tone}" d="${p.d}"/>`).join('')}</g>` +
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
  case 'map': return head + (m.desc ? `<p class="mod-d">${esc(m.desc)}</p>` : '') + `<div class="lmapw"><svg viewBox="0 0 ${g.W} ${g.H}" class="lmap">${geoBase(g)}${layerSVG(g.layers[0], g)}${marksSVG(g)}</svg></div>` +
      (m.table ? `<div class="tbl"><table><tbody>${m.table.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>` : '');
  case 'phases': return head + `<div class="phase-btns">${m.steps.map((s, i) => `<button class="chip ${i ? '' : 'on'}" data-act="step" data-v="${i}">${y1(s[0])}</button>`).join('')}</div>` +
      `<div class="lmapw"><svg viewBox="0 0 ${g.W} ${g.H}" class="lmap">${geoBase(g)}${g.layers.map((L, i) => `<g class="ly" data-i="${i}" ${i ? 'style="display:none"' : ''}>${layerSVG(L, g)}</g>`).join('')}${marksSVG(g)}</svg></div>` +
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
  const cid = 'sc' + (++CLIP);
  g += `<clipPath id="${cid}"><path d="${m.base}"/></clipPath><rect class="m-sea" width="${m.W}" height="${m.H}"/><path class="m-grat" d="${m.grat}"/><path class="m-land" d="${m.base}"/>`;
  g += `<g clip-path="url(#${cid})">${ps.map(p => p.d ? `<path class="sp t-${p.tone}" d="${p.d}"/>` : '').join('')}</g>`;
  const pn = new Set(ps.map(p => p.name));
  g += m.cities.filter(c => activeAt(y, c)).map(c => `<circle class="sc${c.cap ? ' cap' : ''}" cx="${c.p[0]}" cy="${c.p[1]}" r="${c.cap ? 2.2 : 1.7}"/>` + (pn.has(c.t) ? '' : `<text class="sct" x="${c.p[0] + (c.dx ?? 3)}" y="${c.p[1] + (c.dy ?? 3)}"${(c.dx ?? 3) < 0 ? ' text-anchor="end"' : ''}>${c.t}</text>`)).join('');
  g += evs.map(e => { const [x, yy] = m.ev[e.id]; const now = e.year >= lo && e.year <= hi; return `<g class="spin ${sc(e.side)}${now ? '' : ' on'}" data-ev="${e.id}">${now ? `<circle class="halo" cx="${x}" cy="${yy}" r="7"/>` : ''}<circle cx="${x}" cy="${yy}" r="${now ? 3.6 : 2.6}"/></g>`; }).join('');
  g += ps.map(p => p.d ? `<text class="spl t-${p.tone}${p.small ? ' s' : ''}" x="${p.l[0]}" y="${p.l[1]}" text-anchor="middle">${p.name}</text>` + (p.sub ? `<text class="spl t-${p.tone} s" x="${p.sub.l[0]}" y="${p.sub.l[1]}" text-anchor="middle">${p.sub.t}</text>` : '') : '').join('');
  g += m.labels.filter(l => activeAt(y, l)).map(l => `<text class="spl t-o" x="${l.l[0]}" y="${l.l[1]}" text-anchor="middle">${l.t}</text>`).join('');
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
  const alive = D.people.filter(p => p.birth <= y && y <= (p.death ?? 9999)).sort((a, b) => (a.side > b.side ? 1 : a.side < b.side ? -1 : a.birth - b.birth));
  h += `<section class="sl-sec"><h3>此刻在世 <small>${alive.length} 位人物库人物</small></h3>`;
  h += alive.length ? `<div class="pchips">${alive.map(p => `<button class="pchip ${sc(p.side)}" data-person="${p.id}">${esc(p.name.replace(/（.*）/, ''))}<small>${p.approx ? '约' : ''}${y - p.birth} 岁</small></button>`).join('')}</div>` : `<p class="center" style="font-size:13px">人物库中暂无此时在世的人</p>`;
  return h + `</section>`;
}
function sliceHead(y){
  const act = D.rulers.filter(r => r.cn && r.start <= y && y <= r.end);
  const hs = act.filter(r => r.head);
  const r = (hs.length ? hs : act).sort((a, b) => b.start - a.start)[0];
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
