import { Bind, DataChanges } from "bindrjs";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import template from "./content-section.html";

export const ContentSection = new Bind({
  id: "content",
  template,
  bind: {
    activeTab: '',
    header: '',
    tabs: [],
    settings: [],
    activeIndicatorPosition: {
      top: '48px',
      left: '',
      width: '',
      height: ''
    },

    selectTab
  },
  onChange
});

function onChange(changes: DataChanges) {
  if (changes.property === 'tabs') {
    // Select first available tab if there's any
    if (ContentSection.bind.tabs.length) {
      selectTab(ContentSection.bind.tabs[0]);
    }
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  ContentSection.bind.activeTab = tab.name;

  if (event) {
    let target = event.target as HTMLElement;
    let rect = target.getBoundingClientRect();

    ContentSection.bind.activeIndicatorPosition.left = rect.x - 8 + 'px';
    ContentSection.bind.activeIndicatorPosition.width = rect.width + 'px';
  } else {
    let result = document.querySelector('.tab');
    if (result) {
      let rect = result.getBoundingClientRect();
      ContentSection.bind.activeIndicatorPosition.left = rect.x - 8 + 'px';
      ContentSection.bind.activeIndicatorPosition.width = rect.width + 'px';
      // console.log(rect);
      // let target = result[0];
    }
  }
}
