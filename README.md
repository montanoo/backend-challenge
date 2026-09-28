# Backend Challenge

API en NestJS con:

- `POST /auth/login-integration`: valida un JWT HS256 y entrega un token de integración de un solo uso (60 min).
- `POST /auth/redeem`: consume el token de integración; el segundo uso falla.
- `POST /payments`: pagos idempotentes con `Idempotency-Key` contra un core simulado lento.

**Stack:** NestJS 12 · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL 17 · Docker Compose · Vitest + Supertest · `jose`.

---

## Cómo ejecutarlo

Solo necesitas **Docker** y **Docker Compose**. Todo (API, base de datos, Prisma, pruebas) corre dentro de los contenedores.

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f backend
```

Al arrancar, el contenedor `backend`:

1. Es necesario esperar a que Postgres este `healthy`.
2. Aplica las migraciones (`prisma migrate deploy`).
3. Genera el cliente de Prisma.
4. Levanta Nest en modo watch (el código está montado, los cambios recargan solos).

La API queda en **http://localhost:3000**.

Para detener todo: `docker compose down` (conserva los datos) o `docker compose down -v` (borra la base de datos).

### Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Credenciales de Postgres | `user` / `password` / `backend_challenge` |
| `DATABASE_URL` | Conexión de Prisma (host `database` = servicio de Compose) | `postgresql://user:password@database:5432/backend_challenge?schema=public` |
| `JWT_SECRET` | Clave HS256 para validar el JWT de entrada | `openssl rand -hex 32` |
| `JWT_ISSUER` | `iss` esperado | `esolutions-auth` |
| `JWT_AUDIENCE` | `aud` esperado | `backend-challenge` |
| `INTEGRATION_TOKEN_TTL_MINUTES` | Vigencia del token de integración | `60` |
| `CORE_DELAY_MS` | Latencia del core simulado | `2000` |

> Si cambias `DB_PASSWORD` después del primer arranque, ejecuta `docker compose down -v`: Postgres solo toma la contraseña al inicializar el volumen.

---

## Generar tokens de prueba

```bash
docker compose exec backend node scripts/generate-token.ts                  # válido (5 min)
docker compose exec backend node scripts/generate-token.ts --expired        # expirado
docker compose exec backend node scripts/generate-token.ts --bad-signature  # firmado con otra clave
docker compose exec backend node scripts/generate-token.ts --wrong-aud      # audience incorrecta
```

El script firma con `JWT_SECRET`, `JWT_ISSUER` y `JWT_AUDIENCE` del `.env`.

---

## Probar la API con Postman

El repo incluye una colección lista para importar: `postman/backend-challenge.postman_collection.json`.

1. En Postman: **Import** → selecciona `postman/backend-challenge.postman_collection.json`.
2. Genera un JWT de prueba:
   ```bash
   docker compose exec backend node scripts/generate-token.ts
   ```
3. Abre la colección **Backend Challenge** → pestaña **Variables** → pega el JWT en `jwt` y guarda.
4. Ejecuta los requests **en orden** (uno por uno, o todos con **Run collection**).

La colección guarda sola los valores entre requests: el `integrationToken` que devuelve el login y un `Idempotency-Key` nuevo en cada "Crear pago". Cada request trae pruebas que validan el código de estado esperado.

| # | Request | Qué demuestra | Esperado |
|---|---|---|---|
| 1 | Login integration | Valida el JWT y entrega el token de integración | `200` |
| 2 | Redeem (primer uso) | Consume el token | `200` |
| 3 | Redeem (segundo uso) | El segundo uso falla | `401` |
| 4 | Crear pago (llave nueva) | Llama al core (tarda `CORE_DELAY_MS`) | `201` |
| 5 | Repetir pago (misma llave) | Mismo resultado sin volver a llamar al core (responde al instante) | `201`, mismo `id` y `coreReference` |
| 6 | Misma llave, otro payload | Llave reutilizada con otro body | `422` |
| 7 | Sin Idempotency-Key | Header obligatorio | `400` |
| 8 | Body inválido | Validación del DTO | `400` |

Para ver el rechazo de JWT inválidos, genera el token con `--expired`, `--bad-signature` o `--wrong-aud`, pégalo en `jwt` y ejecuta el request 1: responde `401`.

La variable `baseUrl` apunta a `http://localhost:3000`; cámbiala si usas otro puerto.

### Respuestas

`POST /auth/login-integration` → `200`

```json
{ "integrationToken": "Qm9hZ...", "expiresAt": "2026-09-28T02:00:00.000Z" }
```

`POST /auth/redeem` → `200`

```json
{ "redeemed": true, "redeemedAt": "2026-09-28T01:17:35.259Z" }
```

`POST /payments` → `201`

```json
{
  "id": 1,
  "amount": "10.50",
  "currency": "USD",
  "status": "APPROVED",
  "coreReference": "c014531e-7127-4a79-9f88-8391931082a2",
  "createdAt": "2026-09-28T01:07:11.285Z"
}
```

