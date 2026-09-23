import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, apiPost } from "@/lib/api";
import { beginSession, useSession } from "@/lib/session";
import type { User } from "@/lib/types";

type Setup = { secret: string; provisioning_uri: string; expires_in_seconds: number };

export default function AccountSecurity() {
  const { user, isLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const changePassword = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
      ...(mfaCode ? { mfa_code: mfaCode } : {}),
    }),
    onSuccess: async (result) => {
      toast.success(result.message);
      queryClient.clear();
      navigate("/login");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const reauthenticate = useMutation({
    mutationFn: () => apiPost<User>("/auth/reauthenticate", {
      password: currentPassword,
      ...(mfaCode ? { mfa_code: mfaCode } : {}),
    }),
    onSuccess: async () => {
      await beginSession();
      toast.success("Identidade confirmada por 10 minutos.");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const startMfa = useMutation({
    mutationFn: () => apiPost<Setup>("/auth/mfa/setup", { current_password: currentPassword }),
    onSuccess: setSetup,
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const confirmMfa = useMutation({
    mutationFn: () => apiPost<{ recovery_codes: string[] }>("/auth/mfa/confirm", {
      current_password: currentPassword,
      code: mfaCode,
    }),
    onSuccess: ({ recovery_codes }) => {
      setRecoveryCodes(recovery_codes);
      setSetup(null);
      queryClient.clear();
      toast.success("MFA ativado. Guarde os códigos antes de sair.");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const disableMfa = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/auth/mfa/disable", {
      current_password: currentPassword,
      code: mfaCode,
    }),
    onSuccess: ({ message }) => {
      toast.success(message);
      queryClient.clear();
      navigate("/login");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const regenerateRecoveryCodes = useMutation({
    mutationFn: () => apiPost<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes/regenerate", {}),
    onSuccess: ({ recovery_codes }) => {
      setRecoveryCodes(recovery_codes);
      queryClient.clear();
      toast.success("Novos códigos gerados. Os anteriores foram invalidados.");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (isLoading) return <div role="status" className="p-8 text-[#BDBDBD]">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-12 sm:px-8" data-testid="account-security-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">Minha conta</p>
        <h1 className="mt-2 font-heading text-3xl font-black uppercase text-white">Segurança</h1>
      </div>

      <section className="rounded-xl border border-[#242424] bg-[#151515] p-6">
        <h2 className="font-heading text-lg font-bold text-white">Confirmar identidade</h2>
        <p className="mt-1 text-sm text-[#BDBDBD]">Necessário para alterações administrativas críticas. A confirmação vale por 10 minutos.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="security-current-password">Senha atual</Label><Input id="security-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
          <div><Label htmlFor="security-mfa-code">Código MFA ou recuperação</Label><Input id="security-mfa-code" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} /></div>
        </div>
        <Button className="mt-4" onClick={() => reauthenticate.mutate()} disabled={!currentPassword || reauthenticate.isPending}>Confirmar identidade</Button>
      </section>

      <section className="rounded-xl border border-[#242424] bg-[#151515] p-6">
        <h2 className="font-heading text-lg font-bold text-white">Trocar senha</h2>
        <div className="mt-4"><Label htmlFor="security-new-password">Nova senha, mínimo 15 caracteres</Label><Input id="security-new-password" type="password" autoComplete="new-password" minLength={15} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
        <Button className="mt-4" onClick={() => changePassword.mutate()} disabled={!currentPassword || newPassword.length < 15 || changePassword.isPending}>Trocar senha e encerrar sessões</Button>
      </section>

      {user.role !== "comprador" && (
        <section className="rounded-xl border border-[#242424] bg-[#151515] p-6">
          <h2 className="font-heading text-lg font-bold text-white">Autenticação em dois fatores</h2>
          <p className="mt-1 text-sm text-[#BDBDBD]">Status: {user.mfa_enabled ? "ativa" : "inativa"}. Use um aplicativo autenticador compatível com TOTP.</p>
          {!user.mfa_enabled && !setup && !recoveryCodes.length && <Button className="mt-4" onClick={() => startMfa.mutate()} disabled={!currentPassword || startMfa.isPending}>Iniciar configuração</Button>}
          {setup && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-white">Cadastre esta chave no autenticador:</p>
              <code className="block break-all rounded bg-[#0B0B0B] p-3 text-sm text-[#DAA520]">{setup.secret}</code>
              <details><summary className="cursor-pointer text-sm text-[#BDBDBD]">URI para configuração manual</summary><code className="mt-2 block break-all text-xs text-[#BDBDBD]">{setup.provisioning_uri}</code></details>
              <Button onClick={() => confirmMfa.mutate()} disabled={!/^\d{6,8}$/.test(mfaCode) || confirmMfa.isPending}>Confirmar código e ativar</Button>
            </div>
          )}
          {recoveryCodes.length > 0 && (
            <div className="mt-4 rounded border border-amber-400/40 bg-amber-400/10 p-4">
              <p className="font-semibold text-amber-200">Salve estes códigos agora. Eles não serão mostrados novamente.</p>
              <ul className="mt-3 grid gap-2 font-mono text-sm text-white sm:grid-cols-2">{recoveryCodes.map((code) => <li key={code}>{code}</li>)}</ul>
              <Button className="mt-4" onClick={() => navigate('/login')}>Já salvei; entrar novamente</Button>
            </div>
          )}
          {user.mfa_enabled && !recoveryCodes.length && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => regenerateRecoveryCodes.mutate()} disabled={regenerateRecoveryCodes.isPending}>Gerar novos códigos de recuperação</Button>
              <Button variant="outline" className="text-red-400" onClick={() => disableMfa.mutate()} disabled={!currentPassword || !mfaCode || disableMfa.isPending}>Desativar MFA</Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
