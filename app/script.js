// ===== STATE =====
let port = null, writer = null;
let currentTab = 'library';
let selectedRemoteId = null;
let logBarOpen = false;
let logUnread = 0;

let library = JSON.parse(localStorage.getItem('lbd_library') || '[]');
let nextId = parseInt(localStorage.getItem('lbd_nextid') || '1');
function saveLib() { localStorage.setItem('lbd_library', JSON.stringify(library)); localStorage.setItem('lbd_nextid', String(nextId)); }
function genId() { return nextId++; }

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
    // Show device name if available
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
    validateInputs();
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
    const term = document.getElementById('terminal');
    setTimeout(() => term.scrollTop = term.scrollHeight, 10);
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

// ===== NEC ENCODE =====
function flipByte(b) { let r=0; for(let i=0;i<8;i++) if((b>>i)&1) r|=(1<<(7-i)); return r; }
function compileNEC(addr, cmd) {
  let a=parseInt(addr.split(' ')[0],16), c=parseInt(cmd.split(' ')[0],16);
  let af=flipByte(a), cf=flipByte(c);
  return [af,af^0xFF,cf,cf^0xFF].join(',');
}
async function transmitPayload(addrOvr, cmdOvr) {
  if (!writer) return;
  const addr = addrOvr || document.getElementById('addressInput').value;
  const cmd  = cmdOvr  || document.getElementById('commandInput').value;
  if (!validateHex(addr)||!validateHex(cmd)) { appendLog('Invalid hex — aborting.','err'); return; }
  const p = compileNEC(addr, cmd);
  appendLog(`TX [${p}]`, 'out');
  await writer.write(p + '\n');
}

// ===== TABS =====
function switchTab(tab) {
  ['transmit','library','irdb'].forEach(t => {
    document.getElementById('pane-'+t).style.display = t===tab ? '' : 'none';
    document.getElementById('tab-'+t).classList.toggle('active', t===tab);
  });
  currentTab = tab;
  if (tab === 'library') renderLibraryPane();
  if (tab === 'irdb') initIRDB();
}

