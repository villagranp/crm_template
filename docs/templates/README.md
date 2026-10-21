# Plantillas de la carga inicial de datos

Plantillas para cargar **proyectos**, **productos y familias**, **minutos de seguridad** y
**vínculos de usuarios con Entra ID** con el script `load:data`. Diseño, reglas y decisiones:
[`docs/implementation-plans/CARGA-INICIAL.md`](../implementation-plans/CARGA-INICIAL.md). Versión de
plantilla: **1**.

| Entidad | Archivos | Hojas / columnas |
|---|---|---|
| Proyectos | `plantilla-proyectos.xlsx`, `plantilla-proyectos.csv` | Hoja «Proyectos» |
| Productos y familias | `plantilla-productos.xlsx` (hojas «Familias» y «Productos»); en CSV, `plantilla-productos.csv` (productos) y `plantilla-productos-familias.csv` (familias) | Dos hojas |
| Minuto de seguridad | `plantilla-minuto-seguridad.xlsx`, `plantilla-minuto-seguridad.csv` | Hoja «Minutos» |
| Vínculos con Entra ID | `plantilla-vinculos-entra.xlsx`, `plantilla-vinculos-entra.csv` | Hoja «Vínculos»: «Correo o código de colaborador» y «Object ID (oid)» |

Cada libro XLSX trae la hoja de datos **vacía**, una hoja «Instrucciones» (columna, si es
obligatoria, formato, longitud y un ejemplo ficticio) y una hoja «Valores válidos». Los valores
válidos de estos archivos son los **catálogos que trae la semilla esencial** (países, tipos y
sectores de proyecto, unidades de medida); las familias no se siembran, así que esa lista va vacía.
**Los códigos de su instalación pueden diferir**: genere la plantilla desde su base con
`template` (paso 1) para obtener los códigos activos reales.

Los CSV de este directorio y los que escribe `template --format csv` llevan **BOM y finales de línea LF** (el lector acepta también CRLF). Llevan los encabezados, separador `,` o `;` (se detecta), UTF-8 y filas de datos con el
mismo número de columnas que el encabezado. Los archivos de este directorio no contienen datos
reales de clientes, colaboradores ni proveedores; los ejemplos usan correos `example.invalid`.

## Orden de carga

1. **Usuarios** (los responsables de los proyectos y quien ejecuta la carga). No se cargan con
   esta herramienta: se crean en Administración.
2. **Clientes** (carga masiva del Módulo 6, o desde la pantalla de Clientes). Los proyectos se
   enlazan por el **código CRM** del cliente (p. ej. `CLI-2026-00001`), el que el sistema asignó
   al crearlo y que se ve en su ficha.
3. **Proyectos** (`projects`).
4. **Productos y familias** (`products`): las familias del libro se crean antes que los
   productos. Es independiente de los pasos 2 y 3.
5. **Minutos de seguridad** (`safety-minutes`): independiente de los anteriores.

## Pasos exactos

Desde la raíz del repositorio. Sustituya `<entidad>` por `projects`, `products`, `safety-minutes` o `entra-identities`.

**1. Obtener la plantilla con los valores activos de su base** (opcional si usa la de este
directorio y sus códigos coinciden):

```bash
pnpm --filter @app/backend run load:data -- template projects --format xlsx --out ./plantillas
```

`template` no sobrescribe un archivo existente: use otra carpeta con `--out` o añada `--force`.

**2. Llenar la hoja de datos.** No cambie, borre ni reordene columnas que sobren o falten: un
archivo con una columna de más o de menos se rechaza completo. No deje filas de ejemplo. Las
fechas se escriben como **texto** `AAAA-MM-DD` (formato de celda «Texto»; una fecha de Excel se
rechaza). Un texto libre no puede empezar por `=`, `+`, `-` ni `@`.

**3. Validar** (no escribe nada en la base):

```bash
pnpm --filter @app/backend run load:data -- validate projects --file ./proyectos.xlsx
```

Opcional: añada `--actor <correo o código de colaborador>` para que además se compruebe que el
cliente es visible y activo para ese usuario y que los responsables son asignables.

**4. Aplicar**, con el usuario administrador activo que será el autor de lo creado:

```bash
pnpm --filter @app/backend run load:data -- apply projects --file ./proyectos.xlsx --actor admin@su-empresa.example
```

