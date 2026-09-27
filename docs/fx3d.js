// Project-themed 3D scenes for a page's hero (three.js). One renderer per page: it pauses when the
// hero is off screen or the tab is hidden, holds a still frame for reduced motion, follows the
// pointer, and leaves the page untouched when WebGL is unavailable.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js';

const css = (v, fb) => new THREE.Color((getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb));
const dark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.22, 'rgba(255,255,255,.75)');
  r.addColorStop(0.5, 'rgba(255,255,255,.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mount(host, kind = 'ml') {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, night = dark();
  const box = document.createElement('div');
  box.className = 'fx-scene';
  box.setAttribute('aria-hidden', 'true');
  box.appendChild(renderer.domElement);
  host.prepend(box);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  camera.position.set(0, 0, 9);
  const A = css('--accent', '#6366f1'), B = css('--fx-2', '#06b6d4'), C = css('--fx-3', '#f59e0b');
  const BAD = new THREE.Color(night ? '#ff6b6b' : '#dc2626'), INK = new THREE.Color(night ? '#e5e7eb' : '#334155');
  scene.add(new THREE.HemisphereLight(0xffffff, night ? 0x1b2030 : 0x9aa3b5, night ? 1.0 : 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 8);
  scene.add(key);
  const root = new THREE.Group();
  scene.add(root);
  const tex = glowTexture(), blend = night ? THREE.AdditiveBlending : THREE.NormalBlending;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.2, emissive: c, emissiveIntensity: night ? 0.35 : 0.08, ...o });
  const line = (c, opacity = 0.35) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false });
  const glowMat = (c, size, opacity = 1) => new THREE.PointsMaterial({ color: c, size, map: tex, transparent: true, opacity, depthWrite: false, blending: blend, sizeAttenuation: true });
  const sprite = (c, s, opacity = 0.9) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, transparent: true, opacity, depthWrite: false, blending: blend })); m.scale.setScalar(s); return m; };
  const points = (n, c, size, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const p = new THREE.Points(g, glowMat(c, size, opacity)); p.frustumCulled = false; return p; };
  const colored = (n, size, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const m = glowMat(0xffffff, size, opacity); m.vertexColors = true; const p = new THREE.Points(g, m); p.frustumCulled = false; return p; };
  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const tick = [];

  const S = {
    // a router: requests stream in, and the core sends each to one of six models (cheap ones get most)
    router() {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), std(A, { flatShading: true }));
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.05, 1)), line(A, 0.45));
      core.position.x = shell.position.x = -0.6;
      root.add(core, shell, sprite(A, 3.2, 0.35));
      root.children.at(-1).position.x = -0.6;
      const models = [0.18, 0.22, 0.26, 0.3, 0.42, 0.55].map((r, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), std(i === 5 ? C : i % 2 ? B : A));
        m.position.set(2.6 + (i % 2) * 0.5, 1.9 - i * 0.78, -0.3 + (i % 3) * 0.3);
        root.add(m);
        return m;
      });
      const share = [0.37, 0.13, 0.13, 0.19, 0.03, 0.15], cum = share.map((s, i) => share.slice(0, i + 1).reduce((a, b) => a + b, 0));
      const N = 260, p = colored(N, 0.22), pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array;
      const parts = Array.from({ length: N }, () => ({ u: rand() * 2, y: (rand() - 0.5) * 3, z: (rand() - 0.5) * 1.5, lane: cum.findIndex((c) => rand() <= c + 1e-9) }));
      root.add(p);
      const c = new THREE.Color();
      tick.push((t, dt) => {
        parts.forEach((q, i) => {
          q.u += dt * 0.35;
          if (q.u > 2) { q.u -= 2; q.y = (rand() - 0.5) * 3; q.lane = cum.findIndex((v) => rand() <= v + 1e-9); }
          const target = models[Math.max(0, q.lane)].position;
          if (q.u < 1) { const u = q.u; pos.set([-4.6 + u * 4, q.y * (1 - u), q.z * (1 - u)], i * 3); c.copy(INK).lerp(A, u); }
          else { const u = q.u - 1, x = -0.6 + (target.x + 0.6) * u, bend = Math.sin(u * Math.PI) * 0.4; pos.set([x, target.y * u + bend * (target.y > 0 ? 1 : -1), target.z * u], i * 3); c.copy(A).lerp(models[q.lane].material.color, u); }
          col.set([c.r, c.g, c.b], i * 3);
        });
        p.geometry.attributes.position.needsUpdate = p.geometry.attributes.color.needsUpdate = true;
        core.rotation.set(t * 0.4, t * 0.6, 0);
        shell.rotation.set(-t * 0.2, t * 0.25, 0);
        models.forEach((m, i) => { m.position.y += Math.sin(t * 1.3 + i) * 0.0015; });
      });
    },
    // a canary: users on a disc, the candidate's share growing stage by stage, then rolling back
    canary() {
      const N = 900, p = colored(N, 0.26), pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array;
      const bucket = [];
      for (let i = 0; i < N; i++) { const r = Math.sqrt(rand()) * 2.6, a = rand() * Math.PI * 2; pos.set([Math.cos(a) * r, Math.sin(a) * r, (rand() - 0.5) * 0.3], i * 3); bucket.push(rand()); }
      root.add(p);
      [0.3, 0.9, 1.6, 2.2, 2.75].forEach((r, i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 120), new THREE.MeshBasicMaterial({ color: i === 4 ? C : A, transparent: true, opacity: 0.35 })); root.add(ring); });
      const pulse = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 120), new THREE.MeshBasicMaterial({ color: A, transparent: true, opacity: 0.6 }));
      root.add(pulse);
      root.rotation.set(-0.95, 0, 0.2);
      const stages = [0.01, 0.05, 0.25, 0.5, 1], c = new THREE.Color();
      tick.push((t) => {
        const k = Math.floor(t / 2.2) % 7, share = k < 5 ? stages[k] : k === 5 ? 0.25 : 0.01, bad = k === 5;
        for (let i = 0; i < N; i++) { c.copy(bucket[i] < share ? (bad ? BAD : A) : INK); col.set([c.r, c.g, c.b], i * 3); }
        p.geometry.attributes.color.needsUpdate = true;
        const u = (t % 2.2) / 2.2;
        pulse.scale.setScalar(0.3 + u * 2.6);
        pulse.material.opacity = 0.6 * (1 - u);
        root.rotation.z = 0.2 + t * 0.05;
      });
    },
    // a bandit: prompts as columns; traffic flows to them in proportion to how good they look
    bandit() {
      const K = 5, cols = [], rates = [0.35, 0.55, 0.42, 0.8, 0.3];
      for (let i = 0; i < K; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1, 32), std(i === 3 ? A : B, { transparent: true, opacity: 0.9 })); m.position.set((i - 2) * 1.05, 0, 0); root.add(m); cols.push(m); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.04, 64), new THREE.MeshBasicMaterial({ color: A, transparent: true, opacity: 0.12 }));
      base.position.y = -1.6;
      root.add(base);
      const N = 160, p = points(N, A, 0.18, 0.9), pos = p.geometry.attributes.position.array;
      const q = Array.from({ length: N }, () => ({ u: rand(), k: 3 }));
      root.add(p);
      root.rotation.set(0.35, -0.5, 0);
      tick.push((t, dt) => {
        const w = rates.map((r, i) => Math.max(0.05, r + 0.15 * Math.sin(t * 0.6 + i)) ** 4), s = w.reduce((a, b) => a + b, 0);
        cols.forEach((m, i) => { const h = 0.4 + 2.6 * (w[i] / s); m.scale.y += (h - m.scale.y) * 0.05; m.position.y = -1.6 + m.scale.y / 2; });
        q.forEach((x, i) => {
          x.u += dt * 0.5;
          if (x.u > 1) { x.u -= 1; let r = rand() * s; x.k = w.findIndex((v) => (r -= v) <= 0); if (x.k < 0) x.k = 3; }
          const col = cols[x.k].position;
          pos.set([col.x * x.u + Math.sin(i) * 0.2 * (1 - x.u), 2.6 - x.u * (4.2 - cols[x.k].scale.y), Math.cos(i) * 0.3 * (1 - x.u)], i * 3);
        });
        p.geometry.attributes.position.needsUpdate = true;
      });
    },
    // a panel: three critics around an answer, beams flashing agree or object, the arbiter's halo
    panel() {
      const answer = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), std(A, { flatShading: true }));
      const halo = sprite(A, 4, 0.4);
      root.add(answer, halo);
      const critics = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), std(i === 1 ? C : B)); root.add(m); return m; });
      const beams = critics.map(() => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), line(A, 0.7)); root.add(l); return l; });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.01, 6, 160), new THREE.MeshBasicMaterial({ color: B, transparent: true, opacity: 0.3 }));
      ring.rotation.x = Math.PI / 2.4;
      root.add(ring);
      tick.push((t) => {
        critics.forEach((m, i) => {
          const a = t * 0.5 + (i * Math.PI * 2) / 3;
          m.position.set(Math.cos(a) * 2.3, Math.sin(a) * 2.3 * Math.cos(Math.PI / 2.4), Math.sin(a) * 2.3 * Math.sin(Math.PI / 2.4));
          const g = beams[i].geometry.attributes.position.array;
          g.set([m.position.x, m.position.y, m.position.z, 0, 0, 0]);
          beams[i].geometry.attributes.position.needsUpdate = true;
          const objects = Math.sin(t * 1.7 + i * 2.1) > 0.55;
          beams[i].material.color.copy(objects ? BAD : A);
          beams[i].material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(t * 3 + i));
        });
        answer.rotation.set(t * 0.4, t * 0.5, 0);
        halo.material.opacity = 0.25 + 0.15 * Math.sin(t * 2);
      });
    },
    // calibration: scores scattered, then pulled onto the diagonal a calibration map gives
    calibrate() {
      const N = 420, p = colored(N, 0.28), pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array;
      const pts = Array.from({ length: N }, () => { const h = rand() * 4 - 2; return { h, j: h + (rand() - 0.5) * 2.4 - 0.5, z: (rand() - 0.5) * 0.6 }; });
      root.add(p);
      const diag = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.3, -2.3, 0), new THREE.Vector3(2.3, 2.3, 0)]), line(C, 0.8));
      root.add(diag);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.8, 4.8)), line(A, 0.25));
      root.add(frame);
      root.rotation.set(-0.25, 0.45, 0);
      const c = new THREE.Color();
      tick.push((t) => {
        const k = 0.5 - 0.5 * Math.cos(t * 0.6);
        pts.forEach((q, i) => { const y = q.j + (q.h - q.j) * k * 0.85; pos.set([q.h, y, q.z], i * 3); c.copy(B).lerp(A, Math.min(1, Math.abs(y - q.h) / 1.2)); col.set([c.r, c.g, c.b], i * 3); });
        p.geometry.attributes.position.needsUpdate = p.geometry.attributes.color.needsUpdate = true;
      });
    },
    // distillation: a large teacher sends what it knows into a small, dense student
    distill() {
      const teacher = new THREE.Mesh(new THREE.SphereGeometry(1.35, 48, 32), std(B, { transparent: true, opacity: 0.55 }));
      const tw = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.4, 2)), line(B, 0.5));
      teacher.position.x = tw.position.x = -1.9;
      const student = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), std(A, { flatShading: true }));
      student.position.x = 2.1;
      const glow = sprite(A, 2.4, 0.5);
      glow.position.x = 2.1;
      root.add(teacher, tw, student, glow);
      const N = 260, p = points(N, A, 0.22, 1), pos = p.geometry.attributes.position.array;
      const q = Array.from({ length: N }, () => ({ u: rand(), a: rand() * Math.PI * 2, b: rand() * Math.PI }));
      root.add(p);
      tick.push((t, dt) => {
        q.forEach((x, i) => {
          x.u += dt * 0.28;
          if (x.u > 1) { x.u -= 1; x.a = rand() * Math.PI * 2; x.b = rand() * Math.PI; }
          const s = new THREE.Vector3(-1.9 + 1.35 * Math.sin(x.b) * Math.cos(x.a), 1.35 * Math.cos(x.b), 1.35 * Math.sin(x.b) * Math.sin(x.a));
          const e = new THREE.Vector3(2.1, 0, 0), u = x.u * x.u * (3 - 2 * x.u);
          pos.set([s.x + (e.x - s.x) * u, s.y * (1 - u) + Math.sin(u * Math.PI) * 0.6 * Math.cos(x.a), s.z * (1 - u)], i * 3);
        });
        p.geometry.attributes.position.needsUpdate = true;
        tw.rotation.y = t * 0.15;
        student.rotation.set(t * 0.8, t * 1.1, 0);
        const beat = 1 + 0.12 * Math.max(0, Math.sin(t * 3));
        student.scale.setScalar(beat);
        glow.scale.setScalar(2.4 * beat);
      });
    },
    // a guard: a faceted shield with packets orbiting it on three rings
    security() {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), std(A, { flatShading: true, transparent: true, opacity: 0.92 }));
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.85, 1)), line(A, 0.4));
      root.add(core, wire, sprite(A, 5, 0.3));
      const packet = new THREE.SphereGeometry(0.09, 10, 10);
      [0, 1, 2].forEach((k) => {
        const ring = new THREE.Group();
        ring.rotation.set(k * 1.05, k * 0.6, 0);
        root.add(ring);
        ring.add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.012, 6, 120), new THREE.MeshBasicMaterial({ color: B, transparent: true, opacity: 0.35 })));
        for (let i = 0; i < 6; i++) {
          const p = new THREE.Mesh(packet, new THREE.MeshBasicMaterial({ color: i === 0 && k === 1 ? BAD : i % 2 ? A : B }));
          const g = sprite(i === 0 && k === 1 ? BAD : A, 0.5, 0.6);
          ring.add(p, g);
          tick.push((t) => { const a = t * (0.5 + k * 0.15) + (i / 6) * Math.PI * 2; p.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0); g.position.copy(p.position); });
        }
      });
      tick.push((t) => { core.rotation.set(t * 0.2, t * 0.3, 0); wire.rotation.set(-t * 0.1, -t * 0.15, 0); });
    },
    // a pipeline: prompt, generate, extract, score; a packet travels and one step cuts it off
    pipeline() {
      const steps = [-3, -1, 1, 3].map((x, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), std(i === 1 ? A : B, { transparent: true, opacity: 0.9 })); m.position.x = x; root.add(m); const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 1.3, 1.3)), line(A, 0.35)); edge.position.copy(m.position); root.add(edge); return m; });
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3.6, 0, 0), new THREE.Vector3(3.6, 0, 0)]), line(A, 0.5)));
      const pk = sprite(C, 0.9, 1);
      root.add(pk);
      root.rotation.set(0.35, -0.35, 0);
      tick.push((t) => {
        const cycle = t % 6, cut = Math.floor(t / 6) % 2 === 1, u = cycle / 4;
        const x = -3.6 + Math.min(u, cut ? 0.38 : 1) * 7.2;
        pk.position.set(x, Math.sin(t * 6) * 0.05, 0);
        pk.material.color.copy(cut && u > 0.38 ? BAD : C);
        pk.material.opacity = u > 1 ? Math.max(0, 1 - (cycle - 4) / 2) : 1;
        steps.forEach((m, i) => { m.rotation.y = t * 0.3 + i; const hot = cut && i === 1 && u > 0.38; m.material.color.copy(hot ? BAD : i === 1 ? A : B); m.material.emissive.copy(m.material.color); });
      });
    },
    // docs: pages float in a stack; a scan passes and broken lines turn red, then heal
    docs() {
      const pages = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.9), new THREE.MeshStandardMaterial({ color: night ? 0x1d2433 : 0xffffff, transparent: true, opacity: 0.92, side: THREE.DoubleSide })));
        const lines = [];
        for (let j = 0; j < 9; j++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + rand() * 1.2, 0.08), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.55 })); l.position.set(-0.95 + l.geometry.parameters.width / 2, 1.1 - j * 0.26, 0.01); g.add(l); lines.push(l); }
        g.position.set(-1.5 + i * 1.05, 0.45 - i * 0.25, -i * 0.7);
        g.rotation.y = 0.45;
        root.add(g);
        pages.push({ g, lines });
      }
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 0.05), new THREE.MeshBasicMaterial({ color: A, transparent: true, opacity: 0.8 }));
      root.add(scan);
      tick.push((t) => {
        const y = 1.8 - ((t * 0.9) % 4);
        scan.position.set(0, y, 0.6);
        pages.forEach(({ g, lines }, i) => { g.position.y += Math.sin(t + i) * 0.001; lines.forEach((l, j) => { const broken = (i * 9 + j) % 7 === 3, wy = g.position.y + l.position.y; const seen = wy > y; l.material.color.copy(broken ? (seen ? (Math.floor(t / 4) % 2 ? A : BAD) : INK) : INK); l.material.opacity = broken && seen ? 0.95 : 0.5; }); });
      });
    },
    // clusters: logged messages grouped into clusters, outliers apart, samples picked out
    clusters() {
      const centers = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i * 1.05) * 1.9, Math.sin(i * 1.7) * 1.2, Math.sin(i * 1.05) * 1.2));
      const N = 700, p = colored(N, 0.24), pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array, info = [];
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const out = rand() < 0.12, k = Math.floor(rand() * 6), g = () => (rand() + rand() + rand() - 1.5) * 0.55;
        const v = out ? new THREE.Vector3((rand() - 0.5) * 6, (rand() - 0.5) * 4, (rand() - 0.5) * 3) : centers[k].clone().add(new THREE.Vector3(g(), g(), g()));
        pos.set([v.x, v.y, v.z], i * 3);
        info.push({ out, k });
        c.copy(out ? C : k % 2 ? A : B);
        col.set([c.r, c.g, c.b], i * 3);
      }
      root.add(p);
      const picks = points(24, 0xffffff, 0.5, 0.9), pp = picks.geometry.attributes.position.array;
      root.add(picks);
      tick.push((t) => {
        root.rotation.y = t * 0.12;
        if (Math.floor(t * 1.5) !== picks.userData.k) { picks.userData.k = Math.floor(t * 1.5); for (let j = 0; j < 24; j++) { let i = Math.floor(rand() * N); if (rand() < 0.6) while (!info[i].out) i = Math.floor(rand() * N); pp.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], j * 3); } picks.geometry.attributes.position.needsUpdate = true; }
        picks.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(t * 3));
      });
    },
    // agents: a supervisor in the middle, specialists around it, work passed along the edges
    agents() {
      const hub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), std(A, { flatShading: true }));
      root.add(hub, sprite(A, 3.2, 0.35));
      const names = 5, nodes = [];
      for (let i = 0; i < names; i++) { const a = (i / names) * Math.PI * 2, m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), std(i === names - 1 ? C : B)); m.position.set(Math.cos(a) * 2.5, Math.sin(a) * 1.7, Math.sin(a * 2) * 0.6); root.add(m); nodes.push(m); root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), m.position]), line(A, 0.3))); }
      const ringPts = nodes.map((n) => n.position).concat([nodes[0].position]);
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), line(B, 0.25)));
      const tokens = [0, 1, 2].map((k) => { const s = sprite(k === 2 ? BAD : C, 0.7, 1); root.add(s); return s; });
      tick.push((t) => {
        hub.rotation.set(t * 0.3, t * 0.4, 0);
        tokens.forEach((s, k) => { const u = (t * 0.35 + k / 3) % 1, i = Math.floor(u * names), f = (u * names) % 1, a = nodes[i].position, b = f < 0.5 ? new THREE.Vector3() : nodes[(i + 1) % names].position; const w = f < 0.5 ? f * 2 : (f - 0.5) * 2; s.position.lerpVectors(f < 0.5 ? a : new THREE.Vector3(), b, w); s.visible = !(k === 2 && Math.floor(t / 5) % 2 === 0); });
        nodes.forEach((m, i) => m.scale.setScalar(1 + 0.2 * Math.max(0, Math.sin(t * 2.5 - i))));
      });
    },
    // a knowledge graph: entities and relationships, a question walking the edges
    graph() {
      const N = 60, P = [];
      for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; P.push(new THREE.Vector3(Math.cos(a) * r * 2.4, y * 2.1, Math.sin(a) * r * 2.4)); }
      const nodes = colored(N, 0.34), pos = nodes.geometry.attributes.position.array, col = nodes.geometry.attributes.color.array;
      P.forEach((v, i) => { pos.set([v.x, v.y, v.z], i * 3); const c = i % 7 === 0 ? C : i % 2 ? A : B; col.set([c.r, c.g, c.b], i * 3); });
      const seg = [], adj = P.map(() => []);
      P.forEach((a, i) => P.map((b, j) => [a.distanceTo(b), j]).sort((x, y) => x[0] - y[0]).slice(1, 4).forEach(([, j]) => { if (i < j) { seg.push(a, P[j]); adj[i].push(j); adj[j].push(i); } }));
      root.add(nodes, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), line(A, 0.28)));
      const walker = sprite(C, 0.9, 1), trail = [];
      root.add(walker);
      let at = 0, next = adj[0][0] ?? 1, u = 0;
      tick.push((t, dt) => {
        root.rotation.y = t * 0.1;
        u += dt * 1.2;
        if (u >= 1) { u = 0; at = next; const n = adj[at]; next = n.length ? n[Math.floor(rand() * n.length)] : (at + 1) % N; trail.push(at); if (trail.length > 6) trail.shift(); }
        walker.position.lerpVectors(P[at], P[next], u);
      });
    },
    // receipts: scanned pages with lines; a scan line reads them and boxes the value it cites
    receipts() {
      const papers = [];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3), new THREE.MeshStandardMaterial({ color: night ? 0x232a38 : 0xffffff, side: THREE.DoubleSide })));
        for (let j = 0; j < 12; j++) { const w = j === 9 ? 1.2 : 0.4 + rand() * 0.9, l = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.07), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.55 })); l.position.set(-0.7 + w / 2, 1.2 - j * 0.2, 0.01); g.add(l); }
        const hit = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.35, 0.2)), line(A, 0.9));
        hit.position.set(-0.08, 1.2 - 9 * 0.2, 0.02);
        g.add(hit);
        g.position.set(-1.8 + i * 1.8, -0.1 + (i % 2) * 0.3, -Math.abs(i - 1) * 0.6);
        g.rotation.y = (1 - i) * 0.35;
        root.add(g);
        papers.push({ g, hit });
      }
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.04), new THREE.MeshBasicMaterial({ color: A, transparent: true, opacity: 0.85 }));
      root.add(scan);
      tick.push((t) => {
        const y = 1.6 - ((t * 0.8) % 3.4);
        scan.position.set(0, y, 0.5);
        papers.forEach(({ g, hit }, i) => { g.position.y += Math.sin(t * 0.8 + i) * 0.0012; hit.material.opacity = y < g.position.y + hit.position.y ? 0.95 : 0.12; });
      });
    },
    // a regression: before and after, task by task, one column falling away
    regression() {
      const K = 6, before = [], after = [];
      for (let i = 0; i < K; i++) {
        const h = 1.2 + rand() * 1.4, x = (i - (K - 1) / 2) * 0.95;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), std(B, { transparent: true, opacity: 0.55 }));
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), std(i === 2 ? BAD : A));
        b.position.set(x - 0.2, 0, 0.2); a.position.set(x + 0.2, 0, -0.2);
        b.userData.h = h; a.userData.h = i === 2 ? h * 0.45 : h * (0.95 + rand() * 0.15);
        root.add(b, a); before.push(b); after.push(a);
      }
      const floor = new THREE.GridHelper(7, 14, A, A);
      floor.material.transparent = true; floor.material.opacity = 0.18; floor.position.y = -1.4;
      root.add(floor);
      root.rotation.set(0.42, -0.55, 0);
      tick.push((t) => {
        const k = 0.5 - 0.5 * Math.cos(t * 0.7);
        before.forEach((b, i) => { b.scale.y = b.userData.h; b.position.y = -1.4 + b.userData.h / 2; const a = after[i], h = b.userData.h + (a.userData.h - b.userData.h) * k; a.scale.y = h; a.position.y = -1.4 + h / 2; });
      });
    },
    // search: a cloud of passages; a query beam lights the ten nearest
    search() {
      const N = 800, p = colored(N, 0.2), pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array, P = [];
      for (let i = 0; i < N; i++) { const v = new THREE.Vector3((rand() - 0.5) * 6, (rand() - 0.5) * 4, (rand() - 0.5) * 3); P.push(v); pos.set([v.x, v.y, v.z], i * 3); }
      root.add(p);
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 2.5, 2), new THREE.Vector3()]), line(C, 0.8));
      root.add(beam);
      const c = new THREE.Color();
      let lastT = -1;
      tick.push((t) => {
        if (t - lastT < 0.12 && lastT >= 0) return;       // re-rank a few times a second, not every frame
        lastT = t;
        const q = new THREE.Vector3(Math.cos(t * 0.4) * 1.8, Math.sin(t * 0.55) * 1.1, Math.sin(t * 0.3) * 0.8);
        beam.geometry.attributes.position.setXYZ(1, q.x, q.y, q.z);
        beam.geometry.attributes.position.needsUpdate = true;
        const near = P.map((v, i) => [v.distanceToSquared(q), i]).sort((a, b) => a[0] - b[0]).slice(0, 10).map((x) => x[1]), set = new Set(near);
        for (let i = 0; i < N; i++) { c.copy(set.has(i) ? C : i % 3 ? A : B); if (!set.has(i)) c.multiplyScalar(night ? 0.8 : 1); col.set([c.r, c.g, c.b], i * 3); }
        p.geometry.attributes.color.needsUpdate = true;
      });
      tick.push((t) => { root.rotation.y = Math.sin(t * 0.15) * 0.4; });
    },
    // a cache: cells light up as questions hit them; misses pass through to the model
    cache() {
      const G = 7, cells = [];
      for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), std(B, { transparent: true, opacity: 0.35 })); m.position.set((x - 3) * 0.62, (y - 3) * 0.62, 0); root.add(m); cells.push(m); }
      const N = 90, p = points(N, A, 0.22, 1), pos = p.geometry.attributes.position.array;
      const q = Array.from({ length: N }, () => ({ u: rand(), c: Math.floor(rand() * G * G), hit: rand() < 0.62 }));
      root.add(p);
      root.rotation.set(-0.35, 0.55, 0);
      tick.push((t, dt) => {
        cells.forEach((m) => { m.userData.l = Math.max(0, (m.userData.l || 0) - dt * 1.5); m.material.opacity = 0.3 + 0.7 * m.userData.l; m.material.emissiveIntensity = 0.1 + m.userData.l; });
        q.forEach((x, i) => {
          x.u += dt * 0.6;
          if (x.u > 1) { x.u -= 1; x.c = Math.floor(rand() * G * G); x.hit = rand() < 0.62; }
          const cell = cells[x.c].position, z = 3.5 - x.u * (x.hit ? 3.5 : 7);
          if (x.hit && x.u > 0.97) cells[x.c].userData.l = 1;
          pos.set([cell.x, cell.y, x.hit ? Math.max(0.1, z) : z], i * 3);
        });
        p.geometry.attributes.position.needsUpdate = true;
      });
    },
    // the scenes the earlier pages use, each lit and given glow
    network() {
      const N = 1100, R = 2.3, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5)); pos.set([Math.cos(a) * r * R, y * R, Math.sin(a) * r * R], i * 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const globe = new THREE.Points(g, glowMat(A, 0.09, 0.9));
      root.add(globe, sprite(A, 6, 0.18));
      const pick = () => { const i = Math.floor(rand() * N); return new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); };
      for (let k = 0; k < 9; k++) {
        const a = pick(), b = pick(), mid = a.clone().add(b).multiplyScalar(0.5).setLength(R * 1.5), curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), line(B, 0.55)));
        const dot = sprite(C, 0.5, 1);
        globe.add(dot);
        tick.push((t) => dot.position.copy(curve.getPoint(((t * 0.25) + k / 9) % 1)));
      }
      tick.push((t) => { globe.rotation.y = t * 0.12; globe.rotation.x = 0.35; });
    },
    ml() {
      const layers = [5, 8, 8, 3], nodes = [], geo = new THREE.SphereGeometry(0.14, 20, 14);
      layers.forEach((n, L) => { nodes[L] = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, std(L % 2 ? B : A)); m.position.set((L - 1.5) * 1.6, (i - (n - 1) / 2) * 0.55, Math.sin(i * 1.7 + L) * 0.6); root.add(m); nodes[L].push(m); } });
      const seg = [];
      for (let L = 0; L < layers.length - 1; L++) for (const a of nodes[L]) for (const b of nodes[L + 1]) if (rand() < 0.55) seg.push(a.position, b.position);
      root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), line(A, 0.25)));
      const sig = points(24, C, 0.35, 1), sp = sig.geometry.attributes.position.array;
      root.add(sig);
      tick.push((t) => {
        root.rotation.y = Math.sin(t * 0.3) * 0.5;
        nodes.flat().forEach((m, i) => m.scale.setScalar(1 + 0.4 * Math.max(0, Math.sin(t * 2.2 - m.position.x * 1.2 + i * 0.1))));
        for (let j = 0; j < 24; j++) { const u = (t * 0.4 + j / 24) % 1, L = Math.min(2, Math.floor(u * 3)), f = u * 3 - L, a = nodes[L][j % layers[L]].position, b = nodes[L + 1][(j * 3) % layers[L + 1]].position; sp.set([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f], j * 3); }
        sig.geometry.attributes.position.needsUpdate = true;
      });
    },
    data() {
      const W = 12, D = 6, bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 1, 0.28), std(0xffffff), W * D);
      const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      root.add(bars);
      root.rotation.set(0.55, -0.6, 0);
      tick.push((t) => {
        for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
          const h = 0.35 + 1.6 * (0.5 + 0.5 * Math.sin(x * 0.55 + t * 1.2) * Math.cos(z * 0.7 + t * 0.8)), i = x * D + z;
          m.compose(v.set((x - W / 2) * 0.42, h / 2 - 1, (z - D / 2) * 0.42), q, s.set(1, h, 1));
          bars.setMatrixAt(i, m);
          bars.setColorAt(i, c.copy(A).lerp(B, h / 2));
        }
        bars.instanceMatrix.needsUpdate = true;
        bars.instanceColor.needsUpdate = true;
      });
    },
    engine() {
      const cubes = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), std((i + j + k) % 2 ? A : B, { transparent: true, opacity: 0.92 }));
        b.userData.home = new THREE.Vector3(i - 1, j - 1, k - 1).multiplyScalar(0.72);
        b.position.copy(b.userData.home);
        root.add(b);
        cubes.push(b);
      }
      root.add(sprite(A, 5, 0.25));
      tick.push((t) => { root.rotation.set(t * 0.25, t * 0.35, 0); const k = 1 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.4)); cubes.forEach((b) => b.position.copy(b.userData.home).multiplyScalar(k)); });
    },
    game() {
      const grid = new THREE.GridHelper(8, 16, A, A);
      grid.material.transparent = true;
      grid.material.opacity = 0.25;
      root.add(grid);
      const body = [], geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
      for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(geo, std(i === 0 ? C : A)); root.add(b); body.push(b); }
      const food = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), std(BAD));
      food.position.set(1.5, 0.25, -1);
      const halo = sprite(BAD, 1, 0.6);
      root.add(food, halo);
      root.rotation.set(0.7, 0.5, 0);
      tick.push((t) => { body.forEach((b, i) => { const u = t * 1.2 - i * 0.22; b.position.set(Math.sin(u) * 2.4, 0.22, Math.sin(u * 2) * 1.3); }); food.position.y = 0.3 + Math.sin(t * 3) * 0.08; halo.position.copy(food.position); });
    },
  };
  (S[kind] || S.ml)();

  // a field of faint motes behind every scene, for depth
  const motes = points(140, B, 0.07, night ? 0.55 : 0.35), mp = motes.geometry.attributes.position.array;
  for (let i = 0; i < 140; i++) mp.set([(rand() - 0.5) * 14, (rand() - 0.5) * 8, -2 - rand() * 6], i * 3);
  scene.add(motes);

  // wide heroes keep the text on the left, so the scene's centre moves right; a phone banner stays centred
  const fit = () => { const w = box.clientWidth, h = box.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.z = w / h < 1.1 ? 11.5 : 9.5; root.position.x = w / h > 1.25 ? 1.15 : 0; camera.updateProjectionMatrix(); } };
  new ResizeObserver(fit).observe(box);
  fit();
  const aim = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { aim.x = (e.clientY / innerHeight - 0.5) * 0.35; aim.y = (e.clientX / innerWidth - 0.5) * 0.5; }, { passive: true });
  let raf = 0, visible = true, last = performance.now(), t = reduce ? 2.5 : 0, stopped = false;
  const still = () => reduce || document.documentElement.classList.contains('fx-still');
  function frame(now) {
    raf = 0;
    if (stopped || !visible || document.hidden) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // a frame stamp can predate performance.now()
    last = now;
    if (!still()) t += dt;
    for (const f of tick) f(t, still() ? 0 : dt);
    scene.rotation.x += (aim.x - scene.rotation.x) * 0.04;
    scene.rotation.y += (aim.y - scene.rotation.y) * 0.04;
    motes.rotation.y = t * 0.02;
    renderer.render(scene, camera);
    if (!still()) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!stopped && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  addEventListener('fx:motion', wake);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }).observe(host);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } });
  raf = requestAnimationFrame((n) => { frame(n); box.classList.add('on'); });
  return {
    box,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      removeEventListener('fx:motion', wake);
      renderer.dispose();
      renderer.forceContextLoss?.();
      box.remove();
    },
  };
}
