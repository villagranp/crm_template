# Infraestructura de desarrollo compartida

Una sola instancia de PostgreSQL para todas las aplicaciones de la máquina, con
**una base y un usuario por aplicación**. Es el mismo modelo que en QA y en
producción (ver [`docs/deployment/environments.md`](../../docs/deployment/environments.md)).

## Puesta en marcha

Copia esta carpeta a un sitio neutro, fuera de cualquier proyecto:

```bash
cp -r infrastructure/dev-infra ~/dev-infra     # o C:\Dev\AG\dev-infra
cd ~/dev-infra
docker compose up -d
```

Vive aparte a propósito: no debe arrancar ni pararse con el ciclo de vida de
una aplicación concreta.

## Dar de alta un proyecto

Una vez por proyecto y por máquina. Con `mi_cliente_ag` como ejemplo:

```bash
docker compose exec postgres psql -U postgres -c "CREATE USER mi_cliente_ag WITH PASSWORD 'mi_cliente_ag';"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE mi_cliente_ag OWNER mi_cliente_ag;"
```

El usuario es **dueño de su base y de ninguna otra**. Así un proyecto no puede
tocar los datos de otro ni por accidente, que es justamente el riesgo de
compartir instancia.

En el `.env` del proyecto:

```
DATABASE_URL=postgresql://mi_cliente_ag:mi_cliente_ag@localhost:5433/mi_cliente_ag?schema=public
```

Y el mismo valor en `backend/.env`, que es el único que lee la CLI de Prisma.

### Convención de nombres

`snake_case` del nombre del proyecto, igual para la base y para el usuario:
`mi_cliente_ag`, `portal_proveedores`. Sin guiones: obligarían a entrecomillar
el identificador en cada sentencia SQL.

## Contraseñas

En local la contraseña es igual al nombre del usuario, y está bien: el servicio
solo escucha en `localhost` y no contiene datos reales. **En QA y producción
esto no aplica**: ahí las credenciales salen del almacén de secretos y son
distintas por entorno.

## Dar de baja un proyecto

```bash
docker compose exec postgres psql -U postgres -c "DROP DATABASE mi_cliente_ag;"
docker compose exec postgres psql -U postgres -c "DROP USER mi_cliente_ag;"
```

## Si prefieres una base dedicada para un proyecto

El `docker-compose.yml` de cada proyecto trae un servicio `postgres` bajo el
perfil `local-db`, apagado por defecto:

```bash
docker compose --profile local-db up -d postgres
```

En ese caso ajusta `DATABASE_URL` a `localhost:${POSTGRES_PORT}` y recuerda que
te separas del modelo de los entornos de arriba: lo que funcione aquí puede no
funcionar en QA.

## Qué NO va aquí

Datos reales de clientes, copias de producción y cualquier secreto. Es un
servicio de desarrollo sin respaldo: el día que borres el volumen, se pierde.
