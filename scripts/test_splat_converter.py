import struct
import numpy as np
import pytest
from pathlib import Path
from server.splat_converter import convert_ply_to_splat


@pytest.fixture
def output_ply(tmp_path: Path) -> Path:
    return tmp_path / "generated_splats.ply"


@pytest.fixture
def output_splat(tmp_path: Path) -> Path:
    return tmp_path / "generated_splats.splat"


def test_generate_and_convert_splat(output_ply: Path, output_splat: Path):
    num_splats = 5000
    positions = np.random.uniform(-0.8, 0.8, (num_splats, 3)).astype(np.float32)
    scales = np.random.uniform(-4.0, -2.0, (num_splats, 3)).astype(np.float32)
    f_dc = np.random.uniform(-1.0, 1.5, (num_splats, 3)).astype(np.float32)
    opacity = np.random.uniform(0.5, 3.0, (num_splats, 1)).astype(np.float32)
    rotations = np.random.uniform(-1.0, 1.0, (num_splats, 4)).astype(np.float32)
    rot_norms = np.linalg.norm(rotations, axis=1, keepdims=True)
    rotations /= rot_norms

    # Create 3DGS PLY header
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {num_splats}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property float f_dc_0\n"
        "property float f_dc_1\n"
        "property float f_dc_2\n"
        "property float opacity\n"
        "property float scale_0\n"
        "property float scale_1\n"
        "property float scale_2\n"
        "property float rot_0\n"
        "property float rot_1\n"
        "property float rot_2\n"
        "property float rot_3\n"
        "end_header\n"
    )

    output_ply.parent.mkdir(parents=True, exist_ok=True)
    with open(output_ply, "wb") as f:
        f.write(header.encode("ascii"))
        for i in range(num_splats):
            f.write(struct.pack(
                "<ffffffffffffff",
                positions[i, 0], positions[i, 1], positions[i, 2],
                f_dc[i, 0], f_dc[i, 1], f_dc[i, 2],
                opacity[i, 0],
                scales[i, 0], scales[i, 1], scales[i, 2],
                rotations[i, 0], rotations[i, 1], rotations[i, 2], rotations[i, 3],
            ))

    print(f"Generated 3DGS PLY at {output_ply} ({output_ply.stat().st_size:,} bytes)")
    count = convert_ply_to_splat(output_ply, output_splat)
    print(f"Converted to .splat at {output_splat} ({count:,} splats, {output_splat.stat().st_size:,} bytes)")
    expected_size = num_splats * 32
    assert output_splat.stat().st_size == expected_size, f"Size mismatch: {output_splat.stat().st_size} vs {expected_size}"
    print("Splat conversion test passed!")

if __name__ == "__main__":
    p_ply = Path("/home/zaiah/lidarscan-studio/test_data/Synthetic_Sculpture_Room/splats/trained_splat.ply")
    p_splat = Path("/home/zaiah/lidarscan-studio/test_data/Synthetic_Sculpture_Room/splats/trained_splat.splat")
    test_generate_and_convert_splat(p_ply, p_splat)
