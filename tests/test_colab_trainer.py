import asyncio
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from server.splat_trainer import check_colab_cli_auth, run_colab_cli_training


def test_check_colab_cli_auth_success():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        status = check_colab_cli_auth()
        assert status["available"] is True
        assert status["authenticated"] is True


def test_check_colab_cli_auth_not_logged_in():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Error: Not authenticated. Please login.")
        status = check_colab_cli_auth()
        assert status["available"] is True
        assert status["authenticated"] is False


@pytest.mark.asyncio
async def test_run_colab_training_exec_uses_file_flag_and_timeout():
    """Verifies that colab exec is invoked with -f <file> and --timeout (not positional script)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        capture_dir = Path(tmpdir) / "test_capture"
        capture_dir.mkdir()
        (capture_dir / "metadata.json").write_text('{"format":"lidarscan"}')

        executed_commands = []

        def mock_subprocess_run(cmd, *args, **kwargs):
            executed_commands.append(cmd)
            mock_res = MagicMock()
            mock_res.returncode = 0
            mock_res.stdout = "[colab] OK"
            mock_res.stderr = ""

            # When download is called, create a fake PLY
            if "download" in cmd:
                splat_dir = capture_dir / "splats"
                splat_dir.mkdir(parents=True, exist_ok=True)
                fake_ply = splat_dir / "trained_splat.ply"
                # Write minimal PLY header
                fake_ply.write_text("ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n")

            return mock_res

        mock_proc = AsyncMock()
        mock_proc.stdout.readline = AsyncMock(side_effect=[b"[Colab T4] Training completed successfully!\n", b""])
        mock_proc.wait = AsyncMock(return_value=0)

        with patch("subprocess.run", side_effect=mock_subprocess_run), \
             patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec, \
             patch("server.splat_trainer.convert_ply_to_splat", return_value=1000):

            logs = []
            progress = []
            result = await run_colab_cli_training(
                capture_dir=capture_dir,
                total_steps=500,
                log_callback=lambda msg: logs.append(msg),
                progress_callback=lambda p, s: progress.append((p, s)),
            )

            assert result["num_splats"] == 1000

            # Verify colab exec command structure
            mock_exec.assert_called_once()
            exec_args = mock_exec.call_args[0]
            assert "exec" in exec_args
            assert "-f" in exec_args
            f_idx = exec_args.index("-f")
            script_path = exec_args[f_idx + 1]
            assert script_path.endswith("_colab_train_job.py")
            assert "--timeout" in exec_args
            timeout_idx = exec_args.index("--timeout")
            assert exec_args[timeout_idx + 1] == "1800"

            # Verify session was stopped in finally
            stop_commands = [c for c in executed_commands if "stop" in c]
            assert len(stop_commands) >= 1

            # Verify temporary files were cleaned up
            assert not (capture_dir / "capture_for_colab.zip").exists()
            assert not Path(script_path).exists()


@pytest.mark.asyncio
async def test_run_colab_training_cleans_up_on_failure():
    """Verifies that colab stop and temp files are cleaned up even if execution fails."""
    with tempfile.TemporaryDirectory() as tmpdir:
        capture_dir = Path(tmpdir) / "test_capture"
        capture_dir.mkdir()
        (capture_dir / "metadata.json").write_text('{"format":"lidarscan"}')

        executed_commands = []

        def mock_subprocess_run(cmd, *args, **kwargs):
            executed_commands.append(cmd)
            mock_res = MagicMock()
            if "new" in cmd:
                mock_res.returncode = 0
                mock_res.stdout = "Created"
                mock_res.stderr = ""
            elif "upload" in cmd:
                mock_res.returncode = 1
                mock_res.stdout = ""
                mock_res.stderr = "Upload network error"
            return mock_res

        with patch("subprocess.run", side_effect=mock_subprocess_run):
            with pytest.raises(RuntimeError) as exc_info:
                await run_colab_cli_training(capture_dir=capture_dir)

            assert "Colab upload failed" in str(exc_info.value)

            # Ensure colab stop was called in finally
            stop_commands = [c for c in executed_commands if "stop" in c]
            assert len(stop_commands) >= 1
