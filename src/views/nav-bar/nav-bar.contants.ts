interface IMenuItem {
  icon: string;
  name: string;
  subitems?: ISubItem[];
  expanded?: boolean;
}

interface ISubItem {
  name: string;
  icon?: string;
}

export const MenuItems: IMenuItem[] = [
  {
    icon: "home-simple-door",
    name: "Home",
    expanded: true,
    subitems: [
      {
        name: "subitem",
        icon: "",
      },
    ],
  },
  {
    icon: "xray-view",
    name: "Devices",
    expanded: true,
    subitems: [],
  },
  {
    icon: "",
    name: "Test",
    expanded: true,
    subitems: [],
  }
];
