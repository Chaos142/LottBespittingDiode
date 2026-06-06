// ===== STATE =====
let port = null, writer = null;
let currentTab = 'library';
let currentLibraryView = (localStorage.getItem('lbd_library_view') === 'favorites') ? 'favorites' : 'overview';
let selectedRemoteId = null;
let logBarOpen = false;
let logUnread = 0;
let txHistory = JSON.parse(localStorage.getItem('lbd_history') || '[]'); // [{id,ts,label,addr,cmd,proto}]
let remoteCardExpanded = {};

let library = JSON.parse(localStorage.getItem('lbd_library') || '[]');
let nextId = parseInt(localStorage.getItem('lbd_nextid') || '1');
let sidebarFolderOpen = JSON.parse(localStorage.getItem('lbd_sidebar_open') || '{}');
let libraryFolderOpen = JSON.parse(localStorage.getItem('lbd_library_open') || '{}');
let sidebarSearchQuery = '';
let librarySearchQuery = '';
let libraryCurrentFolderId = null;
let libraryBackStack = [];
if (!sidebarFolderOpen || typeof sidebarFolderOpen !== 'object' || Array.isArray(sidebarFolderOpen)) sidebarFolderOpen = {};
if (!libraryFolderOpen || typeof libraryFolderOpen !== 'object' || Array.isArray(libraryFolderOpen)) libraryFolderOpen = {};

const NAME_LIMITS = { folder: 32, remote: 32, button: 24 };

function clampName(value, limit) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > limit ? text.slice(0, limit).trimEnd() : text;
}

function limitName(value, type) {
  return clampName(value, NAME_LIMITS[type] || NAME_LIMITS.remote);
}

function normalizeLibraryNameLimits() {
  let changed = false;
  library.forEach(item => {
    if (item.type === 'folder') {
      const nextName = limitName(item.name, 'folder');
      if (nextName !== item.name) {
        item.name = nextName;
        changed = true;
      }
    } else if (item.type === 'remote') {
      const nextName = limitName(item.name, 'remote');
      if (nextName !== item.name) {
        item.name = nextName;
        changed = true;
      }
      (item.buttons || []).forEach(button => {
        const nextButtonName = limitName(button.name, 'button');
        if (nextButtonName !== button.name) {
          button.name = nextButtonName;
          changed = true;
        }
      });
    }
  });
  if (changed) saveLib();
}

