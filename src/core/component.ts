import { Bind } from 'bindrjs';

export abstract class Component<T extends object> {
  private _bind?: T;

  abstract mount(): void;

  unmount(): void {}

  get bind(): T {
    if (!this._bind) throw new Error(`${this.constructor.name}.mount() has not been called`);
    return this._bind;
  }

  get mounted(): boolean {
    return !!this._bind;
  }

  protected createBind(options: ConstructorParameters<typeof Bind<T>>[0]): T {
    const container = document.getElementById(options.id);
    if (container) container.innerHTML = '';
    this._bind = new Bind<T>(options).bind;
    return this._bind;
  }
}
