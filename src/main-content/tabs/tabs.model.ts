
// type TabTypes = 'sensors' | 'devices' | 'auto' | 'assistant'


export interface Tab {
  id: string,
  name: string;
  icon?: string;
  endpoint?: string,
}

export interface TabsModel {
  // activeMenuItemId: string,
  activeTabId: string,
  activeIndicatorPosition: {
    left: string,
    width: string,
    height: string,
  },
  tabs: Tab[],
  actions: any,
}