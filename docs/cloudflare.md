# Cloudflare — DNS, SSL, WAF y rate limits

Configuración en el panel de Cloudflare para `simplecite.com.bo`. Todo esto es
**[manual]** en el dashboard (o vía API/Terraform); aquí están los valores exactos.

## 1. DNS

| Tipo  | Nombre         | Destino                                               | Proxy      |
| ----- | -------------- | ----------------------------------------------------- | ---------- |
| CNAME | `*` (wildcard) | `cname.vercel-dns.com` (las landings/panel en Vercel) | 🟠 Proxied |
| A     | `api`          | `<IP del VPS>`                                        | 🟠 Proxied |
| CNAME | `www`          | `simplecite.com.bo`                                   | 🟠 Proxied |

- El wildcard `*.simplecite.com.bo` resuelve los subdominios de tenant
  (`clinica-x.simplecite.com.bo`) → Vercel, que sirve el Next.js. El middleware
  de Next extrae el slug del subdominio.
- `api.simplecite.com.bo` → VPS (Traefik).
- En Vercel: agregar el dominio wildcard `*.simplecite.com.bo` al proyecto web.

## 2. SSL/TLS

- Modo: **Full (strict)**. Traefik en el VPS sirve un certificado válido de
  Let's Encrypt, y Vercel maneja su propio TLS → strict es seguro y correcto.
- **Always Use HTTPS**: ON.
- **Minimum TLS Version**: 1.2.
- **HSTS**: habilitar (max-age 6 meses) una vez verificado que todo va por HTTPS.

## 3. WAF (reglas)

Crear **Custom Rules** (Security → WAF):

1. **Proteger webhooks** — solo permitir el origen del proveedor de pagos:

   ```
   (http.request.uri.path contains "/api/webhooks/")
   and not ip.src in {<rango_IPs_QR_Simple>}
   → Block
   ```

   (Si el proveedor no publica IPs fijas, omitir el bloqueo por IP y confiar en
   la firma HMAC; mantener el rate limit de abajo.)

2. **Endpoints públicos** — challenge a tráfico sospechoso:

   ```
   (http.request.uri.path contains "/api/public/")
   and (cf.threat_score gt 20)
   → Managed Challenge
   ```

3. **Bloquear métodos no usados** en la API:
   ```
   (http.host eq "api.simplecite.com.bo")
   and not http.request.method in {"GET" "POST" "PATCH" "DELETE" "OPTIONS"}
   → Block
   ```

## 4. Rate limiting (Security → Rate limiting rules)

Defensa perimetral que **complementa** el rate limit DB-backed del OTP en el API.

1. **OTP request** (anti-abuso de envío de WhatsApp):
   ```
   path eq "/api/public/tenants/*/otp/request" , method POST
   → 5 requests / 1 min por IP → Block 10 min
   ```
2. **OTP verify** (anti fuerza bruta del código):
   ```
   path contains "/otp/verify" , method POST
   → 10 requests / 1 min por IP → Managed Challenge
   ```
3. **Login del panel**:
   ```
   path eq "/api/auth/login" , method POST
   → 10 requests / 5 min por IP → Block
   ```
4. **API general**:
   ```
   host eq "api.simplecite.com.bo"
   → 600 requests / 1 min por IP → Managed Challenge
   ```

## 5. Bot protection / Turnstile

- **Bot Fight Mode**: ON (plan gratuito) o **Super Bot Fight Mode** (pago).
- **Turnstile**: crear un widget; poner el _site key_ en el frontend (formulario
  de OTP) y el _secret key_ en `TURNSTILE_SECRET_KEY` del API. El
  `TurnstileService` ya valida el token en `/otp/request` (no-op si el secret no
  está configurado, así que activarlo es seguro y gradual).

## 6. Orden de verificación tras configurar

1. `https://api.simplecite.com.bo/api/health` responde 200 con candado válido.
2. `https://clinica-demo.simplecite.com.bo` carga la landing (Vercel + wildcard).
3. Probar el rate limit: 6 POST rápidos a `/otp/request` → el 6º bloqueado por CF.
4. Webhook: confirmar que la regla WAF no bloquea al proveedor real (whitelist IP
   o solo HMAC).

> Nota: el rate limit de Cloudflare es **perimetral** (por IP, antes de llegar al
> VPS). El del API (`PublicOtpService`, DB-backed por phone+IP) es la segunda
> capa que sobrevive aunque el atacante esté detrás de CF. Defensa en profundidad.
