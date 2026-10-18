/* 记录模块：随手记 + 防丢失（双份存储、回收站、快照）+ 导出/导入备份
   依赖 app.js 里的全局：$ esc toast S D render closeSheet */
(function () {
'use strict';
const LS = 'zy.notes.v1', LSM = 'zy.notes.meta', LSD = 'zy.notes.draft';
const DAY = 864e5, TRASH_DAYS = 30, SNAP_GAP = 30 * 60e3, SNAP_KEEP = 8, REMIND_DAYS = 7;
let notes = [];
let meta = { lastExport: 0, lastSnap: 0, dirty: 0 };
const ui = { q: '', tag: '', view: 'main', link: null, edit: null };

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

/* ---------- 渲染 ---------- */
function bannerHTML() {
  const n = live().length;
  if (!n || !meta.dirty) return '';
  const never = !meta.lastExport;
  if (!never && now() - meta.lastExport < REMIND_DAYS * DAY) return '';
  return `<div class="nt-banner"><div><b>建议备份一次</b><span>${meta.dirty} 处改动还没导出 · 上次备份：${ago(meta.lastExport)}</span></div><button class="btn pri" data-na="export">立即备份</button></div>`;
}
function cardHTML(n) {
  if (ui.edit === n.id) {
    return `<div class="nt-card editing"><textarea id="nt-edit" rows="5">${esc(n.text)}</textarea>
      <div class="nt-row"><button class="btn" data-na="editcancel">取消</button><button class="btn pri" data-na="editsave" data-v="${n.id}">保存</button></div></div>`;
  }
  const lk = n.link ? `<button class="nt-link ${n.link.k === 'ev' ? 'w' : 'cn'}" ${n.link.k === 'ev' ? 'data-ev' : 'data-person'}="${esc(n.link.id)}">${n.link.k === 'ev' ? '事件' : '人物'} · ${esc(n.link.title)}</button>` : '';
  return `<div class="nt-card ${n.pin ? 'pin' : ''}"><div class="nt-text">${richText(n.text)}</div>${lk}
    <div class="nt-meta"><span>${n.pin ? '置顶 · ' : ''}${fmt(n.ts)}${n.upd > n.ts + 1000 ? ' · 已编辑' : ''}</span>
    <span class="nt-act"><button data-na="edit" data-v="${n.id}">编辑</button><button data-na="pin" data-v="${n.id}">${n.pin ? '取消置顶' : '置顶'}</button><button data-na="del" data-v="${n.id}">删除</button></span></div></div>`;
}
function filtered() {
  const q = ui.q.toLowerCase();
  return live().filter(n => (!ui.tag || tagsOf(n.text).includes(ui.tag)) && (!q || (n.text + (n.link ? n.link.title : '')).toLowerCase().includes(q)))
    .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.ts - a.ts);
}
function listHTML() {
  const l = filtered();
  if (!l.length) return `<div class="center" style="font-size:13px;padding:18px 0">${live().length ? '没有符合条件的记录' : '还没有记录。上面写一条试试，或在任意事件、人物里点「记一笔」。'}</div>`;
  return l.map(cardHTML).join('');
}
function tagsHTML() {
  const c = {}; live().forEach(n => tagsOf(n.text).forEach(t => c[t] = (c[t] || 0) + 1));
  const ks = Object.keys(c).sort((a, b) => c[b] - c[a]);
  return ks.length ? `<div class="nt-tags">${ks.map(t => `<button class="nt-chip ${ui.tag === t ? 'on' : ''}" data-na="tag" data-v="${t}">#${t} <small>${c[t]}</small></button>`).join('')}</div>` : '';
}
function mainHTML() {
  const lk = ui.link ? `<div class="nt-attach"><span>关联：${ui.link.k === 'ev' ? '事件' : '人物'} · ${esc(ui.link.title)}</span><button data-na="unlink" aria-label="取消关联">×</button></div>` : '';
  return `<div class="page"><h2 class="page-h">记录</h2>${bannerHTML()}
    <div class="card nt-new"><textarea id="nt-in" rows="3" placeholder="随手记点什么…（用 #标签 分类）"></textarea>${lk}
      <div class="nt-row"><span class="nt-hint">草稿自动保存</span><button class="btn pri" data-na="add">保存</button></div></div>
    <input id="nt-q" class="nt-search" type="search" placeholder="搜索记录" value="${esc(ui.q)}" autocomplete="off">
    ${tagsHTML()}<div id="nt-list">${listHTML()}</div>
    <div class="card nt-backup"><h3>备份与导出</h3>
      <p class="nt-stat">共 ${live().length} 条 · 上次备份：${ago(meta.lastExport)}${meta.dirty ? ` · ${meta.dirty} 处改动未备份` : ''}<br>记录同时存在两处本机存储，并已申请「持久存储」。仍建议定期导出，换手机或清理浏览器数据前务必导出。</p>
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
      + `<button class="btn" style="margin-top:8px" data-na="emptytrash">清空最近删除</button>` : '<div class="center" style="font-size:13px;padding:18px 0">这里是空的</div>'}</div>`;
}
let snapCache = [];
function snapsHTML() {
  return `<div class="page"><div class="crumb"><button data-na="view" data-v="main">‹ 返回记录</button></div><h2 class="page-h">自动快照</h2>
    <p class="nt-stat" style="margin:0 0 10px">每隔一段时间、导入备份前会自动留一份，最多保留 ${SNAP_KEEP} 份。「找回」只会补回现在缺失的记录，不会覆盖已有内容。</p>
    ${snapCache.length ? snapCache.map((s, i) => `<button class="list-btn" data-na="snaprestore" data-v="${i}"><span>${fmt(s.t)} · ${s.n} 条</span><span>找回</span></button>`).join('') : '<div class="center" style="font-size:13px;padding:18px 0">还没有快照</div>'}</div>`;
}
function renderNotes() {
  const v = ui.view;
  if (v === 'snaps') { idbGet('snaps').then(a => { snapCache = a || []; $('#view').innerHTML = snapsHTML(); }); return; }
  $('#view').innerHTML = v === 'trash' ? trashHTML() : mainHTML();
  if (v === 'main') { const ta = $('#nt-in'); if (ta) ta.value = lsGet(LSD, ''); }
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
function backupJSON() { return JSON.stringify({ app: 'zuoyou-notes', version: 1, exported: new Date().toISOString(), count: live().length, notes: notes.filter(n => !n.purged) }, null, 1); }
function allText() {
  return live().sort((a, b) => b.ts - a.ts).map(n => `## ${fmt(n.ts)}${n.link ? ' · ' + (n.link.k === 'ev' ? '事件' : '人物') + '：' + n.link.title : ''}\n\n${n.text}\n`).join('\n');
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
      renderNotes(); toast(`导入完成：新增 ${a} 条，更新 ${u} 条`);
    } catch (e) { toast('这个文件不是有效的备份'); }
  };
  r.readAsText(file);
}

