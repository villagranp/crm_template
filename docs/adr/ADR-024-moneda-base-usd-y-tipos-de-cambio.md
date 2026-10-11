# ADR-024 - Moneda base USD y tipos de cambio por país

## Status
Accepted — 2026-10-10

Proyecto: Mi Cliente AG. Resuelve DM-1, DM-35 y la decisión nueva DM-36 del CRM
(`docs/implementation-plans/crm/decisiones-pendientes.md`). Diseño de datos en
`docs/implementation-plans/crm/00-modelo-de-datos.md` §2.2, §2.7 y §2.16.

## Context

La oportunidad lleva una "estimación" (ALCANCE §5.8) que Inicio y Reportes
suman (KPI-10 `AMOUNT`, reporte de oportunidades, dashboard). El CRM opera en
seis países con cinco monedas: Guatemala (GTQ), El Salvador (USD), Honduras
(HNL), Costa Rica (CRC), Venezuela (VES) y Ecuador (USD) (DM-2).

La propuesta inicial era guardar monto y moneda **sin convertir** y totalizar
por moneda, porque una tabla de tipos de cambio parecía fuera de alcance. El
responsable de negocio respondió el 2026-10-10: **"moneda base USD, con la
capacidad de usar un tipo de cambio a la moneda del país"**. Eso amplía el
modelo (tablas nuevas, una regla de conversión y una pantalla de
mantenimiento) y cambia cómo se calculan todos los indicadores de dinero.

### Por qué un ADR y no solo una nota en 00

El diseño de tablas vive en 00, pero la decisión tiene las cinco señales de
CLAUDE.md §11: modelo de datos (tablas nuevas y columnas en `countries` y
`opportunities`), contrato público (DTOs de oportunidad y de reportes cambian),
comportamiento transversal (Inicio, Proyectos, Reportes y Administración
dependen de la misma regla), impacto de negocio (qué cifra ve la dirección) y un
patrón nuevo (foto de un valor de referencia en el registro). Cambiarla después
exige recalcular datos históricos. Merece quedar registrada como decisión, con
alternativas, aparte del modelo.

## Decision

**USD es la moneda base de todo total, indicador y reporte. Una estimación
puede capturarse en USD o en la moneda del país del proyecto; en ese caso se
convierte a USD con el tipo de cambio vigente a la fecha de la oportunidad y se
guardan el monto original, la moneda, la tasa aplicada, su fecha de vigencia y
el equivalente en USD.**

1. **Datos.** Tabla `currencies` (ISO 4217, nombre, símbolo, decimales de
   presentación) y tabla `exchange_rates` (moneda, fecha de vigencia, unidades
   de moneda por 1 USD, fuente; única por moneda y fecha; sin fila para USD).
   `countries.currency_code` dice la moneda local de cada país.
2. **Regla de búsqueda.** La tasa aplicable es la de mayor `effective_date`
   **≤ `opportunity_date`** (la fecha de identificación, DM-35). Sin tasa →
   `422 EXCHANGE_RATE_NOT_FOUND` (no se guarda un monto sin equivalente en USD;
   el usuario puede capturarlo en USD). Tasa más antigua que
   `crm.tipos_cambio.dias_aviso_antiguedad` (31 días) → se guarda con el aviso no
   bloqueante `EXCHANGE_RATE_STALE`.
3. **Monedas admitidas.** USD o la moneda del país del proyecto
   (`422 CURRENCY_NOT_ALLOWED` en otro caso). El formulario propone la del país.
4. **Foto, no referencia.** La oportunidad guarda el valor de la tasa y su fecha
   de vigencia, no una FK a la tasa. Corregir o añadir tasas después no altera
   estimaciones ya guardadas ni totales históricos. Se recalcula solo cuando
   cambian el monto, la moneda o la fecha de la oportunidad.
