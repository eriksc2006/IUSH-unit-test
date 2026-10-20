import { MonitorRuta } from '../../src/monitorRuta';
import { InfoRuta } from '../../src/servicios';
import { ProveedorGPSStub } from '../stubs/ProveedorGPSStub';
import { RepositorioRutasStub } from '../stubs/RepositorioRutasStub';
import { ServicioTraficoStub } from '../stubs/ServicioTraficoStub';
import { NotificadorStub } from '../stubs/NotificadorStub';
import { BUS_CERCA, BUS_LEJOS, HORA_ACTUAL, PLACA, crearRuta } from '../datosPrueba';

/**
 * INTEGRACIÓN DESCENDENTE (top-down) — NIVEL 1
 *
 * Se prueba el módulo de más arriba (MonitorRuta) integrado con los módulos internos reales
 * (validaciones, geo, eta, alertas), pero con TODOS sus colaboradores externos reemplazados
 * por STUBS, incluido el notificador.
 *
 *   [MonitorRuta] ──> validaciones, geo, eta, alertas (reales)
 *        │
 *        ├──> ProveedorGPSStub
 *        ├──> RepositorioRutasStub
 *        ├──> ServicioTraficoStub
 *        └──> NotificadorStub          <- en el nivel 2 se reemplaza por el real
 */
