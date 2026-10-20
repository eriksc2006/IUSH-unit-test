# Reporte de defectos de integración — RutaSegura v1.1

Integrantes:
- No informado

Las pruebas fallidas se conservaron con sus resultados esperados según RN-18 y RN-20; no se modificó nada en `src/`.

---

### DEF-INT-01 — Conversión de velocidad GPS

| Campo | Detalle |
|---|---|
| Regla incumplida (RN-XX) | RN-18 |
| Módulos involucrados (¿qué interfaz falla?) | `ProveedorGPS` entrega `velocidadMs` en m/s; `eta` espera km/h. `MonitorRuta` debe adaptar la unidad entre ambos contratos. |
| Estrategia y nivel que lo detectó (top-down N1/N2, bottom-up) | Top-down nivel 1; se vuelve visible para el usuario en top-down nivel 2. Bottom-up no lo reproduce porque su driver recibe km/h directamente. |
| Prueba que lo detecta (nombre exacto del `it`) | `monitorear_conVelocidadEnMetrosPorSegundo_debeConvertirlaAKmhAntesDeCalcularETA`; corroborado por `monitorear_debeEnviarSMSConLosMinutosCalculadosPorEtaYNoOtros`. |
| Stubs / drivers usados y cómo se configuraron | `ProveedorGPSStub` con `BUS_CERCA` y `velocidadMs: 10`; `ServicioTraficoStub(1.0)`. En nivel 2 se integró `NotificadorAcudientes` real con `MensajeriaStub`. |
| Resultado esperado (según README) | 10 m/s × 3.6 = 36 km/h. A 1.322 km y factor 1.0: `ceil((1.322 / 36) × 60) = 3` minutos. |
| Resultado obtenido | 8 minutos: `MonitorRuta` pasa el valor 10 directamente a ETA como si fueran km/h. Nivel 2 envía el texto con “8 minutos” en vez de “3 minutos”. |
| ¿Lo habrían detectado las pruebas unitarias? ¿Por qué? | No las pruebas unitarias de `eta`: la función recibe km/h y calcula bien en esa unidad. El error está en la integración del valor proporcionado por el GPS con la interfaz de ETA. |
| Severidad (Alta / Media / Baja) y por qué | Alta: afecta la ETA reportada y el mensaje enviado a los acudientes. |
| Falla que vería el usuario final (acudiente, conductor o coordinación) | La ETA y el SMS indican más tiempo del debido; la información de seguimiento no corresponde a la velocidad real del bus. |
| Causa probable en el código (línea / condición) | En `src/monitorRuta.ts`, RN-18: se asigna `posicion.velocidadMs` a `velocidadKmh` sin multiplicar por 3.6 (línea 84). |

---

### DEF-INT-02 — Retraso negativo para bus adelantado

| Campo | Detalle |
|---|---|
| Regla incumplida (RN-XX) | RN-20 |
| Módulos involucrados (¿qué interfaz falla?) | `MonitorRuta` calcula el retraso y entrega ese valor a `determinarNivelAlerta` de `alertas`. |
| Estrategia y nivel que lo detectó (top-down N1/N2, bottom-up) | Top-down nivel 1. El driver bottom-up ya limita el retraso a cero, por lo que no reproduce esta ruta del orquestador. |
| Prueba que lo detecta (nombre exacto del `it`) | `monitorear_conBusQueLlegaAntesDeLaHoraProgramada_debeReportarRetrasoCeroYAlertaNinguna`. |
| Stubs / drivers usados y cómo se configuraron | GPS configurado en el paradero con velocidad 10 m/s; tráfico 1.0; ruta con hora programada 06:45 y monitoreo a las 06:30. La distancia cero produce ETA cero minutos y hora estimada 06:30. |
| Resultado esperado (según README) | Retraso 0 (nunca negativo) y nivel `NINGUNA`; el monitoreo debe finalizar normalmente. |
| Resultado obtenido | La diferencia entre 06:30 y 06:45 resulta negativa; `determinarNivelAlerta` lanza `RangeError: El retraso no puede ser negativo`, por lo que no se obtiene el reporte. |
| ¿Lo habrían detectado las pruebas unitarias? ¿Por qué? | Las pruebas unitarias de `determinarNivelAlerta` comprueban correctamente que los valores negativos lanzan error, como indica RN-08. No comprueban que `MonitorRuta` normalice a cero un bus adelantado, como exige RN-20. |
| Severidad (Alta / Media / Baja) y por qué | Media: en escenarios adelantados falla el monitoreo completo y no se entrega el estado de ruta, aunque no implica una ETA tardía. |
| Falla que vería el usuario final (acudiente, conductor o coordinación) | La consulta de seguimiento falla en vez de mostrar el bus en ruta con retraso cero y alerta ninguna. |
| Causa probable en el código (línea / condición) | En `src/monitorRuta.ts`, se calcula la diferencia sin limitarla con `Math.max(0, ...)` antes de llamar `determinarNivelAlerta` (líneas 103–107). |
