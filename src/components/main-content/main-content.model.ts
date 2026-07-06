export type MainContentState = {
  header: string;
  subtitle: string;
  /** Hub socket is down — shows the slim "reconnecting" banner. */
  offline: boolean;
}
