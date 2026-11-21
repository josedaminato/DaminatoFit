# Verificación manual móvil — Fase 2.1

En el entorno de desarrollo de esta máquina **no había emulador Android (`emulator`/`adb`) ni dispositivo listado**. Los recorridos de UI en dispositivo **no se declaran verificados aquí**. Sí están cubiertos por pruebas de API/integración y unitarias de formularios.

## Preparación

```powershell
cd C:\dev\daminatofit
pnpm infra:up
pnpm db:migrate
pnpm dev:api
```

En otra terminal (emulador Android con `10.0.2.2`, o dispositivo con IP LAN):

```powershell
# apps/mobile/.env → EXPO_PUBLIC_API_URL=http://10.0.2.2:3000  (emulador)
# o http://<IP-LAN>:3000 (dispositivo físico)
pnpm mobile:daminatofit
```

Correo de prueba: http://localhost:8025

## DaminatoFit — entrenador

1. Abrir app → Bienvenida → Crear cuenta.
2. Completar nombre, email, contraseña, nombre comercial.
3. Si pide verificación: abrir Mailpit → link de verificación (o en `NODE_ENV=development` el login puede estar permitido sin exigir verificación).
4. Iniciar sesión.
5. Ir a perfil → bio + WhatsApp E.164 (`+54911...`) → guardar.
6. Alumnos → invitar email de prueba → ver estado `pending` en lista / Mailpit.
7. Ajustes → cerrar sesión → volver a entrar.

## DaminatoFit — alumno

1. Abrir link `daminatofit://invite?token=...` (desde Mailpit o copiar `inviteUrl` de la API).
2. Crear cuenta o iniciar sesión con el mismo email.
3. Aceptar invitación → home alumno → Contacto → WhatsApp.
4. Cerrar sesión y volver a entrar.

## Recuperación de contraseña

1. Olvidé mi contraseña → email → Mailpit.
2. Abrir link `daminatofit://reset-password?token=...`.
3. Nueva contraseña + confirmación → éxito → login con la nueva.
4. Reabrir el mismo link → debe fallar (token de un solo uso).

## Eliminación de cuenta

1. Ajustes → Eliminar mi cuenta → confirmar alerta.
2. Contraseña + escribir `ELIMINAR` → cuenta borrada → vuelve a bienvenida.
3. Login con las mismas credenciales → debe fallar.

## PupiApp

```powershell
pnpm mobile:pupiapp
```

1. Verificar que **no** aparece registro público de entrenador.
2. Bootstrap (una vez):

```powershell
curl -X POST http://127.0.0.1:3000/v1/admin/bootstrap-pupiapp -H "content-type: application/json" -d "{\"secret\":\"$env:PUPIAPP_BOOTSTRAP_SECRET\",\"name\":\"Pupi\",\"email\":\"pupi@example.com\",\"password\":\"password123\"}"
```

3. Login entrenadora → invitar alumno → alumno acepta con `pupiapp://invite?token=...`.
4. Comprobar que una sesión/token de DaminatoFit no abre datos de PupiApp.
