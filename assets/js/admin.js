/* AI Zine Maker — Admin Editor v4 */
(function () {
  'use strict';

  function AZMEditor(container) {
    const root = container;

  // ===== Google Fonts =====
  (function loadFonts() {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Bebas+Neue&family=Caveat:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;700&family=DM+Serif+Display:ital@0;1&family=Josefin+Sans:wght@400;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=Nunito:wght@400;700&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Raleway:wght@400;700&family=Satisfy&family=Space+Mono:ital,wght@0,400;1,400&family=Work+Sans:wght@400;700&family=Courier+Prime:ital@0;1&display=swap';
    document.head.appendChild(link);
  })();

  // ===== Constants =====

  const MINI_LABELS = ['Front Cover', 'Inside Front', 'Page 3', 'Page 4', 'Page 5', 'Page 6', 'Inside Back', 'Back Cover'];

  // Spreads: covers are always 1-up
  function isCoverPage(idx) {
    return idx === 0 || idx === pages.length - 1;
  }
  const FONTS = [
    ["'Abril Fatface', Georgia, serif",             'Abril Fatface'],
    ["'Bebas Neue', Arial, sans-serif",             'Bebas Neue'],
    ["'Caveat', cursive",                           'Caveat'],
    ["'Cormorant Garamond', Georgia, serif",        'Cormorant Garamond'],
    ["'Courier Prime', 'Courier New', monospace",   'Courier Prime'],
    ["'DM Mono', 'Courier New', monospace",         'DM Mono'],
    ["'DM Sans', Arial, sans-serif",                'DM Sans'],
    ["'DM Serif Display', Georgia, serif",          'DM Serif Display'],
    ['Georgia, serif',                              'Georgia'],
    ["'Josefin Sans', Arial, sans-serif",           'Josefin Sans'],
    ["'Libre Baskerville', Georgia, serif",         'Libre Baskerville'],
    ["'Lora', Georgia, serif",                      'Lora'],
    ["'Nunito', Arial, sans-serif",                 'Nunito'],
    ["'Permanent Marker', cursive",                 'Permanent Marker'],
    ["'Playfair Display', Georgia, serif",          'Playfair Display'],
    ["'Raleway', Arial, sans-serif",                'Raleway'],
    ["'Satisfy', cursive",                          'Satisfy'],
    ["'Space Mono', 'Courier New', monospace",      'Space Mono'],
    ["'Work Sans', Arial, sans-serif",              'Work Sans'],
  ];

  // ===== State =====

  let format = root.dataset.format || 'mini-zine';
  let pages  = [];
  try {
    const raw = root.dataset.pages || '';
    let json = '[]';
    if (raw) {
      try {
        const binStr = atob(raw);
        const bytes  = Uint8Array.from(binStr, c => c.charCodeAt(0));
        json = new TextDecoder().decode(bytes);
      } catch (_) { json = raw; } // fall back for legacy plain-JSON attributes
    }
    pages = JSON.parse(json);
  } catch (e) {}
  if (!pages.length) pages = defaultPages(format);
  pages = pages.map(migratePage);

  let activeIdx          = 0;
  let selectedElId       = null;
  let selectedDrawingId  = null;
  let lastFocusedTextElId = null;
  let isEditing          = false;
  let dragState          = null;
  let imageHistory       = []; // { prompt, url } per session
  let drawMode           = false;
  let drawColor          = '#1a1a1a';
  let drawWidth          = 3;
  let cropElId           = null;
  let activeDrawStroke   = null;
  let copiedElement      = null;
  let drawDragState      = null;

  // ===== Data Model =====

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function strokeBbox(stroke) {
    const pts = stroke.points || [];
    if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 };
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(Math.max(...xs) - x, 1), h: Math.max(Math.max(...ys) - y, 1) };
  }

  function strokeTransform(stroke, bbox) {
    const b  = bbox || strokeBbox(stroke);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const tx = stroke.tx || 0, ty = stroke.ty || 0;
    const r  = stroke.rotation || 0;
    const sx = stroke.scaleX != null ? stroke.scaleX : 1;
    const sy = stroke.scaleY != null ? stroke.scaleY : 1;
    return `translate(${cx + tx},${cy + ty}) rotate(${r}) scale(${sx},${sy}) translate(${-cx},${-cy})`;
  }

  function newTextEl(content, x, y, w, h, opts) {
    return Object.assign({
      id: uid(), type: 'text',
      x, y, w, h, rotation: 0,
      content: content || '',
      fontFamily: 'Georgia, serif',
      fontSize: 14,
      bold: false, italic: false,
      align: 'left',
      color: '#1a1a1a',
    }, opts || {});
  }

  function newImageEl(url, x, y, w, h) {
    return { id: uid(), type: 'image', x, y, w, h, rotation: 0, url: url || '',
      bgScale: null, bgOffsetX: 50, bgOffsetY: 50 };
  }

  function newShapeEl(shapeType, x, y, w, h) {
    return { id: uid(), type: 'shape', shapeType, x, y, w, h, rotation: 0,
      fillColor: '#4a90d9', strokeColor: '', strokeWidth: 0,
      borderRadius: shapeType === 'circle' ? 50 : 0, opacity: 1 };
  }

  function newPage() {
    return { id: uid(), bgColor: '#ffffff', elements: [], drawings: [] };
  }

  function migratePage(p) {
    if (Array.isArray(p.elements)) return Object.assign({ drawings: [] }, p, { drawings: p.drawings || [] });
    const elements = [];
    const tc = p.textColor || '#1a1a1a';
    if (p.title)    elements.push(newTextEl(p.title, 8, 8,  84, 18, { fontSize: 22, bold: true, color: tc }));
    if (p.body)     elements.push(newTextEl(p.body,  8, 30, 84, 50, { fontSize: 11, color: tc }));
    if (p.imageUrl) elements.push(newImageEl(p.imageUrl, 8, 8, 84, 60));
    return { id: p.id || uid(), bgColor: p.bgColor || '#ffffff', elements };
  }

  function defaultPages(fmt) {
    if (fmt === 'mini-zine') return Array.from({ length: 8 }, () => newPage());
    return [newPage()];
  }

  // ===== Root Render =====

  function render() {
    if (isEditing) return;
    root.innerHTML = '';
    root.appendChild(el('input', { type: 'hidden', id: 'azm-pages-data',  name: 'azm_pages',  value: JSON.stringify(pages) }));
    root.appendChild(el('input', { type: 'hidden', id: 'azm-format-data', name: 'azm_format', value: format }));
    root.appendChild(renderFormatBar());
    const editor = el('div', { className: 'azm-editor' });
    editor.appendChild(renderSidebar());
    editor.appendChild(renderCanvasArea());
    editor.appendChild(renderPropsPanel());
    root.appendChild(editor);
  }

  // ===== Format Bar =====

  function renderFormatBar() {
    const bar = el('div', { className: 'azm-format-bar' });
    bar.appendChild(el('span', { className: 'azm-format-label', textContent: 'Format:' }));
    [
      { value: 'mini-zine',  label: 'Mini-Zine (A4, 8 pages, single sheet)' },
      { value: 'a5-booklet', label: 'A5 Booklet (saddle-stitch)' },
    ].forEach(opt => {
      const btn = el('button', {
        className: 'azm-format-btn' + (format === opt.value ? ' active' : ''),
        textContent: opt.label,
      });
      btn.addEventListener('click', () => {
        if (format === opt.value) return;
        if (!confirm(`Switch to "${opt.label}"? Current pages will be replaced.`)) return;
        format = opt.value; pages = defaultPages(format); activeIdx = 0; selectedElId = null;
        syncHidden(); render();
      });
      bar.appendChild(btn);
    });
    const hint = el('span', { className: 'azm-format-hint' });
    if (format === 'mini-zine') {
      hint.textContent = '8 pages — fixed';
    } else {
      const n = pages.length, rem = n % 4;
      hint.textContent = rem
        ? `${n} pages — add ${4 - rem} more for valid booklet`
        : `${n} pages — ${n/4} sheet${n/4!==1?'s':''}`;
      if (rem) hint.className += ' warning';
    }
    bar.appendChild(hint);

    // Zine export/import (transfers all pages+format across posts and sites)
    function azmModal(title, bodyHTML, buttons) {
      const overlay = el('div', { className: 'azm-modal-overlay' });
      const box     = el('div', { className: 'azm-modal' });
      box.appendChild(el('h3', { className: 'azm-modal-title', textContent: title }));
      const body = el('div', { className: 'azm-modal-body' });
      body.innerHTML = bodyHTML;
      box.appendChild(body);
      const foot = el('div', { className: 'azm-modal-foot' });
      buttons.forEach(({ label, className, onClick }) => {
        const btn = el('button', { type: 'button', className: 'azm-tool-btn ' + (className || ''), textContent: label });
        btn.addEventListener('click', () => onClick(overlay, body));
        foot.appendChild(btn);
      });
      box.appendChild(foot);
      overlay.appendChild(box);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
      return { overlay, body };
    }

    const exportBtn = el('button', { type: 'button', className: 'azm-format-btn azm-zine-copy-btn', textContent: 'Export Zine' });
    exportBtn.addEventListener('click', () => {
      const data = JSON.stringify({ azm: true, version: 1, format, pages });
      localStorage.setItem('azm_clipboard', data);
      azmModal(
        'Export Zine',
        '<p style="margin:0 0 8px;font-size:12px;opacity:.7">Select all and copy, then paste into Import Zine on another post or site.</p><textarea class="azm-export-ta" readonly></textarea>',
        [{ label: 'Close', className: '', onClick: (ov) => ov.remove() }]
      );
      const ta = document.querySelector('.azm-export-ta');
      if (ta) { ta.value = data; ta.focus(); ta.select(); }
    });

    const importBtn = el('button', { type: 'button', className: 'azm-format-btn azm-zine-paste-btn', textContent: 'Import Zine' });
    importBtn.addEventListener('click', () => {
      const { overlay, body } = azmModal(
        'Import Zine',
        '<p style="margin:0 0 8px;font-size:12px;opacity:.7">Paste exported zine data below, then click Import.</p><textarea class="azm-import-ta" placeholder="Paste zine data here…"></textarea>',
        [
          { label: 'Cancel', className: '', onClick: (ov) => ov.remove() },
          { label: 'Import', className: 'active', onClick: (ov, bd) => {
            const raw = bd.querySelector('.azm-import-ta').value.trim();
            let data;
            try { data = JSON.parse(raw); } catch (_) { alert('Not valid zine data.'); return; }
            if (!data.azm || !Array.isArray(data.pages)) { alert('Not valid zine data.'); return; }
            if (!confirm('Import zine? This will replace all current pages.')) return;
            ov.remove();
            format = data.format || format;
            pages = data.pages.map(migratePage);
            activeIdx = 0; selectedElId = null;
            syncHidden(); render();
          }},
        ]
      );
      const stored = localStorage.getItem('azm_clipboard');
      if (stored) body.querySelector('.azm-import-ta').value = stored;
    });

    bar.appendChild(exportBtn);
    bar.appendChild(importBtn);
    return bar;
  }

  // ===== Sidebar =====

  function renderSidebar() {
    const aside = el('div', { className: 'azm-pages-sidebar' });
    aside.appendChild(el('div', { className: 'azm-pages-sidebar-header', textContent: 'Pages' }));
    const list = el('div', { className: 'azm-pages-list' });

    pages.forEach((p, i) => {
      const thumb = el('div', { className: 'azm-page-thumb' + (i === activeIdx ? ' active' : '') });
      const inner = el('div', { className: 'azm-page-thumb-inner' });
      inner.style.background = p.bgColor;

      (p.elements || []).forEach(e => {
        const dot = el('div', { className: 'azm-thumb-el' });
        const rot = e.rotation ? `rotate(${e.rotation}deg)` : '';
        dot.style.cssText = `left:${e.x}%;top:${e.y}%;width:${e.w}%;height:${e.h}%;${rot ? 'transform:' + rot + ';' : ''}`;
        if (e.type === 'text') {
          dot.style.color      = e.color || '#1a1a1a';
          dot.style.fontSize   = '4px';
          dot.style.fontFamily = e.fontFamily || 'Georgia,serif';
          dot.style.fontWeight = e.bold   ? 'bold'   : 'normal';
          dot.style.fontStyle  = e.italic ? 'italic' : 'normal';
          dot.style.textAlign  = e.align  || 'left';
          dot.textContent      = (e.content || '').slice(0, 40);
        } else if (e.type === 'image' && e.url) {
          const bx = e.bgOffsetX ?? 50, by = e.bgOffsetY ?? 50;
          dot.style.backgroundImage    = `url(${e.url})`;
          dot.style.backgroundSize     = e.bgScale != null ? e.bgScale + '%' : 'cover';
          dot.style.backgroundPosition = `${bx}% ${by}%`;
        } else if (e.type === 'shape') {
          const br = (e.shapeType === 'circle') ? '50%' : '0%';
          dot.style.background    = e.fill || '#cccccc';
          dot.style.borderRadius  = br;
          if (e.strokeWidth > 0 && e.strokeColor) {
            dot.style.border     = `1px solid ${e.strokeColor}`;
            dot.style.boxSizing  = 'border-box';
          }
        }
        inner.appendChild(dot);
      });

      thumb.appendChild(el('div', { className: 'azm-page-thumb-num', textContent: i + 1 }));
      thumb.appendChild(inner);

      // Spread toggle (not available on covers)
      if (!isCoverPage(i)) {
        const spreadBtn = el('button', {
          type: 'button',
          className: 'azm-spread-btn' + (p.spread2up ? ' active' : ''),
          textContent: p.spread2up ? '2-up' : '1-up',
          title: p.spread2up ? 'Switch to 1-up (single page)' : 'Switch to 2-up (spread)',
        });
        spreadBtn.addEventListener('click', ev => {
          ev.stopPropagation();
          pages[i].spread2up = !pages[i].spread2up;
          syncHidden(); render();
        });
        thumb.appendChild(spreadBtn);
      }

      if (format !== 'mini-zine' && pages.length > 1) {
        const del = el('button', { className: 'azm-page-thumb-delete', textContent: '×' });
        del.addEventListener('click', ev => { ev.stopPropagation(); deletePage(i); });
        thumb.appendChild(del);
      }
      thumb.addEventListener('click', () => { activeIdx = i; selectedElId = null; lastFocusedTextElId = null; render(); });
      list.appendChild(thumb);
    });

    aside.appendChild(list);
    if (format !== 'mini-zine') {
      const btn = el('button', { className: 'azm-add-page-btn', textContent: '+ Add Page' });
      btn.addEventListener('click', () => {
        pages.push(newPage());
        activeIdx = pages.length - 1;
        selectedElId = null;
        syncHidden(); render();
      });
      aside.appendChild(btn);
    }
    return aside;
  }

  // ===== Canvas Area =====

  function renderCanvasArea() {
    const area   = el('div', { className: 'azm-canvas-area' });
    const page   = pages[activeIdx];
    const selEl  = (page.elements || []).find(e => e.id === selectedElId);

    // Page label row
    if (format === 'mini-zine') {
      const labelRow = el('div', { className: 'azm-page-label-row' });
      labelRow.appendChild(el('span', { className: 'azm-page-label-text', textContent: MINI_LABELS[activeIdx] }));
      area.appendChild(labelRow);
    }

    // Toolbar
    const toolbar = el('div', { className: 'azm-canvas-toolbar' });
    const addTextBtn = el('button', { type: 'button', className: 'azm-tool-btn', textContent: '+ Text' });
    addTextBtn.addEventListener('click', () => addElement('text'));
    const addImgBtn = el('button', { type: 'button', className: 'azm-tool-btn', textContent: '+ Image' });
    addImgBtn.addEventListener('click', () => addElement('image'));
    const addShapeBtn = el('button', { type: 'button', className: 'azm-tool-btn', textContent: '+ Shape' });
    addShapeBtn.addEventListener('click', () => addElement('shape'));
    const drawBtn = el('button', { type: 'button', className: 'azm-tool-btn' + (drawMode ? ' active' : ''), textContent: 'Draw' });
    drawBtn.addEventListener('click', () => {
      drawMode = !drawMode;
      if (drawMode) { selectedElId = null; cropElId = null; selectedDrawingId = null; }
      render();
    });
    const pasteBtn = el('button', { type: 'button', className: 'azm-tool-btn', textContent: 'Paste', title: 'Paste (Ctrl+V)' });
    if (!copiedElement) pasteBtn.style.display = 'none';
    pasteBtn.addEventListener('click', pasteElement);
    const delBtn = el('button', { type: 'button', className: 'azm-tool-btn danger', textContent: 'Delete' });
    if (!selectedElId && !selectedDrawingId) delBtn.disabled = true;
    delBtn.addEventListener('click', deleteSelected);
    toolbar.appendChild(addTextBtn);
    toolbar.appendChild(addImgBtn);
    toolbar.appendChild(addShapeBtn);
    toolbar.appendChild(drawBtn);
    toolbar.appendChild(pasteBtn);
    toolbar.appendChild(delBtn);
    area.appendChild(toolbar);

    // Text formatting toolbar — always rendered to prevent layout jump
    area.appendChild(renderTextToolbar(selEl && selEl.type === 'text' ? selEl : null));

    // Canvas
    const is2up   = !isCoverPage(activeIdx) && !!page.spread2up;
    const wrapper = el('div', { className: 'azm-canvas-wrapper' + (is2up ? ' azm-spread' : '') });
    const canvas  = el('div', { className: 'azm-canvas' + (drawMode ? ' azm-draw-mode' : '') + (is2up ? ' azm-canvas--spread' : '') });
    canvas.style.background = page.bgColor;
    canvas.addEventListener('mousedown', ev => {
      if (drawMode) {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        activeDrawStroke = [{ x: (ev.clientX - rect.left) / rect.width * 100, y: (ev.clientY - rect.top) / rect.height * 100 }];
        return;
      }
      if (ev.target === canvas) { selectedElId = null; cropElId = null; selectedDrawingId = null; render(); }
    });
    canvas.addEventListener('mousemove', ev => {
      if (!drawMode || !activeDrawStroke) return;
      const rect = canvas.getBoundingClientRect();
      activeDrawStroke.push({ x: (ev.clientX - rect.left) / rect.width * 100, y: (ev.clientY - rect.top) / rect.height * 100 });
      renderDrawOverlay(canvas, page.drawings, activeDrawStroke);
    });
    canvas.addEventListener('mouseup', ev => {
      if (!drawMode || !activeDrawStroke) return;
      if (activeDrawStroke.length > 1) {
        if (!page.drawings) page.drawings = [];
        page.drawings.push({ id: uid(), points: activeDrawStroke, color: drawColor, width: drawWidth, tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0 });
        syncHidden();
      }
      activeDrawStroke = null;
      renderDrawOverlay(canvas, page.drawings, null);
    });
    (page.elements || []).forEach(elem => canvas.appendChild(renderElement(elem, canvas)));

    // SVG drawing overlay
    const drawOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawOverlay.setAttribute('class', 'azm-draw-overlay');
    drawOverlay.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    drawOverlay.setAttribute('viewBox', '0 0 100 100');
    drawOverlay.setAttribute('preserveAspectRatio', 'none');
    const drawSelectHandler = drawMode ? null : (id) => { selectedDrawingId = id; selectedElId = null; cropElId = null; render(); };
    (page.drawings || []).forEach(stroke => {
      if (!stroke.id) stroke.id = uid();
      drawOverlay.appendChild(makeStrokePath(stroke, false, stroke.id === selectedDrawingId, drawSelectHandler));
    });
    canvas.appendChild(drawOverlay);

    // Drawing selection handles (above SVG overlay)
    if (selectedDrawingId && !drawMode) {
      const selStroke = (page.drawings || []).find(d => d.id === selectedDrawingId);
      if (selStroke) canvas.appendChild(renderDrawingHandles(selStroke, canvas));
    }

    wrapper.appendChild(canvas);
    area.appendChild(wrapper);
    return area;
  }

  function makeStrokePath(stroke, isActive, isSelected, onSelect) {
    if (!stroke.id) stroke.id = uid();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-stroke-id', stroke.id);
    const bbox = strokeBbox(stroke);
    g.setAttribute('transform', strokeTransform(stroke, bbox));

    if (onSelect) {
      g.setAttribute('pointer-events', 'auto');
      g.style.cursor = 'pointer';
      g.addEventListener('click', ev => { ev.stopPropagation(); onSelect(stroke.id); });
    }

    if (isSelected) {
      const outline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      outline.setAttribute('points', stroke.points.map(p => `${p.x},${p.y}`).join(' '));
      outline.setAttribute('stroke', 'rgba(0,120,255,0.55)');
      outline.setAttribute('stroke-width', (stroke.width || 3) * 0.3 + 5);
      outline.setAttribute('stroke-linecap', 'round');
      outline.setAttribute('stroke-linejoin', 'round');
      outline.setAttribute('fill', 'none');
      outline.setAttribute('pointer-events', 'none');
      g.appendChild(outline);
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    path.setAttribute('points', stroke.points.map(p => `${p.x},${p.y}`).join(' '));
    path.setAttribute('stroke', stroke.color || '#1a1a1a');
    path.setAttribute('stroke-width', (stroke.width || 3) * 0.3);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('fill', 'none');
    path.setAttribute('pointer-events', 'none');
    if (isActive) path.setAttribute('opacity', '0.7');
    g.appendChild(path);

    if (onSelect) {
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      hit.setAttribute('points', stroke.points.map(p => `${p.x},${p.y}`).join(' '));
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', Math.max((stroke.width || 3) * 0.3 + 5, 7));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('pointer-events', 'stroke');
      g.appendChild(hit);
    }

    return g;
  }

  function renderDrawOverlay(canvas, drawings, activeStroke) {
    const svg = canvas.querySelector('.azm-draw-overlay');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const drawSelectHandler = drawMode ? null : (id) => { selectedDrawingId = id; selectedElId = null; cropElId = null; render(); };
    (drawings || []).forEach(stroke => {
      if (!stroke.id) stroke.id = uid();
      svg.appendChild(makeStrokePath(stroke, false, stroke.id === selectedDrawingId, drawSelectHandler));
    });
    if (activeStroke && activeStroke.length > 1) {
      svg.appendChild(makeStrokePath({ points: activeStroke, color: drawColor, width: drawWidth }, true, false, null));
    }
  }

  // ===== Text Toolbar =====

  function renderTextToolbar(e) {
    // e may be null when no text element selected — toolbar still renders for stable layout
    const hidden = !e;
    const t = e || { id: null, fontFamily: 'Georgia, serif', fontSize: 14, bold: false, italic: false, align: 'left', color: '#1a1a1a' };
    const tb = el('div', { className: 'azm-text-toolbar' });
    if (hidden) { tb.style.visibility = 'hidden'; tb.style.pointerEvents = 'none'; }

    const fontPicker = el('div', { className: 'azm-font-picker' });
    const currentLabel = (FONTS.find(([val]) => val === t.fontFamily) || FONTS[0])[1];
    const fontBtn = el('button', { type: 'button', className: 'azm-font-picker-btn', textContent: currentLabel });
    fontBtn.style.fontFamily = t.fontFamily;
    const fontDropdown = el('div', { className: 'azm-font-dropdown' });
    if (!hidden) {
      FONTS.forEach(([val, label]) => {
        const opt = el('div', { className: 'azm-font-opt' + (val === t.fontFamily ? ' active' : '') });
        opt.style.fontFamily = val;
        opt.textContent = label;
        opt.addEventListener('mousedown', ev => { ev.preventDefault(); updateEl(t.id, { fontFamily: val }); });
        fontDropdown.appendChild(opt);
      });
      fontBtn.addEventListener('click', ev => { ev.stopPropagation(); fontPicker.classList.toggle('open'); });
      document.addEventListener('mousedown', function closePicker(ev) {
        if (!fontPicker.contains(ev.target)) { fontPicker.classList.remove('open'); document.removeEventListener('mousedown', closePicker); }
      });
    }
    fontPicker.appendChild(fontBtn);
    fontPicker.appendChild(fontDropdown);

    const sizeSel = el('select', { className: 'azm-tt-select azm-tt-size' });
    [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80].forEach(s => {
      const o = el('option', { value: s, textContent: s });
      if (s === t.fontSize) o.selected = true;
      sizeSel.appendChild(o);
    });
    if (!hidden) sizeSel.addEventListener('change', () => updateEl(t.id, { fontSize: +sizeSel.value }));

    const boldBtn = el('button', { type: 'button', className: 'azm-tt-btn' + (t.bold ? ' active' : ''), textContent: 'B' });
    boldBtn.style.fontWeight = 'bold';
    if (!hidden) boldBtn.addEventListener('click', () => updateEl(t.id, { bold: !t.bold }));

    const italicBtn = el('button', { type: 'button', className: 'azm-tt-btn' + (t.italic ? ' active' : ''), textContent: 'I' });
    italicBtn.style.fontStyle = 'italic';
    if (!hidden) italicBtn.addEventListener('click', () => updateEl(t.id, { italic: !t.italic }));

    const alignBtns = [];
    [['L','left'],['C','center'],['R','right']].forEach(([label, a]) => {
      const btn = el('button', { type: 'button', className: 'azm-tt-btn' + (t.align === a ? ' active' : ''), textContent: label });
      btn.title = a;
      if (!hidden) btn.addEventListener('click', () => updateEl(t.id, { align: a }));
      alignBtns.push(btn);
    });

    const colorInp = el('input', { type: 'color', value: t.color || '#1a1a1a', className: 'azm-tt-color' });
    colorInp.title = 'Text color';
    if (!hidden) colorInp.addEventListener('input', () => updateEl(t.id, { color: colorInp.value }));

    // Row 1: font family + font size
    const row1 = el('div', { className: 'azm-tt-row' });
    row1.appendChild(fontPicker);
    row1.appendChild(sizeSel);

    // Row 2: bold, italic, alignment, color
    const row2 = el('div', { className: 'azm-tt-row' });
    row2.appendChild(boldBtn);
    row2.appendChild(italicBtn);
    alignBtns.forEach(b => row2.appendChild(b));
    const spacer = el('div');
    spacer.style.flex = '1';
    row2.appendChild(spacer);
    row2.appendChild(colorInp);

    tb.appendChild(row1);
    tb.appendChild(row2);
    return tb;
  }

  // ===== Element Renderer =====

  function renderElement(elem, canvas) {
    const wrap = el('div', { className: 'azm-element' + (elem.id === selectedElId ? ' selected' : '') });
    wrap.dataset.elId = elem.id;
    wrap.style.cssText = `left:${elem.x}%;top:${elem.y}%;width:${elem.w}%;height:${elem.h}%;`;
    if (elem.rotation) wrap.style.transform = `rotate(${elem.rotation}deg)`;

    if (elem.type === 'shape') {
      const shape = el('div', { className: 'azm-el-shape' });
      shape.style.opacity      = elem.opacity != null ? elem.opacity : 1;
      shape.style.background   = elem.fillColor || '#4a90d9';
      shape.style.borderRadius = (elem.borderRadius || 0) + '%';
      if (elem.strokeColor && elem.strokeWidth) {
        shape.style.border    = `${elem.strokeWidth}px solid ${elem.strokeColor}`;
        shape.style.boxSizing = 'border-box';
      }
      wrap.appendChild(shape);

    } else if (elem.type === 'text') {
      const content = el('div', { className: 'azm-el-text' });
      content.textContent = elem.content;
      content.style.cssText = [
        `font-family:${elem.fontFamily}`,
        `font-size:${elem.fontSize}px`,
        `font-weight:${elem.bold   ? 'bold'   : 'normal'}`,
        `font-style:${elem.italic  ? 'italic' : 'normal'}`,
        `text-align:${elem.align}`,
        `color:${elem.color}`,
      ].join(';');
      content.addEventListener('dblclick', ev => {
        ev.stopPropagation();
        isEditing = true;
        content.contentEditable = 'true';
        content.focus();
        // move cursor to click position
        const sel = window.getSelection();
        if (sel && sel.rangeCount) sel.collapseToEnd();
        wrap.classList.add('editing');
      });
      content.addEventListener('blur', () => {
        isEditing = false;
        content.contentEditable = 'false';
        wrap.classList.remove('editing');
        updateEl(elem.id, { content: content.innerText });
      });
      content.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { content.blur(); return; }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'b') {
          ev.preventDefault();
          const elData = pages[activeIdx].elements.find(e => e.id === elem.id);
          if (elData) { elData.bold = !elData.bold; content.style.fontWeight = elData.bold ? 'bold' : 'normal'; syncHidden(); }
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'i') {
          ev.preventDefault();
          const elData = pages[activeIdx].elements.find(e => e.id === elem.id);
          if (elData) { elData.italic = !elData.italic; content.style.fontStyle = elData.italic ? 'italic' : 'normal'; syncHidden(); }
        }
      });
      wrap.appendChild(content);

    } else if (elem.type === 'image') {
      const isCropping = cropElId === elem.id;
      const imgDiv = el('div', { className: 'azm-el-image' + (isCropping ? ' cropping' : '') });
      if (elem.url) {
        imgDiv.style.backgroundImage = `url(${elem.url})`;
        if (elem.bgScale != null) {
          imgDiv.style.backgroundSize     = elem.bgScale + '%';
          imgDiv.style.backgroundPosition = `${elem.bgOffsetX || 50}% ${elem.bgOffsetY || 50}%`;
        } else {
          imgDiv.style.backgroundSize     = 'cover';
          imgDiv.style.backgroundPosition = 'center';
        }
        if (isCropping) {
          imgDiv.style.cursor = 'grab';
          let cropDrag = null;
          imgDiv.addEventListener('mousedown', ev => {
            ev.stopPropagation();
            cropDrag = { sx: ev.clientX, sy: ev.clientY,
              ox: elem.bgOffsetX != null ? elem.bgOffsetX : 50,
              oy: elem.bgOffsetY != null ? elem.bgOffsetY : 50 };
            imgDiv.style.cursor = 'grabbing';
          });
          document.addEventListener('mousemove', function onCropMove(ev) {
            if (!cropDrag) return;
            const scale = elem.bgScale != null ? elem.bgScale : 100;
            const sensitivity = 0.15 * (100 / Math.max(scale, 1));
            const nx = Math.max(0, Math.min(100, cropDrag.ox - (ev.clientX - cropDrag.sx) * sensitivity));
            const ny = Math.max(0, Math.min(100, cropDrag.oy - (ev.clientY - cropDrag.sy) * sensitivity));
            updateEl(elem.id, { bgOffsetX: nx, bgOffsetY: ny });
            imgDiv.style.backgroundPosition = `${nx}% ${ny}%`;
          });
          document.addEventListener('mouseup', function onCropUp() {
            if (cropDrag) { cropDrag = null; imgDiv.style.cursor = 'grab'; }
          }, { once: true });
          imgDiv.addEventListener('wheel', ev => {
            ev.preventDefault();
            const current = elem.bgScale != null ? elem.bgScale : 100;
            const next = Math.max(50, Math.min(300, current - ev.deltaY * 0.2));
            updateEl(elem.id, { bgScale: next });
            imgDiv.style.backgroundSize = next + '%';
          }, { passive: false });
          const doneBtn = el('button', { className: 'azm-crop-done-btn', textContent: 'Done cropping' });
          doneBtn.addEventListener('mousedown', ev => ev.stopPropagation());
          doneBtn.addEventListener('click', ev => { ev.stopPropagation(); cropElId = null; render(); });
          imgDiv.appendChild(doneBtn);
        } else {
          const replaceBtn = el('button', { className: 'azm-el-image-replace-btn', textContent: 'Replace image' });
          replaceBtn.addEventListener('mousedown', ev => ev.stopPropagation());
          replaceBtn.addEventListener('click', ev => { ev.stopPropagation(); openMediaPicker(elem.id); });
          imgDiv.appendChild(replaceBtn);
        }
      } else {
        const addBtn = el('button', { className: 'azm-el-image-add-btn', textContent: '+ Add Image' });
        addBtn.addEventListener('mousedown', ev => ev.stopPropagation());
        addBtn.addEventListener('click', ev => { ev.stopPropagation(); openMediaPicker(elem.id); });
        imgDiv.appendChild(addBtn);
      }
      wrap.appendChild(imgDiv);
    }

    // Rotation handle
    const rotHandle = el('div', { className: 'azm-rotate-handle' });
    rotHandle.title = 'Rotate';
    rotHandle.addEventListener('mousedown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      selectedElId = elem.id;
      startRotate(ev, elem);
    });
    wrap.appendChild(rotHandle);

    // Resize handles
    ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
      const handle = el('div', { className: `azm-handle azm-handle-${dir}` });
      handle.addEventListener('mousedown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        selectedElId = elem.id;
        startDrag(ev, 'resize', dir, elem, canvas);
      });
      wrap.appendChild(handle);
    });

    wrap.addEventListener('mousedown', ev => {
      if (ev.target.classList.contains('azm-handle'))              return;
      if (ev.target.classList.contains('azm-rotate-handle'))       return;
      if (ev.target.classList.contains('azm-el-image-add-btn'))    return;
      if (ev.target.classList.contains('azm-el-image-replace-btn')) return;
      if (ev.target.classList.contains('azm-crop-done-btn'))       return;
      if (cropElId === elem.id) return; // panning handled inside imgDiv
      if (isEditing && selectedElId === elem.id) return;
      ev.stopPropagation();
      if (elem.type === 'text') lastFocusedTextElId = elem.id;
      const alreadySelected = selectedElId === elem.id;
      selectedElId = elem.id;
      selectedDrawingId = null;
      startDrag(ev, 'move', null, elem, canvas);
      if (!alreadySelected) render();
    });

    wrap.addEventListener('click', ev => { ev.stopPropagation(); });

    return wrap;
  }

  // ===== Drag / Resize =====

  function startDrag(ev, type, handle, elem, canvas) {
    const rect = canvas.getBoundingClientRect();
    dragState = {
      type, handle,
      startX: ev.clientX, startY: ev.clientY,
      orig: { x: elem.x, y: elem.y, w: elem.w, h: elem.h },
      elId: elem.id,
      cw: rect.width, ch: rect.height,
      moved: false,
    };
    const onMove = e => { dragState.moved = true; onDragMove(e); };
    const onUp   = () => {
      const didMove = dragState && dragState.moved;
      dragState = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncHidden();
      if (didMove) render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onDragMove(ev) {
    if (!dragState) return;
    const { type, handle, startX, startY, orig, elId, cw, ch } = dragState;
    const dx = ((ev.clientX - startX) / cw) * 100;
    const dy = ((ev.clientY - startY) / ch) * 100;
    const elemData = pages[activeIdx].elements.find(e => e.id === elId);
    if (!elemData) return;

    if (type === 'move') {
      elemData.x = clamp(orig.x + dx, 0, 100 - orig.w);
      elemData.y = clamp(orig.y + dy, 0, 100 - orig.h);
    } else {
      let { x, y, w, h } = orig;
      if (handle.includes('e')) { w = Math.max(5, orig.w + dx); }
      if (handle.includes('s')) { h = Math.max(5, orig.h + dy); }
      if (handle.includes('w')) { x = orig.x + dx; w = Math.max(5, orig.w - dx); }
      if (handle.includes('n')) { y = orig.y + dy; h = Math.max(5, orig.h - dy); }
      elemData.x = x; elemData.y = y; elemData.w = w; elemData.h = h;
    }

    const wrap = document.querySelector(`[data-el-id="${elId}"]`);
    if (wrap) {
      wrap.style.left   = elemData.x + '%';
      wrap.style.top    = elemData.y + '%';
      wrap.style.width  = elemData.w + '%';
      wrap.style.height = elemData.h + '%';
    }
  }

  // ===== Rotation =====

  function startRotate(ev, elem) {
    const canvas   = document.querySelector('.azm-canvas');
    const cRect    = canvas.getBoundingClientRect();
    // element center in screen coords
    const cx = cRect.left + ((elem.x + elem.w / 2) / 100) * cRect.width;
    const cy = cRect.top  + ((elem.y + elem.h / 2) / 100) * cRect.height;

    const startAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    const origRot    = elem.rotation || 0;

    const onMove = e => {
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      let newRot  = (origRot + (angle - startAngle)) % 360;
      if (newRot < 0) newRot += 360;
      const elData = pages[activeIdx].elements.find(e => e.id === elem.id);
      if (!elData) return;
      elData.rotation = Math.round(newRot);
      const wrap = document.querySelector(`[data-el-id="${elem.id}"]`);
      if (wrap) wrap.style.transform = `rotate(${elData.rotation}deg)`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncHidden(); render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ===== Drawing Transform =====

  function renderDrawingHandles(stroke, canvas) {
    const bbox = strokeBbox(stroke);
    const tx = stroke.tx || 0, ty = stroke.ty || 0;
    const sx = stroke.scaleX != null ? stroke.scaleX : 1;
    const sy = stroke.scaleY != null ? stroke.scaleY : 1;
    const rot = stroke.rotation || 0;

    const div = el('div', { className: 'azm-element azm-drawing-handles' });
    div.style.left      = (bbox.x + tx) + '%';
    div.style.top       = (bbox.y + ty) + '%';
    div.style.width     = (bbox.w * sx) + '%';
    div.style.height    = (bbox.h * sy) + '%';
    div.style.transform = `rotate(${rot}deg)`;
    div.style.zIndex    = '10';
    div.style.cursor    = 'move';

    const rotHandle = el('div', { className: 'azm-rotate-handle' });
    rotHandle.addEventListener('mousedown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      startDrawingRotate(ev, stroke, canvas);
    });
    div.appendChild(rotHandle);

    ['nw', 'ne', 'se', 'sw'].forEach(dir => {
      const h = el('div', { className: `azm-handle azm-handle-${dir}` });
      h.addEventListener('mousedown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        startDrawingDrag(ev, 'resize', dir, stroke, canvas);
      });
      div.appendChild(h);
    });

    div.addEventListener('mousedown', ev => {
      if (ev.target.classList.contains('azm-handle')) return;
      if (ev.target.classList.contains('azm-rotate-handle')) return;
      ev.stopPropagation(); ev.preventDefault();
      startDrawingDrag(ev, 'move', null, stroke, canvas);
    });
    div.addEventListener('click', ev => ev.stopPropagation());
    return div;
  }

  function startDrawingDrag(ev, type, handle, stroke, canvas) {
    const rect  = canvas.getBoundingClientRect();
    const bbox  = strokeBbox(stroke);
    drawDragState = {
      type, handle,
      startX: ev.clientX, startY: ev.clientY,
      orig: {
        tx: stroke.tx || 0, ty: stroke.ty || 0,
        scaleX: stroke.scaleX != null ? stroke.scaleX : 1,
        scaleY: stroke.scaleY != null ? stroke.scaleY : 1,
        bboxW: bbox.w, bboxH: bbox.h,
      },
      strokeId: stroke.id,
      cw: rect.width, ch: rect.height,
    };
    const onMove = e => onDrawingDragMove(e);
    const onUp   = () => {
      drawDragState = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncHidden(); render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onDrawingDragMove(ev) {
    if (!drawDragState) return;
    const { type, handle, startX, startY, orig, strokeId, cw, ch } = drawDragState;
    const dx = ((ev.clientX - startX) / cw) * 100;
    const dy = ((ev.clientY - startY) / ch) * 100;
    const page   = pages[activeIdx];
    const stroke = (page.drawings || []).find(d => d.id === strokeId);
    if (!stroke) return;

    if (type === 'move') {
      stroke.tx = orig.tx + dx;
      stroke.ty = orig.ty + dy;
    } else {
      // Resize: opposite edge stays fixed, center shifts by half the delta
      stroke.tx = orig.tx + dx / 2;
      stroke.ty = orig.ty + dy / 2;
      if (handle.includes('e')) stroke.scaleX = Math.max(0.1, orig.scaleX + dx / orig.bboxW);
      if (handle.includes('w')) stroke.scaleX = Math.max(0.1, orig.scaleX - dx / orig.bboxW);
      if (handle.includes('s')) stroke.scaleY = Math.max(0.1, orig.scaleY + dy / orig.bboxH);
      if (handle.includes('n')) stroke.scaleY = Math.max(0.1, orig.scaleY - dy / orig.bboxH);
    }

    // Live-update SVG transform
    const svg = document.querySelector('.azm-draw-overlay');
    if (svg) {
      const g = svg.querySelector(`[data-stroke-id="${strokeId}"]`);
      if (g) g.setAttribute('transform', strokeTransform(stroke));
    }
    // Live-update handles div
    const bbox = strokeBbox(stroke);
    const div  = document.querySelector('.azm-drawing-handles');
    if (div) {
      div.style.left   = (bbox.x + (stroke.tx || 0)) + '%';
      div.style.top    = (bbox.y + (stroke.ty || 0)) + '%';
      div.style.width  = (bbox.w * (stroke.scaleX || 1)) + '%';
      div.style.height = (bbox.h * (stroke.scaleY || 1)) + '%';
    }
  }

  function startDrawingRotate(ev, stroke, canvas) {
    const cRect = canvas.getBoundingClientRect();
    const bbox  = strokeBbox(stroke);
    const tx = stroke.tx || 0, ty = stroke.ty || 0;
    const sx = stroke.scaleX != null ? stroke.scaleX : 1;
    const sy = stroke.scaleY != null ? stroke.scaleY : 1;
    const screenCx = cRect.left + ((bbox.x + tx + bbox.w * sx / 2) / 100) * cRect.width;
    const screenCy = cRect.top  + ((bbox.y + ty + bbox.h * sy / 2) / 100) * cRect.height;
    const startAngle = Math.atan2(ev.clientY - screenCy, ev.clientX - screenCx) * 180 / Math.PI;
    const origRot    = stroke.rotation || 0;

    const onMove = e => {
      const angle  = Math.atan2(e.clientY - screenCy, e.clientX - screenCx) * 180 / Math.PI;
      let   newRot = (origRot + (angle - startAngle)) % 360;
      if (newRot < 0) newRot += 360;
      stroke.rotation = Math.round(newRot);
      const svg = document.querySelector('.azm-draw-overlay');
      if (svg) {
        const g = svg.querySelector(`[data-stroke-id="${stroke.id}"]`);
        if (g) g.setAttribute('transform', strokeTransform(stroke));
      }
      const div = document.querySelector('.azm-drawing-handles');
      if (div) div.style.transform = `rotate(${newRot}deg)`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncHidden(); render();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ===== Element CRUD =====

  function addElement(type) {
    let elem;
    if (type === 'text') {
      elem = newTextEl('', 10, 10, 80, 20, { fontSize: 16 });
      pages[activeIdx].elements.push(elem);
      selectedElId = elem.id;
      syncHidden();
      render();
      // auto-enter edit mode
      requestAnimationFrame(() => {
        const content = document.querySelector(`[data-el-id="${elem.id}"] .azm-el-text`);
        if (content) {
          isEditing = true;
          content.contentEditable = 'true';
          content.focus();
          content.closest('.azm-element').classList.add('editing');
        }
      });
    } else if (type === 'shape') {
      elem = newShapeEl('rect', 10, 10, 40, 40);
      pages[activeIdx].elements.push(elem);
      selectedElId = elem.id;
      drawMode = false;
      syncHidden();
      render();
    } else {
      elem = newImageEl('', 10, 10, 80, 50);
      pages[activeIdx].elements.push(elem);
      selectedElId = elem.id;
      drawMode = false;
      syncHidden();
      render();
    }
  }

  function deleteSelected() {
    const page = pages[activeIdx];
    if (selectedDrawingId) {
      page.drawings = (page.drawings || []).filter(d => d.id !== selectedDrawingId);
      selectedDrawingId = null;
      syncHidden(); render();
    } else if (selectedElId) {
      page.elements = (page.elements || []).filter(e => e.id !== selectedElId);
      selectedElId = null;
      syncHidden(); render();
    }
  }

  function updateEl(id, props) {
    const elemData = (pages[activeIdx].elements || []).find(e => e.id === id);
    if (!elemData) return;
    Object.assign(elemData, props);
    syncHidden(); render();
  }

  function moveElementLayer(id, direction) {
    const elems = pages[activeIdx].elements || [];
    const idx = elems.findIndex(e => e.id === id);
    if (idx === -1) return;
    if (direction === 'front')    { elems.push(elems.splice(idx, 1)[0]); }
    else if (direction === 'back') { elems.unshift(elems.splice(idx, 1)[0]); }
    else if (direction === 'forward'  && idx < elems.length - 1) { [elems[idx], elems[idx+1]] = [elems[idx+1], elems[idx]]; }
    else if (direction === 'backward' && idx > 0)                { [elems[idx], elems[idx-1]] = [elems[idx-1], elems[idx]]; }
    syncHidden(); render();
  }

  // ===== Media Picker =====

  function openMediaPicker(elId) {
    const frame = wp.media({ title: 'Select Image', button: { text: 'Use this image' }, multiple: false });
    frame.on('select', () => {
      const url = frame.state().get('selection').first().toJSON().url;
      updateEl(elId, { url });
    });
    frame.open();
  }

  // ===== Props Panel =====

  function renderPropsPanel() {
    const panel = el('div', { className: 'azm-props-panel' });
    const page  = pages[activeIdx];

    // Page background
    const bgSection = el('div', { className: 'azm-props-section' });
    bgSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Page' }));
    const bgRow = el('div', { className: 'azm-color-row' });
    bgRow.appendChild(el('label', { textContent: 'Background' }));
    const bgInp = el('input', { type: 'color', value: page.bgColor });
    bgInp.addEventListener('input', () => {
      pages[activeIdx].bgColor = bgInp.value;
      syncHidden();
      const c = document.querySelector('.azm-canvas');
      if (c) c.style.background = bgInp.value;
    });
    bgRow.appendChild(bgInp);
    bgSection.appendChild(bgRow);
    panel.appendChild(bgSection);

    // Selected element props
    const selEl2 = (page.elements || []).find(e => e.id === selectedElId);
    if (selEl2 && selEl2.type === 'shape') {
      const shapeSection = el('div', { className: 'azm-props-section' });
      shapeSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Shape' }));

      // Shape type selector
      const typeRow = el('div', { className: 'azm-color-row' });
      typeRow.appendChild(el('label', { textContent: 'Type' }));
      const typeSelect = el('select', { className: 'azm-select' });
      [['rect','Rectangle'],['circle','Circle']].forEach(([val, label]) => {
        const opt = el('option', { value: val, textContent: label });
        if ((selEl2.shapeType || 'rect') === val) opt.selected = true;
        typeSelect.appendChild(opt);
      });
      typeSelect.addEventListener('change', () => {
        const newType = typeSelect.value;
        updateEl(selEl2.id, { shapeType: newType, borderRadius: newType === 'circle' ? 50 : 0 });
      });
      typeRow.appendChild(typeSelect);
      shapeSection.appendChild(typeRow);

      const fillRow = el('div', { className: 'azm-color-row' });
      fillRow.appendChild(el('label', { textContent: 'Fill' }));
      const fillInp = el('input', { type: 'color', value: selEl2.fillColor || '#4a90d9' });
      fillInp.addEventListener('input', () => updateEl(selEl2.id, { fillColor: fillInp.value }));
      fillRow.appendChild(fillInp);
      shapeSection.appendChild(fillRow);

      const currentShapeType = selEl2.shapeType || 'rect';
      const strokeRow = el('div', { className: 'azm-color-row' });
      strokeRow.appendChild(el('label', { textContent: 'Border' }));
      const strokeInp = el('input', { type: 'color', value: selEl2.strokeColor || '#1a1a1a' });
      strokeInp.addEventListener('input', () => updateEl(selEl2.id, { strokeColor: strokeInp.value }));
      strokeRow.appendChild(strokeInp);
      const strokeW = el('input', { type: 'range', min: 0, max: 12, value: selEl2.strokeWidth || 0, className: 'azm-slider' });
      strokeW.addEventListener('input', () => updateEl(selEl2.id, { strokeWidth: +strokeW.value }));
      strokeRow.appendChild(strokeW);
      shapeSection.appendChild(strokeRow);

      const opRow = el('div', { className: 'azm-color-row' });
      opRow.appendChild(el('label', { textContent: 'Opacity' }));
      const opSlider = el('input', { type: 'range', min: 0, max: 100, value: Math.round((selEl2.opacity != null ? selEl2.opacity : 1) * 100), className: 'azm-slider' });
      opSlider.addEventListener('input', () => updateEl(selEl2.id, { opacity: +opSlider.value / 100 }));
      opRow.appendChild(opSlider);
      shapeSection.appendChild(opRow);

      if (currentShapeType === 'rect') {
        const rrRow = el('div', { className: 'azm-color-row' });
        rrRow.appendChild(el('label', { textContent: 'Rounded' }));
        const rrSlider = el('input', { type: 'range', min: 0, max: 50, value: selEl2.borderRadius || 0, className: 'azm-slider' });
        rrSlider.addEventListener('input', () => updateEl(selEl2.id, { borderRadius: +rrSlider.value }));
        rrRow.appendChild(rrSlider);
        shapeSection.appendChild(rrRow);
      }

      panel.appendChild(shapeSection);
    }

    if (selEl2 && selEl2.type === 'image' && selEl2.url) {
      const cropSection = el('div', { className: 'azm-props-section' });
      cropSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Image' }));
      const cropBtn = el('button', { type: 'button', className: 'azm-ai-btn full-width' + (cropElId === selEl2.id ? ' active' : ''),
        textContent: cropElId === selEl2.id ? 'Exit Crop Mode' : 'Crop / Zoom' });
      cropBtn.addEventListener('click', () => {
        cropElId = cropElId === selEl2.id ? null : selEl2.id;
        render();
      });
      if (selEl2.bgScale != null) {
        const resetBtn = el('button', { type: 'button', className: 'azm-ai-btn full-width', textContent: 'Reset crop' });
        resetBtn.style.marginTop = '6px';
        resetBtn.addEventListener('click', () => { updateEl(selEl2.id, { bgScale: null, bgOffsetX: 50, bgOffsetY: 50 }); cropElId = null; render(); });
        cropSection.appendChild(cropBtn);
        cropSection.appendChild(resetBtn);
      } else {
        cropSection.appendChild(cropBtn);
      }
      panel.appendChild(cropSection);
    }

    // Layer ordering — visible whenever an element is selected
    if (selEl2) {
      const elems    = page.elements || [];
      const elIdx    = elems.findIndex(e => e.id === selEl2.id);
      const atTop    = elIdx === elems.length - 1;
      const atBottom = elIdx === 0;

      const layerSection = el('div', { className: 'azm-props-section' });
      layerSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Layer' }));
      const layerRow = el('div', { className: 'azm-layer-row' });

      [['⬇⬇', 'back', 'Send to back', atBottom],
       ['↓',  'backward', 'Move backward', atBottom],
       ['↑',  'forward',  'Move forward',  atTop],
       ['⬆⬆', 'front', 'Bring to front', atTop],
      ].forEach(([icon, dir, title, disabled]) => {
        const btn = el('button', { type: 'button', className: 'azm-layer-btn', textContent: icon, title });
        if (disabled) btn.disabled = true;
        btn.addEventListener('click', () => moveElementLayer(selEl2.id, dir));
        layerRow.appendChild(btn);
      });

      layerSection.appendChild(layerRow);
      panel.appendChild(layerSection);
    }

    // Drawing controls (always visible so user can adjust before/after draw mode)
    const drawSection = el('div', { className: 'azm-props-section' });
    drawSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Drawing' }));
    const penRow = el('div', { className: 'azm-color-row' });
    penRow.appendChild(el('label', { textContent: 'Pen color' }));
    const penColorInp = el('input', { type: 'color', value: drawColor });
    penColorInp.addEventListener('input', () => { drawColor = penColorInp.value; });
    penRow.appendChild(penColorInp);
    drawSection.appendChild(penRow);
    const penWRow = el('div', { className: 'azm-color-row' });
    penWRow.appendChild(el('label', { textContent: 'Pen width' }));
    const penWSlider = el('input', { type: 'range', min: 1, max: 20, value: drawWidth, className: 'azm-slider' });
    penWSlider.addEventListener('input', () => { drawWidth = +penWSlider.value; });
    penWRow.appendChild(penWSlider);
    drawSection.appendChild(penWRow);
    if ((page.drawings || []).length > 0) {
      const undoBtn = el('button', { type: 'button', className: 'azm-ai-btn full-width', textContent: 'Undo last stroke' });
      undoBtn.addEventListener('click', () => { page.drawings.pop(); syncHidden(); render(); });
      const clearBtn = el('button', { type: 'button', className: 'azm-ai-btn full-width', textContent: 'Clear all drawings' });
      clearBtn.style.marginTop = '6px';
      clearBtn.addEventListener('click', () => { page.drawings = []; syncHidden(); render(); });
      drawSection.appendChild(undoBtn);
      drawSection.appendChild(clearBtn);
    }
    panel.appendChild(drawSection);

    // AI Disclosure
    const disclosureSection = el('div', { className: 'azm-props-section' });
    disclosureSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'AI Disclosure' }));
    const disclosureDesc = el('p', { className: 'azm-disclosure-desc', textContent: 'Did you use AI to help create this zine?' });
    disclosureSection.appendChild(disclosureDesc);
    const disclosureOptions = [
      { value: '',          label: 'None',          desc: 'No AI was used.' },
      { value: 'assisted',  label: 'AI Assisted',   desc: 'Directed and edited by a human, with AI help.' },
      { value: 'generated', label: 'AI Generated',  desc: 'Created entirely by AI.' },
    ];
    const currentDisclosure = root.dataset.aiDisclosure || '';
    disclosureOptions.forEach(opt => {
      const lbl = el('label', { className: 'azm-disclosure-option' });
      const radio = el('input', { type: 'radio', name: 'azm_disclosure', value: opt.value });
      radio.checked = currentDisclosure === opt.value;
      radio.addEventListener('change', () => {
        root.dataset.aiDisclosure = opt.value;
        // Sync to hidden field for WP save
        let hidden = document.querySelector('input[name="azm_ai_badge"]');
        if (!hidden) {
          hidden = el('input', { type: 'hidden', name: 'azm_ai_badge' });
          document.querySelector('#post')?.appendChild(hidden);
        }
        if (hidden) hidden.value = opt.value;
      });
      const text = el('span');
      text.innerHTML = `<strong>${opt.label}</strong><br><span style="font-size:11px;opacity:.7">${opt.desc}</span>`;
      lbl.appendChild(radio);
      lbl.appendChild(text);
      disclosureSection.appendChild(lbl);
    });
    panel.appendChild(disclosureSection);

    // Export
    const exportSection = el('div', { className: 'azm-props-section' });
    exportSection.appendChild(el('div', { className: 'azm-props-section-title', textContent: 'Export & Share' }));
    const printBtn = el('button', { className: 'azm-export-btn primary', textContent: 'Download PDF' });
    printBtn.addEventListener('click', () => downloadZinePDF(printBtn));
    exportSection.appendChild(printBtn);
    const postId  = root.dataset.postId;
    const viewBtn = el('button', { className: 'azm-export-btn', textContent: 'View Zine' });
    viewBtn.addEventListener('click', () => { if (postId) window.open(`/?p=${postId}`, '_blank'); });
    exportSection.appendChild(viewBtn);
    panel.appendChild(exportSection);

    return panel;
  }

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

  async function downloadZinePDF(btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      await Promise.all([loadLib(JSPDF_CDN), loadLib(H2C_CDN)]);
      await document.fonts.ready;
      if (format === 'a5-booklet') {
        const rem = pages.length % 4;
        if (rem) { alert(`Need ${4 - rem} more page${(4-rem)!==1?'s':''} for a valid booklet.`); return; }
        await downloadBookletPDF();
      } else {
        await downloadMiniZinePDF();
      }
    } catch (err) {
      alert('Could not generate PDF: ' + err.message);
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  function buildPageDiv(page, w, h, skipImages = false) {
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
      child.style.boxSizing = 'border-box';
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
        child.style.whiteSpace = 'pre-wrap';
        child.textContent      = e.content || '';
      } else if (e.type === 'image') {
        if (!e.url || skipImages) return; // skipped when building overlay for composite
        const bx = e.bgOffsetX ?? 50, by = e.bgOffsetY ?? 50;
        child.style.backgroundImage    = `url('${e.url}')`;
        child.style.backgroundSize     = e.bgScale != null ? e.bgScale + '%' : 'cover';
        child.style.backgroundPosition = `${bx}% ${by}%`;
      } else if (e.type === 'shape') {
        const br = (e.shapeType === 'circle') ? '50%' : '0%';
        child.style.background   = e.fill || '#cccccc';
        child.style.borderRadius = br;
        if (e.strokeWidth > 0 && e.strokeColor) {
          child.style.border    = `${e.strokeWidth * scale}px solid ${e.strokeColor}`;
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
        const bx = Math.min(...xs), by2 = Math.min(...ys);
        const cx = bx + (Math.max(...xs) - bx) / 2;
        const cy = by2 + (Math.max(...ys) - by2) / 2;
        const tx = stroke.tx ?? 0, ty = stroke.ty ?? 0;
        const r  = stroke.rotation ?? 0;
        const sx = stroke.scaleX  ?? 1, sy = stroke.scaleY ?? 1;
        const sw = (parseFloat(stroke.width) || 3) * 0.3;
        const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${cx+tx},${cy+ty}) rotate(${r}) scale(${sx},${sy}) translate(${-cx},${-cy})`);
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        poly.setAttribute('points', ptsStr);
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', stroke.color || '#000000');
        poly.setAttribute('stroke-width', sw);
        poly.setAttribute('stroke-linecap', 'round');
        poly.setAttribute('stroke-linejoin', 'round');
        g.appendChild(poly);
        svg.appendChild(g);
      });
      div.appendChild(svg);
    }

    return div;
  }

  async function capture(elem) {
    return window.html2canvas(elem, {
      scale: 3, useCORS: true, allowTaint: true,
      backgroundColor: null, logging: false,
    });
  }

  async function capturePageCanvas(pg, w, h) {
    const H2C_SCALE = 3; // must match capture() scale
    const cw = Math.round(w * H2C_SCALE);
    const ch = Math.round(h * H2C_SCALE);

    // Output canvas — fill background colour
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    const ctx = out.getContext('2d');
    ctx.fillStyle = pg.bgColor || '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    // Pass 1: draw images at native source quality using canvas drawImage
    const imgEls = (pg.elements || []).filter(e => e.type === 'image' && e.url);
    if (imgEls.length) {
      const loaded = await Promise.all(imgEls.map(e => new Promise(res => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => res(null);
        img.src = e.url;
      })));
      imgEls.forEach((e, i) => {
        const img = loaded[i];
        if (!img) return;
        const ex = e.x / 100 * cw, ey = e.y / 100 * ch;
        const ew = e.w / 100 * cw, eh = e.h / 100 * ch;
        let rw, rh;
        if (e.bgScale != null) {
          // background-size: X% = X% of element width, height auto
          rw = ew * e.bgScale / 100;
          rh = rw * img.naturalHeight / img.naturalWidth;
        } else {
          // background-size: cover
          const s = Math.max(ew / img.naturalWidth, eh / img.naturalHeight);
          rw = img.naturalWidth * s;
          rh = img.naturalHeight * s;
        }
        const bx = e.bgOffsetX ?? 50, by = e.bgOffsetY ?? 50;
        const ix = ex + (ew - rw) * bx / 100;
        const iy = ey + (eh - rh) * by / 100;
        ctx.save();
        ctx.beginPath(); ctx.rect(ex, ey, ew, eh); ctx.clip();
        ctx.drawImage(img, ix, iy, rw, rh);
        ctx.restore();
      });
    }

    // Pass 2: capture text / shapes / drawings via html2canvas (transparent bg)
    const overlay = buildPageDiv(pg, w, h, true); // skipImages=true
    overlay.style.background = 'transparent';
    overlay.style.position = 'absolute';
    overlay.style.left = '-99999px';
    overlay.style.top = '0';
    document.body.appendChild(overlay);
    const h2c = await capture(overlay);
    document.body.removeChild(overlay);

    // Composite text/shapes on top of images
    ctx.drawImage(h2c, 0, 0);

    return out;
  }

  function rotateCanvas180(src) {
    const dst = document.createElement('canvas');
    dst.width = src.width; dst.height = src.height;
    const ctx = dst.getContext('2d');
    ctx.translate(src.width, src.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(src, 0, 0);
    return dst;
  }

  // Mini-zine: 4×2 panels on A4 landscape
  // Top row (rotated 180°): pages[4], pages[3], pages[2], pages[1]
  // Bottom row (upright):   pages[5], pages[6], pages[7], pages[0]
  async function downloadMiniZinePDF() {
    const { jsPDF } = window.jspdf;
    const PW = 297, PH = 210;
    const px_per_mm = 96 / 25.4;
    const panelW = Math.round((PW / 4) * px_per_mm);
    const panelH = Math.round((PH / 2) * px_per_mm);
    const pW_mm = PW / 4, pH_mm = PH / 2;

    // Capture each page individually to avoid cross-panel bleed
    const canvases = [];
    for (let i = 0; i < 8; i++) {
      canvases.push(pages[i] ? await capturePageCanvas(pages[i], panelW, panelH) : null);
    }

    const layout = [
      [4, 0,       0,       true ],
      [3, pW_mm,   0,       true ],
      [2, pW_mm*2, 0,       true ],
      [1, pW_mm*3, 0,       true ],
      [5, 0,       pH_mm,   false],
      [6, pW_mm,   pH_mm,   false],
      [7, pW_mm*2, pH_mm,   false],
      [0, pW_mm*3, pH_mm,   false],
    ];

    const title = (document.getElementById('title')?.value || 'zine').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    for (const [idx, x, y, rotate] of layout) {
      const c = canvases[idx];
      if (!c) continue;
      const img = rotate ? rotateCanvas180(c) : c;
      doc.addImage(img.toDataURL('image/png'), 'PNG', x, y, pW_mm, pH_mm);
    }

    doc.save(`${title}.pdf`);
  }

  async function downloadBookletPDF() {
    const { jsPDF } = window.jspdf;
    const n = pages.length, sheets = n / 4;
    const PW = 297, PH = 210;
    const px_per_mm = 96 / 25.4;
    const halfW = Math.round((PW / 2) * px_per_mm);
    const pageH = Math.round(PH * px_per_mm);

    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let first   = true;
    const title = (document.getElementById('title')?.value || 'zine').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    for (let k = 1; k <= sheets; k++) {
      for (const [ai, bi] of [[n-2*k+2, 2*k-1], [2*k, n-2*k+1]]) {
        if (!first) doc.addPage();
        first = false;
        if (pages[ai-1]) {
          const ca = await capturePageCanvas(pages[ai-1], halfW, pageH);
          doc.addImage(ca.toDataURL('image/png'), 'PNG', 0, 0, PW/2, PH);
        }
        if (pages[bi-1]) {
          const cb = await capturePageCanvas(pages[bi-1], halfW, pageH);
          doc.addImage(cb.toDataURL('image/png'), 'PNG', PW/2, 0, PW/2, PH);
        }
      }
    }
    doc.save(`${title}.pdf`);
  }

  // ===== Helpers =====

  function el(tag, props) {
    const node = document.createElement(tag);
    if (!props) return node;
    const { dataset, ...rest } = props;
    Object.assign(node, rest);
    if (dataset) Object.assign(node.dataset, dataset);
    return node;
  }

  function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function syncHidden() {
    const pd = document.getElementById('azm-pages-data');
    const fd = document.getElementById('azm-format-data');
    if (pd) pd.value = JSON.stringify(pages);
    if (fd) fd.value = format;
    root.dispatchEvent(new CustomEvent('azm:changed', {
      detail: { pages: JSON.stringify(pages), format },
      bubbles: true,
    }));
  }

  function deletePage(idx) {
    if (pages.length <= 1) return;
    pages.splice(idx, 1);
    if (activeIdx >= pages.length) activeIdx = pages.length - 1;
    syncHidden(); render();
  }

  function pasteElement() {
    if (!copiedElement) return;
    const newEl = Object.assign({}, JSON.parse(JSON.stringify(copiedElement)), { id: uid() });
    newEl.x = Math.min((newEl.x || 0) + 3, Math.max(0, 100 - (newEl.w || 20)));
    newEl.y = Math.min((newEl.y || 0) + 3, Math.max(0, 100 - (newEl.h || 20)));
    pages[activeIdx].elements.push(newEl);
    selectedElId = newEl.id;
    syncHidden();
    render();
  }

  // ===== Init =====

  document.addEventListener('keydown', ev => {
    if (isEditing) return;
    const af = document.activeElement;
    if (af && (af.tagName === 'INPUT' || af.tagName === 'TEXTAREA' || af.isContentEditable)) return;
    if (!ev.ctrlKey && !ev.metaKey) return;
    const key = ev.key.toLowerCase();
    if (key === 'c' && selectedElId) {
      const elem = pages[activeIdx].elements.find(e => e.id === selectedElId);
      if (elem) copiedElement = JSON.parse(JSON.stringify(elem));
    }
    if (key === 'v' && copiedElement) {
      ev.preventDefault();
      pasteElement();
    }
    if (key === 'd' && selectedElId) {
      ev.preventDefault();
      const elem = pages[activeIdx].elements.find(e => e.id === selectedElId);
      if (elem) { copiedElement = JSON.parse(JSON.stringify(elem)); pasteElement(); }
    }
  });

    render();
    const postForm = document.getElementById('post');
    if (postForm) postForm.addEventListener('submit', syncHidden);
  } // end AZMEditor

  window.AZM_EDITOR = { init: AZMEditor };

  // Auto-init for the metabox (PHP renders #azm-root on the zine edit screen).
  const autoRoot = document.getElementById('azm-root');
  if (autoRoot) AZMEditor(autoRoot);

})();
