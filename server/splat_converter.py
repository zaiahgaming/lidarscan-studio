import struct
import numpy as np
from pathlib import Path

SH_C0 = 0.28209479177387814

def convert_ply_to_splat(ply_path: str | Path, splat_path: str | Path) -> int:
    """
    Converts a 3D Gaussian Splat PLY file to the compact 32-byte .splat format
    compatible with web viewers like @mkkellogg/gaussian-splats-3d, antimatter15, etc.
    Returns the number of splats written.
    """
    ply_path = Path(ply_path)
    splat_path = Path(splat_path)

    with open(ply_path, "rb") as f:
        # Read header
        header_lines = []
        is_binary = False
        num_vertices = 0
        properties = []

        while True:
            line = f.readline().decode("utf-8", errors="ignore").strip()
            header_lines.append(line)
            if line.startswith("format binary_little_endian"):
                is_binary = True
            elif line.startswith("element vertex"):
                num_vertices = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                prop_type = parts[1]
                prop_name = parts[2]
                properties.append((prop_name, prop_type))
            elif line == "end_header":
                break

        if not is_binary:
            raise ValueError("Only binary_little_endian PLY is currently supported for splat conversion.")

        # Determine numpy dtype for reading vertices
        type_map = {
            "float": "<f4",
            "float32": "<f4",
            "double": "<f8",
            "uchar": "u1",
            "uint8": "u1",
            "int": "<i4",
        }
        dtype_list = [(p_name, type_map.get(p_type, "<f4")) for p_name, p_type in properties]
        vertex_dtype = np.dtype(dtype_list)

        # Read vertex data
        data = np.fromfile(f, dtype=vertex_dtype, count=num_vertices)

    # Extract positions
    pos_x = data["x"].astype(np.float32)
    pos_y = data["y"].astype(np.float32)
    pos_z = data["z"].astype(np.float32)

    # Extract scales (stored as log scale in 3DGS)
    scale_0 = np.exp(data["scale_0"].astype(np.float32))
    scale_1 = np.exp(data["scale_1"].astype(np.float32))
    scale_2 = np.exp(data["scale_2"].astype(np.float32))

    # Extract colors and opacity
    f_dc_0 = data["f_dc_0"].astype(np.float32)
    f_dc_1 = data["f_dc_1"].astype(np.float32)
    f_dc_2 = data["f_dc_2"].astype(np.float32)
    opacity_logit = data["opacity"].astype(np.float32)

    # SH to RGB: RGB = 0.5 + SH_C0 * f_dc
    rgb_r = np.clip((0.5 + SH_C0 * f_dc_0) * 255.0, 0, 255).astype(np.uint8)
    rgb_g = np.clip((0.5 + SH_C0 * f_dc_1) * 255.0, 0, 255).astype(np.uint8)
    rgb_b = np.clip((0.5 + SH_C0 * f_dc_2) * 255.0, 0, 255).astype(np.uint8)
    # Opacity sigmoid: 1 / (1 + exp(-x))
    opacity = 1.0 / (1.0 + np.exp(-opacity_logit))
    rgb_a = np.clip(opacity * 255.0, 0, 255).astype(np.uint8)

    # Extract rotation quaternions
    # Inria/Brush: rot_0 (w), rot_1 (x), rot_2 (y), rot_3 (z)
    q_w = data["rot_0"].astype(np.float32)
    q_x = data["rot_1"].astype(np.float32)
    q_y = data["rot_2"].astype(np.float32)
    q_z = data["rot_3"].astype(np.float32)

    # Normalize quaternions
    q_norm = np.sqrt(q_w**2 + q_x**2 + q_y**2 + q_z**2)
    q_norm = np.maximum(q_norm, 1e-8)
    q_w /= q_norm
    q_x /= q_norm
    q_y /= q_norm
    q_z /= q_norm

    # Quantize quaternion to uint8: (q * 128) + 128
    rot_0 = np.clip((q_w * 128.0) + 128.0, 0, 255).astype(np.uint8)
    rot_1 = np.clip((q_x * 128.0) + 128.0, 0, 255).astype(np.uint8)
    rot_2 = np.clip((q_y * 128.0) + 128.0, 0, 255).astype(np.uint8)
    rot_3 = np.clip((q_z * 128.0) + 128.0, 0, 255).astype(np.uint8)

    # Build 32-byte struct array:
    # 3 floats pos (12B), 3 floats scale (12B), 4 uint8 RGBA (4B), 4 uint8 rot (4B) = 32B
    splat_dtype = np.dtype([
        ("pos", "<f4", (3,)),
        ("scale", "<f4", (3,)),
        ("color", "u1", (4,)),
        ("rot", "u1", (4,)),
    ])

    splat_array = np.empty(num_vertices, dtype=splat_dtype)
    splat_array["pos"][:, 0] = pos_x
    splat_array["pos"][:, 1] = pos_y
    splat_array["pos"][:, 2] = pos_z

    splat_array["scale"][:, 0] = scale_0
    splat_array["scale"][:, 1] = scale_1
    splat_array["scale"][:, 2] = scale_2

    splat_array["color"][:, 0] = rgb_r
    splat_array["color"][:, 1] = rgb_g
    splat_array["color"][:, 2] = rgb_b
    splat_array["color"][:, 3] = rgb_a

    splat_array["rot"][:, 0] = rot_0
    splat_array["rot"][:, 1] = rot_1
    splat_array["rot"][:, 2] = rot_2
    splat_array["rot"][:, 3] = rot_3

    splat_path.parent.mkdir(parents=True, exist_ok=True)
    with open(splat_path, "wb") as f_out:
        splat_array.tofile(f_out)

    return num_vertices
