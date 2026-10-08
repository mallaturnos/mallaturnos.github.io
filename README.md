# Malla de Turnos — la web de verdad

Carpeta del producto que reemplaza al prototipo del artifact. Decidido el **02-10-2026**:
Pedro eligió **A** (construir como definitivo, corriendo en los planes gratis) tras recibir de
Nicolás el par **GitHub + Supabase**.

## Estado al 02-10-2026, 13:10
- ✅ **Cuentas creadas por Pedro**: GitHub `mallaturnos` y Supabase (organización Tamarama, plan
  Free, proyecto en **São Paulo**).
- ✅ **Repositorio** `mallaturnos/mallaturnos.github.io`, público. Acceso mío por **deploy key**
  (solo ese repositorio; la mitad privada vive en `~/.ssh/mallaturnos_deploy`, fuera de git).
- ✅ **La app está publicada y conectada**: <https://mallaturnos.github.io> — los cuatro puntos
  del diagnóstico en verde, verificado con navegador contra el sitio real.
- ✅ `esquema.sql` escrito. **Sin aplicar todavía.**
- ⏳ Pedro crea su cuenta de dueño dentro de la app (pide confirmación por correo:
  `mailer_autoconfirm` está en `false`, verificado).
- ⏳ Aplicar el esquema: Pedro abre `esquema.sql` desde su repositorio, lo copia y lo pega en el
  **SQL Editor** de Supabase. **Así nunca necesito la contraseña de su base.**

## Nota sobre el caché
GitHub Pages sirve todo con `cache-control: max-age=600`, así que un cambio tarda hasta **10
minutos** en llegarle a quien ya visitó la página. Por eso los archivos se referencian con
`?v=N` en `index.html`: **al subir ese número, el navegador los pide de nuevo**. Hay que acordarse
de subirlo cuando se cambie `app.js`, `estilo.css` o `config.js`.

**Lo que el `?v=` NO cubre es `index.html`, que es justamente donde vive el `?v=`.** Esa página
también se cachea 10 minutos, así que quien entre dentro de esa ventana recibe el `index.html`
viejo, que sigue pidiendo la versión anterior, y no ve el cambio. Se arregla solo al expirar;
`Ctrl+F5` solo ahorra la espera. Lo preguntó Pedro el 06-10 —«¿por qué con F5 ahora?»— y la
respuesta honesta es que siempre fue así. Comprobado, no supuesto:

```
$ curl -sI https://mallaturnos.github.io/ | grep -i cache-control
cache-control: max-age=600
```

Por eso, al avisar de una publicación, **decir los 10 minutos** en vez de pedir un `Ctrl+F5` a
secas: pedir un atajo sin explicar para qué deja a quien lo recibe pensando que algo se rompió.

## La decisión de seguridad que ordena todo lo demás
**El trabajador no tiene cuenta.** Entra con un link que lleva su token. Por eso:

> El rol anónimo **no puede leer ni escribir ninguna tabla**. Solo puede ejecutar tres funciones
> —`mi_semana`, `marcar`, `tomar_turno`— que reciben el token y devuelven o escriben
> **únicamente lo de esa persona**.

Si se le diera permiso de lectura al anónimo sobre las tablas, cualquiera con la dirección de la app
vería **el equipo entero y los valores hora**. El diseño lo impide, no lo confía.

## Dos detalles que valen la pena
- **`tomar_turno` resuelve la carrera en la base**: el `UPDATE ... WHERE tomado_por IS NULL`
  garantiza que si dos personas aprietan «Lo tomo» en el mismo segundo, **solo una gana** y la otra
  recibe `false`. No depende de que la pantalla esté actualizada.
- **`marcar` no acepta cualquier día**: solo deja marcar un día en que la persona **efectivamente
  tiene turno**. Sin eso, con un token se podría marcar asistencia de días libres.

## Privacidad escrita en el esquema
`personas` **no tiene RUT, ni dirección, ni teléfono, ni correo**. Es la regla de Pedro del 17-sep y
es también lo que pide la **Ley 21.719** (vigente el 1-dic-2026). Las ausencias se guardan como letra
(`V`, `E`, `F`) y **no se guarda el motivo médico**: una licencia es dato de salud, que es sensible.

## La propina: separada en efectivo y tarjeta (decidido 02-10, msgs 2999–3000)
Pedro preguntó **«¿quién carga los 61.000 del sábado?»**, que es la mejor pregunta que se ha hecho
sobre esta función: **ahí se juega la confianza de todo el reparto**. La propina es plata de los
trabajadores; si el jefe teclea un número que nadie puede verificar, la app **no resuelve la
desconfianza, la digitaliza**.

Lo que se decidió:
- **Lo carga quien cierra la caja**, igual que hoy.
- **Va separada en efectivo y tarjeta.** La de tarjeta sale del cierre de la máquina, así que el
  garzón **la puede contrastar**; el efectivo es lo que siempre se discute. Y por el **art. 64** de
  la tarjeta **no se descuenta la comisión**, así que ese monto entra completo.
- **Queda a la vista de todos**: el monto del día y a qué hora se cargó van en el link de cada
  persona, junto con su factor (`mi_semana` ya los devuelve).
- **Toda corrección queda registrada** en `dias_cambios` por un trigger. Si el reparto ya se mostró
  y después cambia el monto, se puede ver.

**Siguiente paso cuando haya presupuesto**: conectar la caja para que el monto por tarjeta se cargue
solo. Ahí nadie teclea y la discusión se termina.

## Lo que falta decidir con Pedro
- Nombre de usuario de GitHub → define la dirección (`usuario.github.io/malla-turnos`).
- Si el token del link vence o no (hoy no vence; se puede rotar cambiando el token de la persona).

## Decisiones del 02-10 por la tarde, probando con datos reales
- **Marcaje libre mientras sea prototipo** (msg 3175): se puede marcar «llegué» cualquier día, no
  solo el del turno. Motivo de Pedro: con el límite no puede mostrar la app un martes si el turno es
  el sábado. **Para un piloto de verdad hay que reponerlo** — el SQL está en `arreglo-marcas.sql`.
  Si «llegué» no significa «estoy acá ahora», el planificado contra real no significa nada.
- **Sin feriados por ahora** (msg 3183). Se investigó: los dos servicios de feriados chilenos
  (`boostr.cl` y `apis.digital.gob.cl`) **no responden desde el navegador** — una página en GitHub
  Pages solo puede pedir datos a servicios que la autoricen, y estos no lo hacen. La vía era lista
  embebida + actualización anual mía. **Pedro dijo que no por ahora.**
- **Sin teléfono ni correo** de los trabajadores en la app.
- **Pendiente de responder**: si se agrega disponibilidad («la Luz no puede los miércoles»).
- **Dato legal a verificar**: si restoranes y locales de entretención están exceptuados de los
  feriados irrenunciables del comercio (Ley 19.973). Se lo dije **con reservas** porque no logré
  confirmarlo en la Dirección del Trabajo.

---

## 03-10-2026 — EL MODELO CAMBIÓ. Lee esto antes de tocar nada.

Pedro mandó **28 capturas del planning de Skello** y una tanda de la **Badgeuse**, y fijó un
criterio que manda sobre lo demás (`memory/criterio-producto.md`):

> «debe quedar funcionando lo más parecido a como funcionará en la realidad, independiente de
> que sea un prototipo».

De ahí salieron dos correcciones de fondo. **Lo anterior en este archivo describe el modelo
viejo en las partes que contradigan lo que sigue.**

### 1. El turno asignado lleva SUS PROPIAS horas  *(aplicado)*

`asignaciones` tiene ahora `inicio`, `fin`, `colacion`, `puesto` y `nota` propios.
**`turnos` dejó de ser la verdad y pasó a ser una PLANTILLA** que solo rellena los campos del
diálogo. En Skello se escriben las horas de cada turno; no se elige de una lista.

Ver `arreglo-puesto-en-turno.sql` (el puesto) y `arreglo-turno-con-horas.sql` (las horas y el
turno partido).

### 2. Varios turnos el mismo día  *(aplicado)*

Se cayó `unique (persona_id, fecha)`. En su lugar hay **dos índices parciales**: no el mismo
bloque dos veces, y **una sola ausencia por día**. La casilla de la malla dejó de ser un
`<select>` y es una **pila de bloques** con su diálogo.

**Dos errores que esto destapó y ya están corregidos:** `propina_de` repartía por asignación,
así que quien doblaba entraba dos veces y el redondeo no cerraba; y `recordar()` (el Deshacer)
no guardaba las horas, así que habría repuesto filas que el CHECK nuevo rechaza.

### 3. Lo que FALTA, en orden

- **Pieza 3 — reloj control.** Diseño ya decidido con Pedro, de las capturas de la Badgeuse:
  tres columnas **Previsto / Marcado / Remunerado**, «validar el día» **pide la venta de esa
  fecha**, y en la malla el día validado muestra lo planificado tachado con lo real debajo.
  Marcaje **por turno**, hora puesta por el **servidor**. Aparato: **lo más simple primero**
  (el link personal que ya existe); el modo tablet con PIN queda para después (msgs 3372-3373).
  **La foto al marcar NO se implementa** — el propio Skello la desaconseja citando a la CNIL, y
  la Ley 21.719 rige en Chile desde el 1-dic-2026.
- **Pieza 4 — el turno sin asignar no es otra tabla.** En Skello es **el mismo turno con la
  persona vacía**: en la vista Postes, «Non assigné» es una opción más del desplegable de
  quién lo cubre. Hay que fundir `turnos_abiertos` dentro de `asignaciones` con `persona_id`
  nulable. Síntoma actual de la separación: `tomar_turno` **no escribe en `asignaciones`**, así
  que un turno tomado no aparece en la malla hasta que alguien lo pasa a mano.

### Diferencias deliberadas con Skello (no son olvidos)

- **No avisamos por correo ni SMS.** Ellos sí. Nosotros **no guardamos teléfono ni correo** de
  los trabajadores (regla de Pedro del 17-sep). Si algún día esto quiere ser el **registro
  oficial de asistencia**, la **Res. Ex. N°38 de la DT** exige mandar un comprobante al correo
  del trabajador — y ahí hay que volver sobre esa regla. Pedro: *«una vez se instale esto a
  alguien de verdad, vemos ese tema legal»* (msg 3377).
- **Sin foto al marcar**, por lo dicho arriba.

### Anotado de las capturas y NO hecho

Fila al pie con horas por día y total · solapas **Empleados | Puestos** para dar vuelta la
malla (su vista Postes **es nuestra cobertura**, mejor resuelta) · vista Día como **línea de
tiempo con gráfico de necesidades** · **plantillas guardadas** aplicables a varias semanas y
convertibles en turnos sin asignar · **hoja de firmas** imprimible (en Chile, el registro de
asistencia) · **bloquear un período** · deshacer/rehacer en la barra · pausa en el **puesto**
(hoy está en el turno) y **color por puesto**.

Detalle completo en `../skello-capturas-03oct2026.md`.

---

## 03-10-2026, tarde — piezas 3 y 4, y el resto del día

### ✅ Pieza 3 — RELOJ CONTROL (hecha)

`arreglo-reloj-control.sql` + app. **Pedro tiene que pegar ese SQL.**

- Las **marcas pasan a ser por TURNO** (`marcas.asignacion_id` es la clave), con `entrada` y
  `salida` timestamptz. Con turno partido, marcar una vez al día no significa nada.
- **La hora la pone el servidor** (`now()` dentro de `marcar_turno`). Si la pusiera el
  teléfono, se cambia adelantando el reloj del aparato.
- `asignaciones.horas_pagadas` = la **tercera columna** de Skello. Vacío = vale la regla del
  local (`locales.pagar_marcado`); lleno = lo fijó el jefe. **No se elige sola entre lo
  planificado y lo real: se muestran los dos y el jefe decide viendo contra qué decide.**
- `horas_pagadas_de(asignacion)` es la **única** definición de «cuánto vale este turno», para
  que la propina, el costo y el banco de horas no se contradigan.
- **La propina se reparte por las horas que se pagan.** El que se va temprano ya no cobra lo
  mismo.
- **Cerrar el día pide la venta** (`dias.cerrado_en`). Es cuando el jefe hace la caja.
- La pestaña *Confirmaciones* ahora se llama **Control horario** (así le dice Skello en
  español). No se agregó una séptima pestaña.
- El aparato quedó en **lo más simple**: el link personal que ya existe. El modo tablet con
  PIN está pendiente, y **no cambia el modelo de datos** (msgs 3372-3373).
- **NO se implementa la foto al marcar.**

### Pieza 4 — el turno sin asignar

**Este título decía «✅ HECHA» mientras el párrafo de abajo decía que faltaba.** Las dos
cosas convivieron en el archivo hasta el 07-10. El código estaba escrito, sí; en la base de
Pedro no estaba aplicado. Un encabezado en verde sobre un cuerpo que lo desmiente no es un
detalle de redacción: hizo que durante cuatro días nadie volviera a mirar.

Consiste en fundir `turnos_abiertos` dentro de `asignaciones` con `persona_id` nulable.
**Aplicado de verdad el 07-10** — ver la sección de ese día.

### Lo demás que se hizo esta tarde

- **Las tres vistas se editan.** Semana, día y mes abren el diálogo. El día era la única de
  solo lectura y la inconsistencia se había introducido el mismo día.
- **Mes**: horario en la casilla, separadores de semana, fila de totales al pie, globo con la
  nota.
- **Ancho**: `.wrap` de 860 a 1600 px. 860 servía para un formulario, no para una malla.
- **Basurero por bloque** y `+` para agregar otro turno.
- **Atrasos en horas y minutos** (`307 min` → `5 h 7 min`).
- **Colación**, no «Pausa».

### Errores propios que vale la pena no repetir

1. **El `<dialog>` iba después de los `<script>`**, así que ninguno de sus botones quedó
   conectado. Cuatro síntomas, una causa. Desde entonces `on()` junta los selectores que no
   encuentra y **los muestra en pantalla** al arrancar — y en su primera corrida encontró
   otro control huérfano.
2. **Un arreglo introdujo el error siguiente**: al mostrar los siete días en «repetir», el
   día del propio turno quedó marcado **sin fecha** y se mandaba una fila con `fecha` nula.
3. **Faltó `.flat()`** en dos sitios al pasar `S.asign` a listas: *Limpiar* contaba 0 siempre
   y no borraba nunca, y la lista de puestos perdía los que solo viven en una asignación.
4. **`.fld{display:flex}` le ganaba al atributo `hidden`**, así que «Repetir también en» se
   veía al editar. Corregido de raíz con `[hidden]{display:none !important}`.
5. **Se cambió `datos.js` y casi se publica con la versión vieja** en el `?v=`.

**Patrón del día: la mayoría de estos los destapó una pregunta de Pedro, no una prueba mía.**
Las pruebas en node validan la lógica; lo que falla es la pantalla. Conviene abrir el
navegador y recorrer el flujo completo antes de decir que algo está listo.

---

## REGLA DURA: lo que se publica tiene que funcionar ANTES y DESPUÉS del SQL

El 03-10 se entregaron **tres migraciones en una tarde** (reloj control, puestos,
sin-asignar). Pedro recargó la app antes de pegar la tercera y **se quedó sin nada**:

```
column asignaciones.ofrecido_por does not exist
```

El patrón correcto ya estaba aplicado en la lectura de `puestos` —si la tabla no existe,
devuelve vacío y la app sigue andando— y en `abiertos` se omitió.

**Cómo se hace:** toda lectura que dependa de una migración recién escrita va envuelta, y
solo traga el error de «no existe»:

```js
try { return await pedir(sb.from('tabla_nueva')...); }
catch (e) {
  if (/does not exist|no existe|schema cache|falta un cambio/i.test(e.message || '')) return [];
  throw e;                      // un error de verdad SÍ se propaga
}
```

**Por qué importa más de lo que parece:** el SQL lo pega Pedro a mano, cuando puede. Entre
que se publica la app y que él corre el SQL pueden pasar horas. En ese rato la app tiene que
seguir sirviendo, aunque sea sin la función nueva. Entregar algo que deja la app inservible
hasta que el usuario haga una tarea manual es un mal intercambio, y se nota al instante.

---

## Cierre del 03-10-2026

### Hecho y en producción

| Pieza | Qué cambió |
|---|---|
| **1** | El turno asignado lleva **sus propias horas**. `turnos` queda como plantilla. |
| **2** | **Turno partido**: varios turnos el mismo día. El caso de Camila. |
| **3** | **Reloj control**: entrada y salida reales, previsto · marcado · **se paga**, cerrar el día con la venta. |
| **4** | El **turno sin asignar es un turno sin persona**. Desaparece la pestaña: de 6 a 5. |
| — | **Catálogo de puestos** con color y colación; renombrar arrastra a gente, turnos y dotación. |
| — | **Cargar el equipo desde una planilla**, ignorando las columnas vetadas. |
| — | **Mes** con horarios, separadores de semana y totales. **Día** como **línea de tiempo**. |
| — | Las **tres vistas** se editan. |

**Cuatro SQL aplicados por Pedro, en este orden**: `arreglo-puesto-en-turno` ·
`arreglo-turno-con-horas` · `arreglo-reloj-control` · `arreglo-puestos` · `arreglo-sin-asignar`.

### La vista del día: por qué es una línea de tiempo

Pedro dijo **«sigo sin entender Día»** dos veces. No era la explicación: era el formato. Era
una lista de tarjetas por horario, y **un día no es una lista**. Lo único que de verdad
importa mirar en un día es **dónde quedan huecos**, y con tarjetas había que calcularlo.

Ahora las horas corren de izquierda a derecha y cada turno es una barra. El hueco entre
Apertura (termina 16:30) y Cierre (entra 17:00) **se ve** como un espacio en blanco.

**Criterio que deja:** cuando el usuario no entiende una pantalla y existe un formato mejor
documentado, la confusión **es** el defecto. No se explica mejor: se cambia.

### Anotado y NO hecho

Plantillas de semana guardadas aplicables a varias semanas · bloquear una semana pasada ·
hoja de firmas imprimible (el registro de asistencia chileno) · tareas por turno · dar vuelta
la malla y ver los puestos como filas (su vista Postes) · gráfico de necesidad por hora en el
día · bitácora visible de quién cambió qué.

### Lo que NO se va a copiar de Skello, y por qué

- **Avisar por correo o SMS**: no guardamos teléfono ni correo de los trabajadores
  (regla de Pedro, 17-sep). Si algún día esto quiere ser el registro oficial de asistencia,
  la **Res. Ex. N°38 de la DT** lo exige y habrá que volver sobre esa regla.
- **Foto al marcar**: el propio Skello la trae apagada citando a la CNIL. La **Ley 21.719**
  rige en Chile desde el 1-dic-2026.
- **Etiqueta «Menor»**: el **art. 15 del Código del Trabajo** prohíbe que menores de 18
  trabajen donde se venden bebidas alcohólicas para consumir en el local. En un bar no
  aplica, y una etiqueta sin las reglas que activa es decoración.

---

## Cómo se entregan las migraciones (aprendido a golpes el 03-10)

**El SQL lo pega Pedro a mano en el editor de Supabase.** Eso impone tres cosas que el
03-10 se aprendieron mal:

1. **El editor corre el archivo COMO UN BLOQUE.** Si una línea falla, se deshace todo —
   incluso lo que ya había pasado. Queda la duda de qué quedó aplicado, y desde fuera no
   hay forma de saberlo.
2. **Las migraciones no son independientes.** `arreglo-sin-asignar` necesita
   `arreglo-reloj-control` (usa `horas_pagadas_de()` y `marcas.asignacion_id`). Se
   entregaron de a una sin decir el orden, y el resultado fue una hora de prueba y error.
3. **Una migración sin aplicar no puede romper la app.** El SQL se pega cuando él puede;
   entre medio pueden pasar horas.

### Lo que se hace ahora

- **Un solo archivo acumulado**: `arreglo-todo.sql`, con todas en orden, repetible. Si hay
  dudas de qué está aplicado, se pega ese y se acabó. **Cada migración nueva se agrega
  ahí además de publicarse suelta.**
- **Toda migración es idempotente.** Gracias a eso las trece se pudieron concatenar sin
  reescribir ninguna.
- **Las lecturas que dependen de una migración reciente toleran su ausencia**, mirando el
  **código crudo** de Postgres (`42703`, `42P01`, `PGRST204/205`) y **nunca el texto**:
  el 03-10 la tolerancia comprobaba el mensaje traducido, se mejoró ese mensaje y la
  tolerancia se cayó sola media hora después de arreglarla.
