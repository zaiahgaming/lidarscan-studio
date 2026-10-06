import json
import logging
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from PIL import Image

logger = logging.getLogger("lidarscan.captures")

class CaptureManager:
    def __init__(self, root_dir: str | Path):
        self.root_dir = Path(root_dir).resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def list_captures(self) -> List[Dict[str, Any]]:
        """Lists all available captures with their metadata and available assets."""
        captures = []
        for item in self.root_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                info = self.get_capture_info(item.name)
                if info:
                    captures.append(info)
        # Sort by creation time descending
        captures.sort(key=lambda c: c.get("created", ""), reverse=True)
        return captures

    def get_capture_path(self, capture_id: str) -> Path:
        path = (self.root_dir / capture_id).resolve()
        if not path.is_relative_to(self.root_dir):
            raise ValueError("Invalid capture ID traversal")
        return path

    def get_capture_info(self, capture_id: str) -> Optional[Dict[str, Any]]:
        capture_dir = self.get_capture_path(capture_id)
        if not capture_dir.exists() or not capture_dir.is_dir():
            return None

        # Read metadata.json if present
        meta_file = capture_dir / "metadata.json"
        meta = {}
        if meta_file.exists():
            try:
                with open(meta_file, "r") as f:
                    meta = json.load(f)
            except Exception as e:
                logger.warning(f"Error parsing metadata.json in {capture_id}: {e}")

        # Check frame count from transforms.json or images dir
        transforms_file = capture_dir / "transforms.json"
        frames_count = meta.get("frame_count", 0)
        camera_info = {}
        if transforms_file.exists():
            try:
                with open(transforms_file, "r") as f:
                    t_data = json.load(f)
                    frames = t_data.get("frames", [])
                    if not frames_count:
                        frames_count = len(frames)
                    camera_info = {
                        "w": t_data.get("w"),
                        "h": t_data.get("h"),
                        "camera_model": t_data.get("camera_model"),
                    }
            except Exception:
                pass

        images_dir = capture_dir / "images"
        if not frames_count and images_dir.exists():
            frames_count = len(list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.png")))

        # Thumbnail handling
        thumb_path = capture_dir / "thumbnail.jpg"
        if not thumb_path.exists() and images_dir.exists():
            # Find first image to make thumbnail
            img_files = sorted(images_dir.glob("*.jpg")) or sorted(images_dir.glob("*.png"))
            if img_files:
                try:
                    with Image.open(img_files[0]) as img:
                        img = img.convert("RGB")
                        img.thumbnail((320, 240))
                        img.save(thumb_path, "JPEG", quality=85)
                except Exception as e:
                    logger.warning(f"Failed to generate thumbnail for {capture_id}: {e}")

        # Check assets
        has_depth = (capture_dir / "depth").exists() or meta.get("has_depth", False)
        pointcloud_files = []
        if (capture_dir / "pointcloud.ply").exists():
            pointcloud_files.append("pointcloud.ply")
        if (capture_dir / "pointcloud_cleaned.ply").exists():
            pointcloud_files.append("pointcloud_cleaned.ply")

        # Meshes
        mesh_files = []
        mesh_dir = capture_dir / "mesh"
        if mesh_dir.exists():
            for m in mesh_dir.glob("*"):
                if m.suffix.lower() in [".glb", ".gltf", ".ply", ".obj", ".usdz"]:
                    mesh_files.append(str(m.relative_to(capture_dir)))

        # Splats
        splat_files = []
        splat_dir = capture_dir / "splats"
        if splat_dir.exists():
            for s in splat_dir.glob("*"):
                if s.suffix.lower() in [".splat", ".ply", ".ksplat", ".spz"]:
                    splat_files.append(str(s.relative_to(capture_dir)))

        # Formatted created date
        created = meta.get("created")
        if not created:
            created = datetime.fromtimestamp(capture_dir.stat().st_ctime).isoformat()

        name = meta.get("name") or capture_dir.name

        return {
            "id": capture_dir.name,
            "name": name,
            "device": meta.get("device", "iPhone LiDAR"),
            "app_version": meta.get("app_version", "1.0"),
            "created": created,
            "frame_count": frames_count,
            "has_depth": has_depth,
            "has_pointcloud": len(pointcloud_files) > 0,
            "has_mesh": len(mesh_files) > 0,
            "has_splats": len(splat_files) > 0,
            "pointclouds": pointcloud_files,
            "meshes": mesh_files,
            "splats": splat_files,
            "has_thumbnail": thumb_path.exists(),
            "camera_info": camera_info,
            "size_bytes": sum(f.stat().st_size for f in capture_dir.rglob('*') if f.is_file()),
        }

    def import_zip(self, zip_path: str | Path, name_override: Optional[str] = None) -> str:
        """
        Unpacks a .lidarscan.zip into captures/.
        Handles both zip containing a root folder or zip containing items directly.
        Returns the capture ID.
        """
        zip_path = Path(zip_path)
        base_name = name_override or zip_path.name
        if base_name.endswith(".lidarscan.zip"):
            base_name = base_name[:-14]
        elif base_name.endswith(".zip"):
            base_name = base_name[:-4]

        # Sanitize name
        clean_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_", " ")).strip()
        if not clean_name:
            clean_name = f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        dest_dir = self.root_dir / clean_name
        counter = 1
        while dest_dir.exists():
            dest_dir = self.root_dir / f"{clean_name}_{counter}"
            counter += 1

        dest_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as z:
            # Check if all files share a common root directory
            namelist = z.namelist()
            root_names = set(p.split("/")[0] for p in namelist if "/" in p)
            if len(root_names) == 1 and all(p.startswith(list(root_names)[0] + "/") for p in namelist if p != list(root_names)[0]):
                common_prefix = list(root_names)[0] + "/"
                for member in z.infolist():
                    if member.filename.startswith(common_prefix):
                        rel_path = member.filename[len(common_prefix):]
                        if not rel_path:
                            continue
                        target = dest_dir / rel_path
                        if member.is_dir():
                            target.mkdir(parents=True, exist_ok=True)
                        else:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            with z.open(member) as source, open(target, "wb") as target_file:
                                shutil.copyfileobj(source, target_file)
            else:
                z.extractall(dest_dir)

        # Ensure metadata.json exists
        meta_file = dest_dir / "metadata.json"
        if not meta_file.exists():
            initial_meta = {
                "format": "lidarscan",
                "version": 1,
                "name": clean_name,
                "created": datetime.now().isoformat(),
            }
            with open(meta_file, "w") as f:
                json.dump(initial_meta, f, indent=2)

        return dest_dir.name

    def import_splat_file(self, capture_id: str, splat_file_path: str | Path, filename: str) -> str:
        """Imports an external .splat or .ply file into the capture's splats/ directory."""
        capture_dir = self.get_capture_path(capture_id)
        if not capture_dir.exists():
            raise FileNotFoundError(f"Capture {capture_id} not found")

        splat_dir = capture_dir / "splats"
        splat_dir.mkdir(parents=True, exist_ok=True)

        dest = splat_dir / filename
        shutil.copy2(splat_file_path, dest)
        return str(dest.relative_to(capture_dir))

    def export_zip(self, capture_id: str, output_path: str | Path) -> Path:
        """Exports a capture directory as a .lidarscan.zip bundle."""
        capture_dir = self.get_capture_path(capture_id)
        if not capture_dir.exists():
            raise FileNotFoundError(f"Capture {capture_id} not found")

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
            for item in capture_dir.rglob("*"):
                if item.is_file() and not item.name.endswith(".zip"):
                    arcname = f"{capture_id}/{item.relative_to(capture_dir)}"
                    z.write(item, arcname)

        return output_path

    def delete_capture(self, capture_id: str) -> bool:
        capture_dir = self.get_capture_path(capture_id)
        if capture_dir.exists() and capture_dir.is_dir():
            shutil.rmtree(capture_dir)
            return True
        return False
