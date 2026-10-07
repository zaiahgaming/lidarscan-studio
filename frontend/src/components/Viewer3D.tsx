import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  Box, Camera, Cloud, Footprints, Grid3X3, LoaderCircle, Maximize2,
  MousePointer2, RotateCcw, ScanLine, Sparkles, X,
} from 'lucide-react';
import { Capture } from '../types';
import { fileName } from '../lib/format';

type ViewMode = 'mesh' | 'pointcloud' | 'splat';
// Deterministic format preference so glob order never picks a worse asset
// (e.g. mesh.obj over mesh.glb, or trained_splat.ply over trained_splat.splat).
const FORMAT_PRIORITY: Record<ViewMode, RegExp[]> = {
  mesh: [/\.glb$/i, /\.gltf$/i, /\.ply$/i, /\.obj$/i],
  pointcloud: [/\.ply$/i],
  splat: [/\.splat$/i, /\.ksplat$/i, /\.spz$/i, /\.ply$/i],
};
const choose = (files: string[], mode: ViewMode) => {
  for (const pattern of FORMAT_PRIORITY[mode]) {
    const match = files.find((f) => pattern.test(f));
    if (match) return match;
  }
  return files[0] ?? '';
};
const urlFor = (id: string, file: string) => '/captures/' + encodeURIComponent(id) + '/' + file.split('/').map(encodeURIComponent).join('/');

