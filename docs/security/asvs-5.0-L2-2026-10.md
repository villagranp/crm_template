# Informe de verificación OWASP ASVS 5.0 · Nivel 2

**Mi Cliente AG** (CRM de Grupo AG) · Autoverificación interna · Entregable AJ1-5 de «Ajustes 1»

| Dato | Valor |
|---|---|
| Estándar | OWASP Application Security Verification Standard (ASVS) **5.0.0**, **nivel 2** (decisión D-AJ1.8) |
| Fecha de la verificación | 2026-10-15 |
| Rama y commit verificado | `feature/ajustes-1` · `20c9bc289d4c0578698535f72f55d1efdb3e740f`. El informe se verificó sobre el código de ese commit; los commits posteriores serán solo documentación. Versión inicial verificada sobre `60573a8a17cb44e85befe90cd39a270777527a11` (ver «Control de cambios del informe») |
| Tipo de verificación | **Autoverificación interna de nivel 2. Sin prueba de penetración externa. No es una certificación.** |
| Elaborado por | Agente de seguridad (IA), con el rol Security Engineer del proyecto |
| Estado del documento | Borrador para revisión del área de ciberseguridad (segunda versión, 2026-10-15) |
| Especificación | `docs/implementation-plans/AJUSTES-1.md` §9.2 |

---

## 1. Resumen ejecutivo

**Qué es este informe.** Es una autoverificación interna: el equipo del proyecto contrastó el código, la configuración y las pruebas automatizadas del commit indicado contra los **253 requisitos de nivel 1 y 2** del estándar ASVS 5.0. **No incluye pruebas de penetración externas, ni revisión de terceros, ni pruebas sobre los servidores reales**, y por tanto **no constituye una certificación** de cumplimiento ni sustituye a una auditoría independiente.

**Resultado.** De los 253 requisitos, **70 no aplican** (la aplicación no tiene esa funcionalidad: WebRTC, GraphQL, WebSocket, servidor OAuth, doble factor, SMS, etc.). De los **183 aplicables**, **113 se cumplen (62 %)**, 50 se cumplen en parte, 16 no se cumplen y 4 no se pueden verificar desde el repositorio. Para el nivel 1 (70 requisitos, 62 aplicables) el cumplimiento es de **46 de 62 (74 %)**. El porcentaje cuenta como «no cumplido» todo lo parcial o no verificable (criterio prudente).

| Capítulo | Requisitos (nivel 1 y 2) | Cumple | Parcial | No cumple | No verificable | No aplica | Aplicables | Cumplimiento |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| V1 Codificación y saneamiento | 27 | 16 | 0 | 0 | 0 | 11 | 16 | 100 % |
| V2 Validación y lógica de negocio | 11 | 10 | 1 | 0 | 0 | 0 | 11 | 91 % |
| V3 Seguridad del frontend web | 19 | 11 | 5 | 2 | 0 | 1 | 18 | 61 % |
| V4 API y servicios web | 10 | 1 | 3 | 0 | 0 | 6 | 4 | 25 % |
| V5 Manejo de archivos | 9 | 7 | 1 | 1 | 0 | 0 | 9 | 78 % |
| V6 Autenticación | 35 | 14 | 5 | 4 | 0 | 12 | 23 | 61 % |
| V7 Gestión de sesiones | 18 | 9 | 4 | 3 | 0 | 2 | 16 | 56 % |
| V8 Autorización | 7 | 4 | 2 | 0 | 0 | 1 | 6 | 67 % |
| V9 Tokens autocontenidos | 7 | 6 | 1 | 0 | 0 | 0 | 7 | 86 % |
| V10 OAuth y OIDC | 29 | 5 | 2 | 0 | 0 | 22 | 7 | 71 % |
| V11 Criptografía | 14 | 6 | 3 | 0 | 0 | 5 | 9 | 67 % |
| V12 Comunicación segura | 9 | 1 | 4 | 1 | 1 | 2 | 7 | 14 % |
| V13 Configuración | 13 | 3 | 7 | 0 | 3 | 0 | 13 | 23 % |
| V14 Protección de datos | 9 | 6 | 1 | 2 | 0 | 0 | 9 | 67 % |
| V15 Codificación segura y arquitectura | 13 | 5 | 5 | 2 | 0 | 1 | 12 | 42 % |
| V16 Registro de seguridad y manejo de errores | 16 | 9 | 6 | 1 | 0 | 0 | 16 | 56 % |
| V17 WebRTC | 7 | 0 | 0 | 0 | 0 | 7 | 0 | n/a |
| **Total** | **253** | **113** | **50** | **16** | **4** | **70** | **183** | **62 %** |

**Lectura.** En capítulos con pocos requisitos aplicables (V4, V10) el porcentaje es poco representativo; conviene mirar los recuentos. El código de la aplicación tiene una base sólida; la mayor distancia con el nivel 2 está en la **operación y el entorno** (transporte seguro, gestión de secretos, registros, dependencias) y en la **identidad** (contraseña inicial y segundo factor). Los capítulos con menor porcentaje (V12, V13, V4, V15) son justamente los que dependen de la infraestructura y de procesos que este repositorio no controla por completo.

**Fortalezas comprobadas.**
- Autorización «denegar por defecto»: los 206 endpoints declaran permiso o una excepción justificada, y hay pruebas de 401, 403 y de aislamiento entre usuarios.
- Contraseñas con Argon2id, bloqueo de cuenta atómico, respuesta de login indistinguible, sesiones con renovación rotativa y detección de reutilización; el token de acceso vive solo en memoria del navegador.
- Entrada validada de forma estricta (campos no declarados rechazados), SQL parametrizado, exportaciones CSV/XLSX neutralizadas, errores sin detalles internos y registros con redacción de datos sensibles.
- Adjuntos con tipo verificado por contenido, límite de tamaño, protección contra archivos comprimidos maliciosos y descarga solo a través de la API.
- Bitácora de auditoría inmutable por disparadores en la base de datos (con el riesgo aceptado de QA descrito en la sección 5).
- Aislamiento entre usuarios en el navegador: la caché de datos se vacía al cambiar la identidad y, tras un cierre de sesión voluntario, no se conserva la ruta de retorno.

**Brechas de prioridad Alta (4).** Se proponen como historias en la sección 4.2.
1. **G-01** Todos los usuarios nuevos o restablecidos reciben la misma contraseña inicial fija, sin caducidad.
2. **G-02** El transporte seguro no está garantizado en el borde: HSTS desactivado en NGINX, certificado de QA no público y TLS de producción sin verificar.
3. **G-03** No hay segundo factor de autenticación mientras se use el login local (pendiente de Entra ID).
4. **G-04** Hay 1 vulnerabilidad alta y 4 moderadas en dependencias de producción, y la plantilla de análisis de dependencias (`security-scan.yml`) no se ejecuta en los pipelines.

Además hay **10 brechas abiertas de prioridad Media** (sesiones sin inactividad ni gestión, lista de contraseñas comunes mínima, adjuntos sin antivirus, registros sin envío a un sistema separado, datos sin clasificar, CSP con estilos en línea, secretos sin bóveda verificada, TLS interno, claves sin política) y **13 de prioridad Baja** (sección 4.1). Una brecha Media, **G-13** (caché del cliente al cerrar sesión), quedó **resuelta** tras la versión inicial. Quedan **27 brechas abiertas de 28**.

**No verificable desde el repositorio (4).** Suites de cifrado TLS (V12.1.2), reglas de salida de red del servidor (V13.2.4, V13.2.5) y bloqueo del método TRACE en entornos reales (V13.4.4). Las acciones para verificarlos están en el anexo D.

**Conclusión.** La aplicación está en buen estado para continuar en QA con datos de prueba. **Antes de operar con datos reales en producción** se recomienda cerrar G-01 a G-04, verificar en el entorno real los puntos del anexo D y repetir esta verificación (idealmente con una prueba de penetración externa). Este informe no concede ni aprueba excepciones de seguridad: las excepciones permanentes requieren ADR y decisión del responsable.

---

## 2. Alcance y método

### 2.1 Componentes dentro del alcance

| Componente | Descripción | Dónde se revisó |
|---|---|---|
| SPA | React 18 + Vite + Material UI; token de acceso en memoria; menú y permisos solo como ayuda visual | `frontend/` |
| API | NestJS 11 + REST/OpenAPI; guards globales (límite de tasa, autenticación, autorización); Prisma sobre PostgreSQL | `backend/` |
| Base de datos | PostgreSQL; esquema, migraciones y disparadores de auditoría (ADR-025) | `backend/prisma/` |
| Borde web | NGINX: proxy de `/api`, cabeceras de seguridad, límites, Swagger cerrado | `infrastructure/nginx/`, `frontend/nginx/` |
| Despliegue con contenedores | Docker Compose, imágenes de backend y frontend | `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` |
| QA en Windows Server | Servicio de Windows + NGINX for Windows con HTTPS, PostgreSQL local (ADR-026) | `infrastructure/qa-windows/`, `docs/deployment/qa-windows.md` |
| Pipelines | Azure DevOps | `azure-pipelines/` |
| Documentación de decisiones | ADR-008, 018, 019, 020, 021, 024, 025 y 026; `SECURITY.md`; `AUTHENTICATION.md` | `docs/adr/`, raíz |

### 2.2 Qué se revisó y qué no

**Se revisó:** código fuente y configuración del commit indicado; las pruebas automatizadas que demuestran controles (401, 403, límites, validaciones, aislamiento entre usuarios, inmutabilidad de la bitácora); la documentación de decisiones; el resultado real de `pnpm audit --prod`; las cabeceras por defecto de helmet ejecutando la versión instalada; una búsqueda heurística de secretos en los archivos versionados y en el historial (patrones de claves privadas y tokens conocidos); y un recuento estático de los 206 manejadores de los 38 controladores para confirmar que cada uno declara su política de acceso.

**No se hizo:**
- Pruebas de penetración, pruebas dinámicas (DAST) ni análisis estático automatizado (SAST).
- Comprobaciones sobre servidores reales: TLS y suites de cifrado, cortafuegos y reglas de salida, WAF, bóveda de secretos, permisos de archivos, sincronización horaria, copias de seguridad y su restauración, registros enviados a sistemas externos.
- Auditoría de las dependencias de desarrollo (solo se auditaron las de producción).
- Lectura línea por línea de cada módulo de negocio: se verificaron los mecanismos transversales y se tomaron muestras representativas (clientes, actividad comercial, importaciones, adjuntos, administración de accesos, preferencias).
- La aplicación no se ejecutó completa contra una base de datos en esta verificación; las pruebas de integración citadas se leyeron, no se volvieron a ejecutar.

### 2.3 Cómo se determinó cada estado

La lista de requisitos proviene del archivo oficial del estándar (OWASP ASVS v5.0.0, formato JSON publicado en el repositorio OWASP/ASVS) y se filtró a los de nivel 1 y 2: **253 requisitos** en 17 capítulos. Las descripciones de este informe son resúmenes propios en español; en caso de duda prevalece el texto oficial.

Para cada requisito se buscó la evidencia en el código y la configuración del commit; **no se copió ninguna afirmación de la documentación sin comprobarla**.

| Estado | Significado |
|---|---|
| **Cumple** | Comprobado en el código, la configuración o las pruebas del commit, con la evidencia citada (archivo:línea). |
| **Parcial** | Se cumple en parte, o el cumplimiento depende de configuración que el repositorio no permite comprobar del todo. |
| **No cumple** | El control no existe o contradice el requisito. |
| **No aplica** | La aplicación no tiene la funcionalidad a la que se refiere el requisito (se justifica en cada fila). |
| **No verificable** | Depende de infraestructura o configuración real fuera del repositorio; se indica la acción para verificarlo. |

**Porcentaje de cumplimiento** = requisitos «Cumple» ÷ requisitos aplicables (todos menos «No aplica»). «Parcial» y «No verificable» cuentan como no cumplidos.

**Resultado real de `pnpm audit --prod` (2026-10-15, pnpm 9.12.0, 412 dependencias de producción):** 5 vulnerabilidades, **1 alta, 4 moderadas, 0 críticas**.

| Severidad | Paquete y ruta | Aviso | Corregido en | Alcanzabilidad estimada |
|---|---|---|---|---|
| Alta | `deepmerge-ts` 7.1.5 (backend › @prisma/client › prisma › @prisma/config) | Agotamiento de pila al fusionar grafos recursivos (GHSA-ggr8-5vv4-36mx) | 8.0.0 | Baja: herramienta de configuración de Prisma; no procesa datos de usuarios |
| Moderada | `uuid` 8.3.2 (backend › exceljs) | Falta de comprobación de límites del búfer en v3/v5/v6 (GHSA-w5hq-g745-h8pq) | 11.1.1 | No analizada; dependencia interna de exceljs |
| Moderada | `react-router` 6.30.6 (frontend › react-router-dom) | Redirección abierta con barra invertida en `Link`/`useNavigate` (GHSA-wrjc-x8rr-h8h6) | 7.18.0 | Baja: ningún destino de navegación proviene del usuario (V3.7.2) |
| Moderada | `react-router` 6.30.6 (ídem) | Inyección de constructor en `deserializeErrors()` de la hidratación SSR (GHSA-337j-9hxr-rhxg) | 7.18.0 | No aplica: la aplicación es una SPA sin SSR |
| Moderada | `js-yaml` 5.3.0 (backend › @nestjs/swagger) | `maxTotalMergeKeys` no limita el uso de CPU (GHSA-r3ph-w7gj-g6xm) | 5.4.1 | Baja: Swagger está desactivado en producción |

### 2.4 Limitaciones

- Una autoverificación puede pasar por alto defectos que una persona ajena al equipo sí vería. Por eso se recomienda una prueba de penetración externa antes de producción.
- Los resultados corresponden al commit indicado (código); los commits posteriores serán solo documentación. Un cambio de código posterior exige volver a verificar lo afectado.
- «Cumple» significa que el control existe y está comprobado en el repositorio; no garantiza que el entorno desplegado coincida con él (ver anexo D).

---

## 3. Matriz de verificación por capítulo de ASVS 5.0

Una fila por requisito de nivel 1 o 2. Las rutas son relativas a la raíz del repositorio. Las siglas `G-nn` remiten a la sección 4.1.

