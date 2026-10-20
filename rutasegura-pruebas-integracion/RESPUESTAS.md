# Respuestas del taller — RutaSegura (Integración)

Integrantes:
- No informado

## Ejercicio 1 — Orden de integración

| Paso | Top-down: módulos reales | Stubs necesarios | Bottom-up: módulos reales | Drivers necesarios |
|---|---|---|---|---|
| 1 | `MonitorRuta` y sus módulos internos (`validaciones`, `geo`, `eta`, `alertas`) | GPS, repositorio de rutas, tráfico y notificador | `geo`, `eta` y `alertas` | `driverCalculoLlegada`, que hace el papel de `MonitorRuta` |
| 2 | Los anteriores más `NotificadorAcudientes` real (nivel 2) | GPS, repositorio, tráfico y mensajería SMS | `eta` y `NotificadorAcudientes` reales | `driverNotificacion`; `MensajeriaStub` reemplaza al proveedor SMS |
| 3 | Se reemplaza progresivamente cada stub cuando está disponible su componente real; se conserva el stub para servicios externos todavía no disponibles | Los colaboradores externos que aún no tengan implementación | Se incorporan progresivamente los componentes reales de nivel superior | Los drivers se reemplazan por el módulo real que integran, `MonitorRuta` |

## Preguntas

**1.** Un **stub** está debajo del módulo bajo prueba: el módulo lo llama y el stub devuelve respuestas controladas. Por ejemplo, `MonitorRuta` llama a `ProveedorGPSStub.obtenerPosicion`; el stub sustituye el proveedor GPS real. Un **driver** está arriba: llama a los módulos de nivel inferior y sustituye temporalmente al módulo que todavía no existe. `driverCalculoLlegada` llama a `geo`, `eta` y `alertas` como lo haría `MonitorRuta`. En el dibujo: `driverCalculoLlegada → geo/eta/alertas` y `MonitorRuta → stubs`.

**2.** Las unidades pueden cumplir sus contratos por separado y aun así no coincidir en sus interfaces o en el orden de uso. Por ejemplo, `eta` recibe km/h correctamente, pero el GPS entrega m/s. La prueba `monitorear_conVelocidadEnMetrosPorSegundo_debeConvertirlaAKmhAntesDeCalcularETA` falla: para 10 m/s y 1.322 km se esperan 3 minutos tras convertir a 36 km/h, pero `MonitorRuta` entrega 8 al usar 10 como si fueran km/h. Es un defecto de integración entre el contrato del GPS y el de `eta`.

**3.** En el nivel 1, `NotificadorStub` solo registra los argumentos y retorna una cantidad fija; no construye ni envía el texto del SMS. Por eso no detecta que el ETA incorrecto se propaga hasta el mensaje. En el nivel 2, `NotificadorAcudientes` real integra el valor con el servicio de mensajería y la prueba `monitorear_debeEnviarSMSConLosMinutosCalculadosPorEtaYNoOtros` observa que el mensaje dice 8 minutos en lugar de los 3 especificados.

**4.** Si el stub no respeta el contrato real, una prueba puede pasar o fallar por una condición artificial y ocultar un defecto de interfaz. Por ejemplo, si el stub GPS entregara km/h aunque el contrato dice m/s, la prueba no comprobaría la conversión requerida. Se mitiga configurando el stub conforme a los contratos documentados, usando nombres explícitos para las unidades (`velocidadMs`) y agregando pruebas de integración que verifiquen valores e interacciones con cálculos esperados independientemente.

**5.** `npm run driver` es una demostración manual rápida: imprime cuatro escenarios y facilita inspeccionar el flujo. `tests/bottom-up/calculoLlegada.test.ts` es más útil para verificar automáticamente el comportamiento: compara distancias, fechas, retrasos y alertas con expectativas reproducibles, falla ante regresiones y forma parte de la suite. La salida de consola sigue siendo útil para una demostración o inspección exploratoria, pero no sustituye las aserciones automatizadas.

**6.** Los defectos aparecieron primero en la estrategia **top-down**. La conversión m/s→km/h se detectó en nivel 1 con `monitorear_conVelocidadEnMetrosPorSegundo_debeConvertirlaAKmhAntesDeCalcularETA` y volvió a hacerse visible en nivel 2 al inspeccionar el texto del SMS. El retraso negativo se detectó en nivel 1 con `monitorear_conBusQueLlegaAntesDeLaHoraProgramada_debeReportarRetrasoCeroYAlertaNinguna`. El bottom-up no detectó estos defectos: su driver acepta una velocidad ya expresada en km/h y aplica `Math.max(0, ...)` para el retraso, de modo que no reproduce la frontera entre el contrato del GPS y `MonitorRuta`.

**7.** El stub de tráfico devuelve un factor controlado y permite probar `MonitorRuta` sin esperar la implementación del otro equipo. La prueba compara el resultado con tráfico caído contra el de un stub equivalente con factor 1.5, que es el valor por defecto requerido. Cuando el servicio real esté listo, se deben repetir las pruebas de integración de RN-17 con ese adaptador real, verificar que entrega factores dentro del contrato y probar escenarios de error o indisponibilidad; las pruebas con stubs se conservan para diagnósticos deterministas.

**8.** `HORA_ACTUAL` fija hace las pruebas repetibles: el mismo escenario produce la misma ETA y el mismo retraso en cada ejecución. Si se usara `new Date()`, el resultado dependería de cuándo corre la prueba y podría cruzar minutos o cambiar de día. La prueba ejecutada a las 06:30 a. m. y a las 2:00 p. m. partiría de horas actuales distintas, así que calcularía horas estimadas y retrasos distintos; además, la hora programada que quedó fija podría ya haber pasado a las 2:00 p. m. La prueba podría fallar por el reloj en lugar de por una regresión del código.

**9.** En big bang se integrarían todos los componentes de una vez. Al ver una ETA o un SMS incorrectos sería más difícil determinar si el origen fue el formato/unidad del GPS, el cálculo de `eta`, la coordinación de `MonitorRuta` o el notificador. Las estrategias ascendente y descendente reducen el conjunto de componentes posibles y permiten localizar la frontera que causa el fallo.

**10.**

| Error humano | Defecto | Falla observable | Tipo |
|---|---|---|---|
| Se asumió que la velocidad GPS ya estaba en km/h y se omitió la conversión indicada por el contrato, que la entrega en m/s. | `MonitorRuta` pasa `posicion.velocidadMs` directamente a las funciones que esperan km/h. | Con 10 m/s y 1.322 km, informa 8 minutos en vez de 3. En nivel 2 el acudiente recibe un SMS con la ETA incorrecta. | Interfaz entre GPS y ETA; se manifiesta en la orquestación, no en el cálculo aislado de ETA. |
| Al calcular el retraso no se limitó el resultado inferior a cero, aunque RN-20 especifica que un bus adelantado debe tener retraso 0. | `MonitorRuta` calcula la diferencia y pasa el número negativo a `determinarNivelAlerta`, que lanza `RangeError`. | Cuando la llegada estimada es anterior a la hora programada, el monitoreo rechaza la promesa en vez de retornar `EN_RUTA`, retraso 0 y alerta `NINGUNA`. | Integración entre el cálculo de retraso en `MonitorRuta` y el contrato de `alertas`. |
