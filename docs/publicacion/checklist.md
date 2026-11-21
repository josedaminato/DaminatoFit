# Checklist antes de presentar

Marcar solo lo que esté hecho de verdad. Hoy la columna de hecho está vacía a propósito.

## Común

- [ ] Identificadores definitivos (ni `com.example.daminatofit` ni `com.example.pupiapp`).
- [ ] Política de privacidad publicada en una URL.
- [ ] Texto legal revisado por alguien habilitado para la jurisdicción real.
- [ ] Eliminación de cuenta descrita en la ficha y probada en el build de revisión.
- [ ] Denuncia y bloqueo de contenido generado por entrenadores, o decisión explícita de no publicar hasta tenerlos.
- [ ] Derechos de íconos y nombre anotados fuera del repositorio.
- [ ] Usuarios de demostración creados en el entorno de revisión, sin datos personales de alumnos reales.
- [ ] `PUSH_PROVIDER=expo`, token de Expo y project id solo en el entorno de build, no en git.
- [ ] Push probado en un dispositivo iOS y en uno Android, o la ficha no promete notificaciones.
- [ ] Build de revisión instalado y recorrido: aviso, mensaje, no leídos, cambio de entrenador, WhatsApp, rechazo del permiso.

## Google Play

- [ ] Cuenta de consola confirmada y, si aplica, prueba cerrada de 12 testers / 14 días verificada contra la regla vigente.
- [ ] Data safety completado.
- [ ] `targetSdk` exigido en esa fecha.
- [ ] Declaración de `POST_NOTIFICATIONS`.
- [ ] Fichas separadas para cada marca.
- [ ] Capturas y gráfico de funciones en las medidas vigentes.

## App Store

- [ ] Program membership activo del titular correcto.
- [ ] Privacy Nutrition.
- [ ] Clave APNs o el método que Expo documente en ese momento.
- [ ] Nota al revisor con los usuarios de prueba.
- [ ] Revisión del riesgo 4.2.6 / 4.3 para PupiApp.

## PupiApp

- [ ] Titular de la cuenta y de la marca confirmado.
- [ ] Política y capturas propias.
- [ ] Espacio de prueba creado con el bootstrap, no con el registro público de DaminatoFit.

## Explícitamente fuera de esta fase

- Facturación, referidos, directorio, campañas y API comercial de WhatsApp.
- Despliegue al VPS.
