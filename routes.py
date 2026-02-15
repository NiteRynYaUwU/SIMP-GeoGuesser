import os
import uuid
from flask import abort, jsonify, redirect, render_template, request, send_from_directory, url_for

from config import UPLOAD_DIR
from state import (
    STATE,
    Round,
    current_round,
    ext_ok,
    get_image_size,
    get_round,
    list_map_library,
    pixel_distance,
    player_exists,
    save_upload,
    score_from_distance,
)


def register_routes(app):
    @app.route("/uploads/<path:filename>")
    def uploads(filename):
        return send_from_directory(UPLOAD_DIR, filename)

    @app.route("/api/add_player", methods=["POST"])
    def api_add_player():
        data = request.get_json(force=True, silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"ok": False, "error": "Player name cannot be empty."}), 400
        if player_exists(name):
            return jsonify({"ok": False, "error": "That player name already exists."}), 400
        STATE.players.append(name)
        return jsonify({"ok": True, "players": STATE.players, "added": name})

    @app.route("/api/guess", methods=["POST"])
    def api_guess():
        data = request.get_json(force=True, silent=True) or {}
        round_id = data.get("round_id")
        player = data.get("player")
        x = data.get("x")
        y = data.get("y")

        if not round_id or not isinstance(round_id, str):
            return jsonify({"ok": False, "error": "Missing round_id."}), 400
        rd = get_round(round_id)

        if not player or player not in STATE.players:
            return jsonify({"ok": False, "error": "Invalid player."}), 400

        if x is None or y is None:
            return jsonify({"ok": False, "error": "Missing x/y."}), 400

        try:
            x = int(x)
            y = int(y)
        except Exception:
            return jsonify({"ok": False, "error": "Invalid x/y."}), 400

        rd.guesses[player] = (x, y)
        guesses = {p: {"x": xy[0], "y": xy[1]} for p, xy in rd.guesses.items()}
        return jsonify({"ok": True, "guesses": guesses})

    @app.route("/api/round_state/<round_id>", methods=["GET"])
    def api_round_state(round_id):
        rd = get_round(round_id)
        guesses = {p: {"x": xy[0], "y": xy[1]} for p, xy in rd.guesses.items()}
        return jsonify({"ok": True, "players": STATE.players, "guesses": guesses})

    @app.route("/")
    def home():
        return redirect(url_for("host"))

    @app.route("/host", methods=["GET", "POST"])
    def host():
        msg = ""

        if request.method == "POST":
            action = request.form.get("action")

            try:
                if action == "add_player":
                    name = (request.form.get("player_name") or "").strip()
                    if not name:
                        raise ValueError("Player name cannot be empty.")
                    if player_exists(name):
                        raise ValueError("That player name already exists.")
                    STATE.players.append(name)

                elif action == "remove_player":
                    name = request.form.get("player_name")
                    if name and name in STATE.players:
                        STATE.players.remove(name)
                        for rd in STATE.rounds:
                            rd.guesses.pop(name, None)

                elif action == "add_round":
                    existing_map = (request.form.get(
                        "existing_map") or "").strip()

                    if existing_map:
                        candidate = os.path.basename(existing_map)
                        path = os.path.join(UPLOAD_DIR, candidate)
                        if not ext_ok(candidate) or not os.path.isfile(path):
                            raise ValueError(
                                "Selected map is not available anymore.")
                        filename = candidate
                        try:
                            w, h = get_image_size(path)
                        except Exception:
                            raise ValueError(
                                "The selected image file appears to be corrupted or invalid.")
                    else:
                        map_file = request.files.get("map_image")
                        filename = save_upload(map_file)
                        path = os.path.join(UPLOAD_DIR, filename)
                        try:
                            w, h = get_image_size(path)
                        except Exception:
                            raise ValueError(
                                "The selected image file appears to be corrupted or invalid.")

                    rd = Round(id=uuid.uuid4().hex,
                               map_filename=filename, map_size=(w, h))

                    # Optional scene image (the photo/scene players see).
                    scene_file = request.files.get("scene_image")
                    if scene_file and scene_file.filename:
                        scene_filename = save_upload(scene_file)
                        scene_path = os.path.join(UPLOAD_DIR, scene_filename)
                        try:
                            get_image_size(scene_path)
                        except Exception:
                            os.remove(scene_path)
                            raise ValueError(
                                "The selected scene image file appears to be corrupted or invalid.")
                        rd.scene_filename = scene_filename
                    STATE.rounds.append(rd)
                    STATE.current_round_index = len(STATE.rounds) - 1

                elif action == "set_scene":
                    rid = (request.form.get("round_id") or "").strip()
                    if not rid:
                        raise ValueError("Missing round id.")
                    rd = get_round(rid)
                    scene_file = request.files.get("scene_image")
                    if not scene_file or not scene_file.filename:
                        raise ValueError("No file selected.")
                    scene_filename = save_upload(scene_file)
                    scene_path = os.path.join(UPLOAD_DIR, scene_filename)
                    try:
                        get_image_size(scene_path)
                    except Exception:
                        os.remove(scene_path)
                        raise ValueError(
                            "The selected scene image file appears to be corrupted or invalid.")
                    rd.scene_filename = scene_filename

                elif action == "reset_game":
                    STATE.players = []
                    STATE.rounds = []
                    STATE.current_round_index = 0

                elif action == "goto_round":
                    idx = int(request.form.get("round_index") or "-1")
                    if idx < 0 or idx >= len(STATE.rounds):
                        raise ValueError("Invalid round index.")
                    STATE.current_round_index = idx

                else:
                    raise ValueError("Unknown action.")

                return redirect(url_for("host"), code=303)

            except Exception as e:
                msg = str(e)

        current = current_round()
        map_library = list_map_library()

        return render_template(
            "host.html",
            msg=msg,
            players=STATE.players,
            rounds=STATE.rounds,
            current=current,
            round_index=STATE.current_round_index,
            map_library=map_library,
        )

    @app.route("/set_answer/<round_id>", methods=["GET", "POST"])
    def set_answer(round_id):
        rd = get_round(round_id)
        round_num = STATE.rounds.index(rd) + 1

        if request.method == "POST":
            xv = request.form.get("x", "")
            yv = request.form.get("y", "")
            if xv == "" or yv == "":
                return render_template("set_answer.html", map_fn=rd.map_filename, error="You should select a point on the map before saving.")
            x = int(request.form["x"])
            y = int(request.form["y"])
            rd.answer_xy = (x, y)

            if request.headers.get("X-Requested-With") == "fetch":
                return jsonify({"ok": True, "answer": {"x": x, "y": y}})

            return redirect(url_for("host"))

        return render_template("set_answer.html", map_fn=rd.map_filename, round_num=round_num)

    @app.route("/play/<round_id>")
    def play_round(round_id):
        rd = get_round(round_id)

        try:
            idx = STATE.rounds.index(rd)
        except ValueError:
            abort(404)

        total = len(STATE.rounds)
        round_num = idx + 1

        prev_round_id = STATE.rounds[idx - 1].id if idx > 0 else None
        next_round_id = STATE.rounds[idx + 1].id if idx < total - 1 else None

        return render_template(
            "play_round.html",
            map_fn=rd.map_filename,
            scene_fn=rd.scene_filename,
            round_id=round_id,
            round_num=round_num,
            total_rounds=total,
            prev_round_id=prev_round_id,
            next_round_id=next_round_id,
            answer_set=(rd.answer_xy is not None),
        )

    @app.route("/leaderboard")
    def leaderboard():
        totals = {p: 0 for p in STATE.players}

        round_rows = []
        for i, rd in enumerate(STATE.rounds):
            if rd.answer_xy is None:
                continue

            guesses_obj = {p: {"x": xy[0], "y": xy[1]}
                           for p, xy in rd.guesses.items()}

            row = {
                "index": i + 1,
                "map": rd.map_filename,
                "answer": rd.answer_xy,
                "guesses": guesses_obj,
                "scores": {}
            }

            for p in STATE.players:
                if p in rd.guesses:
                    d = pixel_distance(rd.guesses[p], rd.answer_xy)
                    s = score_from_distance(d, rd.map_size)
                    totals[p] += s
                    row["scores"][p] = (s, int(round(d)))
                else:
                    row["scores"][p] = None

            round_rows.append(row)

        ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)

        cr = current_round()
        back_round_id = cr.id if cr else None

        return render_template(
            "leaderboard.html",
            ranked=ranked,
            rounds=round_rows,
            players=STATE.players,
            back_round_id=back_round_id,
        )

    @app.route("/r/<round_id>")
    def public_round(round_id):
        return redirect(url_for("play_round", round_id=round_id))
