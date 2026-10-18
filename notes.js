/* 笔记模块：跟着课程走（学完记）+ 事件/人物就地记 + 「记录」页汇总复习
   防丢失：双份存储、草稿、回收站、快照；导出/导入备份（含思考题作答）
   依赖 app.js 里的全局：$ esc toast store S D render closeSheet */
(function () {
'use strict';
const LS = 'zy.notes.v1', LSM = 'zy.notes.meta', LSD = 'zy.notes.draft.';
const DAY = 864e5, TRASH_DAYS = 30, SNAP_GAP = 30 * 60e3, SNAP_KEEP = 8, REMIND_DAYS = 7;
let notes = [];
let meta = { lastExport: 0, lastSnap: 0, dirty: 0 };
const ui = { q: '', tag: '', view: 'main', edit: null };

const now = () => Date.now();
const uid = () => 'n' + now().toString(36) + Math.random().toString(36).slice(2, 7);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* ---------- IndexedDB（第二份存储 + 快照） ---------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('zy-notes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
const idbGet = k => db().then(d => new Promise((res, rej) => {
  const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
})).catch(() => undefined);
const idbSet = (k, v) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
})).catch(() => false);

/* ---------- 数据 ---------- */
const live = () => notes.filter(n => !n.purged && !n.del);
const trash = () => notes.filter(n => !n.purged && n.del);

// 按 id 合并：同 id 取更新时间新的；返回 [新增数, 更新数]
function merge(list) {
  let add = 0, upd = 0;
  for (const n of list) {
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string') continue;
    const ex = notes.find(x => x.id === n.id);
    if (!ex) { notes.push(n); add++; }
    else if ((n.upd || 0) > (ex.upd || 0)) { Object.assign(ex, n); upd++; }
  }
  return [add, upd];
}
function expire() {
  const lim = now() - TRASH_DAYS * DAY;
  notes.forEach(n => { if (n.del && n.del < lim && !n.purged) { n.purged = true; n.text = ''; n.upd = now(); } });
}
function save(clean) {
  lsSet(LS, notes);
  idbSet('notes', notes);
  if (!clean) meta.dirty++;
  lsSet(LSM, meta);
  snapshotMaybe();
}
function snapshotMaybe(force) {
  if (!live().length) return;
  if (!force && now() - meta.lastSnap < SNAP_GAP) return;
  meta.lastSnap = now(); lsSet(LSM, meta);
  const copy = JSON.parse(JSON.stringify(notes)), n = live().length, t = now();
  idbGet('snaps').then(arr => idbSet('snaps', [{ t, n, notes: copy }, ...(arr || [])].slice(0, SNAP_KEEP)));
}
function askPersist() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }
function addNote(text, link) {
  notes.push({ id: uid(), text, ts: now(), upd: now(), link: link || null, pin: false, del: null });
  save(); askPersist();
}
const refresh = () => { if (S.tab === 'notes') renderNotes(); else render(); };

function init() {
  notes = lsGet(LS, []);
  if (!Array.isArray(notes)) notes = [];
  meta = Object.assign(meta, lsGet(LSM, {}));
  expire();
  idbGet('notes').then(arr => {
    if (Array.isArray(arr)) {
      const before = notes.length; merge(arr); expire();
      if (notes.length !== before) { save(true); if (S.tab === 'notes') renderNotes(); }
    }
    save(true);
  });
}

/* ---------- 课程信息 ---------- */
let lessonInfo = null;
function lessons() {
  if (lessonInfo) return lessonInfo;
  lessonInfo = {};
  (D.periods || []).forEach((p, pi) => (p.unit ? p.unit.lessons : []).forEach((l, li) => {
    lessonInfo[l.id] = { title: l.title, pid: p.id, unit: p.name, order: pi * 1000 + li, no: l.special ? '专题' : '第 ' + l.no + ' 课' };
  }));
  return lessonInfo;
}

