# ADR-025 - Inmutabilidad de la bitácora de auditoría con disparadores en la base

## Status
Accepted — 2026-10-10

Proyecto: Mi Cliente AG. Resuelve D-07.11 del CRM
(`docs/implementation-plans/crm/07-administracion.md` H.3). Se registra como ADR
nuevo y no como addendum: ver "Por qué un ADR nuevo".

## Context

`audit_logs` es el rastro de seguridad de todas las mutaciones relevantes
(ALCANCE §9.5: "restringir modificación y eliminación de auditoría"). Hoy la
inmutabilidad depende **solo del código**: no hay endpoint de escritura y el
puerto `AuditRepository` solo inserta, pero el usuario de base de datos de la
aplicación puede ejecutar `UPDATE`, `DELETE` y `TRUNCATE` sobre la tabla. Un
defecto, una consulta manual o una cuenta comprometida podrían alterar el rastro
sin dejar huella.

A la vez, la bitácora tiene retención (`auditoria.dias_retencion` = 365): debe
poder purgarse lo que supera ese periodo.

Los disparadores son un **patrón nuevo** en el repositorio (hasta hoy, solo
`CHECK` y FK escritos a mano en las migraciones), y por eso la consolidación lo
clasificó como decisión de arquitectura (CLAUDE.md §8.6).

### Por qué un ADR nuevo

No existe un ADR de auditoría al que añadir un addendum: ADR-016 trata de
observabilidad (logs técnicos y correlation ID), que es otra cosa que la
bitácora funcional de auditoría, y ADR-008/ADR-018 tratan de autorización.
Mezclarlo en ADR-016 confundiría logs de diagnóstico con evidencia de
auditoría. Un ADR propio deja registrada la regla y el patrón (disparadores en
la base) para que otras tablas de solo inserción puedan adoptarlo con la misma
referencia.

## Decision

**La base de datos rechaza cualquier modificación de `audit_logs` y cualquier
borrado de filas dentro del periodo de retención, mediante disparadores
escritos a mano en una migración.**

- `BEFORE UPDATE ... FOR EACH ROW` → siempre rechaza (`RAISE EXCEPTION`,
  `SQLSTATE` propio).
- `BEFORE TRUNCATE ... FOR EACH STATEMENT` → siempre rechaza.
- `BEFORE DELETE ... FOR EACH ROW` → rechaza si `occurred_at` es más reciente
  que `now() - auditoria.dias_retencion días`. El valor se lee de
  `system_parameters`; si falta o no es válido se usa 365 (el disparador nunca
  queda más permisivo por un parámetro ausente). La purga de lo vencido sigue
  siendo posible.
- Migración `…_audit_logs_append_only` con `--create-only` y SQL a mano (Prisma
  no gestiona disparadores ni los detecta como deriva), con su script inverso
  en `backend/prisma/rollbacks/`. La entrega el Módulo 7 (F-47); puede
  adelantarse a la Fase 0 sin cambios.
- **Recomendación de despliegue** (`docs/deployment/environments.md`): el rol
  de la aplicación sin `UPDATE`, `DELETE` ni `TRUNCATE` sobre `audit_logs`; la
  purga por retención se ejecuta con otro rol. Los disparadores protegen aunque
  esta recomendación no se aplique.
- El patrón queda disponible para otras tablas de solo inserción
  (`*_history`, `visit_events`) si en el futuro se decide protegerlas igual; no
  se aplica a ellas en esta versión.

## Alternatives

- **Solo código** (estado actual). Sin coste, pero la garantía desaparece ante
  cualquier camino de escritura fuera de los casos de uso. Rechazada.
- **Solo `REVOKE` de permisos** al rol de la aplicación. Efectivo, pero depende
  de cada despliegue y un `REVOKE DELETE` total impediría la purga desde la
  aplicación; además no protege si la aplicación se conecta como propietario de
  la tabla (habitual en entornos pequeños). Se mantiene como capa adicional.
- **Tabla con hash encadenado** (cada fila firma la anterior). Detecta
  manipulaciones incluso de un DBA, pero es más complejo y no impide el cambio,
  solo lo descubre. Excesivo para la necesidad actual.
- **Enviar la auditoría a un almacén externo inmutable** (WORM, SIEM).
  Infraestructura nueva sin un requisito que la justifique hoy.

## Consequences

- `audit_logs` deja de poder corregirse, ni siquiera por un error legítimo: una
  corrección es una fila nueva.
- Las pruebas de integración que limpian la base entre casos no pueden usar
  `TRUNCATE audit_logs`: deben recrear el esquema o desactivar el disparador con
  un rol de mantenimiento en el entorno de prueba (documentado en TESTING al
  implementar).
- Un propietario de la base o un superusuario aún puede desactivar los
  disparadores: la protección es contra la aplicación y errores, no contra un
  administrador de base malicioso.
- Cada `DELETE` de purga lee un parámetro: coste despreciable para una tarea
  periódica.

## Security Considerations

- Cierra la brecha "la aplicación puede reescribir su propia evidencia".
- El mensaje de error del disparador no revela datos de la fila.
- Desactivar un disparador exige privilegios de propietario y queda en los logs
  de PostgreSQL; la recomendación de roles separados reduce quién los tiene.
- La retención efectiva nunca es menor que la configurada: un parámetro ausente
  o inválido se trata como 365 días.
