import { describe, test, expect } from "bun:test";
import { consumeState, createState } from "./oauth-state";

// § Fase 143 — state membawa {userId, dataUsahaId}; sekali pakai; dibatasi per user (security review Medium).
describe("oauth-state", () => {
  test("consumeState mengembalikan konteks lalu MENGHAPUS state (tolak replay)", () => {
    const state = createState({ userId: "u1", dataUsahaId: "d1" });
    expect(consumeState(state)).toEqual({ userId: "u1", dataUsahaId: "d1" });
    expect(consumeState(state)).toBeNull();
  });

  test("state tidak dikenal → null", () => {
    expect(consumeState("bogus")).toBeNull();
  });

  test("maksimum 5 state aktif per user: yang tertua dibuang, state user lain tidak tersentuh", () => {
    const other = createState({ userId: "other-user", dataUsahaId: "dx" });
    const states = Array.from({ length: 7 }, (_, i) => createState({ userId: "flood-user", dataUsahaId: `d${i}` }));
    expect(consumeState(states[0]!)).toBeNull();
    expect(consumeState(states[1]!)).toBeNull();
    for (const s of states.slice(2)) expect(consumeState(s)).not.toBeNull(); // 5 terbaru masih valid
    expect(consumeState(other)).toEqual({ userId: "other-user", dataUsahaId: "dx" });
  });
});
