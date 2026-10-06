# 📡 LidarScan Studio

**LidarScan Studio** is a Linux desktop/PC workstation application that receives, processes, and visualizes 3D captures from a companion iPhone LiDAR app. It combines real-time WebGL/WebGPU 3D rendering (Gaussian Splats, TSDF meshes, and point clouds) with automated 3D reconstruction and cloud/local training pipelines.

---

## ✨ Features

- **📱 Seamless iPhone Transfer & Inbox**:
  - Runs an HTTP server on port **8765** advertised via **Bonjour / mDNS** (`_lidarscan._tcp.local.`).
  - Receives `.lidarscan.zip` uploads directly from the iPhone app over Wi-Fi (`POST /api/upload`).
  - Drag-and-drop import and export of capture bundles.
  - Interactive capture library with keyframe thumbnail galleries, device metadata, and frame counts.
  - QR Code generator and LAN IP display for instant pairing.

- **🌐 In-Browser 3D Viewers (Offline & Vendored)**:
  - **Gaussian Splat Viewer**: Powered by `@mkkellogg/gaussian-splats-3d` for photorealistic real-time splat rendering (`.splat`, `.ply`, `.ksplat`).
  - **3D Mesh Viewer**: High-performance Three.js viewer with GLTF (`.glb`), OBJ, and PLY support, solid/wireframe toggle, and normal maps.
  - **Dense Point Cloud Viewer**: PLY point cloud viewer with vertex color support and point size adjustments.
  - **Camera Frustums & Trajectory**: Visualizes the exact iPhone camera pose trajectory and field of view for each keyframe from `transforms.json`.
  - Orbit controls, ground grid, and fullscreen mode.

- **⚡ 3D Gaussian Splat Training**:
  - **Option A (Primary & Recommended) — Free Google Colab NVIDIA T4 GPU**:
    - 1-Click interactive Google Colab notebook (`colab_trainer.ipynb`).
    - Trains splats in ~2–4 minutes using high-speed CUDA acceleration on a free Colab GPU.
    - Automated Colab CLI integration (`colab new`, `colab upload`, `colab exec`, `colab download`, `colab stop`).
    - Direct "Import Splat" dropzone to load finished splats immediately into the 3D viewer.
  - **Option B (Local Fallback) — Brush Engine**:
    - Vendored Rust + wgpu/Vulkan [Brush](https://github.com/ArthurBrussee/brush) engine.
    - Exposes iterations/steps, image resolution downscale, and max splats sliders with live streaming terminal logs.
    - Converts 3DGS PLY files to standard compact 32-byte `.splat` binaries.

- **📐 LiDAR Depth-to-Mesh Reconstruction (Open3D)**:
  - **TSDF Volume Fusion**: Integrates raw LiDAR depth frames (uint16 mm) and camera extrinsics into a continuous textured 3D mesh.
  - **Screened Poisson Reconstruction**: Generates watertight surfaces from point cloud normals with density trimming.
  - **Point Cloud Cleanup**: Statistical outlier removal and voxel downsampling.
  - Exports to **GLB**, **OBJ**, and **PLY**.

- **⏳ Real-Time Jobs Queue**:
  - Background asynchronous task scheduler with live progress bars, status messages, and streaming log consoles.

---

## 🚀 Quickstart

### 1. Launch Studio

Simply run the launch script from the repository root:

```bash
./run.sh
```

`run.sh` automatically:
1. Creates a Python virtual environment (`venv/`) if not present.
2. Installs dependencies (`requirements.txt`).
3. Downloads the Brush Gaussian Splatting engine (if missing).
4. Verifies the built web UI bundle in `dist/`.
5. Starts the FastAPI server on port `8765`.
6. Launches your default web browser to `http://localhost:8765`.

### 2. Desktop Launcher

A `.desktop` launcher is installed at:
```bash
~/.local/share/applications/lidarscan-studio.desktop
```
You can search for **LidarScan Studio** in your application launcher or dock.

---

## 📱 Pairing with iPhone App

1. Ensure your iPhone and PC are connected to the same Wi-Fi network.
2. Open the **LidarScan** companion app on your iPhone.
3. Tap **"Send to PC"**.
4. The iPhone app will automatically discover LidarScan Studio via Bonjour mDNS (`_lidarscan._tcp`).
5. Alternatively, scan the **QR Code** in the top navigation bar or enter your PC's LAN IP (`http://<LAN_IP>:8765`).

---

## 🛠️ Capture Bundle Contract (v1)

A capture is transferred as a `.lidarscan.zip` bundle:

```
<capture_name>/
  metadata.json          # Device, created ISO8601, frame count, coordinate system
  transforms.json        # Nerfstudio camera intrinsics & poses (ARKit OpenGL convention)
  images/frame_00000.jpg # RGB keyframes (JPEG q=0.9)
  depth/frame_00000.png  # 16-bit uint16 mm LiDAR depth maps (256x192)
  confidence/frame_00000.png # 8-bit PNG confidence (0/1/2)
  pointcloud.ply         # Binary little-endian point cloud in meters
  mesh/mesh.glb          # Reconstructed 3D meshes (TSDF / Poisson)
  splats/trained_splat.splat # Trained Gaussian Splats
  colmap/sparse/0/       # COLMAP model (cameras.txt, images.txt, points3D.txt)
```

---

## 🧪 Testing with Synthetic Data

Generate a realistic synthetic test capture bundle (with ray-traced geometric room, 16-bit depth, RGB images, and poses):

```bash
./venv/bin/python3 scripts/generate_synthetic_capture.py
```

Test upload via curl:

```bash
curl -X POST http://localhost:8765/api/upload \
  -F "file=@test_data/Synthetic_Sculpture_Room.lidarscan.zip" \
  -F "name=My_Test_Room"
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/ping` | `GET` | Format contract ping `{"name":"LidarScan Studio","version":1}` |
| `/api/upload` | `POST` | Multipart upload `file` (.zip) and optional `name` |
| `/api/status` | `GET` | Studio LAN IP, Colab CLI status, active jobs |
| `/api/captures` | `GET` | List all library captures |
| `/api/captures/{id}` | `GET` | Retrieve capture metadata and assets |
| `/api/captures/{id}` | `DELETE` | Delete capture from disk |
| `/api/captures/{id}/export` | `GET` | Download `.lidarscan.zip` bundle |
| `/api/captures/{id}/import-splat` | `POST` | Import external `.splat` or `.ply` |
| `/api/captures/{id}/tsdf` | `POST` | Trigger Open3D TSDF depth fusion |
| `/api/captures/{id}/poisson` | `POST` | Trigger Screened Poisson reconstruction |
| `/api/captures/{id}/clean-pcd` | `POST` | Trigger Point Cloud cleanup |
| `/api/captures/{id}/train-splat-colab` | `POST` | Trigger automated Colab GPU splat training |
| `/api/captures/{id}/train-splat-local` | `POST` | Trigger local Brush splat training |
| `/api/jobs` | `GET` | List background jobs |
| `/api/jobs/{id}/logs` | `GET` | Real-time job log lines |

---

## 📜 License

MIT License. Created for the LidarScan 3D Ecosystem.
