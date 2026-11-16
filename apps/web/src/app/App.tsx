import { midiToNoteName } from "@open-keys/core";

const MIDDLE_C = 60;

export function App() {
  return (
    <main>
      <h1>Open Keys</h1>
      <p>Do central : {midiToNoteName(MIDDLE_C)}</p>
    </main>
  );
}