### V1 Codificación y saneamiento (Encoding and Sanitization)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V1.1.1 | L2 | La entrada se decodifica a su forma canónica una sola vez y antes de procesarla. | Cumple | Sin decodificación manual en el servidor (búsqueda de decodeURI/unescape/atob en backend/src sin resultados); la validación corre tras el análisis del framework: backend/src/common/filters/validation-exception.factory.ts:51-57. | Única decodificación manual: nombre de archivo de descarga en el cliente (frontend/src/services/api/http-client.ts:241), sin efecto en seguridad. |
| V1.1.2 | L2 | La codificación de salida se aplica como último paso antes del intérprete. | Cumple | React escapa al pintar; JSON lo serializa el framework; CSV/XLSX escapan al generar: backend/src/common/csv.ts:35-44, backend/src/common/xlsx.ts:235-239. |  |
| V1.2.1 | L1 | Codificación de salida según el contexto HTML/atributo/CSS/cabecera. | Cumple | Sin dangerouslySetInnerHTML ni innerHTML en frontend/src (búsqueda sin resultados). Prueba con carga hostil: frontend/src/features/dashboard/components/SafetyMinuteCard.spec.tsx:69; frontend/src/features/admin/safety-minutes/SafetyMinutesPage.spec.tsx:34,121. |  |
| V1.2.2 | L1 | Las URLs construidas con datos no confiables se codifican y solo admiten protocolos seguros. | Cumple | Rutas de API con encodeURIComponent: frontend/src/features/admin/approvals/approvals.api.ts:55, frontend/src/features/admin/parameters/parameters.api.ts:84; navegación solo a rutas internas: frontend/src/routes/pages/LoginPage.tsx:22-36. | Los identificadores se validan además como UUID en el servidor (339 usos de ParseUUIDPipe/IsUUID en backend/src). |
| V1.2.3 | L1 | Sin inyección de JavaScript/JSON al construir contenido dinámico. | Cumple | Sin scripts en línea: CSP script-src 'self' (infrastructure/nginx/conf.d/security-headers.conf:24); frontend/index.html solo carga el módulo de la aplicación. |  |
| V1.2.4 | L1 | Consultas a base de datos parametrizadas o mediante ORM. | Cumple | Prisma; SQL en bruto solo con plantillas parametrizadas; Prisma.raw únicamente con columnas de listas cerradas: backend/src/infrastructure/database/prisma/repositories/prisma-activity.repository.ts:134-142,294; patrones LIKE escapados en backend/src/infrastructure/database/prisma/sql-text.ts:47-50. | Los usos de Prisma.raw revisados reciben constantes o alias validados por expresión regular (p. ej. backend/src/infrastructure/database/prisma/repositories/prisma-customers.repository.ts:47-51). |
| V1.2.5 | L1 | Protección frente a inyección de comandos del sistema operativo. | Cumple | Sin child_process, exec ni spawn en backend/src (búsqueda sin resultados). |  |
| V1.2.6 | L2 | Protección frente a inyección LDAP. | No aplica | La aplicación no usa LDAP. |  |
| V1.2.7 | L2 | Protección frente a inyección XPath. | No aplica | La aplicación no evalúa XPath. |  |
| V1.2.8 | L2 | Procesadores LaTeX configurados de forma segura. | No aplica | La aplicación no usa LaTeX. |  |
| V1.2.9 | L2 | Se escapan los caracteres especiales en expresiones regulares construidas con datos externos. | Cumple | El dato del usuario nunca se interpola en una expresión regular; solo se evalúa contra patrones configurados por un administrador: backend/src/modules/customers/customer-field-rules.ts:22. | Un patrón de país mal diseñado por un administrador podría ser costoso (ReDoS); riesgo bajo, el acceso a ese catálogo es restringido. |
| V1.3.1 | L1 | Sanitizar el HTML que llega de editores WYSIWYG. | No aplica | No hay editores de texto enriquecido; todo texto se muestra como texto. |  |
| V1.3.2 | L1 | Sin eval() ni ejecución dinámica de código. | Cumple | Sin eval, new Function ni document.write en backend/src ni frontend/src (búsqueda sin resultados). |  |
| V1.3.3 | L2 | Los datos que van a un contexto peligroso se sanean antes. | Cumple | Neutralización de fórmulas en CSV/XLSX: backend/src/common/csv.ts:17-33; saneamiento de nombres de archivo: backend/src/modules/attachments/attachment-policy.ts:70-84; el mensaje del minuto de seguridad (visible para todas las sesiones) exige texto plano: sin caracteres de control ni de formato/bidi y con al menos un carácter visible (backend/src/common/dto/plain-text.validator.ts:11-15,27-30; aplicado en backend/src/modules/safety-minutes/dto/safety-minute.dto.ts:47-51,62-66); pruebas backend/src/common/dto/plain-text.validator.spec.ts y backend/test/safety-minutes.e2e.spec.ts:293-311 (400 VALIDATION_FAILED, no 500, y no guarda nada). | Actualizado tras 60573a8: antes solo se recortaba el texto. |
| V1.3.4 | L2 | Validar el SVG subido por usuarios. | No aplica | No se admiten SVG: los tipos permitidos son pdf, jpg, png, docx y xlsx (backend/src/modules/attachments/attachment-content-type.ts:28-35). |  |
| V1.3.5 | L2 | Se sanea o deshabilita el contenido con lenguaje de plantillas o marcado ejecutable aportado por usuarios. | Cumple | Deshabilitado por diseño: los mensajes son texto plano (RN-AJ1.7), con validación en el servidor (backend/src/common/dto/plain-text.validator.ts:27-30) y mostrados como texto; frontend/src/features/dashboard/components/SafetyMinuteCard.spec.tsx:69. |  |
| V1.3.6 | L2 | Protección frente a SSRF. | Cumple | El servidor no realiza llamadas salientes con URLs del usuario (sin fetch/axios en backend/src); el único destino saliente es el JWKS de Entra ID, fijado por configuración (backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:80) y hoy desactivado. |  |
| V1.3.7 | L2 | Protección frente a inyección de plantillas. | No aplica | No hay motor de plantillas en el servidor. |  |
| V1.3.8 | L2 | Saneamiento y configuración segura de JNDI. | No aplica | La aplicación no usa JNDI. |  |
| V1.3.9 | L2 | Saneamiento del contenido enviado a memcache. | No aplica | La aplicación no usa memcache. |  |
| V1.3.10 | L2 | Las cadenas de formato se sanean antes de procesarse. | Cumple | El registro usa JSON.stringify, no cadenas de formato: backend/src/infrastructure/logging/app-logger.service.ts:67-79. |  |
| V1.3.11 | L2 | Saneamiento previo a sistemas de correo (SMTP/IMAP). | No aplica | La aplicación no envía ni lee correo. |  |
| V1.4.1 | L2 | Manejo de memoria seguro (desbordamientos de pila o montón). | No aplica | Lenguaje con memoria gestionada (TypeScript sobre Node.js); sin código nativo propio. |  |
| V1.4.2 | L2 | Validación de signo y rango para evitar desbordamiento de enteros. | Cumple | Importes con precisión exacta: backend/src/common/decimal.ts:72; límites de rango en DTO: backend/src/common/dto/pagination-query.dto.ts:25. |  |
| V1.4.3 | L2 | Liberación de memoria y recursos (referencias colgantes). | No aplica | Memoria gestionada por el entorno de ejecución. |  |
| V1.5.1 | L1 | Los analizadores XML rechazan entidades externas (XXE). | Cumple | La guardia ZIP rechaza cualquier XML con DTD antes de entregarlo a exceljs: backend/src/modules/customer-imports/xlsx-archive-guard.ts:1-25; prueba: backend/src/modules/customer-imports/xlsx-archive-guard.spec.ts:64. |  |
| V1.5.2 | L2 | La deserialización de datos no confiables admite solo tipos permitidos. | Cumple | Solo JSON. Los valores JSON de parámetros se validan con Zod antes de usarse: backend/src/modules/parameters/parameter-rules.registry.ts:570; backend/src/modules/access/ui-settings.service.ts:69. |  |

### V2 Validación y lógica de negocio (Validation and Business Logic)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V2.1.1 | L1 | La documentación define las reglas de validación de entrada. | Cumple | Reglas de negocio numeradas (RN-xx) por módulo en docs/implementation-plans/crm/ y contrato en API-STANDARDS.md y OpenAPI (DTO con class-validator). |  |
| V2.1.2 | L2 | La documentación define la consistencia lógica entre datos combinados. | Cumple | Ej.: teléfono y NIT según el país del cliente (backend/src/modules/customers/customer-field-rules.ts:12-47) y reglas en docs/implementation-plans/crm/02-clientes-cuentas.md. |  |
| V2.1.3 | L2 | Los límites de la lógica de negocio están documentados (por usuario y globales). | Parcial | Límites por funcionalidad documentados (adjuntos, importaciones, exportaciones, paginación); los límites globales de tasa están en .env.example:88-92. | No hay un documento único con todos los límites; consolidarlos en docs/security. |
| V2.2.1 | L1 | Toda entrada se valida contra listas permitidas, patrones y rangos. | Cumple | ValidationPipe global con whitelist, forbidNonWhitelisted y sin conversión implícita: backend/src/common/filters/validation-exception.factory.ts:51-57; activado en backend/src/main.ts:44. Validador propio de texto plano para el mensaje del minuto de seguridad: backend/src/common/dto/plain-text.validator.ts:27-35. |  |
| V2.2.2 | L1 | La validación se aplica en una capa de servicio de confianza. | Cumple | Validación en el servidor (backend/src/main.ts:44); el cliente solo mejora la usabilidad (comentario en frontend/src/stores/auth.store.ts:28-32: la API rechaza igualmente). |  |
| V2.2.3 | L2 | Las combinaciones de datos relacionados son razonables según reglas predefinidas. | Cumple | backend/src/modules/customers/customer-field-rules.ts:34-47 (teléfono según país del cliente); backend/src/modules/customer-imports/import-row-validator.ts. |  |
| V2.3.1 | L1 | Los flujos de negocio se procesan en el orden esperado, sin saltar pasos. | Cumple | Con cambio de contraseña pendiente la API rechaza todo salvo el cambio: backend/src/common/guards/authentication.guard.ts:61-66; prueba backend/test/auth.e2e.spec.ts:317. Máquina de estados de importación: backend/src/modules/customer-imports/import-status.ts. |  |
| V2.3.2 | L2 | Los límites de negocio documentados están implementados. | Cumple | Tope de exportación backend/src/common/csv.ts:58; tamaño de página máximo 100 (backend/src/common/dto/pagination-query.dto.ts:6); límites por operación de importación backend/src/modules/customer-imports/customer-imports.controller.ts:63-65. |  |
| V2.3.3 | L2 | Las operaciones de negocio usan transacciones (todo o nada). | Cumple | Puerto de transacciones backend/src/infrastructure/database/prisma/prisma-transaction.ts; uso en acceso, aprobaciones, adjuntos, auditoría y autenticación (p. ej. backend/src/modules/access/users.service.ts:290-291). |  |
| V2.3.4 | L2 | Bloqueos a nivel de negocio evitan la doble reserva de recursos limitados. | Cumple | Bloqueos consultivos: backend/src/infrastructure/database/prisma/advisory-lock.ts:21-30; secuencias bloqueadas backend/src/infrastructure/database/prisma/prisma-sequence-generator.ts:52; prueba backend/test/customers-concurrency.e2e.spec.ts. Minuto de seguridad: la edición y el borrado se condicionan a la fecha en la propia escritura (carrera de medianoche), con relectura y 409 o 404: backend/src/infrastructure/database/prisma/repositories/prisma-safety-minutes.repository.ts:112-118,127-129; backend/src/modules/safety-minutes/safety-minutes.service.ts:174-177,202-203,217; pruebas backend/src/modules/safety-minutes/safety-minutes.service.spec.ts:172-207; altas simultáneas backend/test/safety-minutes.e2e.spec.ts:421-444. | Actualizado tras 60573a8: se añade la protección de la carrera de medianoche. |
| V2.4.1 | L2 | Controles anti-automatización frente a llamadas excesivas. | Cumple | Límite global 120/min (backend/src/app.module.ts:46-54, backend/src/config/env.schema.ts:65-66); login y cambio de contraseña 10/min por IP (backend/src/modules/auth/auth.controller.ts:32,57,115); importaciones 5-30/min (backend/src/modules/customer-imports/customer-imports.controller.ts:63-65); NGINX 20 peticiones/s (infrastructure/nginx/nginx.conf:68, infrastructure/nginx/conf.d/app.conf:34); bloqueo de cuenta; prueba backend/test/auth.e2e.spec.ts:226. | El contador de Throttler vive en memoria del proceso (no se comparte entre instancias) y limita por IP; tras una red corporativa con una sola IP de salida se comparte el cupo. Ver brecha G-26. |

### V3 Seguridad del frontend web (Web Frontend Security)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V3.2.1 | L1 | El navegador no interpreta contenido en un contexto incorrecto. | Cumple | Las descargas se sirven como attachment con nosniff y no-store: backend/src/modules/attachments/attachment-download.ts:43-49; los adjuntos nunca se sirven como estáticos (infrastructure/nginx/conf.d/app.conf:76-77); la API solo devuelve JSON. |  |
| V3.2.2 | L1 | El texto se muestra con funciones seguras, no como HTML. | Cumple | React escapa por defecto y no hay inserción de HTML; prueba frontend/src/features/dashboard/components/SafetyMinuteCard.spec.tsx:69 (la imagen con onerror se ve como texto). |  |
| V3.3.1 | L1 | Las cookies llevan Secure y el prefijo __Host- o __Secure-. | No cumple | Secure activo salvo en desarrollo (backend/src/modules/auth/refresh-cookie.ts:18) pero el nombre es refresh_token, sin prefijo (backend/src/modules/auth/refresh-cookie.ts:12). | Mitigado por HttpOnly, SameSite=Lax y ruta limitada. Renombrar a __Secure-refresh_token (solo en entornos con HTTPS). Brecha G-18. |
| V3.3.2 | L2 | SameSite adecuado al propósito de cada cookie. | Cumple | SameSite=Lax: backend/src/modules/auth/refresh-cookie.ts:19. |  |
| V3.3.3 | L2 | Las cookies llevan el prefijo __Host-. | No cumple | No se usa; __Host- exige Path=/ y la cookie se limita deliberadamente a la ruta de autenticación (backend/src/modules/auth/refresh-cookie.ts:20). | Conflicto de diseño: se prefirió la ruta restringida. Brecha G-18. |
| V3.3.4 | L2 | Las cookies no legibles por scripts llevan HttpOnly y el valor solo viaja por Set-Cookie. | Cumple | HttpOnly: backend/src/modules/auth/refresh-cookie.ts:16; el refresh token nunca va en el cuerpo de la respuesta: backend/src/modules/auth/auth.controller.ts:144-152. |  |
| V3.4.1 | L1 | Strict-Transport-Security en todas las respuestas, 1 año o más y con subdominios. | Parcial | La API la emite vía helmet (backend/src/main.ts:27; con helmet 8.3.0 instalado el valor por defecto es max-age=31536000; includeSubDomains, comprobado ejecutándolo). En NGINX está comentada (infrastructure/nginx/conf.d/security-headers.conf:16-18), por lo que el SPA y los estáticos no la llevan. | El navegador aplica HSTS por host tras la primera respuesta de la API, pero el requisito pide todas las respuestas. Brecha G-02. |
| V3.4.2 | L1 | Access-Control-Allow-Origin fijo o validado contra una lista de orígenes. | Cumple | Lista blanca desde CORS_ALLOWED_ORIGINS: backend/src/main.ts:29-35, backend/src/config/app-config.service.ts:22-27; sin comodín. | Sin prueba automatizada de las cabeceras CORS (brecha G-16). |
| V3.4.3 | L2 | CSP con object-src 'none', base-uri 'none' y lista permitida, nonces o hashes. | Parcial | infrastructure/nginx/conf.d/security-headers.conf:24: script-src 'self', object-src 'none', frame-ancestors 'none'; pero base-uri 'self' y style-src 'unsafe-inline' (necesario hoy para MUI/Emotion, ADR-009). | Los scripts no admiten ejecución en línea; el riesgo residual es de inyección de estilos. Brecha G-11. |
| V3.4.4 | L2 | X-Content-Type-Options: nosniff en todas las respuestas. | Cumple | infrastructure/nginx/conf.d/security-headers.conf:9 (always, incluida en cada location que define cabeceras propias) y helmet en la API. |  |
| V3.4.5 | L2 | Política de referencia (Referrer-Policy) establecida. | Cumple | infrastructure/nginx/conf.d/security-headers.conf:11. |  |
| V3.4.6 | L2 | frame-ancestors en cada respuesta para impedir el embebido. | Cumple | frame-ancestors 'none': infrastructure/nginx/conf.d/security-headers.conf:24 (también X-Frame-Options DENY, línea 10). |  |
| V3.5.1 | L1 | Las peticiones a funciones sensibles se validan como originadas en la propia aplicación (anti-CSRF). | Parcial | Las funciones protegidas exigen la cabecera Authorization (no es una cabecera segura de CORS): backend/src/common/guards/authentication.guard.ts:43-47. Los endpoints basados en cookie (/auth/refresh y /auth/logout) se apoyan solo en SameSite=Lax. | Exigir una cabecera propia (p. ej. X-Requested-With) en esos dos endpoints. Brecha G-20. |
| V3.5.2 | L1 | Si se depende de la comprobación previa de CORS, no se puede llamar a la función sin dispararla. | Parcial | Igual que V3.5.1: las rutas protegidas requieren Authorization (dispara la comprobación previa); /auth/refresh y /auth/logout aceptan una petición simple con la cookie. | Impacto limitado a rotar o cerrar la sesión; mitigado por SameSite=Lax. Brecha G-20. |
| V3.5.3 | L1 | Las funciones sensibles usan métodos POST, PUT, PATCH o DELETE, no GET/HEAD/OPTIONS. | Cumple | Revisión estática de los 206 manejadores de los 38 controladores (verbo y nombre de la operación): ningún GET invoca operaciones de modificación; las exportaciones son lecturas. |  |
| V3.5.4 | L2 | Aplicaciones distintas se alojan en nombres de host distintos. | Parcial | SPA y API forman una sola aplicación y comparten origen por diseño (infrastructure/nginx/conf.d/app.conf:33,94). En QA el servidor comparte dirección con otra aplicación en IIS (ADR-026) y las cookies no se aíslan por puerto. | Se resuelve al pasar QA a un dominio propio. Brecha G-25. |
| V3.5.5 | L2 | Descartar los mensajes postMessage de origen no confiable. | No aplica | La aplicación no usa postMessage (búsqueda en frontend/src sin resultados). |  |
| V3.7.1 | L2 | Solo tecnologías de cliente vigentes y seguras. | Cumple | SPA React 18 con Vite; sin plugins, Flash ni applets (frontend/package.json). |  |
| V3.7.2 | L2 | Las redirecciones a otros dominios solo van a destinos de una lista permitida. | Cumple | No existen redirecciones externas; el retorno tras el login solo admite rutas internas: frontend/src/routes/pages/LoginPage.tsx:22-36; frontend/src/components/layout/RequireAuth.tsx:33-42 (tras un cierre voluntario ni siquiera se conserva la ruta de retorno; pruebas frontend/src/components/layout/RequireAuth.spec.tsx:38-49). | El aviso moderado de react-router (redirección abierta, G-04) no es alcanzable: ningún destino viene del usuario. |

