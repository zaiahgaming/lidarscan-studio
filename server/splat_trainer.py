import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Callable, Optional
from .splat_converter import convert_ply_to_splat

logger = logging.getLogger("lidarscan.trainer")

def check_colab_cli_auth() -> dict:
    """Checks if google-colab-cli is installed and authenticated."""
    try:
        res = subprocess.run(
            ["colab", "sessions"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if res.returncode == 0:
            return {"available": True, "authenticated": True, "message": "Colab CLI is authenticated and ready."}
        elif "auth" in res.stderr.lower() or "login" in res.stderr.lower() or "credential" in res.stderr.lower():
            return {"available": True, "authenticated": False, "message": "Colab CLI is installed but not authenticated. Run 'colab' in terminal to log in."}
        else:
            return {"available": True, "authenticated": False, "message": res.stderr.strip() or "Not logged in"}
    except FileNotFoundError:
        # Check in venv
        venv_colab = Path(__file__).resolve().parent.parent / "venv" / "bin" / "colab"
        if venv_colab.exists():
            try:
                res = subprocess.run(
                    [str(venv_colab), "sessions"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if res.returncode == 0:
                    return {"available": True, "authenticated": True, "message": "Colab CLI is authenticated."}
                return {"available": True, "authenticated": False, "message": "Colab CLI needs login."}
            except Exception as e:
                return {"available": True, "authenticated": False, "message": str(e)}
        return {"available": False, "authenticated": False, "message": "google-colab-cli not found."}
    except Exception as e:
        return {"available": False, "authenticated": False, "message": str(e)}


async def run_brush_training(
    capture_dir: str | Path,
    total_steps: int = 5000,
    max_splats: int = 500000,
    max_resolution: int = 960,
    log_callback: Optional[Callable[[str], None]] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> dict:
    """
    Runs Brush training locally on PC (Option B: local fallback).
    """
    capture_dir = Path(capture_dir).resolve()
    brush_bin = Path(__file__).resolve().parent.parent / "bin" / "brush"
    if not brush_bin.exists():
        raise FileNotFoundError(f"Brush binary not found at {brush_bin}")

    splat_out_dir = capture_dir / "splats"
    splat_out_dir.mkdir(parents=True, exist_ok=True)

    export_name = "trained_splat.ply"
    target_ply = splat_out_dir / export_name
    if target_ply.exists():
        target_ply.unlink()

    cmd = [
        str(brush_bin),
        str(capture_dir),
        "--total-steps", str(total_steps),
        "--max-splats", str(max_splats),
        "--max-resolution", str(max_resolution),
        "--export-every", str(total_steps),
        "--export-path", str(splat_out_dir),
        "--export-name", export_name,
    ]

    if log_callback:
        log_callback(f"Starting local Brush training: {' '.join(cmd)}")

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(capture_dir),
    )

    iter_pattern = re.compile(r"iter(?:ation)?\s*[:=]?\s*(\d+)", re.IGNORECASE)
    step_pattern = re.compile(r"step\s*[:=]?\s*(\d+)", re.IGNORECASE)

    current_step = 0
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        text = line.decode("utf-8", errors="replace").strip()
        if text:
            if log_callback:
                log_callback(text)

            match = iter_pattern.search(text) or step_pattern.search(text)
            if match:
                try:
                    current_step = int(match.group(1))
                    fraction = min(current_step / max(total_steps, 1), 0.95)
                    if progress_callback:
                        progress_callback(fraction, f"Step {current_step}/{total_steps}")
                except Exception:
                    pass

    return_code = await process.wait()
    if return_code != 0:
        raise RuntimeError(f"Brush training exited with code {return_code}")

    if not target_ply.exists():
        # Search for any exported ply in splat_out_dir
        ply_files = list(splat_out_dir.glob("*.ply"))
        if ply_files:
            target_ply = sorted(ply_files, key=lambda p: p.stat().st_mtime)[-1]
        else:
            raise FileNotFoundError(f"No exported ply found in {splat_out_dir}")

    # Convert exported PLY to standard .splat
    if progress_callback:
        progress_callback(0.96, "Converting Gaussian Splat PLY to compact .splat...")
    splat_path = splat_out_dir / "trained_splat.splat"
    num_splats = convert_ply_to_splat(target_ply, splat_path)

    if progress_callback:
        progress_callback(1.0, f"Training complete! Exported {num_splats:,} splats.")

    return {
        "num_splats": num_splats,
        "ply_file": str(target_ply.relative_to(capture_dir)),
        "splat_file": str(splat_path.relative_to(capture_dir)),
    }


async def run_colab_cli_training(
    capture_dir: str | Path,
    total_steps: int = 7000,
    log_callback: Optional[Callable[[str], None]] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> dict:
    """
    Automated Google Colab GPU training via google-colab-cli (Primary / Default Option A).
    Provisions a Colab T4 GPU VM, trains with CUDA, downloads .splat and .ply, and tears down the VM.
    """
    capture_dir = Path(capture_dir).resolve()
    capture_name = capture_dir.name
    session_name = f"lidarscan-{capture_name[:12]}"

    colab_bin = "colab"
    venv_colab = Path(__file__).resolve().parent.parent / "venv" / "bin" / "colab"
    if venv_colab.exists():
        colab_bin = str(venv_colab)

    # 1. Package capture folder as a zip for upload
    if progress_callback:
        progress_callback(0.05, "Compressing capture bundle for Colab upload...")
    if log_callback:
        log_callback(f"Compressing capture {capture_dir}...")

    zip_path = capture_dir / "capture_for_colab.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in capture_dir.rglob("*"):
            if file.is_file() and not file.name.endswith(".zip") and "splats" not in file.parts:
                zipf.write(file, file.relative_to(capture_dir))

    try:
        # 2. Provision Colab T4 VM
        if progress_callback:
            progress_callback(0.15, "Requesting free Google Colab T4 GPU session...")
        if log_callback:
            log_callback(f"Running: colab new -s {session_name} --gpu T4")

        res = subprocess.run(
            [colab_bin, "new", "-s", session_name, "--gpu", "T4"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if res.returncode != 0:
            raise RuntimeError(f"Colab provisioning failed: {res.stderr or res.stdout}")
        if log_callback:
            log_callback(res.stdout)

        # 3. Upload capture zip
        if progress_callback:
            progress_callback(0.3, "Uploading capture to Colab T4 VM...")
        if log_callback:
            log_callback(f"Uploading {zip_path.name} to Colab session...")

        res = subprocess.run(
            [colab_bin, "upload", "-s", session_name, str(zip_path), "/content/capture.zip"],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if res.returncode != 0:
            raise RuntimeError(f"Colab upload failed: {res.stderr or res.stdout}")

        # 4. Execute remote splat training script
        if progress_callback:
            progress_callback(0.5, "Running CUDA Gaussian Splat training on Colab T4 GPU...")
        if log_callback:
            log_callback("Unpacking dataset and starting CUDA splat training on Colab...")

        remote_script = f"""
import os, shutil, zipfile, subprocess, urllib.request

print("Locating uploaded capture.zip...")
archive_candidates = ["capture.zip", "/content/capture.zip", os.path.expanduser("~/capture.zip")]
archive_path = next((os.path.abspath(p) for p in archive_candidates if os.path.isfile(p)), None)
if archive_path is None:
    raise FileNotFoundError("capture.zip not found; checked: " + ", ".join(archive_candidates))
os.chdir("/content")
if archive_path != "/content/capture.zip":
    shutil.copy2(archive_path, "/content/capture.zip")
dataset_path = "/content/dataset"
shutil.rmtree(dataset_path, ignore_errors=True)
os.makedirs(dataset_path, exist_ok=True)
print("Unpacking", "/content/capture.zip", "to", dataset_path)
with zipfile.ZipFile("/content/capture.zip", "r") as z:
    z.extractall(dataset_path)

print("Checking dependencies on Colab...")
subprocess.run(["apt-get", "install", "-y", "-qq", "libvulkan1"], check=False)

print("Downloading Brush release for Linux x86_64...")
brush_url = "https://github.com/ArthurBrussee/brush/releases/download/v0.3.0/brush-app-x86_64-unknown-linux-gnu.tar.xz"
urllib.request.urlretrieve(brush_url, "brush.tar.xz")
subprocess.run(["tar", "-xf", "brush.tar.xz"], check=True)
os.chmod("brush-app-x86_64-unknown-linux-gnu/brush_app", 0o755)

print("Starting splat training...")
os.makedirs("/content/splats", exist_ok=True)
cmd = [
    "brush-app-x86_64-unknown-linux-gnu/brush_app",
    "dataset",
    "--total-steps", "{total_steps}",
    "--max-splats", "600000",
    "--max-resolution", "1280",
    "--export-every", "{total_steps}",
    "--export-path", "/content/splats",
    "--export-name", "trained_splat.ply"
]
training = subprocess.run(cmd, capture_output=True, text=True)
if training.stdout:
    print(training.stdout, flush=True)
if training.stderr:
    print(training.stderr, flush=True)
if training.returncode:
    raise RuntimeError("Brush training failed with exit code " + str(training.returncode))
print("Training on Colab finished successfully!")
"""

        temp_script_path = capture_dir / "_colab_train_job.py"
        temp_script_path.write_text(remote_script, encoding="utf-8")

        exec_cmd = [
            colab_bin, "exec",
            "-s", session_name,
            "-f", str(temp_script_path),
            "--timeout", "1800",
        ]
        proc = await asyncio.create_subprocess_exec(
            *exec_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        remote_output = []
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                remote_output.append(text)
                del remote_output[:-40]
                if log_callback:
                    log_callback(f"[Colab T4] {text}")

        code = await proc.wait()
        if code != 0:
            details = "\n".join(remote_output)
            raise RuntimeError(f"Colab remote training execution failed (exit code {code}):\n{details}")

        # 5. Download trained splat
        if progress_callback:
            progress_callback(0.85, "Downloading trained splat from Colab...")
        splat_out_dir = capture_dir / "splats"
        splat_out_dir.mkdir(parents=True, exist_ok=True)
        local_ply = splat_out_dir / "trained_splat.ply"

        download_errors = []
        for remote_ply in ("splats/trained_splat.ply", "/content/splats/trained_splat.ply"):
            res = subprocess.run(
                [colab_bin, "download", "-s", session_name, remote_ply, str(local_ply)],
                capture_output=True,
                text=True,
                timeout=180,
            )
            if res.returncode == 0 and local_ply.is_file():
                break
            download_errors.append(f"{remote_ply}: {res.stderr or res.stdout or 'file not downloaded'}")
        else:
            raise RuntimeError("Colab download failed: " + " | ".join(download_errors))

        # Convert to .splat
        splat_path = splat_out_dir / "trained_splat.splat"
        num_splats = convert_ply_to_splat(local_ply, splat_path)

        if progress_callback:
            progress_callback(1.0, f"Colab training complete! Exported {num_splats:,} splats.")

        return {
            "num_splats": num_splats,
            "ply_file": str(local_ply.relative_to(capture_dir)),
            "splat_file": str(splat_path.relative_to(capture_dir)),
        }

    finally:
        # Tear down VM session
        if log_callback:
            log_callback(f"Stopping Colab session {session_name}...")
        try:
            subprocess.run([colab_bin, "stop", "-s", session_name], capture_output=True, timeout=30)
        except Exception:
            pass
        if zip_path.exists():
            zip_path.unlink()
        temp_script_path = capture_dir / "_colab_train_job.py"
        if temp_script_path.exists():
            temp_script_path.unlink()
