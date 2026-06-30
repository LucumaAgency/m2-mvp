import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tooltip (ℹ) que se renderiza en un portal con posición fija, para escapar del
// overflow:hidden del card y de cualquier contenedor. Se voltea arriba/abajo
// según el espacio disponible.
export default function InfoTip({ children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, place: "top" });
  const ref = useRef(null);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const arriba = r.top > 170;
    setPos({
      left: r.left + r.width / 2,
      top: arriba ? r.top - 8 : r.bottom + 8,
      place: arriba ? "top" : "bottom",
    });
  };
  const show = () => { place(); setOpen(true); };
  const hide = () => setOpen(false);

  return (
    <span
      ref={ref}
      className="itip"
      tabIndex={0}
      role="button"
      aria-label="Más información"
      onClick={(e) => { e.stopPropagation(); open ? hide() : show(); }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onBlur={hide}
    >
      <span className="itip-icon">i</span>
      {open && createPortal(
        <span
          className="itip-portal"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.place === "top" ? "translate(-50%,-100%)" : "translate(-50%,0)",
          }}
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  );
}