### V4 API y servicios web (API and Web Service)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V4.1.1 | L1 | Toda respuesta con cuerpo lleva un Content-Type correcto con charset. | Cumple | Express devuelve application/json; charset=utf-8 (comprobado ejecutando express+helmet); las descargas fijan el tipo (backend/src/modules/attachments/attachment-download.ts:47); los estáticos usan mime.types de NGINX. |  |
| V4.1.2 | L2 | Solo los endpoints de uso en navegador redirigen automáticamente de HTTP a HTTPS. | Parcial | En QA el puerto 8080 redirige toda ruta, incluida /api (infrastructure/qa-windows/nginx.conf:81-83). | Debería redirigir solo la interfaz y responder error en /api para detectar clientes mal configurados. Prioridad baja (G-25). |
| V4.1.3 | L2 | Las cabeceras puestas por un intermediario no las puede sobrescribir el usuario. | Parcial | X-Forwarded-For y X-Real-IP se sobrescriben en el borde (infrastructure/nginx/conf.d/app.conf:40-43; infrastructure/qa-windows/nginx.conf:118-120); un solo salto de confianza (backend/src/main.ts:25). En el NGINX de Docker X-Forwarded-Proto se reenvía tal como lo envía el cliente (infrastructure/nginx/nginx.conf:89-93). | En Docker, fijarlo o validarlo; sin efecto actual (la cookie Secure depende de NODE_ENV). Brecha G-25. |
| V4.2.1 | L2 | Los componentes delimitan los mensajes HTTP para impedir contrabando de peticiones. | Parcial | Proxy HTTP/1.1 con Connection vacío hacia la API (infrastructure/nginx/conf.d/app.conf:37,48); NGINX 1.27. | Depende del balanceador o ingress de producción (Azure) y de las versiones; verificar con una prueba de contrabando sobre el entorno real. Brecha G-25. |
| V4.3.1 | L2 | Controles contra DoS en consultas GraphQL. | No aplica | No hay GraphQL. |  |
| V4.3.2 | L2 | Introspección GraphQL desactivada en producción. | No aplica | No hay GraphQL. |  |
| V4.4.1 | L1 | WebSocket sobre TLS. | No aplica | No hay WebSocket. |  |
| V4.4.2 | L2 | Origen comprobado en el apretón de manos WebSocket. | No aplica | No hay WebSocket. |  |
| V4.4.3 | L2 | Tokens dedicados para WebSocket si no se usa la sesión estándar. | No aplica | No hay WebSocket. |  |
| V4.4.4 | L2 | Tokens WebSocket obtenidos desde una sesión HTTPS autenticada. | No aplica | No hay WebSocket. |  |

### V5 Manejo de archivos (File Handling)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V5.1.1 | L2 | La documentación define tipos, extensiones y tamaño máximo de cada subida y cómo se actúa ante un archivo malicioso. | Parcial | ADR-021 y los parámetros crm.adjuntos.* fijan tipos y tamaño; la política de rechazo está en el código (backend/src/modules/attachments/attachments.service.ts:125-149). | No se documenta qué ocurre si se detecta malware porque no hay análisis (V5.4.3). Brecha G-08. |
| V5.2.1 | L1 | Solo se aceptan archivos de un tamaño procesable sin degradar el servicio. | Cumple | Límite en Multer backend/src/modules/attachments/attachment-upload.interceptor.ts:35,117; corte en streaming backend/src/modules/attachments/attachments.service.ts:138-141; NGINX 11 MB (infrastructure/nginx/conf.d/app.conf:70-73). |  |
| V5.2.2 | L1 | La extensión coincide y el contenido corresponde al tipo (firma, estructura). | Cumple | Extensión permitida + firma real (PDF, PNG, JPEG, estructura OOXML): backend/src/modules/attachments/attachment-content-type.ts:62-147; importaciones: backend/src/modules/customer-imports/file-signature.ts:53-65. |  |
| V5.2.3 | L2 | Los archivos comprimidos se comprueban (tamaño descomprimido y número de entradas). | Cumple | Guardia ZIP: máx. 100 entradas, 64 MB descomprimidos, razón 100:1, sin ZIP64 ni cifrado: backend/src/modules/customer-imports/xlsx-archive-guard.ts:36-44; pruebas backend/src/modules/customer-imports/xlsx-archive-guard.spec.ts:39-72. | Los DOCX/XLSX adjuntos nunca se abren en el servidor (solo se almacenan y descargan). |
| V5.3.1 | L1 | Los archivos subidos no se ejecutan como código en el servidor. | Cumple | Almacenamiento fuera de la raíz web, nunca servido como estático (infrastructure/nginx/conf.d/app.conf:76-77; ADR-021); permisos 0640 (backend/src/infrastructure/storage/local-file-system.storage.ts:27-28). |  |
| V5.3.2 | L1 | Las rutas de archivo se generan con datos internos, no con nombres del usuario. | Cumple | Clave <año>/<mes>/<uuid> generada por el servidor (backend/src/modules/attachments/attachment-policy.ts:96-100); comprobación de contención y de enlaces simbólicos: backend/src/infrastructure/storage/local-file-system.storage.ts:159-181. |  |
| V5.4.1 | L2 | Se validan o ignoran los nombres de archivo del usuario y se fija Content-Disposition. | Cumple | Nombre saneado solo para mostrar (backend/src/modules/attachments/attachment-policy.ts:70-84); siempre attachment: backend/src/modules/attachments/attachment-download.ts:17-23. |  |
| V5.4.2 | L2 | Los nombres de archivo servidos se codifican (RFC 6266). | Cumple | filename ASCII de respaldo + filename* RFC 5987: backend/src/modules/attachments/attachment-download.ts:17-23; pruebas backend/src/modules/attachments/attachment-download.spec.ts:10-27. |  |
| V5.4.3 | L2 | Los archivos de fuentes no confiables se analizan con antivirus. | No cumple | No existe análisis antivirus en la subida ni en la descarga (ADR-021 no lo prevé). | Brecha G-08. |

### V6 Autenticación (Authentication)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V6.1.1 | L1 | La documentación define cómo se combaten fuerza bruta y relleno de credenciales y evita el bloqueo malicioso de cuentas. | Parcial | Decisión D8 (5 intentos, 15 minutos) y respuesta idéntica en cuerpo y tiempo: docs/implementation-plans/PLAN-AUTH-LOCAL.md:45,86; ADR-019. | No analiza el riesgo de bloqueo malicioso (un atacante puede bloquear cuentas ajenas a propósito; el bloqueo dura solo 15 minutos y se levanta con el restablecimiento del administrador). Documentarlo. |
| V6.1.2 | L2 | Existe una lista documentada de palabras de contexto prohibidas en contraseñas. | Parcial | La lista corta incluye nombre de producto y organización (backend/src/modules/auth/common-passwords.ts:15-34) y se rechaza la parte local del correo (backend/src/modules/auth/password.service.ts:151-156). | No hay un documento con la lista de contexto. Brecha G-07. |
| V6.1.3 | L2 | Si hay varias vías de autenticación, están documentadas con sus controles. | Cumple | AUTHENTICATION.md §1-2, ADR-006 y ADR-019: local o Entra ID por configuración; el modo híbrido no está habilitado (backend/src/infrastructure/authentication/authentication.module.ts:26-29). |  |
| V6.2.1 | L1 | Contraseñas de al menos 8 caracteres (se recomiendan 15). | Cumple | Mínimo 12: backend/src/modules/auth/password.service.ts:40, 129-131. |  |
| V6.2.2 | L1 | Los usuarios pueden cambiar su contraseña. | Cumple | POST /auth/password/change: backend/src/modules/auth/auth.controller.ts:112-142; interfaz frontend/src/routes/pages/ChangePasswordPage.tsx. |  |
| V6.2.3 | L1 | El cambio exige la contraseña actual y la nueva. | Cumple | backend/src/modules/auth/dto/change-password.dto.ts; verificación de la actual en backend/src/modules/auth/auth.service.ts:186-215; prueba backend/test/auth.e2e.spec.ts:355. |  |
| V6.2.4 | L1 | Las contraseñas se comparan con las 3000 más comunes que cumplan la política. | No cumple | La lista bloqueada tiene solo 19 entradas (backend/src/modules/auth/common-passwords.ts:15-34); el propio archivo reconoce que no es exhaustiva. | Incumple un requisito de nivel 1. Brecha G-07. |
| V6.2.5 | L1 | Se permite cualquier composición de caracteres, sin reglas de mayúsculas o símbolos. | Cumple | backend/src/modules/auth/password.service.ts:115-125 (decisión D6) y 126-159: solo longitud y listas negras. |  |
| V6.2.6 | L1 | Los campos de contraseña usan type=password. | Cumple | frontend/src/features/auth/PasswordField.tsx (type password por defecto; alternable a texto por el usuario). |  |
| V6.2.7 | L1 | Se permite pegar y usar gestores de contraseñas. | Cumple | autoComplete correcto en frontend/src/routes/pages/LoginPage.tsx:78,101 y frontend/src/routes/pages/ChangePasswordPage.tsx:119-142; sin manejadores onPaste en frontend/src. |  |
| V6.2.8 | L1 | La contraseña se verifica exactamente como se recibió. | Cumple | backend/src/modules/auth/password.service.ts:81-87 (sin recortes ni cambio de mayúsculas); el DTO no transforma el valor (backend/src/modules/auth/dto/login.dto.ts); prueba backend/src/modules/auth/password.service.spec.ts:41. |  |
| V6.2.9 | L2 | Se permiten contraseñas de al menos 64 caracteres. | Cumple | Máximo 128 (backend/src/modules/auth/password.service.ts:47; backend/src/modules/auth/dto/login.dto.ts). |  |
| V6.2.10 | L2 | La contraseña no caduca por tiempo. | Cumple | Caducidad desactivada por defecto: valor 0 sembrado en backend/prisma/seed/access-catalog.ts:347-349; decisión D10 en docs/implementation-plans/PLAN-AUTH-LOCAL.md:47. | El parámetro puede activarse hasta 365 días: confirmar que vale 0 en cada entorno. |
| V6.2.11 | L2 | La lista de palabras de contexto se usa para impedir contraseñas fáciles. | Parcial | Aplicada solo a la lista corta y a la parte local del correo (backend/src/modules/auth/password.service.ts:141-156). | Ampliar con el nombre de la empresa, producto y términos del sector (G-07). |
| V6.2.12 | L2 | Las contraseñas se comparan con un conjunto de contraseñas filtradas. | No cumple | No hay consulta a una base de contraseñas comprometidas; el archivo propone la API de rangos con k-anonimato y exigiría un ADR (backend/src/modules/auth/common-passwords.ts:10-13). | Brecha G-07. |
| V6.3.1 | L1 | Los controles contra fuerza bruta están implementados según la documentación. | Cumple | Bloqueo atómico por intento: backend/src/modules/auth/lockout.service.ts:26-57; límite por IP backend/src/modules/auth/auth.controller.ts:32,57; pruebas backend/test/auth.e2e.spec.ts:180,194,226. |  |
| V6.3.2 | L1 | No existen cuentas predeterminadas (root, admin, sa) o están deshabilitadas. | Parcial | La semilla crea la cuenta administradora con el correo por defecto admin@example.com si no se configura otro (backend/prisma/seed.ts:63); sin SEED_ADMIN_PASSWORD queda sin credencial y no puede entrar (backend/prisma/seed.ts:67). | Exigir SEED_ADMIN_EMAIL en producción. Brecha G-24. |
| V6.3.3 | L2 | Se exige MFA o una combinación de factores para acceder. | No cumple | Autenticación local con un solo factor (contraseña); ADR-019:85 y PLAN-AUTH-LOCAL.md:26,206 lo declaran y lo posponen a Entra ID. | Brecha G-03; riesgo aceptado temporal para QA (sección 5). |
| V6.3.4 | L2 | No hay vías de autenticación no documentadas y los controles son coherentes. | Cumple | Vía única activa (local): backend/src/infrastructure/authentication/authentication.module.ts:21-33; las rutas públicas son solo login, refresh, logout y salud (backend/src/modules/auth/auth.controller.ts:56,77,103; backend/src/modules/health/health.controller.ts:18,27). |  |
| V6.4.1 | L1 | Las contraseñas iniciales son aleatorias, siguen la política y caducan o se invalidan tras el primer uso. | No cumple | Todos los usuarios nuevos y restablecidos reciben la misma contraseña fija de AUTH_DEFAULT_PASSWORD, sin caducidad (backend/src/modules/auth/initial-credential.service.ts:29-42); el administrador inicial queda exento de la política (backend/prisma/seed.ts:66). Se obliga a cambiarla al entrar (backend/src/common/guards/authentication.guard.ts:61-66). | Quien conozca esa contraseña y un correo puede tomar cualquier cuenta que aún no haya completado su primer acceso. Brecha G-01. |
| V6.4.2 | L1 | No existen pistas de contraseña ni preguntas secretas. | Cumple | Ninguna en el modelo de credenciales (backend/prisma/schema.prisma:258-276) ni en la interfaz (frontend/src/routes/pages/LoginPage.tsx:18). |  |
| V6.4.3 | L2 | El restablecimiento de contraseña olvidada es seguro y no evade el MFA. | Parcial | No hay autoservicio; solo el administrador restablece (backend/src/modules/auth/auth.service.ts:246-281, ADR-020) y revoca las sesiones del usuario. El restablecimiento usa la contraseña inicial compartida (V6.4.1). | Depende de cerrar G-01. |
| V6.4.4 | L2 | Si se pierde un factor MFA, se verifica la identidad al mismo nivel que en el alta. | No aplica | No hay MFA. |  |
| V6.5.1 | L2 | Códigos de un solo uso solo utilizables una vez. | No aplica | No hay códigos de recuperación, OOB ni TOTP. |  |
| V6.5.2 | L2 | Secretos de búsqueda con poca entropía se almacenan con hash y sal. | No aplica | No hay secretos de búsqueda (lookup secrets). |  |
| V6.5.3 | L2 | Códigos OOB/TOTP generados con CSPRNG. | No aplica | No hay códigos OOB ni TOTP. |  |
| V6.5.4 | L2 | Entropía mínima de 20 bits en códigos OOB. | No aplica | No hay códigos OOB. |  |
| V6.5.5 | L2 | Vida definida para solicitudes OOB y TOTP. | No aplica | No hay OOB ni TOTP. |  |
| V6.6.1 | L2 | SMS/telefonía para OTP solo con número validado y alternativas. | No aplica | No se usan SMS ni llamadas. |  |
| V6.6.2 | L2 | Códigos OOB ligados a la solicitud original. | No aplica | No hay OOB. |  |
| V6.6.3 | L2 | Códigos OOB protegidos contra fuerza bruta. | No aplica | No hay OOB. |  |
| V6.8.1 | L2 | Con varios proveedores de identidad no se puede suplantar la identidad vía otro proveedor. | No aplica | Solo hay un proveedor activo; el modo híbrido está bloqueado. La resolución ya separa proveedores por espacio de nombres (backend/src/modules/access/access.service.ts:96-98). | Revisar al habilitar Entra ID (G-23). |
| V6.8.2 | L2 | Se valida siempre la presencia e integridad de la firma de los tokens. | Cumple | jwtVerify con clave y emisor/audiencia: backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:31-35; proveedor Entra: backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:35-38; prueba backend/src/modules/auth/token.service.spec.ts:87. |  |
| V6.8.3 | L2 | Aserciones SAML de un solo uso. | No aplica | No se usa SAML. |  |
| V6.8.4 | L2 | Se verifica la fuerza/recencia de autenticación que informa el proveedor. | No aplica | Entra ID no está activo en el despliegue actual. |  |