function saveFolderOpenState() {
  localStorage.setItem('lbd_sidebar_open', JSON.stringify(sidebarFolderOpen));
  localStorage.setItem('lbd_library_open', JSON.stringify(libraryFolderOpen));
}
function folderOpenByMap(map, folder) {
  const key = String(folder.id);
  return Object.prototype.hasOwnProperty.call(map, key) ? !!map[key] : (folder.open !== false);
}
function setFolderOpenByMap(map, folderId, isOpen) {
  map[String(folderId)] = !!isOpen;
  saveFolderOpenState();
}
function pruneFolderOpenState() {
  const ids = new Set(library.filter(x => x.type === 'folder').map(x => String(x.id)));
  Object.keys(sidebarFolderOpen).forEach(k => { if (!ids.has(k)) delete sidebarFolderOpen[k]; });
  Object.keys(libraryFolderOpen).forEach(k => { if (!ids.has(k)) delete libraryFolderOpen[k]; });
}
function collapseAllFolders() {
  library.forEach(item => {
    if (item.type !== 'folder') return;
    item.open = false;
    sidebarFolderOpen[String(item.id)] = false;
    libraryFolderOpen[String(item.id)] = false;
  });
  saveLib();
  renderSidebarTree();
  if (currentTab === 'library') renderLibraryPane();
}
function collapseLibraryPaneFolders() {
  library.forEach(item => {
    if (item.type !== 'folder') return;
    item.open = false;
    libraryFolderOpen[String(item.id)] = false;
  });
  libraryCurrentFolderId = null;
  libraryBackStack = [];
  saveLib();
  if (currentTab === 'library' && selectedRemoteId == null) renderLibraryPane();
}
function saveLib() {
  pruneFolderOpenState();
  localStorage.setItem('lbd_library', JSON.stringify(library));
  localStorage.setItem('lbd_nextid', String(nextId));
  saveFolderOpenState();
}
function saveHistory() { localStorage.setItem('lbd_history', JSON.stringify(txHistory)); }
function genId() { return nextId++; }
function setLibraryView(view) {
  currentLibraryView = (view === 'favorites') ? 'favorites' : 'overview';
  localStorage.setItem('lbd_library_view', currentLibraryView);
  if (currentLibraryView === 'favorites') selectedRemoteId = null;
  syncLibraryViewTabs();
  if (currentTab === 'library') renderLibraryPane();
}
function normalizeFolderId(folderId) {
  if (folderId == null || folderId === '') return null;
  const parsed = parseInt(folderId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
function getFolderById(folderId) {
  const id = normalizeFolderId(folderId);
  if (id == null) return null;
  return library.find(x => x.type === 'folder' && x.id === id) || null;
}
function sanitizeLibraryNavigator() {
  if (libraryCurrentFolderId != null && !getFolderById(libraryCurrentFolderId)) libraryCurrentFolderId = null;
  libraryBackStack = libraryBackStack.filter(id => id == null || !!getFolderById(id));
}
function setSidebarSearch(query) {
  sidebarSearchQuery = String(query || '');
  renderSidebarTree();
}
function setLibrarySearch(query) {
  librarySearchQuery = String(query || '');
  if (currentTab === 'library' && currentLibraryView === 'overview' && selectedRemoteId == null) renderLibraryPane();
}
function getFolderTrail(folderId) {
  const out = [];
  let cur = getFolderById(folderId);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId == null ? null : getFolderById(cur.parentId);
  }
  return out;
}
function openLibraryFolder(folderId, pushHistory=true) {
  const targetId = normalizeFolderId(folderId);
  if (targetId != null && !getFolderById(targetId)) return;
  currentLibraryView = 'overview';
  localStorage.setItem('lbd_library_view', currentLibraryView);
  if (pushHistory && targetId !== libraryCurrentFolderId) libraryBackStack.push(libraryCurrentFolderId);
  libraryCurrentFolderId = targetId;
  selectedRemoteId = null;
  if (currentTab === 'library') renderLibraryPane();
  else switchTab('library');
}
function jumpToLibraryFolder(folderId) {
  openLibraryFolder(folderId, true);
}
function goBackLibraryFolder() {
  sanitizeLibraryNavigator();
  currentLibraryView = 'overview';
  localStorage.setItem('lbd_library_view', currentLibraryView);
  if (libraryBackStack.length) {
    libraryCurrentFolderId = libraryBackStack.pop();
  } else {
    const cur = getFolderById(libraryCurrentFolderId);
    libraryCurrentFolderId = cur ? cur.parentId : null;
  }
  selectedRemoteId = null;
  if (currentTab === 'library') renderLibraryPane();
}
function openRemoteInLibrary(remoteId) {
  const remote = library.find(r => r.type === 'remote' && r.id === remoteId);
  if (!remote) return;
  currentLibraryView = 'overview';
  localStorage.setItem('lbd_library_view', currentLibraryView);
  libraryCurrentFolderId = remote.folderId == null ? null : remote.folderId;
  selectedRemoteId = remote.id;
  renderSidebarTree();
  if (currentTab === 'library') renderLibraryPane();
  else switchTab('library');
}
function closeRemoteView(e) {
  if (e) e.stopPropagation();
  selectedRemoteId = null;
  if (currentTab === 'library') renderLibraryPane();
  else switchTab('library');
}
function syncLibraryViewTabs() {
  const overview = document.getElementById('libraryView-overview');
  const favorites = document.getElementById('libraryView-favorites');
  if (!overview || !favorites) return;
  overview.classList.toggle('active', currentLibraryView === 'overview');
  favorites.classList.toggle('active', currentLibraryView === 'favorites');
}
function getUniqueFolderName(baseName, parentId=null) {
  const base = String(baseName || 'Imported').trim() || 'Imported';
  let name = base;
  let n = 2;
  while (library.some(x => x.type === 'folder' && x.parentId === parentId && x.name === name)) {
    name = `${base} (${n})`;
    n++;
  }
  return name;
}
function createFolderEntry(name, parentId=null, open=false) {
  const folder = { type:'folder', id:genId(), name: limitName(name, 'folder'), parentId, open };
  library.push(folder);
  return folder;
}
function createImportFolder(baseName, parentId=null) {
  return createFolderEntry(getUniqueFolderName(baseName, parentId), parentId, false);
}
function expandFolderInViews(folderId) {
  let cur = library.find(x => x.type === 'folder' && x.id === folderId);
  while (cur) {
    sidebarFolderOpen[String(cur.id)] = true;
    libraryFolderOpen[String(cur.id)] = true;
    if (cur.parentId == null) break;
    cur = library.find(x => x.type === 'folder' && x.id === cur.parentId);
  }
}
function importStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}-${mi}-${ss}`;
}

// ===== SERIAL =====
async function toggleConnection() {
  if (!('serial' in navigator)) { alert('Web Serial API not supported. Use Chrome or Edge.'); return; }
  if (port) { location.reload(); } else { await connect(); }
}
async function connect() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    const te = new TextEncoderStream();
    te.readable.pipeTo(port.writable);
    writer = te.writable.getWriter();
    try {
      const info = port.getInfo();
      const name = info.usbProductName || (info.usbVendorId ? `VID:${info.usbVendorId.toString(16).padStart(4,'0')}` : null);
      if (name) { const d = document.getElementById('deviceName'); d.textContent = name; d.style.display = 'block'; }
    } catch(e) {}
    document.getElementById('statusBadge').textContent = 'Connected';
    document.getElementById('statusBadge').className = 'badge connected';
    const btn = document.getElementById('connectBtn');
    btn.textContent = 'Disconnect'; btn.className = 'disconnect';
    appendLog('Serial connection established.', 'sys');
    refreshConnectedViews();
    listenToStream();
  } catch(e) { appendLog('Connection failed: ' + e, 'err'); }
}
async function listenToStream() {
  const dec = new TextDecoder(); let buf = '';
  const reader = port.readable.getReader();
  appendLog('Receiver loop active.', 'sys');
  while (port && port.readable) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let lines = buf.split(/\r?\n/); buf = lines.pop();
    for (let l of lines) {
      l = l.trim(); if (!l) continue;
      let t = 'info';
      if (l.includes('[ERR]')) t = 'err'; else if (l.includes('[HW]')) t = 'out';
      appendLog(l, t);
    }
  }
}

// ===== LOG BAR =====
function toggleLogBar() {
  logBarOpen = !logBarOpen;
  document.getElementById('logBarBody').classList.toggle('open', logBarOpen);
  document.getElementById('logChevron').style.transform = logBarOpen ? 'rotate(180deg)' : '';
  if (logBarOpen) {
    logUnread = 0;
    const badge = document.getElementById('logBadge');
    badge.textContent = ''; badge.classList.remove('visible');
    setTimeout(() => { const t=document.getElementById('terminal'); t.scrollTop=t.scrollHeight; }, 10);
  }
}
function clearConsole(e) {
  if (e) e.stopPropagation();
  document.getElementById('terminal').innerHTML = '';
  logUnread = 0;
  const badge = document.getElementById('logBadge');
  badge.textContent = ''; badge.classList.remove('visible');
}
function appendLog(msg, type='info') {
  const term = document.getElementById('terminal');
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  const div = document.createElement('div');
  div.className = 'term-' + type;
  div.textContent = `[${ts}] ${msg}`;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
  if (!logBarOpen) {
    logUnread++;
    const badge = document.getElementById('logBadge');
    badge.textContent = logUnread + ' new';
    badge.classList.add('visible');
  }
}

// ===== HEX INPUT =====
function onHexInput(input) {
  let v = input.value.replace(/[^0-9a-fA-F\s]/g, '').replace(/\s+/g, ' ');
  let raw = v.replace(/\s/g, '');
  if (raw.length > 8) raw = raw.slice(0, 8);
  const formatted = raw.match(/.{1,2}/g)?.join(' ') || '';
  const atEnd = input.selectionStart === input.value.length;
  if (atEnd) input.value = formatted; else input.value = v.slice(0, 11);
  validateInputs();
}
function onHexInputRaw(input) {
  let v = input.value.replace(/[^0-9a-fA-F\s]/g, '');
  let raw = v.replace(/\s/g, '');
  if (raw.length > 8) raw = raw.slice(0, 8);
  const formatted = raw.match(/.{1,2}/g)?.join(' ') || '';
  const atEnd = input.selectionStart === input.value.length;
  if (atEnd) input.value = formatted; else input.value = v.slice(0, 11);
}
function validateHex(val) { return /^[0-9a-fA-F]{2}(\s[0-9a-fA-F]{2}){3}$/.test((val||'').trim()); }
function validateInputs() {
  const addr = document.getElementById('addressInput').value;
  const cmd  = document.getElementById('commandInput').value;
  const va = validateHex(addr), vc = validateHex(cmd);
  document.getElementById('addrErr').textContent = (!va && addr.length > 0) ? 'Must be 4 hex bytes e.g. 20 00 00 00' : '';
  document.getElementById('cmdErr').textContent  = (!vc && cmd.length  > 0) ? 'Must be 4 hex bytes e.g. 09 00 00 00' : '';
  document.getElementById('addressInput').classList.toggle('err', !va && addr.length > 0);
  document.getElementById('commandInput').classList.toggle('err', !vc && cmd.length  > 0);
  document.getElementById('transmitBtn').disabled = !(va && vc && writer);
}

function refreshConnectedViews() {
  validateInputs();
  renderHistory();
  if (currentTab === 'library') {
    renderLibraryPane();
    return;
  }
  if (currentTab === 'irdb') {
    if (irdbData) {
      renderIRDBTree();
      if (irdbSelectedPath) {
        const selectedFile = (irdbData || []).find(node => node.path === irdbSelectedPath);
        if (selectedFile) loadIRDBFile(selectedFile);
      }
    }
  }
}

// ===== NEC ENCODE =====
function flipByte(b) { let r=0; for(let i=0;i<8;i++) if((b>>i)&1) r|=(1<<(7-i)); return r; }
function compileNEC(addr, cmd) {
  let a=parseInt(addr.split(' ')[0],16), c=parseInt(cmd.split(' ')[0],16);
  let af=flipByte(a), cf=flipByte(c);
  return [af,af^0xFF,cf,cf^0xFF].join(',');
}
async function transmitPayload(addrOvr, cmdOvr, labelOvr) {
  if (!writer) return;
  const addr = addrOvr || document.getElementById('addressInput').value;
  const cmd  = cmdOvr  || document.getElementById('commandInput').value;
  if (!validateHex(addr)||!validateHex(cmd)) { appendLog('Invalid hex — aborting.','err'); return; }
  const p = compileNEC(addr, cmd);
  appendLog(`TX [${p}]`, 'out');
  await writer.write(p + '\n');
  // Add to history
  const label = labelOvr || 'Manual';
  addHistory({ label, addr, cmd });
}
function addHistory(entry) {
  const item = { id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString([], {hour12:false}), ...entry };
  txHistory.unshift(item);
  if (txHistory.length > 100) txHistory.pop();
  saveHistory();
  renderHistory();
}
function removeHistory(id) {
  txHistory = txHistory.filter(h => h.id !== id);
  saveHistory();
  renderHistory();
}
function clearHistory() {
  txHistory = []; saveHistory(); renderHistory();
}
function renderHistory() {
  const el = document.getElementById('txHistory');
  if (!el) return;
  if (!txHistory.length) {
    el.innerHTML = `<div class="empty-state" style="padding:30px 0;"><i class="ti ti-history" style="font-size:22px;"></i><p>No signals sent yet.</p></div>`;
    return;
  }
  el.innerHTML = '';
  txHistory.forEach(h => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `
      <div class="hist-meta">
        <span class="hist-ts">${h.ts}</span>
        <span class="hist-label">${escHtml(h.label)}</span>
      </div>
      <div class="signal-meta" style="margin:4px 0 6px;">
        <span class="signal-chip addr"><i class="ti ti-map-pin" style="font-size:9px;"></i> ${escHtml(h.addr)}</span>
        <span class="signal-chip cmd"><i class="ti ti-terminal" style="font-size:9px;"></i> ${escHtml(h.cmd)}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-green btn-sm" onclick="transmitPayload('${escAttr(h.addr)}','${escAttr(h.cmd)}','${escAttr(h.label)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Resend</button>
        <button class="btn btn-sm btn-ghost" onclick="removeHistory(${h.id})" title="Remove from history"><i class="ti ti-x"></i></button>
      </div>`;
    el.appendChild(row);
  });
}

// ===== TABS =====
function switchTab(tab) {
  ['transmit','library','irdb'].forEach(t => {
    document.getElementById('pane-'+t).classList.toggle('pane-hidden', t !== tab);
    document.getElementById('tab-'+t).classList.toggle('active', t === tab);
  });
  currentTab = tab;
  if (tab === 'library') { syncLibraryViewTabs(); renderLibraryPane(); }
  if (tab === 'irdb') initIRDB();
  if (tab === 'transmit') { renderHistory(); validateInputs(); }
}

// ===== SAVE FORM =====
let _saveSelectedRemoteId = null;
let _saveSelectedFolderId = null;

function toggleSaveForm() {
  const f = document.getElementById('saveForm');
  f.classList.toggle('open');
  if (f.classList.contains('open')) {
    _saveSelectedRemoteId = null;
    _saveSelectedFolderId = null;
    renderSaveTree();
    document.getElementById('saveNewRemoteNameWrap').classList.add('pane-hidden');
    setTimeout(() => document.getElementById('saveNameInput').focus(), 50);
  }
}

function renderSaveTree() {
  const container = document.getElementById('saveDestTree');
  if (!container) return;
  container.innerHTML = '';

  const rootRow = document.createElement('div');
  const rootSelected = _saveSelectedFolderId == null && _saveSelectedRemoteId == null;
  rootRow.className = 'folder-picker-row' + (rootSelected ? ' selected' : '');
  rootRow.innerHTML = '<i class="ti ti-home"></i><span class="folder-picker-label">/ Root</span><span style="color:var(--text3);font-size:10px;margin-left:auto;">new remote</span>';
  rootRow.onclick = function() {
    _saveSelectedFolderId = null;
    _saveSelectedRemoteId = null;
    renderSaveTree();
    document.getElementById('saveNewRemoteNameWrap').classList.remove('pane-hidden');
  };
  container.appendChild(rootRow);

  var folders = library.filter(function(x) { return x.type === 'folder'; });
  var folderMap = {};
  folders.forEach(function(f) { folderMap[f.id] = f; });

  var getChildren = function(parentId) {
    return folders.filter(function(f) { return f.parentId === parentId; }).sort(function(a, b) { return a.name.localeCompare(b.name); });
  };
  var getRemotes = function(folderId) {
    return library.filter(function(x) { return x.type === 'remote' && x.folderId === folderId; }).sort(function(a, b) { return a.name.localeCompare(b.name); });
  };

  function renderLevel(parentId, depth) {
    getChildren(parentId).forEach(function(folder) {
      var row = document.createElement('div');
      var isSelected = _saveSelectedFolderId === folder.id;
      row.className = 'folder-picker-row' + (isSelected ? ' selected' : '');
      row.style.paddingLeft = (8 + depth * 14) + 'px';
      row.innerHTML = '<i class="ti ti-point" style="font-size:10px;width:12px;visibility:hidden;"></i><i class="ti ti-folder"></i><span class="folder-picker-label">' + escHtml(folder.name) + '</span><span style="color:var(--text3);font-size:10px;margin-left:auto;">new remote</span>';
      row.onclick = function() {
        _saveSelectedFolderId = folder.id;
        _saveSelectedRemoteId = null;
        renderSaveTree();
        document.getElementById('saveNewRemoteNameWrap').classList.remove('pane-hidden');
      };
      container.appendChild(row);

      getRemotes(folder.id).forEach(function(remote) {
        var rRow = document.createElement('div');
        var rSelected = _saveSelectedRemoteId === remote.id;
        rRow.className = 'folder-picker-row' + (rSelected ? ' selected' : '');
        rRow.style.paddingLeft = (8 + (depth + 1) * 14) + 'px';
        rRow.innerHTML = '<i class="ti ti-device-remote" style="font-size:12px;"></i><span class="folder-picker-label">' + escHtml(remote.name) + '</span><span style="color:var(--accent);font-size:10px;margin-left:auto;">' + remote.buttons.length + ' btn' + (remote.buttons.length !== 1 ? 's' : '') + '</span>';
        rRow.onclick = function() {
          _saveSelectedRemoteId = remote.id;
          _saveSelectedFolderId = null;
          renderSaveTree();
          document.getElementById('saveNewRemoteNameWrap').classList.add('pane-hidden');
        };
        container.appendChild(rRow);
      });

      renderLevel(folder.id, depth + 1);
    });
  }

  renderLevel(null, 1);

  getRemotes(null).forEach(function(remote) {
    var rRow = document.createElement('div');
    var rSelected = _saveSelectedRemoteId === remote.id;
    rRow.className = 'folder-picker-row' + (rSelected ? ' selected' : '');
    rRow.style.paddingLeft = (8 + 1 * 14) + 'px';
    rRow.innerHTML = '<i class="ti ti-device-remote" style="font-size:12px;"></i><span class="folder-picker-label">' + escHtml(remote.name) + '</span><span style="color:var(--accent);font-size:10px;margin-left:auto;">' + remote.buttons.length + ' btn' + (remote.buttons.length !== 1 ? 's' : '') + '</span>';
    rRow.onclick = function() {
      _saveSelectedRemoteId = remote.id;
      _saveSelectedFolderId = null;
      renderSaveTree();
      document.getElementById('saveNewRemoteNameWrap').classList.add('pane-hidden');
    };
    container.appendChild(rRow);
  });
}

function validateSaveFormName() {
  const v = document.getElementById('saveNameInput').value.trim();
  document.getElementById('saveNameErr').textContent = v ? '' : 'Name is required';
  return !!v;
}
function validateSaveRemoteName() {
  const v = document.getElementById('saveNewRemoteName').value.trim();
  document.getElementById('saveNewRemoteNameErr').textContent = v ? '' : 'Remote name required';
  return !!v;
}
function saveManualSignal() {
  if (!validateSaveFormName()) return;
  const addr = document.getElementById('addressInput').value.trim();
  const cmd  = document.getElementById('commandInput').value.trim();
  if (!validateHex(addr)||!validateHex(cmd)) { appendLog('Fix hex inputs first.','err'); return; }
  const name = limitName(document.getElementById('saveNameInput').value, 'button');
  const desc = document.getElementById('saveDescInput').value.trim();
  let remote;
  if (_saveSelectedRemoteId != null) {
    remote = library.find(r => r.id===_saveSelectedRemoteId);
    if (!remote) { appendLog('Selected remote not found.','err'); return; }
  } else {
    if (!validateSaveRemoteName()) return;
    const rname = limitName(document.getElementById('saveNewRemoteName').value, 'remote');
    remote = { type:'remote', id:genId(), name:rname, folderId: _saveSelectedFolderId, buttons:[], favorite:false };
    library.push(remote);
  }
  remote.buttons.push({ id:genId(), name, addr, cmd, desc, proto:'NEC', favorite:false });
  saveLib(); renderSidebarTree();
  document.getElementById('saveNameInput').value = '';
  document.getElementById('saveDescInput').value = '';
  document.getElementById('saveNewRemoteName').value = '';
  document.getElementById('saveForm').classList.remove('open');
  appendLog(`Saved "${name}" to remote "${remote.name}".`, 'sys');
}

// ===== IMPORT =====
function parseIRFile(text) {
  const buttons = [];
  const lines = text.split('\n');
  let cur = null;
  for (let raw of lines) {
    const l = raw.trim();
    if (l.startsWith('name:')) {
      if (cur && cur.addr && cur.cmd) buttons.push(cur);
      cur = { name: l.slice(5).trim(), addr:'', cmd:'', proto:'' };
    } else if (cur && l.startsWith('protocol:')) { cur.proto = l.slice(9).trim(); }
    else if (cur && l.startsWith('address:')) { cur.addr = l.slice(8).trim().split(/\s+/).slice(0,4).join(' '); }
    else if (cur && l.startsWith('command:')) { cur.cmd  = l.slice(8).trim().split(/\s+/).slice(0,4).join(' '); }
  }
  if (cur && cur.addr && cur.cmd) buttons.push(cur);
  return buttons.filter(b => validateHex(b.addr) && validateHex(b.cmd)).map(b => ({ ...b, name: limitName(b.name, 'button'), id:genId(), desc:'', favorite:false }));
}
function importIRFiles(files, folderId=null, inputEl=null) {
  const irFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.ir'));
  if (!irFiles.length) {
    appendLog('No .ir files found to import.', 'sys');
    if (inputEl) inputEl.value = '';
    return;
  }
  const parentId = folderId ? parseInt(folderId) : null;
  const singleName = irFiles[0].name.replace(/\.ir$/i, '').trim();
  const folderBaseName = irFiles.length === 1 ? `${singleName} import` : `Import ${importStamp()}`;
  const importRoot = createImportFolder(folderBaseName, parentId);
  let pending = irFiles.length;
  let imported = 0;
  let skipped = 0;

  const finalize = () => {
    pending--;
    if (pending > 0) return;
    if (!imported) {
      library = library.filter(x => x.id !== importRoot.id);
      appendLog(`Import complete — 0 imported, ${skipped} skipped.`, 'sys');
    } else {
      appendLog(`Imported ${imported} remote${imported !== 1 ? 's' : ''} into "${importRoot.name}"${skipped ? ` (${skipped} skipped)` : ''}.`, 'sys');
    }
    saveLib();
    renderSidebarTree();
    if (currentTab === 'library' && selectedRemoteId == null) renderLibraryPane();
  };

  irFiles.forEach(f => {
    const reader = new FileReader();
    reader.onload = ev => {
      const rname = f.name.replace('.ir','');
      const buttons = parseIRFile(ev.target.result);
      if (!buttons.length) {
        skipped++;
        appendLog(`"${rname}" skipped — no valid NEC buttons.`,'sys');
        finalize();
        return;
      }
      library.push({ type:'remote', id:genId(), name: limitName(rname, 'remote'), folderId: importRoot.id, buttons, favorite:false });
      imported++;
      finalize();
    };
    reader.onerror = () => { skipped++; appendLog(`"${f.name}" failed to read.`, 'err'); finalize(); };
    reader.readAsText(f);
  });
  if (inputEl) inputEl.value = '';
}
function importFolder(files, inputEl=null) {
  if (!files.length) return;
  const fileList = Array.from(files);
  const topFolderName = fileList[0]?.webkitRelativePath?.split('/')[0] || 'Imported Folder';
  const importRoot = createImportFolder(topFolderName, null);
  const createdFolderIds = new Set([importRoot.id]);
  const folderMap = { '': importRoot.id };
  const irFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.ir'));
  if (!irFiles.length) {
    library = library.filter(x => x.id !== importRoot.id);
    appendLog(`"${topFolderName}" skipped — no .ir files found.`, 'sys');
    if (inputEl) inputEl.value = '';
    return;
  }
  // Build folder structure under a dedicated import root.
  fileList.forEach(f => {
    const fullParts = (f.webkitRelativePath || f.name).split('/').filter(Boolean);
    const relParts = fullParts.length > 1 ? fullParts.slice(1) : fullParts;
    let parentId = importRoot.id;
    let pathKey = '';
    for (let i = 0; i < relParts.length - 1; i++) {
      const seg = relParts[i];
      pathKey = pathKey ? `${pathKey}/${seg}` : seg;
      if (!folderMap[pathKey]) {
        const folder = createFolderEntry(seg, parentId, false);
        folderMap[pathKey] = folder.id;
        createdFolderIds.add(folder.id);
      }
      parentId = folderMap[pathKey];
    }
  });
  let pending = irFiles.length;
  let imported = 0;
  let skipped = 0;
  const finalize = () => {
    pending--;
    if (pending > 0) return;
    if (!imported) {
      library = library.filter(x => !(x.type === 'folder' && createdFolderIds.has(x.id)));
      appendLog(`"${topFolderName}" imported 0 remotes (${skipped} skipped).`, 'sys');
    } else {
      appendLog(`Imported "${topFolderName}" into folder "${importRoot.name}" (${imported} remote${imported !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped` : ''}).`,'sys');
    }
    saveLib();
    renderSidebarTree();
    if (currentTab==='library' && selectedRemoteId == null) renderLibraryPane();
  };
  irFiles.forEach(f => {
    const fullParts = (f.webkitRelativePath || f.name).split('/').filter(Boolean);
    const relParts = fullParts.length > 1 ? fullParts.slice(1) : fullParts;
    const folderPath = relParts.slice(0,-1).join('/');
    const folderId = folderPath ? (folderMap[folderPath] || importRoot.id) : importRoot.id;
    const reader = new FileReader();
    reader.onload = ev => {
      const rname = f.name.replace('.ir','');
      const buttons = parseIRFile(ev.target.result);
      if (!buttons.length) { skipped++; finalize(); return; }
       library.push({ type:'remote', id:genId(), name: limitName(rname, 'remote'), folderId, buttons, favorite:false });
      imported++;
      finalize();
    };
    reader.onerror = () => { skipped++; finalize(); };
    reader.readAsText(f);
  });
  appendLog(`Importing "${topFolderName}" into "${importRoot.name}" (${irFiles.length} .ir file${irFiles.length !== 1 ? 's' : ''})...`,'sys');
  if (inputEl) inputEl.value = '';
}

