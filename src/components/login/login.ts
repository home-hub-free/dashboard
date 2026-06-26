import { Component } from "../../core/component";
import template from "./login.html?raw";
import { LoginState } from "./login.model";
import { login } from "../../utils/auth";

/**
 * The login gate. Mounted into #login-gate by main.ts *instead of* the app when
 * no valid session exists. On a successful sign-in it hides itself and invokes
 * the `onSuccess` callback, which boots the rest of the dashboard.
 */
class LoginClass extends Component<LoginState> {
  private onSuccess: () => void = () => {};

  mount(onSuccess?: () => void) {
    if (onSuccess) this.onSuccess = onSuccess;
    document.getElementById("login-gate")?.classList.add("active");
    this.createBind({
      id: "login-gate",
      template,
      bind: {
        username: "",
        password: "",
        error: "",
        busy: false,
        submit: (event: Event) => this.submit(event),
      },
    });
  }

  private async submit(event: Event) {
    event.preventDefault();
    if (this.bind.busy) return;
    const username = this.bind.username.trim();
    const password = this.bind.password;
    if (!username || !password) {
      this.bind.error = "Enter your username and password";
      return;
    }
    this.bind.busy = true;
    this.bind.error = "";
    try {
      await login(username, password);
      const gate = document.getElementById("login-gate");
      if (gate) {
        gate.classList.remove("active");
        gate.innerHTML = "";
      }
      this.onSuccess();
    } catch (err: any) {
      this.bind.error = err?.message || "Sign in failed";
      this.bind.busy = false;
    }
  }
}

export const Login = new LoginClass();
