import { describe, expect, it } from "vitest";
import {
  addBbqrFrame,
  assembleBbqrPayload,
  createBbqrCollectorState,
  parseBbqrFrame
} from "../bbqr";

describe("wallet import BBQr helpers", () => {
  it("captures incomplete Coldcard Generic JSON BBQr frames with a waiting message", () => {
    const frame = parseBbqrFrame("B$HJ0200414243");
    expect(frame).not.toBeNull();
    const result = addBbqrFrame(createBbqrCollectorState(), frame!);

    expect(result.status).toBe("captured");
    expect(result.message).toMatch(/Coldcard Generic JSON frame 1 captured/i);
    expect(result.message).toMatch(/Waiting for remaining BBQr frames/i);
    expect(assembleBbqrPayload(result.state)).toBeNull();
  });

  it("assembles hex Generic JSON BBQr frames out of order", () => {
    const json = JSON.stringify({
      xfp: "F23A9C1D",
      p2wpkh: "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP"
    });
    const hex = Array.from(new TextEncoder().encode(json), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const first = hex.slice(0, Math.ceil(hex.length / 2));
    const second = hex.slice(Math.ceil(hex.length / 2));
    let state = createBbqrCollectorState();

    state = addBbqrFrame(state, parseBbqrFrame(`B$HJ0201${second}`)!).state;
    const result = addBbqrFrame(state, parseBbqrFrame(`B$HJ0200${first}`)!);

    expect(result.status).toBe("complete");
    expect(assembleBbqrPayload(result.state)).toBe(json);
  });
});
