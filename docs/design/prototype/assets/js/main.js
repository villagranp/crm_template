/* ==========================================================================
   Mi Cliente AG — main.js
   Motion system y comportamiento del shell (ver DESIGN_SPEC.md §4)
   ========================================================================== */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- 1. Tema claro/oscuro ---------- */
  const THEME_KEY = 'mcag-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    const icon = $('#themeToggle .material-symbols-sharp');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* storage bloqueado */ }
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || system);

    $('#themeToggle')?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
      repaintCharts();
    });
  }

  /* ---------- 2. Sidebar: colapso, minificado y offcanvas móvil ---------- */
  const SIDEBAR_KEY = 'mcag-sidebar-mini';

  function initSidebar() {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === '1') document.body.classList.add('sidebar-mini');
    } catch (e) { /* noop */ }

    $('#sidebarToggle')?.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 767.98px)').matches) {
        document.body.classList.toggle('sidebar-open');
        return;
      }
      const mini = document.body.classList.toggle('sidebar-mini');
      try { localStorage.setItem(SIDEBAR_KEY, mini ? '1' : '0'); } catch (e) { /* noop */ }
    });

    $('.sidebar-scrim')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

    // En móvil, navegar cierra el panel
    $$('.sidebar a[href]:not([data-submenu])').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 767.98px)').matches) document.body.classList.remove('sidebar-open');
      });
    });

    // Cerrar con Escape y al pasar a escritorio
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') document.body.classList.remove('sidebar-open');
    });
    window.matchMedia('(min-width: 768px)').addEventListener('change', (ev) => {
      if (ev.matches) document.body.classList.remove('sidebar-open');
    });

    const isMini = () => document.body.classList.contains('sidebar-mini') &&
      window.matchMedia('(min-width: 768px)').matches;

    // Tooltip del modo minificado: un solo nodo en position: fixed, porque
    // .sidebar-scroll recorta en X y un pseudo-elemento quedaría oculto.
    const tip = document.createElement('div');
    tip.className = 'sidebar-tip';
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    const showTip = (link) => {
      if (!isMini()) return;
      const r = link.getBoundingClientRect();
      tip.textContent = link.dataset.tip;
      tip.style.left = (r.right + 10) + 'px';
      tip.style.top = (r.top + r.height / 2) + 'px';
      tip.classList.add('show');
    };
    const hideTip = () => tip.classList.remove('show');
    $$('.sidebar .nav-link-x[data-tip]').forEach((link) => {
      link.addEventListener('mouseenter', () => showTip(link));
      link.addEventListener('focus', () => showTip(link));
      link.addEventListener('mouseleave', hideTip);
      link.addEventListener('blur', hideTip);
    });
    $('.sidebar-scroll')?.addEventListener('scroll', hideTip, { passive: true });

    // Submenús acordeón (grid-template-rows 0fr -> 1fr)
    $$('.nav-link-x[data-submenu]').forEach((link) => {
      link.setAttribute('aria-expanded', link.closest('.nav-item').classList.contains('open') ? 'true' : 'false');
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        const item = link.closest('.nav-item');
        // En minificado el submenú no cabe: se expande el sidebar y se abre
        if (isMini()) {
          hideTip();
          document.body.classList.remove('sidebar-mini');
          try { localStorage.setItem(SIDEBAR_KEY, '0'); } catch (e) { /* noop */ }
          if (item.classList.contains('open')) return;
        }
        const isOpen = item.classList.toggle('open');
        link.setAttribute('aria-expanded', String(isOpen));
        // acordeón exclusivo dentro del mismo grupo
        if (isOpen) {
          $$('.nav-item.open').forEach((other) => {
            if (other !== item && other.parentElement === item.parentElement) {
              other.classList.remove('open');
              $('.nav-link-x[data-submenu]', other)?.setAttribute('aria-expanded', 'false');
            }
          });
        }
      });
    });
  }

  /* ---------- 3. Dropdowns origin-aware ---------- */
  function initDropdowns() {
    $$('[data-dropdown]').forEach((trigger) => {
      const panel = document.getElementById(trigger.dataset.dropdown);
      if (!panel) return;
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const willOpen = !panel.classList.contains('open');
        closeAllDropdowns();
        panel.classList.toggle('open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
    });

    document.addEventListener('click', closeAllDropdowns);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeAllDropdowns(); });
  }

  function closeAllDropdowns() {
    $$('.dropdown-x.open').forEach((p) => p.classList.remove('open'));
    $$('[data-dropdown]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
  }

  /* ---------- 4. Sparklines del page header (scaleY con stagger) ---------- */
  function initSparklines() {
    $$('.sparkbars').forEach((box) => {
      const values = (box.dataset.values || '').split(',').map(Number);
      const max = Math.max(...values, 1);
      box.innerHTML = values
        .map((v, i) => `<i style="height:${Math.max(12, (v / max) * 100)}%;transition-delay:${prefersReduced ? 0 : i * 30}ms"></i>`)
        .join('');
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    $$('.sparkbars').forEach((box) => io.observe(box));
  }

  /* ---------- 5. Barras de progreso animadas ---------- */
  function initProgress() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const bar = entry.target;
        const fill = bar.querySelector('i');
        if (fill) fill.style.width = (bar.dataset.value || 0) + '%';
        io.unobserve(bar);
      });
    }, { threshold: 0.3 });
    $$('.progress-x').forEach((bar) => io.observe(bar));
  }

  /* ---------- 6. Toasts (transiciones interrumpibles + swipe por velocidad) ---------- */
  const TOAST_ICONS = {
    success: { icon: 'check_circle', cls: 'badge-success' },
    error: { icon: 'error', cls: 'badge-danger' },
    warning: { icon: 'warning', cls: 'badge-warning' },
    info: { icon: 'info', cls: 'badge-info' }
  };

  window.toast = function toast(type, title, desc, timeout = 4200) {
    const stack = $('#toastStack');
    if (!stack) return;
    const meta = TOAST_ICONS[type] || TOAST_ICONS.info;

    const el = document.createElement('div');
    el.className = 'toast-x';
    el.setAttribute('role', 'status');

    const iconWrap = document.createElement('span');
    iconWrap.className = 'toast-icon ' + meta.cls;
    const iconGlyph = document.createElement('span');
    iconGlyph.className = 'material-symbols-sharp icon-sm';
    iconGlyph.setAttribute('aria-hidden', 'true');
    iconGlyph.textContent = meta.icon;
    iconWrap.appendChild(iconGlyph);

    const body = document.createElement('div');
    body.className = 'toast-body';
    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);
    if (desc) {
      const descEl = document.createElement('div');
      descEl.className = 'toast-desc';
      descEl.textContent = desc;
      body.appendChild(descEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.style.cssText = 'width:28px;height:28px';
    closeBtn.setAttribute('aria-label', 'Cerrar notificación');
    const closeGlyph = document.createElement('span');
    closeGlyph.className = 'material-symbols-sharp icon-sm';
    closeGlyph.setAttribute('aria-hidden', 'true');
    closeGlyph.textContent = 'close';
    closeBtn.appendChild(closeGlyph);

    el.append(iconWrap, body, closeBtn);
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    let timer = setTimeout(dismiss, timeout);
    // Pausar temporizador si la pestaña se oculta o el puntero está encima
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1800); });
    closeBtn.addEventListener('click', dismiss);

    // Swipe-to-dismiss con umbral de velocidad (0.11 px/ms)
    let startX = 0, startT = 0, dragging = false;
    el.addEventListener('pointerdown', (ev) => {
      dragging = true; startX = ev.clientX; startT = Date.now();
      el.setPointerCapture(ev.pointerId);
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const dx = Math.max(0, ev.clientX - startX);
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.2, 1 - dx / 260));
    });
    el.addEventListener('pointerup', (ev) => {
      if (!dragging) return;
      dragging = false;
      const dx = Math.max(0, ev.clientX - startX);
      const velocity = dx / Math.max(1, Date.now() - startT);
      el.style.transition = '';
      if (dx > 110 || velocity > 0.11) { dismiss(); return; }
      el.style.transform = '';
      el.style.opacity = '';
    });

    function dismiss() {
      clearTimeout(timer);
      el.classList.add('hide');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);
    }
    return dismiss;
  };

  /* ---------- 7. Botones con estado loading ---------- */
  function initLoadingButtons() {
    $$('[data-loading]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('is-loading')) return;
        btn.classList.add('is-loading');
        setTimeout(() => {
          btn.classList.remove('is-loading');
          window.toast('success', 'Operación completada', btn.dataset.loadingMsg || 'Los cambios se guardaron correctamente.');
        }, 1400);
      });
    });
  }

  /* ---------- 8. Tabs ---------- */
  function initTabs() {
    $$('.tabs-x').forEach((group) => {
      $$('.tab-x', group).forEach((tab) => {
        tab.addEventListener('click', () => {
          $$('.tab-x', group).forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          const panelId = tab.dataset.tabPanel;
          if (!panelId) return;
          $$('[data-tab-content="' + group.dataset.tabs + '"]').forEach((panel) => {
            panel.hidden = panel.id !== panelId;
          });
        });
      });
    });
  }

  /* ---------- 7b. Ripple de presión en controles ---------- */
  function initRipple() {
    if (prefersReduced) return;
    const selector = '.btn-x, .icon-btn, .filter-chip, .legend-chip, .dropdown-item-x, .app-tile, .list-row, .cmdk-item, .bottom-nav a';

    document.addEventListener('pointerdown', (ev) => {
      const host = ev.target.closest(selector);
      if (!host || host.classList.contains('is-loading')) return;

      host.classList.add('ripple-host');
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.setProperty('--ripple-x', (ev.clientX - rect.left) + 'px');
      ripple.style.setProperty('--ripple-y', (ev.clientY - rect.top) + 'px');
      ripple.style.setProperty('--ripple-size', size + 'px');
      host.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      setTimeout(() => ripple.remove(), 700);
    });
  }

  /* ---------- 8b. Tablas responsivas: etiqueta de columna en cada celda ---------- */
  function initResponsiveTables() {
    $$('table.table-x').forEach((table) => {
      const heads = $$('thead th', table).map((th) => th.textContent.replace(/unfold_more|expand_more|expand_less/g, '').trim());
      if (!heads.length) return;
      $$('tbody tr', table).forEach((row) => {
        Array.from(row.children).forEach((cell, i) => {
          if (heads[i] && !cell.dataset.label) cell.dataset.label = heads[i];
        });
      });
    });
  }

  /* ---------- 8c. Navegación inferior (móvil) ---------- */
  function initBottomNav() {
    // Sólo anclas reales: "#" a secas no es un selector válido
    const links = $$('.bottom-nav a[href^="#"]').filter((l) => l.getAttribute('href').length > 1);
    if (!links.length) return;
    links.forEach((link) => {
      link.addEventListener('click', () => {
        links.forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
      });
    });

    const sections = links
      .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
      .filter(Boolean);
    if (!sections.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach((section) => io.observe(section));
  }

  /* ---------- 9. Filtros + búsqueda de la tabla ---------- */
  function initTableFilters() {
    const table = $('#ticketsTable');
    if (!table) return;
    const rows = $$('tbody tr', table);
    const search = $('#ticketSearch');
    const chips = $$('[data-filter]');
    let activeFilter = 'all';
    let term = '';

    function apply() {
      let visible = 0;
      rows.forEach((row) => {
        const matchFilter = activeFilter === 'all' || row.dataset.status === activeFilter;
        const matchTerm = !term || row.textContent.toLowerCase().includes(term);
        const show = matchFilter && matchTerm;
        row.hidden = !show;
        if (show) visible++;
      });
      const empty = $('#ticketsEmpty');
      if (empty) empty.hidden = visible > 0;
      const counter = $('#ticketsCount');
      if (counter) counter.textContent = visible;
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.filter;
        apply();
      });
    });

    search?.addEventListener('input', () => { term = search.value.trim().toLowerCase(); apply(); });

    // Orden por columna
    $$('th[data-sort]', table).forEach((th, idx) => {
      let asc = true;
      th.addEventListener('click', () => {
        const tbody = $('tbody', table);
        const sorted = $$('tr', tbody).sort((a, b) => {
          const av = a.children[idx].innerText.trim();
          const bv = b.children[idx].innerText.trim();
          const an = parseFloat(av.replace(/[^\d.-]/g, ''));
          const bn = parseFloat(bv.replace(/[^\d.-]/g, ''));
          const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv, 'es');
          return asc ? cmp : -cmp;
        });
        sorted.forEach((row) => tbody.appendChild(row));
        asc = !asc;
        $$('th[data-sort] .sort-ind', table).forEach((i) => (i.textContent = 'unfold_more'));
        $('.sort-ind', th).textContent = asc ? 'expand_more' : 'expand_less';
      });
    });

    apply();
  }

  /* ---------- 10. Kanban de pipeline ---------- */
  function initKanban() {
    if (typeof Sortable === 'undefined') return;
    $$('.kanban-list').forEach((list) => {
      Sortable.create(list, {
        group: 'pipeline',
        animation: prefersReduced ? 0 : 200,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: (evt) => {
          recalcKanban();
          if (!prefersReduced) {
            evt.item.classList.add('just-dropped');
            setTimeout(() => evt.item.classList.remove('just-dropped'), 440);
          }
          if (evt.from !== evt.to) {
            const stage = evt.to.closest('.kanban-col').dataset.stage;
            const deal = $('h6', evt.item)?.textContent || 'Oportunidad';
            window.toast('success', 'Etapa actualizada', `"${deal}" movida a ${stage}.`);
          }
        }
      });
    });
    recalcKanban();
  }

  function recalcKanban() {
    $$('.kanban-col').forEach((col) => {
      const cards = $$('.kanban-card', col);
      const total = cards.reduce((sum, card) => sum + Number(card.dataset.amount || 0), 0);
      $('.count', col).textContent = cards.length;
      const amountEl = $('.kanban-col-amount', col);
      if (amountEl) amountEl.textContent = formatMoney(total) + ' en pipeline';
    });
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
  }

  /* ---------- 11. Charts ---------- */
  const charts = [];

  function chartColors() {
    const css = getComputedStyle(document.documentElement);
    return {
      text: css.getPropertyValue('--text-muted').trim(),
      grid: css.getPropertyValue('--border').trim(),
      accent: css.getPropertyValue('--blue-accent').trim(),
      brand: css.getPropertyValue('--ag-blue').trim(),
      brand700: css.getPropertyValue('--brand-700').trim(),
      brand400: css.getPropertyValue('--brand-400').trim(),
      brand300: css.getPropertyValue('--brand-300').trim(),
      brand200: css.getPropertyValue('--brand-200').trim(),
      steel: css.getPropertyValue('--ag-gray-2').trim(),
      success: css.getPropertyValue('--success').trim(),
      warning: css.getPropertyValue('--warning').trim(),
      danger: css.getPropertyValue('--danger').trim()
    };
  }

  function initCharts() {
    if (typeof Chart === 'undefined') return;
    const c = chartColors();
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = c.text;
    Chart.defaults.animation.duration = prefersReduced ? 0 : 600;
    Chart.defaults.animation.easing = 'easeOutQuart';

    const revenueCtx = $('#revenueChart');
    if (revenueCtx) {
      charts.push(new Chart(revenueCtx, {
        type: 'line',
        data: {
          labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'],
          datasets: [
            {
              label: 'Ventas cerradas',
              data: [420, 510, 470, 620, 680, 640, 790, 840, 910],
              borderColor: c.accent,
              backgroundColor: 'rgba(41, 71, 141, .14)',
              fill: true, tension: .38, borderWidth: 2.5,
              pointRadius: 0, pointHoverRadius: 5
            },
            {
              label: 'Servicios facturados',
              data: [210, 260, 290, 300, 350, 380, 410, 460, 520],
              borderColor: c.brand300,
              backgroundColor: 'rgba(107, 134, 201, .12)',
              fill: true, tension: .38, borderWidth: 2.5,
              pointRadius: 0, pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 18 } } },
          scales: {
            x: { grid: { display: false }, border: { display: false } },
            y: { grid: { color: c.grid }, border: { display: false }, ticks: { callback: (v) => '$' + v + 'k' } }
          }
        }
      }));
    }

    const funnelCtx = $('#funnelChart');
    if (funnelCtx) {
      charts.push(new Chart(funnelCtx, {
        type: 'bar',
        data: {
          labels: ['Prospectos', 'Calificados', 'Propuesta', 'Negociación', 'Ganados'],
          datasets: [{
            data: [1840, 1120, 640, 380, 214],
            backgroundColor: [c.brand, c.brand400, c.brand300, c.brand200, c.success],
            borderRadius: 8, borderSkipped: false, barThickness: 26
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: c.grid }, border: { display: false } },
            y: { grid: { display: false }, border: { display: false } }
          }
        }
      }));
    }

    const csatCtx = $('#csatChart');
    if (csatCtx) {
      charts.push(new Chart(csatCtx, {
        type: 'doughnut',
        data: {
          labels: ['Promotores', 'Pasivos', 'Detractores'],
          datasets: [{
            data: [72, 19, 9],
            backgroundColor: [c.success, c.warning, c.danger],
            borderWidth: 0, cutout: '76%'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          circumference: 180, rotation: -90,
          plugins: { legend: { display: false } }
        }
      }));
    }

    const slaCtx = $('#slaChart');
    if (slaCtx) {
      charts.push(new Chart(slaCtx, {
        type: 'bar',
        data: {
          labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
          datasets: [
            { label: 'Resueltos', data: [42, 51, 47, 58, 63, 28, 14], backgroundColor: c.success, borderRadius: 6, stack: 's' },
            { label: 'En curso', data: [12, 15, 11, 18, 14, 9, 5], backgroundColor: c.warning, borderRadius: 6, stack: 's' },
            { label: 'Escalados', data: [4, 3, 6, 2, 5, 1, 1], backgroundColor: c.danger, borderRadius: 6, stack: 's' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 16 } } },
          scales: {
            x: { stacked: true, grid: { display: false }, border: { display: false } },
            y: { stacked: true, grid: { color: c.grid }, border: { display: false } }
          }
        }
      }));
    }

    const sourceCtx = $('#sourceChart');
    if (sourceCtx) {
      charts.push(new Chart(sourceCtx, {
        type: 'polarArea',
        data: {
          labels: ['Sitio web', 'Referidos', 'Campañas', 'Inbound', 'Partners'],
          datasets: [{
            data: [320, 240, 180, 140, 95],
            backgroundColor: ['rgba(41,71,141,.85)', 'rgba(51,85,159,.8)', 'rgba(62,96,176,.75)', 'rgba(107,134,201,.7)', 'rgba(169,185,224,.7)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, padding: 12 } } },
          scales: { r: { grid: { color: c.grid }, ticks: { display: false } } }
        }
      }));
    }
  }

  /* ---------- 11b. Interacción de gráficas: hover, clic, leyenda y recarga ---------- */
  const MONEY_K_CHARTS = ['revenueChart'];

  function initChartInteractions() {
    charts.forEach((chart) => {
      safe('enhanceChart ' + chart.canvas.id, () => enhanceChart(chart, {
        moneyK: MONEY_K_CHARTS.includes(chart.canvas.id),
        legend: chart.canvas.id !== 'csatChart'   // el gauge de NPS ya muestra su desglose
      }));
    });
  }

  /* Aplica el lenguaje de interacción del sistema a cualquier gráfica de Chart.js.
     opts: money (valores en MXN) · moneyK (valores en miles de MXN) · legend (chips propios)
           onPick(label, value, dataset) (clic en un elemento; por defecto muestra un toast)
     IMPORTANTE: mutar chart.options.plugins.*, nunca reemplazarlos con Object.assign:
     la copia pierde el contexto de Chart.js y generateLabels revienta (ver CLAUDE.md §9). */
  function enhanceChart(chart, opts) {
    opts = opts || {};
    const canvas = chart.canvas;
    const fmt = (raw) => opts.moneyK ? formatMoney(raw * 1000)
      : opts.money ? formatMoney(raw)
      : Number(raw).toLocaleString('es-MX') + (opts.suffix || '');

    // Cursor de mano sólo cuando hay un elemento bajo el puntero
    chart.options.onHover = (ev, elements) => {
      canvas.style.cursor = elements.length ? 'pointer' : 'crosshair';
    };

    // Clic en un punto/barra/segmento: drill-down
    chart.options.onClick = (ev, elements) => {
      if (!elements.length) return;
      const { datasetIndex, index } = elements[0];
      const ds = chart.data.datasets[datasetIndex];
      const label = chart.data.labels[index];
      const raw = ds.data[index];
      if (opts.onPick) { opts.onPick(label, raw, ds); return; }
      const serie = ds.label ? ds.label + ' · ' : '';
      window.toast('info', `${label}: ${fmt(raw)}`, `${serie}Clic para ver el detalle completo.`);
    };

    // Realce al pasar por encima
    applyHover(chart);

    // Tooltip con el mismo lenguaje visual que el resto del sistema
    const tooltip = chart.options.plugins.tooltip;
    Object.assign(tooltip, {
      backgroundColor: 'rgba(15, 23, 42, .94)',
      padding: 12,
      cornerRadius: 10,
      titleFont: { family: "'Poppins', sans-serif", weight: '600', size: 12 },
      bodyFont: { family: "'Inter', sans-serif", size: 12 },
      displayColors: true,
      boxPadding: 5,
      animation: { duration: prefersReduced ? 0 : 160 }
    });
    if (opts.money || opts.moneyK || opts.suffix) {
      tooltip.callbacks.label = (ctx) => {
        const raw = ctx.raw != null && typeof ctx.raw === 'object' ? ctx.parsed.x ?? ctx.parsed.y : ctx.raw;
        return ' ' + (ctx.dataset.label || ctx.label) + ': ' + fmt(raw);
      };
    }

    // Leyenda propia (chips) en lugar de la nativa
    chart.options.plugins.legend.display = false;
    if (opts.legend !== false) buildLegend(chart);

    chart.update('none');
  }

  // Engrosa el borde / separa el segmento bajo el puntero (Chart.js anima la transición)
  function applyHover(chart) {
    chart.data.datasets.forEach((ds) => {
      if (chart.config.type === 'line') {
        ds.pointHoverBorderWidth = 3;
        ds.pointHoverBackgroundColor = '#fff';
        ds.hoverBorderWidth = 3.5;
      } else if (chart.config.type === 'doughnut' || chart.config.type === 'polarArea') {
        ds.hoverOffset = 10;
        ds.hoverBorderWidth = 2;
        ds.hoverBorderColor = 'rgba(255,255,255,.85)';
      } else {
        ds.hoverBorderWidth = 2;
        ds.hoverBorderColor = 'rgba(255,255,255,.9)';
      }
    });
  }

  function buildLegend(chart) {
    const box = chart.canvas.closest('.chart-box, .chart-box-sm, .chart-gauge');
    if (!box) return;
    box.parentElement.querySelector('.chart-legend')?.remove();   // se reconstruye si cambian los datos

    // Una línea de una sola serie no lleva chips por punto (se leen en el eje)
    const multi = chart.data.datasets.length > 1 || chart.config.type === 'line';
    const items = multi
      ? chart.data.datasets.map((ds, i) => ({ text: ds.label, color: ds.borderColor || ds.backgroundColor, i }))
      : chart.data.labels.map((label, i) => {
          const bg = chart.data.datasets[0].backgroundColor;
          return { text: label, color: Array.isArray(bg) ? bg[i] : bg, i };
        });
    if (items.length < 2 || items.length > 8) return;

    const legend = document.createElement('div');
    legend.className = 'chart-legend';

    items.forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'legend-chip';
      chip.setAttribute('aria-pressed', 'true');

      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = typeof item.color === 'string' ? item.color : 'var(--blue-accent)';
      chip.append(dot, document.createTextNode(item.text));

      chip.addEventListener('click', () => {
        const visible = multi ? chart.isDatasetVisible(item.i) : chart.getDataVisibility(item.i);
        if (multi) chart.setDatasetVisibility(item.i, !visible);
        else chart.toggleDataVisibility(item.i);
        chip.classList.toggle('is-off', visible);
        chip.setAttribute('aria-pressed', String(!visible));
        chart.update();
      });

      // Resalta la serie / segmento mientras el puntero está sobre el chip
      chip.addEventListener('mouseenter', () => focusItem(chart, item.i, multi, true));
      chip.addEventListener('mouseleave', () => focusItem(chart, item.i, multi, false));

      legend.appendChild(chip);
    });

    box.insertAdjacentElement('afterend', legend);
  }

  // Al pasar por un chip: en series múltiples la señalada engrosa y las demás adelgazan;
  // en gráficas de una serie se activa el elemento (mismo realce que el hover directo)
  function focusItem(chart, index, multi, on) {
    if (prefersReduced) return;
    if (multi) {
      chart.data.datasets.forEach((ds, i) => {
        if (chart.config.type === 'line') ds.borderWidth = on ? (i === index ? 4 : 1) : 2.5;
      });
      chart.setActiveElements(on ? chart.data.datasets[index].data.map((_, j) => ({ datasetIndex: index, index: j })) : []);
    } else {
      chart.setActiveElements(on && chart.getDataVisibility(index) ? [{ datasetIndex: 0, index: index }] : []);
    }
    chart.update();
  }

  /* API para gráficas creadas fuera de main.js (crud.js / Analítica) */
  function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const c = chartColors();
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = c.text;
    Chart.defaults.animation.duration = prefersReduced ? 0 : 600;
    Chart.defaults.animation.easing = 'easeOutQuart';
  }
  window.MCAGCharts = {
    colors: chartColors,
    defaults: applyChartDefaults,
    enhance: enhanceChart,
    register: (chart) => { if (charts.indexOf(chart) === -1) charts.push(chart); },
    unregister: (chart) => { const i = charts.indexOf(chart); if (i !== -1) charts.splice(i, 1); },
    formatMoney: (v) => formatMoney(v)
  };

  /* Botones "actualizar" del encabezado de card: re-animan la gráfica */
  function initCardRefresh() {
    $$('.card-x-tools .icon-btn').forEach((btn) => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!label.includes('actualizar')) return;

      btn.addEventListener('click', () => {
        btn.classList.add('is-spinning');
        setTimeout(() => btn.classList.remove('is-spinning'), 640);

        const card = btn.closest('.card-x');
        const canvas = card?.querySelector('canvas');
        const box = canvas?.closest('.chart-box, .chart-box-sm, .chart-gauge');
        const chart = charts.find((c) => c.canvas === canvas);

        if (chart && box) {
          box.classList.add('chart-reloading');
          setTimeout(() => {
            box.classList.remove('chart-reloading');
            chart.reset();
            chart.update();               // re-dispara la animación de entrada
            window.toast('success', 'Datos actualizados', 'La gráfica se recalculó con la información más reciente.');
          }, 420);
          return;
        }

        // Tablas u otros contenidos
        const rows = $$('tbody tr', card || document);
        rows.forEach((row, i) => {
          if (prefersReduced) return;
          row.style.animation = 'none';
          row.offsetHeight;                // fuerza reflow para reiniciar
          row.style.animation = `fadeUp 300ms var(--ease-out) ${i * 35}ms backwards`;
        });
        setTimeout(() => window.toast('success', 'Lista actualizada', 'Se recargaron los registros.'), 320);
      });
    });
  }

  function repaintCharts() {
    const c = chartColors();
    if (typeof Chart !== 'undefined') Chart.defaults.color = c.text;   // en páginas sin gráficas Chart no existe
    charts.forEach((chart) => {
      Object.values(chart.options.scales || {}).forEach((scale) => {
        if (scale.grid) scale.grid.color = c.grid;
      });
      chart.update('none');
    });
    document.dispatchEvent(new CustomEvent('mcag:theme'));   // crud.js recolorea sus series
  }

  /* ---------- 12. Command palette (Ctrl/Cmd + K, sin animación) ---------- */
  function initCommandPalette() {
    const palette = $('#cmdk');
    const backdrop = $('#cmdkBackdrop');
    const input = $('#cmdkInput');
    if (!palette) return;

    function open() {
      palette.classList.add('open');
      backdrop.classList.add('open');
      input.value = '';
      filter('');
      input.focus();
    }
    function close() {
      palette.classList.remove('open');
      backdrop.classList.remove('open');
    }
    function filter(term) {
      const t = term.toLowerCase();
      $$('.cmdk-item', palette).forEach((item) => {
        item.hidden = !!t && !item.textContent.toLowerCase().includes(t);
      });
      $$('.cmdk-group', palette).forEach((group) => {
        let next = group.nextElementSibling, any = false;
        while (next && next.classList.contains('cmdk-item')) { if (!next.hidden) any = true; next = next.nextElementSibling; }
        group.hidden = !any;
      });
    }

    document.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); palette.classList.contains('open') ? close() : open(); }
      if (ev.key === 'Escape') close();
    });
    $('#searchTrigger')?.addEventListener('click', open);
    backdrop?.addEventListener('click', close);
    input?.addEventListener('input', () => filter(input.value));
    // Los ítems con data-href (generados por modules.js) navegan; el resto sólo confirma
    function run(item) {
      close();
      if (item.dataset.href) { location.href = item.dataset.href; return; }
      window.toast('info', 'Comando ejecutado', item.dataset.label || item.textContent.trim());
    }
    $$('.cmdk-item', palette).forEach((item) => item.addEventListener('click', () => run(item)));
    // Enter ejecuta el primer resultado visible (acción de teclado: sin animación)
    input?.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const first = $$('.cmdk-item', palette).find((i) => !i.hidden);
      if (first) { ev.preventDefault(); run(first); }
    });
  }

  /* ---------- 13. Chat widget ---------- */
  function initChat() {
    $$('[data-chat-open]').forEach((btn) => btn.addEventListener('click', () => {
      const win = document.getElementById(btn.dataset.chatOpen);
      if (win) win.classList.toggle('open');
      closeAllDropdowns();
    }));
    $$('[data-chat-close]').forEach((btn) => btn.addEventListener('click', () => {
      btn.closest('.chat-window')?.classList.remove('open');
    }));
    $$('.chat-foot').forEach((foot) => {
      const input = $('input', foot);
      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        const body = $('.chat-body', foot.closest('.chat-window'));
        const bubble = document.createElement('div');
        bubble.className = 'bubble out';
        bubble.textContent = text;
        body.appendChild(bubble);
        body.scrollTop = body.scrollHeight;
        input.value = '';
      };
      $('button', foot)?.addEventListener('click', send);
      input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') send(); });
    });
  }

  /* ---------- 14. Contadores animados ---------- */
  function initCounters() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        const target = Number(el.dataset.count);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        if (prefersReduced) { el.textContent = prefix + target.toLocaleString('es-MX') + suffix; return; }
        const duration = 900;
        const start = performance.now();
        (function frame(now) {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + Math.round(target * eased).toLocaleString('es-MX') + suffix;
          if (p < 1) requestAnimationFrame(frame);
        })(start);
      });
    }, { threshold: 0.4 });
    $$('[data-count]').forEach((el) => io.observe(el));
  }

  /* ---------- 15. Confirmaciones destructivas ---------- */
  function initConfirms() {
    $$('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => {
      if (typeof Swal === 'undefined') return;
      Swal.fire({
        title: btn.dataset.confirm,
        text: btn.dataset.confirmText || 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: chartColors().danger,
        cancelButtonColor: chartColors().steel,
        showClass: { popup: prefersReduced ? '' : 'swal2-show' }
      }).then((res) => {
        if (res.isConfirmed) window.toast('success', 'Registro eliminado', 'El elemento se movió a la papelera.');
      });
    }));
  }

  /* ---------- Init ---------- */
  // Un módulo que falle no debe impedir que arranquen los demás
  function safe(name, fn) {
    try { fn(); } catch (err) { console.error('[Mi Cliente AG] Falló ' + name + ':', err); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    safe('initTheme', initTheme);
    safe('initSidebar', initSidebar);
    safe('initRipple', initRipple);
    safe('initDropdowns', initDropdowns);
    safe('initSparklines', initSparklines);
    safe('initProgress', initProgress);
    safe('initLoadingButtons', initLoadingButtons);
    safe('initTabs', initTabs);
    safe('initResponsiveTables', initResponsiveTables);
    safe('initBottomNav', initBottomNav);
    safe('initTableFilters', initTableFilters);
    safe('initKanban', initKanban);
    safe('initCharts', initCharts);
    safe('initChartInteractions', initChartInteractions);
    safe('initCardRefresh', initCardRefresh);
    safe('initCommandPalette', initCommandPalette);
    safe('initChat', initChat);
    safe('initCounters', initCounters);
    safe('initConfirms', initConfirms);

    $('#notifyDemo')?.addEventListener('click', () => {
      window.toast('info', 'Nuevo lead asignado', 'Mariana Ortiz · Plan Enterprise · $48,000 MXN');
    });
  });
})();
