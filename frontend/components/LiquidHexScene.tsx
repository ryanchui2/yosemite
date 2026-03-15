import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";

/* ─── constants ─── */
const SIDE = 2.0;
const HALF = SIDE / 2;
const N = 32;
const N1 = N + 1;
const CELL = SIDE / N;
const INV_C2 = 1 / (CELL * CELL);

/* ─── physics tuning ─── */
const WAVE_C2 = 12.0;
const DAMPING = 2.8;
const GRAV_K = 5.0;
const MAX_SUB = 1 / 120;

/* ─── micro-wave surface roughness ─── */
function microWave(x: number, z: number, t: number) {
  return (
    Math.sin(x * 4.7 + t * 1.4) * 0.007 +
    Math.sin(z * 6.3 - t * 1.8) * 0.005 +
    Math.sin((x + z) * 8.9 + t * 2.5) * 0.004 +
    Math.sin((x - z) * 12.1 - t * 1.2) * 0.0025 +
    Math.sin(x * 17.3 + z * 14.7 + t * 3.9) * 0.0015
  );
}

/* ─── heightfield fluid simulation ─── */
class FluidSim {
  h: Float32Array;
  v: Float32Array;
  fillY = 0;

  constructor(fillY: number) {
    const c = N1 * N1;
    this.h = new Float32Array(c).fill(fillY);
    this.v = new Float32Array(c);
    this.fillY = fillY;
  }

  step(dt: number, gx: number, gz: number) {
    const { h, v, fillY } = this;

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const c = j * N1 + i;
        const hC = h[c];

        // Neumann boundary (reflect at walls)
        const hL = i > 0 ? h[c - 1] : hC;
        const hR = i < N ? h[c + 1] : hC;
        const hD = j > 0 ? h[c - N1] : hC;
        const hU = j < N ? h[c + N1] : hC;

        // wave propagation via discrete laplacian
        const lap = (hL + hR + hD + hU - 4 * hC) * INV_C2;
        let f = WAVE_C2 * lap;

        // gravity-driven tilt toward equilibrium plane
        const x = -HALF + i * CELL;
        const z = -HALF + j * CELL;
        f += GRAV_K * (fillY + gx * x + gz * z - hC);

        v[c] = (v[c] + f * dt) * Math.max(0, 1 - DAMPING * dt);
      }
    }

    // integrate heights
    for (let k = 0; k < h.length; k++) h[k] += v[k] * dt;

    // volume conservation
    let s = 0;
    for (let k = 0; k < h.length; k++) s += h[k];
    const corr = fillY - s / h.length;
    for (let k = 0; k < h.length; k++) h[k] += corr;

    // clamp to cube bounds
    for (let k = 0; k < h.length; k++)
      h[k] = Math.max(-HALF, Math.min(HALF, h[k]));
  }
}

