// 左右千年 构建脚本：node src/build.mjs
// 读取 src/<时期>/{events,people,rulers,geo,unit}.json，生成 data/ 与 maps/ 下的全部发布文件
import fs from 'node:fs';
import path from 'node:path';
import * as topojson from 'topojson-client';
import * as d3 from 'd3-geo';

const SRC = path.dirname(new URL(import.meta.url).pathname) + '/';
const ROOT = path.resolve(SRC, '..') + '/';
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const rdo = (f, d) => fs.existsSync(f) ? rd(f) : d;
const wr = (f, o) => { fs.mkdirSync(path.dirname(ROOT + f), { recursive: true }); fs.writeFileSync(ROOT + f, typeof o === 'string' ? o : JSON.stringify(o)); };
const NM = SRC + 'node_modules/world-atlas/';
const C110 = rd(NM + 'countries-110m.json'), C50 = rd(NM + 'countries-50m.json');
const L110 = rd(NM + 'land-110m.json'), L50 = rd(NM + 'land-50m.json');
const land110 = topojson.feature(L110, L110.objects.land);
const land50 = topojson.feature(L50, L50.objects.land);
const warn = [];
const W = m => warn.push(m);

/* ---------- 几何 ---------- */
const mcache = new Map();
function merged(names, hi) {
  const key = (hi ? 'h' : 'l') + names.join('|');
  if (mcache.has(key)) return mcache.get(key);
  const T = hi ? C50 : C110;
  const geoms = T.objects.countries.geometries.filter(g => names.includes(g.properties.name));
  const found = new Set(geoms.map(g => g.properties.name));
  names.filter(n => !found.has(n)).forEach(n => { if (!hi) W('未找到国家：' + n); });
  const r = geoms.length ? topojson.merge(T, geoms) : null;
  mcache.set(key, r);
  return r;
}
function ring(r) {
  const c = [...r, r[0]];
  // d3 球面多边形要求外环顺时针；面积超过半球说明方向反了
  return d3.geoArea({ type: 'Polygon', coordinates: [c] }) > 2 * Math.PI ? c.reverse() : c;
}
function polityGeom(p, hi) {
  const coords = (p.parts || []).map(r => [ring(r)]);
  if (p.c) { const m = merged(p.c, hi); if (m) coords.push(...m.coordinates); }
  return { type: 'MultiPolygon', coordinates: coords };
}
function makeView(bbox, Wd, o = {}) {
  const [a, b, c, d] = bbox, span = c - a, pad = o.pad ?? 4;
  const pts = { type: 'MultiPoint', coordinates: [[a, b], [c, b], [c, d], [a, d], [(a + c) / 2, d], [(a + c) / 2, b]] };
  const proj = o.conic ? d3.geoConicEqualArea().parallels([b + (d - b) / 4, d - (d - b) / 4]).rotate([-(a + c) / 2, 0])
    : span > 60 ? d3.geoNaturalEarth1().rotate([-(a + c) / 2, 0]) : d3.geoMercator().rotate([-(a + c) / 2, 0]);
  proj.fitWidth(Wd - 2 * pad, pts);
  const [[x0, y0], [, y1]] = d3.geoPath(proj).bounds(pts);
  const H = Math.round(y1 - y0 + 2 * pad);
  proj.translate([proj.translate()[0] - x0 + pad, proj.translate()[1] - y0 + pad]);
  proj.clipExtent([[-10, -10], [Wd + 10, H + 10]]);
  const pth = d3.geoPath(proj).digits(1);
  const pt = ll => proj(ll).map(v => +v.toFixed(1));
  const inside = ll => { const q = proj(ll); return q && q[0] >= 0 && q[0] <= Wd && q[1] >= 0 && q[1] <= H; };
  const gstep = span > 200 ? 30 : span > 60 ? 15 : 5;
  return { proj, path: pth, pt, inside, W: Wd, H, span, grat: pth(d3.geoGraticule().step([gstep, gstep])()) };
}
const active = (y, o) => (o.start == null || o.start <= y) && (o.end == null || y <= o.end);