Si la misma llave llega **mientras la primera petición sigue en curso**, la segunda espera y devuelve el mismo resultado. Si después del tiempo de espera la primera no ha terminado, responde `409`. Postman envía los requests uno tras otro, así que la concurrencia real se prueba en el test e2e (ver [Pruebas](#pruebas)).

### Formato de error

Todas las respuestas de error tienen la misma forma:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["amount must be a positive number"],
  "path": "/payments",
  "timestamp": "2026-09-28T01:06:15.086Z"
}
```

Los errores no controlados devuelven `500` con un mensaje genérico; el detalle solo va a los logs.

---

## Pruebas

```bash
docker compose exec backend pnpm test       # unitarias
docker compose exec backend pnpm test:e2e   # e2e (requiere la base levantada)
```

- **Unitarias** (`src/auth/integration-jwt.verifier.spec.ts`): token válido, expirado y con firma incorrecta; además `iss`/`aud` incorrectos, sin `exp`, `HS512`, `alg: none` y valor mal formado.
- **E2E** (`test/payments.e2e-spec.ts`, Supertest): dos pagos **simultáneos** con la misma llave responden lo mismo y `CoreService.charge` se llama **una sola vez**; también replay, payload distinto (`422`) y llave faltante (`400`). Las pruebas limpian los registros que crean.

---

## Decisiones de diseño

**Validación del JWT.** `jose.jwtVerify` con `algorithms: ['HS256']` (bloquea `alg: none` y cambios de algoritmo), `issuer`, `audience` y `requiredClaims: ['exp']`: sin esto un token sin `exp` sería válido para siempre. Cualquier fallo responde un `401` genérico para no revelar qué validación falló.

**Token de integración.** 32 bytes aleatorios en base64url. Es opaco y no un JWT: el "un solo uso" exige estado en base de datos de todas formas, así que una firma no aporta nada. Solo se guarda su **hash SHA-256**; si la tabla se filtra, los tokens no sirven. SHA-256 basta (no bcrypt) porque el token tiene 256 bits de entropía y no se puede atacar por diccionario.

**Un solo uso sin condiciones de carrera.** El redeem es un único `UPDATE ... WHERE token_hash = ? AND used_at IS NULL AND expires_at > now()` (`updateMany`). Postgres bloquea la fila, así que entre peticiones concurrentes solo una actualiza 1 fila y el resto 0 → `401`. Leer y luego actualizar permitiría dos usos.

**Idempotencia.**

1. Se inserta la llave con estado `IN_PROGRESS`. La restricción `UNIQUE` hace de candado: solo una inserción gana.
2. La ganadora llama al core **fuera** de una transacción (no retiene una conexión durante la latencia) y después, en una sola transacción, crea el `Payment` y marca la llave `COMPLETED` guardando la respuesta.
3. Las perdedoras (`P2002`) consultan la llave cada 100 ms hasta verla `COMPLETED` y devuelven la respuesta guardada.
4. Se guarda un hash del body: la misma llave con otro payload → `422`.
5. `Payment.idempotencyKeyId` es `UNIQUE`: aunque el código fallara, la base no permite dos pagos por llave.

**Fallos.** Si el core falla, no hubo cobro: la llave se elimina y el cliente puede reintentar con la misma. Si el core cobró pero falla la escritura en base, la llave queda `IN_PROGRESS` a propósito: preferimos bloquear reintentos a cobrar dos veces (requiere conciliación, ver abajo).

---

## Qué cambiaría para varias réplicas

Ambos mecanismos ya se apoyan en operaciones atómicas de Postgres (`UPDATE` condicional e `INSERT` con `UNIQUE`), no en memoria del proceso. Por eso **ya son correctos** con varias réplicas que comparten la base. Lo que cambiaría es la eficiencia y la recuperación ante fallos:

1. **Espera de peticiones en curso.** Hoy las réplicas que pierden hacen *polling* a la base cada 100 ms; con mucho tráfico eso es carga innecesaria. Lo reemplazaría por notificaciones (`LISTEN/NOTIFY` de Postgres o pub/sub de Redis) o respondería `409` con `Retry-After` en lugar de esperar.
2. **Candados huérfanos.** Si una réplica muere a mitad del pago, la llave queda `IN_PROGRESS` para siempre. Agregaría un *lease* (`locked_until` + renovación) para que otra réplica pueda retomarla al vencer, y pasaría el `Idempotency-Key` al core para que el core también sea idempotente y se pueda conciliar sin cobrar dos veces.
3. **Estado en Redis (alternativa).** Mover el estado de corta vida a Redis: `SET key IN_PROGRESS NX PX <ttl>` como candado, un script Lua o `GETDEL` para el redeem de un solo uso, y expiración automática con TTL. Requiere Redis con persistencia/replicación (AOF, Sentinel o Cluster): si Redis pierde datos, se pierde la garantía. El `UNIQUE` de `Payment` en Postgres se queda como última defensa.
4. **Limpieza y expiración.** TTL para las llaves de idempotencia (por ejemplo 24 h) y limpieza de tokens vencidos, como un job programado que corra una sola vez entre réplicas (con `pg_try_advisory_lock` o un scheduler externo).
5. **Relojes.** La expiración usa la hora de la aplicación; con varias máquinas conviene comparar contra `now()` de la base (o garantizar NTP) para evitar desfases entre réplicas.
6. **Conexiones.** N réplicas × tamaño del pool deben caber en `max_connections`; pondría PgBouncer delante de Postgres.

---

## Estructura

```
src/
  auth/         login-integration, redeem, verificador JWT (+ unit tests)
  payments/     controller, service idempotente, DTO, pipe y decorador de Idempotency-Key
  core/         core simulado con latencia configurable
  prisma/       PrismaModule / PrismaService
  common/       filtro global de errores
  app.setup.ts  ValidationPipe + filtro (compartido por main.ts y las pruebas)
prisma/         schema y migraciones
scripts/        generate-token.ts
postman/        colección de Postman
test/           pruebas e2e
```

## Limitaciones conocidas

- El stage `prod` del Dockerfile no puede correr `prisma migrate deploy` porque `prisma` es devDependency; en un despliegue real las migraciones irían en un paso aparte (job o contenedor de migración).
- El estado `FAILED` del enum no se usa: ante un fallo del core se libera la llave en lugar de guardar el error.
