# SimpleCite Observability Stack

Stack de observabilidad (**Loki · Promtail · Prometheus · Grafana**) para SimpleCite.

## ⚡ Cómo se despliega (lee esto primero)

**No se despliega por separado.** Está **integrado en `../docker-compose.prod.yml`**,
así sube junto con el resto en el mismo deploy de Dokploy. Esta carpeta solo
contiene las **configuraciones** que ese compose monta:

- `loki/loki-config.yml`, `promtail/config.yml`, `prometheus/prometheus.yml`,
  `prometheus/alerts.yml`, `grafana/datasources.yml`, `grafana/dashboards/*`.

### Puesta en marcha en Dokploy

1. En el **Environment** del Compose define: `GRAFANA_ADMIN_USER`,
   `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_ROOT_URL` (= la URL pública de Grafana).
2. En **Domains** agrega un dominio para Grafana → service **grafana**, port **3000**
   (ej. `grafana.simplecite.com.bo`). Loki/Prometheus/Promtail quedan internos.
3. Redeploy. Grafana auto-provisiona los datasources (Loki + Prometheus) y el
   dashboard **"SimpleCite — Logs"**.

### Notas de adaptación a SimpleCite

- **Logs**: Promtail filtra contenedores cuyo nombre contiene `simplecite`
  (`simplecite-api/web/db`) y parsea el JSON de **pino** (`level` numérico→nombre,
  `msg`, `req.*`, `res.*`).
- **Métricas**: la API **no expone `/metrics`** (no instrumentada), así que
  Prometheus solo hace self-monitoring del stack. Si instrumentas la API,
  agrega un job a `simplecite-api:3001/metrics` en `prometheus/prometheus.yml`.
- El `docker-compose.yml` de esta carpeta es solo para correr el stack **suelto**
  en local (red `simplecite-internal`); el deploy real es el prod compose.

---

<details>
<summary>Documentación original del stack (referencia)</summary>

> Lo de abajo es la doc heredada (mencionaba "Axon"/FastAPI). Se mantiene como
> referencia general de Loki/Prometheus/Grafana.

Proporciona métricas, logs y dashboards listos para usar.

## Arquitectura

```
                     ┌──────────────┐
                     │   Backend     │  (:8000)
                     │  (FastAPI)    │
                     └──────┬───────┘
                            │ /metrics
                            ▼
                     ┌──────────────┐      ┌──────────────┐
                     │  Prometheus   │◄────│   Grafana    │  (:3000)
                     │   (:9090)    │      │  dashboards  │
                     └──────┬───────┘      └──────┬───────┘
                            │                     │
                     ┌──────┴───────┐             │
                     │Alertmanager  │             │
                     │   (:9093)    │             │
                     └──────┬───────┘             │
                            │                     │
                     ┌──────┴───────┐             │
                     │  Slack/Email │      ┌──────┴───────┐
                     │  (webhooks)  │      │    Loki      │
                     └──────────────┘      │   (:3100)    │
                                           └──────┬───────┘
                                                  │
                                           ┌──────┴───────┐
                                           │   Promtail   │
                                           │ (log shipper)│
                                           └──────────────┘
```

### Componentes

| Servicio         | Imagen                      | Puerto | Función                             |
| ---------------- | --------------------------- | ------ | ----------------------------------- |
| **Grafana**      | `grafana/grafana:11.5.0`    | 3000   | Visualización de métricas y logs    |
| **Loki**         | `grafana/loki:3.4.0`        | 3100   | Agregación y almacenamiento de logs |
| **Promtail**     | `grafana/promtail:3.4.0`    | —      | Recolector de logs desde Docker     |
| **Prometheus**   | `prom/prometheus:v3.3.0`    | 9090   | Recolección de métricas + alertas   |
| **Alertmanager** | `prom/alertmanager:v0.28.0` | 9093   | Enrutamiento de notificaciones      |

### Requisitos

- **Dokploy v0.29.7+** — el stack se despliega como un servicio Compose dentro de Dokploy
- **Backend Axon** ya desplegado en Dokploy (expone `/metrics` en puerto 8000)
- **Red `dokploy-network`** — todos los servicios se conectan a la red externa compartida de Dokploy

## Despliegue en Dokploy

### 0. Generar token de seguridad

