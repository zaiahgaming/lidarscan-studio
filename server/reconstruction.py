import json
import logging
import struct
import zlib
from pathlib import Path
from typing import Callable, Optional
import numpy as np
from PIL import Image
import open3d as o3d
import trimesh

logger = logging.getLogger("lidarscan.reconstruction")


def _find_transforms(capture_dir: Path) -> Path:
    """Locates transforms.json in the root or the app's private/ export layout."""
    for candidate in (capture_dir / "transforms.json", capture_dir / "private" / "transforms.json"):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Missing transforms.json in {capture_dir}")


def _resolve_frame_path(capture_dir: Path, base_dir: Path, rel: str) -> Path:
    """Frame paths are relative to the transforms.json location in new export
    layouts (private/), and to the capture root in older captures."""
    candidate = base_dir / rel
    if candidate.exists():
        return candidate
    return capture_dir / rel


def load_depth_image(path: Path) -> Image.Image:
    """Reads a 16-bit depth PNG, tolerating the app's historical export bug:
    RawPNGWriter wrapped IDAT with raw DEFLATE instead of a zlib stream, which
    standard PNG decoders (PIL, Rust image, macOS Preview) refuse. Falls back
    to a manual chunk decode for those files."""
    try:
        img = Image.open(path)
        img.load()
        return img
    except Exception:
        pass

    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"Not a PNG file: {path}")
    pos, width, height, idat = 8, None, None, b""
    while pos + 8 <= len(data):
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        payload = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            width, height = struct.unpack(">II", payload[:8])
        elif ctype == b"IDAT":
            idat += payload
        elif ctype == b"IEND":
            break
        pos += 12 + length
    if not width or not height:
        raise ValueError(f"Malformed PNG header in {path}")
    try:
        raw = zlib.decompress(idat)
    except zlib.error:
        raw = zlib.decompress(idat, -15)  # raw deflate stream
    stride = 1 + width * 2
    if len(raw) != height * stride:
        raise ValueError(f"Unexpected depth payload size in {path}: {len(raw)}")
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(height, stride)
    if (rows[:, 0] != 0).any():
        raise ValueError(f"Unsupported PNG row filters in {path}")
    # 16-bit grayscale pixels are big-endian, filter type None on every row.
    pixels = rows[:, 1:].reshape(height, width, 2).view(">u2").reshape(height, width).astype(np.uint16)
    return Image.fromarray(pixels)


def _find_pointcloud(capture_dir: Path) -> Path:
    """Locates pointcloud.ply at the capture root or under private/."""
    for candidate in (
        capture_dir / "pointcloud.ply",
        capture_dir / "private" / "pointcloud.ply",
        capture_dir / "pointcloud_cleaned.ply",
        capture_dir / "private" / "pointcloud_cleaned.ply",
    ):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Missing pointcloud.ply in {capture_dir}")


