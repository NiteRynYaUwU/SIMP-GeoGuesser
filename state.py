import math
import os
import json
import uuid
import datetime
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from flask import abort
from PIL import Image

from config import ALLOWED_EXT, UPLOAD_DIR, SAVE_DIR

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

def _fix_mojibake_filename(name: str) -> str:
    """
    Try to recover UTF-8 filenames that were incorrectly decoded as latin-1.
    This commonly affects Chinese/Japanese filenames uploaded via browser.
    """
    if not name:
        return name

    # If it's already valid Unicode (most cases), this is harmless.
    # The recovery attempt only succeeds if it was mojibake.
    try:
        fixed = name.encode("latin-1").decode("utf-8")
        # Heuristic: if conversion produces more non-ASCII characters,
        # it's probably the intended original name.
        if sum(ord(c) > 127 for c in fixed) >= sum(ord(c) > 127 for c in name):
            return fixed
    except Exception:
        pass

    return name

def save_upload(file_storage, sub_folder) -> str:
    if not file_storage or file_storage.filename == "":
        raise ValueError("No file selected.")
    if not ext_ok(file_storage.filename):
        raise ValueError("Unsupported file type. Use png/jpg/jpeg/webp.")
    raw_name = _fix_mojibake_filename(file_storage.filename)
    base = os.path.basename(raw_name)
    stem, ext = os.path.splitext(base)
    ext = ext.lower()

    sanitized_chars = []

    for ch in stem:
    # Allow unicode letters/digits + a small safe set
    # This keeps Chinese/Japanese/Korean filenames readable.
        if ch.isalnum():
            sanitized_chars.append(ch)
        elif ch in {"-", "_", "(", ")", " ", "."}:
            sanitized_chars.append(ch)
        else:
            sanitized_chars.append("_")

    cleaned_stem = "".join(sanitized_chars).strip()

    # Windows does not like trailing dots/spaces in filenames
    cleaned_stem = cleaned_stem.strip(" .")

    # Avoid empty names
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


# -----------------------------
# Saved rounds persistence
# -----------------------------

def setup_save_dirs():
    os.makedirs(SAVE_DIR, exist_ok=True)


def _safe_int(v, default=0):
    try:
        return int(v)
    except Exception:
        return default


def _save_file_path(save_id: str) -> str:
    return os.path.join(SAVE_DIR, f"{save_id}.json")


def _make_display_name(round_num: int, ver: int) -> str:
    return f"Round {round_num} Ver {ver}"


def _next_version_for_round(round_num: int) -> int:
    # Find max ver among existing saves for this round
    max_ver = 0
    if not os.path.isdir(SAVE_DIR):
        return 1
    for name in os.listdir(SAVE_DIR):
        if not name.endswith(".json"):
            continue
        path = os.path.join(SAVE_DIR, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            rn = _safe_int(data.get("round_num"), 0)
            rv = _safe_int(data.get("round_ver"), 0)
            if rn == round_num and rv > max_ver:
                max_ver = rv
        except Exception:
            continue
    return max_ver + 1


def list_saved_rounds() -> List[Dict[str, object]]:
    items: List[Dict[str, object]] = []
    if not os.path.isdir(SAVE_DIR):
        return items

    for name in sorted(os.listdir(SAVE_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(SAVE_DIR, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        save_id = data.get("save_id") or name[:-5]
        display_name = data.get("display_name") or data.get("name")
        rd = data.get("round") or {}
        items.append({
            "save_id": save_id,
            "name": data.get("name") or save_id,
            "display_name": display_name,
            "round_num": data.get("round_num"),
            "round_ver": data.get("round_ver"),
            "map_filename": rd.get("map_filename"),
            "scene_filename": rd.get("scene_filename"),
            "saved_at": data.get("saved_at"),
        })

    # sort: round_num, round_ver, then saved_at
    def key(it):
        return (_safe_int(it.get("round_num"), 999999), _safe_int(it.get("round_ver"), 0), it.get("saved_at") or "")
    items.sort(key=key)
    return items


def save_round_snapshot(round_id: str) -> str:
    rd = get_round(round_id)
    # round number is position in STATE at save time (1-based)
    try:
        round_num = STATE.rounds.index(rd) + 1
    except ValueError:
        round_num = 0

    ver = _next_version_for_round(round_num if round_num else 0)
    display_name = _make_display_name(round_num if round_num else 0, ver)

    save_id = f"r{round_num:03d}_v{ver:03d}_{uuid.uuid4().hex[:8]}"
    payload = {
        "save_id": save_id,
        "name": display_name,
        "display_name": display_name,
        "round_num": round_num,
        "round_ver": ver,
        "saved_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "players": list(STATE.players),
        "round": {
            "id": rd.id,
            "map_filename": rd.map_filename,
            "scene_filename": rd.scene_filename,
            "map_size": [rd.map_size[0], rd.map_size[1]],
            "answer_xy": [rd.answer_xy[0], rd.answer_xy[1]] if rd.answer_xy else None,
            "guesses": {p: [xy[0], xy[1]] for p, xy in rd.guesses.items()},
        },
    }

    with open(_save_file_path(save_id), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return save_id


def _validate_saved_assets(map_filename: str, scene_filename: Optional[str]):
    if not map_filename:
        raise ValueError("Saved round is missing map filename.")
    map_path = os.path.join(UPLOAD_DIR, "maps", os.path.basename(map_filename))
    if not os.path.isfile(map_path):
        raise ValueError(f"Saved map not found: {map_filename}")

    if scene_filename:
        scene_path = os.path.join(UPLOAD_DIR, "scenes", os.path.basename(scene_filename))
        if not os.path.isfile(scene_path):
            raise ValueError(f"Saved scene not found: {scene_filename}")


def load_saved_round(save_id: str) -> Tuple[Round, List[str]]:
    path = _save_file_path(save_id)
    if not os.path.isfile(path):
        raise ValueError("Saved round not found.")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    rd_data = data.get("round") or {}
    map_filename = rd_data.get("map_filename")
    scene_filename = rd_data.get("scene_filename")
    _validate_saved_assets(map_filename, scene_filename)

    raw_map_size = rd_data.get("map_size")
    if isinstance(raw_map_size, (list, tuple)) and len(raw_map_size) >= 2:
        w = _safe_int(raw_map_size[0], 0)
        h = _safe_int(raw_map_size[1], 0)
    else:
        # invalid or missing map_size; force re-read from disk below
        w = 0
        h = 0
    if w <= 0 or h <= 0:
        # attempt to re-read size from disk
        w, h = get_image_size(os.path.join(UPLOAD_DIR, "maps", os.path.basename(map_filename)))

    answer = rd_data.get("answer_xy")
    answer_xy = (int(answer[0]), int(answer[1])) if answer else None

    guesses = {}
    for p, xy in (rd_data.get("guesses") or {}).items():
        try:
            guesses[p] = (int(xy[0]), int(xy[1]))
        except Exception:
            continue

    new_round = Round(
        id=uuid.uuid4().hex,
        map_filename=os.path.basename(map_filename),
        map_size=(w, h),
        scene_filename=os.path.basename(scene_filename) if scene_filename else None,
        answer_xy=answer_xy,
        guesses=guesses,
    )

    players = list(data.get("players") or [])
    return new_round, players


def delete_saved_round(save_id: str):
    path = _save_file_path(save_id)
    if os.path.isfile(path):
        os.remove(path)