// ===== DRAG AND DROP =====
let dragItem = null;
let dragOverId = null;

function startDrag(e, type, id, label=null) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (!label) {
    const item = library.find(x => x.type === type && x.id === id);
    label = item ? item.name : `${type} ${id}`;
  }
  dragItem = { type, id };
  const ghost = document.getElementById('dragGhost');
  ghost.textContent = label;
  ghost.style.display = 'block';
  moveDragGhost(e);
  document.getElementById('dragHint').classList.add('visible');
  // Mark dragging item
  document.querySelectorAll('.tree-item').forEach(el => {
    const did = el.dataset.dragid;
    if (did && parseInt(did) === id) el.classList.add('dragging');
  });
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  e.preventDefault();
}
function moveDragGhost(e) {
  const ghost = document.getElementById('dragGhost');
  ghost.style.left = (e.clientX + 14) + 'px';
  ghost.style.top  = (e.clientY - 10) + 'px';
}
function onDragMove(e) {
  moveDragGhost(e);
  // Highlight valid folder drop targets only
  const els = document.querySelectorAll('.tree-item[data-dropid]');
  let found = null;
  els.forEach(el => {
    el.classList.remove('drag-over');
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom) {
      found = el;
    }
  });
  // Only highlight folder targets (skip dropping a folder onto itself)
  if (found) {
    const tid = found.dataset.dropid;
    // Don't highlight itself or its descendants
    if (dragItem && dragItem.type === 'folder' && (parseInt(tid) === dragItem.id || isDescendant(parseInt(tid), dragItem.id))) {
      dragOverId = null;
    } else {
      found.classList.add('drag-over');
      dragOverId = tid;
    }
  } else {
    dragOverId = null;
  }
  // Root drop zone
  const hint = document.getElementById('dragHint');
  const hr = hint.getBoundingClientRect();
  if (e.clientX >= hr.left && e.clientX <= hr.right && e.clientY >= hr.top && e.clientY <= hr.bottom) {
    hint.style.background = 'rgba(255,183,3,0.22)';
    dragOverId = '__root__';
  } else {
    hint.style.background = '';
  }
}
function onDragEnd(e) {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.getElementById('dragGhost').style.display = 'none';
  document.getElementById('dragHint').classList.remove('visible');
  document.getElementById('dragHint').style.background = '';
  document.querySelectorAll('.tree-item').forEach(el => { el.classList.remove('drag-over'); el.classList.remove('dragging'); });
  if (dragItem && dragOverId !== null) performDrop(dragItem, dragOverId);
  dragItem = null; dragOverId = null;
}
function isDescendant(folderId, ancestorId) {
  // Is folderId inside ancestorId?
  let cur = library.find(x => x.id===folderId && x.type==='folder');
  while (cur && cur.parentId != null) {
    if (cur.parentId === ancestorId) return true;
    cur = library.find(x => x.id===cur.parentId && x.type==='folder');
  }
  return false;
}
function performDrop(drag, targetId) {
  let expandedTargetId = null;
  if (drag.type === 'folder') {
    const folder = library.find(x => x.type==='folder' && x.id===drag.id);
    if (!folder) return;
    if (targetId === '__root__') {
      if (folder.parentId === null) return; // already root
      folder.parentId = null;
    } else {
      const tid = parseInt(targetId);
      if (tid === folder.id || isDescendant(tid, folder.id)) return;
      if (folder.parentId === tid) return; // already there
      const target = library.find(x => x.type==='folder' && x.id===tid);
      if (!target) return;
      folder.parentId = tid;
      expandedTargetId = tid;
    }
  } else if (drag.type === 'remote') {
    const remote = library.find(x => x.type==='remote' && x.id===drag.id);
    if (!remote) return;
    if (targetId === '__root__') {
      if (remote.folderId === null) return;
      remote.folderId = null;
    } else {
      const tid = parseInt(targetId);
      if (remote.folderId === tid) return;
      const target = library.find(x => x.type==='folder' && x.id===tid);
      if (!target) return;
      remote.folderId = tid;
      expandedTargetId = tid;
    }
  }
  if (expandedTargetId !== null) expandFolderInViews(expandedTargetId);
  saveLib(); renderSidebarTree();
  if (currentTab === 'library') renderLibraryPane();
}