// ===== SAVE FORM =====
function toggleSaveForm() {
  const f = document.getElementById('saveForm');
  f.classList.toggle('open');
  if (f.classList.contains('open')) { refreshRemoteSelect(); setTimeout(()=>document.getElementById('saveNameInput').focus(),50); }
}
function refreshRemoteSelect() {
  const sel = document.getElementById('saveRemoteSelect');
  sel.innerHTML = '<option value="__new__">+ Create new remote...</option>';
  library.filter(x => x.type==='remote').forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name + (r.folderId ? ' ('+getFolderPath(r.folderId)+')' : ' (Root)');
    sel.appendChild(opt);
  });
  onSaveRemoteChange();
}
function onSaveRemoteChange() {
  const v = document.getElementById('saveRemoteSelect').value;
  document.getElementById('saveNewRemoteFields').style.display = v==='__new__' ? 'block' : 'none';
  if (v==='__new__') refreshFolderSelect('saveNewRemoteFolderSelect');
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
  const name = document.getElementById('saveNameInput').value.trim();
  const desc = document.getElementById('saveDescInput').value.trim();
  const remSel = document.getElementById('saveRemoteSelect').value;
  let remote;
  if (remSel === '__new__') {
    if (!validateSaveRemoteName()) return;
    const rname = document.getElementById('saveNewRemoteName').value.trim();
    const fid = document.getElementById('saveNewRemoteFolderSelect').value || null;
    remote = { type:'remote', id:genId(), name:rname, folderId: fid ? parseInt(fid) : null, buttons:[] };
    library.push(remote);
  } else {
    remote = library.find(r => r.id===parseInt(remSel));
  }
  remote.buttons.push({ id:genId(), name, addr, cmd, desc, proto:'NEC' });
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
  return buttons.filter(b => validateHex(b.addr) && validateHex(b.cmd)).map(b => ({ ...b, id:genId(), desc:'' }));
}
function importIRFiles(files, folderId=null, inputEl=null) {
  Array.from(files).forEach(f => {
    if (!f.name.endsWith('.ir')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rname = f.name.replace('.ir','');
      const buttons = parseIRFile(ev.target.result);
      if (!buttons.length) { appendLog(`"${rname}" skipped — no valid NEC buttons.`,'sys'); return; }
      library.push({ type:'remote', id:genId(), name:rname, folderId: folderId ? parseInt(folderId) : null, buttons });
      saveLib(); renderSidebarTree();
      appendLog(`Imported "${rname}" — ${buttons.length} buttons.`,'sys');
    };
    reader.readAsText(f);
  });
  if (inputEl) inputEl.value = '';
}
function importFolder(files, inputEl=null) {
  if (!files.length) return;
  const folderMap = {};
  const fileList = Array.from(files);
  fileList.forEach(f => {
    const parts = f.webkitRelativePath.split('/');
    for (let i = 0; i < parts.length-1; i++) {
      const path = parts.slice(0,i+1).join('/');
      if (!folderMap[path]) {
        const parentPath = parts.slice(0,i).join('/');
        const parentId = i===0 ? null : folderMap[parentPath]||null;
        const fid = genId();
        folderMap[path] = fid;
        library.push({ type:'folder', id:fid, name:parts[i], parentId, open:false });
      }
    }
  });
  fileList.forEach(f => {
    if (!f.name.endsWith('.ir')) return;
    const parts = f.webkitRelativePath.split('/');
    const folderPath = parts.slice(0,-1).join('/');
    const folderId = folderMap[folderPath]||null;
    const reader = new FileReader();
    reader.onload = ev => {
      const rname = f.name.replace('.ir','');
      const buttons = parseIRFile(ev.target.result);
      if (!buttons.length) return;
      library.push({ type:'remote', id:genId(), name:rname, folderId, buttons });
      saveLib(); renderSidebarTree();
    };
    reader.readAsText(f);
  });
  appendLog(`Importing folder (${fileList.length} files)...`,'sys');
  if (inputEl) inputEl.value = '';
}

// ===== DRAG AND DROP =====
let dragItem = null; // { type: 'folder'|'remote', id }
let dragOverId = null;

function startDrag(e, type, id, label) {
  dragItem = { type, id };
  const ghost = document.getElementById('dragGhost');
  ghost.textContent = label;
  ghost.style.display = 'block';
  moveDragGhost(e);
  document.getElementById('dragHint').classList.add('visible');
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
  // Highlight drop target
  const els = document.querySelectorAll('.tree-item[data-dropid]');
  let found = null;
  els.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      found = el;
    }
    el.classList.remove('drag-over');
  });
  if (found) { found.classList.add('drag-over'); dragOverId = found.dataset.dropid; }
  else dragOverId = null;
  // Root drop zone
  const hint = document.getElementById('dragHint');
  const hr = hint.getBoundingClientRect();
  if (e.clientX >= hr.left && e.clientX <= hr.right && e.clientY >= hr.top && e.clientY <= hr.bottom) {
    hint.style.background = 'rgba(255,183,3,0.2)';
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
  document.querySelectorAll('.tree-item[data-dropid]').forEach(el => el.classList.remove('drag-over'));

  if (dragItem && dragOverId !== null) {
    performDrop(dragItem, dragOverId);
  }
  dragItem = null; dragOverId = null;
}
function isDescendant(folderId, ancestorId) {
  let cur = library.find(x => x.id===folderId && x.type==='folder');
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? library.find(x => x.id===cur.parentId) : null;
  }
  return false;
}
function performDrop(drag, targetId) {
  if (drag.type === 'folder') {
    const folder = library.find(x => x.type==='folder' && x.id===drag.id);
    if (!folder) return;
    if (targetId === '__root__') {
      folder.parentId = null;
    } else {
      const tid = parseInt(targetId);
      // Can't drop folder into itself or its own descendant
      if (tid === folder.id || isDescendant(tid, folder.id)) return;
      const target = library.find(x => x.type==='folder' && x.id===tid);
      if (!target) return;
      folder.parentId = tid;
    }
  } else if (drag.type === 'remote') {
    const remote = library.find(x => x.type==='remote' && x.id===drag.id);
    if (!remote) return;
    if (targetId === '__root__') {
      remote.folderId = null;
    } else {
      const tid = parseInt(targetId);
      const target = library.find(x => x.type==='folder' && x.id===tid);
      if (!target) return;
      remote.folderId = tid;
    }
  }
  saveLib(); renderSidebarTree();
  if (currentTab === 'library') renderLibraryPane();
}

