# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Foundation del Enterprise Project Template: gobernanza (`CLAUDE.md`, `AGENTS.md`),
  estándares (API, coding), arquitectura, seguridad, autenticación y testing.
- Sistema de desarrollo asistido por IA: 9 agentes y 23 skills en `.claude/`.
- ADR-001 a ADR-016 con las decisiones fundacionales.
- Skeleton frontend React + Vite + Material UI con shell, routing, theme, API client
  y abstracción de autenticación.
- Skeleton backend NestJS con health/ready, configuración validada, correlation ID,
  filtro de excepciones, guards de autenticación y permisos, y puertos de datos.
- Infraestructura local: Dockerfiles multi-stage, Docker Compose y NGINX.
- Pipelines de Azure DevOps para PR, frontend y backend.
- Sistema de diseño Grupo AG portado al tema de Material UI: tokens, paleta clara y oscura,
  tipografía Poppins/Inter auto-alojada, motion system y breakpoints mobile-first (ADR-017).
- Shell visual completo: topbar, sidebar de tres estados, barra inferior de móvil,
  encabezado de página con tira de KPIs y pantalla de acceso con marca.
- Núcleo de gestión en base de datos: usuarios, identidades, credenciales, sesiones,
  roles, permisos, módulos, opciones de menú y sus asignaciones a roles y a usuarios,
  además de equipos, parámetros, catálogos, folios, archivos, notificaciones,
  aprobaciones y bitácora (ADR-018).
- Módulo `access` del backend: `/me`, `/me/menu`, administración de usuarios, roles,
  permisos y opciones, con resolución de permisos respaldada por base de datos.
- Semilla idempotente con 2 módulos, 30 permisos, 9 opciones, 4 roles y administrador inicial.
- Skills `design-system` y `access-management`.

### Changed
- El menú deja de declararse en el frontend: se sirve desde `GET /me/menu`.
- `StaticPermissionResolver` (mapa vacío) se sustituye por `DatabasePermissionResolver`.
- Contexto de build de Docker movido a la raíz del monorepo.
