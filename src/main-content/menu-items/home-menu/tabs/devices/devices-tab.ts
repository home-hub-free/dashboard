import { Bind } from "bindrjs";
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import template from './devices-tab.html?raw';
import { Tab } from "../../../../tabs/tabs.model";
import { getEndPointData } from "../../../../../utils/server-handler";
import { Device } from "./devices-tab.model";

class DevicesTabClass {
  bind!: any;

  #definition: Tab = NavBarItems.find((menuItem) => menuItem.id === 'home')?.tabs?.find((tab) => tab.id === 'devices') as Tab;
  #data: any = null;

  // constructor get called ONCE
  constructor() {
    getEndPointData(this.#definition.endpoint || '').then((data: Device[]) => {
      this.#data = data;
      if (this.bind) {
        this.bind.data = data;
      }
    });
  }

  // initView gets called everytime the devices view is rendered
  initView() {
    const { bind } = new Bind({
      id: 'devices',
      template,
      bind: {
        data: this.#data
      }
    });
    this.bind = bind;
  }  
}

export const DevicesTab = new DevicesTabClass();