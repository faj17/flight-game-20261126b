// Drawing only: the world's state and the current screen in, pixels out.
// A hand-rolled 3D projection (no library, no network): the camera chases
// the plane or sits in its cockpit, the valley is a projected heightfield
// mesh, and the aircraft, the rings and the instruments are drawn on top.
// The playfield is a fixed 1280x720 logical area scaled to the window.

import { DEG, MS_TO_FT, wrapAngle } from './random.js';
import { PALETTE, RUNWAY, WORLD } from './config.js';
import { groundHeight, isWater, nearRunway, onRunway } from './terrain.js';
import { bearingTo, headingDeg } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';
export const SCREEN_DONE = 'done';

const W = 1280;
const H = 720;
const FOV = 68;
const FOCAL = (H / 2) / Math.tan((FOV / 2) * DEG);

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}

function terrainColor(x, z, h, slope) {
  if (isWater(x, z)) return h < -3 ? PALETTE.waterDeep : PALETTE.water;
  if (onRunway(x, z)) return PALETTE.asphalt;
  if (nearRunway(x, z) && h < 3) return PALETTE.grassDry;
  if (h > 175) return PALETTE.snow;
  if (h > 95) return mixHex(PALETTE.rock, PALETTE.grass, Math.max(0, 1 - (h - 95) / 60));
  if (h < 6) return mixHex(PALETTE.sand, PALETTE.grassDry, Math.max(0, h / 6));
  const shade = 0.92 + 0.16 * Math.min(1, slope / 0.9);
  const base = h > 40 ? PALETTE.grassDry : PALETTE.grass;
  const p = parseInt(base.slice(1), 16);
  const r = Math.min(255, Math.round(((p >> 16) & 255) * shade));
  const g = Math.min(255, Math.round(((p >> 8) & 255) * shade));
  const b = Math.min(255, Math.round((p & 255) * shade));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas, world) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / W, canvas.height / H);
    view.x = (canvas.width - W * view.scale) / 2;
    view.y = (canvas.height - H * view.scale) / 2;
  }

  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) {
      fonts.set(key, `${bold ? '700 ' : ''}${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    }
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  /** Plane basis vectors from heading/pitch/roll (degrees). */
  function planeBasis(plane) {
    const h = plane.heading * DEG;
    const p = plane.pitch * DEG;
    const r = plane.roll * DEG;
    const fwd = { x: Math.sin(h) * Math.cos(p), y: Math.sin(p), z: -Math.cos(h) * Math.cos(p) };
    const right0 = { x: Math.cos(h), y: 0, z: Math.sin(h) };
    const up0 = cross(right0, fwd);
    const cosr = Math.cos(r);
    const sinr = Math.sin(r);
    const right = {
      x: right0.x * cosr + up0.x * sinr,
      y: right0.y * cosr + up0.y * sinr,
      z: right0.z * cosr + up0.z * sinr,
    };
    const up = cross(fwd, right);
    return { fwd: norm(fwd), right: norm(right), up: norm(up) };
  }

  function makeCamera(plane, mode) {
    const b = planeBasis(plane);
    const pos = { x: plane.x, y: plane.y, z: plane.z };
    if (mode === 'cockpit') {
      const eye = {
        x: pos.x + b.fwd.x * 2 + b.up.x * 0.9,
        y: pos.y + b.fwd.y * 2 + b.up.y * 0.9,
        z: pos.z + b.fwd.z * 2 + b.up.z * 0.9,
      };
      return { eye, fwd: b.fwd, right: b.right, up: b.up };
    }
    const eye = {
      x: pos.x - b.fwd.x * 26 + b.up.x * 7,
      y: pos.y - b.fwd.y * 26 + b.up.y * 7,
      z: pos.z - b.fwd.z * 26 + b.up.z * 7,
    };
    const look = {
      x: pos.x + b.fwd.x * 40,
      y: pos.y + b.fwd.y * 40,
      z: pos.z + b.fwd.z * 40,
    };
    const fwd = norm(sub(look, eye));
    const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
    const up = cross(right, fwd);
    return { eye, fwd, right, up };
  }

  function project(cam, p) {
    const d = sub(p, cam.eye);
    const cz = dot(d, cam.fwd);
    if (cz < 3) return null;
    const cx = dot(d, cam.right);
    const cy = dot(d, cam.up);
    const s = FOCAL / cz;
    return { x: W / 2 + cx * s, y: H / 2 - cy * s, s, z: cz };
  }

  function poly(points, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
    // Stroke with the same colour so adjacent terrain quads never show a
    // hairline of sky between them.
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawSky(cam, plane) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(0.75, PALETTE.skyHorizon);
    grad.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Sun: fixed in the south-west sky.
    const sunDir = norm({ x: -0.55, y: 0.5, z: 0.65 });
    const sunP = project(cam, {
      x: cam.eye.x + sunDir.x * 4000,
      y: cam.eye.y + sunDir.y * 4000,
      z: cam.eye.z + sunDir.z * 4000,
    });
    if (sunP && Number.isFinite(sunP.x) && Number.isFinite(sunP.y)
      && Math.abs(sunP.x) < 3000 && Math.abs(sunP.y) < 3000) {
      const glow = ctx.createRadialGradient(sunP.x, sunP.y, 4, sunP.x, sunP.y, 90);
      glow.addColorStop(0, 'rgba(255,243,196,0.95)');
      glow.addColorStop(0.25, 'rgba(255,243,196,0.55)');
      glow.addColorStop(1, 'rgba(255,243,196,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunP.x - 100, sunP.y - 100, 200, 200);
    }
  }

  function drawClouds(cam, clouds) {
    ctx.save();
    for (const c of clouds) {
      const p = project(cam, { x: c.x, y: c.y, z: c.z });
      if (!p) continue;
      const w = c.size * p.s * 0.9;
      if (w < 4 || w > 3000 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w, w * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(p.x - w * 0.3, p.y - w * 0.08, w * 0.55, w * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTerrain(cam, plane) {
    const cell = WORLD.cell;
    const half = WORLD.halfCells;
    const n = half * 2 + 1;
    const gx0 = Math.floor((plane.x - half * cell) / cell) * cell;
    const gz0 = Math.floor((plane.z - half * cell) / cell) * cell;
    // Project the grid once; quads reference the projected vertices.
    const pts = new Array(n * n);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = gx0 + i * cell;
        const z = gz0 + j * cell;
        const h = groundHeight(x, z);
        pts[j * n + i] = { p: project(cam, { x, y: h, z }), h, x, z };
      }
    }
    const quads = [];
    for (let j = 0; j < n - 1; j += 1) {
      for (let i = 0; i < n - 1; i += 1) {
        const a = pts[j * n + i];
        const b = pts[j * n + i + 1];
        const c = pts[(j + 1) * n + i + 1];
        const d = pts[(j + 1) * n + i];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const zAvg = (a.p.z + b.p.z + c.p.z + d.p.z) / 4;
        const slope = Math.abs(c.h - a.h) / (cell * 1.414);
        quads.push({ a, b, c, d, zAvg, slope });
      }
    }
    quads.sort((q1, q2) => q2.zAvg - q1.zAvg);
    for (const q of quads) {
      const mx = (q.a.x + q.c.x) / 2;
      const mz = (q.a.z + q.c.z) / 2;
      const mh = (q.a.h + q.c.h) / 2;
      let fill = terrainColor(mx, mz, mh, q.slope);
      const fade = Math.max(0, Math.min(1, (q.zAvg - 1800) / 1600));
      if (fade > 0) fill = mixHex(fill.startsWith('#') ? fill : '#5d8a46', PALETTE.skyHorizon, fade);
      poly([q.a.p, q.b.p, q.c.p, q.d.p], fill);
    }
    // Runway markings on top of the mesh: centreline dashes and thresholds.
    const rw = RUNWAY;
    const corners = [
      { x: rw.x - rw.length / 2, y: 0.6, z: rw.z - rw.width / 2 },
      { x: rw.x + rw.length / 2, y: 0.6, z: rw.z - rw.width / 2 },
      { x: rw.x + rw.length / 2, y: 0.6, z: rw.z + rw.width / 2 },
      { x: rw.x - rw.length / 2, y: 0.6, z: rw.z + rw.width / 2 },
    ].map((p) => project(cam, p));
    if (corners.every(Boolean)) poly(corners, PALETTE.asphalt);
    for (let d = -380; d <= 380; d += 60) {
      const dash = [
        { x: rw.x + d - 14, y: 0.8, z: rw.z - 1.2 },
        { x: rw.x + d + 14, y: 0.8, z: rw.z - 1.2 },
        { x: rw.x + d + 14, y: 0.8, z: rw.z + 1.2 },
        { x: rw.x + d - 14, y: 0.8, z: rw.z + 1.2 },
      ].map((p) => project(cam, p));
      if (dash.every(Boolean)) poly(dash, PALETTE.asphaltLine);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const bx = rw.x + end * (rw.length / 2 - 22);
      const bar = [
        { x: bx - 10, y: 0.8, z: rw.z - 14 },
        { x: bx + 10, y: 0.8, z: rw.z - 14 },
        { x: bx + 10, y: 0.8, z: rw.z + 14 },
        { x: bx - 10, y: 0.8, z: rw.z + 14 },
      ].map((p) => project(cam, p));
      if (bar.every(Boolean)) poly(bar, PALETTE.asphaltLine);
    }
  }

  function drawCity(cam, blocks) {
    const items = blocks
      .map((b) => ({ b, d: Math.hypot(b.x - cam.eye.x, b.z - cam.eye.z) }))
      .filter((o) => o.d < 2400)
      .sort((a, b2) => b2.d - a.d);
    for (const { b } of items) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const g = b.ground;
      const top = b.ground + b.h;
      const corners = [
        { x: b.x - hw, y: g, z: b.z - hd }, { x: b.x + hw, y: g, z: b.z - hd },
        { x: b.x + hw, y: g, z: b.z + hd }, { x: b.x - hw, y: g, z: b.z + hd },
        { x: b.x - hw, y: top, z: b.z - hd }, { x: b.x + hw, y: top, z: b.z - hd },
        { x: b.x + hw, y: top, z: b.z + hd }, { x: b.x - hw, y: top, z: b.z + hd },
      ].map((p) => project(cam, p));
      if (corners.some((p) => !p)) continue;
      const faces = [
        { idx: [4, 5, 6, 7], fill: PALETTE.cityRoof }, // roof
        { idx: [1, 2, 6, 5], fill: PALETTE.cityWall }, // east
        { idx: [3, 0, 4, 7], fill: '#a08a72' }, // west
        { idx: [2, 3, 7, 6], fill: PALETTE.cityGlass }, // south
        { idx: [0, 1, 5, 4], fill: '#8f7a64' }, // north
      ];
      // Draw only faces whose outward normal points at the camera.
      const centers = [
        { x: b.x, y: top, z: b.z }, { x: b.x + hw, y: g + b.h / 2, z: b.z },
        { x: b.x - hw, y: g + b.h / 2, z: b.z }, { x: b.x, y: g + b.h / 2, z: b.z + hd },
        { x: b.x, y: g + b.h / 2, z: b.z - hd },
      ];
      const normals = [
        { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      ];
      for (let f = 0; f < faces.length; f += 1) {
        const toCam = sub(cam.eye, centers[f]);
        if (dot(toCam, normals[f]) <= 0) continue;
        poly(faces[f].idx.map((i) => corners[i]), faces[f].fill);
      }
    }
  }

  function drawRings(cam, mission) {
    const rings = mission.state.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const passed = ring.passed;
      const isNext = i === mission.state.nextRing && !mission.state.complete;
      const prev = i === 0 ? { x: -700, z: 0 } : rings[i - 1];
      const n = norm({ x: ring.x - prev.x, y: 0, z: ring.z - prev.z });
      const u = norm(cross(n, { x: 0, y: 1, z: 0 }));
      const v = cross(n, u);
      const pts = [];
      let ok = true;
      for (let k = 0; k <= 24; k += 1) {
        const a = (k / 24) * Math.PI * 2;
        const p = project(cam, {
          x: ring.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * ring.radius,
          y: ring.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * ring.radius,
          z: ring.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * ring.radius,
        });
        if (!p) { ok = false; break; }
        pts.push(p);
      }
      if (!ok) continue;
      const depth = Math.hypot(ring.x - cam.eye.x, ring.y - cam.eye.y, ring.z - cam.eye.z);
      const width = Math.max(2, Math.min(14, 900 / depth * 8));
      ctx.save();
      ctx.strokeStyle = passed ? PALETTE.ringDone : isNext ? PALETTE.ringNext : PALETTE.ring;
      ctx.lineWidth = width;
      ctx.globalAlpha = passed ? 0.55 : 0.95;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      if (isNext) {
        const label = project(cam, { x: ring.x, y: ring.y + ring.radius + 14, z: ring.z });
        if (label) text(`RING ${i + 1}`, label.x, label.y, 20, PALETTE.ringNext, 'center', true);
      }
    }
  }

  /** The Kestrel, drawn from behind and above in chase view. */
  function drawPlane(plane, cam) {
    const p = project(cam, { x: plane.x, y: plane.y, z: plane.z });
    if (!p) return;
    const cx = p.x;
    const cy = p.y + 30;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * DEG);
    const s = 1.0;
    ctx.scale(s, s);
    // Wings: swept, light with a red trim edge.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-78, 6); ctx.lineTo(-14, -14); ctx.lineTo(14, -14); ctx.lineTo(78, 6);
    ctx.lineTo(70, 16); ctx.lineTo(12, 2); ctx.lineTo(-12, 2); ctx.lineTo(-70, 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeBody;
    ctx.fillRect(-78, 4, 8, 6);
    ctx.fillRect(70, 4, 8, 6);
    // Wingtip navigation lights.
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(-80, 9, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34d17b'; ctx.beginPath(); ctx.arc(80, 9, 4, 0, Math.PI * 2); ctx.fill();
    // Fuselage: tapered body, nose up-screen.
    const bodyGrad = ctx.createLinearGradient(-14, 0, 14, 0);
    bodyGrad.addColorStop(0, '#a32c26');
    bodyGrad.addColorStop(0.5, PALETTE.planeBody);
    bodyGrad.addColorStop(1, '#a32c26');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-13, 62); ctx.lineTo(-16, 10); ctx.lineTo(-9, -72); ctx.lineTo(0, -84);
    ctx.lineTo(9, -72); ctx.lineTo(16, 10); ctx.lineTo(13, 62); ctx.closePath(); ctx.fill();
    // Tail fin and stabilisers.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.beginPath(); ctx.moveTo(-4, 62); ctx.lineTo(0, 34); ctx.lineTo(4, 62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-34, 52); ctx.lineTo(-8, 42); ctx.lineTo(8, 42); ctx.lineTo(34, 52);
    ctx.lineTo(30, 60); ctx.lineTo(0, 52); ctx.lineTo(-30, 60); ctx.closePath(); ctx.fill();
    // Canopy: lit glass.
    ctx.fillStyle = PALETTE.canopy;
    ctx.beginPath(); ctx.ellipse(0, -38, 8, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-2, -46, 3, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Registration on the fuselage.
    text('K-9', 0, 34, 13, '#ffffff', 'center', true);
    ctx.restore();
  }

  function gauge(x, y, r, label, value, min, max, unit, warnAt) {
    // Lit instrument face: dark glass, bright ticks, a needle.
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = PALETTE.gaugeFace; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    glow.addColorStop(0, 'rgba(120,200,255,0.10)');
    glow.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = PALETTE.gaugeTick; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      const x1 = x + Math.cos(a) * (r - 4);
      const y1 = y + Math.sin(a) * (r - 4);
      const x2 = x + Math.cos(a) * (r - (i % 5 === 0 ? 12 : 8));
      const y2 = y + Math.sin(a) * (r - (i % 5 === 0 ? 12 : 8));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = PALETTE.gaugeNeedle; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r - 14), y + Math.sin(a) * (r - 14)); ctx.stroke();
    ctx.fillStyle = PALETTE.gaugeTick;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    text(label, x, y + r + 16, 12, PALETTE.hud, 'center', true);
    const warn = warnAt !== undefined && value <= warnAt;
    text(`${Math.round(value)}${unit}`, x, y + r + 32, 14, warn ? PALETTE.hudRed : PALETTE.hud, 'center', true);
  }

  function drawCockpit(plane, mission) {
    // Canopy frame and nose, then the lit instrument panel.
    ctx.fillStyle = 'rgba(16,20,26,0.92)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(90, 0); ctx.lineTo(150, 120); ctx.lineTo(0, 150); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W - 90, 0); ctx.lineTo(W - 150, 120); ctx.lineTo(W, 150); ctx.closePath(); ctx.fill();
    // Nose cone at the bottom centre.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath(); ctx.moveTo(W / 2 - 70, H); ctx.lineTo(W / 2 - 26, 560); ctx.lineTo(W / 2 + 26, 560); ctx.lineTo(W / 2 + 70, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath(); ctx.moveTo(W / 2 - 70, H); ctx.lineTo(W / 2 - 60, 640); ctx.lineTo(W / 2 + 60, 640); ctx.lineTo(W / 2 + 70, H); ctx.closePath(); ctx.fill();

    const panelY = 560;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, panelY, W, H - panelY);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, panelY, W, 4);

    // Artificial horizon.
    const hx = 300;
    const hy = panelY + 66;
    const hr = 52;
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-plane.roll * DEG);
    ctx.translate(0, plane.pitch * 2.2);
    ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-hr - 4, -hr - 4, hr * 2 + 8, hr + 4);
    ctx.fillStyle = '#8a6a42'; ctx.fillRect(-hr - 4, 0, hr * 2 + 8, hr + 4);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-hr, 0); ctx.lineTo(hr, 0); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = PALETTE.hudAmber; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx - 26, hy); ctx.lineTo(hx - 8, hy); ctx.moveTo(hx + 8, hy); ctx.lineTo(hx + 26, hy); ctx.stroke();
    text('ATTITUDE', hx, hy + hr + 16, 12, PALETTE.hud, 'center', true);

    gauge(560, hy, 44, 'AIRSPEED', plane.speedKt, 0, 200, ' kt');
    gauge(720, hy, 44, 'ALTITUDE', plane.y * MS_TO_FT, 0, 3000, ' ft');
    gauge(880, hy, 44, 'FUEL', plane.fuel, 0, 100, '%', 20);
    gauge(1040, hy, 44, 'DAMAGE', plane.damage, 0, 100, '%');

    // Compass tape on the panel.
    const cx = 1180;
    text('HDG', cx - 60, hy - 30, 13, PALETTE.hud, 'left', true);
    const hdg = headingDeg(plane);
    text(`${String(Math.round(hdg)).padStart(3, '0')}°`, cx - 60, hy + 10, 26, PALETTE.hud, 'left', true);
    text(`NEXT ${mission.state.nextRing < mission.state.rings.length ? `RING ${mission.state.nextRing + 1}` : '—'}`, cx - 60, hy + 44, 13, PALETTE.hudAmber, 'left', true);
  }

  function drawHud(plane, mission, best, elapsed, showThrottle) {
    const hdg = headingDeg(plane);
    const altFt = Math.round(plane.y * MS_TO_FT);
    const spd = Math.round(plane.speedKt);
    // Top-left instrument cluster.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(16, 14, 330, 86);
    text(`ALT  ${altFt.toLocaleString('en-US')} ft`, 30, 46, 24, PALETTE.hud, 'left', true);
    text(`SPD  ${spd} kt`, 30, 80, 24, PALETTE.hud, 'left', true);
    text(`HDG  ${String(Math.round(hdg)).padStart(3, '0')}°`, 196, 46, 24, PALETTE.hud, 'left', true);
    text(`V/S  ${plane.vspeed >= 0 ? '+' : ''}${plane.vspeed.toFixed(1)} m/s`, 196, 80, 18, plane.vspeed < -4 ? PALETTE.hudRed : PALETTE.hud, 'left');
    // Compass tape.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(360, 14, 560, 40);
    for (let d = -60; d <= 60; d += 10) {
      const deg = Math.round(wrapAngle(hdg + d) / 10) * 10;
      const x = 640 + d * 4.4;
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
      text(label, x, 42, deg % 30 === 0 ? 16 : 12, deg === Math.round(hdg / 10) * 10 ? PALETTE.hudAmber : PALETTE.hud, 'center', true);
    }
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath(); ctx.moveTo(640, 14); ctx.lineTo(634, 6); ctx.lineTo(646, 6); ctx.closePath(); ctx.fill();
    // Top-right: fuel, damage, score, timer, mission.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.fillRect(934, 14, 330, 86);
    text(mission.state.def.name, 948, 40, 17, PALETTE.hudAmber, 'left', true);
    text(`SCORE ${mission.state.score}`, 948, 66, 20, PALETTE.hud, 'left', true);
    text(`BEST ${best}`, 948, 90, 15, '#9fb4c4', 'left');
    const timeText = mission.state.def.timeLimit > 0
      ? `TIME ${Math.max(0, Math.ceil(mission.state.timeLeft))}s`
      : `RINGS ${mission.state.nextRing}/${mission.state.rings.length}`;
    text(timeText, 1250, 40, 17, mission.state.def.timeLimit > 0 && mission.state.timeLeft < 30 ? PALETTE.hudRed : PALETTE.hud, 'right', true);
    // Fuel and damage bars.
    const bar = (x, y, w, frac, color, label) => {
      text(label, x, y - 6, 12, PALETTE.hud, 'left', true);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, w, 10);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.max(0, w * frac), 10);
    };
    bar(1090, 66, 160, plane.fuel / 100, plane.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen, 'FUEL');
    bar(1090, 86, 160, plane.damage / 100, plane.damage > 60 ? PALETTE.hudRed : PALETTE.hudAmber, 'DMG');
    // Throttle bar, bottom-left (chase view only: the cockpit panel owns
    // the bottom of the screen in cockpit view).
    if (showThrottle) {
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      ctx.fillRect(16, H - 52, 260, 36);
      text('THR', 28, H - 26, 14, PALETTE.hud, 'left', true);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(78, H - 38, 180, 12);
      ctx.fillStyle = plane.fuel <= 0 ? PALETTE.hudRed : '#6fc3ff';
      ctx.fillRect(78, H - 38, 180 * plane.throttle, 12);
      text(`${Math.round(plane.throttle * 100)}%`, 264, H - 26, 13, PALETTE.hud, 'right', true);
    }
    // Centre reticle.
    ctx.strokeStyle = 'rgba(234,246,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, H / 2 - 40, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - 24, H / 2 - 40); ctx.lineTo(W / 2 - 16, H / 2 - 40);
    ctx.moveTo(W / 2 + 16, H / 2 - 40); ctx.lineTo(W / 2 + 24, H / 2 - 40);
    ctx.moveTo(W / 2, H / 2 - 64); ctx.lineTo(W / 2, H / 2 - 56);
    ctx.moveTo(W / 2, H / 2 - 24); ctx.lineTo(W / 2, H / 2 - 16);
    ctx.stroke();
    // Next-ring bearing arrow under the reticle.
    if (mission.state.nextRing < mission.state.rings.length && !mission.state.complete) {
      const ring = mission.state.rings[mission.state.nextRing];
      const brg = bearingTo(plane, ring.x, ring.z);
      const rel = wrapAngle(brg - hdg);
      const dist = Math.round(Math.hypot(ring.x - plane.x, ring.z - plane.z));
      const ax = W / 2 + Math.sin(rel * DEG) * 70;
      const ay = H / 2 - 40 - Math.cos(rel * DEG) * 70;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rel * DEG);
      ctx.fillStyle = PALETTE.ringNext;
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      text(`RING ${mission.state.nextRing + 1} · ${dist} m`, W / 2, H / 2 + 44, 15, PALETTE.ringNext, 'center', true);
    }
    // Warnings, flashing.
    const blink = Math.floor(elapsed * 2.5) % 2 === 0;
    let warnY = 120;
    if (plane.stalled && blink) {
      text('STALL — NOSE DOWN, ADD POWER', W / 2, warnY, 24, PALETTE.hudRed, 'center', true);
      warnY += 30;
    }
    if (plane.fuel < 20 && plane.fuel > 0 && blink) {
      text('LOW FUEL', W / 2, warnY, 24, PALETTE.hudAmber, 'center', true);
      warnY += 30;
    }
    if (plane.fuel <= 0) {
      text('FUEL EMPTY — GLIDING', W / 2, warnY, 24, PALETTE.hudRed, 'center', true);
    }
    // Mission message banner.
    if (mission.state.messageTime > 0) {
      ctx.fillStyle = 'rgba(10,14,20,0.65)';
      const msg = mission.state.message;
      ctx.font = font(22, true);
      const mw = ctx.measureText(msg).width + 48;
      ctx.fillRect((W - mw) / 2, 150, mw, 44);
      text(msg, W / 2, 180, 22, PALETTE.hudAmber, 'center', true);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const pw = 720;
    const ph = 150 + lines.length * 34 + 60;
    const x = (W - pw) / 2;
    const y = (H - ph) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = accent || PALETTE.hudAmber;
    ctx.fillRect(x, y, pw, 6);
    text(title, W / 2, y + 78, 44, PALETTE.hud, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], W / 2, y + 128 + i * 34, 21, '#c7d3de', 'center');
    }
    text(prompt, W / 2, y + ph - 28, 22, PALETTE.hudAmber, 'center', true);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, best, viewMode) {
    const plane = state.plane.state;
    const mission = state.mission;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = makeCamera(plane, viewMode);
    drawSky(cam, plane);
    drawClouds(cam, world.clouds);
    drawTerrain(cam, plane);
    drawCity(cam, world.city);
    drawRings(cam, mission);
    if (viewMode === 'chase') drawPlane(plane, cam);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Fly the Kestrel courier across the valley. Three missions, one valley.',
        '1  RING RUN — fly through 8 golden rings in order',
        '2  RUNWAY LANDING — bring her home, slow and gentle',
        '3  TIMED COURSE — 6 rings against a 150-second clock',
        '',
        'Arrows / WASD — pitch and bank · Shift / Ctrl — throttle · Mouse — steer',
        'C — chase / cockpit camera · P — pause · R — restart',
        `Best score ${best}`,
      ];
      drawPanel('KESTREL COURIER', lines, 'Press 1, 2 or 3 to choose a mission', PALETTE.hudAmber);
      return;
    }
    if (viewMode === 'cockpit') drawCockpit(plane, mission);
    else drawHud(plane, mission, best, plane.time, true);
    if (viewMode === 'cockpit') drawHud(plane, mission, best, plane.time, false);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The valley will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('CRASHED', [
        `Score ${mission.state.score} · Best ${best}`,
        plane.fuel <= 0 ? 'The tank ran dry over the valley.' : 'The Kestrel met the ground too hard.',
      ], 'Press Space or R to fly again', PALETTE.hudRed);
    } else if (screen === SCREEN_LANDED) {
      drawPanel('LANDED', [
        `Score ${mission.state.score} · Best ${best}`,
        'Wheels on the runway. The courier is home.',
      ], 'Press Space or R to fly again', PALETTE.hudGreen);
    } else if (screen === SCREEN_DONE) {
      drawPanel('MISSION COMPLETE', [
        `Score ${mission.state.score} · Best ${best}`,
        'Every ring flown, every promise kept. The valley is yours.',
      ], 'Press Space or R to fly again', PALETTE.hudGreen);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