- **Los errores de base nombran qué falta**: «le falta la columna *equipo* de la tabla
  *personas*». Con trece archivos, «falta un cambio» no sirve de nada — y fue ese mensaje
  preciso el que destapó que `arreglo-equipos.sql`, del 02-10, nunca se había aplicado y
  el campo Equipo llevaba un día sin poder guardarse.

### `arreglo-todo.sql` NO es inocuo: vacía la dotación

Anotado el **04-10-2026** porque Pedro lo aplicó y después preguntó qué hacía — al revés
del orden conveniente, y la respuesta tenía que ser exacta.

El archivo se presenta como idempotente y «se puede pegar las veces que haga falta», lo que
es cierto, pero **eso no significa que no borre nada**. Tiene **siete `delete` y dos
`drop column`**:

- **`dotacion` se vacía entera**, dos veces y a propósito: el modelo pasó de filas por hora
  a filas por turno, y las viejas no se podían traducir. **Hay que volver a cargarla.** Es
  la única pérdida que el usuario nota.
- `asignaciones sin inicio ni ausencia` y `marcas sin asignación` también se borran, pero
  **antes de cada borrado hay un `update` que migra lo rescatable**: las horas se copian
  desde la plantilla `turnos` y las marcas se enganchan a su asignación. Solo se va lo que
  quedó sin significado.

**Lo que hay que decir al entregar este archivo**, y no se dijo: que la dotación queda en
blanco y que el marcaje libre queda activo (es de prototipo, hay que sacarlo para un piloto).
Un «se puede pegar las veces que quiera» tranquiliza sobre repetirlo, no sobre lo que hace
la primera vez.

### El traspaso manual es donde se pierde el tiempo, no el código

La tarde del 03-10 se fue una hora en aplicar migraciones, con el código y el SQL **ambos
correctos**. El cuello de botella estaba en el único tramo sin visibilidad: **Pedro copiando
texto de GitHub y pegándolo en Supabase**.

Lo que lo destrabó, en orden de utilidad:

1. **Un archivo acumulado** (`arreglo-todo.sql`) en vez de trece sueltos: elimina la pregunta
   «¿cuál me toca?», que ninguno de los dos podía responder con certeza.
2. **Que la app compruebe y lo diga**: antes de intentar, el botón pide las columnas nuevas y,
   si faltan, muestra **cuáles** y **el enlace** al archivo, en pantalla. Convierte «¿quedó
   aplicado?» en un clic. Eso además revela cuánto falta: resultó que faltaban **dos
   columnas**, no todo.
3. **El enlace `raw`**: en la vista normal de GitHub es fácil copiar medio archivo sin notarlo.
   `raw.githubusercontent.com` abre texto puro y basta `Ctrl+A`.
4. **Operaciones atómicas**: el botón de ejemplo creaba el local y fallaba después, dejando
   basura en cada reintento. Ahora deshace lo que creó. *Que un intento fallido deje restos es
   peor que el fallo: el usuario reintenta y cada vuelta empeora el desorden.*

**Regla:** cuando el arreglo está fuera de la app y depende de que el usuario lo encuentre,
no basta con que el error sea correcto — tiene que traer el camino. Y conviene reducir los
pasos manuales antes que explicarlos mejor.

---

## La vista por PUESTOS — hecha y publicada (03-10 22:46)

Pedro mandó de nuevo la captura de la vista «Postes» de Skello el 03-10 a las 21:06 y lo
describió mejor de lo que estaba anotado: **«se puede ver como empapelado y por puesto»**.

Eso es exactamente lo que la hace útil: con los puestos como filas se ve **de un golpe si un
puesto está cubierto toda la semana o tiene hoyos**, sin leer nombre por nombre.

**Qué se hizo:** un cambio entre **Personas** y **Puestos** arriba de la malla. Misma
semana, misma información, agrupada al revés. Está en `app.js` (`S.agrupar`,
`pintarSemanaPorPuesto`, botones `#agrPersonas` / `#agrPuestos`), commit `88b8e7a`, y
**servida en vivo** con `app.js?v=68`.

> **Nota del 04-10 08:00:** esta sección quedó escrita como plan y sobrevivió así a la
> construcción, que fue media hora después. Al entregarle las dos funciones a Pedro, el
> README decía «qué hay que hacer» de algo ya publicado y hubo que verificar contra el
> código y contra el sitio para saber a quién creerle. **Un pendiente que ya se hizo es
> peor que un pendiente sin anotar**: el segundo se descubre, el primero se cree.
> El commit `88b8e7a` tampoco ayudó — su mensaje solo menciona la asignación masiva
> aunque llevaba las dos funciones.

**Lo que trae de regalo**, y es lo que conviene no perder de vista:
- Debajo de cada día, **«2 pers. · 15h00»** — o sea **la cobertura metida en la misma
  pantalla**, en vez de separada en «¿Te alcanza la gente?».
- A la izquierda, el **total de horas por puesto en la semana** (`Ronde 76h`,
  `Manager 37h30`): dice **en qué se va la plata**, por puesto, de un vistazo.
- En las celdas, el **nombre de quien cubre** sale de un desplegable, así se reasigna desde
  ahí mismo.

**Patrón de Skello que ya apareció tres veces hoy:** no agregan pantallas, **agrupan la misma
información de otra forma**. Antes pasó con la cobertura (su vista Postes la absorbe) y con
la vista de día (la línea de tiempo reemplazó la lista de tarjetas).


---

## Modelos de semana — hecho y publicado (04-10-2026)

Pedro eligió el orden **A → B → C** de la lista del 04-10 (msg 3626) y esta es la **A**, la
que más pesa: una semana de local se parece muchísimo a la anterior, pero hoy se arma turno
por turno.

**Qué quedó:** botón **Modelos de semana** en la barra de la semana. Guarda la semana a la
vista con un nombre, y al aplicar un modelo deja elegir **quiénes entran**, **pegar solo la
forma** (turnos sin asignar) y abarcar **hasta 4 semanas seguidas**.

### Tres decisiones que vale la pena no volver a discutir

- **No se llaman «plantillas», se llaman `modelos_semana`.** En esta app «plantilla» ya
  significa la plantilla de un **turno** — es de donde `asignaciones.turno_id` saca el nombre
  y el color, y hay un `<select id="dPlantilla">` que es justo eso. Dos cosas distintas con
  el mismo nombre en el mismo modelo de datos se paga después, leyendo código. Se renombró
  **antes** de que Pedro aplicara el SQL, cuando todavía era gratis.
- **`sinAsignar` manda sobre el filtro de personas.** Si se pega solo la forma, elegir
  personas no significa nada. La primera versión filtraba igual, así que marcar «solo la
  forma» con nadie seleccionado dejaba **solo los turnos que ya venían sin asignar** — media
  semana perdida sin explicación. Ahora el filtro se ignora y **las pastillas se esconden**:
  la regla se ve en la pantalla en vez de estar escondida en el código.
- **Las ausencias no entran al modelo ni se pisan en el destino.** Lo advierte el tutorial de
  Skello y es obvio al pensarlo: una vacación de esta semana no se repite todas las semanas.
  Al aplicar se borran solo turnos (`inicio not null`), igual que `copiarSemana`.

### Cómo se verificó, sin tocar la base de Pedro

No hay forma de probar contra su Supabase sin su clave, así que se probó lo que sí se puede:
**`init()` acepta un cliente, así que se le inyectó uno falso** y se corrieron 12
comprobaciones sobre `aplicarModelo` — la aritmética de `dow + k*7` (lunes y domingo caen
donde deben, 3 semanas dan 9 turnos y 6 fechas, la última es el 25-10), el filtro por
persona, el caso del párrafo anterior y que ninguna fila lleve ausencia. Pasaron las 12.

Además se cruzaron **los 13 ids del diálogo contra el HTML**: un id mal escrito en el JS no
falla, simplemente no hace nada, y eso no lo encuentra ninguna prueba de sintaxis.

### Toda tabla nueva necesita su `GRANT`, y las policies no lo reemplazan

Fallo del 04-10, mío: Pedro aplicó el SQL y la app mostró
**«permission denied for table modelos_semana»** — con la tabla creada y sus policies bien
escritas.

`esquema.sql` hace `grant select, insert, update, delete on ALL TABLES in schema public to
authenticated`, y eso suena a que queda resuelto para siempre. **No lo está: alcanza solo a
las tablas que existían en ese momento.** Una tabla creada por una migración posterior nace
sin permisos y falla aunque todo lo demás esté perfecto.

- **Las policies deciden QUÉ FILAS ve cada uno; el `grant` decide si puede tocar la tabla
  siquiera.** Hacen falta los dos, y olvidar el segundo da un error que *parece* de permisos
  por fila y manda a revisar las policies, que están bien.
- `arreglo-puestos.sql` ya traía su `grant` por exactamente esta razón. **El precedente
  estaba escrito y no se copió.**

**Regla:** toda migración que haga `create table` lleva su `grant` en el mismo archivo.

**El fallo fue doble, y la segunda mitad es la que importa.** Además de faltar el `grant`,
la tabla nueva se había metido en `baseAlDia`, la comprobación de arranque — y
`faltaEnLaBase` no toleraba `42501`. Resultado: **una pieza opcional se llevó abajo la
pantalla entera** con un «Error al arrancar», justo lo que el principio *«una migración sin
aplicar no puede romper la app»* existe para evitar. El principio estaba escrito; la lista
de códigos no lo cumplía.

Ahora `42501` cuenta como «todavía no está», porque **una tabla creada sin su `grant` es una
migración aplicada a medias** y para la app es idéntica a una que falta. Y `explicar()`
distingue «permission denied for table X» de un rechazo por reglas por fila: suenan igual,
pero el primero es un `grant` que falta y el segundo una policy, y confundirlos manda a
revisar lo que está bien.
Al revisar esto se barrieron las tres tablas creadas por migraciones (`puestos`,
`modelos_semana`, `modelo_turnos`) y las tres lo tienen.

*Nota sobre el barrido:* el primer chequeo marcó `modelo_turnos` como sin permiso y era un
falso positivo del patrón de búsqueda —la línea estaba alineada con dos espacios antes de
`to`—. **Una verificación que falla por el espaciado es peor que no tenerla**, porque manda a
arreglar algo que ya está bien.

### Lo visual no lo encuentra ninguna prueba: hay que abrir el navegador

El 04-10 la pantalla de modelos pasó sintaxis, los 13 ids cruzados contra el HTML y 12
pruebas de lógica. **Los tres errores que encontró Pedro eran visuales**, y los vio en
tres capturas seguidas:

1. La frase de «solo la forma» partida en columnas.
2. El `Guardar` arriba, siendo la acción rara: *«¿por qué el guardar va arriba?»*. Tenía
   razón — guardar se hace una vez y aplicar todas las semanas, así que la frecuente va
   primero. Ahora cada sección tiene su botón y el pie solo cierra.
3. Las pastillas de semanas: *«si marcas el 2 queda en blanco el 1»*. El número es una
   **cantidad**, no una posición, así que con el 3 van llenos el 1 y el 2. Tal como estaba
   se leía «la tercera semana».

**El primero necesitó dos intentos, y el primero fue a ciegas.** Supuse que era el `<b>`
suelto dentro de un contenedor flex, lo envolví en un `<span>` y lo di por hecho sin mirar.
No era eso. Abriendo el diálogo en el navegador contra el sitio publicado aparecieron las
dos causas reales:

- **Especificidad**: `.fld label` (0,1,1) le gana a `.chk` (0,1,0), así que la frase salía
  con estilo de rótulo de campo — versalitas, 0,69rem y color tenue.
- **`.fld input` estiraba la casilla a 485px** de ancho, porque está pensado para campos de
  texto. Por eso flotaba sola y centrada encima de la frase.

**Regla:** cuando el cambio tiene pinta visual, `agent-browser` y una captura **antes** de
decir que está listo. `app.js` no está envuelto en IIFE, así que sus funciones son globales;
y aunque el `eval` corre en contexto aislado y no las ve, **un `.click()` sobre el elemento
dispara el manejador real de la app** — así se comprobó que el valor leído con el 3 marcado
es 3 y no 1.

### El detalle que casi convierte una mejora visual en un error silencioso

Llenar 1..N parecía puro CSS, pero `opcionesModelo()` lee la cantidad con
`querySelector('button[aria-pressed="true"]')`, **que devuelve el primero**. Marcar los
cuatro habría hecho que la app aplicara **siempre una semana**, sin avisar y sin que se
notara en pantalla. Por eso el relleno va por clase y `aria-pressed` queda solo en el
elegido.

### El despliegue tiene una trampa: `config.js`

**La copia de `config.js` del workspace está en blanco a propósito** (regla del 17-sep: nada
con forma de clave en este repositorio) y la del sitio tiene los valores reales. **Copiar la
carpeta completa al checkout de despliegue deja la app muerta.** Se publican solo
`app.js`, `datos.js`, `index.html`, `estilo.css` y los `.sql`; `config.js` y el README
público del sitio **no se tocan** — ese README es de 25 líneas y para quien llega al
repositorio, no las notas internas de 400.


## «Apliqué 4 semanas y no se ven»: dos diagnósticos plausibles y falsos (04-10)

Vale la pena dejar el camino completo, porque el error de método se repite más que la causa.

**El síntoma:** Pedro aplicó un modelo y las semanas siguientes estaban vacías.

1. **Primer diagnóstico: los turnos sin dueño son invisibles en el Mes.** Encajaba —él tenía
   «solo la forma» marcado y el Mes solo dibujaba filas de personas—, se verificó en el
   código y se le explicó con seguridad. **Era falso**: su siguiente captura mostró la
   semana del 19-10 vacía *incluida la fila Sin asignar*, que sí existe en la vista Semana.
2. **Segundo diagnóstico: el contador de semanas se reiniciaba.** Buscando en el código
   apareció que `pintarModelos()` terminaba con `marcarSemanas(1)` y se llama también
   **después de guardar**, así que marcar 4 → Guardar → Aplicar aplicaba 1. Error real y
   corregido. **Tampoco era la causa.**
3. **La causa:** el `confirm()` de «se pisan los turnos» — **lo había cancelado**. No se
   aplicó nunca nada. Lo resolvió una captura de la ventana del navegador, no el código.

**Lo que hay que aprender:** las dos primeras hipótesis eran coherentes con todo lo que se
sabía, y por eso mismo eran peligrosas. Lo que destrabó cada vuelta fue **pedir un dato que
distinguiera entre hipótesis** —«¿la semana del 5-10 tiene turnos, sí o no?»— en vez de
seguir razonando. Y el dato decisivo estuvo siempre a una pregunta de distancia: *¿qué decía
el mensaje al apretar Aplicar?*

**Los dos arreglos salieron igual**, porque eran defectos de verdad escondidos detrás del
síntoma equivocado: el contador que se reiniciaba y el Mes que no mostraba los turnos sin
dueño. Buscar la causa equivocada no fue tiempo perdido, pero **anunciarla como causa sí fue
un error**.

### Leer la versión en las capturas

La captura que confirmó el éxito mostraba el diálogo **sin cerrarse**, con el aviso adentro.
Eso no era un error nuevo: era que su navegador tenía una versión anterior en caché. Cuando
se itera rápido, **la pantalla del usuario y el código del repositorio no son lo mismo**, y
conviene mirar en cada captura qué versión está viendo antes de diagnosticar nada.


## Opción B: mover un turno arrastrándolo (04-10)

Pedro autorizó el orden A → B → C (msg 3626). Esta es la **B**.

Se arrastra el bloque a otro día o a otra persona, también desde y hacia la fila
**Sin asignar** — ese es el gesto útil para repartir turnos abiertos.

### Lo que se decidió y por qué

- **Las ausencias no se arrastran.** Son una por día y reemplazan a los turnos; moverlas
  abre casos que nadie pidió.
- **Soltar sobre alguien con ausencia ese día se rechaza, con el motivo.** No es una regla
  de negocio: es que `pintarCasilla` dibuja **solo** la ausencia cuando existe, así que el
  turno quedaría guardado y **invisible**. Guardar algo que no se ve es peor que no dejar
  guardarlo.
- **Solo en la vista por personas.** En la de puestos las filas no son gente: sus celdas no
  llevan `data-p`, y soltar ahí habría dejado el turno **sin dueño en silencio**. Si alguna
  vez se agrega, soltar tendría que cambiar el **puesto** y respetar a la persona.
- **Al mover se limpia `ofrecido_por`.** La fila Sin asignar muestra los turnos sin persona
  *y* los ofrecidos, así que mover a alguien un turno ofrecido lo habría dejado visible en
  los dos lados a la vez.
- **Un solo escuchador en la tabla, no por bloque**, por la misma razón que ya valía para el
  clic: las casillas se repintan enteras y los escuchadores por bloque quedan huérfanos.
  `engancharArrastre` es idempotente porque se llama en cada repintado.

### El error que este trabajo destapó: Deshacer borraba los turnos sin dueño

`reponerAsignaciones` **borra el rango entero** y repone lo que trae la foto. Y `recordar()`
fotografiaba solo `S.asign`, que por diseño **excluye los turnos sin persona** (`cargar()`
los saca con `if (!a.persona_id) return`). Resultado: **apretar Deshacer después de
cualquier cambio borraba en silencio todos los turnos sin dueño de esa semana.**

Es anterior a hoy, pero estaba casi dormido: casi no había turnos sin dueño. **Los modelos
con «solo la forma» crean decenas de golpe**, así que la A convirtió un error latente en uno
probable. Arreglado sumando `S.abiertos.filter(a => !a.persona_id)` a la foto — solo los que
no tienen persona, porque `S.abiertos` trae además los **ofrecidos**, que siguen siendo de
alguien y ya están en `S.asign`; sumarlos todos los habría duplicado.

**Lo que deja como lección:** al agregar una función que produce muchos datos de una forma
que antes era rara, hay que mirar **qué otras partes tratan esa forma como caso de borde**.

### Lo que NO se pudo verificar

El arrastre necesita datos y sesión, y no se entra a la cuenta de Pedro. Se verificó que la
página publicada carga sin errores y que el archivo servido es el correcto; **el gesto en sí
lo tiene que probar él**. Se le dijo así, en vez de darlo por bueno.


## Opción C: la necesidad por hora en el día (04-10)

La vista de día ya era una línea de tiempo; faltaba lo de arriba. Ahora lleva una franja por
hora con **cuánta gente hay** contra **cuánta se necesita**, y debajo el resumen en palabras:
*«falta 1 de 08:00 a 11:00 · falta 1 de 21:00 a 00:00»*.

Era **media función, no una entera**: lo puesto no se teclea, sale de los turnos ya
asignados, y la necesidad ya existía en la dotación por turno.

### Las cuatro decisiones del cálculo

- **Un turno sin dueño no cuenta como gente.** Está planificado, pero no hay nadie — y ese
  es justamente el hueco que la pantalla tiene que mostrar. Hay una prueba para esto.
- **Dos turnos que se pisan suman su necesidad** en las horas compartidas. Si de 13 a 16:30
  corren mañana y tarde, a esa hora se necesita la gente de las dos. No es doble conteo.
- **Las horas seguidas con el mismo faltante se juntan en un tramo.** «Falta 1 de 08:00 a
  00:00» dice lo mismo que dos tramos y se lee mejor; faltantes **distintos** no se juntan.
- **Se dice en palabras, no solo en colores.** Es la regla que ya seguía la cobertura de la
  semana (*«legible sin interpretar colores»*), y conviene no romperla por pantalla nueva.

### La prueba que estaba mal era la prueba

Al correr las pruebas, tres fallaron: esperaban que la mañana y la tarde salieran como
tramos separados. Mirando el resultado —«falta 1 de 08:00 a 00:00»— **el código tenía razón
y la expectativa estaba mal escrita**: juntar horas contiguas con el mismo faltante es la
conducta correcta. Se corrigió la prueba y se agregó el caso que de verdad distingue
(faltantes distintos → dos tramos), que es el que le faltaba al conjunto.

*Vale anotarlo porque la tentación con un test en rojo es cambiar el código.*

### El botón de agrupar

`Personas/Puestos` pasó a vivir junto a `Día · Semana · Mes`. Es un **cambio de vista** y
estaba entre las flechas y los filtros. Lo pidió Pedro el 04-10 y lo condicionó a esta
etapa: *«cuando toque la C dejas el botón donde dices»*.


## «Editar desde todos los lugares»: la regla que ordenó las cinco vistas (04-10)

Pedro lo formuló él: **«la idea sería poder editar lo que más se pueda desde todos los
lugares»**. Y antes de dejarme arreglar el caso que había encontrado, preguntó lo correcto:
**«¿dónde más quedan esos huecos?»** — pedir el inventario antes que el parche.

