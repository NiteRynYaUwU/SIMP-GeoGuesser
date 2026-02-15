(() => {
  const img = document.getElementById("map");
  const xInput = document.getElementById("x");
  const yInput = document.getElementById("y");
  const xy = document.getElementById("xy");
  const form = document.getElementById("answerForm");
  const toast = document.getElementById("toast");
  const svg = document.getElementById("pinSvg");

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function drawAnswerPin(x, y) {
    if (!svg || !img.naturalWidth || !img.naturalHeight) return;

    const rect = img.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const scaleX = w / img.naturalWidth;
    const scaleY = h / img.naturalHeight;

    const cx = clamp(Math.round(x * scaleX), 0, w);
    const cy = clamp(Math.round(y * scaleY), 0, h);

    svg.innerHTML = `
      <g>
        <path d="M ${cx} ${cy + 11} L ${cx - 6} ${cy + 25} L ${cx + 6} ${cy + 25} Z"
          fill="rgba(220,38,38,0.98)" stroke="rgba(16,24,40,0.18)" stroke-width="2"></path>
        <circle cx="${cx}" cy="${cy}" r="11" fill="rgba(255,255,255,0.98)"
          stroke="rgba(16,24,40,0.18)" stroke-width="2"></circle>
        <circle cx="${cx}" cy="${cy}" r="4" fill="rgba(220,38,38,0.98)"
          stroke="rgba(16,24,40,0.18)" stroke-width="1"></circle>
      </g>
    `;
  }

  function redrawIfSelected() {
    if (xInput.value && yInput.value) {
      drawAnswerPin(Number(xInput.value), Number(yInput.value));
    } else if (svg) {
      svg.innerHTML = "";
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

  img.addEventListener("click", (e) => {
    const rect = img.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (img.naturalWidth / rect.width));
    const y = Math.round((e.clientY - rect.top) * (img.naturalHeight / rect.height));
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