Antes de desplegar, genera un token seguro para proteger el endpoint `/metrics`:

```bash
openssl rand -hex 32
```

**Guarda este token** — lo necesitarás configurar en **AMBOS** servicios (backend y observabilidad).

### 1. Crear proyecto en Dokploy

- En la UI de Dokploy, ve a **Projects → New Project**
- Nombre: `axon-observability` (o el que prefieras)

### 2. Crear Compose Service

- Dentro del proyecto, crea un nuevo **Compose Service**
- Repositorio: apunta al mismo repositorio del backend (o a un repo separado con estos archivos)
- **Rama**: `main` (o la que uses)
- **Ruta del archivo Compose**: `axon_observability/docker-compose.yml`

### 3. Configurar File Mounts

Dokploy necesita que los archivos de configuración se monten desde una ruta accesible.
Crea los siguientes mounts (en la sección **File Mounts** del servicio Compose):

| Mount Point en el contenedor                                         | Ruta del archivo (relativa al repo)                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/etc/loki/loki-config.yml`                                          | `axon_observability/files/loki/loki-config.yml`                 |
| `/etc/promtail/config.yml`                                           | `axon_observability/files/promtail/config.yml`                  |
| `/etc/prometheus/prometheus.yml`                                     | `axon_observability/files/prometheus/prometheus.yml`            |
| `/etc/prometheus/alerts.yml`                                         | `axon_observability/files/prometheus/alerts.yml`                |
| `/etc/alertmanager/alertmanager.yml`                                 | `axon_observability/files/alertmanager/alertmanager.yml`        |
| `/etc/alertmanager/templates/default.tmpl`                           | `axon_observability/files/alertmanager/templates/default.tmpl`  |
| `/etc/grafana/provisioning/datasources/datasources.yml`              | `axon_observability/files/grafana/datasources.yml`              |
| `/etc/grafana/provisioning/dashboards/dashboards.yml`                | `axon_observability/files/grafana/dashboards.yml`               |
| `/etc/grafana/provisioning/dashboards/definitions/axon-backend.json` | `axon_observability/files/grafana/dashboards/axon-backend.json` |

**Importante**: Las rutas `../files/` en el `docker-compose.yml` se resuelven desde el directorio
del compose dentro del repositorio. Dokploy mapea los File Mounts creando el directorio `files/`
en el nivel superior del proyecto. Ajusta las rutas según tu estructura de repositorio.

**Alternativa**: Si tu repositorio tiene el backend en la raíz, puedes crear un directorio `files/`
en la raíz que contenga los mismos archivos de configuración. El `docker-compose.yml` usa
`../files/` para referirse a este directorio.

### 4. Configurar variables de entorno

Crea un archivo `.env` en la raíz del repositorio (o configúralo en la UI de Dokploy):

```bash
# -- SEGURIDAD (OBLIGATORIO) --
# Token para autenticar contra /metrics del backend
# DEBE ser el mismo valor que METRICS_TOKEN en el backend
METRICS_TOKEN=el-token-que-generaste-en-paso-0

# -- Grafana --
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=tu_contraseña_segura
GRAFANA_ROOT_URL=https://grafana.tu-dominio.com

# -- Loki --
LOKI_RETENTION_PERIOD=744h

# -- Alertmanager --
ALERTMANAGER_EXTERNAL_URL=https://alertmanager.tu-dominio.com