### La regla: la fila dice qué cambia

- Fila de **persona** → soltar cambia **la persona** (y pregunta antes).
- Fila de **puesto** → soltar cambia **el puesto**, sin tocar a quien lo hace.
- En **Día**, correr de lado cambia la **hora**; en **Semana y Mes**, la columna cambia el **día**.
- **Apretar un hueco siempre crea**, con lo que la fila ya sabe.

Está implementada en un solo lugar, `destinoDeCasilla`, que lee el destino **de la casilla**.
Por eso la regla se cumple sola en las cinco vistas en vez de repetirse en cada manejador.

### El inventario que pidió, y lo que salió

| Vista | Crear en hueco | Arrastrar |
|---|---|---|
| Semana · Personas | ya estaba | ya estaba |
| Semana · Puestos | **faltaba** | **faltaba** |
| Día · Personas | ya estaba | ya estaba |
| Día · Puestos | **faltaba** | hacía nada → ahora cambia el puesto |
| Mes | ya estaba | **faltaba** |

**El de Semana · Puestos venía desde que armé esa vista la noche anterior**, y nadie lo había
notado. Buscar los hermanos del error encontrado vale más que arreglar el encontrado.

### El riesgo que casi se cuela

Las casillas de puesto **no llevan persona**. Un `cel.dataset.p || null` leído sin cuidado ahí
devuelve `null`, y soltar un turno en otra fila de puesto lo habría dejado **sin dueño, en
silencio**. Por eso `destinoDeCasilla` pregunta primero por `data-puesto` y solo mira
`data-p` si no lo hay, y hay una prueba que lo fija:
*«puesto manda sobre p vacío (no desasigna)»*.

Es el mismo patrón que ya había mordido hoy con el relleno de las pastillas: **un cambio que
parece de presentación tocando algo que decide qué se guarda.**

### Lo que se le dijo a Pedro sobre si esto hace la app más intuitiva

Sí, **con un reparo**: la misma acción hace cosas distintas según la vista, así que hay que
tener la regla en la cabeza. Lo que lo sostiene es que **cada cambio diga qué hizo** («El
turno pasa de Barra a Cocina») y que exista Deshacer. Y el riesgo real no es confundirse: es
que al poder editar desde todos lados **también se puede romper desde todos lados**. Por eso
lo que le saca un turno a alguien pregunta, y lo que solo corre una hora, no.

## Estirar turnos, y el minuto raro del 23:28 (04-10)

**Estirar y acortar** (Pedro, msg 3703): cada barra del día lleva una tira en cada borde.
Va con **eventos de puntero**, no con el arrastre del navegador: arrastrar lleva la barra
entera y estirar mueve un solo borde, así que son dos gestos distintos. Mientras se estira,
la barra deja de ser `draggable` para que no se peleen. Salto de 15 min y mínimo de 15.

### El minuto raro: `numeric(4,2)` no guarda minutos, guarda centésimas de hora

Pedro mandó una captura con un turno **19:15–23:28** y el 23:28 llamaba la atención.

No era el arrastre: **mover conserva la duración exacta**, así que un final en minuto raro
significa que la duración ya lo era. El origen está en el tipo: `inicio` y `fin` son
`numeric(4,2)`, o sea **centésimas de hora — pasos de 36 segundos**, no minutos. Los cuartos
de hora caen exactos (0,25 · 0,50 · 0,75), pero cualquier otra cosa se redondea, y la
aritmética de duraciones arrastra ese redondeo.

**Estirar lo arregla sin tocar nada más**, porque los dos bordes saltan de a 15 min: tirar
del borde normaliza el turno. No se tocó el tipo de la columna ni se "redondeó" la duración
al mover, que habría sido cambiar datos del usuario a sus espaldas.

### El `.barra{position:relative}` que casi rompe la línea de tiempo

Al escribir el CSS de las tiras agregué `.barra{position:relative}` para que sirvieran de
ancla. **La barra ya era `absolute` más arriba**, y una regla posterior con la misma
especificidad se la pisa: todos los turnos se habrían amontonado al comienzo del día,
perdiendo la única cosa que la vista de día significa. Se detectó antes de publicar porque
el `grep` mostró dos reglas `^.barra{`, y después se verificó en el navegador que la
posición seguía siendo `absolute`. Quedó una nota en el archivo para que nadie lo repita.

### Decir qué se creó (opción A)

Marcar varios días o varias personas creaba los turnos y **cerraba el diálogo callado**.
Desde la vista de Día uno marca tres días, ve un solo día y no se entera de nada. Pedro lo
notó por el síntoma equivocado —«¿no es mejor que en Día solo se pueda agregar el del
día?»— y la respuesta fue que **el problema no era poder hacerlo, era el silencio**. Ahora
avisa qué creó, en todas las vistas.

### Una vista tiene que poder arrancarse a sí misma

Pedro abrió la vista por puestos en una **semana en blanco** y preguntó: *«¿acá cómo agrego
a un puesto o una persona?»*. No se podía. Las filas por puesto se construían a partir de
**los turnos que ya había**, así que sin turnos no había ninguna fila — y sin filas, ninguna
casilla donde apretar.

**La vista por personas no tenía el problema**, y esa asimetría era la pista: sus filas salen
de **la gente**, no de los turnos, así que aparecen igual con la semana vacía. Pedro mandó la
captura de las dos y ahí quedó a la vista.

Ahora las filas por puesto salen del **catálogo**, más cualquier puesto que aparezca en un
turno y no esté en el catálogo. Arreglado en semana y en día.

**La regla que deja:** una vista que se construye solo a partir de los datos que muestra
**no se puede arrancar desde cero**. Las filas tienen que venir del catálogo —gente, puestos—
y los datos llenarlas. El caso que lo destapa es siempre el mismo: **un local nuevo**, que es
justo cuando el usuario más necesita que la pantalla lo deje empezar.

### «La función existe» no es lo mismo que «se puede usar»

Dos huecos seguidos del 04-10, los dos encontrados por Pedro y ninguno visible leyendo el
código:

1. **Filas por puesto que no existían** con la semana en blanco → no había dónde apretar.
2. **Casillas por puesto sin el botón `+ turno`** → el manejador ya aceptaba el clic en el
   borde de la casilla, pero sin botón una casilla con un turno dentro **parece cerrada**.

En el segundo, la función **estaba implementada y andando**. Lo que faltaba era la señal de
que se podía. Pedro lo dijo en cinco palabras: *«en persona está ok, pero en puesto no»*.

**Por qué se escapan:** una prueba de lógica confirma que el manejador responde; un `grep`
confirma que el código está. Ninguna de las dos ve que **no hay nada en pantalla que invite
a intentarlo**. Para eso hay que abrir la vista y preguntarse *«¿cómo haría esto alguien que
no escribió el código?»* — y la forma barata de conseguirlo es que lo pruebe alguien más.

## Que no se pisen los turnos, y el color que mentía (04-10)

Las dos salieron de preguntas de Pedro sobre **lo que veía**, y en las dos el defecto estaba
más atrás que la pregunta.

### Nadie puede estar en dos lados a la misma hora

Pedro preguntó algo de interfaz —*«si ya tengo a Ana en un turno, ¿está bien que me la
muestre de nuevo?»*— y la respuesta era sí: el **turno partido** es legítimo. Pero al ir a
confirmarlo apareció que **nada impedía solaparlos**: el único control comparaba que la hora
de entrada no fuera idéntica, así que 08:00–16:30 y 13:30–22:00 convivían calladas. Con
Lun a Vie marcados, cinco conflictos de una.

`chocaCon(persona, fecha, inicio, fin, exceptoId)` tiene la regla **en un solo lugar** y se
usa en los **cinco** caminos: crear, editar, arrastrar en semana/mes, arrastrar en día y
estirar. Dejarla solo en el diálogo habría repetido el error del día: *la función existe en
una vista y no en otra*.

- Al crear varios, **se saltan solo los que chocan** y se nombra cada uno; el diálogo **no se
  cierra**, porque cerrarlo se llevaría el aviso.
- `exceptoId` evita que un turno **choque consigo mismo** al editarlo — tiene prueba.
- **Pegados no es pisarse**: 16:30–22:00 después de 08:00–16:30 se permite.
- En las pastillas, quien ya tiene turno ese día lo muestra: **se avisa, no se bloquea**.

### El color salía de la plantilla, y la plantilla había dejado de ser cierta

*«¿Por qué Ana y Carla quedaron en el mismo color?»*. Porque el color sale del `turno_id`, y
el turno de Carla **conservaba la plantilla «Apertura 08:00–16:30»** aunque se le habían
cambiado las horas a 13:30–22:00.

**El problema no era de colores sino de datos**: había un turno que decía ser Apertura y
corría de tarde. Arreglar el color sin arreglar el dato habría tapado el síntoma. Ahora
cambiar las horas **suelta la plantilla**, y el turno pasa a ser escrito a mano.

Se verificó antes de hacerlo que soltarla **no rompe la cobertura**: ese cálculo compara
horas y no plantillas, precisamente porque un turno puede no venir de ninguna.

### Lo que esto NO hace

**No corrige los turnos que ya están pisados.** Evita los nuevos. Los que Pedro ya creó
siguen solapados y hay que arreglarlos a mano — se le dijo, en vez de dejar que lo
descubriera.

### El reloj de adentro no era el mismo que el de afuera

*«¿Por qué el reloj de afuera está distinto al de adentro? Uno usa las 21:00, el otro las
9:00 pm».* La malla la dibuja la app en 24 h; el diálogo usaba `input type="time"`, que
rinde en el formato del **sistema del usuario**.

**Se probó antes de prometer nada.** La creencia común es que el atributo `lang` fuerza el
formato. Se montaron cuatro campos en el sitio publicado —sin `lang`, y con `en-GB`,
`es-ES` y `es-CL`— y **los cuatro mostraron «09:00 PM»**. No es cosa de un atributo: manda
la configuración del equipo. De haberme fiado de la memoria, le habría ofrecido un arreglo
de una línea que no funciona.

El campo pasó a ser propio: texto, 24 h, `inputmode="numeric"`. Acepta `8`, `830`, `8:30`,
`8.30`, `0830` y normaliza **al salir del campo**, no mientras se escribe —reescribir el
texto bajo los dedos es peor que dejarlo desprolijo un segundo—.

**Lo que atajaron las pruebas:** `deHora` partía la cadena por `:` a secas, así que teclear
`830` y apretar Guardar **sin salir del campo** mandaba **830 horas** a la base. Ahora
`deHora` pasa siempre por el normalizador. El `blur` por sí solo no bastaba: no hay que
confiar en que un evento de interfaz ocurra antes de guardar.

**Se pierde** el selector con ruedita en el teléfono; **se gana** que la hora se lea igual
en toda la app, que en una malla de turnos pesa más. Se le dijo el costo antes de hacerlo.

### El color salía de la plantilla, y arreglar los nuevos no arreglaba los viejos

Pedro preguntó dos veces por lo mismo. **La primera vez le contesté que estaba correcto**,
explicando que el color agrupa tipos de turno — pero lo di por bueno **suponiendo** que
Carla tenía otro color. Él estaba mirando la pantalla y yo no. La segunda vez insistió:
*«Carla, Ana y Barbara siguen con el mismo color... ¿eso está correcto?»*. No lo estaba.

El color salía del `turno_id`. Un turno creado desde «Apertura 08:00–16:30» al que después
se le cambian las horas a 13:30–22:00 seguía apuntando a Apertura y heredaba su color.

**Lo importante es por qué el primer arreglo no bastó:** soltar la plantilla al cambiar las
horas evita que los turnos **nuevos** nazcan mal, pero no toca los que ya existen. Yo lo
sabía —se lo había advertido— y aun así contesté «está correcto» sobre datos que sabía
viejos.

**La solución buena fue cambiar de dónde sale el dato, no corregir los datos.** Sacando el
color de las horas: dice lo que el bloque muestra, los turnos viejos se acomodan solos, y
nadie tiene que reabrir y volver a guardar nada ni correr una migración sobre datos del
usuario.

**Regla:** cuando un valor mostrado se deriva de un vínculo que puede quedar obsoleto,
conviene derivarlo de lo que el usuario ve. Un dato calculado no se desincroniza; un vínculo
guardado, sí.


## 05-10-2026 — el día que Pedro dijo que la página es poco intuitiva

Tres cosas pasaron en media hora, y la tercera manda sobre las dos primeras.

### 1. Por qué «Definir cuánta gente necesito» se sentía débil

Pedro mandó la captura y preguntó **cómo lo resuelve Skello** (msg 3755). La respuesta,
verificada contra las 29 capturas y los tutoriales: **Skello no tiene esa pantalla.** Nadie
se sienta ahí a declarar la dotación. Lo resuelve por tres lados:

1. **No lo pregunta: lo deduce de la semana tipo.** El modelo guardado trae la necesidad
   encarnada en turnos reales. El encargado **corrige**, no **declara**.
2. Donde sí aparece es en la vista de Día: «Besoins en personnel», **curva por hora**.
3. **Es del pack premium.** Para ellos es avanzada, **no el paso 1 de la configuración**.

Y la nuestra pide **84 casillas** (4 puestos × 3 turnos × 7 días) partiendo todas en 0. El
botón «copiar este día a los demás» es la confesión de que el dato casi siempre es el mismo.

### 2. El error que encontró Pedro: con turnos que se pisan, la cuenta miente

Pedro agregó **«almuerzo 11:00–15:30»** y **«Cena 20:30–01:00»** sobre los tres turnos que ya
tenía, y preguntó **«si un turno se sobrepone, ¿qué pasa?»** (msg 3772). Pasa esto:

- La **necesidad sí se suma** en las horas compartidas, y está bien.
- Pero **`asignados()` cuenta por solapamiento**, así que quien trabaja **08:00–16:30** cuenta
  como cobertura de la **Tarde 13:00–21:30**. Con **una sola persona**, el panel «¿Te alcanza
  la gente?» da por cubiertos los dos turnos — y **a las 17:00 no hay nadie**.

**Por turno no se puede contar cuando los turnos se pisan.** La vista de Día ya lo hace bien
(va hora por hora); el panel de la semana no. Queda **pendiente de arreglar**.

### 3. Lo que está hecho y NO está publicado

`proponer()` en `app.js` — el **paso 4 del diagrama de Pedro** («el sistema asigna las personas
disponibles»), que es lo que le daría sentido a declarar la necesidad.

- **Cuenta por hora, no por turno**, justamente por el punto 2. Nació con la cuenta corregida.
- Reglas duras: ausencia · se pisa con otro turno suyo · «dijo que no puede» · se pasa del
  contrato · 7.º día seguido · menos de **10 h de descanso** entre turnos.
  ⚠️ Las 10 h **no son ley chilena** — el Código del Trabajo no fija descanso diario general.
  Es regla de sentido común del local, y así está comentado.
- Reparte parejo (menos horas, luego menos días, luego el nombre para que sea reproducible).
- **No inventa**: si no puede cubrir algo dice por qué, con números.
- **22 pruebas** en `pruebas/proponer.js` (`node pruebas/proponer.js`). Dos de ellas fijan
  justamente el error del punto 2 para que no vuelva.
- `datos.js` tiene `crearAsignacionesLote`, sin usar todavía.

**Nada de esto tiene botón ni está subido al sitio.** Es código muerto a propósito: Pedro paró
antes de la interfaz.

### 4. Lo que Pedro dijo al final, y que ordena todo lo demás

> «mi punto es que como esta la pagina esta poco intuitiva, es muy complejo usarla»
> «tanto skello como 7shift muestran ser mucho mas intuitiva que esto» (msgs 3776–3777)

**Diagnóstico que se le dio: la app tiene las funciones de Skello pero no su forma.** Se copió
la lista, no el oficio. Lo que se cuenta en su propia pantalla:

- **12 controles en una barra** en vista Día, **14** en Semana.
- **Tres botones «Deshacer»** distintos en la misma página (`btnDeshacer`, `btnDeshacerDot`,
  `btnDeshacerEq`). Si hacen falta tres, es que hay tres apps conviviendo.
- **Tres formas de copiar** (Modelos, Copiar la anterior, «Repetir también en») y **ninguna
  copia un día** — que es justo lo que él quiso hacer (msg 3770).
- **La dotación vive dentro de la pantalla de planificar**, con sus propias pestañas de días.
  Es configuración, no trabajo semanal.

**Propuesta, en orden, y ninguna agrega funciones — las sacan de encima:**

1. En la barra solo lo de todas las semanas: vista · fechas · Deshacer · Publicar. El resto, a
   un menú «…».
2. **Un** Deshacer para toda la página.
3. **Un** botón «Copiar…» que sepa si estás en día o en semana (Pedro pidió las dos: copiar un
   día a otros días, y copiar la semana a otras semanas — msg 3773).
4. Sacar la dotación de Planificación y mandarla a Configuración.

**Esperando que elija por dónde partir.** No se tocó la interfaz.

## 05-10-2026 (tarde) — «Copiar…» y la arquitectura

### Un solo botón «Copiar…», y dos botones menos arriba

Pedro armó un lunes con **once turnos** y preguntó cómo lo copiaba a más días (msg 3770).
No se podía: existían «Repetir también en» —dentro de cada turno, once veces— y copiar la
**semana** entera. **El día, que es el pedazo que uno arma primero, era el único que no se
podía copiar.** Él pidió las dos cosas (msg 3773).

Ahora es **un botón que sabe en qué vista estás**:
- **Día** → a qué días de esa semana va, y copia todos sus turnos.
- **Semana** → *copiar ESTA a las siguientes* (1 a 4) o *traer la ANTERIOR sobre esta*.

«Copiar la anterior» **salió de la barra** y se metió adentro. Es el punto 3 de la
simplificación, cumplido de paso.

#### El Deshacer tenía que leer de la BASE, no de la pantalla

`recordar()` fotografía `S.asign`, que **solo tiene lo que la vista cargó**. Copiando esta
semana a las tres siguientes, esas semanas no están cargadas: la foto habría salido vacía y
**Deshacer, en vez de reponerlas, habría borrado lo que hubiera ahí**. Lo mismo en la vista de
Día, donde `rango()` es un solo día.

Por eso hay `recordarDeLaBase(que, desde, hasta)`, que lee el rango de la base antes de
tocarlo. **No es un detalle de estilo: es la diferencia entre un paso atrás y una pérdida de
datos.**

#### Las ausencias del destino

Ni se copian ni se pisan, y **a quien tenga una ausencia no se le pega un turno encima**: la
ausencia manda sobre los turnos y dejar las dos cosas sería una contradicción guardada. Mismo
criterio que ya seguía `copiarSemana`.

#### Lo que NO se pudo probar

El copiado de verdad necesita sesión y no se entra a la cuenta de Pedro. Verificado contra el
**sitio publicado**: scripts en `v=87/69`, `#btnCopiar` presente, el viejo `#btnCopiarSem`
ausente, las ocho piezas del diálogo existen y **ningún control quedó sin conectar** (el aviso
de `SIN_CONECTAR` no aparece). **El gesto lo prueba él**, y se le dijo así.

⚠️ **GitHub Pages tarda hasta 10 minutos.** La primera verificación salió con `v=86` y parecía
que el deploy había fallado: no había fallado, era la caché. Conviene esperar a que el HTML
servido muestre la versión nueva **antes** de concluir nada.

### La arquitectura, que Pedro paró para definir primero

> «no será momento de definir varias cosas antes de seguir? por ejemplo la arquitectura de la
> web? para que todo haga sentido?» (msg 3836)

Tiene razón, y «Copiar…» es el ejemplo: es un parche bueno sobre una estructura que es el
problema de fondo.

**El diagnóstico en una frase: las pestañas están ordenadas por OBJETO** (Equipo, Propinas,
Links) **y deberían estarlo por MOMENTO**, que es justo lo que dice su propio diagrama.

**Propuesta — 3 zonas en vez de 5 pestañas**, en el orden de su flujo (lámina en
`arquitectura.png`, generada por `arquitectura.py`):

| Zona | Cuándo | Qué lleva |
|---|---|---|
| **1 Configurar** | una vez y casi nunca más | local · puestos · turnos · equipo · **cuánta gente necesito** |
| **2 Planificar** | todas las semanas | la malla · generar turnos · ¿te alcanza la gente? · publicar y repartir |
| **3 Controlar** | cuando la semana pasó | asistencia · propinas · costo e informe |

**Lo que arregla sin agregar nada:**
- **La dotación sale de Planificación.** Es configuración y estaba estorbando en medio del
  trabajo semanal — *por eso esa pantalla se sentía pesada*, que fue la queja original.