### V7 Gestión de sesiones (Session Management)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V7.1.1 | L2 | El tiempo de inactividad y la vida absoluta de la sesión están documentados y justificados. | Parcial | Vida del access token 15 min y de la sesión 8 h absolutas: docs/implementation-plans/PLAN-AUTH-LOCAL.md:39; backend/src/config/env.schema.ts:34,37. | No hay tiempo de inactividad definido ni justificación frente a NIST SP 800-63B. Brecha G-05. |
| V7.1.2 | L2 | Está documentado cuántas sesiones paralelas se permiten y qué hacer al alcanzar el máximo. | No cumple | No hay límite ni documentación: cada login crea una sesión nueva (backend/src/modules/auth/session.service.ts:74-83). | Brecha G-05. |
| V7.1.3 | L2 | Sistemas de sesión federados documentados. | No aplica | No hay federación activa. |  |
| V7.2.1 | L1 | La verificación de tokens de sesión la hace un servicio de confianza en el servidor. | Cumple | Access token verificado por la API en cada petición (backend/src/common/guards/authentication.guard.ts:49-50); el refresh token se valida contra la base (backend/src/modules/auth/session.service.ts:85-118). |  |
| V7.2.2 | L1 | Se usan tokens dinámicos, no claves estáticas de API. | Cumple | Access token firmado con jti y caducidad (backend/src/modules/auth/token.service.ts:60-69); refresh token aleatorio (backend/src/modules/auth/session.service.ts:167-169). |  |
| V7.2.3 | L1 | Los tokens de referencia son únicos, CSPRNG y de al menos 128 bits. | Cumple | randomBytes(32) = 256 bits (backend/src/modules/auth/session.service.ts:36,167-169); prueba backend/src/modules/auth/session.service.spec.ts:126. |  |
| V7.2.4 | L1 | Se genera un token nuevo al autenticar y se termina el anterior. | Cumple | Cada login, cada refresh (rotación) y cada cambio de contraseña emiten sesión nueva y revocan la anterior (backend/src/modules/auth/session.service.ts:103-117; backend/src/modules/auth/auth.service.ts:231); prueba backend/test/auth.e2e.spec.ts:242. |  |
| V7.3.1 | L2 | Existe un tiempo de inactividad tras el cual se exige reautenticar. | No cumple | No hay control de inactividad: mientras la pestaña esté abierta el cliente renueva el token automáticamente (frontend/src/services/auth/local-auth.provider.ts:195-204), de modo que una sesión inactiva dura hasta 8 horas. | Brecha G-05. |
| V7.3.2 | L2 | Existe una vida absoluta máxima de sesión. | Cumple | 8 h por defecto (backend/src/config/env.schema.ts:37); la rotación no la alarga (backend/src/modules/auth/session.service.ts:106); prueba backend/src/modules/auth/session.service.spec.ts:136,165. |  |
| V7.4.1 | L1 | Terminada la sesión (logout o caducidad) no se puede seguir usando. | Parcial | Logout revoca el refresh token en base (backend/src/modules/auth/session.service.ts:121-126; prueba backend/test/auth.e2e.spec.ts:296). El access token (JWT sin estado) sigue válido hasta 15 minutos: no hay lista de revocación. | Brecha G-06. |
| V7.4.2 | L1 | Al deshabilitar o eliminar una cuenta se terminan todas sus sesiones. | Cumple | La suspensión revoca todas las sesiones (backend/src/modules/access/users.service.ts:296), el refresh falla (backend/src/modules/auth/auth.service.ts:168-173; prueba backend/test/auth.e2e.spec.ts:285) y una cuenta suspendida no recibe permisos (backend/src/modules/access/access.service.ts:100-101). | Ventana residual de hasta 15 minutos solo en endpoints de autoservicio con el access token ya emitido (G-06). |
| V7.4.3 | L2 | Tras cambiar un factor se ofrece terminar las demás sesiones. | Cumple | El cambio de contraseña revoca todas las sesiones automáticamente y emite una nueva (backend/src/modules/auth/auth.service.ts:231); prueba backend/test/auth.e2e.spec.ts:386. |  |
| V7.4.4 | L2 | Todas las páginas autenticadas tienen acceso visible al cierre de sesión. | Cumple | Menú de usuario en la barra superior común: frontend/src/components/layout/Topbar.tsx:116-124; también en la pantalla de cambio de contraseña (frontend/src/routes/pages/ChangePasswordPage.tsx:42). |  |
| V7.4.5 | L2 | Los administradores pueden terminar las sesiones de un usuario o de todos. | Parcial | Indirecto: suspender o restablecer la contraseña revoca todas las sesiones del usuario (backend/src/modules/access/users.service.ts:296; backend/src/modules/auth/auth.service.ts:269). No hay función para terminar sesiones sin otro efecto ni para todos los usuarios. | Brecha G-06. |
| V7.5.1 | L2 | Se exige reautenticación completa antes de modificar atributos sensibles de la cuenta. | Parcial | El cambio de contraseña exige la actual (backend/src/modules/auth/auth.service.ts:186-215). Los usuarios no cambian su correo; las acciones del administrador sobre cuentas solo exigen sesión válida. | Valorar reautenticación para acciones críticas de administración (G-06). |
| V7.5.2 | L2 | Los usuarios pueden ver y terminar sus sesiones activas. | No cumple | No existe esa funcionalidad (la tabla user_sessions guarda dispositivo e IP pero no se expone). | Brecha G-06. |
| V7.6.1 | L2 | Vida de sesión coordinada entre aplicación y proveedor de identidad. | No aplica | No hay federación activa. |  |
| V7.6.2 | L2 | Crear una sesión exige acción explícita del usuario. | Cumple | Las sesiones nacen solo en POST /auth/login con credenciales (backend/src/modules/auth/auth.controller.ts:55-74). |  |

### V8 Autorización (Authorization)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V8.1.1 | L1 | La documentación define reglas de acceso por función y por dato. | Cumple | ADR-008, ADR-018 y ADR-020; alcance de datos (propio, equipo, país, organización) en docs/implementation-plans/crm/00-modelo-de-datos.md §4 y backend/src/modules/access/visibility-scope.ts:1-20. |  |
| V8.1.2 | L2 | La documentación define restricciones de acceso por campo. | Parcial | Reglas por estado y por rol en los planes de cada módulo (p. ej. proyectos bloqueados, ADR-020 para cambios de acceso); no hay una matriz general de campos. | Brecha G-28. |
| V8.2.1 | L1 | El acceso a funciones se limita a consumidores con permisos explícitos. | Cumple | Deny-by-default: backend/src/common/guards/permissions.guard.ts:90-96; guards globales backend/src/app.module.ts:91-93; los 206 manejadores declaran permiso (180 RequirePermission, 12 RequireAnyPermission, 9 AuthenticatedOnly, 5 Public justificados); prueba backend/src/common/guards/permissions.guard.spec.ts:127. |  |
| V8.2.2 | L1 | El acceso a datos se limita a quien tiene permiso sobre cada elemento (IDOR/BOLA). | Cumple | Alcances de visibilidad aplicados en consulta: backend/src/modules/access/visibility-scope.ts; pruebas backend/test/customers-visibility.e2e.spec.ts:43-141 (mismo 404 para inexistente, fuera de alcance y borrado), backend/test/commercial-activity-security.e2e.spec.ts:136-225, backend/test/me-settings.e2e.spec.ts:77 (sin {userId} en la ruta). |  |
| V8.2.3 | L2 | El acceso a campos se limita a quien tiene permiso sobre campos concretos (BOPLA). | Parcial | Las escrituras solo aceptan campos declarados (backend/src/common/filters/validation-exception.factory.ts:51-57); las respuestas usan DTO específicos; los cambios que otorgan acceso (roles, país, equipos) son exclusivos del administrador (ADR-020). | No hay permisos por campo; el control depende de DTO por caso de uso. |
| V8.3.1 | L1 | La autorización se aplica en el servidor, no en el cliente. | Cumple | Guards en la API (backend/src/common/guards/permissions.guard.ts); el menú y botones del cliente son solo ayuda visual; los permisos salen de la base, no del token (backend/src/modules/auth/token.service.ts:17-20). |  |
| V8.4.1 | L2 | Controles entre inquilinos en aplicaciones multi-inquilino. | No aplica | Aplicación de una sola organización; país y equipo son alcances de datos, no inquilinos. |  |

### V9 Tokens autocontenidos (Self-contained Tokens)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V9.1.1 | L1 | Los tokens autocontenidos se validan por firma o MAC antes de aceptarse. | Cumple | backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:31-35 (jose.jwtVerify); prueba backend/src/modules/auth/token.service.spec.ts:87. |  |
| V9.1.2 | L1 | Solo algoritmos de una lista permitida, sin 'none'. | Parcial | jose limita los algoritmos según el tipo de clave (HMAC con clave simétrica; 'none' no se acepta), pero la lista no se declara en la verificación (backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:31-35; backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:35-38). | Declarar algorithms: ['HS256'] (local) y ['RS256'] (Entra). Brecha G-19. |
| V9.1.3 | L1 | El material de claves proviene de fuentes preconfiguradas y de confianza. | Cumple | Clave de la configuración (backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:24); JWKS desde URL configurada, sin aceptar jku/jwk del token (backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:80). |  |
| V9.2.1 | L1 | Se verifican nbf y exp. | Cumple | jwtVerify valida exp y nbf (tolerancia 60 s): backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:31-35; emisión con nbf/exp: backend/src/modules/auth/token.service.ts:66-67. | No hay prueba de un token ya caducado (G-16). |
| V9.2.2 | L2 | El servicio valida que el token sea del tipo correcto. | Cumple | Solo se aceptan access tokens JWT; el refresh token es opaco y no se confunde con un JWT (backend/src/modules/auth/session.service.ts:39). Un token con cambio de contraseña pendiente solo sirve para ese cambio (backend/src/common/guards/authentication.guard.ts:61-66). |  |
| V9.2.3 | L2 | Solo se aceptan tokens destinados al servicio (audiencia). | Cumple | aud validada: backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:33; prueba backend/src/modules/auth/token.service.spec.ts:97. |  |
| V9.2.4 | L2 | Con una misma clave para varias audiencias, el token lleva la audiencia. | Cumple | Una sola audiencia y siempre presente en el token (backend/src/modules/auth/token.service.ts:64). |  |

### V10 OAuth y OIDC (OAuth and OIDC)

> El despliegue actual usa autenticación local (`AUTH_PROVIDER=local`); Entra ID no está activo y `EntraAuthProvider` del cliente es un esqueleto. Los requisitos de servidor de autorización, proveedor OpenID y cliente OIDC se marcan `No aplica` y deben **verificarse de nuevo al habilitar Entra ID** (ADR-007). Los requisitos de refresh token (V10.4.5, V10.4.8, V10.4.9) se evalúan por analogía sobre la emisión local de sesiones.

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V10.1.1 | L2 | Los tokens solo se envían a componentes que los necesitan. | Cumple | El access token vive solo en memoria y va a la API del mismo origen (frontend/src/services/auth/local-auth.provider.ts:18-20; frontend/src/services/api/http-client.ts:120,136); el refresh token es HttpOnly y no lo ve ningún script. |  |
| V10.1.2 | L2 | El cliente solo acepta valores de flujos iniciados por la misma sesión. | No aplica | No hay cliente OAuth/OIDC activo: EntraAuthProvider es un esqueleto sin MSAL (frontend/src/services/auth/entra-auth.provider.ts:8-15). | Re-verificar al habilitar Entra ID (ADR-007). |
| V10.2.1 | L2 | Protección CSRF/PKCE en el flujo de código del cliente OAuth. | No aplica | Sin cliente OAuth activo. | Re-verificar al habilitar Entra ID. |
| V10.2.2 | L2 | Defensa contra ataques de confusión de servidores de autorización. | No aplica | Sin cliente OAuth activo. |  |
| V10.3.1 | L2 | El servidor de recursos solo acepta tokens destinados a él (audiencia). | Cumple | Local: backend/src/infrastructure/authentication/providers/local-authentication.provider.ts:33; Entra (inactivo): backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:37. |  |
| V10.3.2 | L2 | Las decisiones de autorización usan las reclamaciones de autorización delegada. | Cumple | La identidad (sub) se resuelve a cuenta local y sus permisos salen de la base (backend/src/infrastructure/authentication/providers/database-permission.resolver.ts:23-31); el token no lleva permisos. |  |
| V10.3.3 | L2 | El usuario se identifica con reclamaciones no reasignables (iss + sub). | Parcial | Local: sub = identificador interno e issuer validado. Para tokens sin vínculo previo existe un respaldo por correo (backend/src/modules/access/access.service.ts:104-114), inadecuado para Entra (correo reasignable). | Eliminar o acotar el respaldo por correo al habilitar Entra. Brecha G-23. |
| V10.3.4 | L2 | El servidor de recursos verifica fuerza/recencia de autenticación (acr, amr, auth_time). | No aplica | Entra ID no está activo. |  |
| V10.4.1 | L1 | Validación de redirect URI con lista exacta. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.2 | L1 | Código de autorización de un solo uso. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.3 | L1 | Código de autorización de vida corta. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.4 | L1 | Solo las concesiones (grants) necesarias; sin implícita ni de contraseña. | No aplica | La aplicación no implementa OAuth; su inicio de sesión local es propio. |  |
| V10.4.5 | L1 | Mitigación de la repetición de refresh tokens: rotación e invalidación. | Cumple | Aplicado por analogía a la emisión local de sesiones: cada uso rota el token y reutilizar uno viejo revoca todas las sesiones (backend/src/modules/auth/session.service.ts:85-160); pruebas backend/src/modules/auth/session.service.spec.ts:216-260 y backend/test/auth.e2e.spec.ts:255. |  |
| V10.4.6 | L2 | PKCE obligatorio con el flujo de código. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.7 | L2 | Registro dinámico de clientes no autenticado. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.8 | L2 | Los refresh tokens tienen caducidad absoluta. | Cumple | Aplicado por analogía: 8 h desde el login, sin deslizamiento (backend/src/modules/auth/session.service.ts:75,106). |  |
| V10.4.9 | L2 | Los refresh tokens pueden ser revocados por un usuario autorizado desde la interfaz. | Parcial | Aplicado por analogía: el logout revoca la sesión actual; no hay pantalla para revocar otras sesiones ni las de un tercero salvo suspender o restablecer. | Brecha G-06. |
| V10.4.10 | L2 | Autenticación del cliente confidencial ante el servidor de autorización. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.4.11 | L2 | Solo los alcances (scopes) necesarios para el cliente. | No aplica | La aplicación no es servidor de autorización OAuth. |  |
| V10.5.1 | L2 | Mitigación de repetición del ID Token (nonce). | No aplica | Sin cliente OIDC activo. | Re-verificar al habilitar Entra ID. |
| V10.5.2 | L2 | El cliente identifica al usuario por sub. | No aplica | Sin cliente OIDC activo. |  |
| V10.5.3 | L2 | Rechazo de metadatos de un servidor de autorización que suplanta a otro. | No aplica | Sin cliente OIDC activo. |  |
| V10.5.4 | L2 | El ID Token está destinado a este cliente (aud = client_id). | No aplica | Sin cliente OIDC activo. |  |
| V10.5.5 | L2 | Cierre de sesión por canal trasero OIDC seguro. | No aplica | Sin cliente OIDC activo. |  |
| V10.6.1 | L2 | El proveedor OpenID solo admite modos de respuesta seguros. | No aplica | La aplicación no es proveedor OpenID. |  |
| V10.6.2 | L2 | El proveedor OpenID mitiga el cierre de sesión forzado. | No aplica | La aplicación no es proveedor OpenID. |  |
| V10.7.1 | L2 | El servidor de autorización obtiene consentimiento por solicitud. | No aplica | La aplicación no es servidor de autorización. |  |
| V10.7.2 | L2 | El consentimiento presenta información clara. | No aplica | La aplicación no es servidor de autorización. |  |
| V10.7.3 | L2 | El usuario puede revisar y revocar consentimientos. | No aplica | La aplicación no es servidor de autorización. |  |

