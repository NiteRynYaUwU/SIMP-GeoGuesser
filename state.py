import math
import os
import json
import datetime
import uuid
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


# ---------------------------
# Persistence (saved rounds)
# ---------------------------

def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def round_to_dict(rd: Round) -> Dict[str, object]:
    return {
        "id": rd.id,
        "map_filename": rd.map_filename,
        "map_size": [rd.map_size[0], rd.map_size[1]],
        "scene_filename": rd.scene_filename,
        "answer_xy": [rd.answer_xy[0], rd.answer_xy[1]] if rd.answer_xy else None,
        "guesses": {p: [xy[0], xy[1]] for p, xy in (rd.guesses or {}).items()},
    }


def round_from_dict(obj: Dict[str, object]) -> Round:
    map_size_raw = obj.get("map_size")
    if isinstance(map_size_raw, (list, tuple)) and len(map_size_raw) == 2:
        mx, my = map_size_raw
    else:
        mx, my = 0, 0
    rd = Round(
        id=str(obj.get("id") or ""),
        map_filename=str(obj.get("map_filename") or ""),
        map_size=(int(mx), int(my)),
    )
    scene = obj.get("scene_filename")
    rd.scene_filename = scene or None if isinstance(scene, str) else None

    ans = obj.get("answer_xy")
    if ans and isinstance(ans, (list, tuple)) and len(ans) == 2:
        rd.answer_xy = (int(ans[0]), int(ans[1]))

    guesses = obj.get("guesses") or {}
    if isinstance(guesses, dict):
        for p, xy in guesses.items():
            if isinstance(xy, (list, tuple)) and len(xy) == 2:
                rd.guesses[str(p)] = (int(xy[0]), int(xy[1]))
    return rd


def _next_saved_version_for_round(round_num: int) -> int:
    """Return next version number (1-based) for a given round number."""
    os.makedirs(SAVE_DIR, exist_ok=True)
    max_ver = 0
    for fn in os.listdir(SAVE_DIR):
        if not fn.lower().endswith(".json"):
            continue
        path = os.path.join(SAVE_DIR, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                obj = json.load(f)
        except Exception:
            continue
        if obj.get("type") != "round":
            continue
        if int(obj.get("round_num") or 0) != int(round_num):
            continue
        try:
            v = int(obj.get("round_ver") or 0)
        except Exception:
            v = 0
        if v > max_ver:
            max_ver = v
    return max_ver + 1


def save_round_snapshot(round_id: str, name: Optional[str] = None) -> str:
    """
    Save a *single* round (plus the current players list) to disk.
    Returns the save_id.
    """
    rd = get_round(round_id)
    save_id = uuid.uuid4().hex

    # Determine which round number this is (1-based) and allocate a version.
    round_num = (STATE.rounds.index(rd) + 1) if rd in STATE.rounds else 0
    round_ver = _next_saved_version_for_round(round_num) if round_num else 1

    # Display name: keep it simple and consistent so duplicates are distinguishable.
    safe_name = f"Round {round_num} Ver {round_ver}" if round_num else (name or "Saved Round").strip()

    payload = {
        "version": 1,
        "type": "round",
        "save_id": save_id,
        "name": safe_name,
        "round_num": round_num,
        "round_ver": round_ver,
        "saved_at": _now_iso(),
        "players": list(STATE.players),
        "round": round_to_dict(rd),
    }

    os.makedirs(SAVE_DIR, exist_ok=True)
    path = os.path.join(SAVE_DIR, f"{save_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return save_id


def list_saved_rounds() -> List[Dict[str, object]]:
    os.makedirs(SAVE_DIR, exist_ok=True)
    items: List[Dict[str, object]] = []
    for fn in sorted(os.listdir(SAVE_DIR)):
        if not fn.lower().endswith(".json"):
            continue
        path = os.path.join(SAVE_DIR, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                obj = json.load(f)
        except Exception:
            continue

        if obj.get("type") != "round":
            continue

        rn = obj.get("round_num")
        rv = obj.get("round_ver")
        try:
            rn_i = int(rn) if rn is not None else 0
        except Exception:
            rn_i = 0
        try:
            rv_i = int(rv) if rv is not None else 0
        except Exception:
            rv_i = 0

        display_name = obj.get("name") or os.path.splitext(fn)[0]
        if rn_i > 0 and rv_i > 0:
            display_name = f"Round {rn_i} Ver {rv_i}"

        rd = obj.get("round") or {}
        guesses = rd.get("guesses") or {}
        items.append(
            {
                "save_id": obj.get("save_id") or os.path.splitext(fn)[0],
                "name": obj.get("name") or os.path.splitext(fn)[0],
                "display_name": display_name,
                "round_num": rn_i,
                "round_ver": rv_i,
                "saved_at": obj.get("saved_at") or "",
                "map_filename": rd.get("map_filename") or "",
                "scene_filename": rd.get("scene_filename") or "",
                "has_answer": bool(rd.get("answer_xy")),
                "players_count": len(obj.get("players") or []),
                "guesses_count": len(guesses) if isinstance(guesses, dict) else 0,
            }
        )

    # newest first where possible
    items.sort(key=lambda i: i.get("saved_at") or "", reverse=True)
    return items


def delete_saved_round(save_id: str) -> None:
    path = os.path.join(SAVE_DIR, f"{save_id}.json")
    if os.path.isfile(path):
        os.remove(path)


def load_saved_round(save_id: str) -> Round:
    """
    Load a saved round from disk and *append* it to the current game.
    - merges players (union, preserving existing order)
    - validates that referenced images still exist
    Returns the appended Round.
    """
    path = os.path.join(SAVE_DIR, f"{save_id}.json")
    if not os.path.isfile(path):
        abort(404)

    with open(path, "r", encoding="utf-8") as f:
        obj = json.load(f)

    if obj.get("type") != "round":
        raise ValueError(
            'The selected save file is corrupted or has an invalid format (missing or incorrect "type": "round" metadata).'
        )

    saved_players = obj.get("players") or []
    for p in saved_players:
        if isinstance(p, str) and not player_exists(p):
            STATE.players.append(p)

    rd_obj = obj.get("round") or {}
    rd = round_from_dict(rd_obj)

    # validate images
    map_path = os.path.join(UPLOAD_DIR, "maps", os.path.basename(rd.map_filename))
    if not ext_ok(rd.map_filename) or not os.path.isfile(map_path):
        raise ValueError(f"Saved map file is missing: {rd.map_filename}")
    rd.map_filename = os.path.basename(rd.map_filename)
    rd.map_size = get_image_size(map_path)

    if not rd.scene_filename:
        raise ValueError("Saved round has no scene image.")
    scene_path = os.path.join(UPLOAD_DIR, "scenes", os.path.basename(rd.scene_filename))
    if not ext_ok(rd.scene_filename) or not os.path.isfile(scene_path):
        raise ValueError(f"Saved scene file is missing: {rd.scene_filename}")
    rd.scene_filename = os.path.basename(rd.scene_filename)

    # always give a fresh runtime round id so links don't collide
    rd.id = uuid.uuid4().hex

    STATE.rounds.append(rd)
    STATE.current_round_index = len(STATE.rounds) - 1
    return rd
