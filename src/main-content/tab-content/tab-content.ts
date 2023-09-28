import { Bind, DataChanges } from "bindrjs";
import template from "./tab-content.html?raw";
// import HomeTemplate from "./home-menu/home-menu.template.html?raw";
// import AutomationTemplate from './automations-menu/automations-menu.template.html?raw';
// import AssistantTemplate from './assistant-menu/assistant-menu.template.html?raw';
// import { HomeService } from "./home-content/home-content";
// import { getEndPointData } from "../../utils/server-handler";
// import { AutoEffect, AutomationsService } from "./automations-content/automations-content";
// import { IMenuItem, NavBarItems } from "../../nav-bar/nav-bar.contants";
import { VAssistantContent } from "./assistant-content/assistant-content";
import { NavBar } from "../../nav-bar/nav-bar";
import { AutomationsContent } from "./automations-content/automations-content";
import { HomeContent } from "./home-content/home-content";

// type Sensor = {
//   id: string,
//   type: 'boolean' | 'value'
//   name: string,
//   value: any,
//   sensorType: 'motion' | 'temp/humidity',
// }

class TabContentClass {

  bind!: any;

  constructor() {}

  initView() {
    const { bind } = new Bind({
      id: "tab-content",
      template,
      bind: {
        activeMenuItemId: NavBar.bind.activeMenuItemId,
        // activeTabId: "",
        // templates: {
        //   home: HomeTemplate,
        //   automations: AutomationTemplate,
        //   assistant: AssistantTemplate,
        // },
        // actions: {
        //   home: HomeService,
        //   automations: AutomationsService,
        //   assistant: AssistantService
        // },
        // data: {
        //   home: {
        //     devices: null,
        //     sensors: null,
        //   },
        //   automations: {
        //     auto: null,
        //   },
        //   assistant: {
        //     info: {
        //       houseData: null
        //     }
        //   }
        // },
      },
      ready: () => {
        this.getTabContentView()?.initView();
        // Init proper content view
      //   ready() {
      //     //   NavBarItems.forEach((item: IMenuItem) => {
      //     //     (item.tabs || []).forEach(async({ endpoint, id }) => {
      //     //       let bind: any = TabContentBind;
      //     //       bind.data[item.id][id] = await getEndPointData(endpoint || '');
      //     //       if (id === 'auto') {
      //     //         bind.data[item.id][id].map((automation: AutoEffect) => {
      //     //           automation.sentence = AutomationsService.parseEffectSentense(bind.data, automation);
      //     //         });
      //     //       }
      //     //       if (id === 'sensors') {
      //     //         const sensors = bind.data[item.id][id];
      //     //         formatSensorsValues(sensors);
      //     //       }
      //     //     });
      //     //   })
      //     // }
      },
      onChange: (changes: DataChanges) => {
        // console.log('changes', changes);
        switch (<keyof typeof bind>changes.property) {
          case 'activeMenuItemId':
            // this.getTabContentView()?.initView();
        }
      }
    });

    this.bind = bind as any;
  }

  getTabContentView() {
    switch (this.bind.activeMenuItemId) {
      case 'home':
        return HomeContent;
      case 'automations':
        return AutomationsContent;
      case 'assistant':
        return VAssistantContent;
    }

    return null;
  }
}

export const TabContent = new TabContentClass();

// const TabContent = new Bind({
//   id: "tab-content",
//   template,
//   bind: {
//     activeMenuItemId: "",
//     activeTabId: "",
//     templates: {
//       home: HomeTemplate,
//       automations: AutomationTemplate,
//       assistant: AssistantTemplate,
//     },
//     actions: {
//       home: HomeService,
//       automations: AutomationsService,
//       assistant: AssistantService
//     },
//     data: {
//       home: {
//         devices: null,
//         sensors: null,
//       },
//       automations: {
//         auto: null,
//       },
//       assistant: {
//         info: {
//           houseData: null
//         }
//       }
//     },
//   },
//   ready,
// });
// export const TabContentBind = TabContent.bind;
// const bind = TabContentBind;

// function ready() {
//   NavBarItems.forEach((item: IMenuItem) => {
//     (item.tabs || []).forEach(async({ endpoint, id }) => {
//       let bind: any = TabContentBind;
//       bind.data[item.id][id] = await getEndPointData(endpoint || '');
//       if (id === 'auto') {
//         bind.data[item.id][id].map((automation: AutoEffect) => {
//           automation.sentence = AutomationsService.parseEffectSentense(bind.data, automation);
//         });
//       }
//       if (id === 'sensors') {
//         const sensors = bind.data[item.id][id];
//         formatSensorsValues(sensors);
//       }
//     });
//   })
// }

// export function WebSocketDeviceDeclare(data: any) {
//   if (!bind.data.home.devices) bind.data.home.devices = [];
//   let device = bind.data.home.devices.find((device: any) => device.id === data.id);
//   if (!device) bind.data.home.devices.push(data);
// }

// export function WebSocketDeviceUpdate(data: any) {
//   let device = bind.data.home.devices.find((device: any) => device.id === data.id);
//   if (device) {
//     device.value = data.value;
//     device.manual = data.manual;
//   }
// }

// export function WebSocketSensorDeclare(data: any) {
//   if (!bind.data.home.sensors) bind.data.home.sensors = [];
//   let sensor = bind.data.home.sensors.find((sensor: any) => sensor.id === data.id);
//   if (!sensor) bind.data.home.sensors.push(data);
// }

// export function WebSocketSensorUpdate(data: any) {
//   let sensor = bind.data.home.sensors.find((sensor: any) => sensor.id === data.id);
//   if (sensor) sensor.value = data.value;
//   formatSensorsValues([sensor])
// }

// function formatSensorsValues(sensors: Sensor[]) {
//   sensors.forEach((sensor) => {
//     switch (sensor.sensorType) {
//       case 'temp/humidity':
//         formatTempHumiditySensor(sensor);
//     }
//   })
// } 

// function formatTempHumiditySensor(sensor: Sensor) {
//   const values = sensor.value.split(':');
//   sensor.value = {};
//   sensor.value.temperature = values[0] + '°C';
//   sensor.value.humidity = values[1] + '%'
// }