// ===== SIDEBAR TREE =====
function renderSidebarTree() {
  const el = document.getElementById('sidebarTree');
  el.innerHTML = '';
  renderTreeLevel(el, null, 0);
}
function renderTreeLevel(container, parentId, depth) {
  const folders = library.filter(x => x.type==='folder' && x.parentId===parentId);
  const remotes = library.filter(x => x.type==='remote' && x.folderId===parentId);
  folders.forEach(folder => {
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = (8 + depth*14) + 'px';
    row.dataset.dropid = folder.id;
    const isOpen = folder.open !== false;
    row.innerHTML = `
      <i class="ti ti-grip-vertical drag-handle" title="Drag to move" onmousedown="startDrag(event,'folder',${folder.id},${JSON.stringify(folder.name)})"></i>
      <i class="ti ti-chevron-right ${isOpen?'open':''}"></i>
      <i class="ti ${isOpen?'ti-folder-open':'ti-folder'}"></i>
      <span class="tree-label">${escHtml(folder.name)}</span>
      <span class="tree-actions">
        <button class="tree-act" title="Rename" onclick="openRenameModal(event,'folder',${folder.id})"><i class="ti ti-pencil"></i></button>
        <button class="tree-act" title="New subfolder" onclick="openNewFolderModal(${folder.id},event)"><i class="ti ti-folder-plus"></i></button>
        <button class="tree-act del" title="Delete" onclick="openDeleteModal(event,'folder',${folder.id})"><i class="ti ti-trash"></i></button>
      </span>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.tree-actions') || e.target.closest('.drag-handle')) return;
      folder.open = !folder.open; saveLib(); renderSidebarTree();
    });
    container.appendChild(row);
    if (isOpen) renderTreeLevel(container, folder.id, depth+1);
  });
  remotes.forEach(remote => {
    const row = document.createElement('div');
    row.className = 'tree-item' + (selectedRemoteId===remote.id ? ' active' : '');
    row.style.paddingLeft = (8 + depth*14 + 14) + 'px';
    row.innerHTML = `
      <i class="ti ti-grip-vertical drag-handle" title="Drag to move" onmousedown="startDrag(event,'remote',${remote.id},${JSON.stringify(remote.name)})"></i>
      <i class="ti ti-device-remote-control"></i>
      <span class="tree-label">${escHtml(remote.name)}</span>
      <span class="tree-actions">
        <button class="tree-act" title="Rename" onclick="openRenameModal(event,'remote',${remote.id})"><i class="ti ti-pencil"></i></button>
        <button class="tree-act del" title="Delete" onclick="openDeleteModal(event,'remote',${remote.id})"><i class="ti ti-trash"></i></button>
      </span>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.tree-actions') || e.target.closest('.drag-handle')) return;
      selectedRemoteId=remote.id; renderSidebarTree(); switchTab('library');
    });
    container.appendChild(row);
  });
}

