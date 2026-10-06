import React, { useState } from 'react';
import { Layers, Sparkles, Filter, Play, CheckCircle2, Sliders } from 'lucide-react';
import { Capture } from '../types';

interface ReconstructTabProps {
  capture: Capture;
  onRunTsdf: (voxelLength: number, sdfTrunc: number, maxDepth: number) => void;
  onRunPoisson: (depth: number, quantile: number) => void;
  onRunCleanPcd: (voxelSize: number, neighbors: number, stdRatio: number) => void;
  isProcessing: boolean;
}

export const ReconstructTab: React.FC<ReconstructTabProps> = ({
  capture,
  onRunTsdf,
  onRunPoisson,
  onRunCleanPcd,
  isProcessing,
}) => {
  // TSDF parameters
  const [voxelLength, setVoxelLength] = useState(0.025);
  const [sdfTrunc, setSdfTrunc] = useState(0.08);
  const [maxDepth, setMaxDepth] = useState(3.5);

  // Poisson parameters
  const [poissonDepth, setPoissonDepth] = useState(9);
  const [quantile, setQuantile] = useState(0.05);

  // Point cloud cleanup parameters
  const [cleanVoxel, setCleanVoxel] = useState(0.01);
  const [neighbors, setNeighbors] = useState(20);
  const [stdRatio, setStdRatio] = useState(2.0);

  return (
    <div className="p-4 space-y-4 text-slate-200">
      {/* 1. TSDF FUSION */}
      <div className="bg-studio-750/70 border border-studio-border rounded-xl p-4 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-white">TSDF Depth Fusion</h3>
              <p className="text-[10px] text-slate-400">High-fidelity colored mesh from LiDAR depth maps + poses</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Open3D
          </span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Voxel Size:</span>
              <span className="font-mono text-emerald-400">{(voxelLength * 100).toFixed(1)} cm</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.06"
              step="0.005"
              value={voxelLength}
              onChange={(e) => setVoxelLength(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>SDF Truncation:</span>
              <span className="font-mono text-emerald-400">{(sdfTrunc * 100).toFixed(1)} cm</span>
            </div>
            <input
              type="range"
              min="0.03"
              max="0.15"
              step="0.01"
              value={sdfTrunc}
              onChange={(e) => setSdfTrunc(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Max Depth Cutoff:</span>
              <span className="font-mono text-emerald-400">{maxDepth.toFixed(1)} m</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="5.0"
              step="0.25"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <button
            onClick={() => onRunTsdf(voxelLength, sdfTrunc, maxDepth)}
            disabled={isProcessing}
            className="w-full mt-2 flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Generate TSDF Mesh (GLB / OBJ / PLY)</span>
          </button>
        </div>
      </div>

      {/* 2. POISSON RECONSTRUCTION */}
      <div className="bg-studio-750/70 border border-studio-border rounded-xl p-4 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-white">Poisson Surface Reconstruction</h3>
              <p className="text-[10px] text-slate-400">Watertight mesh from point cloud normals</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Octree Depth:</span>
              <span className="font-mono text-teal-400">{poissonDepth}</span>
            </div>
            <input
              type="range"
              min="7"
              max="11"
              step="1"
              value={poissonDepth}
              onChange={(e) => setPoissonDepth(parseInt(e.target.value))}
              className="w-full accent-teal-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Trim Low-Density Faces:</span>
              <span className="font-mono text-teal-400">{(quantile * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.15"
              step="0.01"
              value={quantile}
              onChange={(e) => setQuantile(parseFloat(e.target.value))}
              className="w-full accent-teal-500 cursor-pointer"
            />
          </div>

          <button
            onClick={() => onRunPoisson(poissonDepth, quantile)}
            disabled={isProcessing || !capture.has_pointcloud}
            className="w-full mt-2 flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Generate Poisson Mesh</span>
          </button>
        </div>
      </div>

      {/* 3. POINT CLOUD CLEANUP */}
      <div className="bg-studio-750/70 border border-studio-border rounded-xl p-4 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-white">Point Cloud Cleanup</h3>
              <p className="text-[10px] text-slate-400">Voxel downsampling & statistical outlier removal</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Voxel Downsample:</span>
              <span className="font-mono text-indigo-400">{(cleanVoxel * 100).toFixed(1)} cm</span>
            </div>
            <input
              type="range"
              min="0.005"
              max="0.04"
              step="0.005"
              value={cleanVoxel}
              onChange={(e) => setCleanVoxel(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Outlier Standard Ratio:</span>
              <span className="font-mono text-indigo-400">{stdRatio.toFixed(1)}σ</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.2"
              value={stdRatio}
              onChange={(e) => setStdRatio(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          <button
            onClick={() => onRunCleanPcd(cleanVoxel, neighbors, stdRatio)}
            disabled={isProcessing || !capture.has_pointcloud}
            className="w-full mt-2 flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Filter Outliers & Denoise</span>
          </button>
        </div>
      </div>
    </div>
  );
};
