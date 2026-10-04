# Malla de Turnos

Planificación de turnos para locales con turnos rotativos: restoranes, cafés, bares.

- Arma la semana y avisa si la malla se sale de la jornada legal chilena.
- Compara la gente planificada con la que el local necesita, hora por hora.
- Muestra el costo de personal sobre la venta, día por día.
- **Reparte las propinas** por horas trabajadas, con el factor que acuerda el equipo.
- **Turnos abiertos**: se publica un turno sin dueño y el primero que lo toma se lo queda.
- **Modelos de semana**: se guarda una semana tipo con nombre y se aplica a las que vengan,
  con quién entra y en cuántas semanas de una vez.
- Cada persona abre **su propia semana** con un link, sin cuenta ni contraseña.

## Cómo está armado

- Página estática publicada con GitHub Pages.
- Datos en Supabase (Postgres). `esquema.sql` tiene las tablas y las reglas de acceso.
- **Nada sensible vive en este repositorio.** Los datos del equipo están en la base,
  bajo reglas por fila; el rol anónimo no puede leer ninguna tabla y solo ejecuta
  tres funciones acotadas al token de cada persona.

## Configuración

`config.js` lleva la URL del proyecto de Supabase y su clave pública `anon`.
Ninguna de las dos es secreta: la `anon` está pensada para ir dentro de la página y por
sí sola no abre nada, porque quien manda son las reglas de la base.
La clave `service_role` **nunca** va en este repositorio.