def run_tsdf_fusion(
    capture_dir: str | Path,
    voxel_length: float = 0.025,
    sdf_trunc: float = 0.08,
    max_depth: float = 3.5,
    downscale_factor: int = 2,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> dict:
    """
    Performs TSDF volume integration on depth frames + poses from transforms.json.
    Produces high-quality colored meshes (PLY, OBJ, GLB).
    """
    capture_dir = Path(capture_dir)
    transforms_path = _find_transforms(capture_dir)
    # Frame entries are relative to the directory containing transforms.json
    base_dir = transforms_path.parent
    with open(transforms_path, "r") as f:
        data = json.load(f)

    frames = data.get("frames", [])
    if not frames:
        raise ValueError("transforms.json has no frames")

    # Intrinsics
    global_w = data.get("w", 1920)
    global_h = data.get("h", 1440)
    global_fx = data.get("fl_x", 1440.0)
    global_fy = data.get("fl_y", 1440.0)
    global_cx = data.get("cx", global_w / 2.0)
    global_cy = data.get("cy", global_h / 2.0)

    # Calculate scene bounding volume from camera positions
    cam_centers = []
    gl_to_cv = np.diag([1.0, -1.0, -1.0, 1.0])

    for frame in frames:
        c2w_gl = np.array(frame["transform_matrix"], dtype=np.float64)
        c2w_cv = c2w_gl @ gl_to_cv
        cam_centers.append(c2w_cv[:3, 3])

    cam_centers = np.array(cam_centers)
    min_c = np.min(cam_centers, axis=0) - (max_depth * 0.7)
    max_c = np.max(cam_centers, axis=0) + (max_depth * 0.7)

    center = (min_c + max_c) / 2.0
    extent = np.max(max_c - min_c)
    extent = max(float(extent), 3.0)

    # Bounding cube
    origin = center - (extent / 2.0)
    # Resolution (number of voxels along each dimension)
    # Clamped between 128 and 256 for smooth performance and crisp geometry
    res = int(np.clip(extent / voxel_length, 128, 256))

    if progress_callback:
        progress_callback(0.05, f"Initializing TSDF volume (extent={extent:.1f}m, resolution={res}^3)...")

    volume = o3d.pipelines.integration.UniformTSDFVolume(
        length=float(extent),
        resolution=res,
        sdf_trunc=sdf_trunc,
        color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8,
        origin=origin.astype(np.float64),
    )

    total_frames = len(frames)
    integrated_count = 0

    for i, frame in enumerate(frames):
        if progress_callback:
            progress_callback(0.05 + (i / total_frames * 0.75), f"Integrating frame {i + 1}/{total_frames}")

        rgb_rel = frame.get("file_path")
        depth_rel = frame.get("depth_file_path")
        if not rgb_rel or not depth_rel:
            continue

        rgb_path = _resolve_frame_path(capture_dir, base_dir, rgb_rel)
        depth_path = _resolve_frame_path(capture_dir, base_dir, depth_rel)
        if not rgb_path.exists() or not depth_path.exists():
            continue

        rgb_img = Image.open(rgb_path).convert("RGB")
        depth_img = load_depth_image(depth_path)

        depth_w, depth_h = depth_img.size
        rgb_resized = rgb_img.resize((depth_w, depth_h), Image.Resampling.BILINEAR)

        rgb_np = np.asarray(rgb_resized)
        depth_np = np.asarray(depth_img, dtype=np.uint16)

        frame_fx = frame.get("fl_x", global_fx) * (depth_w / global_w)
        frame_fy = frame.get("fl_y", global_fy) * (depth_h / global_h)
        frame_cx = frame.get("cx", global_cx) * (depth_w / global_w)
        frame_cy = frame.get("cy", global_cy) * (depth_h / global_h)

        intrinsic = o3d.camera.PinholeCameraIntrinsic(
            width=depth_w,
            height=depth_h,
            fx=frame_fx,
            fy=frame_fy,
            cx=frame_cx,
            cy=frame_cy,
        )

        o3d_color = o3d.geometry.Image(rgb_np)
        o3d_depth = o3d.geometry.Image(depth_np)

        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
            o3d_color,
            o3d_depth,
            depth_scale=1000.0,
            depth_trunc=max_depth,
            convert_rgb_to_intensity=False,
        )

        c2w_gl = np.array(frame["transform_matrix"], dtype=np.float64)
        c2w_cv = c2w_gl @ gl_to_cv
        w2c_cv = np.linalg.inv(c2w_cv)

        volume.integrate(rgbd, intrinsic, w2c_cv)
        integrated_count += 1

    if progress_callback:
        progress_callback(0.85, f"Extracting surface mesh from {integrated_count} frames...")

    mesh = volume.extract_triangle_mesh()
    if len(mesh.triangles) == 0:
        raise RuntimeError("TSDF integration produced 0 triangles. Check depth maps or scale.")

    mesh.compute_vertex_normals()

    if progress_callback:
        progress_callback(0.92, "Exporting reconstructed meshes (PLY, OBJ, GLB)...")

    mesh_dir = capture_dir / "mesh"
    mesh_dir.mkdir(parents=True, exist_ok=True)

    ply_path = mesh_dir / "mesh_tsdf.ply"
    obj_path = mesh_dir / "mesh_tsdf.obj"
    glb_path = mesh_dir / "mesh_tsdf.glb"

    o3d.io.write_triangle_mesh(str(ply_path), mesh, write_vertex_normals=True, write_vertex_colors=True)
    o3d.io.write_triangle_mesh(str(obj_path), mesh, write_vertex_normals=True, write_vertex_colors=True)

    try:
        tri = trimesh.load(str(ply_path))
        tri.export(str(glb_path))
    except Exception as e:
        logger.warning(f"Could not export GLB via trimesh: {e}")

    # Also update default mesh.ply / mesh.obj if not present
    if not (mesh_dir / "mesh.obj").exists():
        o3d.io.write_triangle_mesh(str(mesh_dir / "mesh.obj"), mesh)
    if not (mesh_dir / "mesh.ply").exists():
        o3d.io.write_triangle_mesh(str(mesh_dir / "mesh.ply"), mesh)

    if progress_callback:
        progress_callback(1.0, f"Done! Generated mesh with {len(mesh.vertices):,} vertices and {len(mesh.triangles):,} faces.")

    return {
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.triangles),
        "ply": str(ply_path.relative_to(capture_dir)),
        "obj": str(obj_path.relative_to(capture_dir)),
        "glb": str(glb_path.relative_to(capture_dir)) if glb_path.exists() else None,
    }