- **Un solo Deshacer** en vez de los tres actuales (`btnDeshacer`, `btnDeshacerDot`,
  `btnDeshacerEq`): ya no conviven tres zonas con historial propio en la misma pantalla.
- **«Links» deja de ser pestaña**: repartir es parte de publicar.

**Tres preguntas que son suyas, planteadas y sin responder aún** (msg 3843):
1. ¿Propinas dentro de Controlar o pestaña propia? *(para un bar tiene peso para ir sola)*
2. ¿Asistente de primera vez para los pasos 1-2-3?
3. ¿De una o por partes? *(recomendado: por partes, partiendo por sacar la dotación)*

Y se le dijo sin adorno: **esto no agrega ni una función**. Si prefiere que primero entre el
generador de turnos y después se ordene, también es defendible.

### Prototipo 2 congelado · Prototipo 3 arranca (05-10-2026 15:41, msg 3844)

> «dejemos hasta antes de ese msg como prototipo 2… desde ahora, como prototipo 3.»

- **`mallaturnos.github.io/p2/`** — copia servida y congelada, con un rótulo al pie que lo
  dice y enlaza a la nueva. Etiqueta `prototipo-2` en el repo del sitio.
- **`mallaturnos.github.io`** — pasa a ser el Prototipo 3.

**Por qué servida y no solo etiquetada**: Pedro la usa **en vivo**. Una etiqueta de git
conserva el código, no una herramienta que él pueda seguir abriendo mientras la nueva se arma.

⚠️ **Las dos apuntan a la MISMA base de datos.** Los datos son los mismos en ambas, y si el
Prototipo 3 necesita cambiar una tabla hay que avisarle **antes**: ahí sí se pisan.

### Cómo resuelve Skello la arquitectura (msg 3845)

Revisado contra las capturas, no de memoria:

1. **Menú de configuración aparte**, con todo junto: *Règles · Alertes · Règles du rapport ·
   Postes · Équipes · Absences · Établissement · Modèles · Smart Planner*. Puestos, equipos y
   ausencias son **catálogos**. Las reglas del local viven ahí, no en el planning. →
   **Confirma la zona 1** de la propuesta.
2. **Dentro del planning, las vistas son solapas** (`Employés | Postes`, Semana/Día/Mes), no
   pestañas de nivel superior. → **Confirma que el planning es UNA zona con vistas adentro.**
3. **Las reglas del reloj control son sección propia dentro de configuración**, no están en la
   pantalla del reloj.
4. 🔑 **La venta se pide al CERRAR EL DÍA**, no en una pestaña: *«¿cuál fue la facturación de
   esta fecha?»* al validar.

**Lo 4 corrige mi propia propuesta.** Yo había planteado la disyuntiva *«¿Propinas dentro de
Controlar o pestaña propia?»* y Skello contesta algo mejor que mis dos opciones: **ni una ni
otra — el dato se pide donde ocurre, y la pantalla de propinas queda solo para ver el
resultado.**

**La regla que ordena el Prototipo 3, y que ya aplicábamos sin nombrarla** (`¿Te alcanza la
gente?` es un resultado, no un formulario):

> **Las pantallas de resultado no piden datos. Los datos se piden donde pasan las cosas.**

⚠️ **Lo que no se puede afirmar**: entre las 29 capturas **no hay ninguna del menú principal**
de Skello. Se sabe cómo ordenan la configuración y las vistas internas porque eso se ve; cómo
nombran las secciones de nivel superior, **no**, y no se inventó. Se le pidió a Pedro.

### El menú REAL de Skello, y la arquitectura corregida tres veces en una hora

Pedro mandó primero una **descripción** del menú (msg 3848) y después la **captura** (msg 3850).
Se tomó el texto como dato a confirmar, y menos mal: **el texto se equivoca en dos puntos.**

**Menú real, leído de la captura:**
`Planificación · Empleados · Informe · Control horario · Cuadro de mando` + un **engranaje**
arriba a la derecha.

- El texto decía que **«Documentación»** era área propia: **no está en la barra**.
- El texto **se saltaba «Cuadro de mando»**, que sí está.
- ✅ Confirma lo propuesto: **la configuración va fuera, como engranaje, no como pestaña.**

**El recorrido de la propuesta, que vale anotar porque las tres versiones fueron mías:**

1. **Tres zonas** (Configurar / Planificar / Controlar). **Se pasaba de largo**: metía el Equipo
   dentro de «Configurar» como si fuera algo que se hace una vez. No lo es — entra gente, se va
   gente, cambian saldos y vacaciones.
2. Con el texto del menú: Equipo vuelve a ser área propia.
3. Con la captura: **4 pestañas y un engranaje**, y la conclusión que importa —

> **El defecto no era el orden de las pestañas.** Se parecen a las de Skello más de lo que yo
> había dicho. Es que **no existe una zona de Configuración**, así que quedó repartida dentro
> de las otras.

**Lo único que se mueve (cinco cosas):** Turnos del local y Puestos (Equipo → Configuración) ·
Cuánta gente necesito (Planificación → Configuración) · los links (pestaña → dentro de
Publicar) · Propinas (pestaña → Informes). **Ninguna función se pierde ni se agrega.**

**Lo que NO se copia de Skello**, y por qué:
- **Documentación** — ni está en su barra, ni calza con la regla de no guardar datos del personal.
- **Cuadro de mando** — para un local chico el tablero ya son «¿Te alcanza la gente?» y el costo
  sobre la venta. Una pestaña para repetirlo es justo lo que hizo pesada la app.

**El hallazgo que de verdad contesta la queja original de Pedro** («la barra tiene demasiados
botones»): se contó la de Skello en la captura y tiene **~12 controles, casi los mismos**.
**No tiene menos — los tiene más callados**: iconos en vez de palabras, agrupados por aire, y
**un solo botón escrito** (*Publicar la planificación*), apagado hasta que hay cambios.
→ El arreglo no es sacar botones: es **bajarles el volumen y agrupar**.

**Tres detalles suyos que conviene copiar**, vistos en la misma captura:
- **Deshacer Y rehacer** (dos flechas). Nosotros solo deshacemos.
- **«No disponible» se ve DENTRO de la malla**, como bloque en la casilla. Nosotros lo mostramos
  como alerta al lado de la persona: la de ellos se ve **donde ibas a poner el turno**.
- Columna **Total** por persona con la **diferencia contra el contrato** en color.

⚠️ **Y un tropiezo repetido**: el glifo **⚙** salió como **cuadro vacío** en la lámina. Es
exactamente lo que pasó el 04-10 con la flecha diagonal de la página de instrucciones del libro
— **Lato no trae esos glifos**. Se escribe la palabra. Anotado por segunda vez.

### Maquetas antes que código (05-10-2026, msg 3880)

> «es mejor que me presente primero láminas de cómo se verá la arquitectura verdad?»

Sí, y conviene decirlo sin adorno: **en una sola tarde le propuse tres arquitecturas distintas
y las tres cambiaron** — la de tres zonas, la de cuatro pestañas y un engranaje, y la de dos
niveles con sub-pestañas. **Eso en un dibujo cuesta un mensaje; en código cuesta una tarde.**

`maquetas.py <malla|dotacion|mes>` genera las tres pantallas que son decisión de verdad.
Llevan **datos inventados y un rótulo que dice que son maquetas**, para que no se confundan con
el sitio que Pedro está usando en vivo — pero con la tipografía y los colores reales, porque
con cajas grises no se puede juzgar nada.

1. **Planificación › Malla** — sub-pestañas, la barra de **14 controles a 7** (Imprimir,
   Limpiar, Modelos y los filtros se van a un «⋯»), y la **franja de estado** con tres chips y
   la última publicación. Publicar es el único botón con color.
2. **Planificación › Cuánta gente necesito** — la misma tabla, **sola en su pantalla**. Su
   «Deshacer» deja de compartir página con el de la malla.
3. **Vista Mes** — cuadritos de color sin texto y el total por semana con la diferencia contra
   el contrato.

**Fuera de las maquetas a propósito**: la **disponibilidad por tramo horario**, porque toca la
base de datos y eso se cierra aparte.

⚠️ **Tercera vez en el día con el mismo tropiezo**: `⋯ ↶ ↷` salieron como **cuadros vacíos**.
Lato no trae esos glifos — igual que la flecha diagonal del libro y el engranaje de la lámina.
En las maquetas los iconos son **SVG**. Vale como regla: **en esta casa, los iconos se dibujan,
no se escriben.**

**Tres preguntas planteadas a Pedro** (msg 3886), sin respuesta aún:
1. ¿«Cuánta gente necesito» como sub-pestaña de Planificación, o derecho a Ajustes?
2. ¿La franja de estado sirve o es ruido?
3. ¿Se parte por la vista Mes —la que peor está— o por las sub-pestañas?

### «Cuánta gente necesito» no se mueve: se da vuelta (05-10, msgs 3890-3892)

Pedro: *«me sigue sin convencer lo de cuánta gente necesito…»* y, un minuto después, el caso
que lo explica: *«no se ve bien si tengo turnos corridos de 8 horas y turnos de refuerzos
partidos de 4 horas»*.

**Tiene razón, y el caso es el mejor argumento que ha aparecido en todo el día.** Con un corrido
08:00–16:30 y un refuerzo 12:00–16:00, la tabla obliga a poner un número en cada turno — y
**ese número no significa lo mismo en los dos**:

- en el corrido es *«cuánta gente quiero»*
- en el refuerzo es *«cuánta gente MÁS»*

**La tabla no lo dice en ninguna parte**, y entre una lectura y la otra hay **6 personas de
diferencia en la semana**. No es un problema de cómo está dibujada: **un solo número no alcanza
para decir dos cosas distintas.**

**Lo propuesto** (maqueta en `mq_nec.png`, `maquetas.py necesidad`), con su caso exacto:

```
Garzón · lunes
  08:00 – 12:00    2
  12:00 – 16:00    4     ← entra el refuerzo
  16:00 – 01:00    2
```

**Un número, un significado**: cuánta gente quieres a esa hora. El refuerzo deja de ser un caso
especial — es el tramo donde el número sube. Y debajo, el mismo dato como barras por hora.

**Y no se teclea.** Marcando una semana como **«semana tipo»**, la app cuenta sola cuánta gente
hay de cada puesto a cada hora y rellena los tramos; el encargado **corrige**, no declara. Es lo
que hace Skello, y cumple la regla del día: *las pantallas de resultado no piden datos*.

**Lo que esto arregla de una:**
1. Se entiende con turnos corridos y de refuerzo mezclados — el caso de Pedro.
2. Queda **por hora**, así que **desaparece** el error de los turnos que se pisan que él mismo
   encontró en el msg 3772.
3. No hay 112 casillas en cero esperando que alguien las llene.

**Esperando su visto bueno** (msg 3896). Esto sí toca la base de datos: `dotacion` pasaría de
`(perfil, puesto, turno_id)` a tramos `(perfil, puesto, desde, hasta)`.

### Prototipo 3, primera entrega: la necesidad pasa a TRAMOS HORARIOS

Aprobado por Pedro (msg 3897) después de ver la maqueta con su caso.

**Archivos**: `arreglo-tramos.sql` (lo pega él en Supabase) · `datos.js` (tramos,
guardarTramos, copiarTramosDia, borrarTramos) · `app.js` (`necesitaHora`, `asignadosHora`,
`normalizarTramos`, `pintarNecesidad`) · `pruebas/tramos.js` (**11 pruebas**).

#### Tabla nueva, no un cambio de la vieja

`/p2/` comparte esta base y Pedro **la usa en vivo**. Cambiar `dotacion` le habría roto el
panel de cobertura de un momento a otro. Así que `dotacion_tramos` es nueva, `dotacion` no se
toca, y el SQL **convierte** lo ya tecleado: hora por hora, juntando las horas seguidas que
piden lo mismo.

#### Lo que la conversión reveló con los números reales de Pedro

Simulada antes de mandársela, con su lunes (`Garzón 1·0·2·2·0`):

```
Garzón   08:00–13:00  1     13:00–17:00  3     17:00–22:00  4     22:00–01:00  2
```

**Está pidiendo 4 garzones de 17:00 a 22:00** porque escribió 2 en Tarde y 2 en Cierre, y esos
turnos se pisan entre 17:00 y 21:30. **Casi seguro no es lo que quería.** Se le mostró: es la
prueba, con sus propios datos, de que la tabla vieja era ambigua.

#### Lo que arrastró el cambio

- **La cobertura semanal deja de juzgar por turno.** Las casillas ahora dicen un **hecho**
  (cuánta gente hay) y el veredicto bajó a una línea por día, **calculada por hora**:
  *«faltan 2 garzones de 17:00 a 22:00»*. Es el arreglo del error del msg 3772.
- **Los dos indicadores cambian de unidad** a *horas-persona*. Seguir llamándolos «turnos»
  sobre un número que se calcula por hora **sería mentir en la etiqueta**, que es la peor forma
  de mentir en una pantalla.
- `normalizarTramos` quedó **de nivel superior y con nombre** para poder probarla en node, por
  la misma razón que `proponer()`. Primero la escribí dentro de un closure y no se podía probar:
  se sacó.

#### Lo que NO se pudo hacer y se dijo

**No hay Postgres en el contenedor**, así que el SQL **no se ejecutó nunca**. Se probó la
*lógica* de la conversión aparte, en Python, con los números de Pedro. Se le avisó tal cual y se
le pidió que mande el error textual si Supabase lo rechaza.

⚠️ **Pendiente**: `proponer()` —el generador, aún sin botón— arma su necesidad desde
`dotacion` × turnos. Cuando se conecte **tiene que leer `necesitaHora`**, o volvería a contar
como antes.

### Dos cosas que preguntó Pedro mirando las maquetas

**«¿Acá no faltan botones?»** (msg 3920) — **sí faltaban, en la maqueta.** La dibujé rápido
para discutir la estructura y simplifiqué el centro a una pastilla con la hora. Eso hacía
parecer que se perdían cosas que no se pierden: el **«+ turno»** de la casilla vacía (que se
arregló una vez justamente porque *una casilla sin botón parece cerrada*), el **puesto** dentro
del bloque, las **horas** y la **×**. Maqueta rehecha con los bloques como son.

→ **Lección**: una maqueta que simplifica de más no ahorra tiempo, lo gasta. Si el dibujo
muestra menos de lo que habrá, la conversación se va a defender lo que nadie iba a quitar.

**«¿Esto consumirá muchos datos?»** (msg 3924) — medido, no estimado:

| | gzip |
|---|---|
| `app.js` | 64 KB |
| `supabase-js` (CDN) | 29 KB |
| `estilo.css` | 11 KB |
| `datos.js` | 9 KB |
| `index.html` | 6 KB |
| **primera carga** | **~120 KB** |

Menos que una foto de WhatsApp. Después queda en caché unos minutos y cambiar de semana baja
solo los turnos. **Un día entero de uso: menos de 5 MB.** La base: ~3.600 filas al año contra
500 MB del plan gratis.

⚠️ **Lo que sí es mejorable y se le dijo sin que preguntara**: `refrescar()` llama a `cargar()`,
que **rehace las nueve consultas** y baja la semana entera **en cada cambio de un turno**. Son
~20 KB por cambio: no duele el bolsillo, pero es trabajo de más y en una conexión mala se nota
como lentitud. **Anotado, no urgente.**

### Mejora 1 del Prototipo 3: sub-pestañas y la barra de 14 a 7

**La barra.** Quedan los controles de todas las semanas —fechas · vista · agrupar · Copiar… ·
Deshacer · ⋯ · Publicar— y el resto vive en el menú **«···»**: los dos filtros, Imprimir y
Limpiar. El menú **se cierra al tocar fuera o con Escape**, porque uno que no se cierra solo es
una trampa.

Lo que se aprendió mirando a los dos competidores y que ordenó esto: **7shifts tiene seis
controles** y guarda lo demás en dos desplegables; **Skello tiene doce pero en iconos**, con un
solo botón escrito. El arreglo no era «sacar botones» a secas: era **bajarles el volumen y
agrupar**.

**Las sub-pestañas** `Malla · Plantillas · Cuánta gente necesito · Objetivo de costo`. Tres
mudanzas:

- **«Modelos de semana» deja de ser un botón** y pasa a ser la pestaña *Plantillas*. El diálogo
  se convirtió en panel; `listoYCerrar()` ya no cierra un modal, **vuelve a la Malla**, que era
  la razón por la que el modal se cerraba solo.
- **La dotación sale del `<details>`** metido debajo de la malla.
- **El objetivo de costo estaba perdido en Propinas.** Ahí queda lo que **mide**; en
  Planificación lo que se **define**. Es la regla del día aplicada otra vez: *las pantallas de
  resultado no piden datos*.

**Un texto que mentía**: el panel decía *«Turno por turno, si te alcanza la gente»* cuando la
cuenta ya es **por hora**. Corregido. Un rótulo viejo sobre una pantalla nueva es una mentira
barata de cometer y cara de encontrar.

**Verificado en el navegador antes de publicar** (la lección de siempre: lo visual no lo
encuentra ninguna prueba): las cuatro sub-pestañas están, la barra entra **en una sola fila**, y
los paneles existen.

### 🔴 GitHub Pages no publicaba: me estaba pisando a mí mismo

**Síntoma**: tres commits en una hora sin salir al aire. El repo en `c8cbd7f`, el sitio
sirviendo `app.js?v=87`, y el `app.js` publicado **sin** el código nuevo. Pedro mirando una app
que no tenía nada de lo que le acababa de anunciar.

**Primera hipótesis, equivocada**: Jekyll. Se le dijo a Pedro que el sospechoso era el
procesador que Pages corre por defecto, y se agregó `.nojekyll`.

**El dato**, sacado de la API pública de Actions (el repo es público, no hizo falta token):

```
18:42  pages build and deployment  completed/success    ← la última que salió al aire
19:18  pages build and deployment  completed/cancelled
19:24  pages build and deployment  completed/cancelled
19:34  pages build and deployment  completed/cancelled
19:39  pages build and deployment  queued
```

**Ninguna falló: las cancelé yo.** Pages tarda varios minutos en construir, y **un push nuevo
cancela la construcción en curso**. Yo subía cada 6–8 minutos, así que ninguna alcanzaba a
terminar. La causa no era el repositorio ni Jekyll: **era mi cadencia**.

**La regla que queda:**
> **Agrupar los cambios y subir de una vez.** Y antes de concluir que algo falló, mirar
> `api.github.com/repos/<dueño>/<repo>/actions/runs` — es público y dice la verdad en cinco
> segundos. Buscar el dato salía más barato que la hipótesis.

`.nojekyll` se queda igual: acorta la construcción, aunque no era el problema.

### Mejora 2 (lista, sin publicar): la vista MES compacta

Lo que arregla, dicho con lo que pasó: Pedro miró septiembre, **lo vio en blanco y preguntó si
estaba roto**. No lo estaba — con una fila por persona, 30 columnas de 46 px y el horario
escrito dentro de cada celda, la tabla no cabe en ninguna pantalla y sus turnos quedaban fuera
del borde.

**La respuesta de Skello**, visible en la captura que mandó el 05-10: **sacar el texto**. Cada
turno es un cuadrito de color —el color es el puesto— y las horas viven en el globo. Y entre
semana y semana, una columna con **el total de esa persona y su diferencia contra el contrato**.

**Hecho**: `semanasDelMes()` + celdas sin texto + la columna `semcol`. La columna fina `corte`
que solo separaba semanas **ahora dice algo**; su CSS muerto se quitó.

**Medido con datos de prueba en el navegador**: los 31 días, las 5 columnas de semana y el total
entran **sin arrastrar**.

🔎 **Y lo que solo se vio al renderizarla**: octubre **parte un jueves**, así que su primera
«semana» son 4 días. Compararlos contra un contrato de 42 h mostraba **«−19 h» en rojo** para
alguien que no debe nada. Ahora **las semanas incompletas no se comparan** y el globo lo explica.
*Un número alarmante que no significa nada es peor que no poner número* — y eso no lo encuentra
ninguna prueba de lógica.

**7 pruebas** en `pruebas/mes.js`: octubre (parte jueves), febrero 2027 (parte lunes, 28 días),
que ningún día se repita ni se pierda, dónde cierra cada semana, un mes de un solo día y la
lista vacía.

**Sin publicar a propósito**: GitHub Pages está atascado y subir ahora cancelaría la
construcción en cola. Sale con el próximo lote.

## `pruebas/ambitos.js` — la guardia del `verSub is not defined`