// ===== SIDEBAR TREE =====
function renderSidebarTree() {
  const el = document.getElementById('sidebarTree');
  if (!el) return;
  const searchEl = document.getElementById('sidebarSearch');
  if (searchEl && searchEl.value !== sidebarSearchQuery) searchEl.value = sidebarSearchQuery;
  const query = sidebarSearchQuery.trim().toLowerCase();
  el.innerHTML = '';
  renderTreeLevel(el, null, 0, query);
}
function sidebarRemoteMatchesQuery(remote, query) {
  if (!query) return true;
  return String(remote.name || '').toLowerCase().includes(query);
}
function sidebarFolderMatchesQuery(folder, query) {
  if (!query) return true;
  if (String(folder.name || '').toLowerCase().includes(query)) return true;
  if (library.some(x => x.type === 'remote' && x.folderId === folder.id && sidebarRemoteMatchesQuery(x, query))) return true;
  return library
    .filter(x => x.type === 'folder' && x.parentId === folder.id)
    .some(child => sidebarFolderMatchesQuery(child, query));
}
function renderTreeLevel(container, parentId, depth, query='') {
  const folders = library
    .filter(x => x.type==='folder' && x.parentId===parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const remotes = library
    .filter(x => x.type==='remote' && x.folderId===parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  folders.forEach(folder => {
    if (query && !sidebarFolderMatchesQuery(folder, query)) return;
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = (8 + depth*14) + 'px';
    row.dataset.dropid = folder.id;   // valid drop target
    row.dataset.dragid = folder.id;   // for styling dragging item
    const isSearchMode = !!query;
    const isOpen = isSearchMode ? true : folderOpenByMap(sidebarFolderOpen, folder);
    row.innerHTML = `
      <i class="ti ti-grip-vertical drag-handle" title="Drag to move" onmousedown="startDrag(event,'folder',${folder.id})"></i>
      <i class="ti ti-chevron-right ${isOpen?'open':''}"></i>
      <i class="ti ${isOpen?'ti-folder-open':'ti-folder'}"></i>
      <span class="tree-label" title="${escAttr(folder.name)}">${escHtml(folder.name)}</span>
      <span class="tree-actions">
        <button class="tree-act" title="Rename" onclick="openRenameModal(event,'folder',${folder.id})"><i class="ti ti-pencil"></i></button>
        <button class="tree-act" title="New subfolder" onclick="openNewFolderModal(${folder.id},event)"><i class="ti ti-folder-plus"></i></button>
        <button class="tree-act del" title="Delete" onclick="openDeleteModal(event,'folder',${folder.id})"><i class="ti ti-trash"></i></button>
      </span>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.tree-actions') || e.target.closest('.drag-handle')) return;
      if (isSearchMode) {
        openLibraryFolder(folder.id, true);
        return;
      }
      setFolderOpenByMap(sidebarFolderOpen, folder.id, !isOpen);
      renderSidebarTree();
    });
    container.appendChild(row);
    if (isOpen) renderTreeLevel(container, folder.id, depth+1, query);
  });
  remotes.filter(remote => sidebarRemoteMatchesQuery(remote, query)).forEach(remote => {
    const row = document.createElement('div');
    row.className = 'tree-item' + (selectedRemoteId===remote.id ? ' active' : '');
    row.style.paddingLeft = (8 + depth*14 + 14) + 'px';
    row.dataset.dragid = remote.id;
    row.innerHTML = `
      <i class="ti ti-grip-vertical drag-handle" title="Drag to move" onmousedown="startDrag(event,'remote',${remote.id})"></i>
      <i class="ti ti-device-remote"></i>
      <span class="tree-label" title="${escAttr(remote.name)}">${escHtml(remote.name)}</span>
      <span class="tree-actions">
        <button class="tree-act" title="Rename" onclick="openRenameModal(event,'remote',${remote.id})"><i class="ti ti-pencil"></i></button>
        <button class="tree-act del" title="Delete" onclick="openDeleteModal(event,'remote',${remote.id})"><i class="ti ti-trash"></i></button>
      </span>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.tree-actions') || e.target.closest('.drag-handle')) return;
      openRemoteInLibrary(remote.id);
    });
    container.appendChild(row);
  });
}