def run_poisson_reconstruction(
    capture_dir: str | Path,
    depth: int = 9,
    quantile: float = 0.05,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> dict:
    capture_dir = Path(capture_dir)
    pcd_path = _find_pointcloud(capture_dir)
    if progress_callback:
        progress_callback(0.05, f"Using point cloud: {pcd_path.relative_to(capture_dir)}")

    if progress_callback:
        progress_callback(0.1, "Loading point cloud...")

    pcd = o3d.io.read_point_cloud(str(pcd_path))
    if len(pcd.points) == 0:
        raise ValueError("pointcloud.ply has no points")

    if not pcd.has_normals():
        if progress_callback:
            progress_callback(0.3, "Estimating point cloud normals...")
        pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.08, max_nn=30))
        pcd.orient_normals_consistent_tangent_plane(10)

    if progress_callback:
        progress_callback(0.5, f"Running Screened Poisson reconstruction (octree depth={depth})...")

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=depth)

    if progress_callback:
        progress_callback(0.8, "Filtering low-density spurious faces...")

    densities_np = np.asarray(densities)
    if len(densities_np) > 0 and quantile > 0:
        cutoff = np.quantile(densities_np, quantile)
        vertices_to_remove = densities_np < cutoff
        mesh.remove_vertices_by_mask(vertices_to_remove)

    mesh.compute_vertex_normals()

    mesh_dir = capture_dir / "mesh"
    mesh_dir.mkdir(parents=True, exist_ok=True)
    ply_path = mesh_dir / "mesh_poisson.ply"
    obj_path = mesh_dir / "mesh_poisson.obj"
    glb_path = mesh_dir / "mesh_poisson.glb"

    o3d.io.write_triangle_mesh(str(ply_path), mesh, write_vertex_normals=True, write_vertex_colors=True)
    o3d.io.write_triangle_mesh(str(obj_path), mesh, write_vertex_normals=True, write_vertex_colors=True)

    try:
        tri = trimesh.load(str(ply_path))
        tri.export(str(glb_path))
    except Exception as e:
        logger.warning(f"Could not export Poisson GLB: {e}")

    if progress_callback:
        progress_callback(1.0, f"Poisson complete: {len(mesh.vertices):,} vertices, {len(mesh.triangles):,} faces")

    return {
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.triangles),
        "ply": str(ply_path.relative_to(capture_dir)),
        "obj": str(obj_path.relative_to(capture_dir)),
        "glb": str(glb_path.relative_to(capture_dir)) if glb_path.exists() else None,
    }


def run_pointcloud_cleanup(
    capture_dir: str | Path,
    voxel_size: float = 0.01,
    nb_neighbors: int = 20,
    std_ratio: float = 2.0,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> dict:
    capture_dir = Path(capture_dir)
    pcd_path = _find_pointcloud(capture_dir)

    if progress_callback:
        progress_callback(0.05, f"Using point cloud: {pcd_path.relative_to(capture_dir)}")
        progress_callback(0.1, "Reading pointcloud.ply...")

    pcd = o3d.io.read_point_cloud(str(pcd_path))
    initial_count = len(pcd.points)

    if voxel_size > 0:
        if progress_callback:
            progress_callback(0.4, f"Voxel downsampling (size={voxel_size}m)...")
        pcd = pcd.voxel_down_sample(voxel_size=voxel_size)

    if progress_callback:
        progress_callback(0.7, f"Statistical outlier removal (neighbors={nb_neighbors}, std={std_ratio})...")

    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=nb_neighbors, std_ratio=std_ratio)
    final_count = len(pcd.points)

    out_path = capture_dir / "pointcloud_cleaned.ply"
    o3d.io.write_point_cloud(str(out_path), pcd)

    if progress_callback:
        progress_callback(1.0, f"Cleaned point cloud: {initial_count:,} -> {final_count:,} points")

    return {
        "initial_points": initial_count,
        "final_points": final_count,
        "cleaned_file": str(out_path.relative_to(capture_dir)),
    }
