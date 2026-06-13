document.addEventListener('DOMContentLoaded', async () => {
  const disclaimerEl = document.getElementById('disclaimer');

  const response = await fetch('insults.json');
  const insults = await response.json();

  disclaimerEl.textContent = insults[Math.floor(Math.random() * insults.length)];
});

const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

const bars = document.querySelectorAll('.proto-bar-wrap');
const barIO = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('animate'); barIO.unobserve(e.target); } });
}, { threshold: 0.5 });
bars.forEach(b => barIO.observe(b));

// ─── HERO PANEL TABS ──
document.querySelectorAll('.panel-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById('tab-' + btn.dataset.tab);
    if (tab) tab.classList.add('active');
  });
});

// ─── KICANVAS SCHEMATIC VIEWER ──
(function loadSchematic() {
  var ph = document.getElementById('sch-placeholder');
  var viewer = document.getElementById('sch-viewer');
  var label = document.getElementById('sch-current');
  var embed = document.getElementById('kicanvas-embed');
  var prevBtn = document.getElementById('sch-prev');
  var nextBtn = document.getElementById('sch-next');
  if (!ph || !viewer || !label || !embed || !prevBtn || !nextBtn) return;

  var sheetNames = [
    'LBD.kicad_sch',
    'power.kicad_sch',
    'flash.kicad_sch',
    'usb.kicad_sch',
    'prototype/prototype.kicad_sch'
  ];
  var prefix = '../hardware/';
  var sheets = sheetNames.map(function(n) { return prefix + n; });
  var idx = 0;

  var container = embed.parentNode;

  function tryPrefix(p, cb) {
    var test = p + sheetNames[0];
    fetch(test, { method: 'HEAD' })
      .then(function(res) {
        if (res.ok) {
          prefix = p;
          sheets = sheetNames.map(function(n) { return prefix + n; });
          cb(true);
        } else {
          cb(false);
        }
      })
      .catch(function() { cb(false); });
  }

  function showViewer() {
    ph.style.display = 'none';
    viewer.style.display = 'flex';
    rebuildEmbed(0);
    label.textContent = '1/' + sheets.length + ' \u00b7 ' + sheetNames[0];
  }

  // comment out the contents of this array to test the placeholder
  tryPrefix('./hardware/', function(ok) {
    if (!ok) {
      tryPrefix('../hardware/', function(ok2) {
        if (ok2) showViewer();
      });
    } else {
      showViewer();
    }
  });

  function rebuildEmbed(i) {
    var el = document.createElement('kicanvas-embed');
    el.setAttribute('src', sheets[i]);
    el.setAttribute('controls', 'basic');
    el.setAttribute('controlslist', 'nooverlay');
    el.addEventListener('kicanvas:documentchange', function(e) {
      var src = (e.detail && e.detail.src) || '';
      var name = src.split('/').pop().split('\\').pop();
      if (name) label.textContent = (i + 1) + '/' + sheets.length + ' \u00b7 ' + name;
    });
    container.innerHTML = '';
    container.appendChild(el);
    embed = el;
  }

  function switchTo(i) {
    if (i < 0 || i >= sheets.length) return;
    idx = i;
    rebuildEmbed(i);
    label.textContent = (i + 1) + '/' + sheets.length + ' \u00b7 ' + sheetNames[i];
  }

  label.textContent = '1/' + sheets.length + ' \u00b7 ' + sheets[0].split('/').pop().split('\\').pop();

  prevBtn.addEventListener('click', function() {
    switchTo(idx - 1 < 0 ? sheets.length - 1 : idx - 1);
  });
  nextBtn.addEventListener('click', function() {
    switchTo(idx + 1 >= sheets.length ? 0 : idx + 1);
  });
})();
