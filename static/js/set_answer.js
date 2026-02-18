(() => {
  const img = document.getElementById("map");
  const xInput = document.getElementById("x");
  const yInput = document.getElementById("y");
  const xy = document.getElementById("xy");
  const form = document.getElementById("answerForm");
  const toast = document.getElementById("toast");
  const svg = document.getElementById("pinSvg");
  const wrap = document.getElementById("mapWrap");
  const viewport = document.getElementById("mapViewport");
  const resetBtn = document.getElementById("resetView");

  const utils = window.GeoUtils;
  if (!utils) return;
  const { clamp, createPanZoom, makeAnswerPin, applyConstantPinSize } = utils;

  if (img) img.draggable = false;

  const pz =
    createPanZoom && wrap && viewport ? createPanZoom(wrap, viewport) : null;
  resetBtn?.addEventListener("click", () => pz?.reset());
  resetBtn?.addEventListener("pointerdown", (e) => e.stopPropagation());
  resetBtn?.addEventListener("wheel", (e) => e.stopPropagation());

  pz?.setOnChange?.(({ scale }) => {
    applyConstantPinSize(svg, scale);
  });

  function drawAnswerPin(x, y) {
    if (!svg || !img.naturalWidth || !img.naturalHeight) return;

    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;

    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const scaleX = w / img.naturalWidth;
    const scaleY = h / img.naturalHeight;

    const cx = clamp(Math.round(x * scaleX), 0, w);
    const cy = clamp(Math.round(y * scaleY), 0, h);

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Answer pin uses STAR shape now
    makeAnswerPin(svg, cx, cy, "rgba(220,38,38,0.98)", "Answer");

    const t = pz?.getTransform?.() || { scale: 1, tx: 0, ty: 0 };
    applyConstantPinSize(svg, t.scale);
  }

  function redrawIfSelected() {
    if (xInput.value && yInput.value) {
      drawAnswerPin(Number(xInput.value), Number(yInput.value));
    } else if (svg) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    toast.style.transition = "opacity 250ms ease, transform 250ms ease";

    clearTimeout(showToast._t1);
    clearTimeout(showToast._t2);

    showToast._t1 = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
    }, 1100);

    showToast._t2 = setTimeout(() => {
      toast.style.display = "none";
    }, 1500);
  }

  window.addEventListener("resize", redrawIfSelected);
  img.addEventListener("load", redrawIfSelected);
  setTimeout(redrawIfSelected, 0);

  wrap.addEventListener("click", (e) => {
    if (e.target && e.target.closest && e.target.closest("#resetView")) return;
    if (pz?.consumeMoved?.()) return;

    const wrapRect = wrap.getBoundingClientRect();
    const localX = e.clientX - wrapRect.left;
    const localY = e.clientY - wrapRect.top;

    const t = pz?.getTransform?.() || { scale: 1, tx: 0, ty: 0 };

    const baseX = (localX - t.tx) / t.scale;
    const baseY = (localY - t.ty) / t.scale;

    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;

    const x = Math.round(baseX * (img.naturalWidth / w));
    const y = Math.round(baseY * (img.naturalHeight / h));

    xInput.value = x;
    yInput.value = y;
    xy.textContent = `(${x}, ${y})`;
    drawAnswerPin(x, y);
  });

  form.addEventListener("submit", (e) => {
    if (!xInput.value || !yInput.value) {
      e.preventDefault();
      showToast("Pick a spot on the map first");
    }
  });
})();
