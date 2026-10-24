import ChartClient from "./chart-client";

export default function Page() {
  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>OpenKline Next.js example</h1>
      <ChartClient />
    </main>
  );
}