En producción (`NODE_ENV=production`) añada `--confirm-production`. Antes de escribir, el script
imprime el servidor, la base y el esquema de destino: compruébelos. Si `validate` encontró errores,
`apply` **no aplica nada**.

**5. Revisar el resultado.** El resumen cuenta, por hoja, las filas leídas, por crear, creadas,
que ya existen y con errores. Si hay errores o filas omitidas se escribe un informe
`informe-carga-<entidad>-<modo>-<fecha>.csv` junto a donde ejecutó el comando (o la ruta de
`--report`) con hoja, fila, columna, estado, código y motivo. Salida del proceso: **0** sin errores,
**1** errores de validación o de aplicación, **2** comando, archivo, actor o entorno rechazados.

**6. Borrar** el archivo de entrada cuando termine: puede contener correos de colaboradores. Los
informes no contienen datos de celdas (solo hoja, fila, columna y motivo), pero tampoco son para conservar.

### Productos en CSV

`--file` es el archivo de **productos**; el de **familias** es el mismo nombre con `-familias`
antes de `.csv`, en la misma carpeta (opcional si todas las familias ya existen):

```bash
pnpm --filter @app/backend run load:data -- apply products --file ./catalogo.csv --actor <actor>
# lee ./catalogo.csv (productos) y ./catalogo-familias.csv (familias, si existe)
```

## Qué hacer con los errores

El informe da la **fila del archivo** (la del encabezado es la 1, la primera de datos es la 2), la
columna y el motivo; nunca repite el valor de la celda.

| Código | Qué hacer |
|---|---|
| `MISSING_COLUMN`, `UNKNOWN_COLUMN`, `DUPLICATE_COLUMN`, `SHEET_NOT_FOUND` | Use la plantilla sin cambiar encabezados ni nombres de hoja |
| `REQUIRED_FIELD_MISSING` | Complete la celda obligatoria |
| `INVALID_DATE`, `INVALID_DATE_RANGE`, `INVALID_INTEGER`, `INVALID_FORMAT`, `MAX_LENGTH` | Corrija el formato o la longitud que indica el motivo |
| `FORMULA_NOT_ALLOWED` | El texto empieza por `=`, `+`, `-` o `@`, o es una fórmula: escriba el valor como texto |
| `UNKNOWN_REFERENCE`, `INACTIVE_REFERENCE` | El cliente, país, tipo, sector, responsable, familia o unidad no existe o está inactivo: use un código de la hoja «Valores válidos», o cree primero lo que falta (paso del orden de carga) |
| `CUSTOMER_NOT_USABLE`, `INVALID_OWNER` | El cliente no es visible o no está activo para el actor, o el responsable no puede asignarse |
| `DUPLICATE_IN_FILE` | La clave se repite en otra fila del mismo archivo: deje una |
| `CODE_CONFLICT` | El código de proyecto ya lo usa un proyecto de otro cliente o con otro nombre: cambie el código o el nombre |
| `TEMPLATE_CANNOT_SATISFY` | La parametrización de campos obligatorios exige unidad de medida o cantidad al clasificar y la plantilla no las trae: quite el tipo y el sector de las filas o pida ajustar la parametrización |
| `EXISTS_DIFFERENT` (estado «Advertencia») | El código, SKU o proyecto ya existe pero con datos distintos: se omitió **sin modificar**. Revise si el archivo o lo cargado es lo correcto (cambiar lo ya cargado se hace en la aplicación). No impide la carga |
| `CLASSIFICATION_FAILED` (estado «Advertencia») | El proyecto se creó pero no se guardó su tipo y sector: ábralo en Proyectos y clasifíquelo. Repetir la carga lo omite |
| `PAST_DATE` | El minuto de seguridad solo admite hoy o fechas futuras |
| `IDENTITY_TAKEN` | (`entra-identities`) Ese Object ID ya está vinculado a otro usuario: revise el archivo; un `oid` identifica a una sola persona |
| `ALREADY_EXISTS` (estado «Ya existe (omitida)») | No es un error: ya estaba cargado y no se modifica |
| Otro código (p. ej. `RESOURCE_CONFLICT`, `PROJECT_CODE_TAKEN`) | El sistema rechazó la fila por una regla de negocio; el informe indica el campo |

Corrija el archivo y vuelva a ejecutar **`validate`** hasta que salga con 0.

## Cómo repetir