Añadida el **05-10-2026**, el mismo día del bug que la justifica.

`verSub()` quedó declarada **dentro** de `conectarApp()`, pero nueve de sus once
llamadas viven fuera. Quitar un tramo, guardarlo, copiarlo o volver de un diálogo
reventaban todos. Lo encontró **Pedro apretando el botón**, no yo.

Lo incómodo del caso: **ninguna comprobación lo veía**. `node --check` pasa —la
sintaxis es válida—, las 43 pruebas pasan —ninguna toca el DOM— y la página carga
sin un solo error hasta que alguien aprieta.

`pruebas/ambitos.js` sí lo ve y sin navegador: recorre las funciones de nivel
superior, busca las que declaran otra adentro, y falla si ese nombre se usa fuera
del rango de la que la contiene.

**Verificada en los dos sentidos**, que es lo único que hace válida a una guardia:
contra `30e3cb6` (la versión con el bug) sale `1 mal` y termina en 1; contra la
versión arreglada sale `0 mal` y termina en 0. Una prueba que nunca ha fallado no
prueba nada.

Es análisis de texto, no un intérprete: no entiende closures ni ámbitos de bloque.
Por eso la regla va al revés de lo normal — si algún día marca algo que de verdad
está bien, se agrega a `PERDONADAS` **con el motivo escrito al lado**. Vale más un
falso positivo con nombre que un botón mudo en producción.

## Noche del 05-10-2026 — cuatro bugs de Pedro, una regresión mía y el banco de pruebas

Pedro se puso a probar «Cuánta gente necesito» a las 23:00 y encontró cuatro errores en
veinte minutos. Los cuatro eran reales. Vale anotar **qué tenían en común**, porque no es
casualidad.

| Qué vio él | Qué era |
|---|---|
| «toma el turno de cena y baja en otro horario» | `inicio <= h` se comía la primera media hora y regalaba la última |
| un tramo raro `00:00–16:00`, y «aumento el número y aparecen y desaparecen cosas» | `hhmm(24)` escribe `00:00` y `deHora('00:00')` devuelve `0`: la medianoche no sobrevivía la ida y vuelta |
| «ese botón tramo no hace lo mismo que los otros» | el mismo gesto —agregar una línea— en dos sitios distintos |
| «una vez aprieto por hora, desaparece la otra opción» | `pintarNecesidad()` limpiaba una caja que ya traía el conmutador puesto por quien la llamó |

**Los dos primeros son el mismo tipo de defecto: una regla escrita más de una vez.**
La del conteo por hora estaba **ocho veces** en `app.js` —y el SQL de la migración la
escribía de una novena forma, la correcta, así que **la base y la pantalla contaban
distinto**—. La de la medianoche vivía **dentro de un closure**, donde ninguna prueba
podía llegar. Las dos salieron a funciones de nivel superior con pruebas propias:
`cubreHora()` y `tramoDelDia()`.

### La regresión, que fue mía
Al mover el «+ tramo» al final de la lista le agregué una fila a la tabla. Esa fila no
tiene campos de hora, y `leer()` iba fila por fila pidiéndolos: reventaba. Como a `leer()`
la llaman **guardar, quitar y agregar**, dejó los tres mudos. Pedro lo vio en dos minutos.

→ **Agregar una fila de adorno a una tabla de datos obliga a revisar a quien la recorre.**

### Lo que lo causaba de verdad, y cómo se cerró
Yo **no puedo abrir el sitio**: pide sesión y pedir la clave está vetado. Así que cambiaba,
publicaba y pasaba al siguiente sin mirar. Cada cambio era una apuesta y esa noche una
salió mal.

**`demo.html` + `demo_datos.js`** cargan el **mismo `app.js`** —sin tocarle una línea— con
un almacén en memoria en lugar de la base. Los datos inventados traen a propósito los tres
casos que dan problemas: un turno que termina a y media, dos que se pisan y uno que cruza
la medianoche.

**`pruebas/humo.sh`** abre eso y **aprieta los botones**: 11 comprobaciones que recorren los
cuatro errores de la noche. Verificada contra el `app.js` roto: **falla**, señalando el
botón que no respondía. Una prueba que nunca ha fallado no prueba nada.

**Esto no se publica.** El deploy copia `app.js`, `estilo.css` e `index.html`; el banco se
queda en el repositorio.

### Lo que quedó pendiente, y es lo primero de mañana
**Juntar turnos y horarios libres en la misma lista**, que es lo que pidió Pedro (msg 4157):
una línea puede ser un turno del catálogo y la siguiente un rango suelto, con una opción
«Horario libre…» al final del desplegable. Desaparece el conmutador «Por turno / Ajustar
por hora», que era la versión torpe de lo mismo.

⚠️ **Lo delicado no es la pantalla, es la cuenta.** Hoy los tramos **reemplazan** a los
turnos (`Math.max`); para mezclarlos tienen que **sumarse**. Y los tramos que creó la
migración de octubre son el equivalente de los turnos: si se empiezan a sumar, **cuentan
dos veces**.

Pedro confirmó que **nunca escribió nada a mano en «Ajustar por hora»** (msg 4166), así que
todos los tramos que hay son de la migración. La forma segura de limpiarlos **sin confiar en
esa memoria** es reconocerlos: un conjunto de tramos que coincide exactamente con lo que
producirían los turnos de ese puesto es un resto de la migración y se puede borrar; el que
no coincide lo escribió alguien y se queda.

## 06-10-2026 · Una sola lista en «Cuánta gente necesito»

Pedro lo pidió en una línea (msg 4157) y hoy mandó cerrarlo antes de seguir: que turnos
y horarios libres vivan en **la misma lista**, con **«Horario libre…»** al final del
desplegable. Fuera el conmutador «Por turno / Ajustar por hora», que era la versión torpe
de una sola idea.

**Lo que cambia de verdad no es la pantalla, es la cuenta.** Antes los tramos
**reemplazaban** a los turnos (`Math.max`); ahora **se suman**, que es lo que cualquiera
espera: «dos de apertura más uno de refuerzo a las seis» son tres a las seis.

### La trampa, y dónde se desactiva
La migración de octubre creó tramos que **reproducen** los turnos. Mientras reemplazaban
daba igual; al sumar **contarían dos veces** y el dueño vería el doble de gente sin haber
tocado nada.

`tramosSonCopiaDeTurnos()` los reconoce comparando **hora por hora** lo que darían los
turnos contra lo que dan los tramos. Si coinciden en todas, son calco y se ignoran.

**No se borran al detectarlos.** Borrar es irreversible y esto no. Se limpian en **un solo
momento**: dentro de `poner()`, al tocar un turno de ese puesto — que es justo cuando
dejarían de calzar y empezarían a sumar. Los horarios libres escritos a mano **nunca se
tocan**: antes `poner()` los borraba todos, y en el modelo nuevo eso sería destruir el
trabajo del dueño.

### El banco de pruebas se había roto solo, en un día
`demo.html` nació anoche como **copia a mano** de `index.html`. Hoy cambié un texto de
ayuda en el index y el banco siguió mostrando el viejo: **ya habían divergido**. Un banco
que diverge deja de probar lo que se publica, que es lo único que tiene que hacer.

→ Ahora se **genera**: `python3 pruebas/armar_demo.py`. Lo único que cambia respecto del
index es el `<title>` y los tres `<script>` de datos. **Si el generador no reconoce esos
scripts, falla y no escribe nada** — mejor eso que un banco a medias.

### Las pruebas
16 comprobaciones, todas en verde. Las cuatro nuevas corridas contra el `app.js` de esta
mañana: **tres fallan**, y la de la suma daba **−1** donde ahora da **+2** — porque antes
reemplazar un turno de 3 por un tramo de 2 *bajaba* la cuenta. La cuarta (el calco no
duplica) pasa también en la versión vieja, porque allí nada se sumaba: es un guardián del
comportamiento nuevo, no una prueba del cambio, y conviene saberlo.

⚠️ **Y una lección de las pruebas mismas**: las dos primeras versiones de los tests nuevos
fallaron por **mis expectativas**, no por el código — clavé valores fijos sin contar con el
estado que dejan las pruebas anteriores. Ahora miden **la diferencia** (la misma hora con y
sin el horario libre) en vez de un número absoluto.

## 06-10-2026 · Cómo se crean y editan los turnos: el diseño antes del código

Pedro paró la programación para decidir la forma (msgs 4360-4361): *«antes de seguir
editando, preséntame alternativas»*. Las cuatro primeras se maquetaron con el estilo real
de la app —`maqueta_turnos_[a-e].html`, capturas en `maqueta_[A-E].png`— porque una maqueta
que se mira decide en un minuto lo que una descripción no cierra en diez.

| | Qué es | Dónde falla |
|---|---|---|
| **A** | Editar el turno en la misma línea | La tabla salta; con varios puestos marea |
| **B** | Catálogo de turnos al lado | Ocupa ancho; en teléfono habría que plegarlo |
| **C** | Ficha flotante al pinchar el nombre | No muestra el catálogo: «agregar y quitar turnos» se queda corto |
| **D** | **El flujo entero**: nombre → cuándo → quién | ✅ **La que eligió** |

**Lo que destapó la D**: ninguna de las tres primeras servía, porque Pedro no describía una
pantalla sino **una secuencia** — *abrir, crear, nombrar, decir cuándo, y meterle gente*. El
tercer paso **hoy no existe en ninguna parte**: para poner a alguien en un turno hay que
irse a la malla y arrastrar persona por persona.

**Y una restricción que apareció al mirar la base, no al imaginarla:** `turnos` tiene
`nombre`, `inicio`, `fin`, `colacion` y `orden` — **no guarda en qué días existe**. Así que
«definir los días» tiene dos lecturas con costes muy distintos:

- **(a) los días son del turno** → columna nueva → **un SQL que Pedro tiene que pegar**, y
  el turno deja de aparecer los días en que no existe: toca varios sitios.
- **(b) los días son de a quién se lo pones** → sin tocar la base; los días elegidos son
  aquellos en que la gente del paso 3 queda asignada.

**La idea de Pedro de usar un calendario (msg 4368) cae sola del lado (b)**: un calendario
son **fechas concretas**, no un patrón semanal. Maquetado en la **E**, con atajos arriba
—«L a V», «Fines de semana», «Todos»— para que sirva igual a «el viernes 10» que a «todos
los viernes del mes».

**Pendiente de él antes de seguir:** aplicar `arreglo-renombrar-tramos.sql` y decir si
además quiere el SQL de la opción (a).

## 06-10-2026 · `comprobar.sql`: saber qué está aplicado sin adivinar

Con 17 archivos de arreglos, «¿qué falta?» no se contesta de memoria. Ya costó una vez:
`arreglo-equipos.sql` llevaba **un día sin aplicar** y el campo Equipo no se podía guardar
— se descubrió por un error del usuario, no por una comprobación.

Y el acumulado **no sirve para salir de dudas**: `arreglo-todo.sql` **vacía la dotación**.
Pegarlo «por si acaso» cuesta volver a teclear cuánta gente va en cada turno.

→ **`comprobar.sql` no escribe nada.** Lee el catálogo de Postgres y devuelve una fila por
arreglo con ✅ o 🔴. Es la respuesta a la pregunta que el propio README pedía poder hacer
«en un clic».

🔴 **Y al escribirlo apareció lo que no se veía:** `arreglo-todo.sql` **no mencionaba
`dotacion_tramos` ni una vez**. Le faltaban `arreglo-tramos.sql` y
`arreglo-renombrar-tramos.sql`, pese a que la regla escrita dice que *cada migración nueva
se agrega ahí además de publicarse suelta*. Quien lo pegara para salir de dudas se quedaba
**sin la tabla de horarios libres**, y la app caería en su modo degradado sin explicar por
qué. Corregido: ahora lleva las tres que faltaban, en orden.

→ **Una regla que solo vive en un documento se incumple sin que nadie lo note.** La
comprobación es lo que la hace real.

## 06-10-2026 · `arreglo-dias-turno.sql`

`turnos` no guardaba en qué días existe cada turno. Se agrega `dias text` con los índices
**0 = lunes … 6 = domingo**, la misma convención que ya usa la app (`(getDay()+6)%7`).

**El default es `'0123456'` a propósito**: los turnos que ya existen tienen que comportarse
exactamente igual después de pegarlo. *Una migración que cambia lo que ya funcionaba no es
una migración, es un susto.*

Texto y no array ni máscara de bits para que se lea de un vistazo en el editor de Supabase:
`select nombre, dias from turnos` lo dice todo.

## 06-10-2026 — un arreglo suelto CADUCA, y nadie avisa

Pedro pegó `arreglo-tope.sql` para completar lo que `comprobar.sql` marcaba en
rojo. Falló, y lo hizo de la peor manera: la pantalla de Supabase no dejó nada
claro y el verificador siguió diciendo 🔴 después de haberlo pegado dos veces.

La causa no era la columna. El archivo traía **dos** cosas:

1. `alter table locales add column ... bloquear_sobre_tope` ← lo que faltaba
2. una `tomar_turno()` del **02-10**, que leía la tabla `turnos_abiertos`

Pero el **03-10** `arreglo-sin-asignar.sql` mudó los turnos sin dueño a
`asignaciones` y reescribió `tomar_turno()` entera — y la nueva **ya consultaba
`bloquear_sobre_tope`**, además de saber de turnos ofrecidos, del «se pisa» y
del «ya es tuyo». Pegar el archivo completo no agregaba nada: retrocedía la
función tres arreglos.

### Lo que esto destapó: ocho archivos en la misma situación

| Función | Definida en | Manda |
|---|---|---|
| `mi_semana()` | **7 archivos** | `arreglo-sin-asignar.sql` |
| `ofrecer_turno()` | 4 | `arreglo-sin-asignar.sql` |
| `propina_de()` | 3 | `arreglo-reloj-control.sql` |
| `marcar()` | 3 | `arreglo-marcar-sin-plantilla.sql` |
| `tomar_turno()` | 2 | `arreglo-sin-asignar.sql` |
| `renombrar_puesto()` | 2 | `arreglo-renombrar-tramos.sql` |

Dentro de `arreglo-todo.sql` el orden está bien y el posterior pisa al anterior.
**El peligro es pegar uno SOLO**, que es justo lo que invita a hacer un
verificador que dice «a este archivo le falta». Por eso los ocho archivos
pasados llevan ahora un encabezado `NO PEGAR SUELTO` con el nombre del que manda.

El orden canónico, por si hay que reconstruirlo, se saca de `arreglo-todo.sql`
buscando dónde cae la primera línea única de cada archivo:

```
marcas · propina · tanda2 · tope · equipos · dotacion-puesto · dotacion-turno ·
puesto-en-turno · turno-con-horas · reloj-control · puestos · sin-asignar ·
modelos · tramos · renombrar-tramos · dias-turno · marcar-sin-plantilla
```

### Y el fallo real que salió de revisar esto

`marcar()` —el «confirmo» y el «llegué» del trabajador— exigía
`turno_id is not null`, o sea que el turno viniera de una **plantilla**. Cierto
el 02-10. Desde el 03-10 el diálogo de la malla abre con «— escribir las horas —»,
que guarda `turno_id = null`.

**Desde ese día, a quien tuviera un turno con horas escritas a mano no le
funcionaban los botones de su link.** Y no daba error: la función devolvía
`false` y la pantalla se quedaba igual. En la vista del jefe esa persona
aparecía simplemente como que no confirmó.

Arreglado en `arreglo-marcar-sin-plantilla.sql`: la condición pasa a
`inicio is not null`, que es la que ya usaba `tomar_turno()`.

### Lo que se cambió para que no vuelva a esconderse

`comprobar.sql` solo miraba `information_schema.columns` y `to_regclass`. Un
arreglo que **únicamente reescribe una función** no deja rastro ahí: no falta
ninguna columna, así que el verificador no tenía nada que decir. Ahora hay una
fila que mira `pg_proc.prosrc`:

```sql
exists(select 1 from pg_proc
        where proname='marcar' and prosrc not like '%turno_id is not null%')
```

Son **13 filas**. Toda migración que solo toque funciones necesita su fila de
este tipo, o es invisible.

### Y el verificador se creyó un comentario mío

Cerrando lo anterior, la fila nueva de `comprobar.sql` salió 🔴 **con el arreglo
ya aplicado**. La comprobación era por la negativa:

```sql
prosrc not like '%turno_id is not null%'   -- ¿ya no está la condición vieja?
```

Pero el propio `arreglo-marcar-sin-plantilla.sql` dejaba la condición vieja
escrita en un **comentario dentro de la función**, explicando qué cambiaba. Y
`pg_proc.prosrc` guarda el cuerpo **con sus comentarios**. El verificador leyó
el comentario y dijo que faltaba.

Dos reglas de esto:

1. **Preguntar por lo que tiene que ESTAR, no por lo que no.** Una comprobación
   positiva (`prosrc like '%p_fecha and inicio is not null%'`) no se rompe por
   escribir de más. Una por la negativa la rompe cualquier comentario.
2. **Un comentario dentro de una función no es inerte.** Es parte de `prosrc` y
   cualquier cosa que lea el cuerpo lo va a ver.

Es el mismo golpe que el del 05-10 con `gen_libro.py`, donde un comentario CSS
mío invalidó la regla `.invita`: lo que escribo para explicar también lo lee el
que parsea.

## 06-10-2026 — la malla como planilla, etapa 1

Pedido de Pedro: *«la planilla deberia aceptar enegrecer, copiar pegar, faltan
las opciones del boton derecho. en resumen, se deberia poder nevegar en la
planilla como si fuera una planilla excel»*. Orden que él fijó: **cerrar lo
pendiente, luego 1 (seleccionar/copiar/pegar), 2 (botón derecho), 3 (flechas,
Ctrl+Z, tirador de relleno)**. Esto es la 1.

### La decisión que ordena el resto: no cambiar ningún gesto que ya existe

Lo de Excel es *un clic selecciona, dos clics editan*. Acá **no**: el clic que
abre el diálogo del turno es el gesto más repetido de la pantalla, y cambiarle
el significado le rompería la mano a Pedro por una función que todavía no sabe
que existe.

Entonces:

| Gesto | Antes | Ahora |
|---|---|---|
| clic en un turno | abre el diálogo | abre el diálogo **y marca la casilla** |
| clic en «+ turno» | agrega | agrega **y marca la casilla** |
| arrastrar un turno | lo mueve | lo mueve (igual) |
| **arrastrar desde la casilla** | nada | **pinta un rango** |
| **Shift+clic** | nada | **rectángulo desde el ancla** |
| **Ctrl+clic** | nada | **suma o quita una casilla** |
| **Ctrl+C / X / V / Supr / Esc** | nada | copiar, cortar, pegar, borrar, soltar |

Hay una prueba de humo dedicada a que esto no se rompa, escrita en mayúsculas
porque es la única forma de que esto saliera caro: `UN CLIC EN UN TURNO SIGUE
ABRIENDO EL DIÁLOGO`.

### Tres detalles que no son obvios

**La selección vive por CLAVE (persona + fecha), no por elemento del DOM.** La
tabla se repinta entera en cada cambio: una referencia a un `<td>` quedaría
apuntando a algo que ya no está en la página. `pintarSemana()` vuelve a aplicar
la clase `.sel` a las casillas cuya clave está en el conjunto.

**La geometría se calcula EN EL MOMENTO del gesto, no al pintar.** Las filas de
la malla no son una grilla regular — hay títulos de grupo (`GARZÓN`, `COCINA`),
la fila «Sin asignar» y el pie. Numerar `<tr>` no sirve: se numeran solo las
filas que *tienen* casillas.

**Pegar REEMPLAZA, no suma.** Copiar el lunes sobre el martes tiene que dejar el
martes igual al lunes, no con el doble de turnos. Es lo de Excel y lo que uno
espera. Deshacer lo repone. Dos formas, las dos de Excel: una sola casilla
copiada se repite en **todas** las marcadas; un rectángulo se pega anclado
arriba a la izquierda.

**Las ausencias no se pisan.** Pegarle un turno encima a alguien que está de
vacaciones es lo contrario de lo que uno quiso hacer: esas casillas se saltan y
el mensaje dice cuántas.

### La barrita de abajo no es decoración

`#selAviso` dice cuántas casillas y cuántos turnos hay marcados, y lista los
atajos. Sin ella la selección es un recuadro verde que no le dice a nadie que
ahora puede apretar Ctrl+C: la función existiría y no la encontraría nadie. Es
el mismo problema que tenía «Horario libre…» escondido en el desplegable.

### Solo en la vista por personas