### V11 Criptografía (Cryptography)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V11.1.1 | L2 | Existe una política documentada de gestión de claves y su ciclo de vida. | Parcial | SECURITY.md §4 exige rotar un secreto expuesto y no commitear secretos; no define ciclo de vida (generación, rotación periódica, destrucción) ni quién custodia cada clave. | Brecha G-27. |
| V11.1.2 | L2 | Existe un inventario criptográfico mantenido (claves, algoritmos, certificados). | Parcial | No existía; el anexo B de este informe es un inventario provisional. | Mantenerlo como documento vivo en docs/security (G-27). |
| V11.2.1 | L2 | Se usan implementaciones criptográficas validadas por la industria. | Cumple | argon2, jose y node:crypto (backend/package.json:35,40); sin criptografía propia. |  |
| V11.2.2 | L2 | Agilidad criptográfica: se pueden cambiar algoritmos, longitudes y claves. | Parcial | Los hashes de contraseña se migran de forma transparente al cambiar parámetros (backend/src/modules/auth/password.service.ts:106-113; columna algorithm en backend/prisma/schema.prisma:263). El JWT usa una sola clave sin identificador (kid): rotarla invalida todos los tokens. | Aceptable para tokens de 15 min; documentar el procedimiento de rotación (G-27). |
| V11.2.3 | L2 | Todos los primitivos ofrecen al menos 128 bits de seguridad. | Cumple | Argon2id; HS256 con clave de al menos 256 bits (backend/src/modules/auth/token.service.ts:26,78-83); SHA-256 para el hash del refresh token (backend/src/modules/auth/session.service.ts:163-165). |  |
| V11.3.1 | L1 | No se usan modos de bloque inseguros ni rellenos débiles. | No aplica | La aplicación no cifra datos por sí misma (búsqueda de createCipher/aes en backend/src y frontend/src sin resultados). | El cifrado en reposo de la base y los respaldos es responsabilidad de la infraestructura (ver V14). |
| V11.3.2 | L1 | Solo cifrados y modos aprobados (p. ej. AES-GCM). | No aplica | La aplicación no cifra datos por sí misma. |  |
| V11.3.3 | L2 | Los datos cifrados se protegen contra modificación (cifrado autenticado). | No aplica | La aplicación no cifra datos por sí misma. |  |
| V11.4.1 | L1 | Solo funciones hash aprobadas; sin MD5. | Cumple | Solo SHA-256 (backend/src/modules/auth/session.service.ts:164; backend/src/infrastructure/storage/local-file-system.storage.ts:89); sin md5/sha1 en backend/src. |  |
| V11.4.2 | L2 | Las contraseñas se almacenan con una función de derivación de claves costosa y bien parametrizada. | Cumple | Argon2id, 19 MiB, 2 iteraciones, paralelismo 1 (mínimos vigentes de OWASP): backend/src/modules/auth/password.service.ts:23-28; prueba backend/src/modules/auth/password.service.spec.ts:31. |  |
| V11.4.3 | L2 | Los hash de integridad son resistentes a colisiones con longitud adecuada. | Cumple | SHA-256 (256 bits): backend/src/modules/auth/session.service.ts:163-165; suma de verificación de adjuntos backend/src/infrastructure/storage/local-file-system.storage.ts:89. |  |
| V11.4.4 | L2 | KDF con estiramiento al derivar claves a partir de contraseñas. | No aplica | No se derivan claves criptográficas a partir de contraseñas. |  |
| V11.5.1 | L2 | Los valores no adivinables usan CSPRNG con al menos 128 bits. | Cumple | Refresh token: randomBytes(32) (backend/src/modules/auth/session.service.ts:167-169). Los UUID (jti, claves de adjuntos, correlation ID) no se usan como secreto: el acceso siempre exige autorización. |  |
| V11.6.1 | L2 | Algoritmos aprobados en generación de claves y firmas de clave pública. | No aplica | La aplicación no genera claves públicas; verifica firmas con jose y el certificado TLS lo genera la operación. |  |

### V12 Comunicación segura (Secure Communication)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V12.1.1 | L1 | Solo versiones recomendadas de TLS, con la más reciente preferida. | Parcial | QA: ssl_protocols TLSv1.2 TLSv1.3 (infrastructure/qa-windows/nginx.conf:94). El NGINX de Docker no termina TLS (lo hace el ingress de la plataforma, infrastructure/nginx/nginx.conf:8-12). | La configuración de producción no está en el repositorio: verificar con testssl.sh o equivalente. Brecha G-02. |
| V12.1.2 | L2 | Solo suites de cifrado recomendadas, con las más fuertes preferidas. | No verificable | El NGINX de QA no fija ssl_ciphers (infrastructure/qa-windows/nginx.conf:94-96): usa los valores por defecto de la versión instalada. | Verificar con testssl.sh sobre QA y sobre el ingress de producción. Brecha G-02. |
| V12.1.3 | L2 | Validación de certificados de cliente mTLS. | No aplica | No se usa mTLS. |  |
| V12.2.1 | L1 | TLS en toda conexión cliente-servicio externo, sin retroceso a texto claro. | Parcial | QA: 443 con TLS y el 8080 solo redirige (infrastructure/qa-windows/nginx.conf:73-84,87). Docker Compose publica solo el puerto 80 sin TLS (docker-compose.yml:104-105). | Producción depende del ingress: verificar. Brecha G-02. |
| V12.2.2 | L1 | Los servicios expuestos usan certificados de confianza pública. | No cumple | QA usa un certificado autofirmado o de la CA interna y el navegador muestra aviso (ADR-026, infrastructure/qa-windows/nginx.conf:90-93). | Riesgo aceptado temporal en QA hasta tener dominio. Para producción: verificar. Brecha G-02. |
| V12.3.1 | L2 | Todas las conexiones entrantes y salientes usan TLS (incluida la base de datos). | Parcial | El JWKS de Entra va por HTTPS; la cadena de conexión a PostgreSQL no exige TLS (infrastructure/qa-windows/env.qa.example:18; docker-compose.yml:56). | En QA la base está en el mismo servidor (bucle local). Para producción exigir sslmode=verify-full. Brecha G-14. |
| V12.3.2 | L2 | Los clientes TLS validan los certificados que reciben. | Cumple | Sin rejectUnauthorized:false ni NODE_TLS_REJECT_UNAUTHORIZED en el código ni en la configuración (búsqueda sin resultados); Node valida por defecto. |  |
| V12.3.3 | L2 | Las comunicaciones HTTP entre servicios internos usan TLS. | Parcial | NGINX a API por HTTP: bucle local en QA (infrastructure/qa-windows/nginx.conf:65-68) y red interna de Docker (infrastructure/nginx/conf.d/app.conf:12-15). | Aceptable en bucle local; en producción con redes compartidas exigir TLS interno o red aislada. Brecha G-14. |
| V12.3.4 | L2 | Certificados internos de confianza con CA específicas. | No aplica | No hay TLS interno entre servicios. |  |

### V13 Configuración (Configuration)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V13.1.1 | L2 | Todas las comunicaciones de la aplicación están documentadas. | Cumple | ARCHITECTURE.md:28-53 (PostgreSQL, Entra ID, Snowflake, APIs externas); ADR-007, ADR-015 y ADR-026; el servidor no acepta ubicaciones externas del usuario. |  |
| V13.2.1 | L2 | Los componentes se autentican con cuentas de servicio individuales y no con credenciales fijas compartidas. | Parcial | La API usa un usuario de base de datos propio por aplicación (docs/deployment/environments.md), pero con contraseña fija en la cadena de conexión. | Aceptable con gestión de secretos (G-12). |
| V13.2.2 | L2 | Las comunicaciones entre componentes usan cuentas de mínimo privilegio. | Parcial | En QA el usuario de la aplicación es dueño de la base y ejecuta migraciones (ADR-026, ADR-025 "Riesgo aceptado"). Para producción se recomiendan tres roles (docs/deployment/environments.md:65-90). | Brecha G-12. |
| V13.2.3 | L2 | Ninguna credencial de servicio es la predeterminada. | Parcial | docker-compose.yml:25-26,56 usa app/app como valores de reserva de la base y .env.example:20-23 repite ese valor de desarrollo; los ejemplos de QA solo traen marcadores (infrastructure/qa-windows/env.qa.example:18,26,31). | Eliminar valores de reserva en el servicio backend de Compose (el JWT ya es obligatorio, línea 62). Brecha G-12. |
| V13.2.4 | L2 | Lista permitida de recursos externos con los que el sistema puede comunicarse. | No verificable | La aplicación no inicia conexiones a destinos del usuario; las reglas de salida del servidor (cortafuegos) no están en el repositorio. | Verificar reglas de salida de los servidores de QA y producción. Brecha G-15. |
| V13.2.5 | L2 | El servidor web o de aplicaciones tiene una lista permitida de destinos de envío o carga. | No verificable | Igual que V13.2.4. | Brecha G-15. |
| V13.3.1 | L2 | Los secretos se crean, guardan y destruyen con una solución de gestión (bóveda); ninguno en el código. | Parcial | Sin secretos en el repositorio (búsqueda heurística y revisión de historial sin hallazgos; .gitignore:10-12). QA los guarda en un archivo .env protegido por permisos (infrastructure/qa-windows/env.qa.example:1-10; docs/deployment/qa-windows.md:108); SECURITY.md §4 prevé Key Vault para producción, marcado como no verificable. | No se pudo verificar el uso de Key Vault en producción. Brecha G-12. |
| V13.3.2 | L2 | El acceso a los secretos sigue el mínimo privilegio. | Parcial | Permisos restringidos con icacls sobre .env y la clave TLS (docs/deployment/qa-windows.md:108,188). | El estado real de los permisos del servidor no es verificable desde el repositorio. |
| V13.4.1 | L1 | La aplicación se despliega sin metadatos de control de versiones o estos son inaccesibles. | Parcial | NGINX niega los archivos ocultos (infrastructure/nginx/conf.d/app.conf:114-117; infrastructure/qa-windows/nginx.conf:177-180) y las imágenes excluyen .git (.dockerignore). En QA se compila en el servidor desde el clon, de modo que .git existe junto a la aplicación (ADR-026). | La cuenta del servicio puede leer .git; acotar permisos o compilar fuera del servidor. |
| V13.4.2 | L2 | Los modos de depuración están desactivados en producción. | Parcial | NODE_ENV=production en QA y Compose (infrastructure/qa-windows/env.qa.example:12; docker-compose.yml:51), Swagger desactivado en producción (backend/src/main.ts:46), registro sin formato (env.qa.example:38). Pero el build publica mapas de código fuente (frontend/vite.config.ts:33). | Brecha G-17. |
| V13.4.3 | L2 | Los servidores web no exponen listados de directorios. | Cumple | Sin autoindex en la configuración de NGINX (búsqueda en infrastructure y frontend/nginx sin resultados; valor por defecto desactivado). |  |
| V13.4.4 | L2 | El método HTTP TRACE no está soportado en producción. | No verificable | Ninguna configuración lo habilita; Express no define rutas TRACE. | No se ejecutó contra un entorno real: probar con curl -X TRACE en QA y producción (G-25). |
| V13.4.5 | L2 | La documentación de API y los endpoints de monitorización no se exponen sin intención. | Cumple | Swagger solo en no producción (backend/src/main.ts:46) y bloqueado en el borde con 404 (infrastructure/nginx/conf.d/app.conf:81-83; infrastructure/qa-windows/nginx.conf:145-147). Los endpoints de salud son públicos pero solo informan estado y disponibilidad de la base (backend/src/modules/health/health.service.ts:38-41). |  |

### V14 Protección de datos (Data Protection)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V14.1.1 | L2 | Todos los datos sensibles están identificados y clasificados por nivel de protección. | No cumple | No existe docs/security/data-classification.md pese a figurar en docs/security/README.md; SECURITY.md §5 es genérico. | Brecha G-10. |
| V14.1.2 | L2 | Cada nivel de protección tiene requisitos documentados (cifrado, retención, registro, accesos). | No cumple | Solo existen reglas dispersas: retención de auditoría (ADR-025), redacción de registros (backend/src/infrastructure/logging/app-logger.service.ts:15-33). | Brecha G-10. |
| V14.2.1 | L1 | Los datos sensibles no viajan en la URL ni en la cadena de consulta. | Cumple | Tokens solo en cabecera o cookie (frontend/src/services/api/http-client.ts:120); el registro de NGINX guarda la ruta sin cadena de consulta (infrastructure/nginx/nginx.conf:39). |  |
| V14.2.2 | L2 | Los datos sensibles no se almacenan en caché en componentes del servidor. | Cumple | Cache-Control: no-store en la API y proxy_cache desactivado (infrastructure/nginx/conf.d/app.conf:53-57; infrastructure/qa-windows/nginx.conf:127-130); descargas con no-store (backend/src/modules/attachments/attachment-download.ts:45). |  |
| V14.2.3 | L2 | Los datos sensibles no se envían a terceros no confiables (rastreadores). | Cumple | Sin scripts ni recursos de terceros: connect-src, font-src, img-src 'self' (infrastructure/nginx/conf.d/security-headers.conf:24); frontend/index.html sin recursos externos. |  |
| V14.2.4 | L2 | Los controles sobre datos sensibles se implementan según la documentación de protección. | Parcial | Redacción de claves en registros (backend/src/infrastructure/logging/app-logger.service.ts:15-33,82-97; sin prueba automatizada propia), inmutabilidad de auditoría (ADR-025). Los respaldos de QA no se cifran (infrastructure/qa-windows/respaldo.ps1) y se guardan en el mismo servidor. | Sin documentación de protección no se puede contrastar. Brecha G-10. |
| V14.3.1 | L1 | Los datos autenticados se borran del almacenamiento del cliente al terminar la sesión. | Cumple | Token en memoria y cookie se limpian (frontend/src/services/auth/local-auth.provider.ts:213-217; backend/src/modules/auth/auth.controller.ts:109) y la caché de consultas se vacía entera cada vez que cambia la identidad: suscripción en frontend/src/stores/auth.store.ts:131-142 (cierre de sesión voluntario o caducado, o inicio de otro usuario sin recargar; renovar el token no la toca). Pruebas: frontend/src/stores/auth.store.cache-isolation.spec.tsx:49-104 (A cierra sesión y B ve lo suyo sin recargar). No se usa Clear-Site-Data. | Resuelto (G-13) en el código confirmado tras 60573a8. Sin Clear-Site-Data; el vaciado depende de que el cliente esté disponible (no hay servidor implicado en el cierre local). |
| V14.3.2 | L2 | Cabeceras anti-caché suficientes para que los datos sensibles no queden en el navegador. | Cumple | API con no-store (infrastructure/nginx/conf.d/app.conf:55); index.html con no-store (infrastructure/qa-windows/nginx.conf:166-169; frontend/nginx/static.conf:24-26); los activos con hash son públicos e inmutables. |  |
| V14.3.3 | L2 | El almacenamiento del navegador no contiene datos sensibles (salvo tokens de sesión). | Cumple | Solo guarda tema y estado de la barra lateral (frontend/src/stores/ui.store.ts:21-43); el token vive en memoria (frontend/src/services/auth/local-auth.provider.ts:18-20). |  |

