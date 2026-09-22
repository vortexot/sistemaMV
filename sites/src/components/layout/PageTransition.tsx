import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";

/** Gold page transition: content fades/lifts in while a thin gold sweep crosses the viewport. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        data-testid="page-transition"
      >
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0.85, scaleX: 0 }}
          animate={{ opacity: 0, scaleX: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ transformOrigin: "left" }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-gradient-to-r from-transparent via-[#DAA520] to-[#A07C1B]"
        />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}