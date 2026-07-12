// OUT OF SCOPE FOR M0-T4 — placeholder only.
//
// M0-T4 covers the login screen. `Navigator.push` needs a destination to exist or the transition
// cannot be exercised at all, so this route is a stub. It is NOT reference output and is NOT a
// conversion of HomeScreen — the Home screen is converted for real at M2.

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22 }}>Home</h1>
      <p>Placeholder. HomeScreen is converted at M2, not here.</p>
    </main>
  );
}
