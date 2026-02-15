(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makePin(svg, cx, cy, colorOrLabel, maybeLabel) {
    const color = maybeLabel === undefined ? "rgba(37,99,235,0.98)" : colorOrLabel;
    const label = maybeLabel === undefined ? colorOrLabel : maybeLabel;

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.classList.add("pin");
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

  window.GeoUtils = { clamp, makePin };
})();
