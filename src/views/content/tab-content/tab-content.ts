import { Bind } from "bindrjs";
import template from './tab-content.template.html?raw';

export const TabContent = new Bind({
  id: 'tab-content',
  template,
  bind: {
    activeMenuItemId: '',
    activeTabId: '',
    devices: [],
    sensors: [],
  }
});

export const TabContentBind = TabContent.bind;