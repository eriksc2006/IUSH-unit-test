import { MonitorRuta } from '../../src/monitorRuta';
import { NotificadorAcudientes } from '../../src/notificador';
import { ProveedorGPSStub } from '../stubs/ProveedorGPSStub';
import { RepositorioRutasStub } from '../stubs/RepositorioRutasStub';
import { ServicioTraficoStub } from '../stubs/ServicioTraficoStub';
import { MensajeriaStub } from '../stubs/MensajeriaStub';
import { BUS_CERCA, BUS_LEJOS, HORA_ACTUAL, PLACA, crearRuta } from '../datosPrueba';

/**
 * INTEGRACIÓN DESCENDENTE (top-down) — NIVEL 2
 *
 * Bajamos un nivel: el NotificadorStub se reemplaza por el NotificadorAcudientes REAL.
 * Ahora el stub queda un nivel más abajo: el proveedor de SMS (MensajeriaStub).
 *
 *   [MonitorRuta] ──> [NotificadorAcudientes] ──> MensajeriaStub
 *        ├──> ProveedorGPSStub
 *        ├──> RepositorioRutasStub
 *        └──> ServicioTraficoStub
 */
describe('Top-down N2 - MonitorRuta + NotificadorAcudientes real', () => {
  it('monitorear_conBusCerca_debeEnviarSMSSoloAAcudientesConNotificacionesActivas', async () => {
    // Arrange
    const mensajeria = new MensajeriaStub();
    const monitor = new MonitorRuta(
      new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
      new RepositorioRutasStub().conRuta(PLACA, crearRuta()),
      new ServicioTraficoStub(1.0),
      new NotificadorAcudientes(mensajeria)
    );

    // Act
    const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

    // Assert: el SMS llegó al final de la cadena MonitorRuta -> Notificador -> Mensajería
    expect(reporte.estado).toBe('EN_RUTA');
    expect(reporte.smsEnviados).toBe(2);
    expect(mensajeria.enviados.map((e) => e.telefono)).toEqual(['3001112233', '3007778899']);
  });

  it('monitorear_debeEnviarSMSConLosMinutosCalculadosPorEtaYNoOtros', async () => {
    const mensajeria = new MensajeriaStub();
    const monitor = new MonitorRuta(
      new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
      new RepositorioRutasStub().conRuta(PLACA, crearRuta()),
      new ServicioTraficoStub(1.0),
      new NotificadorAcudientes(mensajeria)
    );

    await monitor.monitorear(PLACA, HORA_ACTUAL);

    expect(mensajeria.enviados.map((envio) => envio.mensaje)).toEqual([
      'RutaSegura: el bus WPX482 llegará en aproximadamente 3 minutos.',
      'RutaSegura: el bus WPX482 llegará en aproximadamente 3 minutos.',
    ]);
  });

  it('monitorear_conFalloDeUnSMS_debeReportarSoloLosEnviosExitosos', async () => {
    const mensajeria = new MensajeriaStub().fallarPara('3001112233');
    const monitor = new MonitorRuta(
      new ProveedorGPSStub({ ...BUS_CERCA, velocidadMs: 10 }),
      new RepositorioRutasStub().conRuta(PLACA, crearRuta()),
      new ServicioTraficoStub(1.0),
      new NotificadorAcudientes(mensajeria)
    );

    const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

    expect(reporte.smsEnviados).toBe(1);
    expect(mensajeria.enviados.map((envio) => envio.telefono)).toEqual(['3007778899']);
  });

  it('monitorear_conBusLejosAMasDeDiezMinutos_noDebeEnviarNingunSMS', async () => {
    const mensajeria = new MensajeriaStub();
    const monitor = new MonitorRuta(
      new ProveedorGPSStub({ ...BUS_LEJOS, velocidadMs: 5 }),
      new RepositorioRutasStub().conRuta(PLACA, crearRuta()),
      new ServicioTraficoStub(1.0),
      new NotificadorAcudientes(mensajeria)
    );

    const reporte = await monitor.monitorear(PLACA, HORA_ACTUAL);

    expect(reporte.minutosEstimados).toBe(40);
    expect(reporte.smsEnviados).toBe(0);
    expect(mensajeria.enviados).toHaveLength(0);
  });
});
