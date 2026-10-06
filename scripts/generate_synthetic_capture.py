#!/usr/bin/env python3
"""
Generates a realistic synthetic LiDAR scan bundle adhering to the LidarScan format contract v1.
Uses analytical ray-tracing for solid geometric surfaces (textured ground plane, pedestal,
sculpted sphere, and colorful room walls) producing continuous dense depth maps,
confidence maps, transforms.json, and pointcloud.ply.
"""

import json
import math
import os
import shutil
import struct
import sys
import zipfile
from datetime import datetime
from pathlib import Path
import numpy as np
from PIL import Image

def generate_synthetic_bundle(output_dir: Path, name: str = "Synthetic_Sculpture_Room", num_frames: int = 16) -> Path:
    bundle_dir = output_dir / name
    if bundle_dir.exists():
        shutil.rmtree(bundle_dir)
    bundle_dir.mkdir(parents=True, exist_ok=True)

    images_dir = bundle_dir / "images"
    depth_dir = bundle_dir / "depth"
    conf_dir = bundle_dir / "confidence"
    colmap_sparse_dir = bundle_dir / "colmap" / "sparse" / "0"

    images_dir.mkdir(parents=True, exist_ok=True)
    depth_dir.mkdir(parents=True, exist_ok=True)
    conf_dir.mkdir(parents=True, exist_ok=True)
    colmap_sparse_dir.mkdir(parents=True, exist_ok=True)

    rgb_w, rgb_h = 960, 720
    fl_x, fl_y = 750.0, 750.0
    cx, cy = rgb_w / 2.0, rgb_h / 2.0

    depth_w, depth_h = 256, 192
    depth_fx = fl_x * (depth_w / rgb_w)
    depth_fy = fl_y * (depth_h / rgb_h)
    depth_cx = depth_w / 2.0
    depth_cy = depth_h / 2.0

    # Ray grids in camera frame (OpenCV: X right, Y down, Z forward)
    # Depth camera rays
    u_d, v_d = np.meshgrid(np.arange(depth_w), np.arange(depth_h))
    dirs_d = np.stack([
        (u_d - depth_cx) / depth_fx,
        (v_d - depth_cy) / depth_fy,
        np.ones_like(u_d, dtype=np.float32)
    ], axis=-1)  # (H, W, 3)
    dirs_d_norm = dirs_d / np.linalg.norm(dirs_d, axis=-1, keepdims=True)

    # RGB camera rays
    u_rgb, v_rgb = np.meshgrid(np.arange(rgb_w), np.arange(rgb_h))
    dirs_rgb = np.stack([
        (u_rgb - cx) / fl_x,
        (v_rgb - cy) / fl_y,
        np.ones_like(u_rgb, dtype=np.float32)
    ], axis=-1)
    dirs_rgb_norm = dirs_rgb / np.linalg.norm(dirs_rgb, axis=-1, keepdims=True)

    # Scene geometry:
    # Sphere at (0, 0.1, 0) with radius 0.45
    sphere_center = np.array([0.0, 0.1, 0.0], dtype=np.float32)
    sphere_radius = 0.45
    # Ground plane y = -0.5
    plane_y = -0.5

    orbit_radius = 1.8
    orbit_height = 0.4

    transforms_frames = []
    colmap_images_lines = []
    colmap_cameras_lines = [
        f"1 PINHOLE {rgb_w} {rgb_h} {fl_x} {fl_y} {cx} {cy}\n"
    ]

    all_world_points = []
    all_world_colors = []

    gl_to_cv = np.diag([1.0, -1.0, -1.0, 1.0])

    for i in range(num_frames):
        angle = (2.0 * math.pi * i) / num_frames
        cam_x = orbit_radius * math.cos(angle)
        cam_y = orbit_height + 0.12 * math.sin(2 * angle)
        cam_z = orbit_radius * math.sin(angle)

        cam_pos = np.array([cam_x, cam_y, cam_z], dtype=np.float64)
        target = np.array([0.0, 0.05, 0.0], dtype=np.float64)

        # ARKit / OpenGL camera frame convention:
        forward = target - cam_pos
        forward /= np.linalg.norm(forward)  # -Z_cam
        z_cam = -forward

        world_up = np.array([0.0, 1.0, 0.0], dtype=np.float64)
        x_cam = np.cross(world_up, z_cam)
        x_norm = np.linalg.norm(x_cam)
        if x_norm < 1e-6:
            x_cam = np.array([1.0, 0.0, 0.0])
        else:
            x_cam /= x_norm

        y_cam = np.cross(z_cam, x_cam)
        y_cam /= np.linalg.norm(y_cam)

        c2w_gl = np.eye(4, dtype=np.float64)
        c2w_gl[:3, 0] = x_cam
        c2w_gl[:3, 1] = y_cam
        c2w_gl[:3, 2] = z_cam
        c2w_gl[:3, 3] = cam_pos

        c2w_cv = c2w_gl @ gl_to_cv
        w2c_cv = np.linalg.inv(c2w_cv)
        R_c2w = c2w_cv[:3, :3].astype(np.float32)
        T_c2w = c2w_cv[:3, 3].astype(np.float32)

        # 1. Ray trace depth buffer (256x192)
        world_dirs_d = dirs_d_norm @ R_c2w.T  # (H, W, 3)

        # Sphere intersection
        oc = T_c2w - sphere_center
        b = np.sum(world_dirs_d * oc, axis=-1)
        c = np.sum(oc * oc) - sphere_radius**2
        discriminant = b*b - c
        hit_sphere = discriminant >= 0
        t_sphere = np.where(hit_sphere, -b - np.sqrt(np.maximum(discriminant, 0)), 1e6)
        t_sphere = np.where((t_sphere > 0.1) & hit_sphere, t_sphere, 1e6)

        # Plane intersection: y = -0.5
        dir_y = world_dirs_d[..., 1]
        t_plane = np.where(dir_y < -1e-4, (plane_y - T_c2w[1]) / dir_y, 1e6)
        t_plane = np.where(t_plane > 0.1, t_plane, 1e6)

        # Hit distance
        t_min = np.minimum(t_sphere, t_plane)
        valid_hit = (t_min < 10.0)

        # Depth along camera Z axis = t * dirs_d_norm[..., 2]
        depth_map = np.where(valid_hit, t_min * dirs_d_norm[..., 2], 0.0).astype(np.float32)
        depth_mm = np.clip(depth_map * 1000.0, 0, 65535).astype(np.uint16)

        # 2. Ray trace RGB image (960x720)
        world_dirs_rgb = dirs_rgb_norm @ R_c2w.T
        b_rgb = np.sum(world_dirs_rgb * oc, axis=-1)
        disc_rgb = b_rgb*b_rgb - c
        hit_s_rgb = disc_rgb >= 0
        t_s_rgb = np.where(hit_s_rgb, -b_rgb - np.sqrt(np.maximum(disc_rgb, 0)), 1e6)
        t_s_rgb = np.where((t_s_rgb > 0.1) & hit_s_rgb, t_s_rgb, 1e6)

        dir_y_rgb = world_dirs_rgb[..., 1]
        t_p_rgb = np.where(dir_y_rgb < -1e-4, (plane_y - T_c2w[1]) / dir_y_rgb, 1e6)
        t_p_rgb = np.where(t_p_rgb > 0.1, t_p_rgb, 1e6)

        t_min_rgb = np.minimum(t_s_rgb, t_p_rgb)
        hit_sphere_mask = (t_s_rgb <= t_p_rgb) & (t_s_rgb < 10.0)
        hit_plane_mask = (t_p_rgb < t_s_rgb) & (t_p_rgb < 10.0)

        # RGB Image coloring
        rgb_img_arr = np.full((rgb_h, rgb_w, 3), [35, 40, 52], dtype=np.uint8)

        # Sphere color: iridescent pattern
        p_sphere = T_c2w + t_min_rgb[..., None] * world_dirs_rgb
        norm_sphere = (p_sphere - sphere_center) / sphere_radius
        sphere_r = np.clip((np.sin(norm_sphere[..., 0] * 5.0) * 0.5 + 0.5) * 230 + 20, 0, 255).astype(np.uint8)
        sphere_g = np.clip((np.cos(norm_sphere[..., 1] * 5.0) * 0.5 + 0.5) * 210 + 20, 0, 255).astype(np.uint8)
        sphere_b = np.clip((np.sin(norm_sphere[..., 2] * 5.0) * 0.5 + 0.5) * 240 + 15, 0, 255).astype(np.uint8)

        rgb_img_arr[hit_sphere_mask, 0] = sphere_r[hit_sphere_mask]
        rgb_img_arr[hit_sphere_mask, 1] = sphere_g[hit_sphere_mask]
        rgb_img_arr[hit_sphere_mask, 2] = sphere_b[hit_sphere_mask]

        # Plane color: checkerboard
        plane_x = p_sphere[..., 0]
        plane_z = p_sphere[..., 2]
        check = ((np.floor((plane_x + 10.0) / 0.25) + np.floor((plane_z + 10.0) / 0.25)) % 2 == 0)
        plane_col = np.where(check[..., None], [215, 220, 230], [55, 75, 95]).astype(np.uint8)
        rgb_img_arr[hit_plane_mask] = plane_col[hit_plane_mask]

        # Save files
        frame_str = f"{i:05d}"
        rgb_rel = f"images/frame_{frame_str}.jpg"
        depth_rel = f"depth/frame_{frame_str}.png"
        conf_rel = f"confidence/frame_{frame_str}.png"

        Image.fromarray(rgb_img_arr).save(bundle_dir / rgb_rel, "JPEG", quality=92)
        Image.fromarray(depth_mm).save(bundle_dir / depth_rel)
        conf_arr = np.where(depth_mm > 0, 2, 0).astype(np.uint8)
        Image.fromarray(conf_arr).save(bundle_dir / conf_rel)

        # Collect points for pointcloud.ply from every 3rd frame to keep it neat
        if i % 3 == 0:
            step = 4
            p_world_grid = T_c2w + t_min[::step, ::step, None] * world_dirs_d[::step, ::step]
            valid_pts = valid_hit[::step, ::step]
            pts_sub = p_world_grid[valid_pts]

            # Color for these points
            col_sub = []
            hit_s_sub = hit_sphere[::step, ::step][valid_pts]
            for p, is_s in zip(pts_sub, hit_s_sub):
                if is_s:
                    col_sub.append([220, 100, 180])
                else:
                    is_ch = (int((p[0] + 10) / 0.25) + int((p[2] + 10) / 0.25)) % 2 == 0
                    col_sub.append([215, 220, 230] if is_ch else [55, 75, 95])
            all_world_points.append(pts_sub)
            all_world_colors.append(np.array(col_sub, dtype=np.uint8))

        transforms_frames.append({
            "file_path": rgb_rel,
            "depth_file_path": depth_rel,
            "confidence_file_path": conf_rel,
            "fl_x": fl_x,
            "fl_y": fl_y,
            "cx": cx,
            "cy": cy,
            "transform_matrix": c2w_gl.tolist(),
            "timestamp": 1000.0 + i * 0.1,
        })

        # COLMAP line
        R = w2c_cv[:3, :3]
        t = w2c_cv[:3, 3]
        tr = np.trace(R)
        if tr > 0:
            S = np.sqrt(tr + 1.0) * 2
            qw = 0.25 * S
            qx = (R[2, 1] - R[1, 2]) / S
            qy = (R[0, 2] - R[2, 0]) / S
            qz = (R[1, 0] - R[0, 1]) / S
        else:
            qw, qx, qy, qz = 1.0, 0.0, 0.0, 0.0
        q_norm = math.sqrt(qw**2 + qx**2 + qy**2 + qz**2)
        qw, qx, qy, qz = qw/q_norm, qx/q_norm, qy/q_norm, qz/q_norm

        colmap_images_lines.append(f"{i+1} {qw:.6f} {qx:.6f} {qy:.6f} {qz:.6f} {t[0]:.6f} {t[1]:.6f} {t[2]:.6f} 1 frame_{frame_str}.jpg\n\n")

    # Write combined pointcloud.ply
    dense_pts = np.vstack(all_world_points).astype(np.float32)
    dense_cols = np.vstack(all_world_colors).astype(np.uint8)

    ply_header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {len(dense_pts)}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    )
    with open(bundle_dir / "pointcloud.ply", "wb") as f:
        f.write(ply_header.encode("ascii"))
        for p, c in zip(dense_pts, dense_cols):
            f.write(struct.pack("<fffBBB", p[0], p[1], p[2], c[0], c[1], c[2]))

    # Write metadata.json
    with open(bundle_dir / "metadata.json", "w") as f:
        json.dump({
            "format": "lidarscan",
            "version": 1,
            "app_version": "1.0",
            "device": "iPhone15,3",
            "name": name,
            "created": datetime.now().isoformat(),
            "frame_count": num_frames,
            "has_mesh": False,
            "has_depth": True,
            "depth_units": "millimeters",
            "coordinate_system": "ARKit (right-handed, Y up, camera looks -Z)",
        }, f, indent=2)

    # Write transforms.json
    with open(bundle_dir / "transforms.json", "w") as f:
        json.dump({
            "camera_model": "OPENCV",
            "w": rgb_w,
            "h": rgb_h,
            "fl_x": fl_x,
            "fl_y": fl_y,
            "cx": cx,
            "cy": cy,
            "k1": 0.0, "k2": 0.0, "p1": 0.0, "p2": 0.0,
            "ply_file_path": "pointcloud.ply",
            "frames": transforms_frames,
        }, f, indent=2)

    # Write COLMAP files
    with open(colmap_sparse_dir / "cameras.txt", "w") as f:
        f.writelines(colmap_cameras_lines)
    with open(colmap_sparse_dir / "images.txt", "w") as f:
        f.writelines(colmap_images_lines)

    # Subsampled points3D.txt
    points3d_lines = []
    sub_idx = np.random.choice(len(dense_pts), min(len(dense_pts), 5000), replace=False)
    for p_id, idx in enumerate(sub_idx):
        px, py, pz = dense_pts[idx]
        cr, cg, cb = dense_cols[idx]
        points3d_lines.append(f"{p_id+1} {px:.4f} {py:.4f} {pz:.4f} {cr} {cg} {cb} 0.1\n")

    with open(colmap_sparse_dir / "points3D.txt", "w") as f:
        f.writelines(points3d_lines)

    # Create .lidarscan.zip
    zip_path = output_dir / f"{name}.lidarscan.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for item in bundle_dir.rglob("*"):
            if item.is_file():
                z.write(item, f"{name}/{item.relative_to(bundle_dir)}")

    print(f"Generated realistic synthetic capture: {bundle_dir} ({len(dense_pts):,} points)")
    print(f"Created bundle zip: {zip_path} ({zip_path.stat().st_size:,} bytes)")
    return zip_path

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "test_data"
    generate_synthetic_bundle(out)
