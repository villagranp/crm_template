# Prototipo de referencia visual

Prototipo estático (HTML + Bootstrap + JS) que fija el **look and feel** de
Mi Cliente AG. Entregado como `CRM.zip` el 2026-10-09. Es la referencia visual
de la especificación `../DESIGN-SPEC-SOURCE.md`, que es idéntica a la suya.

**No es código de la aplicación.** No se compila ni se despliega; la app real es
React + MUI (`frontend/`). Sirve para comparar: abre `index.html`,
`pages/modulo.html?e=equipos` y `pages/auth/login.html` en un navegador, o mira
`screenshots/`.

- Los tokens (colores, tipografías, radios, sombras) ya viven en
  `frontend/src/theme/tokens.ts` (ADR-017). Lo que se replica de aquí es la
  estructura y el acabado de los componentes.
- Los controles sin función real en la app (idioma, aplicaciones, mensajes,
  contadores, KPIs de cabecera, "Recordarme", enlaces legales) **no** se
  replican hasta que exista su funcionalidad (decisión del responsable,
  2026-10-09).
- Los datos que muestra son de demostración. El panel de inicio de la app usa
  el estilo, no esos datos.
- Se excluyeron su `.git` y su `CLAUDE.md`.