/* ---------- 格式化 ---------- */
const pad = n => String(n).padStart(2, '0');
function fmt(ts) {
  const d = new Date(ts), y = d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '年';
  return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
const ago = ts => { if (!ts) return '从未'; const d = Math.floor((now() - ts) / DAY); return d <= 0 ? '今天' : d + ' 天前'; };
const tagsOf = t => [...new Set((t.match(/#[^\s#，。,.!！?？；;:：]+/g) || []).map(s => s.slice(1)))];
const richText = t => esc(t).replace(/#[^\s#，。,.!！?？；;:：&]+/g, m => `<span class="nt-tag" data-na="tag" data-v="${m.slice(1)}">${m}</span>`);
const KIND = { lesson: '课程', ev: '事件', person: '人物' };

/* ---------- 渲染：卡片 / 课程笔记框 ---------- */
function chipHTML(n) {
  if (!n.link) return '';
  const k = n.link.k, id = esc(n.link.id), label = `${KIND[k] || ''} · ${esc(n.link.title)}`;
  if (k === 'ev') return `<button class="nt-link w" data-ev="${id}">${label}</button>`;
  if (k === 'person') return `<button class="nt-link cn" data-person="${id}">${label}</button>`;
  return `<button class="nt-link cn" data-na="golesson" data-v="${id}">${label}</button>`;
}
function cardHTML(n, noChip) {
  if (ui.edit === n.id) {
    return `<div class="nt-card editing"><textarea id="nt-edit" rows="5">${esc(n.text)}</textarea>
      <div class="nt-row"><button class="btn" data-na="editcancel">取消</button><button class="btn pri" data-na="editsave" data-v="${n.id}">保存</button></div></div>`;
  }
  return `<div class="nt-card ${n.pin ? 'pin' : ''}"><div class="nt-text">${richText(n.text)}</div>${noChip ? '' : chipHTML(n)}
    <div class="nt-meta"><span>${n.pin ? '置顶 · ' : ''}${fmt(n.ts)}${n.upd > n.ts + 1000 ? ' · 已编辑' : ''}</span>
    <span class="nt-act"><button data-na="edit" data-v="${n.id}">编辑</button><button data-na="pin" data-v="${n.id}">${n.pin ? '取消置顶' : '置顶'}</button><button data-na="del" data-v="${n.id}">删除</button></span></div></div>`;
}
const draftOf = key => lsGet(LSD + key, '');
function boxHTML(cls, title, key, ph, k, id, t, cancel) {
  return `<section class="card ${cls}"><h3>${title}</h3>
    <textarea class="nt-ta" data-draft="${esc(key)}" rows="3" placeholder="${ph}">${esc(draftOf(key))}</textarea>
    <div class="nt-row"><span class="nt-hint">草稿自动保存</span><span class="nt-btns">${cancel ? '<button class="btn" data-na="qcancel">取消</button>' : ''}<button class="btn pri" data-na="${cancel ? 'qsave' : 'lsave'}" data-k="${k}" data-id="${esc(id)}" data-t="${esc(t)}">保存</button></span></div></section>`;
}
// 课程页底部：学完记一笔 + 这一课已有的笔记
function lessonBox(l) {
  const own = live().filter(n => n.link && n.link.k === 'lesson' && n.link.id === l.id).sort((a, b) => b.ts - a.ts);
  const box = boxHTML('nt-lbox', '学完记一笔', 'lesson:' + l.id, '这一课学到了什么？还有哪里没弄懂？（用 #标签 分类）', 'lesson', l.id, l.title, false);
  return own.length ? box.replace('</section>', `<div class="nt-own">${own.map(n => cardHTML(n, true)).join('')}</div></section>`) : box;
}

/* ---------- 渲染：记录页（按课程汇总复习） ---------- */
function bannerHTML() {
  const n = live().length;
  if (!n || !meta.dirty) return '';
  if (meta.lastExport && now() - meta.lastExport < REMIND_DAYS * DAY) return '';
  return `<div class="nt-banner"><div><b>建议备份一次</b><span>${meta.dirty} 处改动还没导出 · 上次备份：${ago(meta.lastExport)}</span></div><button class="btn pri" data-na="export">立即备份</button></div>`;
}
function filtered() {
  const q = ui.q.toLowerCase();
  return live().filter(n => (!ui.tag || tagsOf(n.text).includes(ui.tag)) && (!q || (n.text + (n.link ? n.link.title : '')).toLowerCase().includes(q)))
    .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.ts - a.ts);
}
function listHTML() {
  const l = filtered();
  if (!l.length) return `<div class="center nt-empty">${live().length ? '没有符合条件的笔记' : '还没有笔记。<br>学完一课后，在课程页底部写几句；也可以在事件、人物详情里点「＋ 记一笔」。<br>写下的笔记会按课程汇总在这里，方便复习。'}</div>`;
  const info = lessons(), groups = new Map();
  for (const n of l) {
    let key = 'O', head = '其他', order = 9e6, sub = '', go = '';
    if (n.link && n.link.k === 'lesson') {
      const li = info[n.link.id];
      key = 'L:' + n.link.id; head = (li ? li.no + ' · ' : '') + n.link.title; sub = li ? li.unit + '单元' : ''; order = li ? li.order : 8e6; go = n.link.id;
    } else if (n.link) { key = 'E'; head = '事件与人物'; order = 7e6; }
    if (!groups.has(key)) groups.set(key, { head, sub, order, go, items: [] });
    groups.get(key).items.push(n);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order).map(g =>
    `<div class="nt-group">${g.go ? `<button class="nt-gh" data-na="golesson" data-v="${esc(g.go)}"><b>${esc(g.head)}</b><span>${esc(g.sub)} ›</span></button>` : `<div class="nt-gh plain"><b>${esc(g.head)}</b></div>`}
    ${g.items.map(n => cardHTML(n, !!g.go)).join('')}</div>`).join('');
}
function tagsHTML() {
  const c = {}; live().forEach(n => tagsOf(n.text).forEach(t => c[t] = (c[t] || 0) + 1));
  const ks = Object.keys(c).sort((a, b) => c[b] - c[a]);
  return ks.length ? `<div class="nt-tags">${ks.map(t => `<button class="nt-chip ${ui.tag === t ? 'on' : ''}" data-na="tag" data-v="${t}">#${t} <small>${c[t]}</small></button>`).join('')}</div>` : '';
}
function mainHTML() {
  return `<div class="page">${bannerHTML()}
    <p class="nt-lead">共 ${live().length} 条笔记，按课程汇总。学完一课，在课程页底部记。</p>
    <input id="nt-q" class="nt-search" type="search" placeholder="搜索笔记" value="${esc(ui.q)}" autocomplete="off">
    ${tagsHTML()}<div id="nt-list">${listHTML()}</div>
    <div class="card nt-backup"><h3>备份与导出</h3>
      <p class="nt-stat">共 ${live().length} 条 · 上次备份：${ago(meta.lastExport)}${meta.dirty ? ` · ${meta.dirty} 处改动未备份` : ''}<br>笔记同时存在两处本机存储，并已申请「持久存储」；课程里「思考题」的作答也会一并备份。仍建议定期导出，换手机或清理浏览器数据前务必导出。</p>
      <button class="list-btn" data-na="export"><span>导出完整备份（.json）</span><span>推荐</span></button>
      <button class="list-btn" data-na="exporttxt"><span>导出为文本（.md）</span><span></span></button>
      <button class="list-btn" data-na="copy"><span>复制全部文字</span><span></span></button>
      <button class="list-btn" data-na="import"><span>从备份文件导入</span><span>合并，不覆盖</span></button>
      <button class="list-btn" data-na="view" data-v="trash"><span>最近删除</span><span>${trash().length} 条</span></button>
      <button class="list-btn" data-na="view" data-v="snaps"><span>自动快照</span><span>找回误删</span></button>
      <input id="nt-file" type="file" accept=".json,application/json" hidden></div></div>`;
}
function trashHTML() {
  const l = trash().sort((a, b) => b.del - a.del);
  return `<div class="page"><div class="crumb"><button data-na="view" data-v="main">‹ 返回记录</button></div><h2 class="page-h">最近删除</h2>
    <p class="nt-stat" style="margin:0 0 10px">删除后保留 ${TRASH_DAYS} 天，之后自动清除。</p>
    ${l.length ? l.map(n => `<div class="nt-card"><div class="nt-text">${richText(n.text)}</div><div class="nt-meta"><span>删除于 ${fmt(n.del)}</span>
      <span class="nt-act"><button data-na="restore" data-v="${n.id}">恢复</button><button data-na="purge" data-v="${n.id}">彻底删除</button></span></div></div>`).join('')
      + `<button class="btn" style="margin-top:8px" data-na="emptytrash">清空最近删除</button>` : '<div class="center nt-empty">这里是空的</div>'}</div>`;
}
let snapCache = [];
function snapsHTML() {
  return `<div class="page"><div class="crumb"><button data-na="view" data-v="main">‹ 返回记录</button></div><h2 class="page-h">自动快照</h2>
    <p class="nt-stat" style="margin:0 0 10px">每隔一段时间、导入备份前会自动留一份，最多保留 ${SNAP_KEEP} 份。「找回」只会补回现在缺失的笔记，不会覆盖已有内容。</p>
    ${snapCache.length ? snapCache.map((s, i) => `<button class="list-btn" data-na="snaprestore" data-v="${i}"><span>${fmt(s.t)} · ${s.n} 条</span><span>找回</span></button>`).join('') : '<div class="center nt-empty">还没有快照</div>'}</div>`;
}
function renderNotes() {
  const v = ui.view;
  if (v === 'snaps') { idbGet('snaps').then(a => { snapCache = a || []; $('#view').innerHTML = snapsHTML(); }); return; }
  $('#view').innerHTML = v === 'trash' ? trashHTML() : mainHTML();
}
window.renderNotes = renderNotes;

/* ---------- 导出 / 导入 ---------- */
function deliver(name, mime, text) {
  const file = new File([text], name, { type: mime });
  const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return true; };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: name }).then(() => true).catch(e => (e && e.name === 'AbortError') ? false : dl());
  }
  return Promise.resolve(dl());
}
const markExported = ok => { if (ok) { meta.lastExport = now(); meta.dirty = 0; lsSet(LSM, meta); toast('已导出备份'); if (S.tab === 'notes' && ui.view === 'main') renderNotes(); } };
// 思考题作答（课程里的「先写下你的看法」）存在 zy.note.* 里，一并备份
function answers() {
  const o = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('zy.note.') === 0) { const v = localStorage.getItem(k); if (v && v !== '""') o[k] = v; } } } catch (e) {}
  return o;
}
function backupJSON() { return JSON.stringify({ app: 'zuoyou-notes', version: 2, exported: new Date().toISOString(), count: live().length, notes: notes.filter(n => !n.purged), answers: answers() }, null, 1); }
function allText() {
  const info = lessons();
  return live().sort((a, b) => b.ts - a.ts).map(n => {
    const li = n.link && n.link.k === 'lesson' ? info[n.link.id] : null;
    const tag = n.link ? ' · ' + (KIND[n.link.k] || '') + '：' + (li ? li.no + ' ' : '') + n.link.title : '';
    return `## ${fmt(n.ts)}${tag}\n\n${n.text}\n`;
  }).join('\n');
}
function doImport(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const list = Array.isArray(d) ? d : d.notes;
      if (!Array.isArray(list) || !list.some(n => n && typeof n.id === 'string' && typeof n.text === 'string')) throw 0;
      snapshotMaybe(true);
      const [a, u] = merge(list); expire(); save();
      let ans = 0;
      if (d && d.answers && typeof d.answers === 'object') Object.keys(d.answers).forEach(k => { if (k.indexOf('zy.note.') === 0) { try { const cur = localStorage.getItem(k); if (!cur || cur === '""') { localStorage.setItem(k, d.answers[k]); ans++; } } catch (e) {} } });
      refresh(); toast(`导入完成：新增 ${a} 条，更新 ${u} 条${ans ? `，找回 ${ans} 条作答` : ''}`);
    } catch (e) { toast('这个文件不是有效的备份'); }
  };
  r.readAsText(file);
}