describe('Top-down N1 - MonitorRuta con todos los colaboradores como stubs', () => {
  // Patrón: cada prueba arma su propio "mundo" para no depender de otras (FIRST: Independent).
  // Por defecto: bus cerca a 10 m/s, tráfico 1.0 y la ruta de datosPrueba. Cambien solo lo que necesiten.
  function crearMonitor(
    opciones: {
      gps?: ProveedorGPSStub;
      trafico?: ServicioTraficoStub;
      ruta?: InfoRuta;
      notificador?: NotificadorStub;
    } = {}
  ) {
    const gps = opciones.gps ?? new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 });
    const trafico = opciones.trafico ?? new ServicioTraficoStub(1.0);
    const rutas = new RepositorioRutasStub().conRuta(PLACA, opciones.ruta ?? crearRuta());
    const notificador = opciones.notificador ?? new NotificadorStub();
    return { monitor: new MonitorRuta(gps, rutas, trafico, notificador), gps, trafico, notificador };
  }

  describe('RN-15 placa y ruta', () => {
    it('monitorear_conPlacaInvalida_debeRetornarPlacaInvalidaSinConsultarGPS', async () => {
      // Arrange
      const { monitor, gps } = crearMonitor();

      // Act
      const reporte = await monitor.monitorear('BUS-1', HORA_ACTUAL);

      // Assert: el resultado Y la interacción con el componente de abajo
      expect(reporte.estado).toBe('PLACA_INVALIDA');
      expect(gps.llamadas).toHaveLength(0);
    });

    it('monitorear_conPlacaSinRutaAsignada_debeRetornarRutaNoEncontrada', async () => {
      const { monitor, gps } = crearMonitor();

      const reporte = await monitor.monitorear('ABC123', HORA_ACTUAL);

      expect(reporte.estado).toBe('RUTA_NO_ENCONTRADA');
      expect(reporte.placa).toBe('ABC123');
      expect(gps.llamadas).toHaveLength(0);
    });

    it('monitorear_conPlacaEnMinusculasYEspacios_debeNormalizarlaAntesDeConsultarLaRuta', async () => {
      const { monitor, gps } = crearMonitor();

      const reporte = await monitor.monitorear('  wpx482 ', HORA_ACTUAL);

      expect(reporte.placa).toBe(PLACA);
      expect(reporte.estado).toBe('EN_RUTA');
      expect(gps.llamadas).toEqual([PLACA]);
    });
  });

  describe('RN-16 lectura del GPS', () => {
    it('monitorear_conGPSSinSenal_debeRetornarSinSenalYNoNotificar', async () => {
      // Arrange
      const gps = new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }).simularSinSenal();
      const { monitor, notificador } = crearMonitor({ gps });

      // Act
      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      // Assert
      expect(reporte.estado).toBe('SIN_SENAL');
      expect(reporte.smsEnviados).toBe(0);
      expect(notificador.llamadas).toHaveLength(0);
    });

    it('monitorear_conCoordenadasFueraDeRango_debeRetornarGpsInvalidoSinConsultarTrafico', async () => {
      const gps = new ProveedorGPSStub({ ...BUS_CERCA, latitud: 95, velocidadMs: 10 });
      const { monitor, trafico, notificador } = crearMonitor({ gps });

      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(reporte.estado).toBe('GPS_INVALIDO');
      expect(trafico.llamadas).toBe(0);
      expect(notificador.llamadas).toHaveLength(0);
    });
  });

  describe('RN-17 servicio de tráfico', () => {
    it('monitorear_conServicioDeTraficoCaido_debeUsarFactorPorDefecto15', async () => {
      const gps1 = new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 });
      const gps2 = new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 });
      const { monitor: monitorConCaida, trafico: traficoCaido } = crearMonitor({
        gps: gps1,
        trafico: new ServicioTraficoStub(1.0).simularCaida(),
      });
      const { monitor: monitorConFactorPorDefecto } = crearMonitor({
        gps: gps2,
        trafico: new ServicioTraficoStub(1.5),
      });

      const [reporteConCaida, reporteConFactorPorDefecto] = await Promise.all([
        monitorConCaida.monitorear(PLACA, HORA_ACTUAL),
        monitorConFactorPorDefecto.monitorear(PLACA, HORA_ACTUAL),
      ]);

      expect(reporteConCaida.minutosEstimados).toBe(reporteConFactorPorDefecto.minutosEstimados);
      expect(traficoCaido.llamadas).toBe(1);
    });
  });

  describe('RN-18 conversión de unidades y ETA', () => {
    // Pista: con velocidadMs = 10 (36 km/h) y 1.322 km, ¿cuántos minutos esperan según RN-01?
    it('monitorear_conVelocidadEnMetrosPorSegundo_debeConvertirlaAKmhAntesDeCalcularETA', async () => {
      const { monitor } = crearMonitor({
        gps: new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
        trafico: new ServicioTraficoStub(1.0),
      });

      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(reporte.minutosEstimados).toBe(3);
    });
  });

  describe('RN-19 bus detenido', () => {
    it('monitorear_conVelocidadCero_debeRetornarDetenidoSinNotificar', async () => {
      const { monitor, notificador } = crearMonitor({
        gps: new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 0 }),
      });

      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(reporte.estado).toBe('DETENIDO');
      expect(reporte.distanciaKm).toBeCloseTo(1.322, 3);
      expect(reporte.minutosEstimados).toBeNull();
      expect(reporte.horaEstimadaLlegada).toBeNull();
      expect(reporte.minutosRetraso).toBeNull();
      expect(reporte.nivelAlerta).toBeNull();
      expect(reporte.porcentajeOcupacion).toBe(75);
      expect(reporte.smsEnviados).toBe(0);
      expect(notificador.llamadas).toHaveLength(0);
    });
  });

  describe('RN-20 retraso y alerta', () => {
    it('monitorear_conBusQueLlegaAntesDeLaHoraProgramada_debeReportarRetrasoCeroYAlertaNinguna', async () => {
      const ruta = crearRuta({
        paradero: BUS_CERCA,
        horaProgramadaLlegada: new Date('2026-10-13T06:45:00-05:00'),
      });
      const { monitor } = crearMonitor({
        gps: new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
        ruta,
      });

      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(reporte.minutosRetraso).toBe(0);
      expect(reporte.nivelAlerta).toBe('NINGUNA');
    });

    it('monitorear_conBusMuyRetrasado_debeReportarAlertaGrave', async () => {
      const ruta = crearRuta({
        horaProgramadaLlegada: new Date('2026-10-13T06:30:00-05:00'),
      });
      const { monitor } = crearMonitor({
        gps: new ProveedorGPSStub({ ...BUS_LEJOS, velocidadMs: 1 }),
        trafico: new ServicioTraficoStub(3.0),
        ruta,
      });

      const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(reporte.minutosRetraso).toBeGreaterThan(15);
      expect(reporte.nivelAlerta).toBe('GRAVE');
    });
  });

  describe('RN-21 llamada al notificador', () => {
    it('monitorear_debeEntregarAlNotificadorLaPlacaLosMinutosYLosAcudientesDeLaRuta', async () => {
      const ruta = crearRuta({ paradero: BUS_CERCA });
      const { monitor, notificador } = crearMonitor({
        gps: new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
        ruta,
      });

      await monitor.monitorear(PLACA, HORA_ACTUAL);

      expect(notificador.llamadas).toEqual([
        { placa: PLACA, minutosEstimados: 0, acudientes: ruta.acudientes },
      ]);
    });
  });
});
