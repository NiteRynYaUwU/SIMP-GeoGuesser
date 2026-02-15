(() => {
  const roundId = document.body?.dataset?.roundId;
  if (!roundId) return;

  const stateKey = "lgeoparty.selectedPlayer." + roundId;

  const stage = document.getElementById("stage");
  const img = document.getElementById("mapImg");
  const overlay = document.getElementById("overlay");

  const playerSel = document.getElementById("player");
  const pinStatus = document.getElementById("pinStatus");
  const guessedPill = document.getElementById("guessedPill");

  const addPlayerForm = document.getElementById("addPlayerForm");
  const newPlayerInput = document.getElementById("newPlayer");

  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const resetBtn = document.getElementById("resetView");
  const zoomPill = document.getElementById("zoomPill");

  const toast = document.getElementById("toast");

  document.querySelector(".hud")?.addEventListener("pointerdown", (e) => e.stopPropagation());
  document.querySelector(".hud")?.addEventListener("click", (e) => e.stopPropagation());

  let players = [];
  let guesses = {};

  let baseScale = 1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function showToast(text, isError = false) {
    toast.textContent = text;
    toast.style.display = "block";
    toast.style.color = isError ? "var(--bad)" : "var(--text)";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.style.display = "none";
    }, 1400);
  }

  function clearOverlay() {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
  }

  function setOverlaySize() {
    overlay.setAttribute("width", window.innerWidth);
    overlay.setAttribute("height", window.innerHeight);
  }

  function computeBaseScale() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    baseScale = Math.min(vw / iw, vh / ih);
  }

  function currentRenderSize() {
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const s = baseScale * zoom;
    return { w: iw * s, h: ih * s, s };
  }

  function imageTopLeft() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { w, h } = currentRenderSize();
    const left = (vw - w) / 2 + panX;
    const top = (vh - h) / 2 + panY;
    return { left, top };
  }

  function layoutImage() {
    if (!img.naturalWidth) return;
    computeBaseScale();
    const { w, h } = currentRenderSize();
    const { left, top } = imageTopLeft();
    img.style.width = w + "px";
    img.style.height = h + "px";
    img.style.left = left + "px";
    img.style.top = top + "px";
    zoomPill.textContent = Math.round(zoom * 100) + "%";
    setOverlaySize();
    refreshPin();
  }

  function screenToImageCoords(clientX, clientY) {
    const { left, top } = imageTopLeft();
    const { s } = currentRenderSize();
    return { x: (clientX - left) / s, y: (clientY - top) / s };
  }

  function imageToScreenCoords(x, y) {
    const { left, top } = imageTopLeft();
    const { s } = currentRenderSize();
    return { sx: left + x * s, sy: top + y * s };
  }

  function drawPinForPlayer(player) {
    clearOverlay();
    const g = guesses[player];
    if (!g) {
      pinStatus.textContent = "Pin: —";
      return;
    }
    pinStatus.textContent = "Pin: shown";
    const p = imageToScreenCoords(g.x, g.y);

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const outer = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    outer.setAttribute("cx", p.sx);
    outer.setAttribute("cy", p.sy);
    outer.setAttribute("r", 11);
    outer.setAttribute("fill", "rgba(255,255,255,0.95)");
    outer.setAttribute("stroke", "rgba(16,24,40,0.25)");
    outer.setAttribute("stroke-width", 2);

    const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    inner.setAttribute("cx", p.sx);
    inner.setAttribute("cy", p.sy);
    inner.setAttribute("r", 4);
    inner.setAttribute("fill", "rgba(37,99,235,0.98)");
    inner.setAttribute("stroke", "rgba(16,24,40,0.18)");
    inner.setAttribute("stroke-width", 1);

    const tail = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = `M ${p.sx} ${p.sy + 11} L ${p.sx - 6} ${p.sy + 25} L ${p.sx + 6} ${p.sy + 25} Z`;
    tail.setAttribute("d", d);
    tail.setAttribute("fill", "rgba(255,255,255,0.95)");
    tail.setAttribute("stroke", "rgba(16,24,40,0.25)");
    tail.setAttribute("stroke-width", 2);

    group.appendChild(tail);
    group.appendChild(outer);
    group.appendChild(inner);
    overlay.appendChild(group);
  }

  function refreshPin() {
    drawPinForPlayer(playerSel.value);
  }

  function computeGuessStats() {
    const guessedCount = Object.keys(guesses).length;
    guessedPill.textContent = `Guessed: ${guessedCount} / ${players.length}`;
  }

  function rebuildPlayerDropdown(keepSelection) {
    const prev = keepSelection ?? playerSel.value ?? "";
    playerSel.innerHTML = "";
    for (const p of players) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p + (guesses[p] ? " ✅" : "");
      playerSel.appendChild(opt);
    }
    let selected = prev || localStorage.getItem(stateKey) || "";
    if (selected && players.includes(selected)) {
      playerSel.value = selected;
    } else if (players.length) {
      playerSel.value = players[0];
    }
    localStorage.setItem(stateKey, playerSel.value);
    computeGuessStats();
    refreshPin();
  }

  async function loadState() {
    const res = await fetch(`/api/round_state/${roundId}`);
    const js = await res.json();
    players = js.players || [];
    guesses = js.guesses || {};
    rebuildPlayerDropdown();
  }

  playerSel.addEventListener("change", () => {
    localStorage.setItem(stateKey, playerSel.value);
    refreshPin();
  });

  addPlayerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (newPlayerInput.value || "").trim();
    if (!name) {
      showToast("Name cannot be empty.", true);
      return;
    }
    try {
      const res = await fetch("/api/add_player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const js = await res.json();
      if (!res.ok || !js.ok) {
        showToast(js.error || "Failed to add.", true);
        return;
      }
      players = js.players;
      newPlayerInput.value = "";
      rebuildPlayerDropdown(js.added);
      showToast(`Turn: ${js.added}`);
    } catch (err) {
      console.error(err);
      showToast("Network error", true);
    }
  });

  function onWheel(e) {
    if (!img.naturalWidth) return;
    const delta = e.deltaY;
    const factor = delta < 0 ? 1.1 : 0.9;
    const prevZoom = zoom;
    zoom = clamp(zoom * factor, 0.4, 6);
    const { x, y } = screenToImageCoords(e.clientX, e.clientY);
    const { left, top } = imageTopLeft();
    const { s } = currentRenderSize();
    const preSx = left + x * s;
    const preSy = top + y * s;
    const ns = baseScale * zoom;
    panX += preSx - (left + x * ns);
    panY += preSy - (top + y * ns);
    layoutImage();
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = panX;
    const startPanY = panY;
    let moved = false;

    const move = (ev) => {
      panX = startPanX + (ev.clientX - startX);
      panY = startPanY + (ev.clientY - startY);
      moved = true;
      layoutImage();
    };

    const up = (ev) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      if (!moved) {
        const pt = screenToImageCoords(ev.clientX, ev.clientY);
        guesses[playerSel.value] = { x: Math.round(pt.x), y: Math.round(pt.y) };
        refreshPin();
        saveGuess();
      }
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  async function saveGuess() {
    const player = playerSel.value;
    const pt = guesses[player];
    if (!player || !pt) return;
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: roundId, player, x: pt.x, y: pt.y }),
      });
      const js = await res.json();
      if (!res.ok || !js.ok) {
        showToast(js.error || "Failed", true);
        return;
      }
      guesses = js.guesses || guesses;
      computeGuessStats();
      rebuildPlayerDropdown(player);
      showToast("Saved");
    } catch (err) {
      console.error(err);
      showToast("Network error", true);
    }
  }

  function zoomBy(delta) {
    const factor = delta > 0 ? 1.2 : 0.8;
    zoom = clamp(zoom * factor, 0.4, 6);
    layoutImage();
  }

  zoomInBtn.addEventListener("click", () => zoomBy(1));
  zoomOutBtn.addEventListener("click", () => zoomBy(-1));
  resetBtn.addEventListener("click", () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    layoutImage();
  });

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    onWheel(e);
  }, { passive: false });

  stage.addEventListener("mousedown", onDragStart);

  window.addEventListener("resize", layoutImage);
  img.addEventListener("load", layoutImage);

  loadState();
  layoutImage();
})();