/* ---------- 事件处理 ---------- */
function openQuickBox(t) {
  const row = t.closest('.s-actions'); if (!row) return;
  const nx = row.nextElementSibling;
  if (nx && nx.classList.contains('nt-qbox')) { nx.remove(); return; }
  const k = t.dataset.k, id = t.dataset.id;
  const title = k === 'ev' ? (D.ev[id] || {}).title : (D.pp[id] || {}).name;
  if (!title) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = boxHTML('nt-qbox', `记一笔 · ${KIND[k]}「${esc(title)}」`, k + ':' + id, '写下想法或疑问…（用 #标签 分类）', k, id, title, true);
  const box = wrap.firstElementChild; row.after(box);
  const ta = box.querySelector('textarea'); ta.focus(); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.draft;
  if (k) lsSet(LSD + k, e.target.value);
  if (e.target.id === 'nt-q') { ui.q = e.target.value.trim(); $('#nt-list').innerHTML = listHTML(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'nt-file' && e.target.files[0]) { doImport(e.target.files[0]); e.target.value = ''; }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-na]'); if (!t) return;
  const a = t.dataset.na, v = t.dataset.v, n = notes.find(x => x.id === v);
  const saveBox = (after) => {
    const box = t.closest('section'), ta = box.querySelector('.nt-ta'), text = ta.value.trim();
    if (!text) { toast('先写点内容'); return; }
    addNote(text, { k: t.dataset.k, id: t.dataset.id, title: t.dataset.t });
    lsSet(LSD + ta.dataset.draft, ''); after(box);
  };
  const acts = {
    lsave() { saveBox(() => { toast('已保存，可在「记录」页复习'); refresh(); }); },
    qsave() { saveBox(box => { box.remove(); toast('已保存，可在「记录」页查看'); }); },
    qcancel() { t.closest('section').remove(); },
    quick() { openQuickBox(t); },
    golesson() { S.tab = 'learn'; S.unit = D.lessonPid[v] || S.unit; S.lesson = v; S.learnView = 'lesson'; store.set('last', v); closeSheet(); render(); window.scrollTo(0, 0); },
    edit() { ui.edit = v; refresh(); const ta = $('#nt-edit'); if (ta) ta.focus(); },
    editcancel() { ui.edit = null; refresh(); },
    editsave() { const text = $('#nt-edit').value.trim(); if (!text) { toast('内容不能为空；要删除请用「删除」'); return; } n.text = text; n.upd = now(); ui.edit = null; save(); refresh(); },
    pin() { n.pin = !n.pin; n.upd = now(); save(); refresh(); },
    del() { n.del = now(); n.upd = now(); save(); refresh(); toast(`已移到「最近删除」，${TRASH_DAYS} 天内可恢复`); },
    restore() { n.del = null; n.upd = now(); save(); renderNotes(); toast('已恢复'); },
    purge() { if (confirm('彻底删除后无法恢复，确定吗？')) { n.purged = true; n.text = ''; n.upd = now(); save(); renderNotes(); } },
    emptytrash() { if (confirm('清空「最近删除」？此操作无法恢复。')) { trash().forEach(x => { x.purged = true; x.text = ''; x.upd = now(); }); save(); renderNotes(); } },
    tag() { ui.tag = ui.tag === v ? '' : v; ui.view = 'main'; if (S.tab !== 'notes') { closeSheet(); S.tab = 'notes'; render(); } else renderNotes(); window.scrollTo(0, 0); },
    view() { ui.view = v; ui.edit = null; renderNotes(); window.scrollTo(0, 0); },
    export() { deliver(`zuoyou-notes-${stamp()}.json`, 'application/json', backupJSON()).then(markExported); },
    exporttxt() { deliver(`zuoyou-notes-${stamp()}.md`, 'text/markdown', allText()).then(ok => ok && toast('已导出文本')); },
    copy() { const s = allText(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => toast('已复制全部文字'), () => toast('复制失败，请改用导出')); },
    import() { $('#nt-file').click(); },
    snaprestore() { const s = snapCache[+v]; if (!s) return; const [add] = merge(s.notes.map(x => Object.assign({}, x))); notes.forEach(x => { if (x.del && s.notes.some(y => y.id === x.id && !y.del)) { x.del = null; x.upd = now(); } }); save(); ui.view = 'main'; renderNotes(); toast(add ? `已找回 ${add} 条` : '没有缺失的笔记'); }
  };
  if (acts[a]) { e.stopPropagation(); acts[a](); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelectorAll('.nt-ta').forEach(ta => ta.dataset.draft && lsSet(LSD + ta.dataset.draft, ta.value));
});

window.Notes = { lessonBox };
init();
})();
