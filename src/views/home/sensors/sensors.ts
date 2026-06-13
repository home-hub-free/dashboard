import { Component } from "../../../core/component";
import { bus } from "../../../core/bus";
import { store } from "../../../store/store";
import template from './sensors.html?raw';
import { Sensor, SensorUpdateEvent, SensorsTabState } from "./sensors.model";
import { getGlobalPosition } from "../../../utils/utils.service";
import { openOverlay } from "../../../components/overlay-modal/overlay-modal";
import SensorEditView from "../overlay-views/sensors-edit.template.html?raw";
import { SensorsService, SensorsServiceClass } from "./sensors.service";
import * as serverHandler from "../../../utils/server-handler";

class SensorsTabClass extends Component<SensorsTabState> {
  sensorsService: SensorsServiceClass;
  private unsubscribeDeclare?: () => void;
  private unsubscribeUpdate?: () => void;
  private unsubscribeSensors?: () => void;

  constructor(sensorsService: SensorsServiceClass) {
    super();
    this.sensorsService = sensorsService;
  }

  mount() {
    this.createBind({
      id: 'sensors',
      template,
      bind: {
        sensors: store.get('sensors'),
        sensorTouchEnd: this.sensorTouchEnd.bind(this),
        calibrateSensor: this.calibrateSensor.bind(this),
      },
    });

    this.unsubscribeSensors = store.subscribe('sensors', (sensors) => {
      this.bind.sensors = sensors;
    });

    this.unsubscribeDeclare = bus.on('sensor:declare', (declaredSensor) => {
      this.onSensorDeclare(declaredSensor);
    });

    this.unsubscribeUpdate = bus.on('sensor:update', (updatedSensor) => {
      this.onSensorUpdate(updatedSensor);
    });
  }

  unmount() {
    this.unsubscribeSensors?.();
    this.unsubscribeDeclare?.();
    this.unsubscribeUpdate?.();
  }

  sensorTouchEnd(event: any, sensor: Sensor) {
    const rect = getGlobalPosition(event.target);
    openOverlay({
      template: SensorEditView,
      data: {
        ...sensor,
      },
      actions: {
        saveProp: this.sensorsService.saveProp,
      },
      startRect: rect,
      padding: { x: 50, y: 200 }
    });
  }

  async calibrateSensor(event: Event, sensor: Sensor) {
    event.stopPropagation();
    const sensorElement = document.querySelector(`[data-sensor-id="${sensor.id}"]`);
    if (sensorElement) {
      sensorElement.classList.add('calibrating');
    }

    try {
      await serverHandler.calibrateSensor(sensor.id);
    } catch (error) {
      console.error('Failed to calibrate sensor:', error);
    } finally {
      if (sensorElement) {
        sensorElement.classList.remove('calibrating');
      }
    }
  }

  private onSensorDeclare(declaredSensor: Sensor) {
    if (!this.bind.sensors) this.bind.sensors = [];
    const sensor = this.bind.sensors.find((s) => s.id === declaredSensor.id);
    if (!sensor) this.bind.sensors.push(declaredSensor);
  }

  private onSensorUpdate(updatedSensor: SensorUpdateEvent) {
    const sensor = this.bind.sensors.find((s) => s.id === updatedSensor.id);
    if (sensor) {
      if (updatedSensor.value !== undefined) {
        sensor.value = updatedSensor.value;
      }
      if (updatedSensor.name) {
        sensor.name = updatedSensor.name || sensor.name;
      }
    }
    if (sensor) this.sensorsService.formatSensorsValues([sensor as Sensor]);
  }
}

export const SensorsTab = new SensorsTabClass(SensorsService);