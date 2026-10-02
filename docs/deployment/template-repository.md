# Publicar la plantilla en Azure DevOps

Guía para dejar esta plantilla como repositorio del que nacen todos los
proyectos nuevos. Se hace **una vez**; después, cada proyecto sale de aquí.

---

## 0. Estrategia: cómo se reutiliza

Azure Repos no tiene "template repository" como GitHub. Hay dos formas de
derivar un proyecto, y conviene elegir una a conciencia:

| Estrategia | Cómo | Cuándo usarla |
|---|---|---|
| **A. Copia limpia** | Se copia el contenido, se reinicia el historial (`git init`) | El proyecto no va a recibir mejoras de la plantilla. Historial limpio desde el día uno |
| **B. Remoto `template`** | Se clona con `--origin template`, se añade `origin` al repo del proyecto y se conserva el remoto de la plantilla | El proyecto quiere poder traer mejoras posteriores con `git pull template main` |

**Recomendación: B.** El coste es un remoto extra y algún conflicto ocasional al
traer cambios; a cambio, una corrección en el pipeline o en el guard de
permisos llega a todos los proyectos sin copiar y pegar. Con la estrategia A,
la plantilla y los proyectos se separan el primer día y ya no vuelven a
encontrarse.

Lo que **no** conviene: bifurcar (fork) dentro de Azure DevOps. Los forks están
pensados para contribuir de vuelta, no para derivar productos distintos, y los
pull requests entre ellos acaban mezclando historias que no tienen nada que ver.

---

## 1. Antes del primer push

Todo esto se hace en local, con la plantilla ya descomprimida.

```bash
cd project-template

# 1.1 Instalar y GENERAR EL LOCKFILE (los pipelines usan --frozen-lockfile:
#     sin pnpm-lock.yaml versionado, la compilación falla en el primer intento)
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install

# 1.2 Generar el cliente de Prisma y validar el esquema
pnpm --filter @app/backend run prisma:generate

# 1.3 Comprobar que todo está en verde
pnpm verify
```

Si `pnpm verify` falla, **se corrige antes de publicar**. Una plantilla que
nace en rojo enseña a todo el mundo que el rojo es aceptable.

### Verificación de seguridad antes de publicar

```bash
# No debe existir ningún .env fuera de los .env.example
find . -name ".env" -not -path "./node_modules/*"

# Ningún secreto, clave ni certificado
find . \( -name "*.pem" -o -name "*.key" -o -name "*.pfx" \) -not -path "./node_modules/*"
```

Ambos comandos deben devolver vacío.

---

## 2. Crear el repositorio

En Azure DevOps: **Proyecto → Repos → New repository**.

- Nombre sugerido: `project-template`
- Tipo: Git
- **No** marcar "Add a README" ni `.gitignore`: la plantilla ya los trae y un
  archivo autogenerado obliga a resolver un conflicto en el primer push.

```bash
cd project-template

git init -b main
git add .
git commit -m "chore: plantilla empresarial v1.0.0

Gobernanza, estándares, 18 ADR, 9 agentes y 25 skills.
Sistema de diseño Grupo AG sobre Material UI.
Núcleo de gestión: usuarios, roles, permisos, opciones de menú y asignaciones.
Sin funcionalidad de negocio."

git remote add origin https://dev.azure.com/<organizacion>/<proyecto>/_git/project-template
git push -u origin main
```

---

## 3. Marcar la versión

```bash
git tag -a v1.0.0 -m "Primera versión publicable de la plantilla"
git push origin v1.0.0
```

Las etiquetas importan más de lo que parece: un proyecto necesita poder decir
"nací de la v1.0.0" cuando, seis meses después, intente traer mejoras.

---

## 4. Proteger `main`

**Repos → Branches → `main` → Branch policies.** Mínimo:

| Política | Valor | Por qué |
|---|---|---|
| Require a minimum number of reviewers | 1 (2 si hay equipo) | Nadie publica en la plantilla sin revisión |
| Check for linked work items | Opcional | Trazabilidad |
| Check for comment resolution | Activado | Un comentario sin resolver no se pierde al aprobar |
| Build validation | `template-pr` (ver §5) | El quality gate deja de ser opcional |
| Limit merge types | Squash merge | Historial legible |

Sin build validation, el pipeline existe pero no impide nada. Es el paso que
más se olvida y el que hace que todo lo demás sirva.

---

## 5. Crear los pipelines

**Pipelines → New pipeline → Azure Repos Git → `project-template` → Existing
Azure Pipelines YAML file.**

| Pipeline | Archivo | Nómbralo |
|---|---|---|
| Validación de PR | `/azure-pipelines/pull-request.yml` | `template-pr` |
| CI del backend | `/azure-pipelines/backend.yml` | `template-backend` |
| CI del frontend | `/azure-pipelines/frontend.yml` | `template-frontend` |

