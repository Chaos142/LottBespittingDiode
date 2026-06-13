import * as THREE from 'three';

// ─── HERO BACKGROUND SCENE ──
const bgEl = document.getElementById('hero-three-bg');
if (bgEl) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, bgEl.clientWidth / bgEl.clientHeight, 0.1, 100);
  camera.position.z = 3.5;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(bgEl.clientWidth, bgEl.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bgEl.appendChild(renderer.domElement);

  // Particles
  const pCount = 1200;
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount * 3; i++) pos[i] = (Math.random() - 0.5) * 12;
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc850ff, size: 0.035, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(geom, mat);
  scene.add(particles);

  const ambient = new THREE.AmbientLight(0x404060);
  scene.add(ambient);
  const dl = new THREE.DirectionalLight(0xc850ff, 0.5);
  dl.position.set(1, 1, 2);
  scene.add(dl);

  function resizeBg() {
    const w = bgEl.clientWidth, h = bgEl.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resizeBg);

  function animBg() {
    requestAnimationFrame(animBg);
    particles.rotation.y += 0.0003;
    particles.rotation.x += 0.0001;
    renderer.render(scene, camera);
  }
  animBg();
}
