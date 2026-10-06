"use client";

export default function Modal({ title, children, onClose, closeLabel = "Got it" }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(22,35,61,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, zIndex: 100,
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: 0 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <div style={{ marginBottom: 16 }}>{children}</div>
        <button type="button" className="btn btn-sm" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}