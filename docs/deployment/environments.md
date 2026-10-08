# Entornos y base de datos

## Modelo

**Una instancia de PostgreSQL por entorno, compartida por todas las
aplicaciones, con una base y un usuario por aplicación.**

| Entorno | Instancia | Quién la administra |
|---|---|---|
| Local | Contenedor compartido en `infrastructure/dev-infra/` | Cada desarrollador en su máquina |
| QA | Servidor gestionado (Azure Database for PostgreSQL) | Plataforma |
| Producción | Servidor gestionado, separado del de QA | Plataforma |

Lo que se comparte es el **servidor**, no los datos: cada aplicación tiene su
base y su usuario, y ese usuario no puede ver las bases de las demás.

### Por qué compartir el servidor

Un servidor que respaldar, parchear, monitorizar y dimensionar, en vez de uno
por aplicación. Para una cartera de aplicaciones internas, el ahorro de
operación es real y el aislamiento por base es suficiente.

### Por qué no compartir también la base

Una base por aplicación da aislamiento de permisos, migraciones independientes
(cada proyecto aplica las suyas sin coordinar despliegues), copias y
restauraciones por aplicación, y la posibilidad de mover una aplicación a su
propio servidor sin tocar su código: solo cambia `DATABASE_URL`.

## Convención de nombres

`snake_case` del nombre del proyecto, idéntico para base y usuario:

| Proyecto | Base | Usuario |
|---|---|---|
| Mi Cliente AG | `mi_cliente_ag` | `mi_cliente_ag` |
| Portal de Proveedores | `portal_proveedores` | `portal_proveedores` |

Sin guiones: obligarían a entrecomillar el identificador en cada sentencia SQL.

En QA y producción, el **usuario lleva el sufijo del entorno**
(`mi_cliente_ag_qa`, `mi_cliente_ag_prod`) con contraseñas distintas, para que
una credencial filtrada de QA no abra producción.

## Permisos

La aplicación se conecta con un usuario que es **dueño de su base y de nada
más**. Nunca con el superusuario.

```sql
CREATE USER mi_cliente_ag_qa WITH PASSWORD '<del almacen de secretos>';
CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag_qa;
REVOKE CONNECT ON DATABASE mi_cliente_ag FROM PUBLIC;
```

El `REVOKE` importa más de lo que parece: por defecto, **cualquier usuario del
servidor puede conectarse a cualquier base**. Sin él, el aislamiento entre
aplicaciones es una convención, no un control.

Las migraciones de Prisma se ejecutan con ese mismo usuario, que es dueño de la
base y por tanto puede crear y alterar tablas. No hace falta un usuario
privilegiado aparte.

## Credenciales

| Entorno | De dónde salen |
|---|---|
| Local | `.env`, que no se versiona. Contraseña = nombre de usuario; el servicio solo escucha en `localhost` y no hay datos reales |
| QA y producción | Almacén de secretos de la plataforma (Azure Key Vault), inyectadas como variables de entorno |

Nunca una contraseña real en Git, ni siquiera de QA. Un secreto en el historial
no se arregla borrando el archivo: hay que rotarlo.

## Conexiones

PostgreSQL gestiona cada conexión con un proceso, así que una instancia
compartida se queda sin conexiones antes que sin CPU. Con varias aplicaciones y
varias réplicas de cada una, conviene:

- Limitar el pool por aplicación en la cadena de conexión:
  `?connection_limit=10&pool_timeout=20`
- Vigilar `max_connections` del servidor frente a la suma de los pools.
- Si el servidor gestionado ofrece PgBouncer, usarlo. Con Prisma hace falta
  añadir `?pgbouncer=true`.

Es la contrapartida de compartir servidor, y es manejable, pero hay que
mirarla: no se descubre sola hasta que un despliegue agota las conexiones de
todos a la vez.

## Local: cómo trabajar

```bash
# 1. Levantar la instancia compartida (una vez por máquina)
cd ~/dev-infra && docker compose up -d

# 2. Dar de alta el proyecto (una vez por proyecto)
docker compose exec postgres psql -U postgres \
  -c "CREATE USER mi_cliente_ag WITH PASSWORD 'mi_cliente_ag';" \
  -c "CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag;"

# 3. En el proyecto: .env y backend/.env
# DATABASE_URL=postgresql://mi_cliente_ag:mi_cliente_ag@localhost:5433/mi_cliente_ag?schema=public

# 4. Migrar y sembrar
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed
```

Detalle en [`infrastructure/dev-infra/README.md`](../../infrastructure/dev-infra/README.md).

### Base dedicada para un proyecto concreto

El `docker-compose.yml` de cada proyecto trae un servicio `postgres` bajo el
perfil `local-db`, apagado por defecto:

```bash
docker compose --profile local-db up -d postgres
```

Úsalo solo con motivo (una versión distinta de PostgreSQL, una prueba
destructiva): te separa del modelo de los entornos de arriba.

## Despliegue

Los pipelines construyen y verifican imágenes, pero **no despliegan**: el
runtime de destino es una decisión de cada proyecto que necesita su propio ADR
(ADR-012). Cuando se decida, `DATABASE_URL` se inyecta desde el almacén de
secretos del entorno y nada más cambia en la aplicación.
