(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Deterministic hash (FNV-1a) so the same name always gets the same color.
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // "Random" but stable per player name.
  // Returns a CSS color string suitable for SVG fill (hsl works great).
  function playerColor(name) {
    const s = String(name || "Player");
    const h = hashString(s) % 360;
    // Saturated, mid-lightness: readable and distinct.
    return `hsl(${h} 78% 45%)`;
  }

  function createPanZoom(wrapEl, contentEl, opts = {}) {
    if (!wrapEl || !contentEl) return null;

    const minScale = typeof opts.minScale === "number" ? opts.minScale : 1;
    const maxScale = typeof opts.maxScale === "number" ? opts.maxScale : 6;
    const zoomStep = typeof opts.zoomStep === "number" ? opts.zoomStep : 0.12;

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startTx = 0;
    let startTy = 0;
    let moved = false;
    let onChange = null;

    wrapEl.style.overflow = wrapEl.style.overflow || "hidden";
    wrapEl.style.touchAction = "none";
    wrapEl.style.userSelect = "none";
    wrapEl.style.cursor = "grab";
    contentEl.style.transformOrigin = "0 0";

    const apply = () => {
      contentEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      if (typeof onChange === "function") onChange({ scale, tx, ty });
    };

    const reset = () => {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    };

    const getTransform = () => ({ scale, tx, ty });

    const setTransform = (next) => {
      if (!next) return;
      if (typeof next.scale === "number") scale = clamp(next.scale, minScale, maxScale);
      if (typeof next.tx === "number") tx = next.tx;
      if (typeof next.ty === "number") ty = next.ty;
      apply();
    };

    const onWheel = (e) => {
      e.preventDefault();

      const rect = wrapEl.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const dir = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + zoomStep * dir;
      const newScale = clamp(scale * factor, minScale, maxScale);
      if (newScale === scale) return;

      const x0 = (cx - tx) / scale;
      const y0 = (cy - ty) / scale;
      tx = cx - x0 * newScale;
      ty = cy - y0 * newScale;
      scale = newScale;
      apply();
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startTx = tx;
      startTy = ty;
      wrapEl.style.cursor = "grabbing";
      try { wrapEl.setPointerCapture(e.pointerId); } catch {}
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      tx = startTx + dx;
      ty = startTy + dy;
      apply();
    };

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      wrapEl.style.cursor = "grab";
      try { wrapEl.releasePointerCapture(e.pointerId); } catch {}
    };

    const consumeMoved = () => {
      const was = moved;
      moved = false;
      return was;
    };

    wrapEl.addEventListener("wheel", onWheel, { passive: false });
    wrapEl.addEventListener("pointerdown", onPointerDown);
    wrapEl.addEventListener("pointermove", onPointerMove);
    wrapEl.addEventListener("pointerup", endDrag);
    wrapEl.addEventListener("pointercancel", endDrag);
    wrapEl.addEventListener("pointerleave", endDrag);

    apply();

    return {
      reset,
      getTransform,
      setTransform,
      setOnChange(fn) { onChange = fn; },
      consumeMoved,
    };
  }

  // Standard player pin (dot in circle + tail)
  function makePin(svg, cx, cy, colorOrLabel, maybeLabel) {
    const color = maybeLabel === undefined ? "rgba(37,99,235,0.98)" : colorOrLabel;
    const label = maybeLabel === undefined ? colorOrLabel : maybeLabel;

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.classList.add("pin");
    g.dataset.cx = String(cx);
    g.dataset.cy = String(cy);
    if (label != null) g.dataset.label = label;

    const tail = document.createElementNS(ns, "path");
    tail.setAttribute("d", `M ${cx} ${cy + 11} L ${cx - 6} ${cy + 25} L ${cx + 6} ${cy + 25} Z`);
    tail.setAttribute("fill", color);
    tail.setAttribute("stroke", "rgba(16,24,40,0.18)");
    tail.setAttribute("stroke-width", "2");

    const outer = document.createElementNS(ns, "circle");
    outer.setAttribute("cx", cx);
    outer.setAttribute("cy", cy);
    outer.setAttribute("r", "11");
    outer.setAttribute("fill", "rgba(255,255,255,0.98)");
    outer.setAttribute("stroke", "rgba(16,24,40,0.18)");
    outer.setAttribute("stroke-width", "2");

    const inner = document.createElementNS(ns, "circle");
    inner.setAttribute("cx", cx);
    inner.setAttribute("cy", cy);
    inner.setAttribute("r", "4");
    inner.setAttribute("fill", color);
    inner.setAttribute("stroke", "rgba(16,24,40,0.18)");
    inner.setAttribute("stroke-width", "1");

    if (label != null) {
      const title = document.createElementNS(ns, "title");
      title.textContent = label;
      g.appendChild(title);
    }

    g.appendChild(tail);
    g.appendChild(outer);
    g.appendChild(inner);
    svg.appendChild(g);
    return g;
  }

  // NEW: Answer pin (same tail + white circle, but STAR instead of dot)
  function makeAnswerPin(svg, cx, cy, color = "rgba(220,38,38,0.98)", label = "Answer") {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.classList.add("pin", "answer-pin");
    g.dataset.cx = String(cx);
    g.dataset.cy = String(cy);
    if (label != null) g.dataset.label = label;

    const tail = document.createElementNS(ns, "path");
    tail.setAttribute("d", `M ${cx} ${cy + 11} L ${cx - 6} ${cy + 25} L ${cx + 6} ${cy + 25} Z`);
    tail.setAttribute("fill", color);
    tail.setAttribute("stroke", "rgba(16,24,40,0.18)");
    tail.setAttribute("stroke-width", "2");

    const outer = document.createElementNS(ns, "circle");
    outer.setAttribute("cx", cx);
    outer.setAttribute("cy", cy);
    outer.setAttribute("r", "11");
    outer.setAttribute("fill", "rgba(255,255,255,0.98)");
    outer.setAttribute("stroke", "rgba(16,24,40,0.18)");
    outer.setAttribute("stroke-width", "2");

    // 5-point star centered at (cx,cy)
    const star = document.createElementNS(ns, "path");
    const R = 7.2;      // outer radius
    const r = 3.2;      // inner radius
    let d = "";
    for (let i = 0; i < 10; i++) {
      const ang = (-Math.PI / 2) + (i * Math.PI / 5);
      const rad = i % 2 === 0 ? R : r;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      d += (i === 0 ? "M " : "L ") + x.toFixed(2) + " " + y.toFixed(2) + " ";
    }
    d += "Z";
    star.setAttribute("d", d);
    star.setAttribute("fill", color);
    star.setAttribute("stroke", "rgba(16,24,40,0.18)");
    star.setAttribute("stroke-width", "1");

    if (label != null) {
      const title = document.createElementNS(ns, "title");
      title.textContent = label;
      g.appendChild(title);
    }

    g.appendChild(tail);
    g.appendChild(outer);
    g.appendChild(star);
    svg.appendChild(g);
    return g;
  }

  function applyConstantPinSize(svg, currentScale) {
    if (!svg || !currentScale || currentScale === 1) {
      svg?.querySelectorAll?.("g.pin").forEach((g) => g.removeAttribute("transform"));
      return;
    }

    const inv = 1 / currentScale;
    svg.querySelectorAll("g.pin").forEach((g) => {
      const cx = Number(g.dataset.cx);
      const cy = Number(g.dataset.cy);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
      g.setAttribute("transform", `translate(${cx} ${cy}) scale(${inv}) translate(${-cx} ${-cy})`);
    });
  }

  window.GeoUtils = {
    clamp,
    playerColor,
    makePin,
    makeAnswerPin,
    createPanZoom,
    applyConstantPinSize,
  };
})();