5. **Cálculo.** `monto_usd = monto / tasa`, 4 decimales, redondeo `HALF_UP`,
   aritmética decimal en el backend; `CHECK` en la base para que monto, moneda,
   tasa y equivalente vayan siempre juntos y para que en USD la tasa sea 1.
6. **Indicadores.** Inicio y Reportes suman `estimated_amount_usd`. Un reporte
   filtrado a **un solo país** puede mostrar además la moneda local como
   **referencia** (total USD × tasa vigente a la fecha de corte, rotulado con esa
   fecha); nunca se suman monedas distintas.
7. **Mantenimiento.** Monedas por semilla (solo lectura). Tasas: carga inicial
   por semilla con los valores que entregue el negocio, y pantalla de
   Administración dentro de F-46 (§9.4 "Conversiones y estimaciones
   comerciales") con `parametros.ver` / `parametros.configurar`, como
   **extensión de alcance aprobada por el responsable**. Las tasas no se borran:
   se corrigen (auditado) o se añade una fecha nueva.
8. **Parámetro.** `crm.moneda_base` = `USD`, estructural y de solo lectura;
   sustituye a `crm.moneda_por_defecto`.

## Alternatives

- **Totalizar por moneda sin convertir** (propuesta original). Sin tablas
  nuevas, pero la dirección no obtiene una cifra consolidada de seis países y
  cada pantalla tendría que mostrar hasta cinco totales. Rechazada por el
  responsable.
- **Convertir al consultar** con la tasa del día (sin foto). Siempre "al día",
  pero las cifras históricas cambiarían cada vez que se carga una tasa y un
  reporte de un mes cerrado no sería reproducible. Rechazada.
- **Guardar solo el monto en USD.** Simple, pero se pierde lo que el asesor
  realmente negoció en moneda local y no se puede auditar la conversión.
  Rechazada.
- **Integración automática con un proveedor de tipos de cambio** (banco
  central, API comercial). Evita la carga manual, pero añade una dependencia
  externa, credenciales y un planificador (ADR propio). Fuera de esta versión; el
  campo `source` permite incorporarla más adelante.
- **Monedas como catálogo genérico** (`catalog_items`). Reutiliza el
  mantenimiento existente, pero no admite FK por código ni una columna de
  decimales con significado. Rechazada a favor de una tabla pequeña.

## Consequences

- Cambian `countries` (`currency_code` obligatorio, en lugar del
  `default_currency` opcional propuesto), `opportunities` (tres columnas nuevas y
  cinco `CHECK`) y `sales_targets` (sin columna de moneda: las metas de monto son
  en USD). Se añaden dos tablas en la migración 2 de la Fase 0.
- Los contratos de oportunidad (Módulo 3) devuelven monto original, moneda,
  tasa, fecha de la tasa y equivalente USD; los de Inicio y Reportes, importes en
  USD.
- Operación: alguien con `parametros.configurar` debe mantener las tasas al día,
  en especial VES, que varía con frecuencia; el aviso de antigüedad lo hace
  visible. **Antes del primer despliegue el negocio debe entregar las tasas
  iniciales** (no se inventan en la semilla).
- Una oportunidad en moneda local no puede guardarse si falta la tasa: es un
  bloqueo deliberado, visible y con salida (capturar en USD).
- Cambiar la moneda base en el futuro exigiría recalcular todos los
  equivalentes: por eso el parámetro es de solo lectura.

## Security Considerations

- Las tasas son configuración de negocio: escribirlas exige
  `parametros.configurar` (rol administrador por defecto) y cada alta o
  corrección queda en `audit_logs` (`crm.exchange_rate.created/updated`) con el
  valor anterior y el nuevo.
- La conversión la hace siempre el backend; el cliente envía monto y moneda,
  nunca la tasa ni el equivalente en USD (no se confía en valores calculados por
  el navegador).
- Las tasas no son datos personales ni sensibles; leerlas no requiere alcance de
  datos.
