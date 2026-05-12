/* AI Zine Maker — Frontend Reader */
(function () {
  'use strict';

  const pagesEl = document.getElementById('azm-zine-pages');
  if (!pagesEl) return;

  const pages    = pagesEl.querySelectorAll('.azm-zine-page');
  const prevBtn  = document.getElementById('azm-prev');
  const nextBtn  = document.getElementById('azm-next');
  const indicator = document.getElementById('azm-page-indicator');
  const dlBtn    = document.getElementById('azm-download-pdf');

  let current = 0;
  const total = pages.length;

  function show(idx) {
    pages.forEach((p, i) => p.classList.toggle('active', i === idx));
    if (indicator) indicator.textContent = `${idx + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === total - 1;
    current = idx;
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { if (current > 0) show(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => { if (current < total - 1) show(current + 1); });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { if (current < total - 1) show(current + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { if (current > 0) show(current - 1); }
  });

  let touchStartX = 0;
  pagesEl.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  pagesEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && current < total - 1) show(current + 1);
      if (dx > 0 && current > 0) show(current - 1);
    }
  }, { passive: true });

  show(0);

  // ===== Canvas Scaling =====
  // Each page contains a fixed 340×481px .azm-zine-canvas scaled to fit its container.

  function scaleZinePages() {
    // Read from the container (always visible), not from individual pages (display:none when inactive)
    const containerWidth = pagesEl.offsetWidth;
    if (!containerWidth) return;
    const scale = containerWidth / 340;
    document.querySelectorAll('.azm-zine-canvas').forEach(function (canvas) {
      canvas.style.transform = 'scale(' + scale + ')';
    });
  }

  scaleZinePages();
  window.addEventListener('resize', scaleZinePages);

  // ===== PDF Download =====

  const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const H2C_CDN   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

  function loadLib(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  if (dlBtn && typeof AZM_ZINE !== 'undefined') {
    dlBtn.addEventListener('click', async () => {
      const orig = dlBtn.textContent;
      dlBtn.disabled = true; dlBtn.textContent = 'Generating…';
      try {
        await Promise.all([loadLib(JSPDF_CDN), loadLib(H2C_CDN)]);
        await document.fonts.ready;
        const { pages: pagesData, format, title } = AZM_ZINE;
        if (format === 'a5-booklet') {
          await fzDownloadBooklet(pagesData, title);
        } else {
          await fzDownloadMiniZine(pagesData, title);
        }
      } catch (err) {
        alert('Could not generate PDF: ' + err.message);
      } finally { dlBtn.disabled = false; dlBtn.textContent = orig; }
    });
  }

  function fzBuildPageDiv(page, w, h) {
    const scale = w / 340;
    const div = document.createElement('div');
    div.style.position   = 'relative';
    div.style.width      = w + 'px';
    div.style.height     = h + 'px';
    div.style.overflow   = 'hidden';
    div.style.background = page.bgColor || '#fff';
    (page.elements || []).forEach(e => {
      const child = document.createElement('div');
      child.style.position = 'absolute';
      child.style.left     = e.x + '%';
      child.style.top      = e.y + '%';
      child.style.width    = e.w + '%';
      child.style.height   = e.h + '%';
      child.style.overflow = 'hidden';
      if (e.rotation) child.style.transform = `rotate(${e.rotation}deg)`;
      if (e.type === 'text') {
        child.style.fontFamily = e.fontFamily || 'Georgia,serif';
        child.style.fontSize   = ((e.fontSize || 14) * scale) + 'px';
        child.style.fontWeight = e.bold   ? 'bold'   : 'normal';
        child.style.fontStyle  = e.italic ? 'italic' : 'normal';
        child.style.textAlign  = e.align  || 'left';
        child.style.color      = e.color  || '#1a1a1a';
        child.style.lineHeight = '1.4';
        child.style.wordBreak  = 'break-word';
        child.textContent      = e.content || '';
      } else if (e.type === 'image' && e.url) {
        child.style.backgroundImage    = `url('${e.url}')`;
        child.style.backgroundSize     = 'cover';
        child.style.backgroundPosition = 'center';
      } else if (e.type === 'shape') {
        child.style.background   = e.fill || '#cccccc';
        child.style.borderRadius = e.shapeType === 'circle' ? '50%' : '0';
        if (e.strokeWidth > 0 && e.strokeColor) {
          child.style.border     = `${e.strokeWidth * scale}px solid ${e.strokeColor}`;
          child.style.boxSizing  = 'border-box';
        }
      }
      div.appendChild(child);
    });

    const drawings = page.drawings || [];
    if (drawings.length) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
      drawings.forEach(stroke => {
        const pts = stroke.points || [];
        if (!pts.length) return;
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const bx = Math.min(...xs), by = Math.min(...ys);
        const bw = Math.max(Math.max(...xs) - bx, 0.001);
        const bh = Math.max(Math.max(...ys) - by, 0.001);
        const cx = bx + bw / 2, cy = by + bh / 2;
        const tx = stroke.tx || 0, ty = stroke.ty || 0;
        const r  = stroke.rotation || 0;
        const sx = stroke.scaleX != null ? stroke.scaleX : 1;
        const sy = stroke.scaleY != null ? stroke.scaleY : 1;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${cx+tx},${cy+ty}) rotate(${r}) scale(${sx},${sy}) translate(${-cx},${-cy})`);
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', stroke.color || '#000');
        poly.setAttribute('stroke-width', (stroke.width || 3) * 0.3);
        poly.setAttribute('stroke-linecap', 'round');
        poly.setAttribute('stroke-linejoin', 'round');
        g.appendChild(poly);
        svg.appendChild(g);
      });
      div.appendChild(svg);
    }

    return div;
  }

  async function fzCapture(elem) {
    return window.html2canvas(elem, {
      scale: 2, useCORS: true, allowTaint: true,
      backgroundColor: null, logging: false,
    });
  }

  async function fzDownloadMiniZine(p, title) {
    const { jsPDF } = window.jspdf;
    const PW = 297, PH = 210, px_mm = 96 / 25.4;
    const panelW = Math.round((PW / 4) * px_mm);
    const panelH = Math.round((PH / 2) * px_mm);

    const container = document.createElement('div');
    container.style.cssText = `position:absolute;left:-99999px;top:0;width:${panelW*4}px;height:${panelH*2}px;display:grid;grid-template-columns:repeat(4,${panelW}px);grid-template-rows:${panelH}px ${panelH}px;background:#fff;`;
    document.body.appendChild(container);

    [p[4],p[3],p[2],p[1]].forEach(pg => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `width:${panelW}px;height:${panelH}px;overflow:hidden;position:relative;`;
      if (pg) {
        const inner = fzBuildPageDiv(pg, panelW, panelH);
        inner.style.transform = 'rotate(180deg)'; inner.style.transformOrigin = 'center';
        wrapper.appendChild(inner);
      }
      container.appendChild(wrapper);
    });
    [p[5],p[6],p[7],p[0]].forEach(pg => {
      const div = pg ? fzBuildPageDiv(pg, panelW, panelH) : document.createElement('div');
      if (!pg) div.style.cssText = `width:${panelW}px;height:${panelH}px;`;
      container.appendChild(div);
    });

    const canvas = await fzCapture(container);
    document.body.removeChild(container);

    const safe = (title || 'zine').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PW, PH);
    doc.save(`${safe}.pdf`);
  }

  async function fzDownloadBooklet(p, title) {
    const { jsPDF } = window.jspdf;
    const n = p.length, sheets = n / 4;
    const PW = 297, PH = 210, px_mm = 96 / 25.4;
    const halfW = Math.round((PW / 2) * px_mm);
    const pageH = Math.round(PH * px_mm);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let first = true;

    for (let k = 1; k <= sheets; k++) {
      for (const [ai, bi] of [[n-2*k+2, 2*k-1], [2*k, n-2*k+1]]) {
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:-99999px;top:0;width:${halfW*2}px;height:${pageH}px;display:flex;background:#fff;`;
        container.appendChild(p[ai-1] ? fzBuildPageDiv(p[ai-1], halfW, pageH) : document.createElement('div'));
        container.appendChild(p[bi-1] ? fzBuildPageDiv(p[bi-1], halfW, pageH) : document.createElement('div'));
        document.body.appendChild(container);
        const canvas = await fzCapture(container);
        document.body.removeChild(container);
        if (!first) doc.addPage(); first = false;
        doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PW, PH);
      }
    }
    const safe = (title || 'zine').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    doc.save(`${safe}.pdf`);
  }

})();
