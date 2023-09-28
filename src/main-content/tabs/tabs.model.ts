export interface Tab {
  id: string,
  name: string;
  icon?: string;
  endpoint?: string,
}

export interface TabsState {
  activeTabId: string,
  activeIndicatorPosition: {
    left: string,
    width: string,
    height: string,
  },
  tabs: Tab[],
  selectTab: (tab: Tab, event: Event) => void;
}