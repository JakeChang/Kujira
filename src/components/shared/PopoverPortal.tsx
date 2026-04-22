import { forwardRef } from "react";
import { createPortal } from "react-dom";

interface PopoverPortalProps {
  anchorRect: DOMRect;
  width?: string;
  maxHeight?: string;
  children: React.ReactNode;
}

export const PopoverPortal = forwardRef<HTMLDivElement, PopoverPortalProps>(
  function PopoverPortal({ anchorRect, width = "220px", maxHeight, children }, ref) {
    return createPortal(
      <div
        ref={ref}
        style={{
          position: "fixed",
          left: anchorRect.left,
          bottom: window.innerHeight - anchorRect.top + 4,
          width,
          maxHeight,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