// ===== LIBRARY PANE =====
function renderLibraryPane() {
  sanitizeLibraryNavigator();
  const el = document.getElementById('libraryContent');
  const searchWrap = document.getElementById('librarySearchWrap');
  const searchInput = document.getElementById('librarySearch');
  if (searchInput && searchInput.value !== librarySearchQuery) searchInput.value = librarySearchQuery;
  syncLibraryViewTabs();
  if (selectedRemoteId != null) {
    if (searchWrap) searchWrap.style.display = 'none';
    const remote = library.find(r => r.id===selectedRemoteId);
    if (remote) { renderRemoteView(el, remote); return; }
    selectedRemoteId = null;
  }
  if (currentLibraryView === 'favorites') {
    if (searchWrap) searchWrap.style.display = 'none';
    renderFavoritesView(el);
    return;
  }
  if (searchWrap) searchWrap.style.display = '';
  renderLibraryOverview(el);
}
function getFavoriteButtons() {
  const out = [];
  library.filter(x => x.type === 'remote').forEach(remote => {
    (remote.buttons || []).forEach(btn => {
      if (btn && btn.favorite) out.push({ remote, btn });
    });
  });
  return out;
}
function getFavoriteRemotes() {
  return library.filter(x => x.type === 'remote' && !!x.favorite);
}
function clearAllFavorites() {
  library.filter(x => x.type === 'remote').forEach(remote => {
    remote.favorite = false;
    (remote.buttons || []).forEach(btn => { btn.favorite = false; });
  });
  saveLib();
  if (currentTab === 'library') renderLibraryPane();
  appendLog('All favorites cleared.', 'sys');
}
function openClearFavoritesModal() {
  document.getElementById('clearFavoritesModal').classList.add('open');
}
function closeClearFavoritesModal() {
  document.getElementById('clearFavoritesModal').classList.remove('open');
}
function confirmClearFavorites() {
  clearAllFavorites();
  closeClearFavoritesModal();
}
function renderFavoritesView(el) {
  const favRemotes = getFavoriteRemotes();
  const favs = getFavoriteButtons();
  const totalFavs = favRemotes.length + favs.length;
  el.innerHTML = '';
  const hdr = document.createElement('div');
  hdr.className = 'section-hdr';
  hdr.innerHTML = `
    <span class="section-title"><i class="ti ti-star-filled" style="vertical-align:-2px;margin-right:6px;"></i>Favorites</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="favorites-meta">${favRemotes.length} remote${favRemotes.length!==1?'s':''} · ${favs.length} signal${favs.length!==1?'s':''}</span>
      <button class="btn btn-sm btn-ghost" onclick="openClearFavoritesModal()" ${totalFavs ? '' : 'disabled'}><i class="ti ti-eraser"></i> Clear Favorites</button>
    </div>`;
  el.appendChild(hdr);
  if (!totalFavs) {
    el.innerHTML += `<div class="empty-state"><i class="ti ti-star-off"></i><p>No favorites yet.<br>Open a remote and star remotes or buttons.</p></div>`;
    return;
  }
  if (favRemotes.length) {
    const rs = document.createElement('div');
    rs.className = 'section-hdr';
    rs.innerHTML = `<span class="section-title"><i class="ti ti-device-remote" style="vertical-align:-2px;margin-right:6px;"></i>Favorite Remotes</span>`;
    rs.style.marginTop = '4px';
    el.appendChild(rs);
    favRemotes.forEach(remote => appendRemoteCard(el, remote));
  }
  if (favs.length) {
    const ss = document.createElement('div');
    ss.className = 'section-hdr';
    ss.innerHTML = `<span class="section-title"><i class="ti ti-stars" style="vertical-align:-2px;margin-right:6px;"></i>Favorite Signals</span>`;
    ss.style.marginTop = '4px';
    el.appendChild(ss);
  }
  favs.forEach(({ remote, btn }) => {
    const folderPath = remote.folderId ? getFolderPath(remote.folderId) : '/ Root';
    const row = document.createElement('div');
    row.className = 'signal-box';
    row.innerHTML = `
      <div class="signal-box-header">
        <span class="signal-box-name">${escHtml(btn.name)}</span>
        <button class="btn btn-ghost btn-sm btn-icon" title="Remove from favorites" onclick="toggleFavoriteButton(${btn.id},${remote.id},event)" style="color:var(--accent);"><i class="ti ti-star-filled"></i></button>
      </div>
      <div class="signal-meta">
        <span class="signal-chip proto"><i class="ti ti-device-remote" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(remote.name)}</span>
        <span class="signal-chip"><i class="ti ti-folders" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(folderPath)}</span>
      </div>
      <div class="signal-meta">
        <span class="signal-chip addr"><i class="ti ti-map-pin" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(btn.addr||'—')}</span>
        <span class="signal-chip cmd"><i class="ti ti-terminal" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(btn.cmd||'—')}</span>
      </div>
      ${btn.desc ? `<div class="signal-desc-view" style="cursor:default;">${escHtml(btn.desc)}</div>` : ''}
      <div class="signal-actions">
        <button class="btn btn-sm" onclick="openFavoriteRemote(${remote.id})"><i class="ti ti-arrow-right"></i> Open Remote</button>
        <button class="btn btn-green btn-sm" onclick="sendButtonSignal('${escAttr(btn.addr)}','${escAttr(btn.cmd)}','${escAttr(remote.name+' / '+btn.name)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Send</button>
      </div>`;
    el.appendChild(row);
  });
}
function openFavoriteRemote(remoteId) {
  openRemoteInLibrary(remoteId);
}
function renderLibraryOverview(el) {
  sanitizeLibraryNavigator();
  const currentFolder = getFolderById(libraryCurrentFolderId);
  if (libraryCurrentFolderId != null && !currentFolder) libraryCurrentFolderId = null;
  const activeFolderId = currentFolder ? currentFolder.id : null;
  const query = librarySearchQuery.trim().toLowerCase();
  const childFolders = library
    .filter(x => x.type === 'folder' && x.parentId === activeFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childRemotes = library
    .filter(x => x.type === 'remote' && x.folderId === activeFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleFolders = query ? childFolders.filter(f => String(f.name || '').toLowerCase().includes(query)) : childFolders;
  const visibleRemotes = query ? childRemotes.filter(r => remoteMatchesLibraryQuery(r, query)) : childRemotes;

  el.innerHTML = '';
  if (!library.some(x => x.type === 'folder' || x.type === 'remote')) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-satellite"></i><p>No remotes yet.<br>Import .ir files or save signals from the Transmit tab.</p></div>`;
    return;
  }
  const toolbar = document.createElement('div');
  toolbar.className = 'library-browser-toolbar';

  const left = document.createElement('div');
  left.className = 'library-browser-left';
  const canBack = libraryBackStack.length > 0 || (currentFolder && currentFolder.parentId != null);
  left.innerHTML = `<button class="btn btn-sm btn-ghost" onclick="goBackLibraryFolder()" ${canBack ? '' : 'disabled'}><i class="ti ti-arrow-left"></i> Back</button>`;
  const path = document.createElement('div');
  path.className = 'library-path';
  buildLibraryPath(path, activeFolderId);
  left.appendChild(path);
  toolbar.appendChild(left);

  const right = document.createElement('div');
  right.className = 'library-browser-right';
  right.innerHTML = `<button class="btn btn-sm btn-ghost" onclick="collapseLibraryPaneFolders()"><i class="ti ti-folders"></i> Close All</button>`;
  toolbar.appendChild(right);
  el.appendChild(toolbar);

  if (query) {
    const meta = document.createElement('div');
    meta.className = 'favorites-meta';
    meta.style.marginBottom = '10px';
    meta.textContent = `Filtered by "${librarySearchQuery}"`;
    el.appendChild(meta);
  }

  const grid = document.createElement('div');
  grid.className = 'library-grid';
  visibleFolders.forEach(folder => appendLibraryFolderCard(grid, folder));
  visibleRemotes.forEach(remote => appendLibraryRemoteCard(grid, remote));
  if (!visibleFolders.length && !visibleRemotes.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.gridColumn = '1 / -1';
    empty.innerHTML = query
      ? `<i class="ti ti-search-off"></i><p>No matches in this folder.</p>`
      : `<i class="ti ti-folder-off"></i><p>This folder is empty.</p>`;
    grid.appendChild(empty);
  }
  el.appendChild(grid);
}
function remoteMatchesLibraryQuery(remote, query) {
  if (!query) return true;
  if (String(remote.name || '').toLowerCase().includes(query)) return true;
  return (remote.buttons || []).some(btn => {
    const name = String(btn.name || '').toLowerCase();
    const desc = String(btn.desc || '').toLowerCase();
    return name.includes(query) || desc.includes(query);
  });
}
function buildLibraryPath(container, folderId) {
  const trail = getFolderTrail(folderId);
  if (!trail.length) {
    container.innerHTML = `<span class="cur">Library</span>`;
    return;
  }
  const root = document.createElement('a');
  root.textContent = 'Library';
  root.onclick = () => jumpToLibraryFolder(null);
  container.appendChild(root);
  trail.forEach((folder, idx) => {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '/';
    container.appendChild(sep);
    if (idx === trail.length - 1) {
      const cur = document.createElement('span');
      cur.className = 'cur';
      cur.textContent = folder.name;
      container.appendChild(cur);
    } else {
      const link = document.createElement('a');
      link.textContent = folder.name;
      link.onclick = () => jumpToLibraryFolder(folder.id);
      container.appendChild(link);
    }
  });
}
function countFolderItems(folderId) {
  const subFolders = library.filter(x => x.type === 'folder' && x.parentId === folderId).length;
  const remotes = library.filter(x => x.type === 'remote' && x.folderId === folderId).length;
  return subFolders + remotes;
}
function appendLibraryFolderCard(container, folder) {
  const totalItems = countFolderItems(folder.id);
  const card = document.createElement('div');
  card.className = 'library-entry-card library-folder-card';
  card.innerHTML = `
    <div class="library-entry-top">
      <div class="library-entry-main">
        <i class="ti ti-folder"></i>
        <span class="library-entry-name" title="${escAttr(folder.name)}">${escHtml(folder.name)}</span>
      </div>
      <div class="library-entry-actions">
        <button class="btn btn-ghost btn-sm btn-icon" title="Rename folder" onclick="openRenameModal(event,'folder',${folder.id})"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Delete folder" onclick="openDeleteModal(event,'folder',${folder.id})"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <div class="library-entry-meta">${totalItems} item${totalItems !== 1 ? 's' : ''}</div>`;
  card.onclick = () => openLibraryFolder(folder.id, true);
  container.appendChild(card);
}
function appendRemoteCard(container, remote, showMainActions=false) {
  const isFav = !!remote.favorite;
  const isExpanded = !!remoteCardExpanded[String(remote.id)];
  const previewLimit = 4;
  const previewButtons = isExpanded ? (remote.buttons || []) : (remote.buttons || []).slice(0, previewLimit);
  const hiddenCount = Math.max((remote.buttons || []).length - previewButtons.length, 0);
  const card = document.createElement('div');
  card.className = `remote-card${showMainActions ? ' remote-card-grid' : ''}${isExpanded ? ' expanded' : ''}`;
  const actionButtons = showMainActions
    ? `
      <button class="btn btn-ghost btn-sm btn-icon" title="${isFav ? 'Remove remote from favorites' : 'Add remote to favorites'}" onclick="toggleFavoriteRemote(${remote.id},event)" style="color:${isFav ? 'var(--accent)' : 'var(--text3)'}"><i class="ti ${isFav ? 'ti-star-filled' : 'ti-star'}"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" title="Rename remote" onclick="openRenameModal(event,'remote',${remote.id})"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" title="Delete remote" onclick="openDeleteModal(event,'remote',${remote.id})"><i class="ti ti-trash"></i></button>`
    : `
      <button class="btn btn-ghost btn-sm btn-icon" title="${isFav ? 'Remove remote from favorites' : 'Add remote to favorites'}" onclick="toggleFavoriteRemote(${remote.id},event)" style="color:${isFav ? 'var(--accent)' : 'var(--text3)'}"><i class="ti ${isFav ? 'ti-star-filled' : 'ti-star'}"></i></button>`;
  card.innerHTML = `
    <div class="remote-card-head">
      <div class="remote-card-title">
        <i class="ti ti-device-remote remote-card-icon" aria-hidden="true"></i>
        <div class="remote-card-copy">
          <span class="remote-card-name" title="${escHtml(remote.name)}">${escHtml(remote.name)}</span>
          <span class="remote-card-meta">Open remote</span>
        </div>
      </div>
      <div class="remote-card-actions">
        ${actionButtons}
      </div>
    </div>
    <div class="remote-card-preview">
      <div class="chip-row remote-card-chiprow">
        ${previewButtons.map(b=>`<span class="signal-chip">${escHtml(b.name)}</span>`).join('')}
        ${hiddenCount > 0 ? `<span class="signal-chip remote-card-hidden">+${hiddenCount} more</span>` : ''}
        ${!remote.buttons.length ? `<span class="signal-chip remote-card-empty">No buttons</span>` : ''}
      </div>
      <div class="remote-card-footer">
        ${remote.buttons.length > previewLimit ? `<button class="btn btn-sm btn-ghost remote-card-more" onclick="toggleRemoteCardDetails(${remote.id},event)"><i class="ti ti-${isExpanded ? 'chevron-up' : 'chevron-down'}"></i> ${isExpanded ? 'Show less' : 'Show more'}</button>` : '<span></span>'}
        <span class="remote-card-count">${remote.buttons.length} button${remote.buttons.length!==1?'s':''}</span>
      </div>
    </div>`;
  card.onclick = () => openRemoteInLibrary(remote.id);
  container.appendChild(card);
}
function appendLibraryRemoteCard(container, remote) {
  appendRemoteCard(container, remote, true);
}
function toggleRemoteCardDetails(remoteId, e) {
  if (e) e.stopPropagation();
  remoteCardExpanded[String(remoteId)] = !remoteCardExpanded[String(remoteId)];
  if (currentTab === 'library') renderLibraryPane();
}

// ===== REMOTE VIEW =====
function renderRemoteView(el, remote) {
  el.innerHTML = '';
  const bc = document.createElement('div');
  bc.className = 'breadcrumb';
  const trail = getFolderTrail(remote.folderId);
  const rootLink = document.createElement('a');
  rootLink.textContent = 'Library';
  rootLink.onclick = () => {
    selectedRemoteId = null;
    jumpToLibraryFolder(null);
  };
  bc.appendChild(rootLink);
  trail.forEach(folder => {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '/';
    bc.appendChild(sep);
    const link = document.createElement('a');
    link.textContent = folder.name;
    link.onclick = () => {
      selectedRemoteId = null;
      jumpToLibraryFolder(folder.id);
    };
    bc.appendChild(link);
  });
  const endSep = document.createElement('span');
  endSep.className = 'sep';
  endSep.textContent = '/';
  bc.appendChild(endSep);
  const cur = document.createElement('span');
  cur.className = 'cur';
  cur.textContent = remote.name;
  bc.appendChild(cur);
  el.appendChild(bc);
  const hdr = document.createElement('div');
  hdr.className = 'section-hdr';
  hdr.innerHTML = `
    <div class="remote-view-left">
      <button class="btn btn-sm btn-ghost" onclick="closeRemoteView(event)"><i class="ti ti-arrow-left"></i> Back</button>
      <span class="remote-view-title" title="${escAttr(remote.name)}"><i class="ti ti-device-remote" style="vertical-align:-2px;"></i><span class="remote-view-title-text">${escHtml(remote.name)}</span></span>
    </div>
    <div class="remote-view-actions">
      <button class="btn btn-sm ${remote.favorite ? 'btn-green' : ''}" title="${remote.favorite ? 'Unfavorite Remote' : 'Favorite Remote'}" onclick="toggleFavoriteRemote(${remote.id},event)"><i class="ti ${remote.favorite ? 'ti-star-filled' : 'ti-star'}"></i></button>
      <button class="btn btn-sm" onclick="openRenameModal(event,'remote',${remote.id})"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-sm" onclick="showAddButtonBox(${remote.id})"><i class="ti ti-plus"></i> Add Button</button>
      <button class="btn btn-sm btn-danger" onclick="openDeleteModal(event,'remote',${remote.id})"><i class="ti ti-trash"></i></button>
    </div>`;
  el.appendChild(hdr);
  const addPlaceholder = document.createElement('div');
  addPlaceholder.id = 'addBtnBoxWrap-' + remote.id;
  el.appendChild(addPlaceholder);
  remote.buttons.forEach(btn => el.appendChild(buildSignalBox(btn, remote.id)));
  if (!remote.buttons.length) {
    const emp = document.createElement('div');
    emp.className = 'empty-state'; emp.id = 'remote-empty-' + remote.id;
    emp.innerHTML = `<i class="ti ti-cursor-off"></i><p>No buttons. Click "Add Button" above.</p>`;
    el.appendChild(emp);
  }
}
function buildSignalBox(btn, remoteId) {
  const remoteObj = library.find(r => r.id===remoteId);
  const remName = remoteObj ? remoteObj.name : '';
  const isFav = !!btn.favorite;
  const box = document.createElement('div');
  box.className = 'signal-box';
  box.id = 'sigbox-' + btn.id;
  box.innerHTML = `
    <div class="signal-box-header">
      <span class="signal-box-name" id="sname-${btn.id}" title="${escAttr(btn.name)}">${escHtml(btn.name)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" onclick="toggleFavoriteButton(${btn.id},${remoteId},event)" style="color:${isFav ? 'var(--accent)' : 'var(--text3)'}"><i class="ti ${isFav ? 'ti-star-filled' : 'ti-star'}"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" title="Rename" onclick="toggleEditName(${btn.id},${remoteId})"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" title="Delete" onclick="deleteButton(${btn.id},${remoteId})" style="color:var(--text3);" onmouseenter="this.style.color='var(--red)'" onmouseleave="this.style.color='var(--text3)'"><i class="ti ti-trash"></i></button>
    </div>
    <div id="sname-edit-${btn.id}" style="display:none;margin-bottom:8px;">
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="sname-inp-${btn.id}" maxlength="24" value="${escAttr(btn.name)}" style="width:200px;" oninput="validateSigName(${btn.id})" onkeydown="if(event.key==='Enter')confirmEditName(${btn.id},${remoteId})">
        <button class="btn btn-green btn-sm" onclick="confirmEditName(${btn.id},${remoteId})"><i class="ti ti-check"></i></button>
        <button class="btn btn-sm" onclick="toggleEditName(${btn.id},${remoteId})"><i class="ti ti-x"></i></button>
      </div>
      <div class="field-err" id="sname-err-${btn.id}"></div>
    </div>
    <div class="signal-meta">
      <span class="signal-chip addr"><i class="ti ti-map-pin" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(btn.addr||'—')}</span>
      <span class="signal-chip cmd"><i class="ti ti-terminal" style="font-size:9px;vertical-align:-1px;"></i> ${escHtml(btn.cmd||'—')}</span>
      ${btn.proto ? `<span class="signal-chip proto">${escHtml(btn.proto)}</span>` : ''}
    </div>
    <div id="sdesc-view-${btn.id}" class="signal-desc-view" onclick="toggleEditDesc(${btn.id},${remoteId})" title="Click to edit description">
      ${btn.desc ? escHtml(btn.desc) : '<span style="color:var(--text3);font-style:italic;">Add description...</span>'}
    </div>
    <div id="sdesc-edit-${btn.id}" style="display:none;margin-bottom:8px;">
      <textarea id="sdesc-inp-${btn.id}" placeholder="Describe what this button does...">${escHtml(btn.desc||'')}</textarea>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-green btn-sm" onclick="confirmEditDesc(${btn.id},${remoteId})"><i class="ti ti-check"></i> Save</button>
        <button class="btn btn-sm" onclick="toggleEditDesc(${btn.id},${remoteId})">Cancel</button>
      </div>
    </div>
    <div class="signal-actions">
      <button class="btn btn-green btn-sm" onclick="sendButtonSignal('${escAttr(btn.addr)}','${escAttr(btn.cmd)}','${escAttr(remName+' / '+btn.name)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Send</button>
    </div>`;
  return box;
}

// ===== ADD BUTTON BOX =====
function showAddButtonBox(remoteId) {
  const wrap = document.getElementById('addBtnBoxWrap-' + remoteId);
  if (!wrap || wrap.querySelector('.add-btn-box')) return;
  const box = document.createElement('div');
  box.className = 'add-btn-box';
  box.innerHTML = `
    <div class="add-btn-box-title"><i class="ti ti-plus"></i> New Button</div>
    <div class="row2">
      <div class="field-group">
        <label class="field-label">Button Name</label>
        <input type="text" id="abn-name-${remoteId}" maxlength="24" placeholder="e.g. Power" oninput="validateAddBtn(${remoteId})">
        <div class="field-err" id="abn-name-err-${remoteId}"></div>
      </div>
      <div class="field-group">
        <label class="field-label">Description (optional)</label>
        <input type="text" id="abn-desc-${remoteId}" placeholder="What does this do?">
      </div>
    </div>
    <div class="row2">
      <div class="field-group">
        <label class="field-label">Address Hex</label>
        <input type="text" id="abn-addr-${remoteId}" class="hex-input" placeholder="20 00 00 00" oninput="onHexInputRaw(this);validateAddBtn(${remoteId})" maxlength="11" autocomplete="off" spellcheck="false">
        <div class="field-err" id="abn-addr-err-${remoteId}"></div>
      </div>
      <div class="field-group">
        <label class="field-label">Command Hex</label>
        <input type="text" id="abn-cmd-${remoteId}" class="hex-input" placeholder="09 00 00 00" oninput="onHexInputRaw(this);validateAddBtn(${remoteId})" maxlength="11" autocomplete="off" spellcheck="false">
        <div class="field-err" id="abn-cmd-err-${remoteId}"></div>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-green" id="abn-create-${remoteId}" onclick="confirmAddButton(${remoteId})" disabled><i class="ti ti-check"></i> Create</button>
      <button class="btn" onclick="document.getElementById('addBtnBoxWrap-${remoteId}').innerHTML=''">Cancel</button>
    </div>`;
  wrap.appendChild(box);
  document.getElementById('abn-name-' + remoteId).focus();
}
function validateAddBtn(remoteId) {
  const name = document.getElementById('abn-name-'+remoteId).value.trim();
  const addr = document.getElementById('abn-addr-'+remoteId).value;
  const cmd  = document.getElementById('abn-cmd-'+remoteId).value;
  const vn=!!name, va=validateHex(addr), vc=validateHex(cmd);
  document.getElementById('abn-name-err-'+remoteId).textContent = (!vn&&name.length>0) ? 'Name required' : '';
  document.getElementById('abn-addr-err-'+remoteId).textContent = (!va&&addr.length>0) ? 'Must be 4 hex bytes e.g. 20 00 00 00' : '';
  document.getElementById('abn-cmd-err-'+remoteId).textContent  = (!vc&&cmd.length>0)  ? 'Must be 4 hex bytes e.g. 09 00 00 00' : '';
  document.getElementById('abn-create-'+remoteId).disabled = !(vn&&va&&vc);
}
function confirmAddButton(remoteId) {
  const name = limitName(document.getElementById('abn-name-'+remoteId).value, 'button');
  const addr = document.getElementById('abn-addr-'+remoteId).value.trim();
  const cmd  = document.getElementById('abn-cmd-'+remoteId).value.trim();
  const desc = document.getElementById('abn-desc-'+remoteId).value.trim();
  if (!name||!validateHex(addr)||!validateHex(cmd)) return;
  const remote = library.find(r => r.id===remoteId);
  const newBtn = { id:genId(), name, addr, cmd, desc, proto:'NEC', favorite:false };
  remote.buttons.push(newBtn);
  saveLib();
  document.getElementById('remote-empty-'+remoteId)?.remove();
  document.getElementById('addBtnBoxWrap-'+remoteId).innerHTML = '';
  document.getElementById('libraryContent').appendChild(buildSignalBox(newBtn, remoteId));
  appendLog(`Added "${name}" to "${remote.name}".`, 'sys');
}

// ===== INLINE EDITS =====
function toggleFavoriteRemote(remoteId, e) {
  if (e) e.stopPropagation();
  const remote = library.find(r => r.id===remoteId && r.type==='remote');
  if (!remote) return;
  remote.favorite = !remote.favorite;
  saveLib();
  if (currentTab === 'library') renderLibraryPane();
}
function toggleFavoriteButton(btnId, remoteId, e) {
  if (e) e.stopPropagation();
  const remote = library.find(r => r.id===remoteId);
  if (!remote) return;
  const btn = (remote.buttons || []).find(b => b.id===btnId);
  if (!btn) return;
  btn.favorite = !btn.favorite;
  saveLib();
  if (currentTab === 'library') renderLibraryPane();
}
function toggleEditName(btnId, remoteId) {
  const edit = document.getElementById('sname-edit-'+btnId);
  edit.style.display = edit.style.display==='none' ? 'block' : 'none';
  if (edit.style.display!=='none') document.getElementById('sname-inp-'+btnId).focus();
}
function validateSigName(btnId) {
  const v = document.getElementById('sname-inp-'+btnId).value.trim();
  document.getElementById('sname-err-'+btnId).textContent = v ? '' : 'Name required';
  return !!v;
}
function confirmEditName(btnId, remoteId) {
  if (!validateSigName(btnId)) return;
  const v = limitName(document.getElementById('sname-inp-'+btnId).value, 'button');
  library.find(r=>r.id===remoteId).buttons.find(b=>b.id===btnId).name = v;
  saveLib();
  document.getElementById('sname-'+btnId).textContent = v;
  document.getElementById('sname-'+btnId).title = v;
  document.getElementById('sname-edit-'+btnId).style.display = 'none';
}
function toggleEditDesc(btnId, remoteId) {
  const view = document.getElementById('sdesc-view-'+btnId);
  const edit = document.getElementById('sdesc-edit-'+btnId);
  const open = edit.style.display!=='none';
  edit.style.display = open ? 'none' : 'block';
  view.style.display = open ? '' : 'none';
  if (!open) document.getElementById('sdesc-inp-'+btnId).focus();
}
function confirmEditDesc(btnId, remoteId) {
  const v = document.getElementById('sdesc-inp-'+btnId).value.trim();
  library.find(r=>r.id===remoteId).buttons.find(b=>b.id===btnId).desc = v;
  saveLib();
  document.getElementById('sdesc-view-'+btnId).innerHTML = v ? escHtml(v) : '<span style="color:var(--text3);font-style:italic;">Add description...</span>';
  document.getElementById('sdesc-edit-'+btnId).style.display = 'none';
  document.getElementById('sdesc-view-'+btnId).style.display = '';
}
function deleteButton(btnId, remoteId) {
  if (!confirm('Delete this button?')) return;
  library.find(r=>r.id===remoteId).buttons = library.find(r=>r.id===remoteId).buttons.filter(b=>b.id!==btnId);
  saveLib();
  if (currentTab === 'library') renderLibraryPane();
  else document.getElementById('sigbox-'+btnId)?.remove();
}
function sendButtonSignal(addr, cmd, label) {
  if (!writer) { appendLog('Not connected — cannot send.','err'); return; }
  transmitPayload(addr, cmd, label||'Button');
}

// ===== MODALS =====
let _folderParentId = null;
function openNewFolderModal(parentId, e) {
  if(e) e.stopPropagation();
  _folderParentId = parentId;
  document.getElementById('folderModalTitle').textContent = 'New Folder';
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderNameErr').textContent = '';
  document.getElementById('folderModal').classList.add('open');
  setTimeout(()=>document.getElementById('folderNameInput').focus(),50);
}
function closeFolderModal() { document.getElementById('folderModal').classList.remove('open'); }
function validateFolderName() {
  const v = document.getElementById('folderNameInput').value.trim();
  document.getElementById('folderNameErr').textContent = v ? '' : 'Name required';
  return !!v;
}
function confirmFolder() {
  if (!validateFolderName()) return;
  library.push({ type:'folder', id:genId(), name:limitName(document.getElementById('folderNameInput').value, 'folder'), parentId:_folderParentId, open:false });
  saveLib(); closeFolderModal(); renderSidebarTree();
}

let _renameType, _renameId;
function openRenameModal(e, type, id) {
  if(e) e.stopPropagation();
  _renameType=type; _renameId=id;
  const item = library.find(x=>x.id===id);
  document.getElementById('renameInput').value = item.name;
  document.getElementById('renameErr').textContent = '';
  document.getElementById('renameConfirmBtn').disabled = false;
  document.getElementById('renameModal').classList.add('open');
  setTimeout(()=>document.getElementById('renameInput').focus(),50);
}
function closeRenameModal() { document.getElementById('renameModal').classList.remove('open'); }
function validateRenameInput() {
  const v = document.getElementById('renameInput').value.trim();
  document.getElementById('renameErr').textContent = v ? '' : 'Name required';
  document.getElementById('renameConfirmBtn').disabled = !v;
  return !!v;
}
function confirmRename() {
  if (!validateRenameInput()) return;
  library.find(x=>x.id===_renameId).name = limitName(document.getElementById('renameInput').value, _renameType === 'folder' ? 'folder' : 'remote');
  saveLib(); closeRenameModal(); renderSidebarTree();
  if (currentTab==='library') renderLibraryPane();
}

let _deleteType, _deleteId;
function openDeleteModal(e, type, id) {
  if(e) e.stopPropagation();
  _deleteType=type; _deleteId=id;
  const item = library.find(x=>x.id===id);
  document.getElementById('deleteModalTitle').textContent = `Delete "${item.name}"?`;
  document.getElementById('deleteModalMsg').textContent = type==='folder'
    ? 'This deletes the folder and everything inside it.'
    : 'This deletes the remote and all its buttons.';
  document.getElementById('deleteModal').classList.add('open');
}
function closeDeleteModal() { document.getElementById('deleteModal').classList.remove('open'); }
function confirmDelete() {
  if (_deleteType==='folder') deleteFolder(_deleteId); else deleteRemote(_deleteId);
  sanitizeLibraryNavigator();
  saveLib(); closeDeleteModal(); renderSidebarTree();
  if (currentTab==='library') { if (_deleteType==='remote'&&selectedRemoteId===_deleteId) selectedRemoteId=null; renderLibraryPane(); }
}
function deleteFolder(id) {
  library.filter(x=>x.type==='folder'&&x.parentId===id).forEach(s=>deleteFolder(s.id));
  library = library.filter(x=>!(x.type==='remote'&&x.folderId===id));
  library = library.filter(x=>x.id!==id);
}
function deleteRemote(id) { library = library.filter(x=>x.id!==id); }

function openClearLibraryModal() {
  document.getElementById('clearLibraryModal').classList.add('open');
}
function closeClearLibraryModal() { document.getElementById('clearLibraryModal').classList.remove('open'); }
function confirmClearLibrary() {
  library = []; nextId = 1; saveLib();
  selectedRemoteId = null;
  libraryCurrentFolderId = null;
  libraryBackStack = [];
  closeClearLibraryModal();
  renderSidebarTree();
  if (currentTab==='library') renderLibraryPane();
  appendLog('Library cleared.', 'sys');
}

function getFolderPath(id) {
  const parts=[]; let cur=library.find(x=>x.id===id);
  while(cur) { parts.unshift(cur.name); cur=cur.parentId?library.find(x=>x.id===cur.parentId):null; }
  return '/ '+parts.join(' / ');
}

['folderModal','renameModal','deleteModal','clearLibraryModal','clearFavoritesModal','irdbFolderModal','irdbRemoteModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });
});

