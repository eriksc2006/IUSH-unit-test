import { driverCalculoLlegada } from '../drivers/driverCalculoLlegada';
import { BUS_CERCA, BUS_LEJOS, HORA_ACTUAL, PARADERO_COLEGIO } from '../datosPrueba';

/**
 * INTEGRACIÓN ASCENDENTE (bottom-up) — geo + eta + alertas
 *
 * Aquí MonitorRuta "no existe": el DRIVER (tests/drivers/driverCalculoLlegada.ts) hace su papel
 * llamando a los módulos de bajo nivel en el orden correcto.
 *
 *   driverCalculoLlegada  (driver, reemplaza a MonitorRuta)
 *        ├──> geo       (real)
 *        ├──> eta       (real)
 *        └──> alertas   (real)
 */
describe('Bottom-up - geo + eta + alertas mediante driver', () => {
  it('driverCalculoLlegada_conBusCercaAViaLibre_debeEncadenarDistanciaETAyAlerta', () => {
    // Arrange
    const escenario = {
      bus: BUS_CERCA,
      paradero: PARADERO_COLEGIO,
      velocidadKmh: 30,
      factorTrafico: 1.0,
      horaActual: HORA_ACTUAL,
      horaProgramadaLlegada: new Date('2026-10-13T06:40:00-05:00'),
    };

    // Act
    const r = driverCalculoLlegada(escenario);

    // Assert: 1.322 km a 30 km/h = 2.64 min -> 3 min -> llega 06:33, antes de las 06:40
    expect(r.distanciaKm).toBeCloseTo(1.322, 3);
    expect(r.minutosEstimados).toBe(3);
    expect(r.horaEstimadaLlegada).toEqual(new Date('2026-10-13T06:33:00-05:00'));
    expect(r.minutosRetraso).toBe(0);
    expect(r.nivelAlerta).toBe('NINGUNA');
  });

  it('driverCalculoLlegada_conBusLejosYTrancon_debeReportarAlertaGrave', () => {
    const base = {
      bus: BUS_LEJOS,
      paradero: PARADERO_COLEGIO,
      velocidadKmh: 15,
      factorTrafico: 3.0,
      horaActual: HORA_ACTUAL,
      horaProgramadaLlegada: new Date('2026-10-13T06:40:00-05:00'),
    };

    const r = driverCalculoLlegada(base);

    expect(r.distanciaKm).toBeCloseTo(3.314, 3);
    expect(r.minutosEstimados).toBe(40);
    expect(r.horaEstimadaLlegada).toEqual(new Date('2026-10-13T07:10:00-05:00'));
    expect(r.minutosRetraso).toBe(30);
    expect(r.nivelAlerta).toBe('GRAVE');
  });

  it('driverCalculoLlegada_conRetrasoDeExactamente15Minutos_debeReportarAlertaLeve', () => {
    const r = driverCalculoLlegada({
      bus: BUS_CERCA,
      paradero: PARADERO_COLEGIO,
      velocidadKmh: 30,
      factorTrafico: 1.0,
      horaActual: new Date('2026-10-13T06:52:00-05:00'),
      horaProgramadaLlegada: new Date('2026-10-13T06:40:00-05:00'),
    });

    expect(r.minutosEstimados).toBe(3);
    expect(r.horaEstimadaLlegada).toEqual(new Date('2026-10-13T06:55:00-05:00'));
    expect(r.minutosRetraso).toBe(15);
    expect(r.nivelAlerta).toBe('LEVE');
  });

  it('driverCalculoLlegada_conBusEnElParadero_debeRetornarCeroMinutos', () => {
    const r = driverCalculoLlegada({
      bus: PARADERO_COLEGIO,
      paradero: PARADERO_COLEGIO,
      velocidadKmh: 30,
      factorTrafico: 1.0,
      horaActual: HORA_ACTUAL,
      horaProgramadaLlegada: new Date('2026-10-13T06:40:00-05:00'),
    });

    expect(r.distanciaKm).toBe(0);
    expect(r.minutosEstimados).toBe(0);
    expect(r.horaEstimadaLlegada).toEqual(HORA_ACTUAL);
    expect(r.minutosRetraso).toBe(0);
    expect(r.nivelAlerta).toBe('NINGUNA');
  });

  it('driverCalculoLlegada_conBusDetenido_debeRetornarETAyAlertaNull', () => {
    const r = driverCalculoLlegada({
      bus: BUS_CERCA,
      paradero: PARADERO_COLEGIO,
      velocidadKmh: 0,
      factorTrafico: 1.0,
      horaActual: HORA_ACTUAL,
      horaProgramadaLlegada: new Date('2026-10-13T06:40:00-05:00'),
    });

    expect(r.distanciaKm).toBeCloseTo(1.322, 3);
    expect(r.minutosEstimados).toBeNull();
    expect(r.horaEstimadaLlegada).toBeNull();
    expect(r.minutosRetraso).toBeNull();
    expect(r.nivelAlerta).toBeNull();
  });
});
