"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 40, color: "#E7EAEE", background: "#14171C", minHeight: "100vh" }}>
      <h2>Something went wrong.</h2>
      <p style={{ color: "#8A93A3" }}>{error.message}</p>
      <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>
        Try again
      </button>
    </div>
  );
}