export const Viewer3D: React.FC<{ capture: Capture | null }> = ({ capture }) => {
  const stage = useRef<HTMLDivElement>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const controls = useRef<any>(null);
  const splat = useRef<any>(null);
  const splatHost = useRef<HTMLDivElement | null>(null);
  const model = useRef<THREE.Object3D | null>(null);
  const ground = useRef<THREE.GridHelper | null>(null);
  const bounds = useRef(new THREE.Box3());
  const keys = useRef(new Set<string>());
  const walking = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const speed = useRef(1.8);
  const raf = useRef(0);
  const resizeCleanup = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<ViewMode>('mesh');
  const [selected, setSelected] = useState('');
  const [walkMode, setWalkMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [pointSize, setPointSize] = useState(0.014);
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const files = useMemo(() => !capture ? [] : mode === 'splat' ? capture.splats : mode === 'mesh' ? capture.meshes : capture.pointclouds, [capture, mode]);
  const file = files.includes(selected) ? selected : choose(files, mode);

  useEffect(() => {
    if (!capture) { setMode('mesh'); setSelected(''); return; }
    const next: ViewMode = capture.has_splats && capture.splats.length ? 'splat' : capture.has_mesh && capture.meshes.length ? 'mesh' : 'pointcloud';
    setMode(next); setSelected(choose(next === 'splat' ? capture.splats : next === 'mesh' ? capture.meshes : capture.pointclouds, next));
    setWalkMode(false); walking.current = false;
  }, [capture?.id]);

  useEffect(() => { walking.current = walkMode; if (controls.current) controls.current.enabled = !walkMode; if (!walkMode && document.pointerLockElement) document.exitPointerLock(); }, [walkMode]);
  useEffect(() => { if (ground.current) ground.current.visible = showGrid; }, [showGrid]);
  useEffect(() => { model.current?.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat: any) => { if (mat && 'wireframe' in mat) mat.wireframe = wireframe; }); }); }, [wireframe]);
  useEffect(() => { const p = model.current as THREE.Points | null; if (p?.isPoints && p.material instanceof THREE.PointsMaterial) p.material.size = pointSize; }, [pointSize]);

  useEffect(() => {
    let previous = performance.now(); let frame = 0;
    const step = (time: number) => {
      frame = requestAnimationFrame(step);
      const cam = camera.current; const dt = Math.min((time - previous) / 1000, 0.05); previous = time;
      if (!walking.current || !cam) return;
      const down = keys.current, forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      forward.y = 0; right.y = 0; forward.normalize(); right.normalize();
      const move = new THREE.Vector3();
      if (down.has('KeyW') || down.has('ArrowUp')) move.add(forward);
      if (down.has('KeyS') || down.has('ArrowDown')) move.sub(forward);
      if (down.has('KeyD') || down.has('ArrowRight')) move.add(right);
      if (down.has('KeyA') || down.has('ArrowLeft')) move.sub(right);
      if (down.has('KeyE')) move.y += 1; if (down.has('KeyQ')) move.y -= 1;
      if (move.lengthSq()) cam.position.add(move.normalize().multiplyScalar(speed.current * (down.has('ShiftLeft') ? 2 : 1) * dt));
    };
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (!walking.current || ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (/^(Key[WASDQE]|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft)$/.test(e.code)) { keys.current.add(e.code); e.preventDefault(); }
    };
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (!walking.current || document.pointerLockElement !== stage.current) return;
      yaw.current -= e.movementX * 0.002; pitch.current = THREE.MathUtils.clamp(pitch.current - e.movementY * 0.002, -1.48, 1.48);
      camera.current?.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    };
    const lock = () => setLocked(document.pointerLockElement === stage.current);
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('mousemove', mouse); document.addEventListener('pointerlockchange', lock);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('mousemove', mouse); document.removeEventListener('pointerlockchange', lock); };
  }, []);

  useEffect(() => {
    const host = stage.current;
    if (!host || !capture || !file) { setLoading(false); setError(''); return; }
    let cancelled = false;
    setLoading(true); setError(''); setWalkMode(false); walking.current = false;
    const cleanup = () => {
      try { splat.current?.dispose(); } catch { /* viewer already disposed */ }
      splat.current = null; controls.current?.dispose?.(); controls.current = null;
      if (renderer.current) { renderer.current.dispose(); renderer.current.domElement.remove(); renderer.current = null; }
      // Remove only DOM nodes this component created. Never clear the host
      // element itself: React owns sibling overlay nodes inside it, and
      // wiping them causes a removeChild crash that unmounts the whole app.
      splatHost.current?.remove(); splatHost.current = null;
      model.current?.traverse((n) => { const o = n as THREE.Mesh | THREE.Points; o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m?.dispose?.()); });
      model.current = null; camera.current = null; ground.current = null;
    };
    cleanup();
    const load = async () => {
      try {
        if (mode === 'splat') {
          // The splat library aggressively manages the DOM inside its root
          // element. Give it a dedicated detached div so it never mutates
          // nodes that React also controls.
          const inner = document.createElement('div');
          inner.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
          host.appendChild(inner); splatHost.current = inner;
          const isPly = /\.ply$/i.test(file);
          const viewer = new GaussianSplats3D.Viewer({ rootElement: inner, cameraUp: [0, 1, 0], initialCameraPosition: [0, 1.6, 3.5], initialCameraLookAt: [0, 1, 0], selfDrivenMode: true, useBuiltInControls: true, sharedMemoryForWorkers: false, ignoreDevicePixelRatio: true, halfPrecisionCovariancesOnGPU: true });
          splat.current = viewer;
          await viewer.addSplatScene(urlFor(capture.id, file), { format: isPly ? GaussianSplats3D.SceneFormat.Ply : GaussianSplats3D.SceneFormat.Splat, streamView: true, showLoadingUI: false });
          if (cancelled) { viewer.dispose(); return; }
          viewer.start(); camera.current = viewer.camera; controls.current = viewer.controls;
        } else {
          const scene = new THREE.Scene(); scene.background = new THREE.Color('#101214');
          const cam = new THREE.PerspectiveCamera(66, Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1), 0.01, 2000);
          const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); gl.setSize(host.clientWidth, host.clientHeight); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; host.appendChild(gl.domElement);
          scene.add(new THREE.HemisphereLight(0xd8ece6, 0x1c2124, 2.1));
          const light = new THREE.DirectionalLight(0xfff2dd, 2.2); light.position.set(4, 7, 6); scene.add(light);
          const orbit = new OrbitControls(cam, gl.domElement); orbit.enableDamping = true; orbit.screenSpacePanning = true;
          camera.current = cam; renderer.current = gl; controls.current = orbit;
          const path = urlFor(capture.id, file);
          if (mode === 'pointcloud') {
            const geo = await new PLYLoader().loadAsync(path), colored = Boolean(geo.getAttribute('color'));
            model.current = new THREE.Points(geo, new THREE.PointsMaterial({ size: pointSize, sizeAttenuation: true, vertexColors: colored, color: colored ? 0xffffff : 0x34e1c3 }));
          } else if (/\.(glb|gltf)$/i.test(file)) model.current = (await new GLTFLoader().loadAsync(path)).scene;
          else if (/\.obj$/i.test(file)) {
            const obj = await new OBJLoader().loadAsync(path);
            obj.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: 0xc2cdc9, roughness: 0.78 }); });
            model.current = obj;
          } else if (/\.ply$/i.test(file)) {
            const geo = await new PLYLoader().loadAsync(path); geo.computeVertexNormals(); const colored = Boolean(geo.getAttribute('color'));
            const mat = geo.index ? new THREE.MeshStandardMaterial({ color: colored ? 0xffffff : 0xc2cdc9, vertexColors: colored, side: THREE.DoubleSide }) : new THREE.PointsMaterial({ size: pointSize, vertexColors: colored, color: colored ? 0xffffff : 0x34e1c3 });
            model.current = geo.index ? new THREE.Mesh(geo, mat) : new THREE.Points(geo, mat);
          } else throw new Error('Preview supports GLB, GLTF, OBJ, and PLY files.');
          if (cancelled) return;
          scene.add(model.current!); const box = new THREE.Box3().setFromObject(model.current!); bounds.current.copy(box);
          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), d = Math.max(size.length(), 0.5);
            speed.current = THREE.MathUtils.clamp(d * 0.22, 0.6, 5); cam.near = Math.max(0.005, d / 10000); cam.far = Math.max(150, d * 12); cam.updateProjectionMatrix();
            cam.position.copy(center).add(new THREE.Vector3(d * 0.5, d * 0.34, d * 1.65)); orbit.target.copy(center); orbit.minDistance = d * 0.02; orbit.maxDistance = d * 20; orbit.update();
            const helper = new THREE.GridHelper(Math.max(4, d * 2.5), 32, 0x2e9d8a, 0x1d2426); helper.position.y = box.min.y; helper.visible = showGrid; scene.add(helper); ground.current = helper;
          }
          const observer = new ResizeObserver(() => { cam.aspect = Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1); cam.updateProjectionMatrix(); gl.setSize(host.clientWidth, host.clientHeight); });
          observer.observe(host); resizeCleanup.current = () => observer.disconnect();
          const draw = () => { if (cancelled) return; orbit.update(); gl.render(scene, cam); raf.current = requestAnimationFrame(draw); }; draw();
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this model.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; cancelAnimationFrame(raf.current); resizeCleanup.current?.(); resizeCleanup.current = null; cleanup(); };
  }, [capture?.id, mode, file, retry]);

  const enterWalk = () => {
    const cam = camera.current;
    if (cam && mode !== 'splat' && !bounds.current.isEmpty()) {
      const b = bounds.current, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      cam.position.set(c.x, b.min.y + THREE.MathUtils.clamp(s.y * 0.64, 0.25, 1.65), c.z + Math.max(0.1, s.z * 0.02));
      cam.lookAt(c.x, cam.position.y, c.z - Math.max(0.5, s.z));
    } else if (cam) { cam.position.set(0, 1.6, 1.2); cam.lookAt(0, 1.5, 0); }
    if (cam) { const rotation = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); yaw.current = rotation.y; pitch.current = rotation.x; }
    setWalkMode(true); walking.current = true; stage.current?.requestPointerLock?.();
  };
  const resetView = () => {
    setWalkMode(false); const cam = camera.current, orbit = controls.current;
    if (cam && orbit?.target) { const c = bounds.current.isEmpty() ? new THREE.Vector3(0, 1, 0) : bounds.current.getCenter(new THREE.Vector3()); const d = Math.max(bounds.current.getSize(new THREE.Vector3()).length(), 2); cam.position.copy(c).add(new THREE.Vector3(d * 0.5, d * 0.34, d * 1.65)); orbit.target.copy(c); orbit.update?.(); }
  };

  if (!capture) return null;

  return (
    <section className={'v3d' + (full ? ' fullscreen' : '')}>
      <div
        ref={stage}
        className={'v3d-canvas' + (walkMode ? ' walking' : '')}
        onClick={() => { if (walkMode && document.pointerLockElement !== stage.current) stage.current?.requestPointerLock?.(); }}
        role="application"
        aria-label="Interactive 3D model"
      >
        {!files.length && !loading && !error && (
          <div className="v3d-empty">
            <div className="welcome" style={{ border: 'none', background: 'none' }}>
              <div className="welcome-glyph"><Camera size={26} /></div>
              <h2 style={{ fontSize: 18 }}>No model in this view</h2>
              <p>Choose another view, or run reconstruction from the Process tab.</p>
            </div>
          </div>
        )}
        {loading && (
          <div className="v3d-overlay">
            <LoaderCircle size={24} className="spin" />
            <h3>Loading your scan</h3>
            <p>{fileName(file)}</p>
          </div>
        )}
        {error && (
          <div className="v3d-overlay error">
            <ScanLine size={24} />
            <h3>Couldn’t open this model</h3>
            <p>{error}</p>
            <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); setRetry((n) => n + 1); }}>Try again</button>
          </div>
        )}
        {!loading && !error && files.length > 0 && walkMode && (
          <div className="v3d-walkhud" style={{ top: 60 }}>
            <span className="live"><i /> WALK</span>
            <span>{locked ? 'Mouse to look · WASD to move · Shift faster · Q/E rise' : 'Click to look around · WASD to move'}</span>
            <button onClick={(e) => { e.stopPropagation(); resetView(); }}><X size={13} /> Exit</button>
          </div>
        )}
        {!loading && !error && files.length > 0 && !walkMode && (
          <div className="v3d-hint">
            <MousePointer2 size={12} /> Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Right drag to pan
          </div>
        )}
      </div>

      <div className="v3d-chrome v3d-tabs" role="tablist" aria-label="Model type">
        {([['mesh', Box, 'Mesh', capture.meshes], ['pointcloud', Cloud, 'Points', capture.pointclouds], ['splat', Sparkles, 'Splat', capture.splats]] as const).map(([key, Icon, label, list]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            className={'v3d-tab' + (mode === key ? ' active' : '')}
            disabled={!list.length}
            onClick={() => { setMode(key); setSelected(choose(list, key)); }}
          >
            <Icon size={14} />
            <span>{label}</span>
            <small>{list.length}</small>
          </button>
        ))}
      </div>

      <div className="v3d-chrome v3d-tools">
        {files.length > 1 && (
          <select className="v3d-file-select" aria-label="Model file" value={file} onChange={(e) => setSelected(e.target.value)}>
            {files.map((f) => <option key={f} value={f}>{fileName(f)}</option>)}
          </select>
        )}
        {mode === 'mesh' && (
          <button className={'v3d-tool' + (wireframe ? ' on' : '')} onClick={() => setWireframe((v) => !v)} title="Wireframe">
            <Grid3X3 size={15} />
          </button>
        )}
        {mode === 'pointcloud' && (
          <label className="v3d-pointsize">
            Size
            <input type="range" min="0.004" max="0.05" step="0.002" value={pointSize} onChange={(e) => setPointSize(Number(e.target.value))} />
          </label>
        )}
        <button className={'v3d-tool' + (showGrid ? ' on' : '')} onClick={() => setShowGrid((v) => !v)} title="Ground grid">
          <Grid3X3 size={15} />
        </button>
        <button className="v3d-tool" onClick={resetView} title="Reset view">
          <RotateCcw size={15} />
        </button>
        <button className="v3d-tool" onClick={() => setFull((v) => !v)} title={full ? 'Exit full screen' : 'Full screen'}>
          {full ? <X size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <div className="v3d-chrome v3d-bottom">
        <div className="v3d-caption">
          <span className="kind">{mode === 'splat' ? 'Gaussian splat' : mode === 'pointcloud' ? 'Point cloud' : '3D mesh'}</span>
          <span className="sep">/</span>
          <strong>{fileName(file) || 'No model'}</strong>
        </div>
        <button
          className={'v3d-walkbtn' + (walkMode ? ' exit' : '')}
          onClick={walkMode ? resetView : enterWalk}
          disabled={loading || !file}
        >
          <Footprints size={14} />
          {walkMode ? 'Exit walk' : 'Walk inside'}
        </button>
      </div>
    </section>
  );
};
