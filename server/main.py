import asyncio
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .capture_manager import CaptureManager
from .jobs import JobManager
from .mdns import LidarScanAdvertiser
from .net_utils import get_lan_ip
from .reconstruction import run_poisson_reconstruction, run_pointcloud_cleanup, run_tsdf_fusion
from .splat_trainer import check_colab_cli_auth, run_brush_training, run_colab_cli_training

PORT = 8765
BASE_DIR = Path(__file__).resolve().parent.parent
CAPTURES_DIR = BASE_DIR / "captures"
DIST_DIR = BASE_DIR / "dist"

capture_manager = CaptureManager(CAPTURES_DIR)
job_manager = JobManager()
mdns_advertiser = LidarScanAdvertiser(PORT)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: advertise via Bonjour/mDNS
    mdns_advertiser.start()
    yield
    # Shutdown: stop mDNS advertisement
    mdns_advertiser.stop()

app = FastAPI(
    title="LidarScan Studio",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local dev / mobile requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for job requests
class TsdfRequest(BaseModel):
    voxel_length: float = 0.025
    sdf_trunc: float = 0.08
    max_depth: float = 3.5

class PoissonRequest(BaseModel):
    depth: int = 9
    quantile: float = 0.05

class CleanPcdRequest(BaseModel):
    voxel_size: float = 0.01
    nb_neighbors: int = 20
    std_ratio: float = 2.0

class TrainBrushRequest(BaseModel):
    total_steps: int = 5000
    max_splats: int = 500000
    max_resolution: int = 960

class TrainColabRequest(BaseModel):
    total_steps: int = 7000


# ---------------- CONTRACT REQUIRED ENDPOINTS ----------------

@app.get("/api/ping")
async def ping():
    """Shared format contract ping endpoint."""
    return {"name": "LidarScan Studio", "version": 1}

@app.post("/api/upload")
async def upload_capture(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
):
    """
    Shared format contract upload endpoint.
    Receives .lidarscan.zip multipart upload from phone or web.
    """
    if not file.filename.lower().endswith((".zip", ".lidarscan.zip")):
        raise HTTPException(status_code=400, detail="Only .zip or .lidarscan.zip files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)
        finally:
            file.file.close()

    try:
        capture_id = capture_manager.import_zip(tmp_path, name_override=name or file.filename)
        return {"ok": True, "id": capture_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unpack capture: {e}")
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

# ---------------- STATUS & SYSTEM INFO ----------------

@app.get("/api/status")
async def system_status():
    lan_ip = get_lan_ip()
    colab_info = check_colab_cli_auth()
    return {
        "name": "LidarScan Studio",
        "version": 1,
        "port": PORT,
        "lan_ip": lan_ip,
        "lan_url": f"http://{lan_ip}:{PORT}",
        "colab_cli": colab_info,
        "captures_count": len(capture_manager.list_captures()),
        "active_jobs": len([j for j in job_manager.jobs.values() if j.status in ("queued", "running")]),
    }

# ---------------- CAPTURE MANAGEMENT ----------------

@app.get("/api/captures")
async def list_captures():
    return capture_manager.list_captures()

@app.get("/api/captures/{capture_id}")
async def get_capture(capture_id: str):
    info = capture_manager.get_capture_info(capture_id)
    if not info:
        raise HTTPException(status_code=404, detail="Capture not found")
    return info

@app.delete("/api/captures/{capture_id}")
async def delete_capture(capture_id: str):
    success = capture_manager.delete_capture(capture_id)
    if not success:
        raise HTTPException(status_code=404, detail="Capture not found")
    return {"ok": True}

@app.get("/api/captures/{capture_id}/export")
async def export_capture(capture_id: str):
    info = capture_manager.get_capture_info(capture_id)
    if not info:
        raise HTTPException(status_code=404, detail="Capture not found")

    tmp_export = Path(tempfile.gettempdir()) / f"{capture_id}.lidarscan.zip"
    capture_manager.export_zip(capture_id, tmp_export)
    return FileResponse(
        str(tmp_export),
        media_type="application/zip",
        filename=f"{capture_id}.lidarscan.zip",
    )

@app.post("/api/captures/{capture_id}/import-splat")
async def import_splat(capture_id: str, file: UploadFile = File(...)):
    """Allows importing an external .splat or .ply (e.g., downloaded from Google Colab)."""
    info = capture_manager.get_capture_info(capture_id)
    if not info:
        raise HTTPException(status_code=404, detail="Capture not found")

    if not file.filename.lower().endswith((".splat", ".ply", ".ksplat", ".spz")):
        raise HTTPException(status_code=400, detail="Expected .splat, .ply, .ksplat, or .spz")

    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)
        finally:
            file.file.close()

    try:
        rel = capture_manager.import_splat_file(capture_id, tmp_path, file.filename)
        return {"ok": True, "file": rel}
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

# ---------------- JOBS & PROCESSING ----------------

@app.get("/api/jobs")
async def list_jobs(capture_id: Optional[str] = None):
    return job_manager.list_jobs(capture_id)

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_dict()

@app.get("/api/jobs/{job_id}/logs")
async def get_job_logs(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"logs": job.logs}

# TSDF Reconstruction
@app.post("/api/captures/{capture_id}/tsdf")
async def start_tsdf(capture_id: str, req: TsdfRequest, background_tasks: BackgroundTasks):
    path = capture_manager.get_capture_path(capture_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")

    job = job_manager.create_job("tsdf", capture_id, f"TSDF Fusion ({capture_id})")

    async def _run(progress_callback, log_callback):
        # Run synchronous Open3D in threadpool
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: run_tsdf_fusion(
                path,
                voxel_length=req.voxel_length,
                sdf_trunc=req.sdf_trunc,
                max_depth=req.max_depth,
                progress_callback=progress_callback,
            ),
        )

    background_tasks.add_task(job_manager.execute_job, job, _run)
    return {"ok": True, "job_id": job.id}

# Poisson Reconstruction
@app.post("/api/captures/{capture_id}/poisson")
async def start_poisson(capture_id: str, req: PoissonRequest, background_tasks: BackgroundTasks):
    path = capture_manager.get_capture_path(capture_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")

    job = job_manager.create_job("poisson", capture_id, f"Poisson Reconstruction ({capture_id})")

    async def _run(progress_callback, log_callback):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: run_poisson_reconstruction(
                path,
                depth=req.depth,
                quantile=req.quantile,
                progress_callback=progress_callback,
            ),
        )

    background_tasks.add_task(job_manager.execute_job, job, _run)
    return {"ok": True, "job_id": job.id}

# Clean Pointcloud
@app.post("/api/captures/{capture_id}/clean-pcd")
async def start_clean_pcd(capture_id: str, req: CleanPcdRequest, background_tasks: BackgroundTasks):
    path = capture_manager.get_capture_path(capture_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")

    job = job_manager.create_job("clean_pcd", capture_id, f"Clean Point Cloud ({capture_id})")

    async def _run(progress_callback, log_callback):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: run_pointcloud_cleanup(
                path,
                voxel_size=req.voxel_size,
                nb_neighbors=req.nb_neighbors,
                std_ratio=req.std_ratio,
                progress_callback=progress_callback,
            ),
        )

    background_tasks.add_task(job_manager.execute_job, job, _run)
    return {"ok": True, "job_id": job.id}

# Option A (Primary / Default): Colab GPU Training
@app.post("/api/captures/{capture_id}/train-splat-colab")
async def start_train_colab(capture_id: str, req: TrainColabRequest, background_tasks: BackgroundTasks):
    path = capture_manager.get_capture_path(capture_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")

    job = job_manager.create_job("train_colab", capture_id, f"Colab T4 GPU Splat Training ({capture_id})")

    async def _run(progress_callback, log_callback):
        return await run_colab_cli_training(
            path,
            total_steps=req.total_steps,
            progress_callback=progress_callback,
            log_callback=log_callback,
        )

    background_tasks.add_task(job_manager.execute_job, job, _run)
    return {"ok": True, "job_id": job.id}

# Option B (Local Fallback): Local Brush Training
@app.post("/api/captures/{capture_id}/train-splat-local")
async def start_train_local(capture_id: str, req: TrainBrushRequest, background_tasks: BackgroundTasks):
    path = capture_manager.get_capture_path(capture_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")

    job = job_manager.create_job("train_local", capture_id, f"Local Brush Splat Training ({capture_id})")

    async def _run(progress_callback, log_callback):
        return await run_brush_training(
            path,
            total_steps=req.total_steps,
            max_splats=req.max_splats,
            max_resolution=req.max_resolution,
            progress_callback=progress_callback,
            log_callback=log_callback,
        )

    background_tasks.add_task(job_manager.execute_job, job, _run)
    return {"ok": True, "job_id": job.id}

# Static file serving for capture contents (for 3D viewers)
app.mount("/captures", StaticFiles(directory=str(CAPTURES_DIR)), name="captures")

# Serve UI from DIST_DIR if it exists
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="dist")
else:
    @app.get("/")
    async def index_placeholder():
        return {
            "status": "LidarScan Studio Backend Running",
            "lan_ip": get_lan_ip(),
            "port": PORT,
            "dist": "Frontend not built yet. Run 'npm run build' in frontend directory.",
        }