# -- Slack (opcional, para notificaciones) --
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# -- Email (opcional, para notificaciones) --
ALERT_EMAIL_TO=alerts@tu-dominio.com
ALERT_EMAIL_FROM=alertmanager@tu-dominio.com
ALERT_EMAIL_SMARTHOST=smtp.gmail.com:587
ALERT_EMAIL_USERNAME=tu-email@gmail.com
ALERT_EMAIL_PASSWORD=tu-app-password
```

En Dokploy, puedes configurar las variables de entorno en la sección **Environment** del servicio.

**⚠️ IMPORTANTE**: El `METRICS_TOKEN` debe ser **idéntico** en:

- Backend Axon (`.env` del backend)
- Observabilidad Stack (`.env` de observabilidad)

### 5. Configurar dominios (Dokploy UI)

- **Grafana**: Asigna un dominio como `grafana.tu-dominio.com` desde la UI de Dokploy
  (sección **Domains** del servicio). Dokploy configura Traefik automáticamente.
- **Prometheus** y **Loki** no necesitan dominio público (son solo para consumo interno).
  Si necesitas acceder a ellos, asígnales dominio pero protégelos con autenticación.

### 6. Desplegar

- Haz clic en **Deploy** en la UI de Dokploy
- Verifica los logs del deploy para confirmar que todos los servicios iniciaron correctamente

## Seguridad

### Protección del endpoint `/metrics`

El backend expone métricas en `/metrics`, que **NO debe ser público** porque revela información interna (endpoints, latencias, tasas de error, volumen de tráfico).

**Solución implementada:** El endpoint `/metrics` requiere autenticación Bearer token.

#### Configuración

1. **Genera un token seguro** (ejecuta en tu terminal):

   ```bash
   openssl rand -hex 32
   ```

2. **Configura el token en AMBOS servicios:**

   **Backend Axon** (en su `.env` o variables de Dokploy):

   ```bash
   METRICS_TOKEN=el-mismo-token-que-generaste
   ```

   **Observability Stack** (en `axon_observability/.env`):

   ```bash
   METRICS_TOKEN=el-mismo-token-que-generaste
   ```

3. **Reinicia ambos servicios** para que apliquen los cambios.

#### Cómo funciona

```
Internet → api.tu-dominio.com/metrics
           ↓
           401 Unauthorized (sin token)

Prometheus (red interna) → backend:8000/metrics
                           ↓
                           Authorization: Bearer <token>
                           ↓
                           200 OK (métricas)
```

- **Sin token**: Cualquier request público a `/metrics` recibe `401 Unauthorized`
- **Con token**: Solo Prometheus (desde la red interna de Docker) puede acceder
- **El token viaja solo por la red interna** — nunca por internet

#### Verificación

Prueba que el endpoint está protegido:

```bash
# Desde tu máquina (sin token) — debe fallar
curl -I https://api.tu-dominio.com/metrics
# HTTP/2 401

# Desde el contenedor de Prometheus (con token) — debe funcionar
docker exec axon-observability_prometheus_1 \
  wget -qO- --header="Authorization: Bearer TU_TOKEN" http://backend:8000/metrics | head
```

### Contraseñas por defecto

| Campo         | Valor por defecto    | Acción requerida           |
| ------------- | -------------------- | -------------------------- |
| Grafana admin | `admin` / `changeme` | **Cambiar inmediatamente** |

**Cambia la contraseña de Grafana inmediatamente después del primer acceso.**

## Acceso

Una vez desplegado:

- **Grafana**: `https://grafana.tu-dominio.com` — login con `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`
- **Prometheus API**: `http://prometheus:9090` (solo desde la red interna de Docker)
- **Loki API**: `http://loki:3100` (solo desde la red interna de Docker)
- **Alertmanager**: `http://alertmanager:9093` (solo desde la red interna de Docker)

## Dashboards incluidos

### Axon Backend

Dashboard pre-configurado con los siguientes paneles:

| Panel                            | Fuente de datos | Descripción                                         |
| -------------------------------- | --------------- | --------------------------------------------------- |
| HTTP Request Rate                | Prometheus      | Tasa de requests/s total y por código (2xx/4xx/5xx) |
| HTTP Duration (p50/p95/p99)      | Prometheus      | Percentiles de latencia del backend                 |
| HTTP Errors Rate                 | Prometheus      | Tasa de errores 4xx y 5xx por segundo               |
| Active Requests (approx)         | Prometheus      | Estimación de requests activos                      |
| Requests by Endpoint             | Prometheus      | Top 20 endpoints por tasa de requests (tabla)       |
| **Active Alerts**                | Prometheus      | Alertas firing y pending de Prometheus              |
| **Targets Status**               | Prometheus      | Estado up/down de todos los targets                 |
| **Backend/Loki/Promtail Health** | Prometheus      | Indicadores de salud (stat panels)                  |
| Log Volume                       | Loki            | Volumen de logs por nivel (info/warning/error)      |
| Recent Error Logs                | Loki            | Últimos logs con nivel error/critical/fatal         |

### Cómo importar

El dashboard se auto-provisiona al iniciar Grafana. Si necesitas importarlo manualmente:

1. Grafana → **Dashboards → New → Import**
2. Pega el contenido de `grafana/dashboards/axon-backend.json`
3. Selecciona las fuentes de datos Prometheus y Loki

## Alertas

### Reglas de alertas configuradas

Las alertas se definen en `prometheus/alerts.yml` y se evalúan cada 15 segundos.

#### HTTP Alerts

| Alerta               | Severidad   | Condición                | Duración | Descripción                        |
| -------------------- | ----------- | ------------------------ | -------- | ---------------------------------- |
| `HighErrorRate5xx`   | 🔴 critical | >5% de requests con 5xx  | 2 min    | Alta tasa de errores de servidor   |
| `HighErrorRate4xx`   | 🟡 warning  | >20% de requests con 4xx | 5 min    | Tasa elevada de errores de cliente |
| `HighLatencyP95`     | 🟡 warning  | P95 > 2 segundos         | 5 min    | Latencia elevada                   |
| `CriticalLatencyP99` | 🔴 critical | P99 > 5 segundos         | 3 min    | Latencia crítica                   |
| `BackendDown`        | 🔴 critical | Backend no responde      | 1 min    | Backend caído                      |
| `LowRequestRate`     | 🟡 warning  | <0.1 req/s               | 10 min   | Tráfico inusualmente bajo          |

#### Infrastructure Alerts

| Alerta                      | Severidad   | Condición            | Duración | Descripción                     |
| --------------------------- | ----------- | -------------------- | -------- | ------------------------------- |
| `LokiDown`                  | 🔴 critical | Loki no responde     | 2 min    | Sistema de logs caído           |
| `PromtailDown`              | 🟡 warning  | Promtail no responde | 5 min    | Shipper de logs caído           |
| `PrometheusHighMemoryUsage` | 🟡 warning  | >1GB RAM             | 5 min    | Prometheus usando mucha memoria |

#### Business/Security Alerts

| Alerta                    | Severidad  | Condición               | Duración | Descripción                    |
| ------------------------- | ---------- | ----------------------- | -------- | ------------------------------ |
| `AuthLoginSpike`          | 🟡 warning | >10 req/s a /auth/login | 2 min    | Posible ataque de fuerza bruta |
| `HighAuthorizationErrors` | 🟡 warning | >5 errores 403/s        | 5 min    | Problema de permisos           |

### Configuración de notificaciones

Las alertas se envían a través de **Alertmanager** (`alertmanager/alertmanager.yml`).

#### Slack

1. Crea un webhook en Slack: https://api.slack.com/messaging/webhooks
2. Configura la variable `SLACK_WEBHOOK_URL` en el `.env`
3. Las alertas se enrutan por categoría a diferentes canales:
   - `#axon-alerts-critical` — alertas críticas
   - `#axon-alerts-security` — alertas de seguridad
   - `#axon-alerts-infra` — alertas de infraestructura
   - `#axon-alerts-performance` — alertas de performance

#### Email

Configura las variables SMTP en el `.env`:

```bash
ALERT_EMAIL_TO=alerts@tu-dominio.com
ALERT_EMAIL_FROM=alertmanager@tu-dominio.com
ALERT_EMAIL_SMARTHOST=smtp.gmail.com:587
ALERT_EMAIL_USERNAME=tu-email@gmail.com
ALERT_EMAIL_PASSWORD=tu-app-password
```

