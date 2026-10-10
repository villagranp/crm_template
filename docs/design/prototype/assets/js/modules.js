/* ==========================================================================
   Mi Cliente AG — modules.js
   Fuente única de módulos, entidades, campos y datos de demostración.
   - Genera el menú lateral, la nav del topbar, el menú de apps y la
     navegación del command palette (así no se duplica en cada página).
   - Expone window.MCAG (config + store en localStorage) para crud.js.
   Se carga ANTES de main.js: el menú debe existir cuando initSidebar arranca.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Rutas: se derivan de la ubicación de este script ---------- */
  const SCRIPT = document.currentScript;
  const ROOT = SCRIPT ? SCRIPT.src.replace(/assets\/js\/modules\.js.*$/, '') : '';
  const url = {
    home: ROOT + 'index.html',
    entity: (key, extra) => ROOT + 'pages/modulo.html?e=' + encodeURIComponent(key) + (extra || '')
  };

  /* ---------- Helpers de definición ---------- */
  const f = (k, l, t, x) => Object.assign({ k: k, l: l, t: t || 'text' }, x || {});
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const estado = (o, x) => f('estado', 'Estado', 'select', Object.assign({ o: o || ['Activo', 'Inactivo'], req: true, list: true, badge: true, c: 4, def: (o || ['Activo'])[0] }, x || {}));
  const num = (v) => (v === '' || v == null || isNaN(+v)) ? 0 : +v;

  const PERIODOS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Anual 2026'];
  const INDUSTRIAS = ['Manufactura', 'Retail', 'Salud', 'Hotelería', 'Logística', 'Educación', 'Textil', 'Servicios'];
  const FRECUENCIAS = ['Manual', 'Diario', 'Semanal', 'Mensual'];

  /* Color de badge por valor (estado = color + texto, nunca sólo color) */
  const BADGES = {
    success: ['Activo', 'Activa', 'Vigente', 'Resuelto', 'Ganada', 'Aceptada', 'Entregado', 'Completada', 'Cumplida', 'En tiempo', 'Publicado', 'Publicada', 'Conectada', 'Convertido', 'Calificado', 'Enviado a ventas', 'Satisfecho', 'Promotor', 'Finalizada'],
    warning: ['Media', 'En espera', 'En aprobación', 'Por vencer', 'En riesgo', 'Pausada', 'Pausado', 'Pendiente', 'Programada', 'Con errores', 'En nurturing', 'Neutral', 'Pasivo', 'Invitado', 'Edición', 'Contactado', 'Planeada'],
    danger: ['Alta', 'Escalado', 'Perdida', 'Rechazada', 'Cancelado', 'Cancelada', 'Vencido', 'Vencida', 'Incumplido', 'Descalificado', 'Descartado', 'Insatisfecho', 'Detractor', 'Suspendido', 'Desconectada', 'Crítico', 'Descontinuado'],
    info: ['Abierto', 'Nuevo', 'Enviada', 'Enviado', 'En surtido', 'En ruta', 'Sin revisar', 'Abierta', 'CSAT', 'Exportación', 'Público'],
    brand: ['En curso', 'Premium', 'Producto', 'Dinámica', 'NPS', 'Cliente', 'Marketing', 'Contrato de servicio'],
    steel: ['Inactivo', 'Borrador', 'Cerrado', 'Archivada', 'Archivado', 'Omitido', 'Estática', 'Ex-cliente', 'Interno', 'Inicio de sesión']
  };
  // "Alta"/"Baja" son prioridad en casi todo el CRM; en la bitácora son acciones (alta = creación)
  const BADGE_OVERRIDES = { accion: { Alta: 'success', Baja: 'danger' } };
  function badgeFor(fieldKey, value) {
    const o = BADGE_OVERRIDES[fieldKey];
    if (o && o[value]) return o[value];
    for (const variant in BADGES) if (BADGES[variant].indexOf(value) !== -1) return variant;
    return 'navy';
  }

  /* ==========================================================================
     MÓDULOS Y ENTIDADES
     Campo: k clave · l etiqueta · t tipo (text|email|tel|url|number|money|percent|
     date|time|select|ref|multi|textarea|switch) · req · o opciones · ref entidad ·
     rw filtro del ref · c ancho en md (12) · list columna en tabla · s sección ·
     main nombre visible · sub subtítulo en tabla · uniq · after (fecha ≥ otro campo) ·
     min/max · calc(r, S) campo calculado de sólo lectura · when {campo: valor} ·
     def valor inicial · ph placeholder · help ayuda · w ancho de columna (px)
     Entidad: code {k, p, n} folio automático · filter campo para chips ·
     sum campo money a totalizar · readonly (sin alta/edición/baja)
     ========================================================================== */
  const MODULES = [
    {
      key: 'catalogos', title: 'Catálogos', icon: 'inventory_2', desc: 'Maestros que alimentan a los demás módulos',
      entities: ['productos', 'listas-precios', 'territorios', 'canales', 'segmentos', 'etapas', 'motivos', 'tipos-servicio', 'fiscal', 'competidores', 'equipos']
    },
    {
      key: 'ventas', title: 'Ventas', icon: 'trending_up', desc: 'Cuentas, contactos y proceso comercial',
      entities: ['clientes', 'contactos', 'leads', 'oportunidades', 'cotizaciones', 'pedidos', 'forecast', 'actividades-venta'],
      badge: { e: 'leads', f: 'estado', v: ['Nuevo'] }
    },
    {
      key: 'servicio', title: 'Servicio', icon: 'support_agent', desc: 'Postventa, SLA y satisfacción',
      entities: ['tickets', 'sla', 'conocimiento', 'contratos', 'encuestas', 'actividades-servicio'],
      badge: { e: 'tickets', f: 'estado', v: ['Abierto', 'En curso', 'En espera', 'Escalado'] }
    },
    {
      key: 'marketing', title: 'Marketing', icon: 'campaign', desc: 'Campañas, audiencias y captación',
      entities: ['campanas', 'audiencias', 'automatizaciones', 'landings', 'leads-entrantes'],
      badge: { e: 'leads-entrantes', f: 'estado', v: ['Sin revisar'] }
    },
    {
      key: 'analitica', title: 'Analítica', icon: 'monitoring', desc: 'Dashboards, reportes y KPIs',
      entities: ['dashboards', 'reportes-pipeline', 'reportes-servicio', 'rentabilidad', 'kpis']
    },
    {
      key: 'admin', title: 'Administración', icon: 'settings', desc: 'Configuración transversal del sistema', system: true,
      entities: ['usuarios', 'roles', 'aprobaciones', 'auditoria', 'integraciones']
    }
  ];

  const reporteFields = (tipos, agrupar) => [
    f('nombre', 'Nombre del reporte', 'text', { req: true, main: true, list: true, c: 12, ph: 'Ej. Embudo mensual — Ventas Norte' }),
    f('tipo', 'Tipo de reporte', 'select', { o: tipos, req: true, list: true, c: 6 }),
    f('periodo', 'Periodo', 'select', { o: ['Mes actual', 'Trimestre actual', 'Últimos 90 días', 'Año actual'], req: true, list: true, c: 6, def: 'Mes actual' }),
    f('agrupar', 'Agrupar por', 'select', { o: agrupar, c: 6 }),
    f('equipo', 'Equipo', 'ref', { ref: 'equipos', c: 6 }),
    f('formato', 'Formato', 'select', { o: ['PDF', 'Excel', 'CSV'], req: true, list: true, c: 4, def: 'PDF', s: 'Distribución' }),
    f('frecuencia', 'Envío automático', 'select', { o: FRECUENCIAS, req: true, list: true, c: 4, def: 'Manual', s: 'Distribución' }),
    f('ultima', 'Última ejecución', 'date', { list: true, c: 4, s: 'Distribución' }),
    f('destinatarios', 'Destinatarios', 'text', { c: 12, s: 'Distribución', ph: 'correo@miclienteag.mx, otro@miclienteag.mx', help: 'Separa los correos con comas.', when: { frecuencia: ['Diario', 'Semanal', 'Mensual'] } })
  ];

  const ENTITIES = {
    /* ======================= 1. CATÁLOGOS ======================= */
    productos: {
      title: 'Productos y servicios', one: 'producto', g: 'm', icon: 'inventory_2', filter: 'tipo',
      desc: 'SKU, familias, categorías y unidades de medida.',
      fields: [
        f('sku', 'SKU', 'text', { req: true, uniq: true, list: true, c: 4, ph: 'AG-LIC-PRO', w: 130 }),
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'familia' }),
        f('tipo', 'Tipo', 'select', { o: ['Producto', 'Servicio', 'Suscripción'], req: true, list: true, badge: true, c: 4 }),
        f('familia', 'Familia', 'select', { o: ['Software', 'Hardware', 'Servicios profesionales', 'Soporte', 'Capacitación'], req: true, c: 4 }),
        f('categoria', 'Categoría', 'select', { o: ['Licencias', 'Implementación', 'Consultoría', 'Equipos', 'Pólizas', 'Cursos'], c: 4 }),
        f('descripcion', 'Descripción', 'textarea', { c: 12 }),
        f('unidad', 'Unidad de medida', 'select', { o: ['Pieza', 'Licencia', 'Hora', 'Servicio', 'Mes', 'Año'], req: true, list: true, c: 4, s: 'Precio y fiscal' }),
        f('precio', 'Precio base', 'money', { req: true, min: 0, list: true, c: 4, s: 'Precio y fiscal' }),
        f('costo', 'Costo', 'money', { min: 0, c: 4, s: 'Precio y fiscal' }),
        f('moneda', 'Moneda', 'ref', { ref: 'fiscal', rw: { tipo: 'Moneda' }, req: true, c: 4, s: 'Precio y fiscal', def: 'fiscal-1' }),
        f('impuesto', 'Impuesto', 'ref', { ref: 'fiscal', rw: { tipo: 'Impuesto' }, c: 4, s: 'Precio y fiscal', def: 'fiscal-4' }),
        estado(['Activo', 'Inactivo', 'Descontinuado'], { s: 'Precio y fiscal' })
      ],
      seed: [
        { sku: 'AG-LIC-PRO', nombre: 'Licencia Mi Cliente Pro (anual)', tipo: 'Suscripción', familia: 'Software', categoria: 'Licencias', unidad: 'Licencia', precio: 2000, costo: 420, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo', descripcion: 'Acceso completo a ventas y servicio por usuario.' },
        { sku: 'AG-LIC-ENT', nombre: 'Licencia Enterprise (anual)', tipo: 'Suscripción', familia: 'Software', categoria: 'Licencias', unidad: 'Licencia', precio: 3500, costo: 700, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-IMP-STD', nombre: 'Implementación estándar', tipo: 'Servicio', familia: 'Servicios profesionales', categoria: 'Implementación', unidad: 'Servicio', precio: 58000, costo: 31000, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-SOP-247', nombre: 'Soporte premium 24/7', tipo: 'Servicio', familia: 'Soporte', categoria: 'Pólizas', unidad: 'Año', precio: 23000, costo: 9800, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-CAP-USR', nombre: 'Capacitación de usuarios', tipo: 'Servicio', familia: 'Capacitación', categoria: 'Cursos', unidad: 'Servicio', precio: 12000, costo: 5200, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-HW-POS', nombre: 'Terminal punto de venta', tipo: 'Producto', familia: 'Hardware', categoria: 'Equipos', unidad: 'Pieza', precio: 8900, costo: 6100, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-CON-HR', nombre: 'Consultoría por hora', tipo: 'Servicio', familia: 'Servicios profesionales', categoria: 'Consultoría', unidad: 'Hora', precio: 1450, costo: 620, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Activo' },
        { sku: 'AG-HW-LEC', nombre: 'Lector de código de barras', tipo: 'Producto', familia: 'Hardware', categoria: 'Equipos', unidad: 'Pieza', precio: 1900, costo: 1350, moneda: 'fiscal-1', impuesto: 'fiscal-4', estado: 'Descontinuado' }
      ]
    },

    'listas-precios': {
      title: 'Listas de precios', one: 'lista de precios', g: 'f', icon: 'sell', filter: 'estado',
      desc: 'Listas de precios y condiciones comerciales por canal.',
      fields: [
        f('codigo', 'Código', 'text', { req: true, uniq: true, list: true, c: 4, w: 120, ph: 'LP-GEN-26' }),
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8 }),
        f('canal', 'Canal de venta', 'ref', { ref: 'canales', req: true, list: true, c: 6 }),
        f('moneda', 'Moneda', 'ref', { ref: 'fiscal', rw: { tipo: 'Moneda' }, req: true, c: 6, def: 'fiscal-1' }),
        f('inicio', 'Vigente desde', 'date', { req: true, list: true, c: 6, s: 'Vigencia y condiciones' }),
        f('fin', 'Vigente hasta', 'date', { after: 'inicio', c: 6, s: 'Vigencia y condiciones' }),
        f('descuento', 'Descuento general', 'percent', { min: 0, max: 100, list: true, c: 4, s: 'Vigencia y condiciones' }),
        f('plazo', 'Plazo de pago', 'select', { o: ['Contado', '15 días', '30 días', '60 días', '90 días'], req: true, c: 4, s: 'Vigencia y condiciones', def: 'Contado' }),
        estado(['Vigente', 'Borrador', 'Vencida'], { s: 'Vigencia y condiciones' }),
        f('productos', 'Productos incluidos', 'multi', { ref: 'productos', c: 12, s: 'Vigencia y condiciones' }),
        f('condiciones', 'Condiciones comerciales', 'textarea', { c: 12, s: 'Vigencia y condiciones' })
      ],
      seed: [
        { codigo: 'LP-GEN-26', nombre: 'Lista general 2026', canal: 'canales-1', moneda: 'fiscal-1', inicio: '2026-01-01', fin: '2026-12-31', descuento: 0, plazo: '30 días', estado: 'Vigente', productos: ['productos-1', 'productos-2', 'productos-3', 'productos-4', 'productos-5', 'productos-7'] },
        { codigo: 'LP-DIS-T1', nombre: 'Distribuidores Tier 1', canal: 'canales-2', moneda: 'fiscal-1', inicio: '2026-01-01', fin: '2026-12-31', descuento: 18, plazo: '60 días', estado: 'Vigente', productos: ['productos-1', 'productos-2', 'productos-6'], condiciones: 'Compra mínima trimestral de $250,000 MXN.' },
        { codigo: 'LP-ECO-26', nombre: 'Tienda en línea', canal: 'canales-3', moneda: 'fiscal-1', inicio: '2026-03-01', fin: '2026-12-31', descuento: 5, plazo: 'Contado', estado: 'Vigente', productos: ['productos-1', 'productos-6'] },
        { codigo: 'LP-GOB-26', nombre: 'Gobierno y licitaciones', canal: 'canales-1', moneda: 'fiscal-1', inicio: '2026-10-01', fin: '2027-09-30', descuento: 12, plazo: '90 días', estado: 'Borrador' },
        { codigo: 'LP-GEN-25', nombre: 'Lista general 2025', canal: 'canales-1', moneda: 'fiscal-1', inicio: '2025-01-01', fin: '2025-12-31', descuento: 0, plazo: '30 días', estado: 'Vencida' }
      ]
    },

    territorios: {
      title: 'Territorios, zonas y rutas', one: 'territorio', g: 'm', icon: 'map', filter: 'tipo',
      desc: 'Cobertura geográfica para asignar cuentas y planear visitas.',
      fields: [
        f('codigo', 'Código', 'text', { req: true, uniq: true, list: true, c: 4, w: 110, ph: 'TER-NTE' }),
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'region' }),
        f('tipo', 'Tipo', 'select', { o: ['Territorio', 'Zona', 'Ruta'], req: true, list: true, badge: true, c: 4 }),
        f('region', 'Región', 'select', { o: ['Norte', 'Centro', 'Occidente', 'Bajío', 'Sureste'], req: true, c: 4 }),
        f('padre', 'Pertenece a', 'ref', { ref: 'territorios', c: 4, help: 'Zona o territorio superior.' }),
        f('entidades', 'Entidades federativas', 'text', { c: 12, ph: 'Nuevo León, Coahuila, Tamaulipas' }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', list: true, c: 6, s: 'Asignación' }),
        f('equipo', 'Equipo', 'ref', { ref: 'equipos', c: 6, s: 'Asignación' }),
        f('frecuencia', 'Frecuencia de visita', 'select', { o: ['Semanal', 'Quincenal', 'Mensual'], c: 4, s: 'Asignación', when: { tipo: ['Ruta'] } }),
        f('objetivo', 'Cuentas objetivo', 'number', { min: 0, list: true, c: 4, s: 'Asignación' }),
        estado(null, { s: 'Asignación' })
      ],
      seed: [
        { codigo: 'TER-NTE', nombre: 'Norte', tipo: 'Territorio', region: 'Norte', entidades: 'Nuevo León, Coahuila, Tamaulipas, Chihuahua', responsable: 'usuarios-2', equipo: 'equipos-2', objetivo: 60, estado: 'Activo' },
        { codigo: 'TER-CEN', nombre: 'Centro', tipo: 'Territorio', region: 'Centro', entidades: 'CDMX, Estado de México, Puebla, Hidalgo', responsable: 'usuarios-4', equipo: 'equipos-3', objetivo: 85, estado: 'Activo' },
        { codigo: 'TER-OCC', nombre: 'Occidente', tipo: 'Territorio', region: 'Occidente', entidades: 'Jalisco, Colima, Nayarit', responsable: 'usuarios-4', equipo: 'equipos-3', objetivo: 40, estado: 'Activo' },
        { codigo: 'ZON-MTY', nombre: 'Zona metropolitana Monterrey', tipo: 'Zona', region: 'Norte', padre: 'territorios-1', entidades: 'Nuevo León', responsable: 'usuarios-2', equipo: 'equipos-2', objetivo: 35, estado: 'Activo' },
        { codigo: 'RUT-BAJ', nombre: 'Ruta Bajío industrial', tipo: 'Ruta', region: 'Bajío', padre: 'territorios-2', entidades: 'Querétaro, Guanajuato, Aguascalientes', responsable: 'usuarios-6', equipo: 'equipos-3', frecuencia: 'Quincenal', objetivo: 22, estado: 'Activo' },
        { codigo: 'TER-SUR', nombre: 'Sureste', tipo: 'Territorio', region: 'Sureste', entidades: 'Yucatán, Quintana Roo, Tabasco', objetivo: 18, estado: 'Inactivo' }
      ]
    },

    canales: {
      title: 'Canales de venta', one: 'canal de venta', g: 'm', icon: 'alt_route', filter: 'tipo',
      desc: 'Directo, distribuidor, ecommerce y otros canales comerciales.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8 }),
        f('tipo', 'Tipo', 'select', { o: ['Directo', 'Distribuidor', 'Ecommerce', 'Marketplace', 'Telemarketing'], req: true, list: true, badge: true, c: 4 }),
        f('comision', 'Comisión', 'percent', { min: 0, max: 100, list: true, c: 4 }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', list: true, c: 4 }),
        f('lista', 'Lista de precios', 'ref', { ref: 'listas-precios', list: true, c: 4 }),
        f('descripcion', 'Descripción', 'textarea', { c: 12 }),
        estado()
      ],
      seed: [
        { nombre: 'Venta directa', tipo: 'Directo', comision: 6, responsable: 'usuarios-1', lista: 'listas-precios-1', estado: 'Activo', descripcion: 'Ejecutivos de cuenta con visita presencial o remota.' },
        { nombre: 'Red de distribuidores', tipo: 'Distribuidor', comision: 12, responsable: 'usuarios-4', lista: 'listas-precios-2', estado: 'Activo' },
        { nombre: 'Tienda en línea', tipo: 'Ecommerce', comision: 0, responsable: 'usuarios-7', lista: 'listas-precios-3', estado: 'Activo' },
        { nombre: 'Marketplace', tipo: 'Marketplace', comision: 15, responsable: 'usuarios-7', lista: 'listas-precios-3', estado: 'Inactivo' },
        { nombre: 'Televentas', tipo: 'Telemarketing', comision: 4, responsable: 'usuarios-2', lista: 'listas-precios-1', estado: 'Activo' }
      ]
    },

    segmentos: {
      title: 'Segmentos de clientes', one: 'segmento', g: 'm', icon: 'category', filter: 'criterio',
      desc: 'Clasificación de clientes (no el registro del cliente).',
      fields: [
        f('codigo', 'Código', 'text', { req: true, uniq: true, list: true, c: 4, w: 110 }),
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8 }),
        f('criterio', 'Criterio', 'select', { o: ['Tamaño', 'Industria', 'Valor', 'Región'], req: true, list: true, badge: true, c: 4 }),
        f('minimo', 'Facturación anual desde', 'money', { min: 0, list: true, c: 4 }),
        f('maximo', 'Facturación anual hasta', 'money', { min: 0, c: 4 }),
        f('prioridad', 'Prioridad comercial', 'select', { o: ['Alta', 'Media', 'Baja'], badge: true, list: true, c: 6, def: 'Media' }),
        estado(null, { c: 6 }),
        f('descripcion', 'Descripción', 'textarea', { c: 12 })
      ],
      seed: [
        { codigo: 'SEG-ENT', nombre: 'Enterprise', criterio: 'Tamaño', minimo: 500000000, prioridad: 'Alta', estado: 'Activo', descripcion: 'Más de 1,000 empleados o facturación superior a $500 M.' },
        { codigo: 'SEG-COR', nombre: 'Corporativo', criterio: 'Tamaño', minimo: 100000000, maximo: 500000000, prioridad: 'Alta', estado: 'Activo' },
        { codigo: 'SEG-PYM', nombre: 'PyME', criterio: 'Tamaño', minimo: 4000000, maximo: 100000000, prioridad: 'Media', estado: 'Activo' },
        { codigo: 'SEG-GOB', nombre: 'Gobierno', criterio: 'Industria', prioridad: 'Media', estado: 'Activo' },
        { codigo: 'SEG-EDU', nombre: 'Educación', criterio: 'Industria', prioridad: 'Baja', estado: 'Activo' },
        { codigo: 'SEG-SAL', nombre: 'Salud', criterio: 'Industria', prioridad: 'Media', estado: 'Activo' }
      ]
    },

    etapas: {
      title: 'Etapas de pipeline', one: 'etapa', g: 'f', icon: 'view_kanban', filter: 'tipo',
      desc: 'Etapas configurables del embudo comercial y su probabilidad.',
      fields: [
        f('orden', 'Orden', 'number', { req: true, min: 1, list: true, c: 3, w: 90 }),
        f('nombre', 'Nombre', 'text', { req: true, uniq: true, main: true, list: true, c: 9 }),
        f('probabilidad', 'Probabilidad de cierre', 'percent', { req: true, min: 0, max: 100, list: true, c: 4 }),
        f('tipo', 'Tipo', 'select', { o: ['Abierta', 'Ganada', 'Perdida'], req: true, list: true, badge: true, c: 4, def: 'Abierta' }),
        f('dias', 'Días máximos en etapa', 'number', { min: 0, list: true, c: 4, help: 'Después de esto la oportunidad se marca como estancada.' }),
        f('criterios', 'Criterios de salida', 'textarea', { c: 12, ph: 'Qué debe cumplirse para avanzar a la siguiente etapa…' }),
        estado(null, { c: 4 })
      ],
      seed: [
        { orden: 1, nombre: 'Prospección', probabilidad: 10, tipo: 'Abierta', dias: 15, estado: 'Activo', criterios: 'Contacto identificado y primera reunión agendada.' },
        { orden: 2, nombre: 'Calificación', probabilidad: 25, tipo: 'Abierta', dias: 20, estado: 'Activo', criterios: 'Presupuesto, autoridad, necesidad y tiempo (BANT) confirmados.' },
        { orden: 3, nombre: 'Propuesta', probabilidad: 50, tipo: 'Abierta', dias: 20, estado: 'Activo', criterios: 'Cotización enviada y revisada con el decisor.' },
        { orden: 4, nombre: 'Negociación', probabilidad: 75, tipo: 'Abierta', dias: 30, estado: 'Activo', criterios: 'Condiciones comerciales acordadas; en revisión legal.' },
        { orden: 5, nombre: 'Ganada', probabilidad: 100, tipo: 'Ganada', estado: 'Activo' },
        { orden: 6, nombre: 'Perdida', probabilidad: 0, tipo: 'Perdida', estado: 'Activo' }
      ]
    },

    motivos: {
      title: 'Motivos', one: 'motivo', g: 'm', icon: 'rule', filter: 'aplica',
      desc: 'Motivos de pérdida, cancelación y cierre de ticket.',
      fields: [
        f('codigo', 'Código', 'text', { req: true, uniq: true, list: true, c: 4, w: 110 }),
        f('nombre', 'Motivo', 'text', { req: true, main: true, list: true, c: 8 }),
        f('aplica', 'Aplica a', 'select', { o: ['Pérdida de oportunidad', 'Cancelación de pedido', 'Cierre de ticket'], req: true, list: true, c: 6 }),
        f('comentario', 'Requiere comentario', 'switch', { list: true, c: 6 }),
        f('descripcion', 'Descripción', 'textarea', { c: 12 }),
        estado(null, { c: 6 })
      ],
      seed: [
        { codigo: 'PER-PRE', nombre: 'Precio fuera de presupuesto', aplica: 'Pérdida de oportunidad', comentario: true, estado: 'Activo' },
        { codigo: 'PER-COM', nombre: 'Eligió a un competidor', aplica: 'Pérdida de oportunidad', comentario: true, estado: 'Activo' },
        { codigo: 'PER-POS', nombre: 'Proyecto pospuesto', aplica: 'Pérdida de oportunidad', comentario: false, estado: 'Activo' },
        { codigo: 'CAN-ERR', nombre: 'Error en captura del pedido', aplica: 'Cancelación de pedido', comentario: true, estado: 'Activo' },
        { codigo: 'CAN-CLI', nombre: 'El cliente canceló la compra', aplica: 'Cancelación de pedido', comentario: true, estado: 'Activo' },
        { codigo: 'TKT-RES', nombre: 'Resuelto por soporte', aplica: 'Cierre de ticket', comentario: false, estado: 'Activo' },
        { codigo: 'TKT-SRE', nombre: 'Sin respuesta del cliente', aplica: 'Cierre de ticket', comentario: false, estado: 'Activo' }
      ]
    },

    'tipos-servicio': {
      title: 'Tipos de servicio y SLA', one: 'tipo de servicio', g: 'm', icon: 'timer', filter: 'nivel',
      desc: 'Niveles de servicio y tiempos comprometidos.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8 }),
        f('nivel', 'Nivel de SLA', 'select', { o: ['Básico', 'Estándar', 'Premium', 'Crítico'], req: true, list: true, badge: true, c: 4 }),
        f('respuesta', 'Primera respuesta (h)', 'number', { req: true, min: 0, list: true, c: 4, step: 'any' }),
        f('resolucion', 'Resolución (h)', 'number', { req: true, min: 0, list: true, c: 4, step: 'any' }),
        f('escalamiento', 'Escalar después de (h)', 'number', { min: 0, c: 4, step: 'any' }),
        f('horario', 'Horario de atención', 'select', { o: ['8×5 hábil', '12×6', '24×7'], req: true, list: true, c: 6 }),
        estado(null, { c: 6 }),
        f('descripcion', 'Alcance del servicio', 'textarea', { c: 12 })
      ],
      seed: [
        { nombre: 'Soporte básico', nivel: 'Básico', respuesta: 8, resolucion: 72, escalamiento: 48, horario: '8×5 hábil', estado: 'Activo' },
        { nombre: 'Soporte estándar', nivel: 'Estándar', respuesta: 4, resolucion: 24, escalamiento: 12, horario: '12×6', estado: 'Activo' },
        { nombre: 'Soporte premium', nivel: 'Premium', respuesta: 1, resolucion: 8, escalamiento: 4, horario: '24×7', estado: 'Activo' },
        { nombre: 'Incidente crítico', nivel: 'Crítico', respuesta: 0.5, resolucion: 4, escalamiento: 1, horario: '24×7', estado: 'Activo', descripcion: 'Caída total del servicio o pérdida de datos.' },
        { nombre: 'Visita técnica en sitio', nivel: 'Estándar', respuesta: 8, resolucion: 48, horario: '8×5 hábil', estado: 'Activo' }
      ]
    },

    fiscal: {
      title: 'Monedas, impuestos y formas de pago', one: 'registro fiscal', g: 'm', icon: 'account_balance', filter: 'tipo',
      desc: 'Monedas, tasas de impuesto y formas de pago del SAT.',
      fields: [
        f('tipo', 'Tipo', 'select', { o: ['Moneda', 'Impuesto', 'Forma de pago'], req: true, list: true, badge: true, c: 4 }),
        f('clave', 'Clave', 'text', { req: true, uniq: true, list: true, c: 4, w: 110, ph: 'MXN' }),
        f('sat', 'Clave SAT', 'text', { list: true, c: 4, w: 110 }),
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8 }),
        f('valor', 'Tipo de cambio / tasa', 'number', { step: 'any', min: 0, list: true, c: 4, help: 'Moneda: tipo de cambio a MXN. Impuesto: tasa en %.', when: { tipo: ['Moneda', 'Impuesto'] } }),
        f('predeterminado', 'Predeterminado', 'switch', { list: true, c: 6 }),
        estado(null, { c: 6 })
      ],
      seed: [
        { tipo: 'Moneda', clave: 'MXN', sat: 'MXN', nombre: 'Peso mexicano', valor: 1, predeterminado: true, estado: 'Activo' },
        { tipo: 'Moneda', clave: 'USD', sat: 'USD', nombre: 'Dólar estadounidense', valor: 17.2, predeterminado: false, estado: 'Activo' },
        { tipo: 'Moneda', clave: 'EUR', sat: 'EUR', nombre: 'Euro', valor: 19.1, predeterminado: false, estado: 'Activo' },
        { tipo: 'Impuesto', clave: 'IVA16', sat: '002', nombre: 'IVA 16%', valor: 16, predeterminado: true, estado: 'Activo' },
        { tipo: 'Impuesto', clave: 'IVA8', sat: '002', nombre: 'IVA 8% (región fronteriza)', valor: 8, predeterminado: false, estado: 'Activo' },
        { tipo: 'Forma de pago', clave: 'TRANSF', sat: '03', nombre: 'Transferencia electrónica', predeterminado: true, estado: 'Activo' },
        { tipo: 'Forma de pago', clave: 'TDC', sat: '04', nombre: 'Tarjeta de crédito', predeterminado: false, estado: 'Activo' },
        { tipo: 'Forma de pago', clave: 'EFE', sat: '01', nombre: 'Efectivo', predeterminado: false, estado: 'Activo' },
        { tipo: 'Forma de pago', clave: 'PPD', sat: '99', nombre: 'Por definir', predeterminado: false, estado: 'Activo' }
      ]
    },

    competidores: {
      title: 'Competidores', one: 'competidor', g: 'm', icon: 'swords', filter: 'amenaza',
      desc: 'Competencia registrada para analizar oportunidades perdidas.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'precio' }),
        f('amenaza', 'Nivel de amenaza', 'select', { o: ['Alta', 'Media', 'Baja'], req: true, list: true, badge: true, c: 4, def: 'Media' }),
        f('sitio', 'Sitio web', 'url', { c: 6, ph: 'https://' }),
        f('segmento', 'Segmento donde compite', 'ref', { ref: 'segmentos', list: true, c: 6 }),
        f('precio', 'Precio relativo', 'select', { o: ['Más barato', 'Similar', 'Más caro'], list: true, c: 6 }),
        f('perdidas', 'Oportunidades perdidas', 'number', { min: 0, list: true, c: 6 }),
        f('fortalezas', 'Fortalezas', 'textarea', { c: 6, s: 'Análisis' }),
        f('debilidades', 'Debilidades', 'textarea', { c: 6, s: 'Análisis' })
      ],
      seed: [
        { nombre: 'Nexo CRM', amenaza: 'Alta', sitio: 'https://nexocrm.example', segmento: 'segmentos-1', precio: 'Más caro', perdidas: 4, fortalezas: 'Marca reconocida, ecosistema de integraciones.', debilidades: 'Implementación larga, soporte en inglés.' },
        { nombre: 'VentaPlus', amenaza: 'Alta', segmento: 'segmentos-3', precio: 'Más barato', perdidas: 6, fortalezas: 'Precio agresivo para PyME.', debilidades: 'Sin módulo de servicio.' },
        { nombre: 'Orbis Software', amenaza: 'Media', segmento: 'segmentos-2', precio: 'Similar', perdidas: 2 },
        { nombre: 'Clientia', amenaza: 'Baja', segmento: 'segmentos-5', precio: 'Más barato', perdidas: 1 },
        { nombre: 'Mercurio Sistemas', amenaza: 'Media', segmento: 'segmentos-4', precio: 'Similar', perdidas: 3 }
      ]
    },

    equipos: {
      title: 'Equipos comerciales', one: 'equipo', g: 'm', icon: 'groups', filter: 'tipo',
      desc: 'Equipos y jerarquías para asignación y reporting.',
      fields: [
        f('nombre', 'Nombre del equipo', 'text', { req: true, main: true, list: true, c: 8 }),
        f('tipo', 'Tipo', 'select', { o: ['Ventas', 'Preventa', 'Servicio', 'Marketing'], req: true, list: true, badge: true, c: 4 }),
        f('lider', 'Líder', 'ref', { ref: 'usuarios', req: true, list: true, c: 6 }),
        f('superior', 'Reporta a', 'ref', { ref: 'equipos', c: 6, help: 'Equipo superior en la jerarquía.' }),
        f('territorio', 'Territorio', 'ref', { ref: 'territorios', c: 6 }),
        f('cuota', 'Cuota mensual', 'money', { min: 0, list: true, c: 6 }),
        f('miembros', 'Miembros', 'multi', { ref: 'usuarios', c: 12 }),
        estado(null, { c: 6 })
      ],
      seed: [
        { nombre: 'Dirección comercial', tipo: 'Ventas', lider: 'usuarios-1', territorio: '', cuota: 2400000, miembros: ['usuarios-1', 'usuarios-2', 'usuarios-4'], estado: 'Activo' },
        { nombre: 'Ventas Norte', tipo: 'Ventas', lider: 'usuarios-2', superior: 'equipos-1', territorio: 'territorios-1', cuota: 900000, miembros: ['usuarios-2'], estado: 'Activo' },
        { nombre: 'Ventas Centro y Occidente', tipo: 'Ventas', lider: 'usuarios-4', superior: 'equipos-1', territorio: 'territorios-2', cuota: 1100000, miembros: ['usuarios-4', 'usuarios-6'], estado: 'Activo' },
        { nombre: 'Mesa de ayuda', tipo: 'Servicio', lider: 'usuarios-5', miembros: ['usuarios-3', 'usuarios-5', 'usuarios-6'], estado: 'Activo' },
        { nombre: 'Marketing digital', tipo: 'Marketing', lider: 'usuarios-7', miembros: ['usuarios-7'], estado: 'Activo' }
      ]
    },

    /* ======================= 2. VENTAS ======================= */
    clientes: {
      title: 'Clientes y cuentas', one: 'cliente', g: 'm', icon: 'apartment', filter: 'tipo',
      desc: 'Ficha 360° de cada cuenta, su jerarquía y cuentas relacionadas.',
      fields: [
        f('nombre', 'Nombre comercial', 'text', { req: true, main: true, list: true, c: 6, sub: 'segmento' }),
        f('razon', 'Razón social', 'text', { req: true, c: 6 }),
        f('rfc', 'RFC', 'text', { req: true, uniq: true, list: true, c: 4, w: 150, pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$', patternMsg: 'RFC inválido: 3–4 letras, 6 dígitos de fecha y 3 de homoclave.', upper: true }),
        f('tipo', 'Tipo de cuenta', 'select', { o: ['Prospecto', 'Cliente', 'Ex-cliente'], req: true, list: true, badge: true, c: 4, def: 'Prospecto' }),
        f('segmento', 'Segmento', 'ref', { ref: 'segmentos', req: true, c: 4 }),
        f('industria', 'Industria', 'select', { o: INDUSTRIAS, c: 4 }),
        f('padre', 'Cuenta corporativa (matriz)', 'ref', { ref: 'clientes', c: 8, help: 'Déjalo vacío si es la cuenta principal.' }),
        f('correo', 'Correo', 'email', { c: 4, s: 'Contacto' }),
        f('telefono', 'Teléfono', 'tel', { c: 4, s: 'Contacto' }),
        f('sitio', 'Sitio web', 'url', { c: 4, s: 'Contacto' }),
        f('ciudad', 'Ciudad', 'text', { c: 4, s: 'Contacto' }),
        f('estado_mx', 'Estado', 'text', { c: 4, s: 'Contacto' }),
        f('cp', 'Código postal', 'text', { c: 4, s: 'Contacto', pattern: '^\\d{5}$', patternMsg: 'El código postal tiene 5 dígitos.' }),
        f('ejecutivo', 'Ejecutivo de cuenta', 'ref', { ref: 'usuarios', list: true, c: 4, s: 'Condiciones comerciales' }),
        f('territorio', 'Territorio', 'ref', { ref: 'territorios', list: true, c: 4, s: 'Condiciones comerciales' }),
        f('canal', 'Canal', 'ref', { ref: 'canales', c: 4, s: 'Condiciones comerciales' }),
        f('lista', 'Lista de precios', 'ref', { ref: 'listas-precios', c: 6, s: 'Condiciones comerciales' }),
        f('credito', 'Límite de crédito', 'money', { min: 0, c: 6, s: 'Condiciones comerciales' })
      ],
      seed: [
        { nombre: 'Grupo Lerma', razon: 'Grupo Lerma S.A. de C.V.', rfc: 'GLE980312AB1', tipo: 'Cliente', segmento: 'segmentos-1', industria: 'Manufactura', correo: 'compras@grupolerma.example', telefono: '8181234500', ciudad: 'Monterrey', estado_mx: 'Nuevo León', cp: '64000', ejecutivo: 'usuarios-2', territorio: 'territorios-1', canal: 'canales-1', lista: 'listas-precios-1', credito: 500000 },
        { nombre: 'Retail Nova', razon: 'Retail Nova S.A.P.I. de C.V.', rfc: 'RNO150820KL3', tipo: 'Cliente', segmento: 'segmentos-2', industria: 'Retail', ciudad: 'Ciudad de México', estado_mx: 'CDMX', cp: '11560', ejecutivo: 'usuarios-4', territorio: 'territorios-2', canal: 'canales-1', lista: 'listas-precios-1', credito: 250000 },
        { nombre: 'Clínica Dorel', razon: 'Servicios Médicos Dorel S.C.', rfc: 'SMD100505QW2', tipo: 'Cliente', segmento: 'segmentos-6', industria: 'Salud', ciudad: 'Puebla', estado_mx: 'Puebla', cp: '72000', ejecutivo: 'usuarios-4', territorio: 'territorios-2', canal: 'canales-5', credito: 80000 },
        { nombre: 'Industrias Vega', razon: 'Industrias Vega S.A. de C.V.', rfc: 'IVE890715TR9', tipo: 'Cliente', segmento: 'segmentos-1', industria: 'Manufactura', ciudad: 'Querétaro', estado_mx: 'Querétaro', cp: '76000', ejecutivo: 'usuarios-2', territorio: 'territorios-5', canal: 'canales-1', lista: 'listas-precios-1', credito: 650000 },
        { nombre: 'Hotel Marea', razon: 'Operadora Hotelera Marea S.A. de C.V.', rfc: 'OHM120101MN4', tipo: 'Prospecto', segmento: 'segmentos-3', industria: 'Hotelería', ciudad: 'Cancún', estado_mx: 'Quintana Roo', cp: '77500', ejecutivo: 'usuarios-4', territorio: 'territorios-6' },
        { nombre: 'Farmacias Luz', razon: 'Farmacias Luz del Centro S.A. de C.V.', rfc: 'FLC070930PL8', tipo: 'Cliente', segmento: 'segmentos-2', industria: 'Retail', ciudad: 'Guadalajara', estado_mx: 'Jalisco', cp: '44100', ejecutivo: 'usuarios-4', territorio: 'territorios-3', canal: 'canales-2', lista: 'listas-precios-2', credito: 300000 },
        { nombre: 'Transportes Río', razon: 'Transportes Río Bravo S.A. de C.V.', rfc: 'TRB950228HJ6', tipo: 'Cliente', segmento: 'segmentos-3', industria: 'Logística', ciudad: 'Saltillo', estado_mx: 'Coahuila', cp: '25000', ejecutivo: 'usuarios-2', territorio: 'territorios-1', credito: 120000 },
        { nombre: 'Colegio Aurora', razon: 'Colegio Aurora A.C.', rfc: 'CAU031115ZX5', tipo: 'Prospecto', segmento: 'segmentos-5', industria: 'Educación', ciudad: 'Toluca', estado_mx: 'Estado de México', cp: '50000', ejecutivo: 'usuarios-4', territorio: 'territorios-2' },
        { nombre: 'Textiles Ancla', razon: 'Textiles Ancla S.A. de C.V.', rfc: 'TAN880404BV7', tipo: 'Ex-cliente', segmento: 'segmentos-2', industria: 'Textil', ciudad: 'León', estado_mx: 'Guanajuato', cp: '37000', ejecutivo: 'usuarios-2', territorio: 'territorios-5' },
        { nombre: 'Lerma Logística', razon: 'Lerma Logística S.A. de C.V.', rfc: 'LLO160610CD2', tipo: 'Cliente', segmento: 'segmentos-2', industria: 'Logística', padre: 'clientes-1', ciudad: 'Apodaca', estado_mx: 'Nuevo León', cp: '66600', ejecutivo: 'usuarios-2', territorio: 'territorios-4', credito: 150000 }
      ]
    },

    contactos: {
      title: 'Contactos', one: 'contacto', g: 'm', icon: 'contacts', filter: 'rol',
      desc: 'Personas de cada cuenta: rol en la compra, cargo y preferencias.',
      fields: [
        f('nombre', 'Nombre completo', 'text', { req: true, main: true, list: true, c: 6, sub: 'cargo' }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, list: true, c: 6 }),
        f('cargo', 'Cargo', 'text', { req: true, c: 6 }),
        f('rol', 'Rol en la compra', 'select', { o: ['Decisor', 'Influenciador', 'Usuario', 'Técnico', 'Compras'], req: true, list: true, badge: true, c: 6 }),
        f('correo', 'Correo', 'email', { req: true, uniq: true, list: true, c: 6, s: 'Datos de contacto' }),
        f('telefono', 'Teléfono', 'tel', { c: 3, s: 'Datos de contacto' }),
        f('movil', 'Móvil', 'tel', { list: true, c: 3, s: 'Datos de contacto' }),
        f('canal', 'Canal preferido', 'select', { o: ['Correo', 'Teléfono', 'WhatsApp', 'Presencial'], c: 6, s: 'Preferencias', def: 'Correo' }),
        f('marketing', 'Acepta comunicaciones de marketing', 'switch', { c: 6, s: 'Preferencias' }),
        f('notas', 'Notas', 'textarea', { c: 12, s: 'Preferencias' })
      ],
      seed: [
        { nombre: 'Ana Lerma', cliente: 'clientes-1', cargo: 'Coordinadora de operaciones', rol: 'Usuario', correo: 'ana.lerma@grupolerma.example', movil: '8112345678', canal: 'WhatsApp', marketing: true },
        { nombre: 'Roberto Lerma', cliente: 'clientes-1', cargo: 'Director general', rol: 'Decisor', correo: 'roberto@grupolerma.example', movil: '8119876543', canal: 'Presencial', marketing: false },
        { nombre: 'Mónica Vega', cliente: 'clientes-4', cargo: 'Gerente de TI', rol: 'Técnico', correo: 'mvega@industriasvega.example', movil: '4421234567', canal: 'Correo', marketing: true },
        { nombre: 'Jorge Nava', cliente: 'clientes-2', cargo: 'Director de compras', rol: 'Compras', correo: 'jnava@retailnova.example', movil: '5511223344', canal: 'Correo', marketing: true },
        { nombre: 'Lucía Dorel', cliente: 'clientes-3', cargo: 'Directora administrativa', rol: 'Decisor', correo: 'lucia@clinicadorel.example', movil: '2221234567', canal: 'Teléfono', marketing: false },
        { nombre: 'Esteban Marea', cliente: 'clientes-5', cargo: 'Gerente general', rol: 'Decisor', correo: 'esteban@hotelmarea.example', movil: '9981234567', canal: 'WhatsApp', marketing: true },
        { nombre: 'Fernanda Luz', cliente: 'clientes-6', cargo: 'Jefa de sistemas', rol: 'Influenciador', correo: 'fluz@farmaciasluz.example', movil: '3312345678', canal: 'Correo', marketing: true },
        { nombre: 'Ricardo Ríos', cliente: 'clientes-7', cargo: 'Gerente de flota', rol: 'Usuario', correo: 'rrios@transportesrio.example', movil: '8441234567', canal: 'Teléfono', marketing: false }
      ]
    },

    leads: {
      title: 'Leads', one: 'lead', g: 'm', icon: 'person_add', filter: 'estado',
      desc: 'Calificación de prospectos y conversión a cuenta y oportunidad.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 6, sub: 'empresa' }),
        f('empresa', 'Empresa', 'text', { req: true, c: 6 }),
        f('correo', 'Correo', 'email', { req: true, list: true, c: 6 }),
        f('telefono', 'Teléfono', 'tel', { c: 6 }),
        f('origen', 'Origen', 'select', { o: ['Sitio web', 'Referido', 'Campaña', 'Evento', 'Llamada entrante'], req: true, c: 6, s: 'Calificación' }),
        f('campana', 'Campaña', 'ref', { ref: 'campanas', c: 6, s: 'Calificación', when: { origen: ['Campaña', 'Evento'] } }),
        f('puntuacion', 'Puntuación (0–100)', 'number', { min: 0, max: 100, list: true, c: 4, s: 'Calificación', w: 120 }),
        f('presupuesto', 'Presupuesto estimado', 'money', { min: 0, c: 4, s: 'Calificación' }),
        estado(['Nuevo', 'Contactado', 'Calificado', 'Descalificado', 'Convertido'], { s: 'Calificación' }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', list: true, c: 6, s: 'Calificación' }),
        f('necesidad', 'Necesidad detectada', 'textarea', { c: 12, s: 'Calificación' })
      ],
      seed: [
        { nombre: 'Mariana Ortiz', empresa: 'Distribuidora Ortiz', correo: 'mariana@dortiz.example', origen: 'Sitio web', puntuacion: 72, presupuesto: 60000, estado: 'Nuevo', responsable: 'usuarios-2', necesidad: 'Solicitó una demo del plan Pro.' },
        { nombre: 'Héctor Salinas', empresa: 'Constructora Salinas', correo: 'hsalinas@csalinas.example', origen: 'Referido', puntuacion: 64, presupuesto: 120000, estado: 'Contactado', responsable: 'usuarios-4' },
        { nombre: 'Gabriela Mora', empresa: 'Laboratorios Mora', correo: 'gmora@labmora.example', origen: 'Campaña', campana: 'campanas-1', puntuacion: 81, presupuesto: 180000, estado: 'Calificado', responsable: 'usuarios-2' },
        { nombre: 'Iván Cárdenas', empresa: 'Autopartes del Golfo', correo: 'ivan@apgolfo.example', origen: 'Evento', campana: 'campanas-3', puntuacion: 45, estado: 'Nuevo', responsable: 'usuarios-4' },
        { nombre: 'Patricia León', empresa: 'Hoteles Coral', correo: 'pleon@coral.example', origen: 'Llamada entrante', puntuacion: 22, estado: 'Descalificado', responsable: 'usuarios-4', necesidad: 'Buscaba sólo un sistema de reservas.' },
        { nombre: 'Omar Treviño', empresa: 'Lerma Logística', correo: 'otrevino@lermalog.example', origen: 'Referido', puntuacion: 90, presupuesto: 150000, estado: 'Convertido', responsable: 'usuarios-2' },
        { nombre: 'Daniela Fuentes', empresa: 'Escuela Bilingüe Sol', correo: 'dfuentes@ebsol.example', origen: 'Campaña', campana: 'campanas-4', puntuacion: 58, estado: 'Nuevo', responsable: 'usuarios-4' }
      ]
    },

    oportunidades: {
      title: 'Oportunidades', one: 'oportunidad', g: 'f', icon: 'handshake', filter: 'etapa', sum: 'monto',
      code: { k: 'folio', p: 'OPP-', n: 1051 },
      desc: 'Pipeline con probabilidad, valor y fecha estimada de cierre.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, c: 4, w: 110 }),
        f('nombre', 'Nombre de la oportunidad', 'text', { req: true, main: true, list: true, c: 8, sub: 'cliente', ph: 'Ej. Implementación ERP — Grupo Lerma' }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('contacto', 'Contacto principal', 'ref', { ref: 'contactos', c: 6 }),
        f('etapa', 'Etapa', 'ref', { ref: 'etapas', req: true, list: true, c: 4, s: 'Pronóstico', def: 'etapas-1' }),
        f('monto', 'Valor estimado', 'money', { req: true, min: 0, list: true, c: 4, s: 'Pronóstico' }),
        f('probabilidad', 'Probabilidad', 'percent', { ro: true, c: 4, s: 'Pronóstico', help: 'Se toma de la etapa.', calc: (r, S) => { const e = S.get('etapas', r.etapa); return e ? num(e.probabilidad) : 0; } }),
        f('cierre', 'Cierre estimado', 'date', { req: true, list: true, c: 4, s: 'Pronóstico' }),
        f('categoria', 'Categoría de forecast', 'select', { o: ['Pipeline', 'Mejor caso', 'Compromiso', 'Omitido'], req: true, c: 4, s: 'Pronóstico', def: 'Pipeline' }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', req: true, list: true, c: 4, s: 'Pronóstico' }),
        f('origen', 'Origen', 'select', { o: ['Sitio web', 'Referido', 'Campaña', 'Partner', 'Cuenta existente'], c: 4, s: 'Contexto' }),
        f('competidor', 'Competidor', 'ref', { ref: 'competidores', c: 4, s: 'Contexto' }),
        f('motivo', 'Motivo de pérdida', 'ref', { ref: 'motivos', rw: { aplica: 'Pérdida de oportunidad' }, req: true, c: 4, s: 'Contexto', when: { etapa: ['etapas-6'] } }),
        f('notas', 'Notas', 'textarea', { c: 12, s: 'Contexto' })
      ],
      seed: [
        { folio: 'OPP-1051', nombre: 'Implementación ERP — Grupo Lerma', cliente: 'clientes-1', contacto: 'contactos-2', etapa: 'etapas-5', monto: 182400, cierre: '2026-09-22', categoria: 'Compromiso', responsable: 'usuarios-2', origen: 'Cuenta existente' },
        { folio: 'OPP-1052', nombre: 'Licencias Enterprise — Industrias Vega', cliente: 'clientes-4', contacto: 'contactos-3', etapa: 'etapas-4', monto: 145000, cierre: '2026-10-10', categoria: 'Compromiso', responsable: 'usuarios-2', origen: 'Referido', competidor: 'competidores-1' },
        { folio: 'OPP-1053', nombre: 'Integración pasarela de pago — Retail Nova', cliente: 'clientes-2', contacto: 'contactos-4', etapa: 'etapas-3', monto: 96000, cierre: '2026-10-28', categoria: 'Mejor caso', responsable: 'usuarios-4', origen: 'Cuenta existente' },
        { folio: 'OPP-1054', nombre: 'Renovación de soporte — Farmacias Luz', cliente: 'clientes-6', contacto: 'contactos-7', etapa: 'etapas-2', monto: 54000, cierre: '2026-11-05', categoria: 'Pipeline', responsable: 'usuarios-4', origen: 'Cuenta existente' },
        { folio: 'OPP-1055', nombre: 'Terminales POS — Hotel Marea', cliente: 'clientes-5', contacto: 'contactos-6', etapa: 'etapas-1', monto: 35600, cierre: '2026-12-01', categoria: 'Pipeline', responsable: 'usuarios-4', origen: 'Sitio web' },
        { folio: 'OPP-1056', nombre: 'Plataforma escolar — Colegio Aurora', cliente: 'clientes-8', etapa: 'etapas-3', monto: 72000, cierre: '2026-11-15', categoria: 'Mejor caso', responsable: 'usuarios-4', origen: 'Campaña', competidor: 'competidores-4' },
        { folio: 'OPP-1057', nombre: 'CRM de distribución — Textiles Ancla', cliente: 'clientes-9', etapa: 'etapas-6', monto: 88000, cierre: '2026-09-22', categoria: 'Omitido', responsable: 'usuarios-2', competidor: 'competidores-2', motivo: 'motivos-2', notas: 'Eligió a un competidor por precio.' },
        { folio: 'OPP-1058', nombre: 'Gestión de flotilla — Transportes Río', cliente: 'clientes-7', contacto: 'contactos-8', etapa: 'etapas-2', monto: 41000, cierre: '2026-11-20', categoria: 'Pipeline', responsable: 'usuarios-2', origen: 'Referido' }
      ]
    },

    cotizaciones: {
      title: 'Cotizaciones', one: 'cotización', g: 'f', icon: 'request_quote', filter: 'estado', sum: 'total',
      code: { k: 'folio', p: 'COT-', n: 1040 },
      desc: 'Presupuestos con versiones, vigencia y aprobación.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, main: true, c: 4, sub: 'cliente', w: 170 }),
        f('version', 'Versión', 'number', { req: true, min: 1, list: true, c: 4, def: 1, w: 90 }),
        estado(['Borrador', 'En aprobación', 'Enviada', 'Aceptada', 'Rechazada']),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('oportunidad', 'Oportunidad', 'ref', { ref: 'oportunidades', c: 6 }),
        f('contacto', 'Dirigida a', 'ref', { ref: 'contactos', c: 6 }),
        f('lista', 'Lista de precios', 'ref', { ref: 'listas-precios', c: 6 }),
        f('fecha', 'Fecha', 'date', { req: true, list: true, c: 6, def: today }),
        f('vigencia', 'Válida hasta', 'date', { req: true, after: 'fecha', list: true, c: 6 }),
        f('subtotal', 'Subtotal', 'money', { req: true, min: 0, c: 4, s: 'Importes' }),
        f('descuento', 'Descuento', 'percent', { min: 0, max: 100, c: 4, s: 'Importes', help: 'Más de 15% requiere aprobación.' }),
        f('impuesto', 'Impuesto', 'ref', { ref: 'fiscal', rw: { tipo: 'Impuesto' }, req: true, c: 4, s: 'Importes', def: 'fiscal-4' }),
        f('total', 'Total', 'money', { ro: true, list: true, c: 4, s: 'Importes', calc: (r, S) => { const t = S.get('fiscal', r.impuesto); return Math.round(num(r.subtotal) * (1 - num(r.descuento) / 100) * (1 + (t ? num(t.valor) : 0) / 100) * 100) / 100; } }),
        f('aprobador', 'Aprobador', 'ref', { ref: 'usuarios', c: 8, s: 'Importes', when: { estado: ['En aprobación', 'Enviada', 'Aceptada'] } }),
        f('condiciones', 'Condiciones y notas', 'textarea', { c: 12, s: 'Importes' })
      ],
      seed: [
        { folio: 'COT-1040', version: 1, estado: 'Aceptada', cliente: 'clientes-1', oportunidad: 'oportunidades-1', contacto: 'contactos-2', lista: 'listas-precios-1', fecha: '2026-09-01', vigencia: '2026-09-30', subtotal: 157241.38, descuento: 0, impuesto: 'fiscal-4', aprobador: 'usuarios-1' },
        { folio: 'COT-1041', version: 2, estado: 'Enviada', cliente: 'clientes-2', oportunidad: 'oportunidades-3', contacto: 'contactos-4', lista: 'listas-precios-1', fecha: '2026-09-12', vigencia: '2026-10-12', subtotal: 82758.62, descuento: 5, impuesto: 'fiscal-4', aprobador: 'usuarios-1' },
        { folio: 'COT-1042', version: 1, estado: 'Borrador', cliente: 'clientes-6', oportunidad: 'oportunidades-4', contacto: 'contactos-7', lista: 'listas-precios-2', fecha: '2026-09-18', vigencia: '2026-10-18', subtotal: 46551.72, descuento: 0, impuesto: 'fiscal-4' },
        { folio: 'COT-1043', version: 3, estado: 'Enviada', cliente: 'clientes-4', oportunidad: 'oportunidades-2', contacto: 'contactos-3', lista: 'listas-precios-1', fecha: '2026-09-22', vigencia: '2026-10-07', subtotal: 125000, descuento: 12, impuesto: 'fiscal-4', aprobador: 'usuarios-1', condiciones: 'Incluye 12% de descuento por volumen en licencias.' },
        { folio: 'COT-1044', version: 1, estado: 'En aprobación', cliente: 'clientes-8', oportunidad: 'oportunidades-6', lista: 'listas-precios-1', fecha: '2026-09-20', vigencia: '2026-10-20', subtotal: 62068.97, descuento: 18, impuesto: 'fiscal-4', aprobador: 'usuarios-1' },
        { folio: 'COT-1039', version: 1, estado: 'Rechazada', cliente: 'clientes-9', oportunidad: 'oportunidades-7', lista: 'listas-precios-1', fecha: '2026-08-14', vigencia: '2026-09-14', subtotal: 75862.07, descuento: 8, impuesto: 'fiscal-4' }
      ]
    },

    pedidos: {
      title: 'Pedidos de venta', one: 'pedido', g: 'm', icon: 'shopping_cart', filter: 'estado', sum: 'total',
      code: { k: 'folio', p: 'PED-', n: 3101 },
      desc: 'Pedidos confirmados, surtido y entrega.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, main: true, c: 4, sub: 'cliente', w: 170 }),
        f('oc', 'Orden de compra del cliente', 'text', { c: 4 }),
        estado(['Pendiente', 'En surtido', 'Enviado', 'Entregado', 'Cancelado']),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('cotizacion', 'Cotización origen', 'ref', { ref: 'cotizaciones', c: 6 }),
        f('fecha', 'Fecha del pedido', 'date', { req: true, list: true, c: 6, def: today }),
        f('entrega', 'Entrega comprometida', 'date', { req: true, after: 'fecha', list: true, c: 6 }),
        f('subtotal', 'Subtotal', 'money', { req: true, min: 0, c: 4, s: 'Pago e importes' }),
        f('impuesto', 'Impuesto', 'ref', { ref: 'fiscal', rw: { tipo: 'Impuesto' }, req: true, c: 4, s: 'Pago e importes', def: 'fiscal-4' }),
        f('total', 'Total', 'money', { ro: true, list: true, c: 4, s: 'Pago e importes', calc: (r, S) => { const t = S.get('fiscal', r.impuesto); return Math.round(num(r.subtotal) * (1 + (t ? num(t.valor) : 0) / 100) * 100) / 100; } }),
        f('pago', 'Forma de pago', 'ref', { ref: 'fiscal', rw: { tipo: 'Forma de pago' }, req: true, list: true, c: 6, s: 'Pago e importes' }),
        f('moneda', 'Moneda', 'ref', { ref: 'fiscal', rw: { tipo: 'Moneda' }, req: true, c: 6, s: 'Pago e importes', def: 'fiscal-1' }),
        f('motivo', 'Motivo de cancelación', 'ref', { ref: 'motivos', rw: { aplica: 'Cancelación de pedido' }, req: true, c: 6, s: 'Pago e importes', when: { estado: ['Cancelado'] } }),
        f('direccion', 'Dirección de entrega', 'textarea', { c: 12, s: 'Pago e importes' })
      ],
      seed: [
        { folio: 'PED-3101', oc: 'OC-77812', estado: 'Entregado', cliente: 'clientes-1', cotizacion: 'cotizaciones-1', fecha: '2026-09-02', entrega: '2026-09-16', subtotal: 157241.38, impuesto: 'fiscal-4', pago: 'fiscal-6', moneda: 'fiscal-1', direccion: 'Av. Constitución 1200, Monterrey, N.L.' },
        { folio: 'PED-3102', oc: 'RN-2026-118', estado: 'En surtido', cliente: 'clientes-2', fecha: '2026-09-15', entrega: '2026-09-29', subtotal: 44500, impuesto: 'fiscal-4', pago: 'fiscal-6', moneda: 'fiscal-1' },
        { folio: 'PED-3103', estado: 'Pendiente', cliente: 'clientes-7', fecha: '2026-09-19', entrega: '2026-10-03', subtotal: 17800, impuesto: 'fiscal-4', pago: 'fiscal-9', moneda: 'fiscal-1' },
        { folio: 'PED-3104', oc: 'FL-5531', estado: 'Enviado', cliente: 'clientes-6', fecha: '2026-09-10', entrega: '2026-09-24', subtotal: 26700, impuesto: 'fiscal-4', pago: 'fiscal-7', moneda: 'fiscal-1' },
        { folio: 'PED-3105', estado: 'Cancelado', cliente: 'clientes-9', fecha: '2026-08-20', entrega: '2026-09-03', subtotal: 12000, impuesto: 'fiscal-4', pago: 'fiscal-6', moneda: 'fiscal-1', motivo: 'motivos-5' }
      ]
    },

    forecast: {
      title: 'Forecast, metas y cuotas', one: 'cuota', g: 'f', icon: 'flag', filter: 'periodo', sum: 'cuota',
      desc: 'Cuotas por vendedor y periodo, con compromiso y avance real.',
      fields: [
        f('vendedor', 'Vendedor', 'ref', { ref: 'usuarios', req: true, main: true, list: true, c: 6, sub: 'equipo' }),
        f('equipo', 'Equipo', 'ref', { ref: 'equipos', c: 6 }),
        f('periodo', 'Periodo', 'select', { o: PERIODOS, req: true, list: true, c: 6, def: 'Q4 2026' }),
        estado(['En curso', 'Cumplida', 'En riesgo'], { c: 6 }),
        f('cuota', 'Cuota', 'money', { req: true, min: 0, list: true, c: 4, s: 'Pronóstico' }),
        f('compromiso', 'Compromiso', 'money', { min: 0, c: 4, s: 'Pronóstico' }),
        f('mejor', 'Mejor caso', 'money', { min: 0, c: 4, s: 'Pronóstico' }),
        f('real', 'Venta real', 'money', { min: 0, list: true, c: 4, s: 'Pronóstico' }),
        f('avance', 'Avance', 'percent', { ro: true, list: true, c: 4, s: 'Pronóstico', calc: (r) => num(r.cuota) ? Math.round(num(r.real) / num(r.cuota) * 1000) / 10 : 0 })
      ],
      seed: [
        { vendedor: 'usuarios-2', equipo: 'equipos-2', periodo: 'Q3 2026', estado: 'En curso', cuota: 900000, compromiso: 860000, mejor: 980000, real: 812000 },
        { vendedor: 'usuarios-4', equipo: 'equipos-3', periodo: 'Q3 2026', estado: 'En riesgo', cuota: 750000, compromiso: 640000, mejor: 720000, real: 518000 },
        { vendedor: 'usuarios-1', equipo: 'equipos-1', periodo: 'Q3 2026', estado: 'En curso', cuota: 2400000, compromiso: 2150000, mejor: 2500000, real: 1920000 },
        { vendedor: 'usuarios-2', equipo: 'equipos-2', periodo: 'Q2 2026', estado: 'Cumplida', cuota: 850000, compromiso: 850000, mejor: 900000, real: 903400 },
        { vendedor: 'usuarios-4', equipo: 'equipos-3', periodo: 'Q2 2026', estado: 'Cumplida', cuota: 700000, compromiso: 700000, mejor: 760000, real: 712900 },
        { vendedor: 'usuarios-2', equipo: 'equipos-2', periodo: 'Q4 2026', estado: 'En curso', cuota: 950000, compromiso: 420000, mejor: 610000, real: 0 }
      ]
    },

    'actividades-venta': {
      title: 'Actividades comerciales', one: 'actividad', g: 'f', icon: 'event_note', filter: 'tipo',
      desc: 'Llamadas, visitas, reuniones y tareas de la agenda del vendedor.',
      fields: [
        f('asunto', 'Asunto', 'text', { req: true, main: true, list: true, c: 8, sub: 'cliente' }),
        f('tipo', 'Tipo', 'select', { o: ['Llamada', 'Visita', 'Reunión', 'Tarea', 'Correo'], req: true, list: true, c: 4 }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('contacto', 'Contacto', 'ref', { ref: 'contactos', c: 6 }),
        f('oportunidad', 'Oportunidad', 'ref', { ref: 'oportunidades', c: 12 }),
        f('fecha', 'Fecha', 'date', { req: true, list: true, c: 4, s: 'Agenda', def: today }),
        f('hora', 'Hora', 'time', { c: 4, s: 'Agenda' }),
        f('duracion', 'Duración (min)', 'number', { min: 0, c: 4, s: 'Agenda', def: 30 }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', req: true, list: true, c: 6, s: 'Agenda' }),
        estado(['Pendiente', 'Completada', 'Vencida', 'Cancelada'], { c: 6, s: 'Agenda' }),
        f('resultado', 'Resultado / minuta', 'textarea', { c: 12, s: 'Agenda', when: { estado: ['Completada'] } })
      ],
      seed: [
        { asunto: 'Demo del plan Pro', tipo: 'Reunión', cliente: 'clientes-5', contacto: 'contactos-6', oportunidad: 'oportunidades-5', fecha: '2026-09-23', hora: '10:00', duracion: 60, responsable: 'usuarios-4', estado: 'Pendiente' },
        { asunto: 'Revisión de propuesta con TI', tipo: 'Visita', cliente: 'clientes-4', contacto: 'contactos-3', oportunidad: 'oportunidades-2', fecha: '2026-09-24', hora: '12:30', duracion: 90, responsable: 'usuarios-2', estado: 'Pendiente' },
        { asunto: 'Seguimiento a cotización COT-1041', tipo: 'Llamada', cliente: 'clientes-2', contacto: 'contactos-4', oportunidad: 'oportunidades-3', fecha: '2026-09-22', hora: '17:00', duracion: 15, responsable: 'usuarios-4', estado: 'Completada', resultado: 'Piden ajustar plazo de pago a 60 días.' },
        { asunto: 'Firma de contrato', tipo: 'Visita', cliente: 'clientes-1', contacto: 'contactos-2', oportunidad: 'oportunidades-1', fecha: '2026-09-22', hora: '12:00', duracion: 45, responsable: 'usuarios-2', estado: 'Completada', resultado: 'Contrato firmado por $182,400 MXN.' },
        { asunto: 'Enviar caso de éxito del sector salud', tipo: 'Correo', cliente: 'clientes-3', contacto: 'contactos-5', fecha: '2026-09-19', duracion: 10, responsable: 'usuarios-4', estado: 'Vencida' },
        { asunto: 'Diagnóstico de flotilla', tipo: 'Visita', cliente: 'clientes-7', contacto: 'contactos-8', oportunidad: 'oportunidades-8', fecha: '2026-09-29', hora: '09:00', duracion: 120, responsable: 'usuarios-2', estado: 'Pendiente' }
      ]
    },

    /* ======================= 3. SERVICIO ======================= */
    tickets: {
      title: 'Tickets y casos', one: 'ticket', g: 'm', icon: 'confirmation_number', filter: 'estado',
      code: { k: 'folio', p: 'SRV-', n: 2465 },
      desc: 'Creación, asignación y escalamiento de casos de servicio.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, c: 4, w: 110 }),
        f('asunto', 'Asunto', 'text', { req: true, main: true, list: true, c: 8, sub: 'cliente' }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('contacto', 'Reportado por', 'ref', { ref: 'contactos', c: 6 }),
        f('tipo', 'Tipo de servicio', 'ref', { ref: 'tipos-servicio', req: true, c: 6 }),
        f('canal', 'Canal de entrada', 'select', { o: ['Correo', 'Teléfono', 'Portal', 'WhatsApp', 'Chat'], req: true, c: 6, def: 'Correo' }),
        f('descripcion', 'Descripción', 'textarea', { req: true, c: 12, rows: 4 }),
        f('prioridad', 'Prioridad', 'select', { o: ['Alta', 'Media', 'Baja'], req: true, list: true, badge: true, c: 4, s: 'Asignación', def: 'Media' }),
        f('agente', 'Agente asignado', 'ref', { ref: 'usuarios', list: true, c: 4, s: 'Asignación' }),
        f('nivel', 'Nivel de atención', 'select', { o: ['Nivel 1', 'Nivel 2', 'Nivel 3'], req: true, c: 4, s: 'Asignación', def: 'Nivel 1' }),
        estado(['Abierto', 'En curso', 'En espera', 'Escalado', 'Resuelto', 'Cerrado'], { s: 'Asignación' }),
        f('motivo', 'Motivo de cierre', 'ref', { ref: 'motivos', rw: { aplica: 'Cierre de ticket' }, req: true, c: 8, s: 'Asignación', when: { estado: ['Resuelto', 'Cerrado'] } })
      ],
      seed: [
        { folio: 'SRV-2481', asunto: 'Error de sincronización en módulo de inventario', cliente: 'clientes-1', contacto: 'contactos-1', tipo: 'tipos-servicio-3', canal: 'Correo', prioridad: 'Alta', agente: 'usuarios-3', nivel: 'Nivel 2', estado: 'Abierto', descripcion: 'El inventario deja de sincronizar con el ERP después de las 18:00 h.' },
        { folio: 'SRV-2480', asunto: 'Solicitud de integración con pasarela de pago', cliente: 'clientes-2', contacto: 'contactos-4', tipo: 'tipos-servicio-2', canal: 'Portal', prioridad: 'Media', agente: 'usuarios-3', nivel: 'Nivel 1', estado: 'En curso', descripcion: 'Requieren conectar la pasarela actual al módulo de pedidos.' },
        { folio: 'SRV-2478', asunto: 'Capacitación adicional para personal nuevo', cliente: 'clientes-3', contacto: 'contactos-5', tipo: 'tipos-servicio-1', canal: 'Teléfono', prioridad: 'Baja', agente: 'usuarios-5', nivel: 'Nivel 1', estado: 'En espera', descripcion: 'Ingresaron 6 personas al área administrativa.' },
        { folio: 'SRV-2476', asunto: 'Ajuste de reportes de facturación CFDI 4.0', cliente: 'clientes-4', contacto: 'contactos-3', tipo: 'tipos-servicio-3', canal: 'Correo', prioridad: 'Alta', agente: 'usuarios-3', nivel: 'Nivel 2', estado: 'En curso', descripcion: 'El reporte mensual no incluye el régimen fiscal del receptor.' },
        { folio: 'SRV-2472', asunto: 'Restablecer accesos de administrador', cliente: 'clientes-5', contacto: 'contactos-6', tipo: 'tipos-servicio-1', canal: 'WhatsApp', prioridad: 'Baja', agente: 'usuarios-5', nivel: 'Nivel 1', estado: 'Resuelto', motivo: 'motivos-6', descripcion: 'El administrador olvidó su contraseña y el correo de recuperación.' },
        { folio: 'SRV-2470', asunto: 'Lentitud en carga de catálogo de productos', cliente: 'clientes-6', contacto: 'contactos-7', tipo: 'tipos-servicio-2', canal: 'Portal', prioridad: 'Media', agente: 'usuarios-3', nivel: 'Nivel 1', estado: 'Abierto', descripcion: 'El catálogo tarda más de 20 s en cargar en sucursales.' },
        { folio: 'SRV-2469', asunto: 'Alta de 6 usuarios en sucursal norte', cliente: 'clientes-7', contacto: 'contactos-8', tipo: 'tipos-servicio-1', canal: 'Correo', prioridad: 'Baja', agente: 'usuarios-5', nivel: 'Nivel 1', estado: 'Resuelto', motivo: 'motivos-6', descripcion: 'Alta de usuarios con perfil de operador.' },
        { folio: 'SRV-2465', asunto: 'Revisión de contrato de mantenimiento', cliente: 'clientes-8', tipo: 'tipos-servicio-5', canal: 'Teléfono', prioridad: 'Media', agente: 'usuarios-6', nivel: 'Nivel 1', estado: 'En espera', descripcion: 'Solicitan visita para revisar alcance de la póliza.' }
      ]
    },

    sla: {
      title: 'SLA y tiempos de respuesta', one: 'seguimiento de SLA', g: 'm', icon: 'avg_pace', filter: 'cumplimiento',
      desc: 'Tiempos comprometidos contra tiempos reales por ticket.',
      fields: [
        f('ticket', 'Ticket', 'ref', { ref: 'tickets', req: true, uniq: true, main: true, list: true, c: 8, sub: 'tipo' }),
        f('tipo', 'Nivel de SLA', 'ref', { ref: 'tipos-servicio', req: true, c: 4 }),
        f('obj_resp', 'Respuesta objetivo (h)', 'number', { req: true, min: 0, step: 'any', c: 3, s: 'Tiempos' }),
        f('real_resp', 'Respuesta real (h)', 'number', { min: 0, step: 'any', list: true, c: 3, s: 'Tiempos' }),
        f('obj_res', 'Resolución objetivo (h)', 'number', { req: true, min: 0, step: 'any', c: 3, s: 'Tiempos' }),
        f('real_res', 'Resolución real (h)', 'number', { min: 0, step: 'any', list: true, c: 3, s: 'Tiempos' }),
        f('cumplimiento', 'Cumplimiento', 'select', { o: ['En tiempo', 'En riesgo', 'Incumplido'], req: true, list: true, badge: true, c: 4, s: 'Tiempos', def: 'En tiempo' }),
        f('observaciones', 'Observaciones', 'textarea', { c: 12, s: 'Tiempos' })
      ],
      seed: [
        { ticket: 'tickets-1', tipo: 'tipos-servicio-3', obj_resp: 1, real_resp: 0.8, obj_res: 8, real_res: 7.3, cumplimiento: 'En riesgo', observaciones: 'Escalado a nivel 2; quedan 42 min.' },
        { ticket: 'tickets-2', tipo: 'tipos-servicio-2', obj_resp: 4, real_resp: 1.5, obj_res: 24, real_res: 18, cumplimiento: 'En tiempo' },
        { ticket: 'tickets-4', tipo: 'tipos-servicio-3', obj_resp: 1, real_resp: 1.4, obj_res: 8, real_res: 4, cumplimiento: 'Incumplido', observaciones: 'Primera respuesta fuera de tiempo por cambio de turno.' },
        { ticket: 'tickets-5', tipo: 'tipos-servicio-1', obj_resp: 8, real_resp: 2, obj_res: 72, real_res: 20, cumplimiento: 'En tiempo' },
        { ticket: 'tickets-6', tipo: 'tipos-servicio-2', obj_resp: 4, real_resp: 3.2, obj_res: 24, real_res: 15, cumplimiento: 'En riesgo' },
        { ticket: 'tickets-7', tipo: 'tipos-servicio-1', obj_resp: 8, real_resp: 1, obj_res: 72, real_res: 6, cumplimiento: 'En tiempo' }
      ]
    },

    conocimiento: {
      title: 'Base de conocimiento', one: 'artículo', g: 'm', icon: 'menu_book', filter: 'estado',
      desc: 'Artículos para agentes y autoservicio de clientes.',
      fields: [
        f('titulo', 'Título', 'text', { req: true, main: true, list: true, c: 8, sub: 'categoria' }),
        f('categoria', 'Categoría', 'select', { o: ['Instalación', 'Facturación', 'Integraciones', 'Cuentas y accesos', 'Reportes'], req: true, c: 4 }),
        f('tipo', 'Tipo de servicio', 'ref', { ref: 'tipos-servicio', c: 6 }),
        f('claves', 'Palabras clave', 'text', { c: 6, ph: 'cfdi, timbrado, factura' }),
        f('contenido', 'Contenido', 'textarea', { req: true, c: 12, rows: 8 }),
        f('visibilidad', 'Visibilidad', 'select', { o: ['Interno', 'Público'], req: true, list: true, badge: true, c: 4, s: 'Publicación', def: 'Interno' }),
        f('autor', 'Autor', 'ref', { ref: 'usuarios', req: true, list: true, c: 4, s: 'Publicación' }),
        estado(['Borrador', 'Publicado', 'Archivado'], { s: 'Publicación' }),
        f('vistas', 'Vistas', 'number', { min: 0, list: true, c: 6, s: 'Publicación', def: 0 }),
        f('util', 'Votos útiles', 'percent', { min: 0, max: 100, list: true, c: 6, s: 'Publicación' })
      ],
      seed: [
        { titulo: 'Cómo reconectar el conector ERP', categoria: 'Integraciones', tipo: 'tipos-servicio-3', claves: 'erp, sincronización, conector', contenido: '1. Revisa el estado en Administración › Integraciones.\n2. Regenera el token.\n3. Ejecuta una sincronización manual.', visibilidad: 'Interno', autor: 'usuarios-3', estado: 'Publicado', vistas: 412, util: 92 },
        { titulo: 'Timbrado de facturas CFDI 4.0', categoria: 'Facturación', claves: 'cfdi, timbrado, sat', contenido: 'Requisitos: RFC, régimen fiscal y código postal del receptor…', visibilidad: 'Público', autor: 'usuarios-5', estado: 'Publicado', vistas: 1280, util: 88 },
        { titulo: 'Restablecer contraseña de administrador', categoria: 'Cuentas y accesos', tipo: 'tipos-servicio-1', contenido: 'Desde el portal de soporte, solicita el restablecimiento con verificación de identidad.', visibilidad: 'Público', autor: 'usuarios-5', estado: 'Publicado', vistas: 960, util: 95 },
        { titulo: 'Optimizar carga del catálogo', categoria: 'Instalación', contenido: 'Activa la caché de imágenes y la paginación del catálogo.', visibilidad: 'Interno', autor: 'usuarios-3', estado: 'Borrador', vistas: 0 },
        { titulo: 'Exportar reporte de backlog', categoria: 'Reportes', contenido: 'Analítica › Reportes de servicio › Backlog por agente › Exportar.', visibilidad: 'Interno', autor: 'usuarios-5', estado: 'Publicado', vistas: 144, util: 76 },
        { titulo: 'Integración con conmutador 2024', categoria: 'Integraciones', contenido: 'Versión anterior del conector de telefonía.', visibilidad: 'Interno', autor: 'usuarios-3', estado: 'Archivado', vistas: 530, util: 61 }
      ]
    },

    contratos: {
      title: 'Garantías y contratos', one: 'contrato', g: 'm', icon: 'verified_user', filter: 'estado', sum: 'monto',
      code: { k: 'folio', p: 'CTR-', n: 501 },
      desc: 'Contratos de servicio, pólizas de mantenimiento y garantías.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, main: true, c: 4, sub: 'cliente', w: 170 }),
        f('tipo', 'Tipo', 'select', { o: ['Contrato de servicio', 'Póliza de mantenimiento', 'Garantía'], req: true, list: true, c: 4 }),
        estado(['Vigente', 'Por vencer', 'Vencido', 'Cancelado']),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('producto', 'Producto o servicio cubierto', 'ref', { ref: 'productos', c: 6 }),
        f('nivel', 'Nivel de SLA', 'ref', { ref: 'tipos-servicio', c: 6 }),
        f('horas', 'Horas incluidas', 'number', { min: 0, c: 6, when: { tipo: ['Contrato de servicio', 'Póliza de mantenimiento'] } }),
        f('inicio', 'Inicio', 'date', { req: true, c: 4, s: 'Vigencia' }),
        f('fin', 'Fin', 'date', { req: true, after: 'inicio', list: true, c: 4, s: 'Vigencia' }),
        f('monto', 'Monto', 'money', { min: 0, list: true, c: 4, s: 'Vigencia' }),
        f('renovacion', 'Renovación automática', 'switch', { c: 6, s: 'Vigencia' }),
        f('condiciones', 'Condiciones y exclusiones', 'textarea', { c: 12, s: 'Vigencia' })
      ],
      seed: [
        { folio: 'CTR-501', tipo: 'Contrato de servicio', estado: 'Vigente', cliente: 'clientes-1', producto: 'productos-4', nivel: 'tipos-servicio-3', horas: 120, inicio: '2026-01-01', fin: '2026-12-31', monto: 23000, renovacion: true },
        { folio: 'CTR-502', tipo: 'Póliza de mantenimiento', estado: 'Por vencer', cliente: 'clientes-8', producto: 'productos-3', nivel: 'tipos-servicio-5', horas: 40, inicio: '2025-10-15', fin: '2026-10-14', monto: 18000, renovacion: false },
        { folio: 'CTR-503', tipo: 'Garantía', estado: 'Vigente', cliente: 'clientes-5', producto: 'productos-6', inicio: '2026-06-01', fin: '2027-05-31', monto: 0, renovacion: false, condiciones: 'Cubre defectos de fabricación; excluye golpes y humedad.' },
        { folio: 'CTR-504', tipo: 'Contrato de servicio', estado: 'Vigente', cliente: 'clientes-4', producto: 'productos-4', nivel: 'tipos-servicio-3', horas: 200, inicio: '2026-03-01', fin: '2027-02-28', monto: 46000, renovacion: true },
        { folio: 'CTR-505', tipo: 'Contrato de servicio', estado: 'Vencido', cliente: 'clientes-9', nivel: 'tipos-servicio-2', horas: 60, inicio: '2025-01-01', fin: '2025-12-31', monto: 15000, renovacion: false },
        { folio: 'CTR-506', tipo: 'Póliza de mantenimiento', estado: 'Vigente', cliente: 'clientes-6', producto: 'productos-3', nivel: 'tipos-servicio-2', horas: 80, inicio: '2026-02-01', fin: '2027-01-31', monto: 28000, renovacion: true }
      ]
    },

    encuestas: {
      title: 'Encuestas de satisfacción', one: 'encuesta', g: 'f', icon: 'sentiment_satisfied', filter: 'tipo',
      code: { k: 'folio', p: 'ENC-', n: 801 },
      desc: 'Respuestas CSAT y NPS ligadas a cuentas y tickets.',
      fields: [
        f('folio', 'Folio', 'text', { list: true, main: true, c: 4, sub: 'cliente', w: 170 }),
        f('tipo', 'Tipo', 'select', { o: ['CSAT', 'NPS'], req: true, list: true, badge: true, c: 4, def: 'CSAT' }),
        f('fecha', 'Fecha', 'date', { req: true, list: true, c: 4, def: today }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 4 }),
        f('contacto', 'Contacto', 'ref', { ref: 'contactos', c: 4 }),
        f('ticket', 'Ticket evaluado', 'ref', { ref: 'tickets', c: 4 }),
        f('calificacion', 'Calificación', 'number', { req: true, min: 0, max: 10, list: true, c: 4, s: 'Respuesta', help: 'CSAT de 1 a 5 · NPS de 0 a 10.', w: 120 }),
        f('resultado', 'Clasificación', 'text', { ro: true, list: true, badge: true, c: 4, s: 'Respuesta', calc: (r) => {
          if (r.calificacion === '' || r.calificacion == null) return '';
          const v = num(r.calificacion);
          if (r.tipo === 'NPS') return v >= 9 ? 'Promotor' : v >= 7 ? 'Pasivo' : 'Detractor';
          return v >= 4 ? 'Satisfecho' : v === 3 ? 'Neutral' : 'Insatisfecho';
        } }),
        f('seguimiento', 'Requiere seguimiento', 'switch', { c: 4, s: 'Respuesta' }),
        f('comentario', 'Comentario del cliente', 'textarea', { c: 12, s: 'Respuesta' })
      ],
      seed: [
        { folio: 'ENC-801', tipo: 'CSAT', fecha: '2026-09-22', cliente: 'clientes-5', contacto: 'contactos-6', ticket: 'tickets-5', calificacion: 5, seguimiento: false, comentario: 'Resolvieron muy rápido.' },
        { folio: 'ENC-802', tipo: 'CSAT', fecha: '2026-09-21', cliente: 'clientes-7', contacto: 'contactos-8', ticket: 'tickets-7', calificacion: 4, seguimiento: false },
        { folio: 'ENC-803', tipo: 'NPS', fecha: '2026-09-15', cliente: 'clientes-1', contacto: 'contactos-2', calificacion: 9, seguimiento: false, comentario: 'Buen acompañamiento en la implementación.' },
        { folio: 'ENC-804', tipo: 'NPS', fecha: '2026-09-10', cliente: 'clientes-2', contacto: 'contactos-4', calificacion: 6, seguimiento: true, comentario: 'Los tiempos de integración fueron largos.' },
        { folio: 'ENC-805', tipo: 'CSAT', fecha: '2026-09-08', cliente: 'clientes-6', contacto: 'contactos-7', calificacion: 2, seguimiento: true, comentario: 'El catálogo sigue lento.' },
        { folio: 'ENC-806', tipo: 'NPS', fecha: '2026-09-03', cliente: 'clientes-4', contacto: 'contactos-3', calificacion: 8, seguimiento: false },
        { folio: 'ENC-807', tipo: 'NPS', fecha: '2026-08-28', cliente: 'clientes-7', contacto: 'contactos-8', calificacion: 10, seguimiento: false, comentario: 'El sistema nos ordenó la operación de la flotilla.' },
        { folio: 'ENC-808', tipo: 'NPS', fecha: '2026-08-20', cliente: 'clientes-5', contacto: 'contactos-6', calificacion: 9, seguimiento: false }
      ]
    },

    'actividades-servicio': {
      title: 'Actividades de servicio', one: 'actividad', g: 'f', icon: 'engineering', filter: 'estado',
      desc: 'Seguimientos y visitas técnicas: agenda de técnicos y soporte.',
      fields: [
        f('asunto', 'Asunto', 'text', { req: true, main: true, list: true, c: 8, sub: 'cliente' }),
        f('tipo', 'Tipo', 'select', { o: ['Seguimiento', 'Visita técnica', 'Llamada', 'Mantenimiento preventivo'], req: true, list: true, c: 4 }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 6 }),
        f('ticket', 'Ticket', 'ref', { ref: 'tickets', c: 6 }),
        f('tecnico', 'Técnico o agente', 'ref', { ref: 'usuarios', req: true, list: true, c: 6, s: 'Programación' }),
        estado(['Programada', 'En ruta', 'Completada', 'Cancelada'], { c: 6, s: 'Programación' }),
        f('fecha', 'Fecha', 'date', { req: true, list: true, c: 4, s: 'Programación', def: today }),
        f('hora', 'Hora', 'time', { c: 4, s: 'Programación' }),
        f('duracion', 'Duración (min)', 'number', { min: 0, c: 4, s: 'Programación', def: 60 }),
        f('direccion', 'Dirección de la visita', 'text', { c: 12, s: 'Programación', when: { tipo: ['Visita técnica', 'Mantenimiento preventivo'] } }),
        f('reporte', 'Reporte de servicio', 'textarea', { c: 12, s: 'Programación', when: { estado: ['Completada'] } })
      ],
      seed: [
        { asunto: 'Diagnóstico del conector ERP', tipo: 'Visita técnica', cliente: 'clientes-1', ticket: 'tickets-1', tecnico: 'usuarios-6', estado: 'Programada', fecha: '2026-09-23', hora: '09:30', duracion: 120, direccion: 'Av. Constitución 1200, Monterrey, N.L.' },
        { asunto: 'Seguimiento de integración de pagos', tipo: 'Seguimiento', cliente: 'clientes-2', ticket: 'tickets-2', tecnico: 'usuarios-3', estado: 'Programada', fecha: '2026-09-24', hora: '11:00', duracion: 30 },
        { asunto: 'Mantenimiento preventivo trimestral', tipo: 'Mantenimiento preventivo', cliente: 'clientes-6', tecnico: 'usuarios-6', estado: 'En ruta', fecha: '2026-09-22', hora: '15:00', duracion: 180, direccion: 'Av. Juárez 455, Guadalajara, Jal.' },
        { asunto: 'Confirmar acceso restablecido', tipo: 'Llamada', cliente: 'clientes-5', ticket: 'tickets-5', tecnico: 'usuarios-5', estado: 'Completada', fecha: '2026-09-21', hora: '10:00', duracion: 10, reporte: 'El cliente confirma acceso correcto.' },
        { asunto: 'Revisión de póliza en sitio', tipo: 'Visita técnica', cliente: 'clientes-8', ticket: 'tickets-8', tecnico: 'usuarios-6', estado: 'Programada', fecha: '2026-09-30', hora: '10:00', duracion: 90, direccion: 'Calle Hidalgo 30, Toluca, Edo. Méx.' }
      ]
    },

    /* ======================= 4. MARKETING ======================= */
    campanas: {
      title: 'Campañas', one: 'campaña', g: 'f', icon: 'campaign', filter: 'estado', sum: 'presupuesto',
      desc: 'Planeación, inversión y resultados por campaña.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'tipo' }),
        f('tipo', 'Tipo', 'select', { o: ['Correo', 'Redes sociales', 'Evento', 'Webinar', 'Pauta digital'], req: true, c: 4 }),
        f('audiencia', 'Audiencia', 'ref', { ref: 'audiencias', c: 6 }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', req: true, c: 6 }),
        f('inicio', 'Inicio', 'date', { req: true, c: 4, s: 'Calendario e inversión' }),
        f('fin', 'Fin', 'date', { req: true, after: 'inicio', list: true, c: 4, s: 'Calendario e inversión' }),
        estado(['Planeada', 'Activa', 'Pausada', 'Finalizada'], { s: 'Calendario e inversión' }),
        f('presupuesto', 'Presupuesto', 'money', { req: true, min: 0, list: true, c: 4, s: 'Calendario e inversión' }),
        f('gasto', 'Gasto real', 'money', { min: 0, c: 4, s: 'Calendario e inversión' }),
        f('ingresos', 'Ingresos atribuidos', 'money', { min: 0, c: 4, s: 'Calendario e inversión' }),
        f('meta', 'Meta de leads', 'number', { min: 0, c: 4, s: 'Resultados' }),
        f('generados', 'Leads generados', 'number', { min: 0, list: true, c: 4, s: 'Resultados' }),
        f('roi', 'ROI', 'percent', { ro: true, list: true, c: 4, s: 'Resultados', calc: (r) => num(r.gasto) ? Math.round((num(r.ingresos) - num(r.gasto)) / num(r.gasto) * 1000) / 10 : 0 })
      ],
      seed: [
        { nombre: 'Webinar: CRM para manufactura', tipo: 'Webinar', audiencia: 'audiencias-1', responsable: 'usuarios-7', inicio: '2026-08-01', fin: '2026-08-31', estado: 'Finalizada', presupuesto: 45000, gasto: 41200, ingresos: 182400, meta: 60, generados: 74 },
        { nombre: 'Pauta de búsqueda Q3', tipo: 'Pauta digital', audiencia: 'audiencias-2', responsable: 'usuarios-7', inicio: '2026-07-01', fin: '2026-09-30', estado: 'Activa', presupuesto: 120000, gasto: 86500, ingresos: 154000, meta: 200, generados: 168 },
        { nombre: 'Expo Retail 2026', tipo: 'Evento', audiencia: 'audiencias-3', responsable: 'usuarios-7', inicio: '2026-10-14', fin: '2026-10-16', estado: 'Planeada', presupuesto: 180000, gasto: 25000, ingresos: 0, meta: 120, generados: 0 },
        { nombre: 'Nurturing PyME', tipo: 'Correo', audiencia: 'audiencias-2', responsable: 'usuarios-7', inicio: '2026-06-01', fin: '2026-12-31', estado: 'Activa', presupuesto: 15000, gasto: 9000, ingresos: 64000, meta: 80, generados: 52 },
        { nombre: 'Renovación Enterprise', tipo: 'Correo', audiencia: 'audiencias-4', responsable: 'usuarios-2', inicio: '2026-09-01', fin: '2026-10-31', estado: 'Pausada', presupuesto: 8000, gasto: 2100, ingresos: 0, meta: 15, generados: 3 }
      ]
    },

    audiencias: {
      title: 'Segmentación de audiencias', one: 'audiencia', g: 'f', icon: 'filter_alt', filter: 'actualizacion',
      desc: 'Audiencias construidas sobre el catálogo de segmentos.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'segmento' }),
        f('actualizacion', 'Actualización', 'select', { o: ['Dinámica', 'Estática'], req: true, list: true, badge: true, c: 4, def: 'Dinámica', help: 'Dinámica: se recalcula con cada cambio en las cuentas.' }),
        f('segmento', 'Segmento', 'ref', { ref: 'segmentos', req: true, c: 4, s: 'Criterios' }),
        f('industria', 'Industria', 'select', { o: INDUSTRIAS, c: 4, s: 'Criterios' }),
        f('territorio', 'Territorio', 'ref', { ref: 'territorios', c: 4, s: 'Criterios' }),
        f('reglas', 'Reglas adicionales', 'textarea', { c: 12, s: 'Criterios', ph: 'Ej. Sin compras en los últimos 180 días' }),
        f('optin', 'Sólo contactos con consentimiento', 'switch', { list: true, c: 6, s: 'Criterios', def: true }),
        f('tamano', 'Contactos estimados', 'number', { min: 0, list: true, c: 6, s: 'Criterios' }),
        estado(null, { c: 6, s: 'Criterios' })
      ],
      seed: [
        { nombre: 'Manufactura Enterprise', actualizacion: 'Dinámica', segmento: 'segmentos-1', industria: 'Manufactura', optin: true, tamano: 340, estado: 'Activo' },
        { nombre: 'PyMEs zona Centro', actualizacion: 'Dinámica', segmento: 'segmentos-3', territorio: 'territorios-2', optin: true, tamano: 1820, estado: 'Activo' },
        { nombre: 'Retail y farmacias', actualizacion: 'Dinámica', segmento: 'segmentos-2', industria: 'Retail', optin: true, tamano: 610, estado: 'Activo' },
        { nombre: 'Clientes con póliza por vencer', actualizacion: 'Estática', segmento: 'segmentos-1', optin: false, tamano: 48, estado: 'Activo', reglas: 'Contrato con fin en los próximos 60 días.' },
        { nombre: 'Leads sin actividad 30 días', actualizacion: 'Dinámica', segmento: 'segmentos-3', optin: true, tamano: 930, estado: 'Inactivo' }
      ]
    },

    automatizaciones: {
      title: 'Automatización y nurturing', one: 'flujo', g: 'm', icon: 'schema', filter: 'estado',
      desc: 'Secuencias de correo disparadas por comportamiento.',
      fields: [
        f('nombre', 'Nombre del flujo', 'text', { req: true, main: true, list: true, c: 8, sub: 'disparador' }),
        estado(['Activo', 'Borrador', 'Pausado']),
        f('disparador', 'Disparador', 'select', { o: ['Nuevo lead', 'Descarga de contenido', 'Inactividad de 30 días', 'Post-compra', 'Carrito abandonado'], req: true, c: 6 }),
        f('audiencia', 'Audiencia', 'ref', { ref: 'audiencias', req: true, list: true, c: 6 }),
        f('pasos', 'Correos en la secuencia', 'number', { req: true, min: 1, max: 20, list: true, c: 4, s: 'Secuencia' }),
        f('intervalo', 'Días entre envíos', 'number', { min: 0, c: 4, s: 'Secuencia' }),
        f('plantilla', 'Plantilla base', 'select', { o: ['Bienvenida', 'Educativa', 'Caso de éxito', 'Oferta', 'Reactivación'], c: 4, s: 'Secuencia' }),
        f('apertura', 'Tasa de apertura', 'percent', { min: 0, max: 100, list: true, c: 6, s: 'Desempeño' }),
        f('clic', 'Tasa de clic', 'percent', { min: 0, max: 100, list: true, c: 6, s: 'Desempeño' })
      ],
      seed: [
        { nombre: 'Bienvenida a nuevos leads', estado: 'Activo', disparador: 'Nuevo lead', audiencia: 'audiencias-2', pasos: 4, intervalo: 3, plantilla: 'Bienvenida', apertura: 48, clic: 9.5 },
        { nombre: 'Guía CFDI → demo', estado: 'Activo', disparador: 'Descarga de contenido', audiencia: 'audiencias-3', pasos: 3, intervalo: 5, plantilla: 'Educativa', apertura: 41, clic: 7.2 },
        { nombre: 'Reactivación de leads fríos', estado: 'Pausado', disparador: 'Inactividad de 30 días', audiencia: 'audiencias-5', pasos: 2, intervalo: 7, plantilla: 'Reactivación', apertura: 22, clic: 2.1 },
        { nombre: 'Onboarding post-compra', estado: 'Activo', disparador: 'Post-compra', audiencia: 'audiencias-1', pasos: 5, intervalo: 2, plantilla: 'Educativa', apertura: 63, clic: 18 },
        { nombre: 'Upsell a Enterprise', estado: 'Borrador', disparador: 'Post-compra', audiencia: 'audiencias-4', pasos: 3, intervalo: 10, plantilla: 'Caso de éxito' }
      ]
    },

    landings: {
      title: 'Landing pages y formularios', one: 'landing page', g: 'f', icon: 'web', filter: 'estado',
      desc: 'Páginas y formularios de captura conectados a campañas.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'formulario' }),
        estado(['Publicada', 'Borrador', 'Archivada']),
        f('url', 'URL pública', 'url', { req: true, uniq: true, c: 8, ph: 'https://miclienteag.mx/demo' }),
        f('campana', 'Campaña', 'ref', { ref: 'campanas', list: true, c: 4 }),
        f('formulario', 'Tipo de formulario', 'select', { o: ['Contacto', 'Solicitud de demo', 'Descarga de contenido', 'Registro a evento'], req: true, c: 6, s: 'Formulario' }),
        f('asignar', 'Asignar leads a', 'ref', { ref: 'usuarios', c: 6, s: 'Formulario' }),
        f('campos', 'Campos del formulario', 'multi', { o: ['Nombre', 'Correo', 'Teléfono', 'Empresa', 'Cargo', 'Mensaje', 'Consentimiento'], req: true, c: 12, s: 'Formulario', def: ['Nombre', 'Correo'] }),
        f('visitas', 'Visitas', 'number', { min: 0, list: true, c: 4, s: 'Desempeño' }),
        f('conversiones', 'Conversiones', 'number', { min: 0, c: 4, s: 'Desempeño' }),
        f('tasa', 'Tasa de conversión', 'percent', { ro: true, list: true, c: 4, s: 'Desempeño', calc: (r) => num(r.visitas) ? Math.round(num(r.conversiones) / num(r.visitas) * 1000) / 10 : 0 })
      ],
      seed: [
        { nombre: 'Demo Mi Cliente Pro', estado: 'Publicada', url: 'https://miclienteag.mx/demo', campana: 'campanas-2', formulario: 'Solicitud de demo', asignar: 'usuarios-2', campos: ['Nombre', 'Correo', 'Teléfono', 'Empresa', 'Consentimiento'], visitas: 5320, conversiones: 212 },
        { nombre: 'Guía CFDI 4.0', estado: 'Publicada', url: 'https://miclienteag.mx/guia-cfdi', campana: 'campanas-4', formulario: 'Descarga de contenido', campos: ['Nombre', 'Correo', 'Empresa', 'Consentimiento'], visitas: 8110, conversiones: 704 },
        { nombre: 'Registro Expo Retail', estado: 'Borrador', url: 'https://miclienteag.mx/expo-retail', campana: 'campanas-3', formulario: 'Registro a evento', campos: ['Nombre', 'Correo', 'Empresa', 'Cargo'], visitas: 0, conversiones: 0 },
        { nombre: 'Contacto general', estado: 'Publicada', url: 'https://miclienteag.mx/contacto', formulario: 'Contacto', asignar: 'usuarios-4', campos: ['Nombre', 'Correo', 'Teléfono', 'Mensaje'], visitas: 2950, conversiones: 88 }
      ]
    },

    'leads-entrantes': {
      title: 'Leads entrantes', one: 'lead entrante', g: 'm', icon: 'move_to_inbox', filter: 'estado',
      desc: 'Captación previa a la calificación; después pasan a Ventas.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 6, sub: 'empresa' }),
        f('empresa', 'Empresa', 'text', { c: 6 }),
        f('correo', 'Correo', 'email', { req: true, list: true, c: 6 }),
        f('telefono', 'Teléfono', 'tel', { c: 6 }),
        f('origen', 'Origen', 'select', { o: ['Formulario web', 'Landing page', 'Chat', 'Evento', 'Importación'], req: true, list: true, c: 4, s: 'Captación' }),
        f('landing', 'Landing page', 'ref', { ref: 'landings', c: 4, s: 'Captación', when: { origen: ['Landing page'] } }),
        f('campana', 'Campaña', 'ref', { ref: 'campanas', c: 4, s: 'Captación' }),
        f('fecha', 'Fecha de captura', 'date', { req: true, list: true, c: 4, s: 'Captación', def: today }),
        f('puntuacion', 'Puntuación (0–100)', 'number', { min: 0, max: 100, list: true, c: 4, s: 'Captación', w: 120 }),
        estado(['Sin revisar', 'En nurturing', 'Enviado a ventas', 'Descartado'], { s: 'Captación' }),
        f('mensaje', 'Mensaje', 'textarea', { c: 12, s: 'Captación' })
      ],
      seed: [
        { nombre: 'Rocío Aguilar', empresa: 'Aceros del Norte', correo: 'raguilar@acerosnorte.example', origen: 'Landing page', landing: 'landings-1', campana: 'campanas-2', fecha: '2026-09-22', puntuacion: 68, estado: 'Sin revisar', mensaje: 'Quisiera cotizar 40 licencias.' },
        { nombre: 'Tomás Beltrán', empresa: 'Grupo Farmacéutico Beltrán', correo: 'tbeltran@gfb.example', origen: 'Landing page', landing: 'landings-2', campana: 'campanas-4', fecha: '2026-09-21', puntuacion: 44, estado: 'En nurturing' },
        { nombre: 'Karla Méndez', empresa: 'Mueblería Méndez', correo: 'karla@mmendez.example', origen: 'Chat', fecha: '2026-09-21', puntuacion: 30, estado: 'Sin revisar' },
        { nombre: 'Mariana Ortiz', empresa: 'Distribuidora Ortiz', correo: 'mariana@dortiz.example', origen: 'Formulario web', campana: 'campanas-2', fecha: '2026-09-22', puntuacion: 72, estado: 'Enviado a ventas' },
        { nombre: 'Luis Ibarra', correo: 'libarra@correo.example', origen: 'Importación', fecha: '2026-09-18', puntuacion: 8, estado: 'Descartado', mensaje: 'Correo rebotado.' },
        { nombre: 'Sandra Olvera', empresa: 'Plásticos Olvera', correo: 'solvera@polvera.example', origen: 'Evento', campana: 'campanas-1', fecha: '2026-08-27', puntuacion: 55, estado: 'En nurturing' }
      ]
    },

    /* ======================= 5. ANALÍTICA ======================= */
    dashboards: {
      title: 'Dashboards por rol', one: 'dashboard', g: 'm', icon: 'space_dashboard', filter: 'rol',
      desc: 'Tableros configurados para vendedor, gerente y dirección.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'periodo' }),
        f('rol', 'Rol', 'select', { o: ['Vendedor', 'Gerente comercial', 'Dirección', 'Agente de servicio', 'Marketing'], req: true, list: true, badge: true, c: 4 }),
        f('periodo', 'Periodo por defecto', 'select', { o: ['Hoy', 'Semana', 'Mes', 'Trimestre', 'Año'], req: true, c: 6, def: 'Mes' }),
        f('predeterminado', 'Predeterminado del rol', 'switch', { list: true, c: 6 }),
        f('widgets', 'Widgets', 'multi', { o: ['Pipeline', 'Forecast', 'Tickets por estado', 'SLA', 'CSAT / NPS', 'Campañas', 'Actividades', 'Metas'], req: true, list: true, c: 12, s: 'Contenido' }),
        f('roles', 'Compartido con', 'multi', { ref: 'roles', c: 12, s: 'Contenido' }),
        f('descripcion', 'Descripción', 'textarea', { c: 12, s: 'Contenido' })
      ],
      seed: [
        { nombre: 'Ventas & Servicio', rol: 'Dirección', periodo: 'Mes', predeterminado: true, widgets: ['Pipeline', 'Forecast', 'Tickets por estado', 'SLA', 'CSAT / NPS', 'Metas'], roles: ['roles-1', 'roles-2'], descripcion: 'Panel de control principal.' },
        { nombre: 'Mi día comercial', rol: 'Vendedor', periodo: 'Hoy', predeterminado: true, widgets: ['Pipeline', 'Actividades', 'Metas'], roles: ['roles-4'] },
        { nombre: 'Desempeño del equipo', rol: 'Gerente comercial', periodo: 'Trimestre', predeterminado: true, widgets: ['Pipeline', 'Forecast', 'Metas'], roles: ['roles-3', 'roles-2'] },
        { nombre: 'Cola de soporte', rol: 'Agente de servicio', periodo: 'Hoy', predeterminado: true, widgets: ['Tickets por estado', 'SLA', 'CSAT / NPS'], roles: ['roles-5'] },
        { nombre: 'Resultados de campañas', rol: 'Marketing', periodo: 'Mes', predeterminado: true, widgets: ['Campañas', 'Pipeline'], roles: ['roles-6'] }
      ]
    },

    'reportes-pipeline': {
      title: 'Reportes de pipeline y conversión', one: 'reporte', g: 'm', icon: 'filter_list', filter: 'tipo',
      desc: 'Reportes guardados del embudo comercial y su distribución.',
      fields: reporteFields(['Embudo por etapa', 'Conversión lead → cliente', 'Ganadas vs. perdidas', 'Pipeline por vendedor', 'Velocidad de venta'], ['Vendedor', 'Equipo', 'Territorio', 'Canal', 'Etapa']),
      seed: [
        { nombre: 'Embudo mensual — Dirección', tipo: 'Embudo por etapa', periodo: 'Mes actual', agrupar: 'Etapa', equipo: 'equipos-1', formato: 'PDF', frecuencia: 'Mensual', ultima: '2026-09-01', destinatarios: 'javier@miclienteag.mx' },
        { nombre: 'Conversión de leads por canal', tipo: 'Conversión lead → cliente', periodo: 'Trimestre actual', agrupar: 'Canal', formato: 'Excel', frecuencia: 'Semanal', ultima: '2026-09-21', destinatarios: 'paola@miclienteag.mx, javier@miclienteag.mx' },
        { nombre: 'Ganadas vs. perdidas Q3', tipo: 'Ganadas vs. perdidas', periodo: 'Trimestre actual', agrupar: 'Vendedor', formato: 'PDF', frecuencia: 'Manual', ultima: '2026-09-15' },
        { nombre: 'Pipeline Ventas Norte', tipo: 'Pipeline por vendedor', periodo: 'Mes actual', agrupar: 'Vendedor', equipo: 'equipos-2', formato: 'CSV', frecuencia: 'Diario', ultima: '2026-09-22', destinatarios: 'sofia@miclienteag.mx' },
        { nombre: 'Ciclo de venta por territorio', tipo: 'Velocidad de venta', periodo: 'Año actual', agrupar: 'Territorio', formato: 'Excel', frecuencia: 'Manual' }
      ]
    },

    'reportes-servicio': {
      title: 'Reportes de servicio', one: 'reporte', g: 'm', icon: 'fact_check', filter: 'tipo',
      desc: 'Tiempos de resolución, backlog y cumplimiento de SLA.',
      fields: reporteFields(['Tiempo de resolución', 'Backlog por agente', 'Cumplimiento de SLA', 'Tickets por categoría', 'Reaperturas'], ['Agente', 'Tipo de servicio', 'Cuenta', 'Canal', 'Prioridad']),
      seed: [
        { nombre: 'Backlog diario de mesa de ayuda', tipo: 'Backlog por agente', periodo: 'Mes actual', agrupar: 'Agente', equipo: 'equipos-4', formato: 'PDF', frecuencia: 'Diario', ultima: '2026-09-22', destinatarios: 'luis@miclienteag.mx' },
        { nombre: 'Cumplimiento SLA mensual', tipo: 'Cumplimiento de SLA', periodo: 'Mes actual', agrupar: 'Tipo de servicio', formato: 'Excel', frecuencia: 'Mensual', ultima: '2026-09-01', destinatarios: 'luis@miclienteag.mx, javier@miclienteag.mx' },
        { nombre: 'Tiempo medio de resolución', tipo: 'Tiempo de resolución', periodo: 'Últimos 90 días', agrupar: 'Prioridad', formato: 'PDF', frecuencia: 'Semanal', ultima: '2026-09-21', destinatarios: 'luis@miclienteag.mx' },
        { nombre: 'Tickets por canal', tipo: 'Tickets por categoría', periodo: 'Trimestre actual', agrupar: 'Canal', formato: 'CSV', frecuencia: 'Manual' }
      ]
    },

    rentabilidad: {
      title: 'Rentabilidad por cliente y producto', one: 'análisis', g: 'm', icon: 'savings', filter: 'dimension', sum: 'margen',
      desc: 'Ingresos contra costo por cuenta o por producto.',
      fields: [
        f('concepto', 'Concepto', 'text', { ro: true, main: true, list: true, c: 12, sub: 'periodo', help: 'Se toma de la cuenta o producto elegido.', calc: (r, S) => r.dimension === 'Producto' ? S.label('productos', r.producto) : S.label('clientes', r.cliente) }),
        f('dimension', 'Dimensión', 'select', { o: ['Cliente', 'Producto'], req: true, list: true, badge: true, c: 4, def: 'Cliente' }),
        f('cliente', 'Cuenta', 'ref', { ref: 'clientes', req: true, c: 8, when: { dimension: ['Cliente'] } }),
        f('producto', 'Producto', 'ref', { ref: 'productos', req: true, c: 8, when: { dimension: ['Producto'] } }),
        f('periodo', 'Periodo', 'select', { o: PERIODOS, req: true, c: 4, def: 'Q3 2026' }),
        f('ingresos', 'Ingresos', 'money', { req: true, min: 0, list: true, c: 4, s: 'Resultado' }),
        f('costo', 'Costo total', 'money', { req: true, min: 0, list: true, c: 4, s: 'Resultado', help: 'Costo de venta + costo de servicio.' }),
        f('margen', 'Margen', 'money', { ro: true, list: true, c: 4, s: 'Resultado', calc: (r) => Math.round((num(r.ingresos) - num(r.costo)) * 100) / 100 }),
        f('margen_pct', 'Margen %', 'percent', { ro: true, list: true, c: 4, s: 'Resultado', calc: (r) => num(r.ingresos) ? Math.round((num(r.ingresos) - num(r.costo)) / num(r.ingresos) * 1000) / 10 : 0 }),
        f('notas', 'Notas', 'textarea', { c: 12, s: 'Resultado' })
      ],
      seed: [
        { dimension: 'Cliente', cliente: 'clientes-1', periodo: 'Q3 2026', ingresos: 340000, costo: 162000 },
        { dimension: 'Cliente', cliente: 'clientes-4', periodo: 'Q3 2026', ingresos: 212000, costo: 121000 },
        { dimension: 'Cliente', cliente: 'clientes-6', periodo: 'Q3 2026', ingresos: 96000, costo: 71000, notas: 'Alto costo de servicio por tickets de desempeño.' },
        { dimension: 'Producto', producto: 'productos-1', periodo: 'Q3 2026', ingresos: 512000, costo: 107500 },
        { dimension: 'Producto', producto: 'productos-3', periodo: 'Q3 2026', ingresos: 290000, costo: 155000 },
        { dimension: 'Producto', producto: 'productos-6', periodo: 'Q3 2026', ingresos: 89000, costo: 61000 }
      ]
    },

    kpis: {
      title: 'KPIs de marketing y servicio', one: 'KPI', g: 'm', icon: 'speed', filter: 'area',
      desc: 'Indicadores con meta, valor actual y avance.',
      fields: [
        f('nombre', 'Indicador', 'text', { req: true, main: true, list: true, c: 8, sub: 'unidad' }),
        f('area', 'Área', 'select', { o: ['Marketing', 'Servicio', 'Ventas'], req: true, list: true, badge: true, c: 4 }),
        f('formula', 'Fórmula', 'textarea', { c: 12, rows: 2 }),
        f('unidad', 'Unidad', 'select', { o: ['%', 'MXN', 'Horas', 'Puntos', 'Número'], req: true, c: 4, s: 'Medición' }),
        f('direccion', 'Mejor si es', 'select', { o: ['Mayor', 'Menor'], req: true, c: 4, s: 'Medición', def: 'Mayor' }),
        f('frecuencia', 'Frecuencia', 'select', { o: ['Diario', 'Semanal', 'Mensual', 'Trimestral'], req: true, c: 4, s: 'Medición', def: 'Mensual' }),
        f('meta', 'Meta', 'number', { req: true, step: 'any', list: true, c: 4, s: 'Medición' }),
        f('actual', 'Valor actual', 'number', { step: 'any', list: true, c: 4, s: 'Medición' }),
        f('avance', 'Avance', 'percent', { ro: true, list: true, c: 4, s: 'Medición', calc: (r) => {
          const m = num(r.meta), a = num(r.actual);
          if (!m || !a) return 0;
          return Math.round((r.direccion === 'Menor' ? m / a : a / m) * 1000) / 10;
        } }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', c: 6, s: 'Medición' })
      ],
      seed: [
        { nombre: 'ROI de campañas', area: 'Marketing', formula: '(Ingresos atribuidos − gasto) / gasto', unidad: '%', direccion: 'Mayor', frecuencia: 'Mensual', meta: 150, actual: 172, responsable: 'usuarios-7' },
        { nombre: 'Costo por lead', area: 'Marketing', formula: 'Gasto total / leads generados', unidad: 'MXN', direccion: 'Menor', frecuencia: 'Mensual', meta: 450, actual: 509, responsable: 'usuarios-7' },
        { nombre: 'CSAT promedio', area: 'Servicio', formula: 'Promedio de calificaciones CSAT (1–5)', unidad: 'Puntos', direccion: 'Mayor', frecuencia: 'Semanal', meta: 4.5, actual: 4.6, responsable: 'usuarios-5' },
        { nombre: 'NPS', area: 'Servicio', formula: '% promotores − % detractores', unidad: 'Puntos', direccion: 'Mayor', frecuencia: 'Trimestral', meta: 50, actual: 42, responsable: 'usuarios-5' },
        { nombre: 'Tiempo medio de resolución', area: 'Servicio', formula: 'Promedio de horas desde apertura hasta resolución', unidad: 'Horas', direccion: 'Menor', frecuencia: 'Semanal', meta: 12, actual: 14.2, responsable: 'usuarios-5' },
        { nombre: 'Cumplimiento de SLA', area: 'Servicio', formula: 'Tickets en tiempo / tickets cerrados', unidad: '%', direccion: 'Mayor', frecuencia: 'Mensual', meta: 95, actual: 91, responsable: 'usuarios-5' },
        { nombre: 'Tasa de conversión de leads', area: 'Ventas', formula: 'Leads convertidos / leads calificados', unidad: '%', direccion: 'Mayor', frecuencia: 'Mensual', meta: 25, actual: 28, responsable: 'usuarios-1' }
      ]
    },

    /* ======================= ADMINISTRACIÓN ======================= */
    usuarios: {
      title: 'Usuarios', one: 'usuario', g: 'm', icon: 'manage_accounts', filter: 'estado',
      desc: 'Cuentas de acceso, rol asignado y seguridad.',
      fields: [
        f('nombre', 'Nombre completo', 'text', { req: true, main: true, list: true, c: 6, sub: 'puesto' }),
        f('correo', 'Correo', 'email', { req: true, uniq: true, list: true, c: 6 }),
        f('puesto', 'Puesto', 'text', { req: true, c: 6 }),
        f('telefono', 'Teléfono', 'tel', { c: 6 }),
        f('rol', 'Rol', 'ref', { ref: 'roles', req: true, list: true, c: 6, s: 'Acceso' }),
        f('equipo', 'Equipo', 'ref', { ref: 'equipos', c: 6, s: 'Acceso' }),
        estado(['Activo', 'Invitado', 'Suspendido'], { s: 'Acceso', def: 'Invitado' }),
        f('mfa', 'Verificación en dos pasos', 'switch', { list: true, c: 4, s: 'Acceso' }),
        f('acceso', 'Último acceso', 'date', { list: true, c: 4, s: 'Acceso' })
      ],
      seed: [
        { nombre: 'Javier Rosas', correo: 'javier@miclienteag.mx', puesto: 'Director comercial', rol: 'roles-2', equipo: 'equipos-1', estado: 'Activo', mfa: true, acceso: '2026-09-22' },
        { nombre: 'Sofía Márquez', correo: 'sofia@miclienteag.mx', puesto: 'Ejecutiva de cuenta', rol: 'roles-4', equipo: 'equipos-2', estado: 'Activo', mfa: true, acceso: '2026-09-22' },
        { nombre: 'Andrés Rivas', correo: 'andres@miclienteag.mx', puesto: 'Agente de soporte N2', rol: 'roles-5', equipo: 'equipos-4', estado: 'Activo', mfa: false, acceso: '2026-09-22' },
        { nombre: 'Carla Peña', correo: 'carla@miclienteag.mx', puesto: 'Ejecutiva de cuenta', rol: 'roles-4', equipo: 'equipos-3', estado: 'Activo', mfa: true, acceso: '2026-09-21' },
        { nombre: 'Luis Navarro', correo: 'luis@miclienteag.mx', puesto: 'Gerente de servicio', rol: 'roles-3', equipo: 'equipos-4', estado: 'Activo', mfa: true, acceso: '2026-09-22' },
        { nombre: 'Diego Salas', correo: 'diego@miclienteag.mx', puesto: 'Técnico de campo', rol: 'roles-5', equipo: 'equipos-4', estado: 'Activo', mfa: false, acceso: '2026-09-20' },
        { nombre: 'Paola Ríos', correo: 'paola@miclienteag.mx', puesto: 'Coordinadora de marketing', rol: 'roles-6', equipo: 'equipos-5', estado: 'Activo', mfa: true, acceso: '2026-09-22' },
        { nombre: 'Ana Beltrán', correo: 'ana@miclienteag.mx', puesto: 'Administradora del sistema', rol: 'roles-1', estado: 'Invitado', mfa: false }
      ]
    },

    roles: {
      title: 'Roles y permisos', one: 'rol', g: 'm', icon: 'admin_panel_settings', filter: 'alcance',
      desc: 'Qué puede ver y hacer cada rol en cada módulo.',
      fields: [
        f('nombre', 'Nombre del rol', 'text', { req: true, uniq: true, main: true, list: true, c: 8 }),
        f('alcance', 'Visibilidad de registros', 'select', { o: ['Propios', 'Equipo', 'Territorio', 'Toda la empresa'], req: true, list: true, c: 4 }),
        f('descripcion', 'Descripción', 'textarea', { c: 12, rows: 2 }),
        f('modulos', 'Módulos', 'multi', { o: ['Catálogos', 'Ventas', 'Servicio', 'Marketing', 'Analítica', 'Administración'], req: true, list: true, c: 12, s: 'Permisos' }),
        f('permisos', 'Acciones permitidas', 'multi', { o: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar', 'Aprobar', 'Configurar'], req: true, list: true, c: 12, s: 'Permisos' }),
        estado(null, { c: 4, s: 'Permisos' })
      ],
      seed: [
        { nombre: 'Administrador', alcance: 'Toda la empresa', modulos: ['Catálogos', 'Ventas', 'Servicio', 'Marketing', 'Analítica', 'Administración'], permisos: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar', 'Aprobar', 'Configurar'], estado: 'Activo', descripcion: 'Acceso total, incluida la configuración.' },
        { nombre: 'Dirección', alcance: 'Toda la empresa', modulos: ['Ventas', 'Servicio', 'Marketing', 'Analítica'], permisos: ['Ver', 'Exportar', 'Aprobar'], estado: 'Activo' },
        { nombre: 'Gerente', alcance: 'Equipo', modulos: ['Catálogos', 'Ventas', 'Servicio', 'Analítica'], permisos: ['Ver', 'Crear', 'Editar', 'Exportar', 'Aprobar'], estado: 'Activo' },
        { nombre: 'Vendedor', alcance: 'Propios', modulos: ['Ventas', 'Analítica'], permisos: ['Ver', 'Crear', 'Editar'], estado: 'Activo' },
        { nombre: 'Agente de servicio', alcance: 'Equipo', modulos: ['Servicio'], permisos: ['Ver', 'Crear', 'Editar'], estado: 'Activo' },
        { nombre: 'Marketing', alcance: 'Toda la empresa', modulos: ['Marketing', 'Analítica'], permisos: ['Ver', 'Crear', 'Editar', 'Exportar'], estado: 'Activo' }
      ]
    },

    aprobaciones: {
      title: 'Flujos de aprobación', one: 'flujo de aprobación', g: 'm', icon: 'approval', filter: 'aplica',
      desc: 'Reglas de aprobación para cotizaciones, descuentos y pedidos.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'condicion' }),
        f('aplica', 'Aplica a', 'select', { o: ['Cotización', 'Descuento', 'Pedido', 'Nota de crédito'], req: true, list: true, c: 4 }),
        f('condicion', 'Condición', 'select', { o: ['Descuento mayor a', 'Monto mayor a', 'Siempre'], req: true, c: 6, s: 'Regla' }),
        f('umbral', 'Umbral', 'number', { req: true, min: 0, step: 'any', list: true, c: 6, s: 'Regla', help: 'Porcentaje para descuentos; MXN para montos.', when: { condicion: ['Descuento mayor a', 'Monto mayor a'] } }),
        f('aprobador1', 'Primer aprobador', 'ref', { ref: 'usuarios', req: true, list: true, c: 6, s: 'Aprobadores' }),
        f('aprobador2', 'Segundo aprobador', 'ref', { ref: 'usuarios', c: 6, s: 'Aprobadores' }),
        f('tiempo', 'Tiempo máximo (h)', 'number', { min: 1, c: 6, s: 'Aprobadores', def: 24 }),
        f('escalar', 'Escalar a', 'ref', { ref: 'usuarios', c: 6, s: 'Aprobadores' }),
        estado(null, { c: 4, s: 'Aprobadores' })
      ],
      seed: [
        { nombre: 'Descuento mayor a 15%', aplica: 'Descuento', condicion: 'Descuento mayor a', umbral: 15, aprobador1: 'usuarios-1', tiempo: 24, estado: 'Activo' },
        { nombre: 'Cotización mayor a $500 mil', aplica: 'Cotización', condicion: 'Monto mayor a', umbral: 500000, aprobador1: 'usuarios-1', aprobador2: 'usuarios-8', tiempo: 48, escalar: 'usuarios-8', estado: 'Activo' },
        { nombre: 'Pedidos a crédito', aplica: 'Pedido', condicion: 'Monto mayor a', umbral: 200000, aprobador1: 'usuarios-1', tiempo: 24, estado: 'Activo' },
        { nombre: 'Notas de crédito', aplica: 'Nota de crédito', condicion: 'Siempre', aprobador1: 'usuarios-1', aprobador2: 'usuarios-5', tiempo: 72, estado: 'Inactivo' }
      ]
    },

    auditoria: {
      title: 'Auditoría', one: 'evento', g: 'm', icon: 'history', filter: 'accion', readonly: true,
      desc: 'Bitácora de cambios. Cada alta, edición o baja del CRM se registra aquí.',
      fields: [
        f('fecha', 'Fecha y hora', 'datetime', { list: true, c: 6, w: 170 }),
        f('usuario', 'Usuario', 'text', { list: true, c: 6, w: 160 }),
        f('accion', 'Acción', 'select', { o: ['Alta', 'Edición', 'Baja', 'Inicio de sesión', 'Exportación'], list: true, badge: true, c: 6 }),
        f('modulo', 'Módulo', 'text', { list: true, c: 6, w: 200 }),
        f('registro', 'Registro', 'text', { main: true, list: true, c: 12 }),
        f('detalle', 'Detalle', 'textarea', { c: 12 })
      ],
      seed: [
        { fecha: '2026-09-22T12:12', usuario: 'Sofía Márquez', accion: 'Edición', modulo: 'Ventas › Oportunidades', registro: 'OPP-1051 · Implementación ERP — Grupo Lerma', detalle: 'Etapa: Negociación → Ganada' },
        { fecha: '2026-09-22T11:42', usuario: 'Javier Rosas', accion: 'Edición', modulo: 'Ventas › Cotizaciones', registro: 'COT-1043', detalle: 'Estado: En aprobación → Enviada' },
        { fecha: '2026-09-22T10:58', usuario: 'Andrés Rivas', accion: 'Edición', modulo: 'Servicio › Tickets y casos', registro: 'SRV-2481 · Error de sincronización en módulo de inventario', detalle: 'Nivel de atención: Nivel 1 → Nivel 2' },
        { fecha: '2026-09-22T08:30', usuario: 'Sistema', accion: 'Alta', modulo: 'Marketing › Leads entrantes', registro: 'Mariana Ortiz', detalle: 'Capturado desde formulario web.' },
        { fecha: '2026-09-22T08:02', usuario: 'Javier Rosas', accion: 'Inicio de sesión', modulo: 'Administración', registro: 'javier@miclienteag.mx', detalle: 'Navegador web · Monterrey, N.L.' },
        { fecha: '2026-09-21T18:20', usuario: 'Paola Ríos', accion: 'Exportación', modulo: 'Marketing › Campañas', registro: 'Campañas', detalle: '5 registros exportados a CSV.' }
      ]
    },

    integraciones: {
      title: 'Integraciones', one: 'integración', g: 'f', icon: 'hub', filter: 'estado',
      desc: 'Conexiones con SAP/ERP, ecommerce, correo y telefonía.',
      fields: [
        f('nombre', 'Nombre', 'text', { req: true, main: true, list: true, c: 8, sub: 'proveedor' }),
        f('tipo', 'Tipo', 'select', { o: ['ERP', 'Ecommerce', 'Correo', 'Telefonía', 'Facturación'], req: true, list: true, c: 4 }),
        f('proveedor', 'Proveedor / sistema', 'text', { req: true, c: 6 }),
        f('endpoint', 'URL del servicio', 'url', { c: 6, ph: 'https://' }),
        f('auth', 'Autenticación', 'select', { o: ['OAuth 2.0', 'API key', 'Usuario y contraseña', 'Certificado'], req: true, c: 6, s: 'Conexión' }),
        f('sync', 'Sincronización', 'select', { o: ['Tiempo real', 'Cada 15 min', 'Cada hora', 'Diaria'], req: true, list: true, c: 6, s: 'Conexión' }),
        f('responsable', 'Responsable', 'ref', { ref: 'usuarios', c: 6, s: 'Conexión' }),
        f('ultima', 'Última sincronización', 'date', { list: true, c: 6, s: 'Conexión' }),
        estado(['Conectada', 'Con errores', 'Desconectada'], { s: 'Conexión' }),
        f('notas', 'Notas', 'textarea', { c: 12, s: 'Conexión' })
      ],
      seed: [
        { nombre: 'ERP corporativo', tipo: 'ERP', proveedor: 'SAP Business One', endpoint: 'https://erp.grupoag.example/api', auth: 'Certificado', sync: 'Cada 15 min', responsable: 'usuarios-8', ultima: '2026-09-22', estado: 'Con errores', notas: 'Fallas de sincronización después de las 18:00 h (ver SRV-2481).' },
        { nombre: 'Tienda en línea', tipo: 'Ecommerce', proveedor: 'Plataforma ecommerce', endpoint: 'https://tienda.miclienteag.mx/api', auth: 'API key', sync: 'Tiempo real', responsable: 'usuarios-7', ultima: '2026-09-22', estado: 'Conectada' },
        { nombre: 'Correo corporativo', tipo: 'Correo', proveedor: 'Servidor IMAP/SMTP', auth: 'OAuth 2.0', sync: 'Tiempo real', responsable: 'usuarios-8', ultima: '2026-09-22', estado: 'Conectada' },
        { nombre: 'Conmutador VoIP', tipo: 'Telefonía', proveedor: 'Troncal SIP', auth: 'Usuario y contraseña', sync: 'Tiempo real', responsable: 'usuarios-5', ultima: '2026-09-19', estado: 'Desconectada' },
        { nombre: 'Timbrado CFDI', tipo: 'Facturación', proveedor: 'PAC autorizado', auth: 'Certificado', sync: 'Tiempo real', responsable: 'usuarios-8', ultima: '2026-09-22', estado: 'Conectada' }
      ]
    }
  };

  /* ==========================================================================
     GRÁFICAS DE ANALÍTICA
     Se calculan en vivo desde el store: si alguien edita una oportunidad o un ticket,
     la gráfica cambia. crud.js las pinta con el mismo motor que el dashboard.
     Gráfica: id · title · sub · type (bar|line|doughnut|polarArea|gauge) · col (4|6|8|12)
     horizontal · stacked · money · suffix · link (entidad a la que lleva el clic)
     data(S) → { labels, series: [{ label, values, color | colors }], q?: [búsqueda por etiqueta], center?: {value, label} }
     Colores: claves de MCAGCharts.colors() (brand, brand400, brand300, brand200, steel, success, warning, danger).
     Monocromía azul AG; verde/ámbar/rojo sólo cuando la serie ES un estado.
     ========================================================================== */
  const BRAND_SCALE = ['brand700', 'brand', 'brand400', 'brand300', 'brand200'];
  const VARIANT_COLOR = { success: 'success', warning: 'warning', danger: 'danger', info: 'brand400', brand: 'brand', steel: 'steel', navy: 'brand300' };
  const stateColor = (fieldKey, value) => VARIANT_COLOR[badgeFor(fieldKey, value)] || 'brand300';
  const scale = (n, labels) => Array.from({ length: n }, (_, i) => (labels && labels[i] === 'Otros' ? 'steel' : BRAND_SCALE[i % BRAND_SCALE.length]));

  /* Agrupa filas: { etiqueta: acumulado } respetando el orden de aparición (o el de `order`) */
  function group(rows, keyFn, valFn, order) {
    const out = new Map();
    (order || []).forEach((k) => out.set(k, 0));
    rows.forEach((r) => {
      const k = keyFn(r);
      if (k === '' || k == null) return;
      out.set(k, (out.get(k) || 0) + (valFn ? num(valFn(r)) : 1));
    });
    return out;
  }
  /* Deja las n categorías mayores y junta el resto en "Otros" (más de 6 colores ya no se distinguen) */
  function topN(map, n) {
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length <= n) return new Map(entries);
    const out = new Map(entries.slice(0, n - 1));
    out.set('Otros', entries.slice(n - 1).reduce((acc, e) => acc + e[1], 0));
    return out;
  }
  const etapasOrdenadas = (S) => S.all('etapas').slice().sort((a, b) => num(a.orden) - num(b.orden));
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const CHARTS = {
    dashboards: [
      { id: 'pipeEtapa', title: 'Pipeline por etapa', sub: 'Valor de las oportunidades en cada etapa', type: 'bar', horizontal: true, money: true, col: 6, link: 'oportunidades',
        data: (S) => {
          const et = etapasOrdenadas(S);
          const opp = S.all('oportunidades');
          return {
            labels: et.map((e) => e.nombre),
            series: [{ label: 'Valor', values: et.map((e) => opp.filter((o) => o.etapa === e.id).reduce((a, o) => a + num(o.monto), 0)),
              colors: et.map((e, i) => e.tipo === 'Ganada' ? 'success' : e.tipo === 'Perdida' ? 'danger' : BRAND_SCALE[i % 4]) }]
          };
        } },
      { id: 'leadsOrigen', title: 'Leads por origen', sub: 'Leads calificados y entrantes', type: 'polarArea', col: 6, link: 'leads',
        data: (S) => {
          const g = topN(group(S.all('leads').concat(S.all('leads-entrantes')), (r) => r.origen), 6);
          return { labels: [...g.keys()], series: [{ label: 'Leads', values: [...g.values()], colors: scale(g.size, [...g.keys()]) }] };
        } },
      { id: 'cuotaReal', title: 'Cuota vs. venta real', sub: 'Por vendedor y periodo', type: 'bar', money: true, col: 8, link: 'forecast',
        data: (S) => {
          const rows = S.all('forecast').slice().sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
          return {
            labels: rows.map((r) => S.label('usuarios', r.vendedor).split(' ')[0] + ' · ' + r.periodo),
            q: rows.map((r) => S.label('usuarios', r.vendedor)),
            series: [
              { label: 'Cuota', values: rows.map((r) => num(r.cuota)), color: 'brand200' },
              { label: 'Venta real', values: rows.map((r) => num(r.real)), color: 'brand' }
            ]
          };
        } },
      { id: 'nps', title: 'Satisfacción del cliente', sub: 'NPS con las encuestas registradas', type: 'gauge', col: 4, link: 'encuestas',
        data: (S) => npsData(S) },
      { id: 'ticketsEstado', title: 'Tickets por estado', sub: 'Carga actual de la mesa de ayuda', type: 'doughnut', col: 6, link: 'tickets',
        data: (S) => {
          const g = group(S.all('tickets'), (r) => r.estado, null, ['Abierto', 'En curso', 'En espera', 'Escalado', 'Resuelto', 'Cerrado']);
          const labels = [...g.keys()].filter((k) => g.get(k) > 0);
          return { labels: labels, series: [{ label: 'Tickets', values: labels.map((k) => g.get(k)), colors: labels.map((k) => stateColor('estado', k)) }] };
        } },
      { id: 'campanas', title: 'Campañas: presupuesto vs. gasto', sub: 'Inversión por campaña', type: 'bar', money: true, col: 6, link: 'campanas',
        data: (S) => {
          const rows = S.all('campanas');
          return {
            labels: rows.map((r) => r.nombre),
            series: [
              { label: 'Presupuesto', values: rows.map((r) => num(r.presupuesto)), color: 'brand200' },
              { label: 'Gasto real', values: rows.map((r) => num(r.gasto)), color: 'brand' }
            ]
          };
        } }
    ],

    'reportes-pipeline': [
      { id: 'embudo', title: 'Embudo por etapa', sub: 'Número de oportunidades', type: 'bar', horizontal: true, col: 6, link: 'oportunidades',
        data: (S) => {
          const et = etapasOrdenadas(S).filter((e) => e.tipo !== 'Perdida');
          const opp = S.all('oportunidades');
          return { labels: et.map((e) => e.nombre), series: [{ label: 'Oportunidades', values: et.map((e) => opp.filter((o) => o.etapa === e.id).length),
            colors: et.map((e, i) => e.tipo === 'Ganada' ? 'success' : BRAND_SCALE[i % 4]) }] };
        } },
      { id: 'cierreMes', title: 'Valor por mes de cierre', sub: 'Oportunidades abiertas y ganadas', type: 'line', money: true, col: 6, link: 'oportunidades',
        data: (S) => {
          const perdida = S.all('etapas').filter((e) => e.tipo === 'Perdida').map((e) => e.id);
          const rows = S.all('oportunidades').filter((o) => o.cierre && perdida.indexOf(o.etapa) === -1);
          const keys = [...new Set(rows.map((o) => o.cierre.slice(0, 7)))].sort();
          return {
            labels: keys.map((k) => MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4)),
            series: [{ label: 'Valor', values: keys.map((k) => rows.filter((o) => o.cierre.slice(0, 7) === k).reduce((a, o) => a + num(o.monto), 0)), color: 'brand' }]
          };
        } },
      { id: 'ganadasPerdidas', title: 'Ganadas vs. perdidas', sub: 'Valor por resultado', type: 'doughnut', money: true, col: 4, link: 'oportunidades',
        data: (S) => {
          const tipo = {};
          S.all('etapas').forEach((e) => { tipo[e.id] = e.tipo; });
          const sum = (t) => S.all('oportunidades').filter((o) => tipo[o.etapa] === t).reduce((a, o) => a + num(o.monto), 0);
          return { labels: ['Ganadas', 'Perdidas', 'Abiertas'], q: ['Ganada', 'Perdida', ''],
            series: [{ label: 'Valor', values: [sum('Ganada'), sum('Perdida'), sum('Abierta')], colors: ['success', 'danger', 'brand300'] }] };
        } },
      { id: 'porVendedor', title: 'Pipeline por vendedor', sub: 'Valor por categoría de forecast', type: 'bar', stacked: true, money: true, col: 8, link: 'oportunidades',
        data: (S) => {
          const rows = S.all('oportunidades');
          const vend = [...new Set(rows.map((o) => o.responsable).filter(Boolean))];
          const cats = [['Compromiso', 'brand'], ['Mejor caso', 'brand400'], ['Pipeline', 'brand200'], ['Omitido', 'steel']];
          return {
            labels: vend.map((v) => S.label('usuarios', v)),
            series: cats.map((c) => ({ label: c[0], color: c[1], values: vend.map((v) => rows.filter((o) => o.responsable === v && o.categoria === c[0]).reduce((a, o) => a + num(o.monto), 0)) }))
          };
        } },
      { id: 'leadsEstado', title: 'Conversión de leads', sub: 'Leads por estado', type: 'bar', col: 6, link: 'leads',
        data: (S) => {
          const g = group(S.all('leads'), (r) => r.estado, null, ['Nuevo', 'Contactado', 'Calificado', 'Convertido', 'Descalificado']);
          return { labels: [...g.keys()], series: [{ label: 'Leads', values: [...g.values()], colors: [...g.keys()].map((k) => stateColor('estado', k)) }] };
        } },
      { id: 'oppOrigen', title: 'Oportunidades por origen', sub: 'Número de oportunidades', type: 'polarArea', col: 6, link: 'oportunidades',
        data: (S) => {
          const g = group(S.all('oportunidades'), (r) => r.origen);
          return { labels: [...g.keys()], series: [{ label: 'Oportunidades', values: [...g.values()], colors: scale(g.size) }] };
        } }
    ],

    'reportes-servicio': [
      { id: 'tkEstado', title: 'Tickets por estado', sub: 'Backlog actual', type: 'doughnut', col: 4, link: 'tickets',
        data: (S) => {
          const g = group(S.all('tickets'), (r) => r.estado, null, ['Abierto', 'En curso', 'En espera', 'Escalado', 'Resuelto', 'Cerrado']);
          const labels = [...g.keys()].filter((k) => g.get(k) > 0);
          return { labels: labels, series: [{ label: 'Tickets', values: labels.map((k) => g.get(k)), colors: labels.map((k) => stateColor('estado', k)) }] };
        } },
      { id: 'tkAgente', title: 'Backlog por agente', sub: 'Tickets abiertos por prioridad', type: 'bar', stacked: true, col: 8, link: 'tickets',
        data: (S) => {
          const rows = S.all('tickets').filter((t) => ['Resuelto', 'Cerrado'].indexOf(t.estado) === -1);
          const ag = [...new Set(rows.map((t) => t.agente).filter(Boolean))];
          return {
            labels: ag.map((a) => S.label('usuarios', a)),
            series: [['Alta', 'danger'], ['Media', 'warning'], ['Baja', 'brand300']].map((p) => ({ label: p[0], color: p[1], values: ag.map((a) => rows.filter((t) => t.agente === a && t.prioridad === p[0]).length) }))
          };
        } },
      { id: 'slaGauge', title: 'Cumplimiento de SLA', sub: 'Seguimientos en tiempo', type: 'gauge', col: 4, link: 'sla',
        data: (S) => {
          const g = group(S.all('sla'), (r) => r.cumplimiento, null, ['En tiempo', 'En riesgo', 'Incumplido']);
          const total = S.all('sla').length || 1;
          return { labels: [...g.keys()], series: [{ label: 'Tickets', values: [...g.values()], colors: ['success', 'warning', 'danger'] }],
            center: { value: Math.round(g.get('En tiempo') / total * 100) + '%', label: 'en tiempo' } };
        } },
      { id: 'slaTiempos', title: 'Resolución: objetivo vs. real', sub: 'Horas por ticket', type: 'bar', suffix: ' h', col: 8, link: 'sla',
        data: (S) => {
          const rows = S.all('sla');
          return {
            labels: rows.map((r) => (S.get('tickets', r.ticket) || {}).folio || '—'),
            series: [
              { label: 'Objetivo', values: rows.map((r) => num(r.obj_res)), color: 'brand200' },
              { label: 'Real', values: rows.map((r) => num(r.real_res)), color: 'brand' }
            ]
          };
        } },
      { id: 'tkCanal', title: 'Tickets por canal', sub: 'Canal de entrada', type: 'polarArea', col: 6, link: 'tickets',
        data: (S) => {
          const g = group(S.all('tickets'), (r) => r.canal);
          return { labels: [...g.keys()], series: [{ label: 'Tickets', values: [...g.values()], colors: scale(g.size) }] };
        } },
      { id: 'csat', title: 'Distribución CSAT', sub: 'Calificaciones de 1 a 5', type: 'bar', col: 6, link: 'encuestas',
        data: (S) => {
          const rows = S.all('encuestas').filter((r) => r.tipo === 'CSAT');
          const vals = [1, 2, 3, 4, 5].map((n) => rows.filter((r) => num(r.calificacion) === n).length);
          return { labels: ['1', '2', '3', '4', '5'], q: ['CSAT', 'CSAT', 'CSAT', 'CSAT', 'CSAT'],
            series: [{ label: 'Encuestas', values: vals, colors: ['danger', 'danger', 'warning', 'success', 'success'] }] };
        } }
    ],

    rentabilidad: [
      { id: 'ingCosto', title: 'Ingresos vs. costo', sub: 'Por cuenta o producto', type: 'bar', money: true, col: 8, link: 'rentabilidad',
        data: (S) => {
          const E = ENTITIES.rentabilidad;
          const rows = S.all('rentabilidad');
          const concepto = E.fields.find((x) => x.k === 'concepto');
          return {
            labels: rows.map((r) => S.value(E, concepto, r)),
            series: [
              { label: 'Ingresos', values: rows.map((r) => num(r.ingresos)), color: 'brand' },
              { label: 'Costo', values: rows.map((r) => num(r.costo)), color: 'brand200' }
            ]
          };
        } },
      { id: 'margenPct', title: 'Margen por concepto', sub: 'Verde ≥ 40% · ámbar ≥ 20%', type: 'bar', horizontal: true, suffix: '%', col: 4, link: 'rentabilidad',
        data: (S) => {
          const E = ENTITIES.rentabilidad;
          const rows = S.all('rentabilidad');
          const concepto = E.fields.find((x) => x.k === 'concepto');
          const pct = (r) => num(r.ingresos) ? Math.round((num(r.ingresos) - num(r.costo)) / num(r.ingresos) * 1000) / 10 : 0;
          return { labels: rows.map((r) => S.value(E, concepto, r)),
            series: [{ label: 'Margen', values: rows.map(pct), colors: rows.map((r) => pct(r) >= 40 ? 'success' : pct(r) >= 20 ? 'warning' : 'danger') }] };
        } }
    ],

    kpis: [
      { id: 'avanceKpi', title: 'Avance contra meta', sub: 'Verde ≥ 100% · ámbar ≥ 85%', type: 'bar', horizontal: true, suffix: '%', col: 8, link: 'kpis',
        data: (S) => {
          const E = ENTITIES.kpis;
          const av = E.fields.find((x) => x.k === 'avance');
          const rows = S.all('kpis');
          const vals = rows.map((r) => num(S.value(E, av, r)));
          return { labels: rows.map((r) => r.nombre),
            series: [{ label: 'Avance', values: vals, colors: vals.map((v) => v >= 100 ? 'success' : v >= 85 ? 'warning' : 'danger') }] };
        } },
      { id: 'kpiArea', title: 'Avance promedio por área', sub: 'Promedio de los KPIs de cada área', type: 'bar', suffix: '%', col: 4, link: 'kpis',
        data: (S) => {
          const E = ENTITIES.kpis;
          const av = E.fields.find((x) => x.k === 'avance');
          const areas = ['Ventas', 'Marketing', 'Servicio'];
          const vals = areas.map((a) => {
            const rows = S.all('kpis').filter((r) => r.area === a);
            return rows.length ? Math.round(rows.reduce((acc, r) => acc + num(S.value(E, av, r)), 0) / rows.length * 10) / 10 : 0;
          });
          return { labels: areas, series: [{ label: 'Avance promedio', values: vals, colors: scale(3) }] };
        } }
    ]
  };

  function npsData(S) {
    const rows = S.all('encuestas').filter((r) => r.tipo === 'NPS' && r.calificacion !== '' && r.calificacion != null);
    const prom = rows.filter((r) => num(r.calificacion) >= 9).length;
    const det = rows.filter((r) => num(r.calificacion) <= 6).length;
    const pas = rows.length - prom - det;
    const nps = rows.length ? Math.round((prom - det) / rows.length * 100) : 0;
    return { labels: ['Promotores', 'Pasivos', 'Detractores'], q: ['NPS', 'NPS', 'NPS'],
      series: [{ label: 'Encuestas', values: [prom, pas, det], colors: ['success', 'warning', 'danger'] }],
      center: { value: (nps > 0 ? '+' : '') + nps, label: 'NPS global' } };
  }

  /* Índices derivados: módulo de cada entidad y campo principal */
  Object.keys(ENTITIES).forEach((key) => {
    const E = ENTITIES[key];
    E.key = key;
    E.module = MODULES.find((m) => m.entities.indexOf(key) !== -1);
    E.main = E.fields.find((x) => x.main) || E.fields[0];
    E.charts = CHARTS[key] || null;
  });

  /* ==========================================================================
     STORE — datos de demostración persistidos en localStorage
     Clave: mcag-data-v1:<entidad>. Si el storage no está disponible, vive en memoria.
     ========================================================================== */
  const DATA_PREFIX = 'mcag-data-v1:';
  const cache = {};

  function seedRows(key) {
    const E = ENTITIES[key];
    return (E.seed || []).map((row, i) => Object.assign({ id: key + '-' + (i + 1) }, JSON.parse(JSON.stringify(row))));
  }

  const S = {
    all(key) {
      if (!ENTITIES[key]) return [];
      if (cache[key]) return cache[key];
      let rows = null;
      try { rows = JSON.parse(localStorage.getItem(DATA_PREFIX + key)); } catch (e) { rows = null; }
      cache[key] = Array.isArray(rows) ? rows : seedRows(key);
      return cache[key];
    },
    save(key, rows) {
      cache[key] = rows;
      try { localStorage.setItem(DATA_PREFIX + key, JSON.stringify(rows)); } catch (e) { /* memoria */ }
    },
    reset(key) {
      delete cache[key];
      try { localStorage.removeItem(DATA_PREFIX + key); } catch (e) { /* noop */ }
      return S.all(key);
    },
    get(key, id) {
      if (!id) return null;
      return S.all(key).find((r) => r.id === id) || null;
    },
    /* Valor de un campo, resolviendo calculados */
    value(E, fld, row) {
      if (fld.calc) { try { return fld.calc(row, S); } catch (e) { return ''; } }
      return row[fld.k];
    },
    /* Texto con el que se muestra un registro en selects, tablas y relacionados */
    label(key, id, depth) {
      const E = ENTITIES[key];
      const row = S.get(key, id);
      if (!E || !row) return '';
      let text = S.value(E, E.main, row);
      if (E.main.t === 'ref') text = (depth || 0) < 2 ? S.label(E.main.ref, text, (depth || 0) + 1) : '';
      if (E.code && E.code.k !== E.main.k && row[E.code.k]) text = row[E.code.k] + ' · ' + text;
      return String(text == null ? '' : text);
    },
    count(key, fieldKey, values) {
      return S.all(key).filter((r) => values.indexOf(r[fieldKey]) !== -1).length;
    },
    /* Registro en la bitácora de auditoría */
    audit(accion, E, row, detalle) {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const rows = S.all('auditoria').slice();
      rows.unshift({
        id: 'auditoria-' + Date.now().toString(36),
        fecha: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
        usuario: 'Javier Rosas',
        accion: accion,
        modulo: (E.module ? E.module.title + ' › ' : '') + E.title,
        registro: row ? S.label(E.key, row.id) || '—' : E.title,
        detalle: detalle || ''
      });
      S.save('auditoria', rows.slice(0, 500));
    }
  };

  /* ==========================================================================
     NAVEGACIÓN GENERADA (sidebar, topbar, apps, command palette)
     ========================================================================== */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const PAGE = document.body.dataset.page || '';
  const CURRENT = PAGE === 'modulo' ? params.get('e') : null;
  const CURRENT_MODULE = CURRENT && ENTITIES[CURRENT] ? ENTITIES[CURRENT].module.key : null;

  function moduleBadge(m) {
    if (!m.badge) return 0;
    return S.count(m.badge.e, m.badge.f, m.badge.v);
  }

  function renderSidebar() {
    const host = document.querySelector('[data-nav]');
    if (!host) return;
    const link = (m) => {
      const open = CURRENT_MODULE === m.key;
      const badge = moduleBadge(m);
      const subs = m.entities.map((k) => {
        const E = ENTITIES[k];
        return '<a href="' + esc(url.entity(k)) + '"' + (k === CURRENT ? ' class="active" aria-current="page"' : '') + '>' + esc(E.title) + '</a>';
      }).join('');
      return '<div class="nav-item' + (open ? ' open' : '') + '">' +
        '<a class="nav-link-x' + (open ? ' active' : '') + '" href="#" data-submenu data-tip="' + esc(m.title) + '">' +
          '<span class="material-symbols-sharp icon-md" aria-hidden="true">' + esc(m.icon) + '</span>' +
          '<span class="nav-text">' + esc(m.title) + '</span>' +
          (badge ? '<span class="nav-badge" aria-label="' + badge + ' pendientes">' + badge + '</span>' : '') +
          '<span class="material-symbols-sharp nav-caret" aria-hidden="true">chevron_right</span>' +
        '</a>' +
        '<div class="nav-sub"><div>' + subs + '</div></div>' +
      '</div>';
    };

    host.innerHTML =
      '<div class="nav-group-label">Principal</div>' +
      '<a class="nav-link-x' + (PAGE === 'dashboard' ? ' active' : '') + '" href="' + esc(url.home) + '" data-tip="Panel de control"' + (PAGE === 'dashboard' ? ' aria-current="page"' : '') + '>' +
        '<span class="material-symbols-sharp icon-md" aria-hidden="true">dashboard</span>' +
        '<span class="nav-text">Panel de control</span>' +
      '</a>' +
      '<div class="nav-group-label">Módulos</div>' +
      MODULES.filter((m) => !m.system).map(link).join('') +
      '<div class="nav-group-label">Sistema</div>' +
      MODULES.filter((m) => m.system).map(link).join('');
  }

  function renderTopnav() {
    const host = document.querySelector('[data-topnav]');
    if (!host) return;
    const items = [['Inicio', url.home, PAGE === 'dashboard']].concat(
      MODULES.filter((m) => !m.system).map((m) => [m.title, url.entity(m.entities[0]), CURRENT_MODULE === m.key])
    );
    host.innerHTML = items.map((it) =>
      '<a href="' + esc(it[1]) + '" class="topbar-link' + (it[2] ? ' active' : '') + '"' + (it[2] ? ' aria-current="page"' : '') + '>' + esc(it[0]) + '</a>'
    ).join('');
  }

  function renderApps() {
    const host = document.querySelector('[data-apps]');
    if (!host) return;
    host.innerHTML = MODULES.map((m) =>
      '<a class="app-tile" href="' + esc(url.entity(m.entities[0])) + '"><span class="material-symbols-sharp" aria-hidden="true">' + esc(m.icon) + '</span>' + esc(m.title) + '</a>'
    ).join('');
  }

  function renderCommandPalette() {
    const host = document.querySelector('[data-cmdk-nav]');
    if (!host) return;
    const item = (icon, text, href, kbd) =>
      '<div class="cmdk-item" data-href="' + esc(href) + '" data-label="' + esc(text) + '"><span class="material-symbols-sharp icon-md" aria-hidden="true">' + esc(icon) + '</span> ' + esc(text) + (kbd ? ' <kbd>' + esc(kbd) + '</kbd>' : '') + '</div>';
    let html = '<div class="cmdk-group">Acciones</div>' +
      item('add_circle', 'Crear oportunidad', url.entity('oportunidades', '&nuevo=1')) +
      item('confirmation_number', 'Crear ticket', url.entity('tickets', '&nuevo=1')) +
      item('request_quote', 'Nueva cotización', url.entity('cotizaciones', '&nuevo=1')) +
      item('person_add', 'Registrar lead', url.entity('leads', '&nuevo=1'));
    html += '<div class="cmdk-group">Clientes</div>' + S.all('clientes').slice(0, 5).map((c) =>
      '<div class="cmdk-item" data-href="' + esc(url.entity('clientes', '&id=' + encodeURIComponent(c.id))) + '" data-label="' + esc(c.nombre) + '"><span class="avatar-fallback cmdk-avatar" aria-hidden="true">' + esc(initials(c.nombre)) + '</span> ' + esc(c.nombre) + '</div>'
    ).join('');
    MODULES.forEach((m) => {
      html += '<div class="cmdk-group">' + esc(m.title) + '</div>' +
        m.entities.map((k) => item(ENTITIES[k].icon, ENTITIES[k].title, url.entity(k))).join('');
    });
    host.innerHTML = html;
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';
  }

  function safe(name, fn) {
    try { fn(); } catch (err) { console.error('[Mi Cliente AG] Falló ' + name + ':', err); }
  }
  safe('renderSidebar', renderSidebar);
  safe('renderTopnav', renderTopnav);
  safe('renderApps', renderApps);
  safe('renderCommandPalette', renderCommandPalette);

  window.MCAG = { MODULES: MODULES, ENTITIES: ENTITIES, S: S, url: url, badgeFor: badgeFor, initials: initials, esc: esc, today: today, num: num };
})();
