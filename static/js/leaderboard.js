(() => {
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function makePin(svg, cx, cy, color, label) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.classList.add("pin");
    g.dataset.label = label;
    g.style.cursor = "default";

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

    const title = document.createElementNS(ns, "title");
    title.textContent = label;

    g.appendChild(title);
    g.appendChild(tail);
    g.appendChild(outer);
    g.appendChild(inner);
    svg.appendChild(g);
    return g;
  }

  function parseRoundGuesses(roundIndex) {
    const script = document.querySelector(`script.pindata[data-round="${roundIndex}"]`);
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

    const rect = img.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
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
      let x;
      let y;
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
      makePin(svg, cx, cy, "rgba(37,99,235,0.98)", name);
    }

    const ax = Number(wrap.dataset.answerX);
    const ay = Number(wrap.dataset.answerY);
    if (Number.isFinite(ax) && Number.isFinite(ay)) {
      const cx = clamp(Math.round(ax * scaleX), 0, w);
      const cy = clamp(Math.round(ay * scaleY), 0, h);
      makePin(svg, cx, cy, "rgba(220,38,38,0.98)", "Answer");
    }

    if (tooltip) {
      const show = (e, label) => {
        tooltip.textContent = label;
        tooltip.style.display = "block";
        const pad = 10;
        const x = clamp(e.offsetX + 12, pad, w - tooltip.offsetWidth - pad);
        const y = clamp(e.offsetY + 12, pad, h - tooltip.offsetHeight - pad);
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      };
      const hide = () => {
        tooltip.style.display = "none";
      };

      svg.onmousemove = (e) => {
        const pin = e.target && e.target.closest ? e.target.closest(".pin") : null;
        if (pin && pin.dataset && pin.dataset.label) {
          show(e, pin.dataset.label);
        } else {
          hide();
        }
      };
      svg.onmouseleave = hide;
    }
  }

  function layoutAll() {
    document.querySelectorAll(".pinwrap").forEach(layoutOne);
  }

  window.addEventListener("resize", layoutAll);
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => layoutAll(), 0);
    document.querySelectorAll(".pinwrap img.pinmap").forEach((img) => {
      img.addEventListener("load", () => layoutAll());
    });
  });
})();