// ===== LIBRARY PANE =====
function renderLibraryPane() {
  const el = document.getElementById('libraryContent');
  if (selectedRemoteId != null) {
    const remote = library.find(r => r.id===selectedRemoteId);
    if (remote) { renderRemoteView(el, remote); return; }
    selectedRemoteId = null;
  }
  renderLibraryOverview(el);
}
function renderLibraryOverview(el) {
  el.innerHTML = '';
  if (!library.length) {
    el.innerHTML = `<div class="empty-state"><i class="ti ti-satellite"></i><p>No remotes yet.<br>Import .ir files or save signals from the Transmit tab.</p></div>`;
    return;
  }
  library.filter(x => x.type==='folder' && x.parentId===null).forEach(f => renderFolderSection(el, f));
  library.filter(x => x.type==='remote' && x.folderId===null).forEach(r => appendRemoteCard(el, r));
}
function renderFolderSection(container, folder) {
  const sec = document.createElement('div');
  sec.className = 'folder-section';
  const hdr = document.createElement('div');
  hdr.className = 'folder-section-hdr';
  const isOpen = folder.open !== false;
  hdr.innerHTML = `<i class="ti ${isOpen?'ti-chevron-down':'ti-chevron-right'}" style="font-size:11px;color:var(--text3);flex-shrink:0;"></i><i class="ti ti-folder" style="color:var(--text3);font-size:13px;flex-shrink:0;"></i><span class="folder-section-name">${escHtml(folder.name)}</span>`;
  hdr.onclick = () => { folder.open = !folder.open; saveLib(); renderLibraryPane(); };
  sec.appendChild(hdr);
  if (isOpen) {
    library.filter(x => x.type==='remote' && x.folderId===folder.id).forEach(r => appendRemoteCard(sec, r));
    library.filter(x => x.type==='folder' && x.parentId===folder.id).forEach(f => renderFolderSection(sec, f));
  }
  container.appendChild(sec);
}
function appendRemoteCard(container, remote) {
  const card = document.createElement('div');
  card.className = 'remote-card';
  card.innerHTML = `
    <div class="remote-card-hdr">
      <i class="ti ti-device-remote-control" style="color:var(--accent2);font-size:15px;flex-shrink:0;"></i>
      <span class="remote-card-name">${escHtml(remote.name)}</span>
      <span class="remote-card-count">${remote.buttons.length} btn${remote.buttons.length!==1?'s':''}</span>
    </div>
    <div class="chip-row">
      ${remote.buttons.slice(0,10).map(b=>`<span class="signal-chip">${escHtml(b.name)}</span>`).join('')}
      ${remote.buttons.length>10 ? `<span class="signal-chip" style="color:var(--text3);">+${remote.buttons.length-10}</span>` : ''}
    </div>`;
  card.onclick = () => { selectedRemoteId=remote.id; renderSidebarTree(); renderLibraryPane(); };
  container.appendChild(card);
}

