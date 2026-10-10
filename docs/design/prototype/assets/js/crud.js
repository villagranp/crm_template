/* ==========================================================================
   Mi Cliente AG — crud.js
   Motor CRUD genérico de pages/modulo.html?e=<entidad>.
   Lee la definición de window.MCAG (modules.js) y arma: KPIs, filtros, búsqueda,
   orden, paginación, formulario con validación, ficha de detalle con registros
   relacionados, baja, exportación CSV y bitácora de auditoría.
   Parámetros de URL: e (entidad) · id (abre la ficha) · nuevo=1 (abre el alta) · q (búsqueda)
   ========================================================================== */
(function () {
  'use strict';

  if (document.body.dataset.page !== 'modulo' || !window.MCAG) return;

  const { ENTITIES, S, url, badgeFor, initials, num, today } = window.MCAG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const params = new URLSearchParams(location.search);
  const KEY = params.get('e');
  const E = ENTITIES[KEY];
  const PER_PAGE = 10;

  /* ---------- Formato ---------- */
  const fmtMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  const fmtCompact = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 });
  const fmtNum = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

  const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && !v.length);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const newWord = (Ent) => (Ent.g === 'f' ? 'Nueva ' : 'Nuevo ') + Ent.one;
  const done = (Ent, verb) => cap(Ent.one) + ' ' + verb + (Ent.g === 'f' ? 'a' : 'o');

  function fmtDate(v) {
    if (!v) return '';
    const parts = String(v).split('T');
    const d = parts[0].split('-');
    if (d.length !== 3) return String(v);
    return d[2] + '/' + d[1] + '/' + d[0] + (parts[1] ? ' ' + parts[1] : '');
  }

  /* Texto plano de un campo (tabla, búsqueda, orden, CSV) */
  function text(Ent, fld, row) {
    const v = S.value(Ent, fld, row);
    if (isEmpty(v)) return '';
    switch (fld.t) {
      case 'money': return fmtMoney.format(num(v));
      case 'percent': return fmtNum.format(num(v)) + '%';
      case 'number': return fmtNum.format(num(v));
      case 'date': case 'datetime': return fmtDate(v);
      case 'switch': return v ? 'Sí' : 'No';
      case 'ref': return S.label(fld.ref, v);
      case 'multi': return [].concat(v).map((x) => (fld.ref ? S.label(fld.ref, x) : x)).filter(Boolean).join(', ');
      default: return String(v);
    }
  }

  /* Valor comparable para ordenar */
  function sortValue(Ent, fld, row) {
    const v = S.value(Ent, fld, row);
    if (['money', 'percent', 'number'].indexOf(fld.t) !== -1) return isEmpty(v) ? -Infinity : num(v);
    if (fld.t === 'switch') return v ? 1 : 0;
    if (fld.t === 'date' || fld.t === 'datetime') return String(v || '');
    return text(Ent, fld, row).toLowerCase();
  }

  /* ---------- DOM helpers (todo con textContent: los datos son editables) ---------- */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    [].concat(children || []).forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  const icon = (name, cls) => h('span', { class: 'material-symbols-sharp ' + (cls || 'icon-sm'), 'aria-hidden': 'true', text: name });
  const badge = (fieldKey, value) => h('span', { class: 'badge-x badge-' + badgeFor(fieldKey, value), text: value });

  /* Nodo visual de un campo (tabla y ficha) */
  function display(Ent, fld, row, full) {
    const v = S.value(Ent, fld, row);
    if (isEmpty(v)) return h('span', { class: 'text-muted-x', text: '—' });
    if (fld.badge && (fld.t === 'select' || fld.t === 'text')) return badge(fld.k, String(v));
    if (fld.t === 'switch') return h('span', { class: 'badge-x badge-' + (v ? 'success' : 'steel'), text: v ? 'Sí' : 'No' });
    if (fld.t === 'multi') {
      const labels = [].concat(v).map((x) => (fld.ref ? S.label(fld.ref, x) : x)).filter(Boolean);
      const shown = full ? labels : labels.slice(0, 2);
      const wrap = h('span', { class: 'chip-list' }, shown.map((l) => h('span', { class: 'badge-x badge-navy', text: l })));
      if (labels.length > shown.length) wrap.appendChild(h('span', { class: 'badge-x badge-steel', text: '+' + (labels.length - shown.length), title: labels.slice(2).join(', ') }));
      return wrap;
    }
    if (fld.t === 'ref' && full && v && ENTITIES[fld.ref]) {
      const label = S.label(fld.ref, v);
      return label ? h('a', { href: url.entity(fld.ref, '&id=' + encodeURIComponent(v)), text: label }) : h('span', { class: 'text-muted-x', text: '—' });
    }
    if (fld.t === 'url' && full) return h('a', { href: v, target: '_blank', rel: 'noopener', text: v });
    if (fld.t === 'email' && full) return h('a', { href: 'mailto:' + v, text: v });
    if (fld.t === 'textarea') return h('span', { class: 'pre-line', text: String(v) });
    return h('span', { text: text(Ent, fld, row) });
  }

  /* ---------- Estado de la vista ---------- */
  const state = { q: '', filter: 'all', sortK: null, sortDir: 1, page: 1 };
  const listFields = E ? E.fields.filter((x) => x.list) : [];
  const filterField = E && E.filter ? E.fields.find((x) => x.k === E.filter) : null;
  const rows = () => S.all(KEY);

  /* ---------- Cabecera de página ---------- */
  function renderHeader() {
    document.title = E.title + ' — Mi Cliente AG';
    const title = $('#pageTitle');
    title.textContent = E.title + ' ';
    title.appendChild(h('span', { text: '— ' + E.module.title }));
    const bc = $('#pageBreadcrumb');
    bc.textContent = '';
    bc.append(
      h('a', { href: url.home, text: 'Inicio' }), h('span', { class: 'sep', text: '/' }),
      h('a', { href: url.entity(E.module.entities[0]), text: E.module.title }), h('span', { class: 'sep', text: '/' }),
      h('span', { 'aria-current': 'page', text: E.title })
    );
    $('#listTitle').textContent = E.title;
    $('#listDesc').textContent = E.desc || '';
    $('#listIcon').textContent = E.icon;

    const btn = $('#btnNew');
    if (E.readonly) btn.hidden = true;
    else $('.btn-label-text', btn).textContent = newWord(E);
    // Bottom nav: resalta Ventas / Servicio según el módulo
    $$('.bottom-nav a[href*="?e="]').forEach((a) => {
      const k = new URL(a.href).searchParams.get('e');
      a.classList.toggle('active', !!ENTITIES[k] && ENTITIES[k].module === E.module);
    });
    const fab = $('#fabNew');
    if (fab) {
      if (E.readonly) fab.hidden = true;
      else fab.setAttribute('aria-label', newWord(E));
    }
  }

  function renderKpis() {
    const host = $('#kpiStrip');
    host.textContent = '';
    const all = rows();
    const kpi = (label, value, cls) => h('div', { class: 'kpi-mini' }, h('div', null, [
      h('div', { class: 'kpi-mini-label', text: label }),
      h('div', { class: 'kpi-mini-value' + (cls ? ' ' + cls : ''), text: value })
    ]));
    host.appendChild(kpi('Registros', fmtNum.format(all.length)));
    if (E.sum) {
      const fld = E.fields.find((x) => x.k === E.sum);
      const total = all.reduce((acc, r) => acc + num(S.value(E, fld, r)), 0);
      host.appendChild(kpi(fld.l, fmtCompact.format(total), 'up'));
    }
    if (filterField) {
      filterOptions().filter((o) => o.count > 0).sort((a, b) => b.count - a.count).slice(0, E.sum ? 1 : 2)
        .forEach((o) => host.appendChild(kpi(o.label, fmtNum.format(o.count))));
    }
  }

  /* ---------- Filtros (chips) ---------- */
  function filterOptions() {
    if (!filterField) return [];
    const all = rows();
    const opts = filterField.t === 'ref'
      ? S.all(filterField.ref).map((r) => ({ value: r.id, label: S.label(filterField.ref, r.id) }))
      : (filterField.o || []).map((o) => ({ value: o, label: o }));
    return opts.map((o) => Object.assign(o, { count: all.filter((r) => r[filterField.k] === o.value).length }));
  }

  function renderChips() {
    const host = $('#filterChips');
    host.textContent = '';
    if (!filterField) { host.hidden = true; return; }
    const opts = [{ value: 'all', label: 'Todos', count: rows().length }].concat(filterOptions().filter((o) => o.count > 0));
    if (state.filter !== 'all' && !opts.some((o) => o.value === state.filter)) state.filter = 'all';
    opts.forEach((o) => {
      const chip = h('button', {
        type: 'button',
        class: 'filter-chip' + (state.filter === o.value ? ' active' : ''),
        'aria-pressed': String(state.filter === o.value),
        onclick: () => { state.filter = o.value; state.page = 1; renderChips(); renderTable(); }
      }, [o.label + ' ', h('span', { class: 'chip-count', text: String(o.count) })]);
      host.appendChild(chip);
    });
  }

  /* ---------- Tabla ---------- */
  const COL_W = { text: 160, email: 210, tel: 130, url: 190, number: 100, money: 140, percent: 100, date: 116, datetime: 150, time: 90, select: 130, ref: 160, multi: 210, switch: 90, textarea: 200 };

  function buildTableHead() {
    const table = $('#crudTable');
    const colgroup = h('colgroup');
    let min = 0;
    listFields.forEach((fld) => {
      if (fld.main) { colgroup.appendChild(h('col')); min += 220; return; }
      // El ancho sale del contenido; el encabezado puede pasar a dos líneas (ver .table-crud th)
      const w = fld.w || COL_W[fld.t] || 150;
      min += w;
      colgroup.appendChild(h('col', { style: 'width:' + w + 'px' }));
    });
    const actionsW = E.readonly ? 70 : 136;
    colgroup.appendChild(h('col', { style: 'width:' + actionsW + 'px' }));
    min += actionsW;
    table.style.setProperty('--table-min', min + 'px');

    const tr = h('tr');
    listFields.forEach((fld) => {
      const th = h('th', { scope: 'col', 'data-k': fld.k, tabindex: '0', 'aria-sort': 'none' }, [
        fld.l + ' ', h('span', { class: 'material-symbols-sharp sort-ind', 'aria-hidden': 'true', text: 'unfold_more' })
      ]);
      const sort = () => {
        state.sortDir = state.sortK === fld.k ? -state.sortDir : 1;
        state.sortK = fld.k;
        renderTable();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sort(); } });
      tr.appendChild(th);
    });
    tr.appendChild(h('th', { scope: 'col', class: 'text-end', text: 'Acciones' }));
    table.textContent = '';
    table.append(colgroup, h('thead', null, tr), h('tbody'));
  }

  function visibleRows() {
    const term = state.q.trim().toLowerCase();
    let list = rows().filter((r) => state.filter === 'all' || r[E.filter] === state.filter);
    if (term) {
      list = list.filter((r) => E.fields.some((fld) => text(E, fld, r).toLowerCase().indexOf(term) !== -1));
    }
    if (state.sortK) {
      const fld = E.fields.find((x) => x.k === state.sortK);
      list = list.slice().sort((a, b) => {
        const av = sortValue(E, fld, a), bv = sortValue(E, fld, b);
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'es', { numeric: true });
        return cmp * state.sortDir;
      });
    }
    return list;
  }

  function mainCell(row) {
    const label = text(E, E.main, row) || '—';
    const sub = E.main.sub ? E.fields.find((x) => x.k === E.main.sub) : null;
    const subText = sub ? text(E, sub, row) : '';
    return h('div', { class: 'cell-user' }, [
      h('span', { class: 'avatar-fallback', 'aria-hidden': 'true', text: initials(label.replace(/^[A-Z]+-\d+\s*·?\s*/, '') || label) }),
      h('div', null, [
        h('button', { type: 'button', class: 'cell-link', 'data-action': 'view', text: label }),
        subText ? h('span', { text: subText }) : null
      ])
    ]);
  }

  function actionsCell(row) {
    const name = S.label(KEY, row.id);
    const btn = (action, ico, label) => h('button', { type: 'button', class: 'icon-btn', 'data-action': action, 'aria-label': label + ' ' + name }, icon(ico));
    return h('div', { class: 'row-actions' }, E.readonly
      ? [btn('view', 'visibility', 'Ver')]
      : [btn('view', 'visibility', 'Ver'), btn('edit', 'edit', 'Editar'), btn('delete', 'delete', 'Eliminar')]);
  }

  function renderTable(flashId) {
    const table = $('#crudTable');
    const tbody = $('tbody', table);
    const list = visibleRows();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (flashId) {
      const idx = list.findIndex((r) => r.id === flashId);
      if (idx !== -1) state.page = Math.floor(idx / PER_PAGE) + 1;
    }
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PER_PAGE;
    const pageRows = list.slice(start, start + PER_PAGE);

    tbody.textContent = '';
    pageRows.forEach((row) => {
      const tr = h('tr', { 'data-id': row.id });
      listFields.forEach((fld) => {
        const td = h('td', { 'data-label': fld.l });
        td.appendChild(fld.main ? mainCell(row) : display(E, fld, row));
        if (E.code && fld.k === E.code.k && !fld.main) td.classList.add('cell-code');
        tr.appendChild(td);
      });
      tr.appendChild(h('td', { 'data-label': 'Acciones', class: 'text-end' }, actionsCell(row)));
      if (row.id === flashId) tr.classList.add('is-flash');
      tbody.appendChild(tr);
    });
    if (flashId) setTimeout(() => $('tr.is-flash', tbody)?.classList.remove('is-flash'), 1600);

    // Indicadores de orden
    $$('thead th[data-k]', table).forEach((th) => {
      const active = th.dataset.k === state.sortK;
      th.setAttribute('aria-sort', active ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none');
      $('.sort-ind', th).textContent = active ? (state.sortDir === 1 ? 'expand_more' : 'expand_less') : 'unfold_more';
    });

    // Vacío
    const empty = $('#emptyState');
    const hasAny = rows().length > 0;
    empty.hidden = list.length > 0;
    $('.table-wrap').hidden = list.length === 0;
    if (!list.length) {
      $('#emptyTitle').textContent = hasAny ? 'Sin resultados' : 'Aún no hay registros';
      $('#emptyText').textContent = hasAny ? 'Ningún registro coincide con la búsqueda o el filtro.' : 'Crea el primer registro de ' + E.title.toLowerCase() + '.';
      $('#emptyClear').hidden = !hasAny;
      $('#emptyNew').hidden = hasAny || !!E.readonly;
      $('.btn-label-text', $('#emptyNew')).textContent = newWord(E);
    }

    $('#listCount').textContent = list.length === rows().length
      ? list.length + ' registro' + (list.length === 1 ? '' : 's')
      : list.length + ' de ' + rows().length + ' registros';
    renderPager(list.length, pages, start, pageRows.length);
  }

  function renderPager(total, pages, start, shown) {
    const host = $('#pager');
    host.textContent = '';
    host.hidden = total === 0;
    if (!total) return;
    host.appendChild(h('span', { class: 'pager-info', text: 'Mostrando ' + (start + 1) + '–' + (start + shown) + ' de ' + total }));
    const nav = h('div', { class: 'pager-nav' });
    const go = (p) => { state.page = p; renderTable(); $('#crudCard').scrollIntoView({ block: 'start', behavior: 'auto' }); };
    nav.appendChild(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Página anterior', disabled: state.page === 1, onclick: () => go(state.page - 1) }, icon('chevron_left')));
    let from = Math.max(1, state.page - 2);
    const to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    for (let p = from; p <= to; p++) {
      nav.appendChild(h('button', {
        type: 'button', class: 'pager-btn' + (p === state.page ? ' active' : ''), text: String(p),
        'aria-label': 'Página ' + p, 'aria-current': p === state.page ? 'page' : null, onclick: () => go(p)
      }));
    }
    nav.appendChild(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Página siguiente', disabled: state.page === pages, onclick: () => go(state.page + 1) }, icon('chevron_right')));
    host.appendChild(nav);
  }

  /* ---------- Gráficas (entidades de Analítica) ----------
     Se crean con el mismo motor que el dashboard (window.MCAGCharts de main.js):
     hover con realce, tooltip del sistema, leyenda en chips y clic que lleva al detalle.
     Chart.js se carga sólo en las páginas que tienen gráficas. */
  const CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
  const chartInstances = {};
  let chartJsPromise = null;

  function loadChartJs() {
    if (window.Chart) return Promise.resolve();
    if (!chartJsPromise) {
      chartJsPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = CHART_SRC;
        sc.onload = resolve;
        sc.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
        document.head.appendChild(sc);
      });
    }
    return chartJsPromise;
  }

  const hexToRgba = (hex, a) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
    return m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')' : hex;
  };

  function chartValueText(spec, v) {
    if (spec.money) return fmtMoney.format(v);
    return fmtNum.format(v) + (spec.suffix || '');
  }

  function buildDatasets(spec, d) {
    const c = window.MCAGCharts.colors();
    const col = (k) => c[k] || k;
    const type = spec.type === 'gauge' ? 'doughnut' : spec.type;
    return d.series.map((serie) => {
      const colors = serie.colors ? serie.colors.map(col) : col(serie.color || 'brand');
      const ds = { label: serie.label, data: serie.values.slice(), backgroundColor: colors, borderColor: colors };
      if (type === 'line') {
        Object.assign(ds, { backgroundColor: hexToRgba(colors, .14), fill: true, tension: .38, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: colors });
      } else if (type === 'bar') {
        Object.assign(ds, { borderRadius: 8, borderSkipped: false, maxBarThickness: 34, borderWidth: 0 });
        if (spec.stacked) ds.stack = 's';
      } else if (type === 'polarArea') {
        Object.assign(ds, { backgroundColor: [].concat(colors).map((x) => hexToRgba(x, .78)), borderWidth: 0 });
      } else {
        Object.assign(ds, { borderWidth: 0, cutout: spec.type === 'gauge' ? '76%' : '66%' });
      }
      return ds;
    });
  }

  function chartOptions(spec) {
    const c = window.MCAGCharts.colors();
    const opts = { responsive: true, maintainAspectRatio: false, layout: { padding: { left: 6, right: 6 } }, plugins: { legend: { display: false }, tooltip: {} } };
    if (spec.type === 'bar' || spec.type === 'line') {
      const valueAxis = { grid: { color: c.grid }, border: { display: false }, beginAtZero: true, stacked: !!spec.stacked,
        ticks: { maxTicksLimit: spec.horizontal ? 5 : 7, precision: spec.money || spec.suffix ? undefined : 0, callback: (v) => spec.money ? fmtCompact.format(v) : fmtNum.format(v) + (spec.suffix || '') } };
      const catAxis = { grid: { display: false }, border: { display: false }, stacked: !!spec.stacked,
        ticks: { autoSkip: false, maxRotation: 0, callback: function (v) { const l = String(this.getLabelForValue(v)); return l.length > 18 ? l.slice(0, 17) + '…' : l; } } };
      opts.scales = spec.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis };
      if (spec.horizontal) opts.indexAxis = 'y';
      if (spec.type === 'line' || spec.stacked) opts.interaction = { mode: 'index', intersect: false };
    }
    if (spec.type === 'polarArea') opts.scales = { r: { grid: { color: c.grid }, ticks: { display: false } } };
    if (spec.type === 'gauge') Object.assign(opts, { circumference: 180, rotation: -90 });
    return opts;
  }

  function chartSummary(spec, d) {
    const parts = d.labels.slice(0, 8).map((l, i) => l + ' ' + d.series.map((s) => chartValueText(spec, s.values[i])).join(' / '));
    return spec.title + '. ' + parts.join('; ') + '.';
  }

  function enhanceOpts(spec, d) {
    return {
      money: !!spec.money,
      suffix: spec.suffix,
      onPick: (label, value, ds) => {
        if (!spec.link) return;
        const i = d.labels.indexOf(label);
        const q = d.q && i !== -1 ? d.q[i] : label;
        window.toast('info', label + ': ' + chartValueText(spec, value), (ds.label ? ds.label + ' · ' : '') + 'Abriendo ' + ENTITIES[spec.link].title.toLowerCase() + '…', 1400);
        setTimeout(() => { location.href = url.entity(spec.link, q ? '&q=' + encodeURIComponent(q) : ''); }, 350);
      }
    };
  }

  function paintChart(spec, animate) {
    const inst = chartInstances[spec.id];
    if (!inst || !inst.chart) return;   // Chart.js aún cargando: se pinta al terminar
    const d = spec.data(S);
    const chart = inst.chart;
    const datasets = buildDatasets(spec, d);
    chart.data.labels = d.labels.slice();
    // Se mutan los datasets existentes (no se reemplazan) para que Chart.js anime la transición
    datasets.forEach((ds, i) => {
      if (chart.data.datasets[i]) Object.assign(chart.data.datasets[i], ds);
      else chart.data.datasets.push(ds);
    });
    chart.data.datasets.length = datasets.length;
    if (animate) chart.update();
    window.MCAGCharts.enhance(chart, enhanceOpts(spec, d));
    inst.canvas.setAttribute('aria-label', chartSummary(spec, d));
    const empty = d.series.every((sr) => sr.values.every((v) => !v));
    inst.box.classList.toggle('is-empty', empty);
    inst.emptyMsg.hidden = !empty;
    if (inst.center) {
      inst.center.value.textContent = d.center ? d.center.value : '';
      inst.center.label.textContent = d.center ? d.center.label : '';
    }
  }

  function buildChartCard(spec) {
    const colCls = { 12: 'col-12', 8: 'col-12 col-xl-8', 6: 'col-12 col-lg-6', 4: 'col-12 col-md-6 col-xl-4' }[spec.col || 6];
    const boxCls = spec.type === 'gauge' ? 'chart-gauge' : (spec.col || 6) <= 4 ? 'chart-box-sm' : 'chart-box';
    const canvas = h('canvas', { role: 'img', 'aria-label': spec.title });
    const box = h('div', { class: boxCls }, canvas);
    const emptyMsg = h('p', { class: 'chart-empty', text: 'Sin datos para graficar todavía.', hidden: true });
    box.appendChild(emptyMsg);
    let center = null;
    if (spec.type === 'gauge') {
      center = { value: h('div', { class: 'gauge-value' }), label: h('div', { class: 'gauge-label' }) };
      box.appendChild(h('div', { class: 'gauge-center' }, [center.value, center.label]));
    }
    const refresh = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Actualizar gráfica ' + spec.title }, icon('refresh', ''));
    const card = h('div', { class: colCls }, h('article', { class: 'card-x h-100 chart-card' }, [
      h('div', { class: 'card-x-header' }, [
        h('div', { class: 'min-w-0' }, [h('h3', { class: 'card-x-title', text: spec.title }), h('p', { class: 'card-x-sub', text: spec.sub || '' })]),
        h('div', { class: 'card-x-tools' }, refresh)
      ]),
      h('div', { class: 'card-x-body' }, box)
    ]));
    refresh.addEventListener('click', () => {
      refresh.classList.add('is-spinning');
      setTimeout(() => refresh.classList.remove('is-spinning'), 640);
      box.classList.add('chart-reloading');
      setTimeout(() => {
        box.classList.remove('chart-reloading');
        const chart = chartInstances[spec.id].chart;
        paintChart(spec, false);
        chart.reset();
        chart.update();             // re-dispara la animación de entrada con datos frescos
      }, 420);
    });
    return { card: card, canvas: canvas, box: box, emptyMsg: emptyMsg, center: center };
  }

  function renderCharts() {
    if (!E.charts || !E.charts.length) return;
    const grid = $('#chartGrid');
    grid.hidden = false;
    if (Object.keys(chartInstances).length) {
      E.charts.forEach((spec) => paintChart(spec, true));
      return;
    }
    // Esqueleto mientras carga Chart.js
    E.charts.forEach((spec) => {
      const parts = buildChartCard(spec);
      parts.box.classList.add('chart-loading');
      grid.appendChild(parts.card);
      chartInstances[spec.id] = Object.assign({ chart: null }, parts);
    });
    // Se espera a las fuentes: si Chart.js mide las etiquetas con la fuente de respaldo, luego se recortan
    Promise.all([loadChartJs(), document.fonts ? document.fonts.ready : null]).then(() => {
      window.MCAGCharts.defaults();
      E.charts.forEach((spec) => {
        const inst = chartInstances[spec.id];
        inst.box.classList.remove('chart-loading');
        const d = spec.data(S);
        inst.chart = new Chart(inst.canvas, {
          type: spec.type === 'gauge' ? 'doughnut' : spec.type,
          data: { labels: d.labels.slice(), datasets: buildDatasets(spec, d) },
          options: chartOptions(spec)
        });
        window.MCAGCharts.register(inst.chart);
        paintChart(spec, false);
      });
    }).catch((err) => {
      console.error('[Mi Cliente AG] Gráficas:', err);
      grid.hidden = true;
      window.toast('warning', 'Gráficas no disponibles', 'No se pudo cargar la librería de gráficas. Revisa tu conexión.');
    });
  }

  // Cambio de tema: los colores de las series salen de tokens CSS, se recalculan
  document.addEventListener('mcag:theme', () => {
    if (!E || !E.charts) return;
    E.charts.forEach((spec) => {
      const inst = chartInstances[spec.id];
      if (!inst || !inst.chart) return;
      paintChart(spec, false);   // la rejilla la recolorea repaintCharts() de main.js
    });
  });

  function renderAll(flashId) {
    renderKpis();
    renderChips();
    renderTable(flashId);
    if (E.charts) renderCharts();
  }

  /* ---------- Modales ---------- */
  const modal = (id) => (window.bootstrap ? bootstrap.Modal.getOrCreateInstance(document.getElementById(id)) : null);
  // Abre un modal después de que el anterior termine de cerrarse (evita backdrops encimados)
  function afterHide(id, fn) {
    const el = document.getElementById(id);
    if (!el.classList.contains('show')) { fn(); return; }
    el.addEventListener('hidden.bs.modal', fn, { once: true });
    modal(id).hide();
  }

  /* ---------- Formulario ---------- */
  let formCtx = null; // { row, values, controls, attempted }

  function defaults() {
    const values = {};
    E.fields.forEach((fld) => {
      let v = typeof fld.def === 'function' ? fld.def() : fld.def;
      if (v === undefined) v = fld.t === 'multi' ? [] : fld.t === 'switch' ? false : '';
      values[fld.k] = Array.isArray(v) ? v.slice() : v;
    });
    return values;
  }

  function whenOk(fld, values) {
    if (!fld.when) return true;
    return Object.keys(fld.when).every((k) => fld.when[k].indexOf(values[k]) !== -1);
  }

  function refOptions(fld, current, selfId) {
    return S.all(fld.ref).filter((r) => {
      if (r.id === current) return true;
      if (fld.ref === KEY && r.id === selfId) return false; // una cuenta no puede ser su propia matriz
      if (!fld.rw) return true;
      return Object.keys(fld.rw).every((k) => r[k] === fld.rw[k]);
    }).map((r) => ({ value: r.id, label: S.label(fld.ref, r.id) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  function buildControl(fld, value, id, describedBy, selfId) {
    const common = { id: id, name: fld.k, 'aria-describedby': describedBy };
    if (fld.req) common['aria-required'] = 'true';
    const isCode = E.code && fld.k === E.code.k;

    if (fld.calc || fld.ro || isCode) {
      return h('input', Object.assign(common, {
        class: 'input-x', type: 'text', readonly: true, tabindex: isCode ? null : '-1',
        placeholder: isCode ? 'Se asigna al guardar' : '', value: ''
      }));
    }
    if (fld.t === 'select' || fld.t === 'ref') {
      const sel = h('select', Object.assign(common, { class: 'input-x' }));
      sel.appendChild(h('option', { value: '', text: fld.req ? 'Selecciona…' : '— Ninguno —' }));
      const opts = fld.t === 'ref' ? refOptions(fld, value, selfId) : (fld.o || []).map((o) => ({ value: o, label: o }));
      opts.forEach((o) => sel.appendChild(h('option', { value: o.value, text: o.label })));
      sel.value = value == null ? '' : value;
      return sel;
    }
    if (fld.t === 'multi') {
      const group = h('div', { class: 'check-chips', role: 'group', id: id, 'aria-labelledby': id + '-label', 'aria-describedby': describedBy });
      const opts = fld.ref ? refOptions(fld, null, selfId) : (fld.o || []).map((o) => ({ value: o, label: o }));
      const vals = [].concat(value || []);
      opts.forEach((o, i) => {
        group.appendChild(h('label', { class: 'check-chip' }, [
          h('input', { type: 'checkbox', name: fld.k, value: o.value, id: id + '-' + i, checked: vals.indexOf(o.value) !== -1 }),
          h('span', null, [icon('check', 'check-ico'), o.label])
        ]));
      });
      return group;
    }
    if (fld.t === 'switch') {
      return h('label', { class: 'switch-x' }, [
        h('input', Object.assign(common, { type: 'checkbox', role: 'switch', checked: !!value })),
        h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
        h('span', { class: 'switch-text', text: value ? 'Sí' : 'No' })
      ]);
    }
    if (fld.t === 'textarea') {
      const ta = h('textarea', Object.assign(common, { class: 'input-x', rows: fld.rows || 3, placeholder: fld.ph || '' }));
      ta.value = value == null ? '' : value;
      return ta;
    }
    const typeMap = { money: 'number', percent: 'number', number: 'number', email: 'email', tel: 'tel', url: 'url', date: 'date', time: 'time', datetime: 'datetime-local' };
    const attrs = Object.assign(common, { class: 'input-x', type: typeMap[fld.t] || 'text', placeholder: fld.ph || '' });
    if (fld.t === 'money') Object.assign(attrs, { step: '0.01', min: fld.min, inputmode: 'decimal' });
    if (fld.t === 'percent') Object.assign(attrs, { step: 'any', min: fld.min != null ? fld.min : 0, max: fld.max != null ? fld.max : 100, inputmode: 'decimal' });
    if (fld.t === 'number') Object.assign(attrs, { step: fld.step || '1', min: fld.min, max: fld.max, inputmode: fld.step === 'any' ? 'decimal' : 'numeric' });
    if (fld.t === 'email') attrs.autocomplete = 'off';
    if (fld.upper) attrs.autocapitalize = 'characters';
    const input = h('input', attrs);
    input.value = value == null ? '' : value;
    if (fld.t === 'money' || fld.t === 'percent') {
      return h('div', { class: 'input-affix' }, [
        fld.t === 'money' ? h('span', { class: 'affix', 'aria-hidden': 'true', text: '$' }) : null,
        input,
        fld.t === 'percent' ? h('span', { class: 'affix affix-end', 'aria-hidden': 'true', text: '%' }) : null
      ]);
    }
    return input;
  }

  function readValue(fld) {
    const id = 'fld-' + fld.k;
    if (fld.t === 'multi') return $$('#' + id + ' input:checked').map((i) => i.value);
    const el = document.getElementById(id);
    if (!el) return '';
    if (fld.t === 'switch') return el.checked;
    const raw = el.value.trim();
    if (['money', 'percent', 'number'].indexOf(fld.t) !== -1) return raw === '' ? '' : Number(raw);
    return fld.upper ? raw.toUpperCase() : raw;
  }

  function collect() {
    const values = Object.assign({}, formCtx.values);
    E.fields.forEach((fld) => {
      if (fld.calc || fld.ro || (E.code && fld.k === E.code.k)) return;
      values[fld.k] = readValue(fld);
    });
    return values;
  }

  // Recalcula campos calculados y visibilidad condicional mientras se escribe
  function syncForm() {
    const values = collect();
    E.fields.forEach((fld) => {
      const wrap = document.getElementById('wrap-' + fld.k);
      if (!wrap) return;
      wrap.hidden = !whenOk(fld, values);
      if (fld.calc) {
        const el = document.getElementById('fld-' + fld.k);
        const v = S.value(E, fld, values);
        el.value = isEmpty(v) ? '' : text(E, fld, values);
      }
      if (fld.t === 'switch') {
        const el = document.getElementById('fld-' + fld.k);
        $('.switch-text', wrap).textContent = el.checked ? 'Sí' : 'No';
      }
    });
    return values;
  }

  function openForm(row) {
    const isEdit = !!row;
    formCtx = { row: row, values: isEdit ? JSON.parse(JSON.stringify(row)) : defaults(), attempted: false };
    $('#formTitle').textContent = isEdit ? 'Editar ' + E.one : newWord(E);
    $('#formSub').textContent = isEdit ? S.label(KEY, row.id) : E.title;
    $('#btnSaveLabel').textContent = isEdit ? 'Guardar cambios' : 'Crear ' + E.one;

    const body = $('#crudForm');
    body.textContent = '';
    const sections = [];
    E.fields.forEach((fld) => {
      const name = fld.s || 'Datos generales';
      let sec = sections.find((s) => s.name === name);
      if (!sec) { sec = { name: name, fields: [] }; sections.push(sec); }
      sec.fields.push(fld);
    });

    sections.forEach((sec, si) => {
      const grid = h('div', { class: 'row g-3' });
      sec.fields.forEach((fld) => {
        const id = 'fld-' + fld.k;
        const helpId = fld.help ? id + '-help' : null;
        const errId = id + '-error';
        const describedBy = [helpId, errId].filter(Boolean).join(' ');
        const labelTag = fld.t === 'multi' ? 'span' : 'label';
        const labelAttrs = fld.t === 'multi' ? { class: 'field-label', id: id + '-label' } : { class: 'field-label', for: id };
        if (fld.t === 'switch') labelAttrs.for = id;
        const wrap = h('div', { class: 'field-x col-12 col-md-' + (fld.c || 6), id: 'wrap-' + fld.k }, [
          h(labelTag, labelAttrs, [fld.l, fld.req && !fld.calc ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null]),
          buildControl(fld, formCtx.values[fld.k], id, describedBy, isEdit ? row.id : null),
          fld.help ? h('div', { class: 'field-help', id: helpId, text: fld.help }) : null,
          h('div', { class: 'field-error', id: errId, 'aria-live': 'polite' })
        ]);
        grid.appendChild(wrap);
      });
      body.appendChild(h('fieldset', { class: 'form-sec' }, [
        h('legend', { class: 'form-sec-title' }, [h('span', { class: 'form-sec-num', 'aria-hidden': 'true', text: String(si + 1) }), sec.name]),
        grid
      ]));
    });

    if (isEdit && E.code) {
      const codeEl = document.getElementById('fld-' + E.code.k);
      if (codeEl) codeEl.value = row[E.code.k] || '';
    }
    syncForm();

    const modalEl = document.getElementById('formModal');
    modalEl.addEventListener('shown.bs.modal', () => {
      const first = $('#crudForm .input-x:not([readonly]), #crudForm input[type="checkbox"]');
      first?.focus();
    }, { once: true });
    modal('formModal')?.show();
  }

  function validate(values) {
    const errors = {};
    const others = rows().filter((r) => !formCtx.row || r.id !== formCtx.row.id);
    E.fields.forEach((fld) => {
      if (fld.calc || fld.ro || (E.code && fld.k === E.code.k)) return;
      if (!whenOk(fld, values)) return;
      const v = values[fld.k];
      const empty = isEmpty(v) || (fld.t === 'switch' && false);
      if (fld.req && empty && fld.t !== 'switch') {
        errors[fld.k] = fld.t === 'multi' ? 'Selecciona al menos una opción.' : (fld.t === 'select' || fld.t === 'ref') ? 'Selecciona una opción.' : 'Este campo es obligatorio.';
        return;
      }
      if (empty) return;
      if (fld.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) errors[fld.k] = 'Escribe un correo válido, por ejemplo nombre@empresa.mx.';
      if (fld.t === 'url') {
        let ok = false;
        try { ok = /^https?:$/.test(new URL(v).protocol); } catch (e) { ok = false; }
        if (!ok) errors[fld.k] = 'Escribe una URL completa que empiece con https://';
      }
      if (fld.t === 'tel') {
        const digits = String(v).replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 13) errors[fld.k] = 'Escribe un teléfono de 10 dígitos (con lada).';
      }
      if (['money', 'percent', 'number'].indexOf(fld.t) !== -1) {
        if (isNaN(v)) errors[fld.k] = 'Escribe un número.';
        const min = fld.min != null ? fld.min : (fld.t === 'percent' || fld.t === 'money' ? 0 : null);
        const max = fld.max != null ? fld.max : (fld.t === 'percent' ? 100 : null);
        if (min != null && v < min) errors[fld.k] = 'Debe ser mayor o igual a ' + fmtNum.format(min) + '.';
        if (max != null && v > max) errors[fld.k] = 'Debe ser menor o igual a ' + fmtNum.format(max) + '.';
        if (fld.t === 'number' && (!fld.step || fld.step === '1') && !Number.isInteger(v)) errors[fld.k] = 'Escribe un número entero.';
      }
      if (fld.pattern && !new RegExp(fld.pattern).test(String(v))) errors[fld.k] = fld.patternMsg || 'Formato inválido.';
      if (fld.after && values[fld.after] && String(v) < String(values[fld.after])) {
        const other = E.fields.find((x) => x.k === fld.after);
        errors[fld.k] = 'Debe ser igual o posterior a “' + (other ? other.l : fld.after) + '”.';
      }
      if (fld.uniq && others.some((r) => String(r[fld.k] || '').toLowerCase() === String(v).toLowerCase())) {
        errors[fld.k] = 'Ya existe ' + (E.g === 'f' ? 'otra ' : 'otro ') + E.one + ' con este valor.';
      }
    });
    return errors;
  }

  function showErrors(errors) {
    E.fields.forEach((fld) => {
      const wrap = document.getElementById('wrap-' + fld.k);
      if (!wrap) return;
      const msg = errors[fld.k] || '';
      wrap.classList.toggle('has-error', !!msg);
      $('.field-error', wrap).textContent = msg;
      const ctrl = document.getElementById('fld-' + fld.k);
      if (ctrl) {
        if (msg) ctrl.setAttribute('aria-invalid', 'true');
        else ctrl.removeAttribute('aria-invalid');
      }
    });
  }

  function nextCode() {
    const re = new RegExp('^' + E.code.p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
    const max = rows().reduce((acc, r) => {
      const m = re.exec(r[E.code.k] || '');
      return m ? Math.max(acc, +m[1]) : acc;
    }, E.code.n - 1);
    return E.code.p + (max + 1);
  }

  function diff(before, after) {
    return E.fields.filter((fld) => !fld.calc && JSON.stringify(before[fld.k] ?? '') !== JSON.stringify(after[fld.k] ?? ''))
      .slice(0, 4)
      .map((fld) => fld.l + ': ' + (text(E, fld, before) || '—') + ' → ' + (text(E, fld, after) || '—'))
      .join(' · ');
  }

  function submitForm(ev) {
    ev.preventDefault();
    if (!formCtx) return;
    const btn = $('#btnSave');
    if (btn.classList.contains('is-loading')) return;
    formCtx.attempted = true;
    const values = syncForm();
    const errors = validate(values);
    showErrors(errors);
    const keys = Object.keys(errors);
    if (keys.length) {
      const first = document.getElementById('fld-' + keys[0]);
      (first && first.matches('input, select, textarea') ? first : first?.querySelector('input'))?.focus();
      window.toast('error', 'Revisa el formulario', keys.length === 1 ? 'Hay 1 campo con error.' : 'Hay ' + keys.length + ' campos con error.');
      return;
    }

    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    // Latencia simulada de "servidor"
    setTimeout(() => {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');

      E.fields.forEach((fld) => {
        if (!whenOk(fld, values)) values[fld.k] = fld.t === 'multi' ? [] : fld.t === 'switch' ? false : '';
        if (fld.calc) values[fld.k] = S.value(E, fld, values);
      });

      const list = rows().slice();
      const isEdit = !!formCtx.row;
      let saved;
      if (isEdit) {
        saved = Object.assign({}, values, { id: formCtx.row.id });
        const idx = list.findIndex((r) => r.id === saved.id);
        const changes = diff(list[idx], saved);
        list[idx] = saved;
        S.save(KEY, list);
        S.audit('Edición', E, saved, changes || 'Sin cambios de valor.');
      } else {
        saved = Object.assign({ id: KEY + '-' + Date.now().toString(36) }, values);
        if (E.code) saved[E.code.k] = nextCode();
        list.unshift(saved);
        S.save(KEY, list);
        S.audit('Alta', E, saved, 'Registro creado.');
        // Que el nuevo registro quede visible
        if (state.filter !== 'all' && saved[E.filter] !== state.filter) state.filter = 'all';
        state.q = '';
        $('#tableSearch').value = '';
      }

      afterHide('formModal', () => {
        window.toast('success', isEdit ? 'Cambios guardados' : done(E, 'cread'), S.label(KEY, saved.id));
        renderAll(saved.id);
      });
      formCtx = null;
    }, 450);
  }

  /* ---------- Ficha de detalle ---------- */
  function relatedOf(id) {
    const out = [];
    Object.keys(ENTITIES).forEach((k) => {
      const Ent = ENTITIES[k];
      if (k === 'auditoria') return;
      Ent.fields.forEach((fld) => {
        if (fld.ref !== KEY || (fld.t !== 'ref' && fld.t !== 'multi')) return;
        const matches = S.all(k).filter((r) => (fld.t === 'multi' ? [].concat(r[fld.k] || []).indexOf(id) !== -1 : r[fld.k] === id));
        if (matches.length) out.push({ Ent: Ent, fld: fld, rows: matches });
      });
    });
    return out;
  }

  let viewId = null;
  function openView(row) {
    viewId = row.id;
    $('#viewTitle').textContent = S.label(KEY, row.id) || E.one;
    const badges = $('#viewBadges');
    badges.textContent = '';
    E.fields.filter((fld) => fld.badge && fld.k !== E.main.k).slice(0, 2).forEach((fld) => {
      const v = S.value(E, fld, row);
      if (!isEmpty(v)) badges.appendChild(badge(fld.k, String(v)));
    });

    const body = $('#viewBody');
    body.textContent = '';
    const sections = [];
    E.fields.forEach((fld) => {
      if (!whenOk(fld, row) && isEmpty(row[fld.k])) return;
      const name = fld.s || 'Datos generales';
      let sec = sections.find((s) => s.name === name);
      if (!sec) { sec = { name: name, fields: [] }; sections.push(sec); }
      sec.fields.push(fld);
    });
    sections.forEach((sec) => {
      const dl = h('dl', { class: 'detail-grid' });
      sec.fields.forEach((fld) => {
        dl.appendChild(h('div', { class: 'detail-item' + ((fld.c || 6) === 12 || fld.t === 'textarea' || fld.t === 'multi' ? ' is-wide' : '') }, [
          h('dt', { text: fld.l }),
          h('dd', null, display(E, fld, row, true))
        ]));
      });
      body.appendChild(h('section', { class: 'detail-sec' }, [h('h6', { class: 'detail-sec-title', text: sec.name }), dl]));
    });

    const rel = relatedOf(row.id);
    if (rel.length) {
      const wrap = h('div', { class: 'related-grid' });
      rel.forEach((grp) => {
        const label = grp.Ent.title + (grp.fld.l !== E.one && grp.fld.ref === grp.Ent.key ? ' · ' + grp.fld.l : '');
        wrap.appendChild(h('div', { class: 'related-card' }, [
          h('div', { class: 'related-head' }, [icon(grp.Ent.icon, 'icon-md'), h('strong', { text: label }), h('span', { class: 'badge-x badge-navy', text: String(grp.rows.length) })]),
          h('ul', { class: 'related-list' }, grp.rows.slice(0, 5).map((r) =>
            h('li', null, h('a', { href: url.entity(grp.Ent.key, '&id=' + encodeURIComponent(r.id)) }, [
              h('span', { text: S.label(grp.Ent.key, r.id) }), icon('chevron_right')
            ]))
          )),
          grp.rows.length > 5 ? h('a', { class: 'related-more', href: url.entity(grp.Ent.key, '&q=' + encodeURIComponent(S.label(KEY, row.id))), text: 'Ver los ' + grp.rows.length }) : null
        ]));
      });
      body.appendChild(h('section', { class: 'detail-sec' }, [h('h6', { class: 'detail-sec-title', text: 'Registros relacionados' }), wrap]));
    }

    $('#viewEdit').hidden = !!E.readonly;
    $('#viewDelete').hidden = !!E.readonly;
    modal('viewModal')?.show();
  }

  /* ---------- Baja ---------- */
  function removeRow(row) {
    const name = S.label(KEY, row.id);
    const relCount = relatedOf(row.id).reduce((acc, g) => acc + g.rows.length, 0);
    const detail = relCount
      ? 'Tiene ' + relCount + ' registro' + (relCount === 1 ? '' : 's') + ' relacionado' + (relCount === 1 ? '' : 's') + ' que quedará' + (relCount === 1 ? '' : 'n') + ' sin esta referencia.'
      : 'Esta acción no se puede deshacer.';
    const doIt = () => {
      S.save(KEY, rows().filter((r) => r.id !== row.id));
      S.audit('Baja', E, row, 'Registro eliminado: ' + name);
      window.toast('success', done(E, 'eliminad'), name);
      renderAll();
    };
    const css = getComputedStyle(document.documentElement);
    if (typeof Swal === 'undefined') { if (window.confirm('¿Eliminar ' + name + '?')) doIt(); return; }
    Swal.fire({
      title: '¿Eliminar ' + E.one + '?',
      text: name + '. ' + detail,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      focusCancel: true,
      confirmButtonColor: css.getPropertyValue('--danger').trim(),
      cancelButtonColor: css.getPropertyValue('--ag-gray-2').trim()
    }).then((res) => { if (res.isConfirmed) doIt(); });
  }

  /* ---------- Exportar / restablecer ---------- */
  function exportCsv() {
    const list = visibleRows();
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [E.fields.map((fld) => q(fld.l)).join(',')].concat(
      list.map((r) => E.fields.map((fld) => q(text(E, fld, r))).join(','))
    );
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: KEY + '-' + today() + '.csv' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    S.audit('Exportación', E, null, list.length + ' registros exportados a CSV.');
    window.toast('success', 'Exportación lista', list.length + ' registros en ' + KEY + '-' + today() + '.csv');
  }

  function resetData() {
    const doIt = () => {
      S.reset(KEY);
      state.filter = 'all'; state.q = ''; state.page = 1;
      $('#tableSearch').value = '';
      renderAll();
      window.toast('info', 'Datos restablecidos', 'Se cargaron de nuevo los datos de demostración.');
    };
    if (typeof Swal === 'undefined') { doIt(); return; }
    Swal.fire({
      title: '¿Restablecer datos de demostración?',
      text: 'Se perderán los cambios hechos en ' + E.title.toLowerCase() + '.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Restablecer',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: getComputedStyle(document.documentElement).getPropertyValue('--ag-blue').trim()
    }).then((res) => { if (res.isConfirmed) doIt(); });
  }

  /* ---------- Entidad desconocida ---------- */
  function renderNotFound() {
    document.title = 'Módulo no encontrado — Mi Cliente AG';
    $('#pageTitle').textContent = 'Módulo no encontrado';
    $('#pageBreadcrumb').textContent = '';
    $('#pageBreadcrumb').append(h('a', { href: url.home, text: 'Inicio' }));
    $('#crudCard').hidden = true;
    $('#notFound').hidden = false;
    const fab = $('#fabNew');
    if (fab) fab.hidden = true;
  }

  /* ---------- Arranque ---------- */
  function init() {
    if (!E) { renderNotFound(); return; }
    renderHeader();
    buildTableHead();
    state.q = params.get('q') || '';
    $('#tableSearch').value = state.q;
    renderAll();

    let t = null;
    $('#tableSearch').addEventListener('input', (ev) => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = ev.target.value; state.page = 1; renderTable(); }, 120);
    });

    // Delegación: clic en fila abre la ficha; botones de acción
    $('#crudTable').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tbody tr[data-id]');
      if (!tr) return;
      const row = S.get(KEY, tr.dataset.id);
      if (!row) return;
      const action = ev.target.closest('[data-action]')?.dataset.action || 'view';
      if (action === 'edit') openForm(row);
      else if (action === 'delete') removeRow(row);
      else openView(row);
    });

    const openNew = () => openForm(null);
    $('#btnNew').addEventListener('click', openNew);
    $('#emptyNew').addEventListener('click', openNew);
    $('#fabNew')?.addEventListener('click', (ev) => { ev.preventDefault(); openNew(); });
    $('#emptyClear').addEventListener('click', () => {
      state.q = ''; state.filter = 'all'; state.page = 1;
      $('#tableSearch').value = '';
      renderChips(); renderTable();
      $('#tableSearch').focus();
    });
    $('#btnExport').addEventListener('click', exportCsv);
    $('#btnReset').addEventListener('click', resetData);

    const form = $('#crudForm');
    form.addEventListener('submit', submitForm);
    $('#btnSave').addEventListener('click', () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })));
    const onChange = () => {
      if (!formCtx) return;
      const values = syncForm();
      if (formCtx.attempted) showErrors(validate(values));
    };
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);

    $('#viewEdit').addEventListener('click', () => {
      const row = S.get(KEY, viewId);
      if (row) afterHide('viewModal', () => openForm(row));
    });
    $('#viewDelete').addEventListener('click', () => {
      const row = S.get(KEY, viewId);
      if (row) afterHide('viewModal', () => removeRow(row));
    });

    // Enlaces profundos
    const deep = params.get('id') ? S.get(KEY, params.get('id')) : null;
    if (deep) openView(deep);
    else if (params.get('nuevo') === '1' && !E.readonly) openNew();
    else if (params.get('id')) window.toast('warning', 'Registro no encontrado', 'Puede que se haya eliminado.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { init(); } catch (err) { console.error('[Mi Cliente AG] Falló crud:', err); }
  });
})();
