import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  Sparkles,
  Box,
  Cloud,
  Maximize2,
  Minimize2,
  Eye,
  Sliders,
  Camera,
  Grid,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { Capture } from '../types';

interface Viewer3DProps {
  capture: Capture | null;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({ capture }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewer modes: 'splat' | 'mesh' | 'pointcloud'
  const [mode, setMode] = useState<'splat' | 'mesh' | 'pointcloud'>('mesh');
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [wireframe, setWireframe] = useState(false);
  const [pointSize, setPointSize] = useState(0.015);
  const [showFrustums, setShowFrustums] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentObjectRef = useRef<THREE.Object3D | null>(null);
  const frustumsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Splat viewer ref
  const splatViewerRef = useRef<any>(null);

  // Pick default mode and asset when capture changes
  useEffect(() => {
    if (!capture) return;

    if (capture.has_splats && capture.splats.length > 0) {
      setMode('splat');
      setSelectedAsset(capture.splats[0]);
    } else if (capture.has_mesh && capture.meshes.length > 0) {
      setMode('mesh');
      // Prefer .glb then .obj then .ply
      const best =
        capture.meshes.find((m) => m.endsWith('.glb')) ||
        capture.meshes.find((m) => m.endsWith('.obj')) ||
        capture.meshes[0];
      setSelectedAsset(best);
    } else if (capture.has_pointcloud && capture.pointclouds.length > 0) {
      setMode('pointcloud');
      setSelectedAsset(capture.pointclouds[0]);
    }
  }, [capture?.id]);

  // Clean up viewers
  const disposeThree = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (rendererRef.current.domElement && rendererRef.current.domElement.parentNode) {
        rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current = null;
    }
    sceneRef.current = null;
    cameraRef.current = null;
    currentObjectRef.current = null;
    frustumsGroupRef.current = null;
    gridHelperRef.current = null;
  };

  const disposeSplat = () => {
    if (splatViewerRef.current) {
      try {
        splatViewerRef.current.dispose();
      } catch (e) {
        console.warn('Error disposing splat viewer', e);
      }
      splatViewerRef.current = null;
    }
  };

  // Switch between Splat and Three.js viewer
  useEffect(() => {
    if (!containerRef.current || !capture) return;

    // Reset container HTML
    containerRef.current.innerHTML = '';
    disposeThree();
    disposeSplat();

    if (mode === 'splat') {
      initSplatViewer();
    } else {
      initThreeViewer();
    }

    return () => {
      disposeThree();
      disposeSplat();
    };
  }, [mode, capture?.id, selectedAsset]);