// ===== REMOTE VIEW =====
function renderRemoteView(el, remote) {
  el.innerHTML = '';
  const bc = document.createElement('div');
  bc.className = 'breadcrumb';
  const folder = remote.folderId ? library.find(f => f.id===remote.folderId) : null;
  bc.innerHTML = `<a onclick="selectedRemoteId=null;renderLibraryPane();">Library</a><span class="sep">/</span>`;
  if (folder) bc.innerHTML += `<a onclick="selectedRemoteId=null;renderLibraryPane();">${escHtml(folder.name)}</a><span class="sep">/</span>`;
  bc.innerHTML += `<span class="cur">${escHtml(remote.name)}</span>`;
  el.appendChild(bc);
  const hdr = document.createElement('div');
  hdr.className = 'section-hdr';
  hdr.innerHTML = `
    <span class="section-title"><i class="ti ti-device-remote-control" style="vertical-align:-2px;margin-right:6px;"></i>${escHtml(remote.name)}</span>
    <div style="display:flex;gap:6px;">
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
  const box = document.createElement('div');
  box.className = 'signal-box';
  box.id = 'sigbox-' + btn.id;
  box.innerHTML = `
    <div class="signal-box-header">
      <span class="signal-box-name" id="sname-${btn.id}">${escHtml(btn.name)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" title="Rename" onclick="toggleEditName(${btn.id},${remoteId})"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" title="Delete" onclick="deleteButton(${btn.id},${remoteId})" style="color:var(--text3);" onmouseenter="this.style.color='var(--red)'" onmouseleave="this.style.color='var(--text3)'"><i class="ti ti-trash"></i></button>
    </div>
    <div id="sname-edit-${btn.id}" style="display:none;margin-bottom:8px;">
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="sname-inp-${btn.id}" value="${escAttr(btn.name)}" style="width:200px;" oninput="validateSigName(${btn.id})" onkeydown="if(event.key==='Enter')confirmEditName(${btn.id},${remoteId})">
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
      <button class="btn btn-green btn-sm" onclick="sendButtonSignal('${escAttr(btn.addr)}','${escAttr(btn.cmd)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Send</button>
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
        <input type="text" id="abn-name-${remoteId}" placeholder="e.g. Power" oninput="validateAddBtn(${remoteId})">
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
  const name = document.getElementById('abn-name-'+remoteId).value.trim();
  const addr = document.getElementById('abn-addr-'+remoteId).value.trim();
  const cmd  = document.getElementById('abn-cmd-'+remoteId).value.trim();
  const desc = document.getElementById('abn-desc-'+remoteId).value.trim();
  if (!name||!validateHex(addr)||!validateHex(cmd)) return;
  const remote = library.find(r => r.id===remoteId);
  const newBtn = { id:genId(), name, addr, cmd, desc, proto:'NEC' };
  remote.buttons.push(newBtn);
  saveLib();
  document.getElementById('remote-empty-'+remoteId)?.remove();
  document.getElementById('addBtnBoxWrap-'+remoteId).innerHTML = '';
  document.getElementById('libraryContent').appendChild(buildSignalBox(newBtn, remoteId));
  appendLog(`Added "${name}" to "${remote.name}".`, 'sys');
}

// ===== INLINE EDITS =====
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
  const v = document.getElementById('sname-inp-'+btnId).value.trim();
  library.find(r=>r.id===remoteId).buttons.find(b=>b.id===btnId).name = v;
  saveLib();
  document.getElementById('sname-'+btnId).textContent = v;
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
  document.getElementById('sigbox-'+btnId)?.remove();
}
function sendButtonSignal(addr, cmd) {
  if (!writer) { appendLog('Not connected — cannot send.','err'); return; }
  transmitPayload(addr, cmd);
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
  library.push({ type:'folder', id:genId(), name:document.getElementById('folderNameInput').value.trim(), parentId:_folderParentId, open:false });
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
  library.find(x=>x.id===_renameId).name = document.getElementById('renameInput').value.trim();
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
  document.getElementById('clearConfirmInput').value = '';
  document.getElementById('clearLibraryConfirmBtn').disabled = true;
  document.getElementById('clearLibraryModal').classList.add('open');
  setTimeout(()=>document.getElementById('clearConfirmInput').focus(),50);
}
function closeClearLibraryModal() { document.getElementById('clearLibraryModal').classList.remove('open'); }
function validateClearConfirm() {
  document.getElementById('clearLibraryConfirmBtn').disabled = document.getElementById('clearConfirmInput').value !== 'CLEAR';
}
function confirmClearLibrary() {
  library = []; nextId = 1; saveLib();
  selectedRemoteId = null;
  closeClearLibraryModal();
  renderSidebarTree();
  if (currentTab==='library') renderLibraryPane();
  appendLog('Library cleared.', 'sys');
}

function refreshFolderSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">/ Root</option>';
  library.filter(x=>x.type==='folder').forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = getFolderPath(f.id);
    sel.appendChild(opt);
  });
}
function getFolderPath(id) {
  const parts=[]; let cur=library.find(x=>x.id===id);
  while(cur) { parts.unshift(cur.name); cur=cur.parentId?library.find(x=>x.id===cur.parentId):null; }
  return '/ '+parts.join(' / ');
}