// ===== IRDB =====
// Cache raw file content to avoid re-fetching (handles rate limits)
const irdbFileCache = {};
let irdbData=null, irdbExpanded={}, irdbSelectedPath=null, _irdbFolderPath='';
let _irdbFolderDestFolderId = null;
let _irdbRemoteImportPath = '', _irdbRemoteImportName = '', _irdbRemoteImportBtn = null, _irdbRemoteDestFolderId = null;
let _irdbImportExpanded = {};

async function fetchWithCache(url) {
  if (irdbFileCache[url]) return irdbFileCache[url];
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP '+resp.status + (resp.status===403 ? ' — GitHub rate limit. Wait a minute and try again.' : ''));
  const text = await resp.text();
  irdbFileCache[url] = text;
  return text;
}

async function initIRDB() {
  if (irdbData) { renderIRDBTree(); return; }
  document.getElementById('irdbTree').innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:12px;color:var(--text3);font-family:var(--mono);font-size:11px;"><span class="spinner"></span> Loading IRDB tree...</div>`;
  try {
    // Try to get from sessionStorage cache first
    const cached = sessionStorage.getItem('irdb_tree');
    if (cached) {
      irdbData = JSON.parse(cached);
      renderIRDBTree();
      return;
    }
    const r = await fetch('https://api.github.com/repos/Lucaslhm/Flipper-IRDB/git/trees/main?recursive=1');
    if (!r.ok) {
      if (r.status === 403) throw new Error('GitHub API rate limit hit. Try again in a minute, or wait up to an hour for unauthenticated limits to reset.');
      throw new Error('HTTP '+r.status);
    }
    const data = await r.json();
    irdbData = data.tree.filter(n=>n.type==='blob'&&n.path.endsWith('.ir'));
    // Cache the tree in sessionStorage so page refreshes don't re-hit the API
    try { sessionStorage.setItem('irdb_tree', JSON.stringify(irdbData)); } catch(e) {}
    renderIRDBTree();
  } catch(e) {
    document.getElementById('irdbTree').innerHTML=`<div style="padding:12px;color:var(--red);font-family:var(--mono);font-size:11px;line-height:1.6;"><i class="ti ti-alert-circle"></i> ${escHtml(String(e))}<br><br><button class="btn btn-sm" onclick="irdbData=null;initIRDB()"><i class="ti ti-refresh"></i> Retry</button></div>`;
  }
}
function buildIRDBTree() {
  const root={};
  (irdbData||[]).forEach(node=>{
    const parts=node.path.split('/'); let cur=root;
    for(let i=0;i<parts.length-1;i++){if(!cur[parts[i]])cur[parts[i]]={_files:[]};cur=cur[parts[i]];}
    if(!cur._files)cur._files=[];
    cur._files.push({name:parts[parts.length-1],path:node.path});
  });
  return root;
}
function renderIRDBTree() {
  const el=document.getElementById('irdbTree');
  const tree=buildIRDBTree();
  const search=document.getElementById('irdbSearch').value.trim().toLowerCase();
  el.innerHTML='';
  renderIRDBLevel(el,tree,'',0,search);
}
function renderIRDBLevel(container, node, path, depth, search) {
  const keys=Object.keys(node).filter(k=>k!=='_files').sort();
  const files=(node._files||[]).filter(f=>!search||f.name.toLowerCase().includes(search)||path.toLowerCase().includes(search));
  keys.forEach(key=>{
    const cp=path?path+'/'+key:key;
    if(search&&!irdbNodeMatches(node[key],key,search)) return;
    const isOpen=irdbExpanded[cp]||!!search;
    const row=document.createElement('div');
    row.style.cssText=`padding:5px 8px 5px ${8+depth*12}px;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--text2);font-family:var(--mono);font-size:11px;transition:background 0.1s;position:relative;`;
    row.innerHTML=`
      <i class="ti ${isOpen?'ti-chevron-down':'ti-chevron-right'}" style="font-size:10px;color:var(--text3);width:12px;flex-shrink:0;"></i>
      <i class="ti ${isOpen?'ti-folder-open':'ti-folder'}" style="font-size:13px;flex-shrink:0;"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(key)}</span>
      <button class="tree-act irdb-folder-btn" title="Import entire folder" onclick="openIRDBFolderModal(event,'${escAttr(cp)}')" style="opacity:0;flex-shrink:0;"><i class="ti ti-folder-down"></i></button>`;
    row.onmouseenter=()=>{ row.style.background='var(--bg3)'; row.querySelector('.irdb-folder-btn').style.opacity='1'; };
    row.onmouseleave=()=>{ row.style.background=''; row.querySelector('.irdb-folder-btn').style.opacity='0'; };
    row.addEventListener('click', e=>{ if(e.target.closest('.irdb-folder-btn')) return; irdbExpanded[cp]=!irdbExpanded[cp]; renderIRDBTree(); });
    container.appendChild(row);
    if(isOpen) renderIRDBLevel(container,node[key],cp,depth+1,search);
  });
  files.forEach(f=>{
    const isSel=irdbSelectedPath===f.path;
    const row=document.createElement('div');
    row.style.cssText=`padding:5px 8px 5px ${8+depth*12+12}px;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:var(--mono);font-size:11px;transition:background 0.1s;${isSel?'background:var(--accent-dim);color:var(--text);':'color:var(--text2);'}`;
    const remoteName = f.name.replace('.ir','');
    row.innerHTML=`
      <i class="ti ti-device-remote" style="font-size:12px;flex-shrink:0;"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(remoteName)}</span>
      <button class="tree-act irdb-file-btn" title="Import remote" onclick="event.stopPropagation();openIRDBRemoteModal('${escAttr(f.path)}','${escAttr(remoteName)}',this,event)" style="opacity:0;flex-shrink:0;"><i class="ti ti-download"></i></button>`;
    row.onmouseenter=()=>{ if(!isSel) row.style.background='var(--bg3)'; row.querySelector('.irdb-file-btn').style.opacity='1'; };
    row.onmouseleave=()=>{ if(!isSel) row.style.background=''; row.querySelector('.irdb-file-btn').style.opacity='0'; };
    row.onclick=()=>{ irdbSelectedPath=f.path; renderIRDBTree(); loadIRDBFile(f); };
    container.appendChild(row);
  });
}
function irdbNodeMatches(node,key,s) {
  if(key.toLowerCase().includes(s)) return true;
  if((node._files||[]).some(f=>f.name.toLowerCase().includes(s))) return true;
  return Object.keys(node).filter(k=>k!=='_files').some(c=>irdbNodeMatches(node[c],c,s));
}
function filterIRDB() { renderIRDBTree(); }

