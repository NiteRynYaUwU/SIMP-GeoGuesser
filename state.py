import math
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from flask import abort
from PIL import Image

from config import ALLOWED_EXT, UPLOAD_DIR

IMAGE_SIZE_CACHE: Dict[str, Tuple[float, Tuple[int, int]]] = {}


@dataclass
class Round:
    id: str
    map_filename: str
    map_size: Tuple[int, int]  # (w,h) in pixels
    # Optional "scene" image shown to players for this round (does not affect scoring).
    scene_filename: Optional[str] = None
    answer_xy: Optional[Tuple[int, int]] = None
    guesses: Dict[str, Tuple[int, int]] = field(default_factory=dict)


@dataclass
class GameState:
    players: List[str] = field(default_factory=list)
    rounds: List[Round] = field(default_factory=list)
    current_round_index: int = 0


STATE = GameState()


def ext_ok(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXT


def get_image_size(path: str) -> Tuple[int, int]:
    stat = os.stat(path)
    cache = IMAGE_SIZE_CACHE.get(path)
    if cache and cache[0] == stat.st_mtime:
        return cache[1]

    with Image.open(path) as im:
        size = im.size

    IMAGE_SIZE_CACHE[path] = (stat.st_mtime, size)
    return size


def list_image_library(subfolder) -> List[Dict[str, object]]:
    items: List[Dict[str, object]] = []
    image_library_path = os.path.join(UPLOAD_DIR, subfolder)
    if not os.path.isdir(image_library_path):
        return items

    for name in sorted(os.listdir(image_library_path)):
        if not ext_ok(name):
            continue
        path = os.path.join(image_library_path, name)
        if not os.path.isfile(path):
            continue
        try:
            size = get_image_size(path)
        except Exception:
            continue
        items.append({"filename": name, "size": size})
    return items


def list_map_library() -> List[Dict[str, object]]:
    return list_image_library("maps")


def list_scene_library():
    return list_image_library("scenes")


def normalize_player_name(name: str) -> str:
    return (name or "").strip().casefold()


def player_exists(name: str) -> bool:
    n = normalize_player_name(name)
    return any(normalize_player_name(p) == n for p in STATE.players)


def save_upload(file_storage, sub_folder) -> str:
    if not file_storage or file_storage.filename == "":
        raise ValueError("No file selected.")
    if not ext_ok(file_storage.filename):
        raise ValueError("Unsupported file type. Use png/jpg/jpeg/webp.")
    base = os.path.basename(file_storage.filename)
    stem, ext = os.path.splitext(base)
    ext = ext.lower()

    sanitized_chars = []
    for ch in stem:
        if ch.isalnum() or ch in {"-", "_"}:
            sanitized_chars.append(ch)
        elif ch.isspace():
            sanitized_chars.append("_")
        else:
            sanitized_chars.append("_")
    cleaned_stem = "".join(sanitized_chars).strip()
    if not cleaned_stem:
        cleaned_stem = "upload"

    candidate = f"{cleaned_stem}{ext}"
    counter = 1
    while os.path.exists(os.path.join(UPLOAD_DIR, sub_folder, candidate)):
        candidate = f"{cleaned_stem}({counter}){ext}"
        counter += 1

    path = os.path.join(UPLOAD_DIR, sub_folder, candidate)
    file_storage.save(path)
    return candidate


def save_scene_upload(file_storage) -> str:
    return save_upload(file_storage, "scenes")


def save_map_upload(file_storage) -> str:
    return save_upload(file_storage, "maps")


def pixel_distance(a: Tuple[int, int], b: Tuple[int, int]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def score_from_distance(d: float, map_size: Tuple[int, int]) -> int:
    w, h = map_size
    diag = math.hypot(w, h)
    scale = max(1.0, diag / 2.0)
    raw = 1000.0 * math.exp(-d / scale)
    return max(1, int(round(raw)))


def get_round(round_id: str) -> Round:
    rd = next((x for x in STATE.rounds if x.id == round_id), None)
    if not rd:
        abort(404)
    return rd


def current_round() -> Optional[Round]:
    if not STATE.rounds:
        return None
    idx = min(max(STATE.current_round_index, 0), len(STATE.rounds) - 1)
    return STATE.rounds[idx]


def setup_upload_dirs():
    for sub in ["maps", "scenes"]:
        path = os.path.join(UPLOAD_DIR, sub)
        os.makedirs(path, exist_ok=True)
