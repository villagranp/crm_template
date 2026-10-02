---
name: frontend-react
description: Guía la implementación en React + TypeScript + Vite + Material UI: estructura por feature, TanStack Query, cliente de API centralizado, formularios con RHF + Zod y accesibilidad. Úsalo en cualquier cambio dentro de frontend/.
---

# Frontend — React

## Purpose

Construir interfaz consistente, accesible y mantenible sin duplicar reglas de negocio del backend.

## When to use

Cualquier cambio en `frontend/`.

## Required context

`CODING-STANDARDS.md`, theme en `src/theme/`, cliente en `src/services/api/`, contrato OpenAPI.

## Inputs

User story, contrato de API, estados de UI requeridos.

## Standards

```text
frontend/src/
  app/         bootstrap, providers, router
  routes/      páginas por ruta
  features/    lógica y UI por dominio funcional
  components/  componentes compartidos y presentacionales
  hooks/       hooks reutilizables
  services/    api client, auth
  stores/      estado global de cliente (Zustand) — solo si hace falta
  schemas/     Zod
  theme/ types/ utils/ config/
```

- **Toda** llamada HTTP pasa por `services/api`. Prohibido `fetch` suelto en componentes.
- Estado de servidor: TanStack Query. Estado global de cliente: Zustand **solo** si se justifica.
- Formularios: React Hook Form + Zod; los mensajes de validación son de UX, la validación
  autoritativa vive en el backend.
- UI: Material UI y el theme central. Sin Tailwind, Bootstrap ni Ant Design (ADR-009).
- Ocultar un control por permisos es UX, **no** seguridad.

## Process

1. Ubica el cambio en `features/<dominio>/`; extrae a `components/` solo lo realmente compartido.
2. Define el tipo de la respuesta y el esquema Zod si el dato entra por formulario.
3. Crea el hook de consulta/mutación sobre el cliente de API, con `queryKey` estable.
4. Implementa el componente con estados explícitos: cargando, vacío, error, éxito.
5. Usa tokens del theme (spacing, palette, typography); nada de valores mágicos dispersos.
6. Verifica accesibilidad: roles, etiquetas, foco visible, navegación por teclado, contraste.
7. Maneja errores con mensaje accionable, sin exponer detalles internos.
8. Escribe pruebas con React Testing Library por comportamiento observable; E2E si es flujo crítico.

## Required checks

- [ ] ¿Ninguna llamada directa a `fetch` fuera de `services/api`?
- [ ] ¿Estados de carga, vacío y error cubiertos?
- [ ] ¿Sin reglas de negocio duplicadas del backend?
- [ ] ¿Sin secretos ni tokens sensibles persistidos sin justificación?
- [ ] ¿Theme MUI usado, sin estilos ad-hoc repetidos?
- [ ] ¿Accesible por teclado y con foco visible?
- [ ] ¿Sin re-renders evidentes por dependencias mal declaradas?
- [ ] ¿Pruebas por comportamiento, no por implementación?

## Expected output

Componentes, hooks y servicios en la estructura por feature, con pruebas y estados completos.

## Anti-patterns

- `useEffect` + `fetch` para datos de servidor en vez de TanStack Query.
- Estado global para datos que pertenecen a una sola pantalla.
- `any` en respuestas de API.
- Mensajes de error crudos del backend mostrados al usuario.
- Componentes de 400 líneas que mezclan datos, lógica y presentación.
- Confiar en ocultar un botón como control de acceso.

## Definition of Done

La pantalla cumple los criterios de aceptación, es accesible, tiene pruebas y pasa
`lint`, `typecheck`, `test` y `build`.

## Related Skills

`coding-standards`, `api-design`, `authentication`, `authorization`, `testing`, `security`

## Nota sobre estilos y navegación

Todo lo visual (color, tipografía, espaciado, movimiento, responsive) se rige
por la skill `design-system` y sale del tema, nunca de valores escritos a mano.
El menú **no se declara aquí**: viene de `GET /me/menu` (skill
`access-management`).