  // ------------------ GAUSSIAN SPLAT VIEWER ------------------
  const initSplatViewer = async () => {
    if (!containerRef.current || !capture || !selectedAsset) return;

    setIsLoading(true);
    setLoadingText('Initializing Gaussian Splat renderer...');

    try {
      const viewer = new GaussianSplats3D.Viewer({
        rootElement: containerRef.current,
        cameraUp: [0, 1, 0],
        initialCameraPosition: [0, 1.2, 2.5],
        initialCameraLookAt: [0, 0, 0],
        sphericalHarmonicsDegree: 2,
        selfDrivenMode: true,
        useBuiltInControls: true,
      });

      splatViewerRef.current = viewer;

      const splatUrl = `/captures/${capture.id}/${selectedAsset}`;
      setLoadingText(`Streaming Gaussian splats: ${selectedAsset}...`);

      const isSplat = selectedAsset.endsWith('.splat');
      const isPly = selectedAsset.endsWith('.ply');
      const format = isSplat
        ? GaussianSplats3D.SceneFormat.Splat
        : isPly
        ? GaussianSplats3D.SceneFormat.Ply
        : GaussianSplats3D.SceneFormat.Splat;

      await viewer.addSplatScene(splatUrl, {
        format: format,
        streamView: true,
        showLoadingUI: false,
      });

      viewer.start();
    } catch (err: any) {
      console.error('Failed to load Gaussian splat scene:', err);
      setLoadingText(`Error loading splats: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------ THREE.JS VIEWER (MESH & POINT CLOUD) ------------------
  const initThreeViewer = async () => {
    if (!containerRef.current || !capture) return;

    setIsLoading(true);
    setLoadingText(`Loading ${mode === 'mesh' ? '3D Mesh' : 'Point Cloud'}...`);

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e111a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 100);
    camera.position.set(0, 1.2, 2.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90b0e0, 0.8);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Grid & Axes
    const grid = new THREE.GridHelper(6, 30, 0x38bdf8, 0x1e293b);
    grid.position.y = -0.5;
    grid.visible = showGrid;
    scene.add(grid);
    gridHelperRef.current = grid;

    const axes = new THREE.AxesHelper(0.5);
    scene.add(axes);

    // Camera Frustums group
    const frustumsGroup = new THREE.Group();
    scene.add(frustumsGroup);
    frustumsGroupRef.current = frustumsGroup;
    loadCameraFrustums();

    // Load actual asset
    try {
      if (mode === 'mesh' && selectedAsset) {
        await loadMeshObject(scene, `/captures/${capture.id}/${selectedAsset}`);
      } else if (mode === 'pointcloud' && selectedAsset) {
        await loadPointCloudObject(scene, `/captures/${capture.id}/${selectedAsset}`);
      }
    } catch (err: any) {
      console.error('Error loading 3D asset:', err);
    } finally {
      setIsLoading(false);
    }

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(containerRef.current);
  };

  const loadMeshObject = async (scene: THREE.Scene, url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();

    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const obj = gltf.scene;

      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.material) {
            (m.material as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        }
      });

      scene.add(obj);
      currentObjectRef.current = obj;
    } else if (ext === 'obj') {
      const loader = new OBJLoader();
      const obj = await loader.loadAsync(url);
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.material = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.4,
            wireframe: wireframe,
          });
        }
      });
      scene.add(obj);
      currentObjectRef.current = obj;
    } else if (ext === 'ply') {
      const loader = new PLYLoader();
      const geometry = await loader.loadAsync(url);
      geometry.computeVertexNormals();

      const hasColors = !!geometry.attributes.color;
      const material = new THREE.MeshStandardMaterial({
        vertexColors: hasColors,
        color: hasColors ? 0xffffff : 0x94a3b8,
        roughness: 0.5,
        wireframe: wireframe,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      currentObjectRef.current = mesh;
    }
  };

  const loadPointCloudObject = async (scene: THREE.Scene, url: string) => {
    const loader = new PLYLoader();
    const geometry = await loader.loadAsync(url);
    const hasColors = !!geometry.attributes.color;

    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: hasColors,
      color: hasColors ? 0xffffff : 0x38bdf8,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    currentObjectRef.current = points;
  };

  // Load and render camera poses as wireframe frustums from transforms.json
  const loadCameraFrustums = async () => {
    if (!capture || !frustumsGroupRef.current) return;
    try {
      const res = await fetch(`/captures/${capture.id}/transforms.json`);
      if (!res.ok) return;
      const data = await res.json();
      const frames = data.frames || [];

      const frustumGroup = frustumsGroupRef.current;
      frustumGroup.clear();

      const pyramidGeo = createFrustumGeometry(0.12, 0.09, 0.16);
      const wireframeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.6, transparent: true });

      // Gl to Three convention:
      // ARKit transform is OpenGL camera-to-world (camera looks -Z, Y is up, X is right)
      frames.forEach((f: any, idx: number) => {
        const mat = new THREE.Matrix4().fromArray(f.transform_matrix.flat());
        const wire = new THREE.LineSegments(pyramidGeo, wireframeMat);
        wire.applyMatrix4(mat);
        frustumGroup.add(wire);
      });

      frustumGroup.visible = showFrustums;
    } catch (e) {
      console.warn('Could not load camera poses:', e);
    }
  };

  const createFrustumGeometry = (w: number, h: number, d: number) => {
    // Camera apex at (0, 0, 0), looking down -Z
    const vertices = new Float32Array([
      // Apex to 4 corners
      0, 0, 0,  -w/2,  h/2, -d,
      0, 0, 0,   w/2,  h/2, -d,
      0, 0, 0,   w/2, -h/2, -d,
      0, 0, 0,  -w/2, -h/2, -d,
      // Rectangle base
      -w/2,  h/2, -d,   w/2,  h/2, -d,
       w/2,  h/2, -d,   w/2, -h/2, -d,
       w/2, -h/2, -d,  -w/2, -h/2, -d,
      -w/2, -h/2, -d,  -w/2,  h/2, -d,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geo;
  };

  // Wireframe toggle update
  useEffect(() => {
    if (mode === 'mesh' && currentObjectRef.current) {
      currentObjectRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.material) {
            (m.material as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        }
      });
    }
  }, [wireframe]);

  // Point size update
  useEffect(() => {
    if (mode === 'pointcloud' && currentObjectRef.current) {
      const points = currentObjectRef.current as THREE.Points;
      if (points.material) {
        (points.material as THREE.PointsMaterial).size = pointSize;
      }
    }
  }, [pointSize]);

  // Frustums toggle
  useEffect(() => {
    if (frustumsGroupRef.current) {
      frustumsGroupRef.current.visible = showFrustums;
    }
  }, [showFrustums]);

  // Grid toggle
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  const handleResetCamera = () => {
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(0, 1.2, 2.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!capture) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-studio-900 text-slate-500 select-none">
        <Box className="w-12 h-12 stroke-1 mb-3 text-slate-600 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-400">Select a Capture to View</h3>
        <p className="text-xs text-slate-600 mt-1">Choose a capture from the left sidebar or import a new one.</p>
      </div>
    );
  }

  // Available assets for the active mode
  const currentAssetList =
    mode === 'splat'
      ? capture.splats
      : mode === 'mesh'
      ? capture.meshes
      : capture.pointclouds;

  return (
    <div className={`flex-1 flex flex-col bg-studio-900 relative overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Top Floating Toolbar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
        {/* Mode Switcher */}
        <div className="flex items-center space-x-1 p-1 rounded-xl bg-studio-800/90 border border-studio-border backdrop-blur shadow-xl pointer-events-auto">
          <button
            onClick={() => {
              setMode('splat');
              if (capture.splats.length > 0) setSelectedAsset(capture.splats[0]);
            }}
            disabled={!capture.has_splats}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'splat'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-500/20'
                : capture.has_splats
                ? 'text-slate-300 hover:text-white hover:bg-studio-700'
                : 'text-slate-600 cursor-not-allowed opacity-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Gaussian Splat</span>
          </button>

          <button
            onClick={() => {
              setMode('mesh');
              if (capture.meshes.length > 0) setSelectedAsset(capture.meshes[0]);
            }}
            disabled={!capture.has_mesh}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'mesh'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                : capture.has_mesh
                ? 'text-slate-300 hover:text-white hover:bg-studio-700'
                : 'text-slate-600 cursor-not-allowed opacity-50'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-emerald-300" />
            <span>3D Mesh</span>
          </button>

          <button
            onClick={() => {
              setMode('pointcloud');
              if (capture.pointclouds.length > 0) setSelectedAsset(capture.pointclouds[0]);
            }}
            disabled={!capture.has_pointcloud}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'pointcloud'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : capture.has_pointcloud
                ? 'text-slate-300 hover:text-white hover:bg-studio-700'
                : 'text-slate-600 cursor-not-allowed opacity-50'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-indigo-300" />
            <span>Point Cloud</span>
          </button>
        </div>

        {/* Viewport Controls */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          {/* Asset Dropdown if multiple exist */}
          {currentAssetList.length > 1 && (
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="bg-studio-800/90 border border-studio-border text-slate-200 text-xs rounded-lg px-2.5 py-1.5 backdrop-blur focus:outline-none focus:border-cyan-500"
            >
              {currentAssetList.map((asset) => (
                <option key={asset} value={asset}>
                  {asset.split('/').pop()}
                </option>
              ))}
            </select>
          )}

          {/* Mesh wireframe toggle */}
          {mode === 'mesh' && (
            <button
              onClick={() => setWireframe(!wireframe)}
              className={`p-2 rounded-lg border backdrop-blur transition-all ${
                wireframe
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-studio-800/90 border-studio-border text-slate-400 hover:text-white'
              }`}
              title="Toggle Wireframe"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Point size slider */}
          {mode === 'pointcloud' && (
            <div className="flex items-center space-x-2 bg-studio-800/90 border border-studio-border rounded-lg px-2 py-1 backdrop-blur text-xs text-slate-300">
              <span className="text-[10px] text-slate-400">Size</span>
              <input
                type="range"
                min="0.005"
                max="0.06"
                step="0.002"
                value={pointSize}
                onChange={(e) => setPointSize(parseFloat(e.target.value))}
                className="w-16 accent-indigo-500 cursor-pointer"
              />
            </div>
          )}

          {/* Camera pose frustums */}
          {mode !== 'splat' && (
            <button
              onClick={() => setShowFrustums(!showFrustums)}
              className={`p-2 rounded-lg border backdrop-blur transition-all ${
                showFrustums
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-studio-800/90 border-studio-border text-slate-400 hover:text-white'
              }`}
              title="Toggle Camera Poses"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Grid toggle */}
          {mode !== 'splat' && (
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded-lg border backdrop-blur transition-all ${
                showGrid
                  ? 'bg-studio-700 border-studio-border text-cyan-400'
                  : 'bg-studio-800/90 border-studio-border text-slate-400 hover:text-white'
              }`}
              title="Toggle Ground Grid"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Reset camera */}
          {mode !== 'splat' && (
            <button
              onClick={handleResetCamera}
              className="p-2 rounded-lg bg-studio-800/90 border border-studio-border text-slate-400 hover:text-white backdrop-blur transition-all"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-studio-800/90 border border-studio-border text-slate-400 hover:text-white backdrop-blur transition-all"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full splat-container relative cursor-grab active:cursor-grabbing"
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-studio-900/70 backdrop-blur-sm flex flex-col items-center justify-center z-30 pointer-events-none">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
          <p className="text-xs font-semibold text-slate-200">{loadingText}</p>
        </div>
      )}

      {/* Mode hint badge at bottom */}
      <div className="absolute bottom-3 left-3 flex items-center space-x-2 text-[11px] font-mono text-slate-400 bg-studio-800/80 backdrop-blur border border-studio-border/60 px-3 py-1 rounded-lg pointer-events-none">
        <span>Orbit: Left Drag</span>
        <span>•</span>
        <span>Pan: Right Drag</span>
        <span>•</span>
        <span>Zoom: Scroll</span>
      </div>
    </div>
  );
};