/* ---------- 事件处理 ---------- */
function openQuick(k, id) {
  const title = k === 'ev' ? (D.ev[id] || {}).title : (D.pp[id] || {}).name;
  if (!title) return;
  ui.link = { k, id, title }; ui.view = 'main'; ui.edit = null;
  closeSheet(); S.tab = 'notes'; render(); window.scrollTo(0, 0);
  setTimeout(() => { const ta = $('#nt-in'); if (ta) ta.focus(); }, 60);
}
window.Notes = { quick: openQuick };

document.addEventListener('input', e => {
  if (e.target.id === 'nt-in') lsSet(LSD, e.target.value);
  if (e.target.id === 'nt-q') { ui.q = e.target.value.trim(); $('#nt-list').innerHTML = listHTML(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'nt-file' && e.target.files[0]) { doImport(e.target.files[0]); e.target.value = ''; }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-na]'); if (!t) return;
  const a = t.dataset.na, v = t.dataset.v, n = notes.find(x => x.id === v);
  const acts = {
    add() {
      const ta = $('#nt-in'), text = ta.value.trim();
      if (!text) { toast('先写点内容'); return; }
      notes.push({ id: uid(), text, ts: now(), upd: now(), link: ui.link || null, pin: false, del: null });
      ui.link = null; lsSet(LSD, ''); save(); askPersist(); renderNotes(); toast('已保存');
    },
    unlink() { ui.link = null; const d = $('#nt-in').value; renderNotes(); $('#nt-in').value = d; },
    edit() { ui.edit = v; renderNotes(); const ta = $('#nt-edit'); if (ta) ta.focus(); },
    editcancel() { ui.edit = null; renderNotes(); },
    editsave() { const text = $('#nt-edit').value.trim(); if (!text) { toast('内容不能为空；要删除请用「删除」'); return; } n.text = text; n.upd = now(); ui.edit = null; save(); renderNotes(); },
    pin() { n.pin = !n.pin; n.upd = now(); save(); renderNotes(); },
    del() { n.del = now(); n.upd = now(); save(); renderNotes(); toast(`已移到「最近删除」，${TRASH_DAYS} 天内可恢复`); },
    restore() { n.del = null; n.upd = now(); save(); renderNotes(); toast('已恢复'); },
    purge() { if (confirm('彻底删除后无法恢复，确定吗？')) { n.purged = true; n.text = ''; n.upd = now(); save(); renderNotes(); } },
    emptytrash() { if (confirm('清空「最近删除」？此操作无法恢复。')) { trash().forEach(x => { x.purged = true; x.text = ''; x.upd = now(); }); save(); renderNotes(); } },
    tag() { ui.tag = ui.tag === v ? '' : v; ui.view = 'main'; renderNotes(); window.scrollTo(0, 0); },
    view() { ui.view = v; ui.edit = null; renderNotes(); window.scrollTo(0, 0); },
    export() { deliver(`zuoyou-notes-${stamp()}.json`, 'application/json', backupJSON()).then(markExported); },
    exporttxt() { deliver(`zuoyou-notes-${stamp()}.md`, 'text/markdown', allText()).then(ok => ok && toast('已导出文本')); },
    copy() { const s = allText(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => toast('已复制全部文字'), () => toast('复制失败，请改用导出')); },
    import() { $('#nt-file').click(); },
    snaprestore() { const s = snapCache[+v]; if (!s) return; const [add] = merge(s.notes.map(x => Object.assign({}, x))); notes.forEach(x => { if (x.del && s.notes.some(y => y.id === x.id && !y.del)) { x.del = null; x.upd = now(); } }); save(); ui.view = 'main'; renderNotes(); toast(add ? `已找回 ${add} 条` : '没有缺失的记录'); },
    quick() { openQuick(t.dataset.k, t.dataset.id); }
  };
  if (acts[a]) { e.stopPropagation(); acts[a](); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.tab === 'notes' && ui.view === 'main') { const ta = $('#nt-in'); if (ta) lsSet(LSD, ta.value); } });

init();
})();
