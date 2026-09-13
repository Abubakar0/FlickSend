import { engineCoreBoundary } from "@flicksend/engine-core";
import { productMetadata } from "@flicksend/shared";
import { Lab } from "./lab";

export default function EngineLabPage() {
  return (
    <main className="engine-lab-page">
      <p className="eyebrow">{productMetadata.name}</p>
      <h1>Engine Lab</h1>
      <p className="lede">Bounded browser-to-browser transfer and StreamPack qualification lab.</p>
      <Lab />
      <section aria-labelledby="scope-title">
        <h2 id="scope-title">Current scope</h2>
        <p>
          M6 adds a diagnostic StreamPack folder path over the same direct WebRTC data plane. It
          does not implement authentication, billing, TURN routing, cloud storage, or production
          relay infrastructure.
        </p>
      </section>
      <section aria-labelledby="boundary-title">
        <h2 id="boundary-title">Engine boundary</h2>
        <p>{engineCoreBoundary}</p>
      </section>
    </main>
  );
}
