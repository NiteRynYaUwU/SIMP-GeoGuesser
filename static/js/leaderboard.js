(() => {
  const utils = window.GeoUtils;
  if (!utils) return;
  const {
    clamp,
    makePin,
    makeAnswerPin,
    createPanZoom,
    applyConstantPinSize,
    playerColor,
  } = utils;

  function parseRoundGuesses(roundIndex) {
    const script = document.querySelector(
      `script.pindata[data-round="${roundIndex}"]`,
    );
    if (!script) return {};
    try {
      return JSON.parse(script.textContent || "{}");
    } catch {
      return {};
    }
  }

  function layoutOne(wrap) {
    const img = wrap.querySelector("img.pinmap");
    const svg = wrap.querySelector("svg.pinsvg");
    const tooltip = wrap.querySelector(".pintooltip");
    if (!img || !svg) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    img.draggable = false;

    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;

    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const roundIndex = wrap.dataset.round;
    const guesses = parseRoundGuesses(roundIndex);

    const scaleX = w / img.naturalWidth;
    const scaleY = h / img.naturalHeight;

    for (const [name, pt] of Object.entries(guesses)) {
      if (!pt) continue;
      let x, y;
      if (Array.isArray(pt)) {
        x = pt[0];
        y = pt[1];
      } else {
        x = pt.x;
        y = pt.y;
      }
      if (x == null || y == null) continue;

      const cx = clamp(Math.round(x * scaleX), 0, w);
      const cy = clamp(Math.round(y * scaleY), 0, h);

      makePin(svg, cx, cy, playerColor(name), name);
    }

    const ax = Number(wrap.dataset.answerX);
    const ay = Number(wrap.dataset.answerY);
    if (Number.isFinite(ax) && Number.isFinite(ay)) {
      const cx = clamp(Math.round(ax * scaleX), 0, w);
      const cy = clamp(Math.round(ay * scaleY), 0, h);

      // Answer pin uses STAR shape now
      makeAnswerPin(svg, cx, cy, "rgba(220,38,38,0.98)", "Answer");
    }

    const t = wrap._pz?.getTransform?.() || { scale: 1, tx: 0, ty: 0 };
    applyConstantPinSize(svg, t.scale);

    if (tooltip) {
      const show = (e, label) => {
        tooltip.textContent = label;
        tooltip.style.display = "block";
        const pad = 10;
        const wrapRect = wrap.getBoundingClientRect();
        const lx = e.clientX - wrapRect.left;
        const ly = e.clientY - wrapRect.top;
        const x = clamp(
          lx + 12,
          pad,
          wrapRect.width - tooltip.offsetWidth - pad,
        );
        const y = clamp(
          ly + 12,
          pad,
          wrapRect.height - tooltip.offsetHeight - pad,
        );
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      };
      const hide = () => (tooltip.style.display = "none");

      svg.onmousemove = (e) => {
        const pin = e.target?.closest?.(".pin");
        if (pin?.dataset?.label) show(e, pin.dataset.label);
        else hide();
      };
      svg.onmouseleave = hide;
    }
  }

  function layoutAll() {
    document.querySelectorAll(".pinwrap").forEach(layoutOne);
  }

  window.addEventListener("resize", layoutAll);

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".pinwrap").forEach((wrap) => {
      const viewport = wrap.querySelector(".pzViewport");
      const btn = wrap.querySelector("button.resetView");

      const pz =
        createPanZoom && viewport ? createPanZoom(wrap, viewport) : null;
      wrap._pz = pz;

      btn?.addEventListener("click", () => pz?.reset());
      btn?.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn?.addEventListener("wheel", (e) => e.stopPropagation());

      pz?.setOnChange?.(({ scale }) => {
        const svg = wrap.querySelector("svg.pinsvg");
        applyConstantPinSize(svg, scale);
      });
    });

    setTimeout(() => layoutAll(), 0);
    document.querySelectorAll(".pinwrap img.pinmap").forEach((img) => {
      img.addEventListener("load", () => layoutAll());
    });
  });
})();