Después de crear `template-pr`, vuelve a §4 y engánchalo como *build
validation* de `main`.

### Variables que hay que dar de alta

**Pipelines → Library → Variable group** (o variables del propio pipeline):

| Variable | Dónde se usa | Nota |
|---|---|---|
| `TEST_JWT_SECRET` | `backend.yml`, pruebas de integración | Márcala como **secreta**. Es sólo de pruebas, pero se trata como secreto |
| `CONTAINER_REGISTRY_CONNECTION` | `backend.yml`, `frontend.yml` | Vacía mientras no se publiquen imágenes |

Si no creas `TEST_JWT_SECRET`, la etapa de pruebas de integración del backend
falla al arrancar la aplicación: la validación de entorno exige el secreto
cuando `AUTH_PROVIDER=local`.

---

## 6. Crear un proyecto nuevo a partir de la plantilla

Estrategia B (recomendada):

```bash
# 1. Clonar la plantilla dejando su remoto con el nombre "template"
git clone --origin template \
  https://dev.azure.com/<org>/<proy>/_git/project-template mi-proyecto
cd mi-proyecto

# 2. Apuntar al repositorio del proyecto nuevo (créalo antes, vacío)
git remote add origin https://dev.azure.com/<org>/<proy>/_git/mi-proyecto
git push -u origin main

# 3. Preparar el entorno
./infrastructure/scripts/bootstrap.sh
docker compose up -d postgres
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed
pnpm verify
```

Estrategia A (copia limpia), si el proyecto no va a seguir la plantilla:

```bash
git clone --depth 1 https://dev.azure.com/<org>/<proy>/_git/project-template mi-proyecto
cd mi-proyecto && rm -rf .git && git init -b main
```

### Personalización obligatoria del proyecto nuevo

1. `package.json` raíz: `name`, `description`.
2. `README.md` y `CHANGELOG.md`: contexto del producto, no de la plantilla.
3. `.env`: `APP_NAME`, `JWT_ISSUER`, `JWT_AUDIENCE`, `AUTH_PROVIDER`.
4. `frontend/public/brand/` y `frontend/src/theme/tokens.ts` si el cliente no es
   Grupo AG (Skill `design-system`).
5. `prisma/seed/access-catalog.ts`: módulos, permisos y opciones del proyecto
   (Skill `access-management`).
6. Revisar los 18 ADR heredados. Los que no apliquen se marcan como
   *Superseded* con su razón; **no se borran**.
7. Repetir §4 y §5 en el repositorio del proyecto: políticas de rama y
   pipelines propios.

---

## 7. Traer mejoras de la plantilla (sólo estrategia B)

```bash
git fetch template
git checkout -b chore/actualizar-plantilla
git merge template/main          # o: git merge v1.2.0 para una versión concreta
# resolver conflictos, normalmente en README, CHANGELOG y package.json
pnpm install && pnpm verify
```

Se hace por pull request como cualquier otro cambio. Los conflictos se
concentran en los archivos que cada proyecto personaliza, que son los mismos de
§6: es previsible y se resuelve rápido si nadie reescribió el esqueleto.

---

## 8. Cómo evoluciona la plantilla

- Un cambio en la plantilla entra por pull request contra `main`, con el
  `template-pr` en verde.
- Todo cambio se anota en `CHANGELOG.md`.
- Un cambio estructural necesita ADR **en la plantilla**, no en un proyecto.
- Cada conjunto de cambios publicable se etiqueta (`v1.1.0`) para que los
  proyectos puedan traerlo de forma controlada.
- Cambio incompatible (renombrar un módulo, cambiar el contrato de `/me/menu`):
  versión mayor y una nota en el CHANGELOG diciendo **qué tiene que hacer** cada
  proyecto para adoptarlo. Sin esa nota, nadie actualiza.

---

## 9. Errores que cuestan una tarde

1. **Publicar sin `pnpm-lock.yaml`.** Los pipelines usan `--frozen-lockfile` y
   fallan en la primera ejecución.
2. **Olvidar la build validation.** El pipeline corre, falla, y el pull request
   se aprueba igual.
3. **Clonar en Windows sin `.gitattributes`.** Los `.sh` llegan con CRLF y los
   contenedores responden `no such file or directory` sin más explicación. La
   plantilla trae el archivo; no lo borres.
4. **No crear `TEST_JWT_SECRET`.** Las pruebas de integración del backend no
   arrancan.
5. **Marcar "Add a README" al crear el repositorio.** Conflicto en el primer
   push, antes de haber escrito una sola línea.
6. **Dar de alta el repositorio con un `.env` real dentro.** Un secreto en el
   historial de Git no se borra reescribiendo el archivo: hay que rotarlo.
