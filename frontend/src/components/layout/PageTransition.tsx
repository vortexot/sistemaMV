import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/** Gold page transition: content fades/lifts in while a thin gold sweep crosses the viewport. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div key={location.pathname} className="page-fade" data-testid="page-transition">
      {children}
    </div>
  );
}