### V15 Codificación segura y arquitectura (Secure Coding and Architecture)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V15.1.1 | L1 | La documentación define plazos de remediación por riesgo para componentes vulnerables. | No cumple | SECURITY.md no define plazos. | Brecha G-04. |
| V15.1.2 | L2 | Existe un inventario (SBOM) de bibliotecas de terceros y se verifica su origen confiable. | Parcial | El pnpm-lock.yaml está versionado y CI instala con --frozen-lockfile (azure-pipelines/templates/setup-node.yml:47); no se genera SBOM. | Generar SBOM (CycloneDX) en el pipeline. Brecha G-04. |
| V15.1.3 | L2 | La documentación identifica la funcionalidad costosa y cómo evitar pérdida de disponibilidad. | Parcial | Las importaciones masivas tienen límites documentados (docs/implementation-plans/crm/06-integraciones.md, ADR-022). | No hay un documento transversal. Brecha G-28. |
| V15.2.1 | L1 | Los componentes no superan los plazos de remediación documentados. | No cumple | pnpm audit --prod (2026-10-15): 5 vulnerabilidades (1 alta, 4 moderadas); ver sección 2.3. No hay plazos documentados contra los que medir. | Brecha G-04. |
| V15.2.2 | L2 | Defensas contra pérdida de disponibilidad por funciones costosas. | Cumple | Límites de tamaño y de tasa, corte de subidas en streaming, guardia ZIP y topes de exportación (backend/src/modules/customer-imports/xlsx-archive-guard.ts:36-44; backend/src/common/csv.ts:58); tiempos de espera en NGINX (infrastructure/nginx/nginx.conf:62-64; infrastructure/nginx/conf.d/app.conf:59-61). |  |
| V15.2.3 | L2 | Producción solo incluye la funcionalidad necesaria (sin código de prueba ni de desarrollo). | Parcial | La semilla de demostración se niega con NODE_ENV=production y exige parámetro y variable explícitos (backend/prisma/seed-demo.ts:10-16); Swagger desactivado. Pero se publican mapas de código fuente (frontend/vite.config.ts:33). | Brecha G-17. |
| V15.3.1 | L1 | Solo se devuelve el subconjunto necesario de campos de cada objeto. | Cumple | DTO de respuesta por caso de uso (los modelos de base nunca son contrato, CLAUDE.md §8.9); ningún DTO incluye passwordHash (búsqueda sin resultados); la sesión devuelve solo usuario, roles y permisos (backend/src/modules/auth/auth.service.ts:32-38). |  |
| V15.3.2 | L2 | Las llamadas salientes del servidor no siguen redirecciones salvo que se pretenda. | No aplica | El servidor no realiza llamadas salientes a URLs externas (solo el JWKS de Entra, hoy desactivado). |  |
| V15.3.3 | L2 | Protección contra asignación masiva de campos. | Cumple | whitelist y forbidNonWhitelisted rechazan campos no declarados: backend/src/common/filters/validation-exception.factory.ts:51-57. |  |
| V15.3.4 | L2 | Los proxies transfieren la IP original con datos que el usuario no puede manipular. | Cumple | X-Forwarded-For sobrescrito (infrastructure/nginx/conf.d/app.conf:43; infrastructure/qa-windows/nginx.conf:120); la API confía en exactamente un salto (backend/src/main.ts:25) y el límite de tasa usa esa IP. | Sin prueba automatizada del borde (G-16). |
| V15.3.5 | L2 | Tipos de variable explícitos y comparaciones estrictas. | Cumple | TypeScript en modo estricto (tsconfig.base.json:8) y sin conversión implícita en validación (backend/src/common/filters/validation-exception.factory.ts:55). |  |
| V15.3.6 | L2 | El código JavaScript previene la contaminación de prototipos. | Parcial | No hay fusión profunda de objetos del usuario en el código propio; el registro usa Object.fromEntries (backend/src/infrastructure/logging/app-logger.service.ts:91). No se hizo una revisión sistemática de dependencias. | El aviso alto de deepmerge-ts (herramienta de Prisma) trata de agotamiento de pila, no de contaminación. Brecha G-04. |
| V15.3.7 | L2 | Defensas frente a contaminación de parámetros HTTP. | Parcial | Los DTO con class-validator rechazan arrays donde se espera un texto; sin prueba específica de parámetros repetidos. | Añadir una prueba con parámetros duplicados (G-16). |

### V16 Registro de seguridad y manejo de errores (Security Logging and Error Handling)

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V16.1.1 | L2 | Existe un inventario de los registros de cada capa (qué, formato, dónde, quién accede, retención). | Parcial | ADR-016 describe el registro estructurado y docs/deployment/qa-windows.md:165-166 indica el archivo de la API; no hay inventario completo con accesos y retención. | Brecha G-09. |
| V16.2.1 | L2 | Cada entrada incluye metadatos suficientes (cuándo, dónde, quién, qué). | Cumple | Hora UTC, aplicación, evento, correlationId, ruta, estado y principalId: backend/src/infrastructure/logging/app-logger.service.ts:67-73; backend/src/common/interceptors/request-logging.interceptor.ts:42-49; NGINX infrastructure/nginx/nginx.conf:34-46. |  |
| V16.2.2 | L2 | Fuentes de tiempo sincronizadas y marcas de tiempo en UTC o con desfase explícito. | Parcial | La aplicación escribe ISO-8601 UTC (backend/src/infrastructure/logging/app-logger.service.ts:69) y NGINX $time_iso8601 con desfase. | La sincronización horaria de los servidores no es verificable desde el repositorio (comprobar NTP). |
| V16.2.3 | L2 | Los registros solo se guardan en los destinos documentados. | Parcial | Salida estándar de la API (archivo vía NSSM en QA) y registros de NGINX. | No hay inventario con el que contrastar (G-09). |
| V16.2.4 | L2 | Los registros son legibles y correlacionables en un formato común. | Cumple | JSON estructurado con correlationId en API y borde: backend/src/infrastructure/logging/app-logger.service.ts:75-79; infrastructure/nginx/nginx.conf:34-48; backend/src/common/middleware/correlation-id.middleware.ts:22-25. |  |
| V16.2.5 | L2 | El registro de datos sensibles respeta su nivel de protección. | Cumple | Redacción de contraseñas, tokens y cookies: backend/src/infrastructure/logging/app-logger.service.ts:15-33,82-97; los registros de login solo llevan userId, nunca el correo ni la contraseña (backend/src/modules/auth/auth.service.ts:139,339-343). | Sin prueba automatizada del redactor (G-16). La tabla login_attempts sí guarda el correo escrito (puede ser un dato mal tecleado). |
| V16.3.1 | L2 | Se registran todas las operaciones de autenticación, exitosas y fallidas. | Cumple | Intentos en login_attempts y auditoría de acceso y bloqueo: backend/src/modules/auth/auth.service.ts:129-140,322-352; prueba backend/test/auth.e2e.spec.ts:210. |  |
| V16.3.2 | L2 | Se registran los intentos de autorización fallidos. | Cumple | authorization_denied con ruta, principal y permiso faltante: backend/src/common/guards/permissions.guard.ts:103-109,117-122; authentication_failed: backend/src/common/guards/authentication.guard.ts:53-56. |  |
| V16.3.3 | L2 | Se registran los eventos de seguridad definidos y los intentos de eludir controles (validación, lógica, anti-automatización). | Parcial | Las validaciones fallidas (400) quedan solo en el registro de peticiones sin detalle (backend/src/common/interceptors/request-logging.interceptor.ts:42-49); los rechazos por límite de tasa (429) los emite un guard antes del interceptor y no se registran en la aplicación (sí en el registro de NGINX). | Brecha G-26. |
| V16.3.4 | L2 | Se registran los errores inesperados y los fallos de controles de seguridad. | Cumple | Los errores 5xx se registran con traza en el servidor, nunca en la respuesta: backend/src/common/filters/all-exceptions.filter.ts:65-73. |  |
| V16.4.1 | L2 | Los componentes de registro codifican los datos para evitar inyección en registros. | Cumple | Serialización JSON (backend/src/infrastructure/logging/app-logger.service.ts:75-79), escape=json en NGINX (infrastructure/nginx/nginx.conf:34) y correlation ID validado por patrón (backend/src/common/middleware/correlation-id.middleware.ts:8,22-23). |  |
| V16.4.2 | L2 | Los registros están protegidos contra acceso no autorizado y modificación. | Parcial | La bitácora funcional (audit_logs) es de solo inserción por disparadores de base de datos (backend/prisma/migrations/20261014100000_audit_logs_append_only/migration.sql:28-76; pruebas backend/test/audit-immutability.e2e.spec.ts:80-147). Los registros técnicos son archivos del servidor con permisos del sistema operativo. | Riesgo aceptado temporal de QA (sección 5) y sin verificar los permisos de los archivos. Brecha G-09. |
| V16.4.3 | L2 | Los registros se envían de forma segura a un sistema separado para análisis y alertas. | No cumple | No hay envío a un sistema externo (SIEM/Log Analytics) en el repositorio ni en el runbook de QA. | Brecha G-09. |
| V16.5.1 | L2 | Ante errores inesperados se devuelve un mensaje genérico sin datos internos. | Cumple | 500 con mensaje fijo y sin traza: backend/src/common/filters/all-exceptions.filter.ts:75-83,138-143; el filtro es global (backend/src/app.module.ts:89). |  |
| V16.5.2 | L2 | La aplicación sigue operando de forma segura cuando falla un recurso externo. | Parcial | Falla cerrado: un JWKS inaccesible produce 401, la preparación (readiness) refleja la base (backend/src/modules/health/health.service.ts:38-41). No hay disyuntores ni degradación explícita. | Aceptable por la baja dependencia externa; sin pruebas de fallo. |
| V16.5.3 | L2 | La aplicación falla de forma segura (sin fail-open). | Cumple | Sin declaración de permiso se deniega (backend/src/common/guards/permissions.guard.ts:82-96); una verificación de hash corrupta devuelve falso (backend/src/modules/auth/password.service.ts:81-87); pruebas backend/src/common/guards/permissions.guard.spec.ts:111,127. |  |

### V17 WebRTC

| ID | Nivel | Requisito (resumen) | Estado | Evidencia | Observación |
|---|---|---|---|---|---|
| V17.1.1 | L2 | El servidor TURN solo permite direcciones no reservadas. | No aplica | La aplicación no usa WebRTC. |  |
| V17.2.1 | L2 | Gestión de la clave del certificado DTLS. | No aplica | La aplicación no usa WebRTC. |  |
| V17.2.2 | L2 | Suites DTLS y perfil SRTP aprobados. | No aplica | La aplicación no usa WebRTC. |  |
| V17.2.3 | L2 | Autenticación SRTP comprobada en el servidor de medios. | No aplica | La aplicación no usa WebRTC. |  |
| V17.2.4 | L2 | El servidor de medios resiste paquetes SRTP malformados. | No aplica | La aplicación no usa WebRTC. |  |
| V17.3.1 | L2 | El servidor de señalización resiste inundaciones. | No aplica | La aplicación no usa WebRTC. |  |
| V17.3.2 | L2 | El servidor de señalización resiste mensajes malformados. | No aplica | La aplicación no usa WebRTC. |  |

---

## 4. Brechas y plan de remediación

### 4.1 Brechas (28; 1 resuelta, 27 abiertas)

Criterio de prioridad: **Alta** = permite tomar cuentas, deja sin protección el transporte o un control declarado no opera; debe cerrarse antes de producción con datos reales. **Media** = reduce de forma apreciable la defensa en profundidad o la capacidad de investigar y responder. **Baja** = endurecimiento o verificación pendiente de bajo impacto directo. El responsable es una **sugerencia** por rol.