En la de **puestos** una fila no es gente, así que «pegar acá» no quiere decir
nada claro — y además comparte `#tablaSem`, por lo que hay un guardia explícito
(`if (S.agrupar === 'puestos') return`). En el **mes**, el clic en el hueco ya
abre el diálogo: no hay gesto libre que tomar sin romper algo.

Se ve en `planilla_seleccion.png`.

### Etapa 2 — el menú del botón derecho

Lo que hace que valga la pena no es repetir los atajos en un menú: es que **se
vean**. Los de la etapa 1 solo los encuentra quien ya sabe que existen; el botón
derecho es donde la gente va a *buscar* qué se puede hacer con lo que marcó.

Dos reglas:

- **Apretar fuera de lo marcado selecciona eso primero**, como Excel y como
  cualquier explorador de archivos. Abrir un menú que opera sobre otra cosa es
  la forma más rápida de borrar lo que no era.
- **Lo que no se puede hacer sale apagado, no escondido.** Un menú que cambia de
  largo según el caso no se aprende nunca; uno que siempre tiene las mismas
  siete filas, sí. Y un «Pegar» gris con su `Ctrl+V` al lado **enseña** que el
  atajo existe.

Trae además dos cosas que no son atajos de teclado y que a mano cuestan:
**Marcar toda la fila** (la semana de una persona) y **Marcar todo el día** (una
columna entera). Es lo que uno quiere cuando piensa «cópiale la semana a Benja».

#### Dos fallos que encontró cada método, y ninguno encontró el otro

1. **La prueba:** el manejador hacía `cerrarMenu()` *antes* de leer la acción, y
   `cerrarMenu()` deja `MENU.cel` en `null`. «Marcar toda la fila» cerraba el
   menú y no marcaba nada. Se guarda la casilla antes de cerrar.
2. **La captura:** las opciones sin atajo dibujaban un `<kbd></kbd>` vacío — un
   recuadro gris diminuto que parece un control roto. Ninguna prueba lo iba a
   ver; se vio mirando la imagen.

Es el mismo par de siempre: medir no es mirar, y mirar no basta si la cosa tiene
botones. Se ve en `planilla_menu.png`.

### Etapa 3 — moverse con el teclado, Ctrl+Z y el tirador de relleno

- **Flechas** mueven la casilla activa · **Shift+flechas** estiran el rectángulo
- **Inicio / Fin** al primer o último día de la fila
- **Enter** abre el turno de la casilla (o crea uno si hay varios: con dos o más
  no hay forma de saber cuál quiso, y crear es lo único que no destruye nada)
- **Ctrl+Z** = el mismo botón Deshacer de arriba
- **Tirador de relleno**: el cuadradito de la esquina de abajo a la derecha de
  lo marcado. Se arrastra y repite los turnos hacia donde se lleve, con el molde
  ciclando por fila y columna como en Excel.

**El ancla y la casilla activa se guardan por separado.** Es lo que hace que
Shift+flecha funcione: el rectángulo se mide entre el ancla —donde empezó la
selección— y la activa, que es la que se mueve. Con una sola variable, estirar
y después achicar no vuelve sobre sus pasos. Hay una prueba para eso.

**El tirador va en un elemento suelto colgado del `<body>`, no dentro del `<td>`.**
Dentro lo cortaría el borde de la casilla, y habría que redibujarlo en cada
repintado de la fila.

#### Dos cosas que salieron de aquí y no eran el tema

1. **Una prueba que fallaba una vez de cada dos.** `pintarTirador()` medía la
   casilla justo cuando la tabla se estaba repintando: `getBoundingClientRect()`
   devolvía ceros, el control de bordes decía «está fuera de la vista» y el
   tirador se escondía solo. Ahora, si la medida viene en cero, se reintenta en
   el cuadro siguiente en vez de ocultarlo. **Una prueba intermitente es un
   fallo real que todavía no se entiende**, no ruido que se tapa subiendo el
   `sleep`.

2. **Deshacer no estaba probado.** En `demo_datos.js`, `reponerAsignaciones` era
   `() => esperar({})` — un no-op. La prueba de Ctrl+Z pasaba sin probar nada.
   Es la red de seguridad que se menciona en *cada* mensaje de confirmación
   («si fue sin querer, aprieta Deshacer»): ahora está implementada en el banco
   de pruebas y se ejercita en cada corrida.

   Regla: **un doble que devuelve `{}` para todo convierte en verde cualquier
   prueba que lo toque.** Al escribir uno, implementar de verdad las funciones
   que alguna prueba vaya a ejercitar, o la prueba miente.

### La misma planilla en PUESTOS y en MES (06-10, tarde)

Al presentar la etapa 1 dije que en Puestos no tenía sentido, «porque las filas
son puestos y al pegar no quedaría dicho a quién le toca el turno». **Era
falso, y Pedro lo cazó en un mensaje:** el turno copiado se lleva su
`persona_id`. Él lo formuló mejor que yo: *«copiar el puesto con alguien si ya
está asignado o el puesto sin asignar si no está asignado»*.

#### Lo que cambia según la rejilla

La diferencia entre las dos vistas está en una sola función, `nacerEn()`:

| Rejilla | Manda | El turno pegado… |
|---|---|---|
| **personas** (Semana y Mes) | la fila | pasa a esa persona, conserva su puesto |
| **puestos** | la columna de la izquierda | pasa a ese puesto, **conserva a su persona** (o sigue sin dueño) |

#### La clave lleva el tipo

`claveCel()` devuelve `p|<personaId>|<fecha>` o `q|<puesto>|<fecha>`. Sin el
prefijo, lo copiado en una vista se podría pegar en otra donde significa algo
distinto; con él, `pegarSeleccion()` lo rechaza y dice dónde pegarlo. El **Mes
no necesita tipo propio**: su casilla es exactamente persona × día, la misma que
la semana.

La fecha se saca con `lastIndexOf('|')`, no con `split('|')[2]`: un puesto se
puede llamar «Barra|2».

#### El impedimento real era el clic, no la semántica

En Puestos y en Mes, apretar el hueco de una casilla **ya abre el diálogo de
crear**. Sin hacer nada, arrastrar para marcar un rango te abría una ventana al
soltar. Se resuelve tragándose ese clic — y ahí hubo un fallo propio que vale
anotar:

**La primera versión usó la bandera del arrastre directamente.** Como el `click`
solo llega si sueltas *dentro* de la tabla, la bandera se quedaba armada al
soltar fuera —o al arrastrar el tirador, que vive colgado del `<body>`— y
entonces **el siguiente clic en un turno no abría el diálogo**. Exactamente el
desastre que la prueba `UN CLIC EN UN TURNO SIGUE ABRIENDO EL DIÁLOGO` existe
para evitar, y es la que lo cazó.

La versión buena arma el permiso en el `mouseup` y lo desarma en un
`setTimeout(…, 0)`: el navegador manda `click` justo después de `mouseup` y
antes de cualquier temporizador, así que se come **exactamente un clic**, el de
ese arrastre, aunque ese clic nunca llegue.

#### Y el CSS que la prueba no podía ver

La prueba comprobaba que la casilla del mes recibiera la clase `.sel`. La
recibía. Pero la regla de estilo decía `td.cell.sel`, y el mes usa `td.mcel`:
**estaba marcada y no se veía**. Se vio abriendo la pantalla. Otra para la lista
de que medir no es mirar.

Se ve en `planilla_puestos.png` y `planilla_mes.png`.

## 06-10-2026 — el principio que Pedro escribió, y lo primero que arregló

Pedro fijó cómo se decide en esta app (msg 4471). Está en **`principios.md`**, y
manda cuando dos decisiones de pantalla se contradicen: **la libertad es del
encargado, la app avisa en vez de bloquear, y el camino
necesidades → turnos → gente es el sugerido, no el obligatorio.**

### Lo que sobraba de su frase, y es lo importante

Escribió *«la plataforma me da las restricciones **legales**»*. **La app no tiene
ninguna regla del Código del Trabajo chileno.** Lo único que lo parecía ya venía
con su advertencia en el código desde el 05-10:

```js
/* ⚠️ Esto NO es una regla legal chilena [...] Es una regla de SENTIDO COMÚN
   del local. */
const DESCANSO_MIN = 10;
```

Y las horas de contrato no se comparan contra la ley: se comparan contra el
número escrito en la ficha de cada persona.

Esto es un producto que promete cumplimiento laboral. **Si lo dice y no lo
tiene, el error lo paga Pedro.** Se le plantearon dos salidas —llamarlo por su
nombre, o implementarlas de verdad con el artículo citado— y eligió la primera
*«por ahora, es un prototipo»*. Aplicado el mismo día:

- **`conforme` → `sin avisos`.** Era la palabra peligrosa: suena a veredicto de
  cumplimiento y lo único que decía es que no saltó ningún tope del propio local.
- **Encabezado en «Por persona»**: *son avisos del local, no reglas legales.*
- **Los motivos del repartidor dicen de dónde salen**: `(tope del local)`.

**Queda pendiente y no se improvisa al final:** cuando deje de ser prototipo hay
que implementarlas con fuente. Cambia qué se bloquea, qué se avisa y qué se
guarda como prueba.

### Poner una ausencia borraba turnos en silencio

Primer arreglo que salió del principio. Una ausencia es una por día y **manda
sobre lo planificado**: al ponerla, los turnos de ese día se borran. Eso está
bien y tiene que ser así.

Lo que estaba mal era que **no se decía**. Los turnos desaparecían y el día
quedaba en blanco sin explicación. Ahora:

> «Se quitaron 2 turnos de Ana el 09-10: una ausencia manda sobre lo
> planificado. Si fue sin querer, aprieta Deshacer.»

**Una corrección a lo que yo mismo había escrito** en `principios.md`: lo llamé
«una puerta cerrada que nadie eligió». No lo era — `recordar()` ya estaba antes
de la llamada, así que **Deshacer sí lo reponía**. El defecto era el silencio,
no el bloqueo. Corregido ahí.

Y, otra vez, **el doble de `ponerAusencia` en `demo_datos.js` era
`() => esperar({})`**: cualquier prueba que lo tocara habría salido verde sin
probar nada. Implementado de verdad junto con la prueba. Es la tercera vez que
aparece lo mismo en un día.

### El Deshacer de la dotación nunca estuvo probado

Dicho el patrón, se fue a buscar. En `demo_datos.js`:

```js
borrarDotacion: perfil => { BD.dotacion = sinPerfil(BD.dotacion, perfil); … },  // SÍ borra
reponerDotacion: () => esperar({}),                                            // NO repone
```

La mitad que destruye estaba implementada y la que repara no. **Apretar
Deshacer en «Cuánta gente necesito» vaciaba la dotación del banco de pruebas y
no reponía nada**, y ninguna prueba lo habría visto porque no había ninguna.

En la app de verdad ese botón funciona —`datos.js` sí lo implementa—, pero
**nunca estuvo probado**, que es lo grave: es de los que más caro salen el día
que se rompan.

Implementado, y con prueba propia: cambiar un número, apretar Deshacer y
comprobar que **vuelve al valor anterior, no a cero**.

**El patrón, que vale para cualquier doble de pruebas:** los que quedan sin
implementar son siempre los de las acciones que borran —deshacer, limpiar,
ausencia—, justo las que más falta hace probar porque son las que nadie prueba a
mano. Tres aparecieron el mismo día: `reponerAsignaciones`, `ponerAusencia` y
`reponerDotacion`.

### «−42,0 h» no son horas negativas

De la lista de cosas anotadas navegando la app y nunca entregadas. En «Por
persona» cada línea termina en algo como `−42,0 h`, y **parece que esa persona
tiene horas en contra**. Dice otra cosa: cuánto le falta para llegar a las horas
de su contrato. No había forma de averiguarlo desde la pantalla.

Arreglado sin rediseñar nada, que es lo que corresponde a un prototipo:

- **Una línea que decodifica la fila**: *horas planificadas · días · lo que
  cuesta · cuánto le falta o le sobra contra su contrato*, y dicho explícito que
  `−8,0 h` son las que faltan, no horas negativas.
- **`title` en los tres números que no se explican solos**: la diferencia
  (*«le faltan 34,0 h para su contrato de 42,0 h»*), las horas de la malla, y el
  **saldo** (*«saldo acumulado de semanas anteriores, de Cerrar la semana al
  saldo. No es de esta semana»*) — que era el más opaco de los tres, porque ni
  siquiera se sabía de qué semana hablaba.

Es el principio de Pedro otra vez: **decir por qué, no solo mostrar el número.**

## 06-10-2026 — «Plantillas» estuvo rota día y medio y nadie lo vio

**El fallo.** La pestaña *Plantillas* se abría **completamente vacía**: sin la
lista de modelos, sin los botones de semanas, sin la gente. No se podía aplicar
ni guardar nada.

**Desde el 05-10 a las 16:34** (`2ae71d5`, el commit que convirtió Modelos de
botón a pestaña). **Un día y medio en producción.**

**La causa.** Al reordenar, cinco funciones —`pintarModelos`, `listoYCerrar`,
`marcarSemanas`, `marcarTodosTexto` y `opcionesModelo`— quedaron **declaradas
dentro de `conectarApp()`**. Los manejadores que viven ahí las alcanzan sin
problema, por eso todo *parecía* bien. Pero `verSub()` es global y hace:

```js
if (cual === 'plant') pintarModelos();   // ReferenceError
```

**Por qué no se vio, que es lo importante.** `verSub()` **destapa el panel antes
de pintarlo**. Así que el error se lanzaba *después* de que la pestaña ya estaba
a la vista, el escuchador del clic se lo tragaba, y el resultado era un panel
abierto y vacío. **Se ve igual que «todavía no hay modelos guardados».** Nadie
reporta eso: se asume que falta configurar algo.

**Cómo apareció.** No por una prueba ni por un reporte: escribiendo una prueba
para *otra* cosa —que Deshacer cubriera las 4 semanas de «aplicar un modelo»—
que fallaba con «no guardó foto». Perseguir ese «no guardó foto» en vez de
ajustar la expectativa de la prueba es lo que destapó esto.

**El arreglo.** Las cinco al módulo, donde viven todas las demás pintoras. Solo
usan globales, así que mudarlas no cambia nada más.

**La prueba**, que es la que faltaba desde el principio:

```
PLANTILLAS SE LLENA AL ABRIRLA
```

### Dos lecciones que no son sobre JavaScript

1. **`node --check` no vio nada**, porque no hay error de sintaxis: una función
   anidada es JavaScript perfectamente válido. Lo único que lo detecta es
   **abrir la pantalla**.
2. **Una prueba que falla de forma rara es una pista, no una molestia.** El
   mensaje era «no guardó foto» y no tenía nada que ver con el fallo real.

### Y una comprobación nueva: `pruebas/anidadas.py`

Lo de Plantillas es barato de detectar si uno lo busca, así que ahora se busca
en cada corrida de `humo.sh`, **antes de abrir el navegador**:

```
$ python3 -I pruebas/anidadas.py app.js
78 funciones anidadas · 0 con llamadas desde fuera
```

Recorre el archivo midiendo la profundidad de llaves, anota qué funciones se
declaran dentro de otra, y marca las que **se llaman desde fuera de su padre**.

**Verificada contra el `app.js` roto**, que es lo único que la hace válida:

```
$ python3 -I pruebas/anidadas.py app.pre-mover.js
🔴 pintarModelos() se define en la linea 4637, DENTRO de conectarApp()
   [4552-5355], y se llama desde fuera: [4549]
```

El barrido sobre el archivo arreglado da **78 anidadas y ninguna mal**: el de
Plantillas era el único caso. Un resultado negativo que costó cinco minutos y
descarta toda una familia de fallos.

### Dos trampas de operación de `humo.sh`, las dos pisadas el 06-10

**1. Dos corridas a la vez dan un desastre falso.** Lanzar `humo.sh` dos veces
en paralelo —aunque sea para ver la cabeza y la cola de la salida— hace que las
dos compartan **el mismo Chrome** de agent-browser y se pisen la página. Dio
`37 bien · 24 mal` sin que hubiera absolutamente nada roto, y por un momento
pareció una regresión de verdad. Ahora el script toma un candado
(`/tmp/humo-malla.lock`) y la segunda corrida se niega a arrancar.

**2. No editar el script mientras corre.** Bash lee el archivo **a medida que
avanza**, así que añadirle líneas en caliente le desplaza el punto de lectura y
revienta con un error de sintaxis en una línea que está perfectamente bien:

```
pruebas/humo.sh: line 58: syntax error near unexpected token `('
```

El archivo en disco estaba sano (`bash -n` lo confirma). La corrida, no. Si hay
que tocar el script, primero se espera a que termine.

Las dos se ven igual que un fallo real, y las dos cuestan el mismo rato de
diagnóstico hasta que uno se acuerda. Por eso quedan escritas.

## 06-10-2026 — crear y editar un turno: construido

`abrirTN()` reemplaza a `nuevoTurnoRapido()`, que era esto:

```js
const nombre = prompt('¿Cómo se llama el turno nuevo?');
await DATOS.crearTurno(S.local.id, { nombre, inicio: 9, fin: 17, colacion: 0.5 });
```

### El calendario, y por qué costó tres rondas

Yo proponía botones `Lun…Dom` y lo defendía con un argumento correcto —un
calendario de octubre no puede decir «la Cena existe los jueves, para siempre»—
que resolvía **un problema que Pedro no tenía**. Lo pidió tres veces. A la
tercera pregunté con tres lecturas concretas y su respuesta fue literal:

> «si marco un día, es solo ese día, si marco dos, son esos dos»

**Lo que se marca es lo que queda. La repetición se OFRECE, no se asume.** Mi
maqueta tenía el valor por defecto invertido: daba el patrón por hecho y dejaba
salir de él.

De ahí salió una regla que no estaba en ningún documento: **«hasta cuándo»
—«indefinido» incluido— solo existe si se aceptó repetir.** No se puede repetir
para siempre lo que son cuatro fechas sueltas. Por eso `#tnCajaHasta` nace
oculto y aparece al aceptar.

**El eco** (`.tncal button.eco`) son los días que caen en el patrón y que el
usuario *no* marcó. No es decoración: deja **ver** qué entendió la pantalla sin
tener que creerle a la frase.

### Lo que se escribe al guardar

- **Sin patrón** → exactamente los días marcados.
- **Con patrón** → desde el lunes de la semana del primer día marcado, tantas
  semanas como diga «hasta cuándo»; «indefinido» escribe `HORIZONTE_SEMANAS = 8`
  y se estira después. Es la **opción A** que eligió Pedro, y está aislada en una
  constante y una función (`fechasTN`) justamente para poder pasar a la B sin
  tocar la pantalla.
- **Lo marcado a mano entra siempre**, aunque caiga fuera de la ventana. Lo tocó
  a propósito.

**La foto de Deshacer se toma con `recordarDeLaBase()` sobre todo el rango**, no
con `recordar()`. Este crea turnos en ocho semanas de una, y `recordar()` solo
fotografía la semana en pantalla: habría repuesto una y dejado siete. Es
exactamente el fallo que se arregló hoy en «aplicar un modelo», evitado aquí
porque ya se conocía.

### El fallo visual que ninguna prueba iba a ver

El calendario salía de **996 px de ancho dentro de una caja de 289** y se
dibujaba encima del paso 3. Causa: el `tbody th{min-width:140px}` global —el de
la columna de nombres de la malla— y el `<tbody>` implícito que el navegador
inserta en toda tabla. Una prueba habría contado 31 botones y dicho que estaba
todo bien.

Arreglado con `min-width:0` en `.tncal th`, y anotado ahí mismo por qué no es
decorativo.

### La lista de turnos en Equipo: de cinco campos sueltos a una línea que se abre

Decisión 5. Cada turno era una fila con **nombre, entra, sale, colación, horas y
«Quitar»** — cinco controles para algo que mentalmente es una sola cosa — y era
el **único** sitio donde se podía editar un turno, cuando crearlos ya vivía en
otra pantalla distinta.

Ahora es una línea por turno que **se abre en el mismo diálogo con el que se
crean**. La línea muestra además **en qué días existe** el turno: `turnos.dias`
existe desde hoy y no se veía en ninguna parte.

Al hacerlo quedó obsoleto el aviso de la tarjeta —*«si el fin es menor que el
inicio, se entiende que cruza la medianoche»*—, que tenía sentido cuando las
horas se escribían ahí. El diálogo lo dice solo, y en el momento en que pasa.
**Un texto de ayuda que sobrevive a la pantalla que explicaba es basura que
parece documentación.**

**Pendiente, anotado y no hecho:** «Puestos del local», justo debajo, sigue con
el estilo viejo de campos sueltos. El contraste se ve en `tn_lista.png`. Es el
mismo arreglo, pero no se toca sin preguntarle a Pedro.

### Lo que falta para que «indefinido» sea de verdad indefinido

La opción A está construida a medias y **conviene no olvidarlo**: al crear un
turno indefinido se escriben las próximas 8 semanas y ahí queda. **A la novena,
la malla aparece vacía sin que nadie avise.**

Estirar el horizonte solo necesita un dato que hoy **no existe en la base**: un
turno creado con «4 semanas» y uno creado con «indefinido» quedan *idénticos* —
los dos con `dias` lleno y sus asignaciones escritas. `turnos.dias` dice en qué
días cae el patrón, no si hay que seguir generándolo.

Sin esa distinción, extender el horizonte extendería **también** los que tenían
fecha de término, que es lo contrario de lo pedido.

`arreglo-turno-hasta.sql` agrega `turnos.repite_hasta`:

| valor | significa |
|---|---|
| `NULL` | no generar nada |
| `'infinity'::date` | indefinido, seguir generando |
| una fecha | generar hasta ese día y parar |

`date` admite `'infinity'` en Postgres, así que no hace falta un booleano aparte
que pueda contradecir a la fecha. **Una columna menos que se pueda desincronizar.**

**Los turnos que ya existen quedan en `NULL`**, o sea «no generes nada». Nadie
los creó esperando que se estiraran, y empezar a escribirles turnos futuros por
una migración sería justo la sorpresa que una actualización no debe dar.

Pendiente de que Pedro lo pegue. `comprobar.sql` ya lo revisa: son **14 filas**.

### `--acento` no existe: la variable es `--accent`

Pedro pidió **tres veces** poder renombrar un puesto desde «Cuánta gente
necesito». La función existía desde el 05-10 y **funcionaba**. Lo que no existía
era la pista de que se podía pinchar:

```css
.trtit .pnom:hover{border-bottom-color:var(--acento);color:var(--acento)}
```

`--acento` no está definida en ninguna parte. Con una custom property
inexistente y sin respaldo, la declaración se vuelve inválida y el navegador la
descarta: **el hover no hacía nada**, y el subrayado quedaba del color de
cualquier borde. No hay forma de adivinar que ese texto es un botón.

**Una función que existe y no se nota es una función que no existe.** Él tenía
razón las tres veces.

Arreglado, y con la palabra «cambiar» al lado del nombre — en texto y no con un
icono, porque el `✎` (U+270E) salía como cuadrado vacío: la fuente del sitio no
lo trae, y un símbolo roto se ve peor que ninguno.

#### Y una corrección a mi corrección

Al probarlo dije *«lo probé y NO funciona»* y se lo escribí a Pedro. **Era mi
prueba la que estaba rota**, no la función: la partí en dos llamadas al
navegador, y entre una y otra el repintado dejó mi referencia apuntando a un
campo distinto del que el cierre del `addEventListener` estaba leyendo. El
`cerrar()` leía su `inp` original, con el valor viejo, y salía por
`v === puesto` sin llamar a nada.

**Una interacción con estado —abrir, escribir, confirmar— se prueba en una sola
llamada.** Partirla en pasos introduce un repintado en medio que no existe
cuando lo hace una persona.

### Tercera forma de estropearse una corrida de `humo.sh`

Ya estaban anotadas dos (dos corridas en paralelo, editar el script en
caliente). La tercera: **tocar el navegador con `agent-browser eval` mientras la
suite corre**. Dio `54 bien · 19 mal` sin que hubiera nada roto. El candado
`/tmp/humo-malla.lock` no protege de esto, porque el que estorba no es otra
corrida: soy yo.

Regla simple: **mientras `humo.sh` esté corriendo, el navegador no se toca.**

### El orden de un desplegable es un mensaje

Pedro, mirando «Cuánta gente necesito» (msg 4561): *«en las dos vistas como que
obliga a usar un turno predeterminado»*.

**No obligaba.** Siempre se pudo escribir cualquier horario. Pero lo parecía, y
para quien mira eso es lo mismo. Dos razones, las dos de redacción:

1. La salida se llamaba **«Horario libre…»**, que no dice *escribe tú las
   horas*: suena a un tipo raro de turno.
2. Estaba **al final**, debajo de los seis turnos guardados. Lo que está arriba
   parece lo normal y lo de abajo la excepción.

Y lo que lo delataba: el diálogo de la malla ya llamaba a esa misma opción
**«— escribir las horas —»**. *Dos nombres distintos para lo mismo dentro de la
misma app.*

Ahora el desplegable va: **escribir las horas · los turnos · + Turno nuevo…**
Lo primero que se ve es que puedes escribir lo que quieras; los turnos son el
atajo, no la obligación. Y el texto de la tarjeta lo dice con esas palabras.

De paso, «Copiar de» ordenaba por el `orden` de la base y la otra lista por hora
de entrada: **los mismos turnos en dos órdenes distintos**, visible comparando
dos capturas de Pedro. Las dos van ahora por hora.

**Pendiente, y es más grande:** él siguió con *«mejor deja para establecer un
rango horario»*, que parece querer decir que en esta pantalla **los turnos con
nombre sobran** y cada línea debería ser solo horas y un número. Encaja con su
encargo original —*«el lunes necesito 5 garzones entre 12:00 y 16:00»*— pero
obliga a enseñarle a repartir sobre rangos al generador automático, que hoy
trabaja con turnos. Preguntado antes de tocar nada.

## 06-10-2026 — «Cuánta gente necesito» pasa a ser solo horas

Pedro (msg 4569): *«dejemos todo en hora sin turnos... por el momento»*.

Venía de leer la pantalla como un catálogo cerrado: *«en las dos vistas como
que obliga a usar un turno predeterminado»*. Primero se intentó arreglar con
redacción —renombrar la opción libre y subirla al principio— y no bastó. El
problema no era el orden del desplegable: era **que hubiera un desplegable**.

Y encaja con el encargo original, de antes de que existiera esta pantalla:

> «el administrador no debería comenzar diciendo "Juan trabaja el lunes a las
> 12". Primero debería decir "el lunes necesito 5 garzones entre 12:00 y
> 16:00".»

Ahí no hay plantillas. Hay horas.

### Lo que NO se tocó, y por qué

El *«por el momento»* manda. Por debajo siguen existiendo las dos clases de
línea:

- la que venía de un turno sigue en **`dotacion`, con su `turno_id`** — que es
  lo que usa el repartidor automático;
- las demás, en **`dotacion_tramos`**.

**No se migró nada.** Volver atrás es revertir un bloque, no rehacer la
dotación del local. Lo único que cambió es que las dos **se ven y se editan
igual**: desde, hasta, cuánta gente.

**Una línea se despega de su turno solo si el usuario cambia sus horas.** Tiene
que ser así: mover «08:00» a «09:00» ahí no puede mover la Apertura de todo el
local sin avisar. Conserva su número — si no, cambiar una hora te borraría
cuánta gente necesitas, y hay una prueba para eso.

### La consecuencia que se le dijo antes de empezar

El **repartidor automático** reparte por turnos. Mientras esta pantalla sea de
horas y él siga mirando turnos, dejan de entenderse: no se rompe, pero tampoco
aprovecha las líneas nuevas. Es trabajo aparte y quedó dicho por adelantado, no
descubierto después.

### Las pruebas se reescribieron, no se relajaron

Siete fallaron. Todas vigilaban el desplegable, así que **ya no describían la
pantalla que queremos**. Se reescribieron para el diseño nuevo, y las dos que
cuidaban el orden de las opciones se reemplazaron por la que ahora importa:

```
NO HAY DESPLEGABLES: cada línea son horas
y toda línea tiene sus dos horas y su número
```

Una prueba que estorba después de un cambio de diseño se **reescribe**. Pero la
que se borra hay que reemplazarla por la que protege lo nuevo, o el cambio deja
un agujero donde antes había vigilancia.

## 07-10-2026 — el turno sin asignar, de verdad esta vez

Pedro leyó cómo lo resuelve Skello y dijo *«lo quiero como skello… lo de fondo»*
(msg 4675): un turno es **una sola cosa con la persona opcional**, y el hueco
vive en la misma malla.

Lo pedido ya estaba escrito desde el 3-oct. Lo que no estaba era **aplicado**.

### El verificador que miraba el lugar equivocado

`comprobar.sql` daba `arreglo-sin-asignar.sql` por aplicado porque existe la
columna `asignaciones.tomado_por`. Y la columna existía. Pero el síntoma que
molestaba —que un turno tomado no apareciera en la malla— no vive en una
columna: vive en una **función**.

`comprobar-funciones.sql` mira el catálogo de Postgres y dice qué versión está
viva. Resultado: `tomar_turno` y `ofrecer_turno` devolvían `boolean`, o sea el
modelo anterior. **Un verificador que solo mira columnas da verde mientras la
app se porta como la versión vieja.**

Distinguir cuesta más de lo que parece. Se descartaron dos señales antes de
quedarse con una:

1. **Buscar la palabra `asignaciones` en el cuerpo.** No sirve: la versión vieja
   de `ofrecer_turno` también la nombra una vez. Habría dado ✅ falso.
2. **El tipo que devuelve, solo.** Tampoco: `pendientes-06oct.sql` trae un
   `tomar_turno` que devuelve `jsonb` y **sigue leyendo `turnos_abiertos`**.
3. **La línea del `DECLARE`** (`v_a asignaciones` contra `v_ab turnos_abiertos`),
   junto con el tipo. Dos señales, y hacen falta las dos.

Un ✅ falso es peor que no comprobar: cierra la pregunta.

### Por qué nunca había entrado — y no fue lo que yo creía

La primera hipótesis fue que alguien pegó un archivo viejo encima del nuevo (el
06-10 se pegó `arreglo-tope.sql`, que trae una `tomar_turno` de tres arreglos
atrás). Plausible, y **equivocada**. Lo demostró el error al intentarlo:

```
ERROR 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION tomar_turno(text,uuid) first.
```

`create or replace` **no puede cambiar el tipo que devuelve una función**. El
archivo del 3-oct aplica las columnas primero y define las funciones al final,
así que revienta justo ahí. Pegado por partes deja **columnas nuevas con
funciones viejas** — exactamente el estado que encontramos. Nunca llegó a
entrar.

`arreglo-tomar-ofrecer.sql` lleva las dos funciones solas, copia literal de la
fuente vigente, con los `drop` antes de los `create`. **No se repegó el archivo
completo** porque ese también redefine `mi_semana()`, que está escrita en SIETE
archivos: repegarlo podía retroceder algo posterior.

### Lo que quedaba del modelo viejo en la app

Con la base ya migrada, `datos.js` seguía a medias — **leía** de `asignaciones`
y **escribía** en `turnos_abiertos`:

- **El canal en vivo escuchaba `turnos_abiertos`**, donde ya no escribe nadie.
  Alguien tomaba un turno y la malla **no se enteraba** hasta recargar a mano. Y
  eso es, literalmente, el «ver quién lo toma» que pidió Pedro.
- `abrirTurno` y `cerrarTurno` apuntaban a la tabla vieja. **No los llama
  nadie**, y ese es el peligro: el día que alguien los enganche a un botón,
  escriben donde ya no lee nadie.

### El doble que no podía probar nada

`demo_datos.js` sacaba los turnos abiertos de una lista aparte **siempre vacía**
y resolvía `abrirTurno`/`cerrarTurno` con `() => esperar({})`. Con eso, el banco
de pruebas no podía ni mostrar un hueco ni crearlo: **cualquier prueba sobre
huecos habría pasado sin probar nada**.

Ahora los saca de `asignaciones`, como la base real. Recién entonces se pudieron
escribir las dos comprobaciones que faltaban: que un turno sin dueño aparece en
la misma malla, y que el recuadro avisa «falta 1».

### Y lo que pidió por la mañana

- **Deshacer del renombrado** (eligió «A», dejarlo como está). El paso atrás
  **no es una foto**: `fotoDotacion()` y `fotoTramos()` guardan las filas *por
  nombre de puesto*, así que reponer una foto tomada antes del renombre dejaría
  filas colgando de un nombre que ya no existe. Deshacer llama a
  `renombrar_puesto` con el nombre viejo.
- **Los que comparten horario y puesto se ven juntos** (msg 4666), con la hora
  escrita una vez. Cada persona sigue siendo **su propio bloque**: agruparlos de
  verdad habría roto el arrastre, que mueve una sola asignación.
  **Esto es nuestro, no de Skello** — ellos no juntan dos personas en un
  recuadro. Se le dijo.

Publicado con `?v=109/72/76`. 84 comprobaciones en verde.

### «Puestos del local» pasa a ser una lista

Pedro: *«es mejor con puestos»* (msg 4658). Eran campos sueltos siempre abiertos
—Nombre, Color, Colación, Quitar— mientras la lista de **turnos**, diez píxeles
más abajo en la misma página, ya era una línea por turno que se abre. **Dos
estilos para lo mismo a la vista uno del otro.**

Ahora reusa la clase `.tnfila` —**cero CSS nuevo**— y editar abre el mismo
diálogo con el que se crea. Con eso se cae el `prompt()` de «Agregar puesto»,
que ya se había quitado de los turnos y quedaba solo aquí.

El renombrado desde «Cuánta gente necesito» **sigue donde estaba**: Pedro lo
pidió tres veces ahí. El diálogo lo acompaña, no lo reemplaza, y usa el mismo
`recordarRen()`, así que el Deshacer vale desde los dos lados.

**Tres cosas que no las cazó ninguna prueba, las cazó mirar el render:**

1. `.muestra` estaba escrita como `.rowline .muestra`. Al pasar los puestos a
   lista, la pastilla habría salido **sin color y sin avisar** — el mismo
   silencio de una variable CSS inexistente.
2. El nombre salía **dos veces**: como texto y otra vez dentro de la pastilla.
   En la pantalla vieja tenía sentido (era la vista previa del color mientras lo
   elegías); en una lista es ruido.
3. `.espacio` solo existe como `.semnav .espacio`, así que el separador del pie
   del diálogo **no hacía nada**.

### El banco de pruebas se generaba… si alguien se acordaba

`armar_demo.py` existe desde el 06-10 justo para que `demo.html` no divergiera
del `index.html`. El 07-10 agregué el diálogo de puestos al index y **la prueba
siguió abriendo un demo sin ese diálogo**: siete comprobaciones fallaron por una
razón que no tenía nada que ver con el cambio.

Lo cazó el **panel de diagnóstico** —`on()` anota cada elemento que no
encuentra—, no la prueba que yo había escrito. O sea que lo salvó una red puesta
meses antes para otra cosa.

**Una salvaguarda que depende de la memoria no es una salvaguarda.** `humo.sh`
genera ahora el banco antes de cada corrida, y si el generador falla, corta.

## 07-10-2026 (tarde) — la migración a ids, hecha a medias a propósito

Pedro pidió la «c» (msg 4648: *«vamos con los 4 pendientes y luego la c»*).
**Pasos 1 y 2 aplicados y verificados; el 3 quedó parado por decisión suya.**

### Lo que el mapeo corrigió de lo que yo había dicho

- **No son cuatro tablas, son seis columnas** con el nombre del puesto escrito
  (`personas.rol`, `asignaciones.puesto`, `dotacion.puesto`,
  `dotacion_tramos.puesto`, `modelo_turnos.puesto`, `turnos_abiertos.puesto`).
  **Cinco vivas**: la de `turnos_abiertos` murió esta misma mañana al fundir esa
  tabla.
- **`dotacion` y `dotacion_tramos` llevan el nombre del puesto DENTRO de su
  clave primaria** —`(local_id, perfil, puesto, turno_id)` y
  `(local_id, perfil, puesto, desde)`—. O sea que hoy **renombrar un puesto
  reescribe claves primarias en dos tablas**. Ahí está la raíz de que el
  renombrado necesitara una función que tocara media base.

### El bloqueo que nadie había visto

El relleno necesita que **todo nombre en uso exista en el catálogo**, y no era
el caso: `Aseo`, `Barra`, `Cocina` y `Garzón` en un local y `Mozo` en el otro
estaban en uso **sin estar en `puestos`**. Es el mismo defecto que Pedro reportó
a las 11:35 —*«sigue sin poder editarse eso»*—, y resultó ser **la precondición
de la migración**, no un detalle aparte.

Se crearon con un `insert … select` que los saca de lo que ya está escrito en
`dotacion` y `asignaciones`: así el nombre queda **idéntico** al que usan los
datos. Tipearlos a mano habría dejado un «Garzon» sin tilde que no engancha, y
el síntoma se habría visto igual por otra causa.

### Resultado

| tabla | filas con nombre | con id |
|---|---|---|
| asignaciones | 269 | 269 |
| dotacion_tramos | 184 | 184 |
| dotacion | 154 | 154 |
| modelo_turnos | 45 | 45 |
| personas | 43 | 43 |

**0 sin id.** Las columnas de texto siguen ahí y la app las sigue leyendo: por
eso nada cambió de comportamiento, y volver atrás es poner los ids en NULL.

### Dos tropiezos del día, los dos de la misma familia

1. **`modelo_turnos` no tiene `local_id`** —cuelga de `modelos_semana`—. El
   informe lo daba por hecho, el script se cayó con `42703` y, **como todo va en
   una transacción, no quedó aplicado ni el `ALTER`**. Es la segunda vez en el
   día: la primera fue el `42P13` de la mañana. *Un error al final revierte lo
   del principio.*
2. **Pedro mandó el informe del paso 1 creyendo que era el del 2.** Los dos
   salen con ceros y se parecen. Se notó por los **nombres de las columnas**, no
   por los números. Por eso el informe del paso 2 incluye `con_id`: **una cuenta
   que sube cuando el trabajo se hizo**, en vez de un cero que se ve igual antes
   y después.

### El paso 3, replanteado y en pausa

Lo obvio era reescribir la app para trabajar con ids. Hay un camino más corto
con el mismo resultado: que la app siga usando el nombre por dentro, pero que
**ese nombre salga del catálogo siguiendo el id**, en un solo lugar —la capa de
datos—. Renombrar pasaría a ser cambiar una palabra, y un puesto en uso no
podría faltar del catálogo.

**Parado antes de empezarlo:** Pedro dijo que la malla está bien y que lo que le
hace ruido es **«Cuánta gente necesito»** y el botón **«+ turno nuevo»**. Eso va
primero.

## 07-10-2026 (tarde) — lo que Pedro miraba en Skello

Paró la migración a ids y dijo qué le hacía ruido: **«Cuánta gente necesito» y
el botón de «+ turno nuevo»** (msg 4745). Después mandó **cinco capturas de
Skello** sin casi texto. Lo que salió de ahí:

### Su flujo ya existía, pero estaba escondido

Describió su lógica como *«Autenticación · Gestión de trabajadores · Gestión de
turnos»*, y para los turnos: *«creo un turno nuevo, asigno dónde irá en el
tiempo, luego agrego al personal a ese turno»* (msg 4748).

**Eso ya estaba construido**: el diálogo de turno hace exactamente esos tres
pasos —cómo se llama · cuándo es · quién lo trabaja—. Lo que fallaba es que
vivía **dentro de «Equipo»**, una pestaña que se lee como configuración. Por eso
se sentía que faltaba algo que estaba entero.

Ahora **«Turnos» es pestaña propia**, al lado de Equipo, en el orden de su
flujo. Y el **«+ Turno nuevo» salió de «Cuánta gente necesito»**: crear una
*plantilla* no es lo mismo que decir cuánta gente falta, y tenerlos a diez
píxeles confundía las dos cosas.

### El desplegable del bloque

De sus capturas: en la vista Postes de Skello, cada bloque trae la lista de
empleados con **«Non assignés» al final**. Cambiar quién cubre un turno costaba
aquí tres clics —abrir el diálogo, cambiar, guardar—; ahora es uno.

**No duplica ninguna regla**: al cambiar llama a `soltarTurno()`, el mismo
camino del arrastre, que ya pregunta antes de quitarle el turno a alguien,
revisa ausencias y choques de horario y deja su paso atrás.

Un detalle que costó una prueba en rojo: el `<select>` llevaba `data-asig`, y
ese atributo significa *«soy un bloque de turno»* para media docena de
`closest('[data-asig]')`. Con él puesto, esos `closest` devolvían **el select
—sin `data-p` ni `data-fecha`—** en vez del bloque. Va como `data-cubre`.

### El repartidor tenía 25 pruebas y ningún botón

`proponer()` existía desde el 05-10, probada, y **no la llamaba nadie**. Lógica
escrita y enterrada. El botón **«Repartir la semana»** vive en «Cuánta gente
necesito» a propósito: **es lo que esa pantalla devuelve**. Hasta hoy pedía las
horas de cada puesto y no entregaba nada visible — que es, textual, lo que a
Pedro le hacía ruido.

Propone y pregunta antes de escribir, no toca lo puesto a mano, deja Deshacer, y
lo que no logra cubrir **lo dice con su motivo**: *«2 ya tienen turno ese día, 1
está de ausencia»*. Esa era la única exigencia desde el principio: que sea
**explicable**. Un reparto que no se puede auditar obliga a revisarlo entero a
mano, y entonces no sirve.

### El color sale del puesto, no de las horas

Pedro, msg 4779: *«debe ser por puesto»*, mirando Skello —Manager azul, Ronde
verde, a cualquier hora—.

El color salía de **las horas**, y eso venía de arreglar algo real: antes salía
de la plantilla, y un turno al que le cambiaban las horas se quedaba pintado del
color viejo. Pero elegía **la dimensión equivocada**. Por horario ves de un
vistazo quién abre y quién cierra; por puesto ves cuánta cocina y cuánta barra
hay. Usa el color que cada puesto **ya tenía guardado**.

### «¿Te alcanza la gente?» pasa a la tira por horas

Eran columnas por nombre de turno. Dos problemas, y **el segundo lo destapó su
propia captura**:

1. La tarjeta **ya decía en su texto** que va por hora —porque contar por turno
   miente cuando dos se pisan— y arriba mostraba turnos. Decía una cosa y
   enseñaba otra.
2. Entre las columnas salía **«Apertura (copia)»**: el nombre que queda al
   copiar una plantilla. Como columna de un informe de cobertura no significa
   nada.

Ahora es la misma tira de la vista de Día —`.hncel`, cero CSS nuevo—. Y de
mirar el render salió otro arreglo que ninguna prueba iba a dar: **seis días de
«0/0» repetidos ahogaban al único día con datos**. Un día sin gente ni necesidad
se dice en una línea.

### Una prueba mía que se aprobaba sola

La que escribí para el color devolvía `'mismo color'` **cuando no encontraba
ninguna fila que examinar**: verde por no haber mirado nada. Hoy sí encuentra el
caso, pero los datos del banco cambian. Ahora grita en vez de aprobar.

**101 comprobaciones en verde.** Publicado hasta `?v=115/79`.

### Los botones de «Cuánta gente necesito» — una causa, tres síntomas

Pedro los fue encontrando uno a uno: *«el limpiar no limpió»* (msg 4786),
*«los botones están malos»* (4787), *«acá +línea también está malo»* (4793).
Hasta propuso **empezar el prototipo de nuevo** (msg 4788).

**Es un solo defecto.** Esos botones se escribieron cuando la pantalla tenía
**una** tabla por debajo. El 06-10 pasó a mostrar **dos clases de línea** —las
que vienen de un turno viven en `dotacion`, las demás en `dotacion_tramos`— y
los botones se quedaron mirando una sola:

- **«Limpiar»** borraba solo los tramos. Con un día cuyas líneas vienen de
  turnos, no pasaba nada visible. **Hacer la mitad del trabajo es peor que no
  hacerlo**: el que mira cree que falló y vuelve a apretar.
- **«Copiar este día a los demás»** contaba solo los tramos, así que contestaba
  *«no tiene ningún tramo todavía»* con la pantalla llena.
- **«+ línea»** sí funcionaba, pero vivía en la **columna de «quitar»** —un
  botón para agregar alineado debajo de los de borrar— y, cuando se negaba con
  razón (las líneas ya llegan al cierre), **el motivo salía al pie de la
  tarjeta**. Desde arriba, un botón que no hace nada y no dice por qué es
  indistinguible de uno roto.

El Deshacer de los dos primeros tenía el mismo agujero: `recordarAmbos()` guarda
ahora **las dos tablas**, y `deshacerDot()` atiende esa entrada **antes** que la
de solo-tramos — con el orden al revés habría repuesto la mitad y dado el paso
por hecho.

### Por qué ninguna de las 101 pruebas los vio

**El banco mentía, y van cuatro veces en un día.**

| doble | decía | hacía |
|---|---|---|
| `abrirTurno` / `cerrarTurno` | `() => esperar({})` | nada |
| `abiertos` | leía una lista aparte | la app ya usaba otra |
| `borrarDotacion` | `perfil => …` | recibía el **id del local** en el lugar del día |
| `copiarTramosDia` | `() => esperar(0)` | nada |

El tercero es el peor de la familia: **un doble sin implementar revienta y se
nota; uno con la firma cambiada aprueba**. «Limpiar» estaba roto en la app real
y la prueba lo daba por bueno.

De ahí sale `pruebas/doble.js`, que corre **antes de abrir el navegador**:

1. **Compara las firmas** del doble con las de `datos.js`. Si el doble declara
   parámetros pero menos que la función real, corta: las posiciones no calzan y
   va a hacer algo distinto en silencio. *Verificado volviendo a romper la firma
   a propósito.*
2. **Lista los dobles que no hacen nada** —hoy **15 de 50**—. No es un fallo,
   pero toda prueba que pase por ahí aprueba sin probar. Verlos escritos es la
   diferencia entre una prueba verde y una que sirve.

### Y una prueba mía que estaba mal antes que el botón

La de «+ línea» esperaba que agregara una línea en un día **ya lleno hasta el
cierre**, donde el botón se niega con razón. La prueba estaba equivocada, no el
código. Se arregló limpiando el día primero.

**109 comprobaciones.** Publicado hasta `?v=118/80`.

## Acordado el 07-10 por la tarde — HECHO esa misma noche

Pedro lo dejó dicho entre las 19:13 y las 19:15. **Nada de esto está hecho.**

### 1. El recorrido de tres pasos (confirmado: *«esto es»*, msg 4821)

1. En «Cuánta gente necesito» decide **cuánta gente necesita cada puesto**, en horas.
2. Eso **pasa a la malla como turnos SIN DUEÑO**.
3. Y recién ahí **les pone gente**.

**El paso 2 es el que no existe.** Hoy «Repartir la semana» se salta el medio:
va de la necesidad directo a la gente asignada. Él quiere ver **los huecos
puestos en la malla** y después llenarlos — a mano con el desplegable, o
apretando Repartir.

La pieza de fondo ya está: desde esta mañana un turno sin dueño **vive en la
misma malla**, no en otra pestaña. Falta el botón que los cree desde la
necesidad. Quedarían dos:

- **«Pasar a la malla»** — crea los turnos sin dueño según lo pedido
- **«Repartir la semana»** — el que ya existe, que además les asigna gente

### 2. Planificación en una sola página (msg 4819)

Textual: *«primero sacar plantilla. luego debería quedar la malla (en día,
semana y mes) y más abajo la planificación que estábamos viendo»*.

O sea: **fuera las sub-pestañas**. La malla arriba con su Día/Semana/Mes, y
debajo «Cuánta gente necesito», en la misma página.

**Lo que respondió después:**

- **«Plantillas»** — *«esa función debería ir en la malla. después la vemos»*
  (msg 4824). O sea: **no se borra**, se mueve adentro de la malla. El cómo
  queda para más adelante.
- **«Objetivo de costo»** — **sin responder**. Preguntar antes de desarmar.

### Lo que sí se hizo esa misma noche

- **Contador de semanas** en la cabecera (msg 4826: *«agrégalo ahora»*), como el
  «Semaine 33» de Skello. Regla **ISO-8601** y cálculo en **UTC**. Contar «siete
  días más, una semana más» acierta once meses y miente en el cambio de año: el
  **30-12-2024 ya es la semana 1 de 2025** y el **01-01-2022 era la 52 de 2021**.
  Seis casos de borde en `pruebas/semana_iso.js`.
- **Atajo «quitar puesto»** en el bloque de «Cuánta gente necesito», con la
  advertencia sacada a una sola función que usan los dos sitios.

### 🎯 El MVP, definido por Pedro el 07-10 a las 19:36

> *«La idea es tener un producto mínimo viable por el momento y eso es: los 3
> puntos»* — y volvió a pegar los tres pasos.

**El mínimo viable es el recorrido de tres pasos**, nada más. Todo lo demás
—filtros como pastillas, paso 3 de los ids, Plantillas dentro de la malla,
Objetivo de costo— **queda fuera del mínimo**, no cancelado.

Sobre **«Objetivo de costo»**: *«déjalo aparte por el momento porque no hemos
visto mucho ese tema»*. Se queda como pestaña propia; no baja a la página única.

**Esto es una definición de alcance, y sirve para decir que no.** Si mañana
aparece una idea buena que no es uno de los tres pasos, va a la lista de
después — incluso si es barata.

**Fuera del mínimo, anotado y vivo:** filtros como pastillas con
multi-selección · paso 3 de la migración a ids · Plantillas dentro de la malla
· la página única de planificación.

Advertido de antemano: **la página va a quedar larga**, y si la necesidad de
abajo se muestra entera o resumida se decide mirándola, no antes.

### ✅ Cerrado la noche del 07-10

Pedro: *«Los pendientes de la web, avísame cuando estén listos»* (msg 4846).

**El recorrido de tres pasos ya funciona completo.** Lo que faltaba era el
medio, y quedó como **«Pasar a la malla»**, al lado de «Repartir»: convierte lo
pedido en **turnos sin dueño** para asignarlos después.

**No duplica**, y eso no es un detalle: cuenta lo que ya hay por día, puesto y
horario exacto —con dueño o sin él— y crea solo la diferencia. Un botón que
duplica al segundo clic es un botón que da miedo apretar, y entonces no sirve
aunque funcione. Hay prueba de las dos pulsaciones.

**La planificación quedó en una sola página**: la malla arriba con su
Día/Semana/Mes y «Cuánta gente necesito» justo debajo. «Objetivo de costo» se
quedó aparte, como pidió.

**«Plantillas» salió de las pestañas y NO se borró.** Pasa a ser un diálogo
desde el menú «···». Sacar la pestaña sin reubicarla habría dejado los modelos
guardados **sin forma de aplicarse** — el mismo error del generador sin botón
que se arregló esa misma tarde. Y la prueba que vigila que ese panel no se abra
**vacío** —estuvo así día y medio en producción— se **reapuntó al diálogo en vez
de borrarse**.

Dos cosas dichas por adelantado, no descubiertas después: la página **quedó
larga** (3.933 px), y el orden de las tarjetas —planificación antes de los
resúmenes— es una lectura de *«más abajo la planificación»* que se mueve en un
minuto.

**119 comprobaciones.** Publicado hasta `?v=123/83`.

## 07-10-2026, 21:42 — la grieta que explicaba casi todo

Pedro, después de media tarde reportando botones sueltos: *«yo creo que tenemos
un tema que entendemos distinto qué es un turno y qué es un puesto…»* (msg 4858).

**Tenía razón, y nombrarlo valió más que cualquiera de los arreglos del día.**

### Lo que resultó al ponerlo sobre la mesa

Se le escribieron las definiciones de la app con un ejemplo —*«el lunes Ana
trabaja de 08:00 a 16:30 en Barra»*— y se le pidió la suya. Contestó:

> *«cuando yo quiero planear digo: necesito un turno (cuándo, doy un rango de
> horas) para un puesto. luego veo y asigno a la persona»*

**Y coinciden.** Puesto = el oficio · turno = el rango de horas · la persona
viene después. Su frase es, literal, lo que hace «Cuánta gente necesito» más
«Pasar a la malla».

### Entonces el problema no era el vocabulario: era una pantalla

**«Turnos del local» guarda horarios SIN PUESTO.** Y para él —y para Skello— un
turno siempre es *para algo*. Por eso la miraba y le faltaba una mitad: **le
falta de verdad**.

Verificado contra sus propias 28 capturas, no contra una impresión:

- *«El puesto viaja con el turno, no con el empleado.»* La prueba son sus
  solapas **Employés | Postes**: dar vuelta la tabla solo es posible si el
  puesto está **en el turno**.
- Un turno es **una entidad con la persona opcional** — por eso el desplegable
  de cada bloque termina en **«Non assignés»**.

**En Skello no existe un catálogo de horarios sueltos.** El turno nace con su
puesto, sobre la malla.

Pedro: *«así es, esa pantalla que guarda turnos sueltos está de más»* (msg 4865).

### Lo que hay que saber antes de borrarla

La pantalla sobra, pero los turnos guardados **alimentan dos cosas por debajo**:

1. **La franja horaria del local.** `franja()` saca el `h0`/`h1` del turno más
   temprano y el más tardío. Sin catálogo hay que derivarla de lo que se escriba
   en la planificación.
2. **El reparto automático.** `proponer()` reparte **sobre turnos**. Hay que
   enseñarle a repartir sobre los rangos escritos.

`S.turnos` aparece en **19 lugares** del `app.js`. Sacar la pestaña es barato y
reversible; sacar el concepto no lo es.

### La lección que se lleva fuera de este proyecto

Cuando **varias pantallas distintas incomodan** a la misma persona, conviene
sospechar del **vocabulario** antes que del diseño. Hoy se movieron botones toda
la tarde —el «+ Turno nuevo» fuera de lugar, el catálogo que no cerraba, la
planificación repartida en cuatro pestañas— y **todos esos síntomas salían de la
misma grieta**. La encontró él nombrándola, no yo arreglando botones.

## Noche del 07-10 — «trabajamos como Skello» y el paso 3 de los ids

Pedro: *«perfecto, déjalo como skello»* · *«preséntame mañana todo esto. Tienes
toda la noche»* · *«¿lo de los ids también lo haces durante la noche?»*.

Se le devolvió «como Skello» traducido a **cuatro cambios concretos**, porque esa
frase puede significar muchas cosas y entre ellas hay días de diferencia.

### 1 · Fuera el catálogo de horarios sueltos

En Skello no existe una lista de horarios sin puesto. **Dos cuidados**, y los dos
son el mismo error que se arregló esa tarde:

- El **diálogo de tres pasos solo se abría desde ahí**. Borrar la pantalla sin
  más lo habría dejado sin ninguna puerta — el generador sin botón otra vez.
  Vive en el menú «···» de la malla.
- El **tope de horas** («no dejar que alguien tome un turno si se pasa») no es un
  turno: es una regla del local. Se fue con el equipo.

Las tres pruebas de esa pestaña caducaron y **se reemplazaron**, no se borraron:
ahora vigilan que la pestaña no esté, que el tope no se haya perdido y que el
diálogo conserve sus tres pasos.

### 2 · El turno nace con su puesto

El desplegable ofrecía **«— cualquiera —»**: se podía guardar un turno sin
puesto, que es exactamente el rango de horas suelto que había que eliminar. Un
turno así **no se dibuja en la vista por puestos ni cuenta en la cobertura**:
existe, pero en ninguna parte. Ahora el puesto es obligatorio.

### 3 · La franja horaria se suelta del catálogo

De qué hora a qué hora se dibujan las pantallas salía **solo de los turnos
guardados**. Ahora sale de lo planificado, de lo que hay puesto en la malla, o
del catálogo viejo si queda algo.

**Se prueba aparte porque se equivoca en silencio**: si la franja queda corta,
los turnos de fuera **no se dibujan y no hay ningún error**. Es como Pedro
encontró el mes «en blanco» en septiembre. Seis casos en `pruebas/franja.js`.

### 4 · El reparto automático reparte sobre los rangos escritos

`proponer()` recorría el catálogo para saber dónde meter gente. Ahora recorre
los rangos de «Cuánta gente necesito»: un bloque por rango distinto, y un turno
guardado **pisa** al rango de sus mismas horas para no perder nombre ni colación.

Los rangos escritos llevan marca `tr:…`, que **no es un id de la base** y se
convierte en `NULL` al guardar: escribirla como `turno_id` reventaría, porque esa
columna apunta a `turnos`.

La prueba que importa es la primera de `pruebas/bloques.js`: **sin un solo turno
guardado, tiene que seguir habiendo sobre qué repartir**. Si alguien vuelve a
atarlo al catálogo, esa deja de pasar.

### Y el paso 3 de los ids — el que da el beneficio

- **Leer**: el nombre del puesto sale del catálogo **siguiendo el `puesto_id`**.
  El texto guardado en la fila es una copia, y una copia queda vieja.
- **Escribir**: el id se estampa **envolviendo la capa de datos una vez**, no en
  los **doce** sitios que crean o editan asignaciones. Tocar doce es como se
  cuelan los defectos de «la mitad de los sitios» — pasó tres veces esa misma
  tarde con los botones de «Cuánta gente necesito».

Con esto **renombrar un puesto pasa a ser cambiar una palabra**. La prueba cambia
**solo el catálogo**, sin tocar ninguna fila, y verifica que la malla ya diga el
nombre nuevo. Verificada contra el código anterior, donde la fila seguía
diciendo «Barra».

**125 comprobaciones.** Publicado hasta `?v=128`.

### 08-10-2026 · El turno guarda su puesto (opción «A»)

**Lo encontró Pedro, con una captura.** La mañana del 08-10 le presenté lo de
la noche anterior diciendo que el catálogo de horarios sueltos **«ya no
existe»**. A las 10:30 mandó una foto del desplegable **«Copiar de»** con la
lista entera —Apertura, Cena, Tarde, Cierre, cada una con su rango de horas— y
escribió: *«eso se suponía desaparecía»* (msg 4886).

**Tenía razón, y el error era mío de método, no un resto suelto.** Saqué la
**pantalla** y di por muerto el **concepto**. El concepto vivía en el modelo:
`turnos` es `nombre + inicio + fin + colacion + orden` y **no tiene puesto** —
el puesto está en `asignaciones` desde `arreglo-puesto-en-turno.sql` (03-10).
O sea que **la fila de un turno ES un rango de horas con nombre**. El cambio
del 07-10 obliga a elegir puesto *en el diálogo* y lo estampa en lo que sale a
la malla, pero la plantilla seguía suelta; por eso la lista solo podía decir
«Cena · 11:00–15:03».

**Lección, y vale más que el arreglo:** antes de anunciar que algo «ya no
existe», preguntarse **dónde vive el dato** y **quién más lo lee**. Un `grep`
por la tabla, no por el nombre de la pantalla. Lo que se va del menú está
escondido, no eliminado. Queda en `memory/pantalla-borrada-dato-vivo.md`.

**Qué se hizo** (Pedro eligió «A» entre tres opciones, msg 4888):

- `migracion-puesto-en-turno.sql`: agrega `turnos.puesto_id` —**id del
  catálogo, no texto**, mismo patrón que las cinco columnas del paso 1 de los
  ids— y rellena los turnos existentes con el puesto con que **se usan de
  verdad en la malla**, pero **solo cuando es inequívoco**. El que aparece con
  dos puestos distintos queda en NULL y sale listado en el informe: **un hueco
  visible es mejor que un dato plausible y falso**. No redefine ninguna
  función, así que se puede pegar solo sin el riesgo de `migracion-suelta-caduca`.
- La lista «Copiar de» pasa de «Apertura · 08:00–16:30» a **«Apertura · Barra ·
  08:00–16:30»**, y un turno viejo sin puesto **dice «sin puesto»** en vez de
  disimularlo.
- **Un comentario que mentía**: decía «Copiar de otro turno: trae horas,
  colación y **puesto**» y el código nunca tocaba el puesto — no podía, no
  existía la columna. Ahora lo trae de verdad.
- Al **editar**, el puesto guardado queda elegido: si no, el desplegable volvía
  a «— elige el puesto —» y guardar sin tocarlo cambiaba el turno de puesto sin
  que nadie lo pidiera.
- **Un borde que habría guardado un id nulo en silencio**: el desplegable
  ofrece los puestos **en uso**, que no son forzosamente los del catálogo (es el
  hueco que frenó a Pedro la mañana del 07-10). Si el elegido no está, **se
  avisa y no se guarda**, en vez de dejar un turno diciendo «sin puesto» justo
  después de que la persona eligió uno.

**132 comprobaciones**, 7 nuevas. **Seis de las siete fallan contra el `app.js`
de ayer** —y una devuelve literalmente `Apertura · 08:00–16:30`, lo que Pedro
vio en su pantalla—, que es lo único que las hace válidas. La séptima («copiar
uno viejo sin puesto no pisa el que ya elegiste») **pasa también con el código
viejo**, porque el viejo no tocaba ese campo nunca: no distingue versiones, y
queda como guardia de regresión, no como prueba del cambio.

**Pendiente de Pedro:** pegar `migracion-puesto-en-turno.sql` en Supabase y
mirar el informe del final, que dice qué turnos quedaron sin resolver.