['folderModal','renameModal','deleteModal','clearLibraryModal','irdbFolderModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e){ if(e.target===this) this.classList.remove('open'); });
});

// ===== IRDB =====
let irdbData=null, irdbExpanded={}, irdbSelectedPath=null, _irdbFolderPath='';

async function initIRDB() {
  if (irdbData) { renderIRDBTree(); return; }
  document.getElementById('irdbTree').innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:12px;color:var(--text3);font-family:var(--mono);font-size:11px;"><span class="spinner"></span> Loading IRDB...</div>`;
  try {
    const r = await fetch('https://api.github.com/repos/Lucaslhm/Flipper-IRDB/git/trees/main?recursive=1');
    if (!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    irdbData = data.tree.filter(n=>n.type==='blob'&&n.path.endsWith('.ir'));
    renderIRDBTree();
  } catch(e) {
    document.getElementById('irdbTree').innerHTML=`<div style="padding:12px;color:var(--red);font-family:var(--mono);font-size:11px;">Failed: ${escHtml(String(e))}</div>`;
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
    row.style.cssText=`padding:5px 8px 5px ${8+depth*12+12}px;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:var(--mono);font-size:11px;transition:background 0.1s;${isSel?'background:var(--accent-dim);color:var(--accent2);':'color:var(--text2);'}`;
    row.innerHTML=`<i class="ti ti-device-remote-control" style="font-size:12px;flex-shrink:0;"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(f.name.replace('.ir',''))}</span>`;
    row.onmouseenter=()=>{ if(!isSel) row.style.background='var(--bg3)'; };
    row.onmouseleave=()=>{ if(!isSel) row.style.background=''; };
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
    const resp=await fetch(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${file.path}`);
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const text=await resp.text();
    const buttons=parseIRFile(text);
    renderIRDBRemote(el, file, buttons);
  } catch(e) {
    el.innerHTML=`<div style="padding:20px;color:var(--red);font-family:var(--mono);font-size:11px;"><i class="ti ti-alert-circle"></i> Failed: ${escHtml(String(e))}</div>`;
  }
}
function renderIRDBRemote(el, file, buttons) {
  const name=file.name.replace('.ir','');
  el.innerHTML='';
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);';
  hdr.innerHTML=`
    <i class="ti ti-device-remote-control" style="color:var(--accent2);font-size:18px;flex-shrink:0;"></i>
    <div style="flex:1;">
      <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;">${escHtml(name)}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);">${escHtml(file.path)} &middot; ${buttons.length} button${buttons.length!==1?'s':''}</div>
    </div>
    <button class="btn btn-sm" id="irdb-import-${btoa(file.path).replace(/[^a-z0-9]/gi,'')}" onclick="importIRDBRemote('${escAttr(file.path)}','${escAttr(name)}',this)"><i class="ti ti-download"></i> Import</button>`;
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
      <div class="irdb-detail-btn-name">${escHtml(btn.name)}</div>
      <div class="signal-meta" style="margin-bottom:8px;">
        <span class="signal-chip addr"><i class="ti ti-map-pin" style="font-size:9px;"></i> ${escHtml(btn.addr||'—')}</span>
        <span class="signal-chip cmd"><i class="ti ti-terminal" style="font-size:9px;"></i> ${escHtml(btn.cmd||'—')}</span>
        ${btn.proto?`<span class="signal-chip proto">${escHtml(btn.proto)}</span>`:''}
      </div>
      <button class="btn btn-green btn-sm" onclick="sendButtonSignal('${escAttr(btn.addr)}','${escAttr(btn.cmd)}')" ${writer?'':'disabled'}><i class="ti ti-send"></i> Send</button>`;
    el.appendChild(box);
  });
}
// Fixed: pass btnEl directly instead of relying on event.target
async function importIRDBRemote(path, name, btnEl) {
  const origHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) { btnEl.disabled=true; btnEl.innerHTML='<span class="spinner"></span>'; }
  try {
    const resp=await fetch(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${path}`);
    const text=await resp.text();
    const buttons=parseIRFile(text);
    if(!buttons.length){ if(btnEl){btnEl.innerHTML=origHtml;btnEl.disabled=false;} appendLog(`"${name}" — no compatible buttons.`,'sys'); return; }
    const parts=path.split('/'); let parentId=null;
    for(let i=0;i<parts.length-1;i++){
      const fn=parts[i];
      let folder=library.find(f=>f.type==='folder'&&f.name===fn&&f.parentId===parentId);
      if(!folder){const fid=genId();library.push({type:'folder',id:fid,name:fn,parentId,open:false});parentId=fid;}
      else parentId=folder.id;
    }
    library.push({type:'remote',id:genId(),name,folderId:parentId,buttons});
    saveLib(); renderSidebarTree();
    appendLog(`Imported "${name}" (${buttons.length} btns) from IRDB.`,'sys');
    if(btnEl){ btnEl.innerHTML='<i class="ti ti-check"></i> Done'; setTimeout(()=>{btnEl.innerHTML=origHtml;btnEl.disabled=false;},2000); }
  } catch(e) {
    appendLog('IRDB import error: '+e,'err');
    if(btnEl){ btnEl.innerHTML=origHtml; btnEl.disabled=false; }
  }
}

function openIRDBFolderModal(e, folderPath) {
  e.stopPropagation();
  _irdbFolderPath = folderPath;
  const count = (irdbData||[]).filter(n=>n.path.startsWith(folderPath+'/')).length;
  document.getElementById('irdbFolderModalDesc').textContent = `Import all ${count} remote${count!==1?'s':''} from "${folderPath.split('/').pop()}" into your library.`;
  refreshFolderSelect('irdbFolderDestSelect');
  document.getElementById('irdbFolderModal').classList.add('open');
}
function closeIrdbFolderModal() { document.getElementById('irdbFolderModal').classList.remove('open'); }
async function confirmIRDBFolderImport() {
  const destFolderId = document.getElementById('irdbFolderDestSelect').value || null;
  const folderFiles = (irdbData||[]).filter(n=>n.path.startsWith(_irdbFolderPath+'/'));
  const btn = document.getElementById('irdbFolderImportBtn');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Importing...';
  let imported=0, skipped=0;
  for (const f of folderFiles) {
    try {
      const resp=await fetch(`https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${f.path}`);
      const text=await resp.text();
      const buttons=parseIRFile(text);
      if(!buttons.length){skipped++;continue;}
      const parts=f.path.split('/');
      const remoteName=parts[parts.length-1].replace('.ir','');
      const subParts=parts.slice(_irdbFolderPath.split('/').length,-1);
      let parentId=destFolderId?parseInt(destFolderId):null;
      for(const sp of subParts){
        let folder=library.find(fl=>fl.type==='folder'&&fl.name===sp&&fl.parentId===parentId);
        if(!folder){const fid=genId();library.push({type:'folder',id:fid,name:sp,parentId,open:false});parentId=fid;}
        else parentId=folder.id;
      }
      library.push({type:'remote',id:genId(),name:remoteName,folderId:parentId,buttons});
      imported++;
    } catch(e){ skipped++; }
  }
  saveLib(); renderSidebarTree();
  closeIrdbFolderModal();
  btn.disabled=false; btn.innerHTML='<i class="ti ti-download"></i> Import All';
  appendLog(`IRDB folder import: ${imported} imported, ${skipped} skipped.`,'sys');
  if(currentTab==='library') renderLibraryPane();
}

// ===== UTILS =====
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

// ===== INIT =====
switchTab('library');
renderSidebarTree();
validateInputs();