| ID | Brecha | Riesgo | Prioridad | Requisitos | Remediación propuesta | Responsable sugerido |
|---|---|---|---|---|---|---|
| G-01 | Contraseña inicial compartida, fija y sin caducidad (`AUTH_DEFAULT_PASSWORD`); administrador inicial exento de la política | Quien conozca esa contraseña y un correo toma cualquier cuenta que aún no haya hecho su primer acceso o que haya sido restablecida | **Alta** | V6.4.1, V6.4.3 (ver también V6.3.2) | Credencial aleatoria por usuario (CSPRNG, 16 caracteres o más) o enlace de activación de un solo uso, caducidad corta (72 h), mostrada una sola vez al administrador y nunca registrada; retirar `AUTH_DEFAULT_PASSWORD`; contraseña aleatoria de un solo uso para el administrador inicial | Backend + Seguridad |
| G-02 | Transporte seguro no garantizado en el borde: HSTS comentado en NGINX, certificado de QA autofirmado, TLS de producción y suites sin verificar, Compose sin TLS | Interceptación o degradación de la conexión (por ejemplo, quitar el cifrado) y avisos de certificado que acostumbran al usuario a ignorarlos | **Alta** | V3.4.1, V12.1.1, V12.1.2, V12.2.1, V12.2.2 | Activar HSTS (1 año o más, con subdominios) en `security-headers.conf` al contar con dominio y certificado de CA de confianza; verificar TLS 1.2/1.3 y suites con una herramienta de análisis; documentar el ingress de producción; añadir una prueba automatizada de cabeceras | DevOps + Seguridad |
| G-03 | Sin segundo factor de autenticación con login local (documentado en ADR-019) | Una contraseña robada o adivinada basta para entrar | **Alta** | V6.3.3 | Habilitar Entra ID con MFA antes de producción (ADR-007, ADR-019) o registrar una decisión formal con fecha límite; mientras tanto, mantener bloqueo y límites actuales | Arquitectura + Responsable del producto |
| G-04 | 1 vulnerabilidad alta y 4 moderadas en dependencias de producción; la plantilla `security-scan.yml` no se incluye en ningún pipeline; sin plazos de remediación ni inventario (SBOM) | Componentes vulnerables sin que el pipeline lo detecte; control declarado en `SECURITY.md` que no opera | **Alta** | V15.1.1, V15.1.2, V15.2.1, V15.3.6 | Actualizar Prisma, exceljs/uuid, @nestjs/swagger y react-router-dom; incluir `security-scan.yml` en los pipelines de PR y de rama principal (fallar en alta o crítica); fijar plazos (crítica 7 días, alta 14, media 30); generar SBOM | DevOps + Backend + Frontend |
| G-05 | Sin tiempo de inactividad de sesión ni límite de sesiones simultáneas | Una sesión abandonada en un equipo desatendido dura hasta 8 horas | Media | V7.1.1, V7.1.2, V7.3.1 | Definir y documentar inactividad (por ejemplo 30 minutos) y renovar el token solo con actividad del usuario; definir política de sesiones simultáneas | Frontend + Backend + Seguridad |
| G-06 | Sin gestión de sesiones (ver y terminar las propias, terminar las de otros) y sin forma de revocar un token de acceso antes de 15 minutos | Una sesión robada no se puede cortar de inmediato; el administrador solo puede suspender o restablecer | Media | V7.4.1, V7.4.5, V7.5.1, V7.5.2, V10.4.9 | Pantalla «Mis sesiones» y acción de administrador; versión de sesión por usuario comprobada en cada petición para invalidar tokens de acceso; reautenticación para acciones críticas de administración | Backend + Frontend + Seguridad |
| G-07 | Lista de contraseñas comunes de 19 entradas; sin comprobación de contraseñas filtradas; sin lista documentada de palabras de contexto | Contraseñas triviales aceptadas (requisito de nivel 1 incumplido) | Media | V6.1.2, V6.2.4, V6.2.11, V6.2.12 | Lista local de al menos 3000 contraseñas (idealmente más) como archivo de datos; palabras de contexto documentadas; si se opta por consulta externa con k-anonimato, abrir ADR | Backend + Seguridad |
| G-08 | Archivos adjuntos sin análisis antimalware | Distribución interna de archivos maliciosos subidos por un usuario | Media | V5.1.1, V5.4.3 | Integrar un servicio de análisis (corporativo o ClamAV) con cuarentena y registro; documentar el comportamiento ante detección (requiere ADR por patrón nuevo) | Backend + DevOps + Arquitectura |
| G-09 | Registros técnicos sin envío a un sistema separado, sin inventario, permisos y sincronización horaria sin verificar | Un atacante con acceso al servidor puede alterar o borrar el rastro técnico; detección tardía | Media | V16.1.1, V16.2.2, V16.2.3, V16.4.2, V16.4.3 | Enviar registros de API y NGINX a un sistema centralizado (Log Analytics, SIEM); fijar permisos de los archivos; comprobar NTP; documentar el inventario de registros | DevOps + Seguridad |
| G-10 | Sin clasificación de datos ni requisitos de protección por nivel; `threat-model.md` y `data-classification.md` listados en el índice pero inexistentes; respaldos de QA sin cifrar y en el mismo servidor | Sin criterio para decidir qué proteger y cómo; pérdida o exposición de respaldos | Media | V14.1.1, V14.1.2, V14.2.4 | Crear ambos documentos; definir retención y cifrado por nivel; cifrar los respaldos y copiarlos fuera del servidor | Seguridad + Arquitectura + DevOps |
| G-11 | CSP con `style-src 'unsafe-inline'` y `base-uri 'self'` | Permite inyectar estilos si se logra insertar HTML; no permite scripts | Media | V3.4.3 | CSP con nonce por respuesta para Emotion/MUI (evaluar frente a ADR-009 y ADR-017) y `base-uri 'none'` | Frontend + DevOps |
| G-12 | Secretos en archivo `.env` con permisos en QA, sin bóveda verificada; usuario de base de datos dueño de la base en QA; valores `app/app` de reserva en Compose; variable huérfana `JWT_REFRESH_TOKEN_SECRET` | Fuga de secretos por acceso al servidor; privilegios excesivos del servicio | Media | V13.2.1, V13.2.2, V13.2.3, V13.3.1, V13.3.2 | Key Vault o variables seguras de Azure DevOps en producción; tres roles de base (`docs/deployment/environments.md`); quitar valores por defecto del servicio backend en Compose; retirar la variable huérfana; verificar permisos | DevOps + Seguridad |
| G-13 | **Resuelta.** La caché de consultas del navegador no se vaciaba al cerrar sesión (versión inicial, commit `60573a8`) | En un equipo compartido, otro usuario podría ver brevemente datos del anterior | Media (resuelta) | V14.3.1 | Resuelta: suscripción que vacía la caché al cambiar el identificador de usuario (`frontend/src/stores/auth.store.ts:131-142`); tras un cierre voluntario no se conserva la ruta de retorno (`frontend/src/components/layout/RequireAuth.tsx:33-42`); pruebas `frontend/src/stores/auth.store.cache-isolation.spec.tsx:49-104` y `frontend/src/components/layout/RequireAuth.spec.tsx:38-49` | Frontend |
| G-14 | Conexión a PostgreSQL sin TLS exigido y proxy a API por HTTP | Interceptación interna si la red no es de confianza (en QA todo es bucle local) | Media | V12.3.1, V12.3.3 | `sslmode=verify-full` en producción; TLS interno o red aislada entre proxy y API | DevOps |
| G-27 | Sin política de gestión de claves (rotación de la clave del JWT, custodia) ni inventario criptográfico vivo | Rotación improvisada ante un incidente; claves sin dueño | Media | V11.1.1, V11.1.2, V11.2.2 | Documentar el ciclo de vida de la clave de firma; añadir identificador de clave (`kid`) para rotar sin corte; mantener el anexo B como documento vivo | Seguridad + Backend |
| G-15 | Reglas de salida de red del servidor no verificadas | Una aplicación comprometida podría contactar destinos arbitrarios | Baja | V13.2.4, V13.2.5 | Revisar y documentar el cortafuegos de salida de QA y producción | DevOps |
| G-16 | Sin pruebas automatizadas de la frontera: CORS, CSP y cabeceras, token caducado o con algoritmo no permitido, parámetros repetidos, redactor de registros, fallo de recursos externos | Una regresión en estos controles pasaría desapercibida | Baja | V15.3.7, V16.5.2 (y refuerzo de V3.4.2, V9.2.1, V15.3.4, V16.2.5) | Añadir pruebas de integración de cabeceras y CORS, token caducado, parámetros duplicados y redacción de registros | QA + Backend |
| G-17 | El build publica mapas de código fuente (`sourcemap: true`) | Facilita la ingeniería inversa del cliente (no expone secretos) | Baja | V13.4.2, V15.2.3 | Desactivar los mapas en el build de producción o servirlos solo a herramientas de monitorización | Frontend |
| G-18 | La cookie de sesión no lleva prefijo `__Secure-`/`__Host-` | Sustitución de la cookie desde un subdominio o conexión sin cifrar (mitigado por HttpOnly, SameSite y ruta) | Baja | V3.3.1, V3.3.3 | Renombrar a `__Secure-refresh_token` en entornos HTTPS; documentar por qué no se usa `__Host-` | Backend |
| G-19 | La verificación del JWT no declara la lista de algoritmos; el largo mínimo del secreto solo se exige al firmar, no al arrancar | Dependencia implícita del comportamiento de la biblioteca; arranque con secreto corto | Baja | V9.1.2 | `algorithms: ['HS256']` (y `['RS256']` para Entra); validar la longitud en el esquema de configuración | Backend |
| G-20 | `/auth/refresh` y `/auth/logout` aceptan una petición simple con la cookie, protegidas solo por SameSite=Lax | Rotación o cierre de sesión forzados desde el mismo sitio registrable | Baja | V3.5.1, V3.5.2 | Exigir una cabecera propia (por ejemplo `X-Requested-With`) en esos dos endpoints | Backend + Frontend |
| G-21 | Cabeceras duplicadas o distintas entre helmet y NGINX en respuestas de la API (por ejemplo `X-Frame-Options`, `Referrer-Policy`, dos CSP) | Sin efecto de seguridad directo; confusión al auditar | Baja | (V3.4.x sin incumplimiento) | Unificar en una sola capa (`proxy_hide_header` o configurar helmet); comprobar con `curl -I` | DevOps |
| G-22 | Los Dockerfile instalan con `--frozen-lockfile ... \|\| pnpm install`; imágenes base por etiqueta, no por digest | Una imagen podría construirse con dependencias sin fijar | Baja | V15.1.2 | Quitar el respaldo sin lockfile; fijar imágenes por digest en las versiones de release | DevOps |
| G-23 | Con Entra ID, el respaldo de identificación por correo (mutable) en la resolución de usuarios | Suplantación si un correo se reasigna | Baja | V10.3.3 (V6.8.1) | Identificar solo por `tid` + `oid`; retirar o acotar el respaldo por correo al habilitar Entra | Backend |
| G-24 | La semilla crea la cuenta administradora con el correo por defecto `admin@example.com` | Cuenta predecible | Baja | V6.3.2 | Exigir `SEED_ADMIN_EMAIL` explícito fuera de desarrollo | Backend |
| G-25 | Borde y plataforma sin verificar: contrabando de peticiones, método TRACE, `X-Forwarded-Proto` aceptado del cliente en Docker, redirección HTTP→HTTPS también de `/api` en QA, QA comparte dirección con otra aplicación, `.git` presente junto a la aplicación en QA | Debilidades de despliegue de bajo impacto directo | Baja | V3.5.4, V4.1.2, V4.1.3, V4.2.1, V13.4.1, V13.4.4 | Ejecutar las comprobaciones del anexo D; fijar `X-Forwarded-Proto`; redirigir solo la interfaz; dominio propio para QA | DevOps |
| G-26 | Límite de tasa en memoria y por IP; los rechazos 429 no se registran en la aplicación | Evasión con varias instancias o IP; poca visibilidad de ataques | Baja | V16.3.3 (y V2.4.1) | Almacén compartido si hay más de una instancia; registrar los 429; valorar límite por cuenta | Backend |
| G-28 | Límites de negocio, reglas por campo, funciones costosas y riesgo de bloqueo malicioso de cuentas sin documento transversal | Decisiones dispersas, difíciles de auditar | Baja | V2.1.3, V6.1.1, V8.1.2, V8.2.3, V15.1.3 | Consolidar en `docs/security/` | Seguridad + Arquitectura |

Resumen: **4 Altas, 11 Medias (10 abiertas y 1 resuelta), 13 Bajas** (28; 27 abiertas). Las 70 filas de la matriz con estado distinto de «Cumple» y «No aplica» están cubiertas por al menos una brecha abierta; V14.3.1 pasó a «Cumple» y su brecha (G-13) se conserva como historial.

### 4.2 Historias propuestas para las brechas de prioridad Alta

**HS-01 · Contraseña inicial individual y con caducidad (G-01)**
- *Historia:* como administrador de accesos, quiero que cada usuario nuevo o restablecido reciba una credencial aleatoria de un solo uso que caduca, para que nadie pueda entrar con una contraseña común.
- *Criterios de aceptación:*
  - **Dado** el alta o el restablecimiento de un usuario **cuando** se completa **entonces** se genera un secreto aleatorio de al menos 16 caracteres, se muestra una sola vez y no aparece en registros ni en la bitácora.
  - **Dado** un secreto emitido hace más de 72 horas **cuando** se usa **entonces** la API responde 401 y el administrador debe emitir uno nuevo.
  - **Dado** el primer acceso con el secreto **cuando** el usuario lo usa **entonces** debe fijar su contraseña antes de cualquier otra acción (comportamiento actual) y el secreto deja de servir.
  - **Dado** el arranque de la API **cuando** exista `AUTH_DEFAULT_PASSWORD` **entonces** se ignora o se rechaza la configuración.
- *Seguridad:* autenticación del login; autorización `usuarios.editar` más `ADMIN_ONLY` para restablecer (ADR-020); pruebas de 401, 403, caducidad y no registro del secreto. *API:* cambia la respuesta de `POST /users` y `POST /users/{id}/password/reset` (contrato OpenAPI). *Datos:* se reutiliza `user_credentials.expires_at`.

**HS-02 · Transporte seguro verificado en el borde (G-02)**
- *Historia:* como responsable de seguridad, quiero que toda respuesta lleve HSTS y que el TLS de cada entorno esté verificado, para impedir la degradación de la conexión.
- *Criterios de aceptación:*
  - **Dado** un entorno con dominio y certificado de CA de confianza **cuando** se pide cualquier ruta (interfaz, activos y API) **entonces** la respuesta incluye `Strict-Transport-Security` con vigencia de al menos un año y subdominios.
  - **Dado** QA y producción **cuando** se ejecuta un análisis de TLS **entonces** solo se ofrecen TLS 1.2 y 1.3 con suites recomendadas y el informe se archiva.
  - **Dado** el pipeline **cuando** se ejecutan las pruebas **entonces** una prueba automatizada falla si falta HSTS, CSP o `nosniff`.
- *Seguridad:* cabeceras y CORS sin cambios de contrato; no hay datos nuevos.

**HS-03 · Entra ID con MFA para producción (G-03)**
- *Historia:* como responsable de seguridad, quiero que el acceso a producción exija doble factor mediante Entra ID, para que una contraseña robada no baste.
- *Criterios de aceptación:*
  - **Dado** `AUTH_PROVIDER=entra` **cuando** un usuario inicia sesión **entonces** el acceso exige el MFA de la organización y los tokens se validan por firma, emisor, audiencia y tenant.
  - **Dado** producción **cuando** se despliega **entonces** el login local queda deshabilitado, salvo una cuenta de emergencia documentada, protegida y auditada.
  - **Dado** un usuario de Entra **cuando** se resuelve su cuenta local **entonces** se usa `tid` + `oid`, nunca el correo (G-23).
- *Seguridad:* requiere ADR de habilitación (ADR-006 y ADR-007) y repetir los capítulos V9 y V10 de esta verificación.

**HS-04 · Dependencias sin hallazgos altos y compuerta en el pipeline (G-04)**
- *Historia:* como responsable de seguridad, quiero que el pipeline falle ante vulnerabilidades altas o críticas y que existan plazos de remediación, para no desplegar componentes vulnerables.
- *Criterios de aceptación:*
  - **Dado** un pull request o una ejecución sobre la rama principal **cuando** `pnpm audit` encuentra severidad alta o crítica **entonces** el pipeline falla.
  - **Dado** el estado actual **cuando** se actualizan Prisma, exceljs, @nestjs/swagger y react-router-dom **entonces** `pnpm audit --prod` no informa severidad alta o crítica.
  - **Dado** cada compilación **cuando** termina **entonces** se publica un SBOM como artefacto.
  - **Dado** el documento `SECURITY.md` **cuando** se revisa **entonces** define plazos de remediación por severidad.

---

## 5. Riesgos aceptados

Solo se listan riesgos con una decisión escrita. Este informe **no aprueba excepciones**: las excepciones permanentes requieren ADR y decisión del responsable humano.

| ID | Riesgo | Decisión y origen | Alcance y vigencia | Mitigación y verificación |
|---|---|---|---|---|
| RA-1 | En QA, la credencial de la aplicación es dueña de `audit_logs` y podría desactivar los disparadores de inmutabilidad | ADR-025, «Riesgo aceptado y temporal en QA» (decisión del responsable, D3, 2026-10-14) | Solo QA, temporal; QA no tiene datos productivos | En producción: tres roles de base (`docs/deployment/environments.md:65-90`), la aplicación nunca propietaria de `audit_logs`. Verificado en el repositorio: la migración `20261014100000_audit_logs_append_only` y sus pruebas existen (`backend/test/audit-immutability.e2e.spec.ts:80-147`). El estado real del servidor de QA no se comprobó |
| RA-2 | Sin MFA mientras se use el login local | Declarado en ADR-019 (línea 85) y `docs/implementation-plans/PLAN-AUTH-LOCAL.md:26,206` («quien aprueba lo conoce») | Hasta habilitar Entra ID; **sin fecha límite escrita ni aceptante identificado** | Se trata como brecha G-03 (Alta); no es aceptable para producción con datos reales sin ADR y decisión formal |
| RA-3 | Certificado autofirmado o de la CA interna en QA, con aviso en el navegador | ADR-026, Consecuencias | Solo QA, hasta tener dominio | Cerrar con G-02 al disponer del dominio |
| RA-4 | Contraseña del administrador inicial exenta de la política de contraseñas | Decisión del responsable (D11), comentario en `backend/prisma/seed.ts:66` | Alta inicial; se obliga a cambiarla al entrar | Cubierto por G-01 |

---

## 6. Anexos

### Anexo A · Inventario de controles y verificación

Estado: **Confirmado** (comprobado en este commit), **Parcial** o **No confirmado**.

