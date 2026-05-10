const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3011";

export default function HomePage() {
  return (
    <main>
      <section>
        <p>watch wallet</p>
        <h1>Watch-only Bitcoin wallet dashboard</h1>
        <p>
          Phase 0 scaffold is ready. Private keys and seed phrases do not belong
          in this app.
        </p>
        <dl>
          <div>
            <dt>API</dt>
            <dd>{apiUrl}</dd>
          </div>
          <div>
            <dt>Storage model</dt>
            <dd>xpub, ypub, zpub, labels, and memos stay in browser localStorage.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