> **Nota**: Para Gmail, usa una [App Password](https://support.google.com/accounts/answer/185833) en lugar de tu contraseña normal.

### Personalizar alertas

Para añadir o modificar alertas, edita `prometheus/alerts.yml`:

```yaml
- alert: MiAlertaPersonalizada
  expr: <expresión PromQL>
  for: 5m
  labels:
    severity: warning # o critical
    category: http # o performance, infrastructure, security
  annotations:
    summary: 'Descripción corta'
    description: 'Descripción detallada con {{ $value }}'
```

Después de modificar, recarga Prometheus:

```bash
curl -X POST http://localhost:9093/-/reload
```

## Variables de entorno

| Variable                    | Obligatoria | Por defecto | Descripción                                                                                      |
| --------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `METRICS_TOKEN`             | **Sí**      | —           | Token Bearer para autenticar contra `/metrics` del backend. **Debe ser idéntico al del backend** |
| `GRAFANA_ADMIN_USER`        | Sí          | `admin`     | Usuario administrador de Grafana                                                                 |
| `GRAFANA_ADMIN_PASSWORD`    | Sí          | `changeme`  | Contraseña del administrador de Grafana                                                          |
| `GRAFANA_ROOT_URL`          | Sí          | —           | URL pública de Grafana (ej: `https://grafana.tu-dominio.com`)                                    |
| `LOKI_RETENTION_PERIOD`     | No          | `744h`      | Período de retención de logs en Loki (744h = 31 días)                                            |
| `ALERTMANAGER_EXTERNAL_URL` | No          | —           | URL pública de Alertmanager (para links en notificaciones)                                       |
| `SLACK_WEBHOOK_URL`         | No          | —           | Webhook de Slack para notificaciones de alertas                                                  |
| `ALERT_EMAIL_TO`            | No          | —           | Email destino para alertas                                                                       |
| `ALERT_EMAIL_FROM`          | No          | —           | Email remitente para alertas                                                                     |
| `ALERT_EMAIL_SMARTHOST`     | No          | —           | Servidor SMTP (ej: `smtp.gmail.com:587`)                                                         |
| `ALERT_EMAIL_USERNAME`      | No          | —           | Usuario SMTP                                                                                     |
| `ALERT_EMAIL_PASSWORD`      | No          | —           | Contraseña/App Password SMTP                                                                     |

## Troubleshooting

### Los dashboards no aparecen en Grafana

1. Verifica que los archivos de provisioning estén montados correctamente:
   ```bash
   docker exec axon-observability_grafana_1 ls /etc/grafana/provisioning/datasources/
   docker exec axon-observability_grafana_1 ls /etc/grafana/provisioning/dashboards/definitions/
   ```
2. Revisa los logs de Grafana:
   ```bash
   docker logs axon-observability_grafana_1 | grep -i provision
   ```

### Prometheus no puede alcanzar el backend

1. Verifica que ambos servicios estén en la misma red:
   ```bash
   docker network inspect dokploy-network
   ```
2. Confirma que el backend expone `/metrics`:
   ```bash
   docker exec axon-observability_prometheus_1 wget -qO- http://backend:8000/metrics | head
   ```
3. **Si recibes 401 Unauthorized**, verifica que el token esté configurado correctamente:

   ```bash
   # Verifica que el backend tenga METRICS_TOKEN configurado
   docker exec axon_backend_backend_1 env | grep METRICS_TOKEN

   # Verifica que Prometheus tenga el mismo token
   docker exec axon-observability_prometheus_1 env | grep METRICS_TOKEN

   # Prueba manualmente con el token
   docker exec axon-observability_prometheus_1 \
     wget -qO- --header="Authorization: Bearer TU_TOKEN" http://backend:8000/metrics | head
   ```

   **Importante**: El `METRICS_TOKEN` debe ser **idéntico** en el backend y en observabilidad.

### Promtail no envía logs a Loki

1. Verifica que Promtail pueda leer los logs de Docker:
   ```bash
   docker exec axon-observability_promtail_1 ls /var/lib/docker/containers/
   ```
2. Revisa los logs de Promtail:
   ```bash
   docker logs axon-observability_promtail_1
   ```
3. Verifica que el backend tenga la label `com.docker.compose.project=axon`:
   ```bash
   docker inspect $(docker ps -q -f name=axon-backend) --format '{{.Config.Labels}}'
   ```

### Loki no inicia

1. Revisa los logs de Loki:
   ```bash
   docker logs axon-observability_loki_1
   ```
2. Verifica que el directorio de datos sea escribible:
   ```bash
   docker exec axon-observability_loki_1 touch /loki/test_write
   ```
3. Asegúrate de que la configuración YAML sea válida:
   ```bash
   docker exec axon-observability_loki_1 loki -config.file=/etc/loki/loki-config.yml -verify-config
   ```
   > **Nota**: `-verify-config` solo está disponible en algunas versiones de Loki.

### Grafana no puede conectar con Loki

1. Verifica que Loki esté saludable:
   ```bash
   curl -I http://loki:3100/ready
   ```
2. Desde la UI de Grafana, ve a **Connections → Data Sources → Loki → Test**
3. Revisa que `loki` sea resoluble desde Grafana:
   ```bash
   docker exec axon-observability_grafana_1 getent hosts loki
   ```

### Las alertas no se envían a Slack/Email

1. Verifica que Alertmanager esté saludable:
   ```bash
   curl -I http://alertmanager:9093/-/healthy
   ```
2. Revisa los logs de Alertmanager:
   ```bash
   docker logs axon-observability_alertmanager_1
   ```
3. Verifica que las variables de entorno estén configuradas:
   ```bash
   docker exec axon-observability_alertmanager_1 env | grep -E "SLACK|EMAIL"
   ```
4. Prueba el webhook de Slack manualmente:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test alert from Alertmanager"}' \
     YOUR_SLACK_WEBHOOK_URL
   ```

### Prometheus no carga las reglas de alertas

1. Verifica que el archivo de alertas esté montado:
   ```bash
   docker exec axon-observability_prometheus_1 ls /etc/prometheus/alerts.yml
   ```
2. Valida la sintaxis de las reglas:
   ```bash
   docker exec axon-observability_prometheus_1 promtool check rules /etc/prometheus/alerts.yml
   ```
3. Recarga la configuración de Prometheus:
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```
4. Verifica las reglas cargadas:
   ```bash
   curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[].name'
   ```

### No veo métricas de FastAPI en Prometheus

1. Confirma que el backend tiene instalado `prometheus_fastapi_instrumentator`:
   ```bash
   docker exec axon-backend_backend_1 pip list | grep prometheus-fastapi-instrumentator
   ```
2. Verifica el endpoint de métricas:
   ```bash
   curl -s http://backend:8000/metrics | grep fastapi_requests_total
   ```
3. Si no aparece ningún métrico, verifica que el instrumentator esté inicializado en el código.

## Métricas disponibles

El dashboard asume que el backend usa `prometheus_fastapi_instrumentator` con la configuración
por defecto. Las métricas expuestas incluyen:

| Métrica                            | Tipo      | Descripción                                   |
| ---------------------------------- | --------- | --------------------------------------------- |
| `fastapi_requests_total`           | Counter   | Total de requests HTTP por método/path/código |
| `fastapi_request_duration_seconds` | Histogram | Duración de requests HTTP                     |
| `fastapi_request_size_bytes`       | Histogram | Tamaño de requests entrantes                  |
| `fastapi_response_size_bytes`      | Histogram | Tamaño de respuestas salientes                |

Si usas una versión reciente del instrumentator con `should_legacy_metrics=False`,
los nombres cambian de `fastapi_*` a `http_*`. Ajusta las queries del dashboard en ese caso.

## Notas técnicas

- **Sin `container_name`**: Dokploy requiere que NO se especifique `container_name` en los servicios,
  ya que él mismo gestiona los nombres para evitar colisiones.
- **Puertos**: Los puertos se exponen con `- "3000"` (sin mapeo al host) porque Dokploy usa Traefik
  como proxy inverso. No es necesario (ni recomendable) mapear puertos al host.
- **Volúmenes nombrados**: Los datos persistentes (Grafana, Loki, Prometheus) usan volúmenes nombrados
  para que sobrevivan a reinicios y redeploys.
- **Red externa**: Todos los servicios se conectan a `dokploy-network`, que es la red compartida que
  Dokploy crea para la comunicación entre servicios y con Traefik.

## Mantenimiento

### Respaldos

Los datos persistentes están en volúmenes Docker. Para respaldarlos:

```bash
# Loki
docker run --rm -v axon-observability_loki-data:/source -v /tmp/backup:/backup alpine tar czf /backup/loki-$(date +%Y%m%d).tar.gz -C /source .

# Prometheus
docker run --rm -v axon-observability_prometheus-data:/source -v /tmp/backup:/backup alpine tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz -C /source .

# Grafana
docker run --rm -v axon-observability_grafana-data:/source -v /tmp/backup:/backup alpine tar czf /backup/grafana-$(date +%Y%m%d).tar.gz -C /source .
```

### Actualización de dashboards

Los dashboards se auto-provisionan desde archivos. Para actualizar:

1. Modifica el archivo JSON en `grafana/dashboards/`
2. Redepliega el servicio en Dokploy (o reinicia Grafana)
3. Grafana recargará los dashboards automáticamente