/* ─── build liquid volume geometry ─── */
function buildLiquidGeo() {
  const topVerts = N1 * N1;
  const sideVerts = N1 * 2 * 4;
  const botVerts = 4;
  const total = topVerts + sideVerts + botVerts;
  const pos = new Float32Array(total * 3);
  const indices: number[] = [];

  // top surface
  let vi = 0;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++, vi++) {
      pos[vi * 3] = -HALF + i * CELL;
      pos[vi * 3 + 1] = 0;
      pos[vi * 3 + 2] = -HALF + j * CELL;
    }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }

  // side walls
  const sb = topVerts;
  const addWall = (
    getX: (k: number) => number,
    getZ: (k: number) => number,
    off: number,
    flip: boolean,
  ) => {
    for (let k = 0; k < N1; k++) {
      const t = off + k * 2, b = t + 1;
      pos[t * 3] = getX(k); pos[t * 3 + 1] = 0; pos[t * 3 + 2] = getZ(k);
      pos[b * 3] = getX(k); pos[b * 3 + 1] = -HALF; pos[b * 3 + 2] = getZ(k);
    }
    for (let k = 0; k < N; k++) {
      const t0 = off + k * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
      if (flip) indices.push(t0, b0, t1, t1, b0, b1);
      else      indices.push(t0, t1, b0, b0, t1, b1);
    }
  };

  addWall(k => -HALF + k * CELL, () => HALF,  sb,          true);   // front  +Z
  addWall(k => -HALF + k * CELL, () => -HALF, sb + N1 * 2, false);  // back   -Z
  addWall(() => HALF,  k => -HALF + k * CELL,  sb + N1 * 4, false); // right  +X
  addWall(() => -HALF, k => -HALF + k * CELL,  sb + N1 * 6, true);  // left   -X

  // bottom face
  const bb = topVerts + sideVerts;
  const corners = [[-HALF, -HALF, -HALF], [HALF, -HALF, -HALF], [-HALF, -HALF, HALF], [HALF, -HALF, HALF]];
  corners.forEach((c, k) => { pos[(bb + k) * 3] = c[0]; pos[(bb + k) * 3 + 1] = c[1]; pos[(bb + k) * 3 + 2] = c[2]; });
  indices.push(bb, bb + 1, bb + 2, bb + 2, bb + 1, bb + 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ─── sync geometry positions from sim ─── */
function syncGeo(geo: THREE.BufferGeometry, sim: FluidSim, t: number) {
  const p = (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;

  // top surface
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const vi = j * N1 + i;
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      p[vi * 3 + 1] = sim.h[vi] + microWave(x, z, t);
    }

  // side wall top edges mirror surface edges
  const sb = N1 * N1;
  for (let k = 0; k < N1; k++) p[(sb + k * 2) * 3 + 1]             = p[(N * N1 + k) * 3 + 1]; // front j=N
  for (let k = 0; k < N1; k++) p[(sb + N1 * 2 + k * 2) * 3 + 1]    = p[k * 3 + 1];             // back  j=0
  for (let k = 0; k < N1; k++) p[(sb + N1 * 4 + k * 2) * 3 + 1]    = p[(k * N1 + N) * 3 + 1];  // right i=N
  for (let k = 0; k < N1; k++) p[(sb + N1 * 6 + k * 2) * 3 + 1]    = p[(k * N1) * 3 + 1];      // left  i=0

  (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  geo.computeVertexNormals();
}

/* ─── glass shell ─── */
function GlassShell() {
  const box = useMemo(() => new THREE.BoxGeometry(SIDE, SIDE, SIDE), []);
  const edge = useMemo(() => new THREE.EdgesGeometry(box), [box]);
  return (
    <>
      <mesh geometry={box}>
        <meshPhysicalMaterial
          color="#ffffff" transparent opacity={0.06}
          roughness={0} metalness={0}
          side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edge}>
        <lineBasicMaterial color="#000000" transparent opacity={0.7} />
      </lineSegments>
    </>
  );
}

/* ─── liquid body: simulation + rendered mesh ─── */
function LiquidBody({ score }: { score: number }) {
  const grpRef = useRef<THREE.Group>(null!);
  const clock = useRef(0);
  const smoothFill = useRef(-HALF + SIDE * (Math.max(0, Math.min(100, score)) / 100));

  const s = Math.max(0, Math.min(100, score));
  const targetFill = -HALF + SIDE * (s / 100);

  const sim = useMemo(() => new FluidSim(targetFill), []);
  const geo = useMemo(() => buildLiquidGeo(), []);

  useEffect(() => () => geo.dispose(), [geo]);

  // reusable objects (avoid GC pressure)
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _g = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, dt) => {
    const g = grpRef.current;
    if (!g) return;

    clock.current += dt;
    const t = clock.current;

    // smooth fill-level transition
    smoothFill.current += (targetFill - smoothFill.current) * Math.min(1, dt * 3);
    sim.fillY = smoothFill.current;

    // auto-rotate + subtle wobble
    g.rotation.y += dt * 0.35;
    g.rotation.x = Math.sin(t * 0.47) * 0.04 + Math.sin(t * 0.71) * 0.02;
    g.rotation.z = Math.cos(t * 0.53) * 0.035 + Math.cos(t * 0.83) * 0.015;

    // gravity = camera's "screen-down" direction, transformed to cube local frame
    // this makes the liquid respond to manual orbit rotation (drag to tilt)
    g.updateWorldMatrix(true, false);
    _g.set(0, -1, 0).applyQuaternion(camera.quaternion); // screen-down in world space
    _q.copy(g.quaternion).invert();
    _g.applyQuaternion(_q); // world → cube local

    // substep physics for stability
    let rem = Math.min(dt, 0.05);
    while (rem > 1e-4) {
      const sub = Math.min(rem, MAX_SUB);
      sim.step(sub, _g.x, _g.z);
      rem -= sub;
    }

    syncGeo(geo, sim, t);
  });

  return (
    <group ref={grpRef}>
      <GlassShell />
      {s > 0 && (
        <mesh geometry={geo}>
          <meshPhysicalMaterial
            color="#0a0a14"
            roughness={0.08}
            metalness={0.4}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            reflectivity={0.9}
            transparent
            opacity={0.96}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

/* ─── exported scene ─── */
export default function LiquidHexScene({ score }: { score: number }) {
  return (
    <Canvas
      camera={{ position: [3.2, 2.4, 3.2], fov: 42 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#ffffff"]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 6, 4]}   intensity={8}  color="#ffffff" />
      <pointLight position={[-4, 3, -2]} intensity={3}  color="#88aaff" />
      <pointLight position={[0, -3, 3]}  intensity={1.5} color="#ffffff" />
      <LiquidBody score={score} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={0.4}
        maxPolarAngle={1.75}
      />
    </Canvas>
  );
}
