# ADR 0003 — Infraestructura inicial y migración futura

- **Estado:** aceptada (21/11/2026)
- **Contexto:** VPS Hostinger KVM 1 (Ubuntu 24.04, 1 vCPU, 4 GB RAM, 50 GB disco, 4 TB transferencia) actualmente usado por AppMédica. AppMédica **todavía no tiene clientes reales**; su uso es de desarrollo y pruebas. El objetivo comercial es minimizar gastos operativos sin perder la posibilidad de migrar.

## Decisión

1. **Desarrollo y estas fases:** solo entorno local (Docker Compose). **No se despliega ni se toca el VPS remoto.**
2. **Escenario inicial previsto (cuando el propietario autorice el despliegue):** VPS compartido temporalmente con AppMédica, con aislamiento estricto (contenedores, bases, usuarios, redes, límites de CPU/RAM, respaldos y monitoreo separados).
3. **Escenario futuro:** migrar DaminatoFit a un VPS propio o a infraestructura administrada cuando la carga, los ingresos o el riesgo lo justifiquen.

## Condiciones previas al despliegue compartido

Antes de poner DaminatoFit en el VPS hay que:

1. Auditar uso real de CPU, RAM, disco e IO de AppMédica (incluidos picos).
2. Confirmar que los datos presentes en AppMédica son solo de prueba, o tratarlos como sensibles de todos modos.
3. Aplicar límites de recursos por contenedor y redes Docker separadas.
4. Usar bases de datos, roles, credenciales y buckets distintos.
5. Tener un procedimiento de migración documentado y un plan de reversión.

## Diseño que hace migrable el producto

- API y worker en contenedores, configurados solo por variables de entorno.
- PostgreSQL con migraciones SQL versionadas y roles propios (`app_user`, `app_admin`, etc.).
- Videos en almacenamiento compatible con S3, **fuera** del disco del VPS.
- Dominio de la API desacoplado de las apps móviles (`EXPO_PUBLIC_API_URL`).
- Backups exportables (`pg_dump`) y restauración verificable.

## Consecuencias

- No se contrata infraestructura nueva en estas fases.
- El compose de producción y el procedimiento de migración se documentan cuando se autorice el primer despliegue; no se implementan contra el VPS ahora.
