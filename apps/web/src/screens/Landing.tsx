/** The standalone landing page, built from `landing-source/`. */
export function Landing() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#010204",
      }}
    >
      <iframe
        title="Floor landing page"
        src={`${import.meta.env.BASE_URL}landing/index.html`}
        style={{ display: "block", width: "100%", height: "100%", border: 0 }}
      />
      <a
        href="#/live"
        style={{
          position: "absolute",
          top: "1.5rem",
          right: "2rem",
          zIndex: 10,
          padding: "0.55rem 0.8rem",
          border: "1px solid rgb(248 248 255 / 0.3)",
          background: "rgb(1 2 4 / 0.72)",
          color: "#f8f8ff",
          font: "0.7rem ui-monospace, monospace",
          letterSpacing: "0.14em",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        Live market →
      </a>
    </div>
  );
}