/* ---------- 地图 SVG（时间轴缩略图 / 全屏） ---------- */
function mapSVG(V, land, geo, y, title) {
  const ps = geo.polities.filter(p => active(y, p));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V.W} ${V.H}" class="tmap" role="img" aria-label="${title}">`;
  const ld = V.path(land), cid = 'c' + [...title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);
  s += `<clipPath id="${cid}"><path d="${ld}"/></clipPath><rect class="m-sea" width="${V.W}" height="${V.H}"/><path class="m-grat" d="${V.grat}"/><path class="m-land" d="${ld}"/>`;
  s += `<g clip-path="url(#${cid})">` + ps.map(p => { const d = V.path(polityGeom(p, V.span < 80)); return d ? `<path class="sp t-${p.tone}" d="${d}"/>` : ''; }).join('') + `</g>`;
  for (const p of ps) { if (!V.inside(p.label)) continue; const [x, yy] = V.pt(p.label); s += `<text class="spl t-${p.tone}" x="${x}" y="${yy}" text-anchor="middle">${p.name}</text>`; }
  for (const l of geo.labels || []) { if (!active(y, l) || !V.inside(l.at)) continue; const [x, yy] = V.pt(l.at); s += `<text class="spl t-o" x="${x}" y="${yy}" text-anchor="middle">${l.t}</text>`; }
  const pn = new Set(ps.map(p => p.name));
  for (const c of geo.cities || []) {
    if (!active(y, c) || !V.inside(c.at)) continue;
    const [x, yy] = V.pt(c.at), dx = (c.dx ?? 3) * 2, dy = (c.dy ?? 3) * 2;
    s += `<circle class="sc${c.cap ? ' cap' : ''}" cx="${x}" cy="${yy}" r="${c.cap ? 4 : 3}"/>`; if (pn.has(c.t)) continue; s += `<text class="sct" x="${(x + dx).toFixed(1)}" y="${(yy + dy).toFixed(1)}"${dx < 0 ? ' text-anchor="end"' : ''}>${c.t}</text>`;
  }
  return s + `</svg>`;
}

/* ---------- 单元地图模块 ---------- */
function geoFor(m, geo) {
  const V = makeView(m.bbox, 480, { pad: 0 });
  const land = V.span > 60 ? land110 : land50, hi = V.span < 80;
  const g = { W: V.W, H: V.H, land: V.path(land), grat: V.grat };
  const layer = y => ({
    y,
    polities: geo.polities.filter(p => active(y, p)).map(p => ({ tone: p.tone, name: p.name, d: V.path(polityGeom(p, hi)), l: V.pt(p.label) }))
      .filter(p => p.d),
    labels: (geo.labels || []).filter(l => active(y, l) && V.inside(l.at)).map(l => ({ t: l.t, l: V.pt(l.at) }))
  });
  if (m.routes) g.routes = m.routes.map(r => ({ d: V.path({ type: 'LineString', coordinates: r.pts }), end: V.pt(r.pts[r.pts.length - 1]) }));
  if (m.marks) g.marks = m.marks.map(([lo, la, t]) => [...V.pt([lo, la]), t]);
  if (m.year) g.layers = [layer(m.year)];
  if (m.steps) g.layers = m.steps.map(([y]) => layer(y));
  return g;
}
const MODNAME = { article: '知识篇章', steps: '时间线', poems: '诗文', route: '路线图', source: '史料研读', compare: '对比', chart: '数据', map: '地图', think: '思考', cause: '因果', flow: '流程图', table: '对照表', phases: '地图演变', exchange: '关系图', people: '人物群像', spans: '年表' };

/* ---------- 主流程 ---------- */
const periods = rd(SRC + 'periods.json');
const all = { events: [], people: [], rulers: [] };
const ids = { ev: new Set(), pp: new Set(), ls: new Set() };
const outPeriods = [];
const images = rdo(SRC + 'images.json', {});

