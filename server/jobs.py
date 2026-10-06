import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("lidarscan.jobs")

class Job:
    def __init__(self, job_type: str, capture_id: str, name: str):
        self.id = str(uuid.uuid4())[:8]
        self.job_type = job_type
        self.capture_id = capture_id
        self.name = name
        self.status = "queued"  # queued, running, completed, failed
        self.progress = 0.0
        self.status_message = "Job queued..."
        self.logs: List[str] = []
        self.created_at = datetime.now().isoformat()
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.error: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None

    def add_log(self, text: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append(f"[{timestamp}] {text}")
        if len(self.logs) > 5000:
            self.logs = self.logs[-5000:]

    def set_progress(self, progress: float, message: str):
        self.progress = max(0.0, min(1.0, progress))
        self.status_message = message
        self.add_log(f"Progress {int(self.progress * 100)}%: {message}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.job_type,
            "capture_id": self.capture_id,
            "name": self.name,
            "status": self.status,
            "progress": round(self.progress, 3),
            "status_message": self.status_message,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "result": self.result,
            "log_count": len(self.logs),
        }


class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self._lock = asyncio.Lock()

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    def list_jobs(self, capture_id: Optional[str] = None) -> List[Dict[str, Any]]:
        jobs = list(self.jobs.values())
        if capture_id:
            jobs = [j for j in jobs if j.capture_id == capture_id]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return [j.to_dict() for j in jobs]

    def create_job(self, job_type: str, capture_id: str, name: str) -> Job:
        job = Job(job_type, capture_id, name)
        self.jobs[job.id] = job
        return job

    async def execute_job(self, job: Job, coro_fn: Callable[..., Any], *args, **kwargs):
        job.status = "running"
        job.started_at = datetime.now().isoformat()
        job.add_log(f"Starting job {job.name} ({job.id})")

        def progress_cb(prog: float, msg: str):
            job.set_progress(prog, msg)

        def log_cb(line: str):
            job.add_log(line)

        try:
            res = await coro_fn(*args, progress_callback=progress_cb, log_callback=log_cb, **kwargs)
            job.status = "completed"
            job.progress = 1.0
            job.status_message = "Completed successfully."
            job.result = res
            job.add_log("Job completed successfully.")
        except Exception as e:
            logger.exception(f"Job {job.id} failed: {e}")
            job.status = "failed"
            job.error = str(e)
            job.status_message = f"Failed: {e}"
            job.add_log(f"ERROR: {e}")
        finally:
            job.completed_at = datetime.now().isoformat()