| Control | Descripción | Evidencia | Estado |
|---|---|---|---|
| Hash de contraseñas | Argon2id (19 MiB, 2 iteraciones, 1 hilo), migración transparente de parámetros | `backend/src/modules/auth/password.service.ts:23-28,106-113` | Confirmado |
| Política de contraseñas | Mínimo 12, máximo 128, sin reglas de composición, rechazo de lista corta y de la parte local del correo | `backend/src/modules/auth/password.service.ts:40,47,126-159` | Parcial (lista corta, G-07) |
| Bloqueo de cuenta | 5 intentos y 15 minutos, desde `system_parameters`; reserva atómica del intento | `backend/src/modules/auth/lockout.service.ts:26-57`; `backend/prisma/seed/access-catalog.ts:329-349` | Confirmado |
| Caducidad de contraseña | Parámetro `seguridad.dias_caducidad_password`, valor 0 (desactivada) | `backend/prisma/seed/access-catalog.ts:347-349` | Confirmado (comprobar valor por entorno) |
| Límite de peticiones | 120/min global; 10/min por IP en login y cambio de contraseña; 5-30/min en importaciones; NGINX 20 peticiones/s | `backend/src/app.module.ts:46-54`; `backend/src/modules/auth/auth.controller.ts:32`; `infrastructure/nginx/nginx.conf:68`; `infrastructure/nginx/conf.d/app.conf:34` | Confirmado |
| Cabeceras de seguridad | helmet en la API; NGINX: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, CORP, CSP | `backend/src/main.ts:27`; `infrastructure/nginx/conf.d/security-headers.conf:9-24` | Parcial (HSTS comentado en NGINX, línea 18; CSP con estilos en línea) |
| CORS | Lista blanca por entorno, con credenciales, sin comodín | `backend/src/main.ts:29-35` | Confirmado |
| Autenticación y autorización global | Guards globales: límite de tasa → autenticación → permisos; denegar por defecto | `backend/src/app.module.ts:91-93`; `backend/src/common/guards/permissions.guard.ts:90-96` | Confirmado (206 manejadores revisados) |
| Autorización por propiedad del recurso | Alcances de visibilidad en consulta; 404 uniforme | `backend/src/modules/access/visibility-scope.ts`; `backend/test/customers-visibility.e2e.spec.ts:140` | Confirmado |
| Asignación de accesos solo por administrador | `403 ADMIN_ONLY` en roles, permisos, equipos y restablecimientos | ADR-020; `backend/src/modules/auth/auth.service.ts:260`; pruebas `backend/test/access-safeguards.e2e.spec.ts` (10 referencias a ADMIN_ONLY), `backend/test/teams.e2e.spec.ts` (8), `backend/test/access-users.e2e.spec.ts` (5) | Confirmado |
| Sesiones | Access token 15 min en memoria; refresh opaco de 256 bits, rotativo, caducidad absoluta de 8 h, reutilización revoca todo | `backend/src/modules/auth/session.service.ts:36-160`; `frontend/src/services/auth/local-auth.provider.ts:18-20` | Confirmado |
| Cookie de sesión | HttpOnly, Secure fuera de desarrollo, SameSite=Lax, ruta `/api/v1/auth` | `backend/src/modules/auth/refresh-cookie.ts:12-21` | Parcial (sin prefijo, G-18) |
| Validación de entrada | ValidationPipe global con whitelist, forbidNonWhitelisted y sin conversión implícita | `backend/src/common/filters/validation-exception.factory.ts:51-57`; `backend/src/main.ts:44` | Confirmado |
| Inyección SQL | Prisma y SQL parametrizado; ordenación por listas cerradas | `backend/src/infrastructure/database/prisma/repositories/prisma-activity.repository.ts:134-142,294` | Confirmado |
| Exportaciones CSV/XLSX | Neutralización de fórmulas, entrecomillado, tope de 10 000 filas | `backend/src/common/csv.ts:17-58`; `backend/src/common/xlsx.ts:235-239` | Confirmado |
| Adjuntos | Extensión + firma real, tamaño, claves generadas por el servidor, descarga solo por API como attachment | `backend/src/modules/attachments/attachment-content-type.ts:62-147`; `backend/src/modules/attachments/attachment-download.ts:17-49` | Confirmado (sin antivirus, G-08) |
| Importaciones de clientes | Firma, guardia ZIP, rechazo de DTD, presupuesto de filas y celdas | `backend/src/modules/customer-imports/xlsx-archive-guard.ts:1-44` | Confirmado |
| Bitácora inmutable | Disparadores contra UPDATE, TRUNCATE y DELETE dentro de la retención | `backend/prisma/migrations/20261014100000_audit_logs_append_only/migration.sql:28-76` | Confirmado (riesgo RA-1 en QA) |
| Errores | Formato único; 500 con mensaje fijo; traza solo en el registro del servidor | `backend/src/common/filters/all-exceptions.filter.ts:65-83,138-143` | Confirmado |
| Registros | JSON estructurado con correlation ID y redacción de claves sensibles; sin PII en los registros de login | `backend/src/infrastructure/logging/app-logger.service.ts:15-33,67-79,82-97` | Confirmado (sin prueba del redactor, G-16) |
| `Cache-Control: no-store` en la API | Añadido en el borde y en descargas | `infrastructure/nginx/conf.d/app.conf:53-57`; `infrastructure/qa-windows/nginx.conf:127-130` | Confirmado |
| IP real del cliente | Un solo salto de confianza; `X-Forwarded-For` sobrescrito en el borde | `backend/src/main.ts:25`; `infrastructure/nginx/conf.d/app.conf:43` | Confirmado |
| Swagger cerrado | Desactivado en producción y 404 en NGINX | `backend/src/main.ts:46`; `infrastructure/nginx/conf.d/app.conf:81-83` | Confirmado |
| Aislamiento de caché entre usuarios | La caché de consultas se vacía al cambiar el identificador de usuario; sin ruta de retorno tras cierre voluntario | `frontend/src/stores/auth.store.ts:131-142`; `frontend/src/components/layout/RequireAuth.tsx:33-42`; pruebas `frontend/src/stores/auth.store.cache-isolation.spec.tsx:49-104` | Confirmado |
| Mensaje del minuto de seguridad | Texto plano: sin caracteres de control ni de formato/bidi, al menos un carácter visible; escritura condicionada por fecha frente a la carrera de medianoche | `backend/src/common/dto/plain-text.validator.ts:11-35`; `backend/src/infrastructure/database/prisma/repositories/prisma-safety-minutes.repository.ts:112-129`; `backend/test/safety-minutes.e2e.spec.ts:293-311` | Confirmado |
| Secretos | Ninguno versionado; `.env` ignorado; ejemplos con marcadores; búsqueda heurística sin hallazgos | `.gitignore:10-12`; `infrastructure/qa-windows/env.qa.example` | Parcial (sin bóveda verificada, G-12) |
| Contenedores | Usuario no root, healthchecks, build en varias etapas | `backend/Dockerfile:73-77`; `frontend/Dockerfile:79-82` | Confirmado |
| Instalación reproducible | `--frozen-lockfile` en CI | `azure-pipelines/templates/setup-node.yml:47` | Parcial (respaldo sin lockfile en los Dockerfile, G-22) |
| Análisis de dependencias | Plantilla con `pnpm audit --audit-level=high` | `azure-pipelines/templates/security-scan.yml:20` | **No confirmado**: ningún pipeline la incluye (G-04) |

### Anexo B · Inventario criptográfico provisional

| Elemento | Algoritmo y parámetros | Uso | Evidencia | Custodia y rotación |
|---|---|---|---|---|
| Hash de contraseñas | Argon2id, 19 MiB, 2 iteraciones, 1 hilo, sal aleatoria de la biblioteca | Almacenar credenciales | `backend/src/modules/auth/password.service.ts:23-28` | Parámetros en código; migración al iniciar sesión |
| Firma del token de acceso | HS256, clave simétrica de al menos 256 bits (`JWT_ACCESS_TOKEN_SECRET`), vida 15 min | Sesión de la API | `backend/src/modules/auth/token.service.ts:26,60-69,78-83` | Variable de entorno; sin política de rotación ni `kid` (G-27) |
| Refresh token | 256 bits aleatorios (CSPRNG); en base solo su SHA-256 | Renovación de sesión | `backend/src/modules/auth/session.service.ts:163-169` | Rotación en cada uso; absoluto 8 h |
| Validación de tokens de Entra ID | Firma contra JWKS remoto (caché de 10 minutos), emisor, audiencia y tenant | Autenticación con Entra (inactivo) | `backend/src/infrastructure/authentication/providers/entra-id-authentication.provider.ts:35-47,80` | Gestionada por Microsoft |
| Suma de verificación de adjuntos | SHA-256 | Integridad al guardar | `backend/src/infrastructure/storage/local-file-system.storage.ts:89` | No aplica |
| TLS de QA | TLS 1.2 y 1.3; suites por defecto de la versión instalada; certificado y clave fuera del repositorio | Cifrado en tránsito del navegador | `infrastructure/qa-windows/nginx.conf:87-96` | Permisos restringidos documentados en `docs/deployment/qa-windows.md:188`; certificado no público (RA-3) |
| Cifrado en reposo | No hay cifrado a nivel de aplicación; base de datos y adjuntos dependen del disco | Datos almacenados | Búsqueda de funciones de cifrado en `backend/src` y `frontend/src` sin resultados | No verificable (infraestructura) |
| Respaldos de QA | Sin cifrado, en el mismo servidor | Recuperación | `infrastructure/qa-windows/respaldo.ps1` | G-10 |
| Contraseña inicial compartida | Valor fijo de `AUTH_DEFAULT_PASSWORD` | Alta y restablecimiento de usuarios | `backend/src/modules/auth/initial-credential.service.ts:29-42` | G-01 |
| `JWT_REFRESH_TOKEN_SECRET` | Declarado pero sin uso en el código | — | `backend/src/config/env.schema.ts:35`; `docker-compose.yml:66` | Retirar (G-12) |

### Anexo C · Relación con la tabla OWASP Top 10 de `SECURITY.md` §3

| Riesgo (OWASP Top 10) | Mitigación declarada en `SECURITY.md` | Resultado de la verificación | Requisitos ASVS relacionados | Estado |
|---|---|---|---|---|
| Broken Access Control | Guard global deny-by-default, permiso por endpoint, propiedad del recurso, pruebas 401/403 | Los 206 manejadores declaran política; alcances de datos probados; asignación de accesos solo por administrador | V8.1.1, V8.2.1, V8.2.2, V8.3.1 | Confirmada |
| Cryptographic Failures | Argon2id, TLS en tránsito, sin cifrado casero, secretos fuera del código | Argon2id y bibliotecas estándar confirmados; sin secretos versionados (búsqueda heurística); TLS de producción sin verificar y HSTS desactivado en NGINX | V11.2.x, V11.4.2, V12.x, V3.4.1 | Parcial (G-02, G-14) |
| Injection | Prisma parametrizado, `sortBy` por lista cerrada, sanitización de salida | Confirmado; React sin inserción de HTML; CSV neutralizado | V1.2.x, V1.3.x | Confirmada |
| Insecure Design | Flujo con revisión de arquitectura y seguridad, ADR | Flujo y ADR existentes; faltan `threat-model.md` y `data-classification.md` | V14.1.x | Parcial (G-10) |
| Security Misconfiguration | Configuración validada al arranque, Helmet, CORS, Swagger deshabilitable, usuario no root | Confirmado; pero HSTS, CSP con estilos en línea, mapas de código fuente y valores por defecto en Compose | V13.x, V3.4.x | Parcial (G-11, G-12, G-17) |
| Vulnerable Components | Revisión de licencia y mantenimiento; `pnpm audit` bajo demanda (versión actual de `SECURITY.md`; la versión verificada inicialmente decía «en el pipeline de PR») | Ningún pipeline ejecuta el análisis; 1 alta y 4 moderadas en producción | V15.1.x, V15.2.1 | Brecha abierta (G-04) |
| Authentication Failures | Tokens de vida corta, rotación y revocación del refresh, validación completa, límite en login | Confirmado; sin MFA, contraseña inicial compartida, lista de contraseñas comunes mínima | V6.x, V7.x, V9.x | Parcial (G-01, G-03, G-07) |
| Integrity Failures | Lockfile y `--frozen-lockfile` en CI, imágenes por digest en release | Lockfile y CI confirmados; los Dockerfile tienen respaldo sin lockfile; imágenes por etiqueta; sin SBOM ni firma | V15.1.2 | Parcial (G-04, G-22) |
| Logging Failures | Registro de eventos de seguridad sin datos sensibles | Eventos de autenticación y autorización registrados sin PII; sin envío a sistema separado ni pruebas del redactor | V16.x | Parcial (G-09, G-16) |
| SSRF | Sin fetch a URLs del usuario, lista de destinos | Confirmado: el servidor no realiza llamadas salientes con datos del usuario | V1.3.6, V15.3.2 | Confirmada |

**Discrepancias entre `SECURITY.md` y lo comprobado.** En la versión verificada inicialmente, `SECURITY.md` afirmaba «HSTS en el borde» (está comentado en NGINX), «`pnpm audit` en cada PR» (no existe en los pipelines) y «Key Vault» para secretos en producción (no verificable). Esas tres afirmaciones se corrigieron después en el documento, que ahora remite a las brechas G-02, G-04 y G-12; el estado real sigue siendo el de la matriz.

### Anexo D · Acciones para verificar lo no verificable y lo parcial por infraestructura

Sustituir `<host>` por el nombre o la dirección del entorno. Ningún comando requiere credenciales.

| Requisito | Acción | Resultado esperado |
|---|---|---|
| V12.1.1, V12.1.2, V12.2.1, V12.2.2 | Ejecutar un análisis de TLS (por ejemplo `testssl.sh https://<host>`) en QA y en el ingress de producción | Solo TLS 1.2 y 1.3, suites con secreto perfecto hacia adelante, certificado de CA de confianza |
| V3.4.1, V3.4.3, V3.4.4, V3.4.5, V3.4.6 | `curl -sI https://<host>/`, `/assets/<archivo>` y `/api/v1/health` y revisar las cabeceras | HSTS de un año o más en todas; sin cabeceras contradictorias |
| V13.4.4 | `curl -sk -X TRACE https://<host>/` | 405 o 404, sin eco de la petición |
| V4.2.1 | Prueba de contrabando de peticiones (por ejemplo con una herramienta de desincronización HTTP) contra el ingress | Sin desincronización |
| V13.2.4, V13.2.5 | Revisar el cortafuegos de salida de los servidores de QA y producción | Solo destinos necesarios (base de datos, Entra ID si se activa) |
| V13.3.1, V13.3.2 | Confirmar el uso de la bóveda y los permisos de `.env` y de la clave TLS; ejecutar una herramienta de búsqueda de secretos sobre todo el historial | Sin secretos; permisos limitados a administradores y a la cuenta del servicio |
| V6.2.10 | Consultar `seguridad.dias_caducidad_password` en cada entorno | Valor 0 |
| V16.2.2, V16.4.2 | Comprobar la sincronización horaria de los servidores y los permisos de la carpeta de registros | Hora sincronizada; acceso solo a administradores |
| V14.2.4 | Probar la restauración de un respaldo y confirmar su cifrado y su copia fuera del servidor | Restauración correcta; respaldo cifrado y externo |
| V12.3.1 | Revisar `sslmode` en la cadena de conexión de producción | `verify-full` |

---

## 7. Control de cambios del informe

| Versión | Fecha | Commit verificado | Cambios |
|---|---|---|---|
| 1 | 2026-10-15 | `60573a8a17cb44e85befe90cd39a270777527a11` | Versión inicial: 112 Cumple de 183 aplicables (61 %), 51 Parcial |
| 2 | 2026-10-15 | `20c9bc289d4c0578698535f72f55d1efdb3e740f` | Re-verificación de lo afectado por los commits `5674f38`, `ae3a396` y `20c9bc2` y por la corrección de `SECURITY.md` |
| Nota (sin re-verificación) | 2026-10-20 | — (rama `feature/endurecimiento-internet`, sin commit verificado) | En esa rama se implementaron remediaciones para **G-11, G-17, G-18, G-20, G-21 y G-22**, y parcialmente para **G-25** y **G-26** ([`plan-exposicion-internet.md`](plan-exposicion-internet.md) §2). No cambia ningún estado de la matriz, que sigue describiendo el commit de la versión 2: sus estados se re-verificarán en la próxima verificación (las del borde, también en el entorno real) |

**Qué cambió respecto a la versión 1 (solo lo afectado; el resto de filas no se tocó):**
- **V14.3.1** pasa de Parcial a **Cumple**: la caché de consultas se vacía al cambiar la identidad (`auth.store.ts:131-142`), con pruebas de aislamiento entre usuarios. **G-13 resuelta** (se conserva en la tabla de brechas como historial). Es un requisito de nivel 1: el nivel 1 pasa de 45 a 46 cumplidos.
- **V3.7.2**: la evidencia incluye ahora que tras un cierre voluntario no se conserva la ruta de retorno (`RequireAuth.tsx:33-42`); el estado no cambia (Cumple). Las referencias a `auth.store.ts` se desplazaron (comentario de V2.2.2 de 27-31 a 28-32) y se actualizaron.
- **V1.3.3, V1.3.5, V2.2.1** (mensaje del minuto de seguridad): evidencia ampliada con el validador de texto plano (`plain-text.validator.ts`, aplicado en `safety-minute.dto.ts`) y sus pruebas; el estado no cambia (Cumple).
- **V2.3.4**: evidencia ampliada con la protección de la carrera de medianoche (escritura condicionada por fecha, relectura y 409/404) y sus pruebas; el estado no cambia (Cumple).
- **V13.3.1**: la cita de `SECURITY.md` ahora remite a su §4 (el documento se reescribió); el estado no cambia (Parcial). El anexo C se ajustó a la nueva redacción de `SECURITY.md`.
- **V7**: sin cambios. Ningún requisito del capítulo V7 dependía de la caché del cliente.
- **Totales:** de 112 a **113** Cumple, de 51 a **50** Parcial (62 %, antes 61 %); V14 pasa de 56 % a 67 %. Brechas: 4 Altas sin cambio; Medias 11, de las cuales 1 resuelta (10 abiertas); Bajas 13; 27 abiertas. Historias propuestas: 4 (HS-01 a HS-04), sin cambio.
- Se recomprobaron por script y a mano las referencias archivo:línea de los archivos modificados en `60573a8..HEAD` que el informe cita (`auth.store.ts`, `RequireAuth.tsx`, `SafetyMinutesPage.spec.tsx`, `me-settings.e2e.spec.ts`); las desplazadas se corrigieron.

*Fin del informe.*