for (const P of periods) {
  const dir = SRC + P.id + '/';
  if (!fs.existsSync(dir + 'events.json')) { W('缺少时期：' + P.id); continue; }
  const events = rd(dir + 'events.json'), people = rdo(dir + 'people.json', []), rulers = rdo(dir + 'rulers.json', []);
  const geo = rd(dir + 'geo.json'), unit = rdo(dir + 'unit.json', null);
  for (const e of events) {
    e.period = P.id;
    if (ids.ev.has(e.id)) W('重复事件 id：' + e.id); ids.ev.add(e.id);
    for (const k of ['title', 'summary', 'year', 'side', 'at']) if (e[k] == null) W(`${e.id} 缺少 ${k}`);
    if (!e.bg && !e.detail) W(`${e.id} 缺少正文`);
    if (e.side === 'world' && !(e.region || []).length) W(`${e.id} 缺少地区`);
    if (e.year < P.start - 5 || e.year > P.end + 5) W(`${e.id} 年份 ${e.year} 超出 ${P.name}`);
  }
  for (const p of people) { p.period = P.id; if (ids.pp.has(p.id)) W('重复人物 id：' + p.id); ids.pp.add(p.id); }
  const cnStates = new Set(geo.polities.filter(p => p.tone === 'cn' || p.tone === 'cn2').map(p => p.state));
  for (const r of rulers) { if (cnStates.has(r.state)) r.cn = 1; }
  all.events.push(...events); all.people.push(...people); all.rulers.push(...rulers);

  // 年份切片地图
  const V = makeView(geo.view.bbox, 480);
  const slice = {
    W: V.W, H: V.H, base: V.path(land110), grat: V.grat,
    polities: geo.polities.map(p => ({ state: p.state, name: p.name, tone: p.tone, start: p.start, end: p.end, desc: p.desc, small: p.small, d: V.path(polityGeom(p)), l: V.pt(p.label), sub: p.sub ? { t: p.sub.t, l: V.pt(p.sub.at) } : undefined })).map(p => p.d ? p : { ...p, d: '' }),
    labels: (geo.labels || []).map(l => ({ t: l.t, start: l.start, end: l.end, l: V.pt(l.at) })),
    cities: (geo.cities || []).map(c => ({ t: c.t, cap: c.cap, start: c.start, end: c.end, dx: c.dx, dy: c.dy, p: V.pt(c.at) })),
    ev: Object.fromEntries(events.filter(e => e.at && V.inside(e.at)).map(e => [e.id, V.pt(e.at)]))
  };
  wr(`data/slice/${P.id}.json`, slice);

  // 时间轴缩略图：中国 + 世界
  const rep = P.rep ?? Math.round((P.start + P.end) / 2);
  wr(`maps/cn-${P.id}.svg`, mapSVG(makeView([72, 16, 137, 54], 720, { conic: true, pad: 8 }), land50, geo, rep, `${P.name}·中国形势示意（${rep < 0 ? '前' + -rep : rep}年）`));
  wr(`maps/w-${P.id}.svg`, mapSVG(makeView(geo.view.bbox, 720, { pad: 8 }), land110, geo, rep, `${P.name}·同期世界示意（${rep < 0 ? '前' + -rep : rep}年）`));

  // 单元
  let usum = null;
  if (unit) {
    let no = 0;
    for (const l of unit.lessons) {
      if (ids.ls.has(l.id)) W('重复课程 id：' + l.id); ids.ls.add(l.id);
      if (!l.special) l.no = ++no;
      for (const m of l.modules) {
        if (m.bbox) {
          m.geo = geoFor(m, geo); delete m.bbox; delete m.marks; delete m.year;
          if (m.routes) m.routes = m.routes.map(r => ({ name: r.name, tone: r.tone, note: r.note }));
        }
        if (m.type === 'img' && !images[m.key]) W(`${l.id} 图片缺失：${m.key}`);
      }
    }
    wr(`data/units/${P.id}.json`, unit);
    usum = { title: unit.title, years: unit.years, lessons: unit.lessons.map(l => ({ id: l.id, title: l.title, side: l.side, special: !!l.special, no: l.no, kinds: [...new Set(l.modules.map(m => MODNAME[m.type]).filter(Boolean))].slice(0, 3) })) };
  }
  outPeriods.push({ id: P.id, name: P.name, start: P.start, end: P.end, world: P.world, step: P.step || 1, rep, unit: usum, n: { events: events.length, people: people.length } });
}

// 交叉引用检查
const evIds = ids.ev, ppIds = ids.pp;
for (const e of all.events) {
  (e.causes || []).forEach(c => evIds.has(c) || W(`${e.id} 前因不存在：${c}`));
  (e.links || []).forEach(l => evIds.has(l.id) || W(`${e.id} 关联不存在：${l.id}`));
  (e.people || []).forEach(p => ppIds.has(p) || W(`${e.id} 人物不存在：${p}`));
}
for (const P of outPeriods) {
  const f = ROOT + `data/units/${P.id}.json`;
  if (!fs.existsSync(f)) continue;
  for (const l of rd(f).lessons) for (const m of l.modules) {
    if (m.type === 'events') m.ids.forEach(i => evIds.has(i) || W(`${l.id} 事件不存在：${i}`));
    if (m.type === 'people') m.ids.forEach(i => ppIds.has(i) || W(`${l.id} 人物不存在：${i}`));
  }
}
for (const k of Object.keys(images._ev || {})) evIds.has(k) || W('图片关联事件不存在：' + k);

all.events.sort((a, b) => a.year - b.year || (a.side < b.side ? -1 : 1));
wr('data/events.json', all.events);
wr('data/people.json', all.people);
wr('data/rulers.json', all.rulers);
wr('data/periods.json', outPeriods);
wr('data/images.json', images);

const kb = f => (fs.statSync(ROOT + f).size / 1024).toFixed(0) + 'KB';
console.log(`事件 ${all.events.length}（中 ${all.events.filter(e => e.side === 'cn').length} / 外 ${all.events.filter(e => e.side !== 'cn').length}）· 人物 ${all.people.length} · 君主 ${all.rulers.length} · 课程 ${ids.ls.size}`);
console.log('events.json', kb('data/events.json'), '· periods', outPeriods.map(p => `${p.name}:${p.n.events}/${p.unit ? p.unit.lessons.length : 0}`).join(' '));
if (warn.length) { console.log(`\n⚠ ${warn.length} 条问题：`); warn.slice(0, 80).forEach(w => console.log(' - ' + w)); process.exitCode = warn.some(w => /不存在|重复|缺少正文|缺少 (title|year|side)/.test(w)) ? 1 : 0; }
