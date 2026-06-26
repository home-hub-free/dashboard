export interface LoginState {
  username: string;
  password: string;
  error: string;
  busy: boolean;
  submit: (event: Event) => void;
}
