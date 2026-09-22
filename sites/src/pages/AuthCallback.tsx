import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const match = location.hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/login", { replace: true });
      return;
    }
    const sessionId = decodeURIComponent(match[1]);
    // Clear the fragment so a refresh can't re-enter the one-time exchange.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    apiPost<User>("/auth/google/session", { session_id: sessionId })
      .then(async (user) => {
        await beginSession();
        navigate(user.role === "comprador" ? "/dashboard" : "/admin", { replace: true });
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [location.hash, navigate]);

  return (
    <div
      data-testid="auth-callback"
      className="flex min-h-svh flex-col items-center justify-center bg-[#0B0B0B]"
    >
      <img
        src="/mv-logo.jpg"
        alt="MV Multimarcas"
        className="h-16 w-16 animate-glow-pulse rounded-xl border border-[#DAA520]/30 object-cover"
      />
      <p className="mt-6 text-sm uppercase tracking-[0.3em] text-[#BDBDBD]">
        Entrando na sua conta…
      </p>
    </div>
  );
}