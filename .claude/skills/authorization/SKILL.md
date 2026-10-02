---
name: authorization
description: Aplica RBAC + permisos resource.action mediante guards y policies, con deny-by-default y verificación de propiedad del recurso. Úsalo en todo cambio que afecte acceso a datos u operaciones.
---

# Authorization

## Purpose

Decidir **qué puede hacer** una identidad ya autenticada, de forma centralizada, explícita
y verificable.

## When to use

Todo endpoint nuevo o modificado, todo cambio de roles, permisos o visibilidad de datos.

## Required context

`SECURITY.md`, ADR-008, guards y decoradores en `backend/src/common/`.

## Inputs

Recurso, operación, roles existentes, reglas de propiedad/tenencia de datos.

## Standards

```text
User → Roles → Permissions (resource.action)
```

- Nomenclatura: `customers.read`, `customers.create`, `orders.approve`. Minúsculas, punto simple.
- **Deny by default**: sin permiso declarado, no hay acceso.
- Decisión en guards/policies, nunca dispersa en `if (user.role === 'ADMIN')`.
- El permiso no basta: si el recurso pertenece a alguien, se verifica propiedad/tenencia (IDOR).
- El frontend puede ocultar UI, pero la decisión vive en el backend.

## Process

1. Nombra el permiso: `<recurso>.<acción>`. Reutiliza si ya existe.
2. Declara en el handler: `@RequirePermission('customers.read')`.
3. Si el endpoint es público, usa `@Public()` y escribe **por qué** en el código y en la historia.
4. Define el filtro de datos: ¿el usuario ve todo el recurso o solo lo suyo/su organización?
5. Implementa la verificación de propiedad dentro del caso de uso, no solo en el guard.
6. Registra el permiso en el catálogo de permisos del proyecto y en el mapeo de roles.
7. Devuelve `403` (autenticado sin permiso) y `401` (no autenticado). No los confundas.
8. Evita filtrado por diferencia: un recurso ajeno es `404` cuando revelar su existencia es sensible.
9. Prueba: con permiso, sin permiso, sin autenticar y con recurso de otro propietario.

## Required checks

- [ ] ¿Cada handler declara permiso o `@Public()` justificado?
- [ ] ¿Se verifica propiedad/tenencia además del permiso?
- [ ] ¿Las listas filtran por el alcance del usuario, no devuelven todo?
- [ ] ¿`401` vs `403` correctamente distinguidos?
- [ ] ¿Sin comprobaciones de rol dispersas por el código?
- [ ] ¿El permiso está en el catálogo y mapeado a roles?
- [ ] ¿Pruebas de acceso permitido, denegado y no autenticado?

## Expected output

Endpoint protegido por permiso, catálogo de permisos actualizado y pruebas de 401/403.

## Anti-patterns

- `if (user.role === 'ADMIN')` repartido por servicios y componentes.
- Confiar en que el frontend no muestra el botón.
- Permiso genérico tipo `admin.all` para todo.
- Verificar permiso pero no propiedad del registro.
- Devolver `403` con un mensaje que revela la existencia y los datos del recurso.
- Endpoints públicos "temporales" sin justificación.

## Definition of Done

El acceso es deny-by-default, el permiso está documentado y las pruebas cubren acceso permitido,
denegado y no autenticado.

## Related Skills

`authentication`, `entra-id`, `security`, `api-design`, `backend-nestjs`, `testing`

## Nota sobre el origen de los permisos

Desde ADR-018, los permisos se leen de la base de datos (roles + excepciones
directas del usuario), no de los claims del token. Para dar de alta un permiso,
una opción de menú o cambiar quién ve qué, usa la skill `access-management`.