async function loadIRDBFile(file) {
  const el=document.getElementById('irdbRemoteView');
  el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:20px;color:var(--text3);font-family:var(--mono);font-size:11px;"><span class="spinner"></span> Loading...</div>`;
  try {
    const text=await fetchWithCache(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${file.path}`);
    const buttons=parseIRFile(text);
    renderIRDBRemote(el, file, buttons);
  } catch(e) {
    el.innerHTML=`<div style="padding:20px;color:var(--red);font-family:var(--mono);font-size:11px;line-height:1.6;"><i class="ti ti-alert-circle"></i> ${escHtml(String(e))}</div>`;
  }
}
function renderIRDBRemote(el, file, buttons) {
  const name=file.name.replace('.ir','');
  el.innerHTML='';
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);';
  hdr.innerHTML=`
    <i class="ti ti-device-remote" style="color:var(--accent);font-size:18px;flex-shrink:0;"></i>
    <div style="flex:1;min-width:0;">
      <div title="${escAttr(name)}" style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);">${escHtml(file.path)} &middot; ${buttons.length} button${buttons.length!==1?'s':''}</div>
    </div>
    <button class="btn btn-sm" onclick="openIRDBRemoteModal('${escAttr(file.path)}','${escAttr(name)}',this,event)"><i class="ti ti-download"></i> Import</button>`;
  el.appendChild(hdr);
  if(!buttons.length){
    const emp=document.createElement('div');
    emp.className='empty-state';
    emp.innerHTML=`<i class="ti ti-file-x"></i><p>No compatible NEC buttons in this file.</p>`;
    el.appendChild(emp); return;
  }
  buttons.forEach(btn=>{
    const box=document.createElement('div');
    box.className='irdb-detail-btn-box';
    box.innerHTML=`
      <div class="irdb-detail-btn-name" title="${escAttr(btn.name)}">${escHtml(btn.name)}</div>
      <div class="signal-meta" style="margin-bottom:8px;">
        <span class="signal-chip addr"><i class="ti ti-map-pin" style="font-size:9px;"></i> ${escHtml(btn.addr||'—')}</span>
        <span class="signal-chip cmd"><i class="ti ti-terminal" style="font-size:9px;"></i> ${escHtml(btn.cmd||'—')}</span>
        ${btn.proto?`<span class="signal-chip proto">${escHtml(btn.proto)}</span>`:''}
      </div>
      <button class="btn btn-green btn-sm" onclick="sendButtonSignal('${escAttr(btn.addr)}','${escAttr(btn.cmd)}','${escAttr(name+' / '+btn.name)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Send</button>`;
    el.appendChild(box);
  });
}
async function importIRDBRemote(path, name, btnEl, destFolderId=null) {
  const origHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) { btnEl.disabled=true; btnEl.innerHTML='<span class="spinner"></span>'; }
  try {
    const text=await fetchWithCache(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${path}`);
    const buttons=parseIRFile(text);
    if(!buttons.length){ if(btnEl){btnEl.innerHTML=origHtml;btnEl.disabled=false;} appendLog(`"${name}" — no compatible buttons.`,'sys'); return false; }
    const parentId = (destFolderId == null || destFolderId === '') ? null : parseInt(destFolderId);
    library.push({type:'remote',id:genId(),name,folderId:parentId,buttons,favorite:false});
    saveLib(); renderSidebarTree();
    appendLog(`Imported "${name}" (${buttons.length} btns) into "${parentId == null ? '/ Root' : getFolderPath(parentId)}".`,'sys');
    if(btnEl){ btnEl.innerHTML='<i class="ti ti-check"></i> Done'; setTimeout(()=>{btnEl.innerHTML=origHtml;btnEl.disabled=false;},2000); }
    return true;
  } catch(e) {
    appendLog('IRDB import error: '+e,'err');
    if(btnEl){ btnEl.innerHTML=origHtml; btnEl.disabled=false; }
    return false;
  }
}

function renderImportDestinationTree(containerId, selectedId, setSelected) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const rootRow = document.createElement('div');
  rootRow.className = 'folder-picker-row' + (selectedId == null ? ' selected' : '');
  rootRow.innerHTML = `<i class="ti ti-home"></i><span class="folder-picker-label">/ Root</span>`;
  rootRow.onclick = () => {
    setSelected(null);
    renderImportDestinationTree(containerId, null, setSelected);
  };
  container.appendChild(rootRow);

  const hasChildren = (folderId) => library.some(x => x.type==='folder' && x.parentId===folderId);
  const getFolders = (parentId) => library
    .filter(x => x.type==='folder' && x.parentId===parentId)
    .sort((a,b) => a.name.localeCompare(b.name));

  const renderLevel = (parentId, depth) => {
    getFolders(parentId).forEach(folder => {
      const key = String(folder.id);
      const kids = hasChildren(folder.id);
      const isOpen = Object.prototype.hasOwnProperty.call(_irdbImportExpanded, key) ? !!_irdbImportExpanded[key] : true;
      const row = document.createElement('div');
      row.className = 'folder-picker-row' + (selectedId===folder.id ? ' selected' : '');
      row.style.paddingLeft = (8 + depth * 14) + 'px';
      row.innerHTML = `
        <i class="ti ${kids ? (isOpen ? 'ti-chevron-down' : 'ti-chevron-right') : 'ti-point'}"></i>
        <i class="ti ti-folder"></i>
        <span class="folder-picker-label">${escHtml(folder.name)}</span>`;
      row.onclick = () => {
        setSelected(folder.id);
        renderImportDestinationTree(containerId, folder.id, setSelected);
      };
      const chevron = row.querySelector('i');
      if (kids) {
        chevron.onclick = (e) => {
          e.stopPropagation();
          _irdbImportExpanded[key] = !isOpen;
          renderImportDestinationTree(containerId, selectedId, setSelected);
        };
      } else {
        chevron.style.visibility = 'hidden';
      }
      container.appendChild(row);
      if (kids && isOpen) renderLevel(folder.id, depth + 1);
    });
  };

  renderLevel(null, 1);
}

function openIRDBRemoteModal(path, name, btnEl, e=null) {
  if (e) e.stopPropagation();
  _irdbRemoteImportPath = path;
  _irdbRemoteImportName = name;
  _irdbRemoteImportBtn = btnEl || null;
  _irdbRemoteDestFolderId = null;
  _irdbImportExpanded = {};
  document.getElementById('irdbRemoteModalDesc').textContent = `Import "${name}" into your library.`;
  renderImportDestinationTree('irdbRemoteDestTree', _irdbRemoteDestFolderId, (id) => { _irdbRemoteDestFolderId = id; });
  document.getElementById('irdbRemoteModal').classList.add('open');
}
function closeIrdbRemoteModal() { document.getElementById('irdbRemoteModal').classList.remove('open'); }
async function confirmIRDBRemoteImport() {
  const btn = document.getElementById('irdbRemoteImportBtn');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Importing...';
  const ok = await importIRDBRemote(_irdbRemoteImportPath, _irdbRemoteImportName, _irdbRemoteImportBtn, _irdbRemoteDestFolderId);
  btn.disabled = false;
  btn.innerHTML = origHtml;
  if (ok) closeIrdbRemoteModal();
}

function openIRDBFolderModal(e, folderPath) {
  e.stopPropagation();
  _irdbFolderPath = folderPath;
  const count = (irdbData||[]).filter(n=>n.path.startsWith(folderPath+'/')).length;
  document.getElementById('irdbFolderModalDesc').textContent = `Import all ${count} remote${count!==1?'s':''} from "${folderPath.split('/').pop()}" into your library.`;
  _irdbFolderDestFolderId = null;
  _irdbImportExpanded = {};
  renderImportDestinationTree('irdbFolderDestTree', _irdbFolderDestFolderId, (id) => { _irdbFolderDestFolderId = id; });
  document.getElementById('irdbFolderModal').classList.add('open');
}
function closeIrdbFolderModal() { document.getElementById('irdbFolderModal').classList.remove('open'); }
async function confirmIRDBFolderImport() {
  const destFolderId = _irdbFolderDestFolderId;
  const folderFiles = (irdbData||[]).filter(n=>n.path.startsWith(_irdbFolderPath+'/'));
  const btn = document.getElementById('irdbFolderImportBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Importing...';
  const rootParentId = (destFolderId == null || destFolderId === '') ? null : parseInt(destFolderId);
  const importRootName = _irdbFolderPath.split('/').pop() || 'IRDB Import';
  const importRoot = createImportFolder(importRootName, rootParentId);
  const createdFolderIds = new Set([importRoot.id]);
  let imported=0, skipped=0;
  for (const f of folderFiles) {
    try {
      const text=await fetchWithCache(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${f.path}`);
      const buttons=parseIRFile(text);
      if(!buttons.length){skipped++;continue;}
      const parts=f.path.split('/');
      const remoteName=parts[parts.length-1].replace('.ir','');
      const subParts=parts.slice(_irdbFolderPath.split('/').length,-1);
      let parentId=importRoot.id;
      for(const sp of subParts){
        let folder=library.find(fl=>fl.type==='folder'&&fl.name===sp&&fl.parentId===parentId);
        if(!folder){
          const newFolder = createFolderEntry(sp, parentId, false);
          createdFolderIds.add(newFolder.id);
          parentId=newFolder.id;
        }
        else parentId=folder.id;
      }
      library.push({type:'remote',id:genId(),name:limitName(remoteName, 'remote'),folderId:parentId,buttons,favorite:false});
      imported++;
    } catch(e){ skipped++; }
  }
  if (!imported) library = library.filter(x => !(x.type === 'folder' && createdFolderIds.has(x.id)));
  saveLib(); renderSidebarTree();
  closeIrdbFolderModal();
  btn.disabled=false; btn.innerHTML='<i class="ti ti-download"></i> Import All';
  appendLog(`IRDB folder import into "${importRoot.name}": ${imported} imported, ${skipped} skipped.`,'sys');
  if(currentTab==='library') renderLibraryPane();
}