La carga es **idempotente**: lo que ya existe (proyecto por código o por cliente + nombre, familia
por código, producto por SKU, minuto por fecha) se reporta como «ya existe» y se omite **sin
modificarlo**, así que puede volver a ejecutar el mismo archivo, o uno corregido, sin duplicar.
Para **cambiar** algo ya cargado use la aplicación: esta herramienta solo crea.

En el resumen, «ya existen con datos distintos» cuenta las filas omitidas que no coinciden con lo existente (advertencia `EXISTS_DIFFERENT`); «creadas con advertencia» las que necesitan reparación manual. Ninguna de las dos cambia el código de salida.

Si una ejecución de `apply` se interrumpió o salieron errores de aplicación, corrija la causa y
repita el mismo `apply`: solo se crea lo que falta.

## Ejemplos ficticios

Una fila válida de cada entidad (los códigos CRM, familias y correos son de ejemplo y no existen en
su base):

```csv
Nombre del proyecto,Código CRM del cliente,País,Ciudad,Dirección,Descripción,Fecha estimada de inicio,Fecha estimada de fin,Fecha estimada de decisión,Responsable,Tipo de proyecto,Sector,Código de proyecto
Edificio Torre Ejemplo,CLI-2026-00001,GT,Ciudad de Guatemala,"Avenida 1, zona 1",Proyecto ficticio de ejemplo,2027-01-15,2027-12-15,2026-12-01,responsable@example.invalid,EDIFICIO,COMERCIAL,
```

```csv
Código de familia,Nombre,Descripción,Orden
ACERO-LARGO,Aceros largos,Familia ficticia de ejemplo,10
```

```csv
SKU,Descripción,Código de familia,Código de unidad base
VAR-3-8,Varilla corrugada 3/8 (ejemplo),ACERO-LARGO,VAR
```

```csv
Fecha de visualización,Mensaje
2027-02-01,Mensaje ficticio de ejemplo: use siempre el casco en la obra.
```

## Vínculos con Microsoft Entra ID (`entra-identities`)

Para el corte a Entra ID ([ADR-027](../adr/ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md),
runbook en [`AUTHENTICATION.md`](../../AUTHENTICATION.md) §4.3). Vincula **usuarios que ya existen** con su
**Object ID** de Entra ID (Azure Portal > Microsoft Entra ID > Usuarios > Id. de objeto). **Siempre por `oid`,
nunca por correo**: el correo de la primera columna solo sirve para localizar al usuario del CRM.

```bash
pnpm --filter @app/backend run load:data -- validate entra-identities --file ./vinculos.xlsx
pnpm --filter @app/backend run load:data -- apply entra-identities --file ./vinculos.xlsx --actor admin@su-empresa.example
```

Una fila válida (el `oid` es ficticio; el correo, de ejemplo; **la hoja de datos de la plantilla va vacía**):

```csv
Correo o código de colaborador,Object ID (oid)
colaborador@example.invalid,00000000-0000-0000-0000-000000000001
```

Reglas: el usuario debe existir y no estar eliminado (puede estar suspendido); el `oid` es un GUID de 36
caracteres; **un `oid` ya vinculado a otro usuario es error** (`IDENTITY_TAKEN`); si el usuario **ya está
vinculado con ese mismo `oid`** se reporta «ya existe»; si lo está con **otro** `oid` se omite con la
advertencia `EXISTS_DIFFERENT` (no se modifica); un `oid` o un usuario repetido en el archivo es error
(`DUPLICATE_IN_FILE`). Crea **solo** la identidad: nunca toca roles, permisos, equipos ni estado. Cada
vinculación queda en la bitácora como `user.identity_linked`. `apply` exige un administrador activo con
`usuarios.editar` en `--actor`. Es idempotente. El informe **avisa de cuántas filas apuntan a usuarios con rol de administrador** (`ADMINISTRATOR_ROWS`, `LINKS_TO_ADMINISTRATOR`): no bloquea, pero revíselas, porque quien controle ese `oid` entra con todos los permisos. Vincule **antes** de que la gente entre por Entra ID.

Después de vincular, `auth:revoke-local` retira las credenciales locales (ver el runbook).

## Mantenimiento de estas plantillas

Los archivos se generan con `pnpm --filter @app/backend run load:data:templates` a partir de la
definición del código (`backend/src/modules/initial-data-load/initial-data-templates.ts`). Una
prueba unitaria falla si los encabezados o la versión de estos archivos no coinciden con los que
lee el código: al cambiar una columna, suba `INITIAL_DATA_TEMPLATE_VERSION` y regenere.
