import { Bind } from "bindrjs";
import template from "./main-content.html?raw";
import { MainContentState } from "./main-content.model";
import { Tabs } from "./tabs/tabs";

class MainContentClass {

  bind!: MainContentState;

  constructor() {}

  initView() {
    const { bind } = new Bind<MainContentState>({
      id: 'main-content',
      template,
      bind: {
        header: 'Hi'
      },
      ready: () => {
        Tabs.initView();
      }
    });
    this.bind = bind;
  }

}

export const MainContent = new MainContentClass();