// ===== UTILS =====
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

// ===== INIT =====
normalizeLibraryNameLimits();
switchTab('library');
renderSidebarTree();
validateInputs();
renderHistory();

// ===== EVENT LISTENERS (replacing inline handlers) =====
document.getElementById('connectBtn').addEventListener('click', toggleConnection);
document.getElementById('btnNewFolder').addEventListener('click', function(e) { openNewFolderModal(null, e); });
document.getElementById('inputImportFiles').addEventListener('change', function() { importIRFiles(this.files, null, this); });
document.getElementById('inputImportFolder').addEventListener('change', function() { importFolder(this.files, this); });
document.getElementById('btnCollapseAll').addEventListener('click', collapseAllFolders);
document.getElementById('btnClearLibrary').addEventListener('click', openClearLibraryModal);
document.getElementById('sidebarSearch').addEventListener('input', function() { setSidebarSearch(this.value); });
document.getElementById('tab-library').addEventListener('click', function() { switchTab('library'); });
document.getElementById('tab-irdb').addEventListener('click', function() { switchTab('irdb'); });
document.getElementById('tab-transmit').addEventListener('click', function() { switchTab('transmit'); });
document.getElementById('libraryView-overview').addEventListener('click', function() { setLibraryView('overview'); });
document.getElementById('libraryView-favorites').addEventListener('click', function() { setLibraryView('favorites'); });
document.getElementById('librarySearch').addEventListener('input', function() { setLibrarySearch(this.value); });
document.getElementById('irdbSearch').addEventListener('input', filterIRDB);
document.getElementById('btnClearHistory').addEventListener('click', clearHistory);
document.getElementById('addressInput').addEventListener('input', function() { onHexInput(this); });
document.getElementById('commandInput').addEventListener('input', function() { onHexInput(this); });
document.getElementById('transmitBtn').addEventListener('click', transmitPayload);
document.getElementById('btnToggleSave').addEventListener('click', toggleSaveForm);
document.getElementById('saveNameInput').addEventListener('input', validateSaveFormName);
document.getElementById('saveNewRemoteName').addEventListener('input', validateSaveRemoteName);
document.getElementById('btnSaveManual').addEventListener('click', saveManualSignal);
document.getElementById('btnCancelSave').addEventListener('click', toggleSaveForm);
document.getElementById('logBarHeader').addEventListener('click', toggleLogBar);
document.getElementById('btnClearConsole').addEventListener('click', function(e) { clearConsole(e); });
document.getElementById('folderNameInput').addEventListener('input', validateFolderName);
document.getElementById('folderNameInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') confirmFolder(); });
document.getElementById('btnFolderCancel').addEventListener('click', closeFolderModal);
document.getElementById('btnFolderConfirm').addEventListener('click', confirmFolder);
document.getElementById('renameInput').addEventListener('input', validateRenameInput);
document.getElementById('renameInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') confirmRename(); });
document.getElementById('btnRenameCancel').addEventListener('click', closeRenameModal);
document.getElementById('renameConfirmBtn').addEventListener('click', confirmRename);
document.getElementById('btnDeleteCancel').addEventListener('click', closeDeleteModal);
document.getElementById('btnDeleteConfirm').addEventListener('click', confirmDelete);
document.getElementById('btnClearLibCancel').addEventListener('click', closeClearLibraryModal);
document.getElementById('clearLibraryConfirmBtn').addEventListener('click', confirmClearLibrary);
document.getElementById('btnClearFavCancel').addEventListener('click', closeClearFavoritesModal);
document.getElementById('clearFavoritesConfirmBtn').addEventListener('click', confirmClearFavorites);
document.getElementById('btnIrdbFolderCancel').addEventListener('click', closeIrdbFolderModal);
document.getElementById('irdbFolderImportBtn').addEventListener('click', confirmIRDBFolderImport);
document.getElementById('btnIrdbRemoteCancel').addEventListener('click', closeIrdbRemoteModal);
document.getElementById('irdbRemoteImportBtn').addEventListener('click', confirmIRDBRemoteImport);
