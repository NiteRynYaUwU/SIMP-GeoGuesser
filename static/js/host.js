(() => {
  const utils = window.GeoUtils;
  if (!utils) return;
  const { clamp, makePin } = utils;

  function getGuesses() {
    const el = document.getElementById("hostGuessesJson");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch {
      return {};
    }
  }

  function layout() {
    const img = document.getElementById("hostPreviewImg");
    const svg = document.getElementById("hostPreviewSvg");
    const tooltip = document.getElementById("hostPreviewTooltip");
    if (!img || !svg) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const rect = img.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const guesses = getGuesses();
    const sx = w / img.naturalWidth;
    const sy = h / img.naturalHeight;

    for (const [name, pt] of Object.entries(guesses)) {
      let x;
      let y;
      if (Array.isArray(pt)) {
        x = pt[0];
        y = pt[1];
      } else {
        x = pt?.x;
        y = pt?.y;
      }

      if (x == null || y == null) continue;
      const cx = clamp(Math.round(x * sx), 0, w);
      const cy = clamp(Math.round(y * sy), 0, h);
      makePin(svg, cx, cy, name);
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
        const pin = e.target?.closest?.(".pin");
        if (pin?.dataset?.label) show(e, pin.dataset.label);
        else hide();
      };
      svg.onmouseleave = hide;
    }
  }

  window.addEventListener("resize", layout);
  document.addEventListener("DOMContentLoaded", () => {
    const img = document.getElementById("hostPreviewImg");
    if (img) img.addEventListener("load", layout);
    setTimeout(layout, 0);
  });

  const popup = document.getElementById("answerPopup");
  const closeBtn = document.getElementById("closePopup");
  const popupLink = document.getElementById("popupSetLink");

  document.querySelectorAll(".player-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      const answerSet = this.dataset.answerSet === "1";
      if (!answerSet) {
        e.preventDefault();
        popup.style.display = "flex";
        popupLink.href = this.dataset.setUrl;
      }
    });
  });

  closeBtn?.addEventListener("click", () => {
    popup.style.display = "none";
  });

  popup?.addEventListener("click", (e) => {
    if (e.target === popup) popup.style.display = "none";
  });
})();
