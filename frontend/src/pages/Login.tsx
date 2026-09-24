import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";

import { apiErrorMessage, apiPost } from "@/lib/api";
import { publicAsset } from "@/lib/assets";
import { beginSession, useSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const BRAND_IMAGE = publicAsset("media/editorial-1200.webp");

export default function Login() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [showPassword, setShowPassword] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMfaCode, setResetMfaCode] = useState("");

  useEffect(() => {
    if (user) navigate(user.role === "comprador" ? "/dashboard" : "/admin", { replace: true });
  }, [user, navigate]);

  const loginMutation = useMutation({
    mutationFn: (body: { email: string; password: string; mfa_code?: string }) =>
      apiPost<User>("/auth/login", body),
    onSuccess: async (u) => {
      await beginSession();
      toast.success(`Bem-vindo de volta, ${u.name.split(" ")[0]}!`);
      navigate(u.role === "comprador" ? "/dashboard" : "/admin");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const registerMutation = useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      apiPost<User>("/auth/register", body),
    onSuccess: async (u) => {
      await beginSession();
      toast.success(`Conta criada! Bem-vindo, ${u.name.split(" ")[0]}.`);
      navigate("/dashboard");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const forgotMutation = useMutation({
    mutationFn: (email: string) => apiPost<{ message: string }>("/auth/forgot-password", { email }),
    onSuccess: (data) => {
      toast.success(data.message);
      setRecoveryRequested(true);
      setResetToken("");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: (body: { token: string; new_password: string; mfa_code?: string }) =>
      apiPost<{ message: string }>("/auth/reset-password", body),
    onSuccess: (data) => {
      toast.success(data.message);
      setForgotOpen(false);
      setResetToken("");
      setResetPassword("");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div data-testid="login-page" className="mx-auto grid min-h-[calc(100svh-8rem)] w-full max-w-7xl items-stretch gap-10 px-4 py-8 sm:px-8 sm:py-12 lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden rounded-2xl border border-[#DAA520]/20 lg:block">
        <img
          src={BRAND_IMAGE}
          alt="Campanha MV Multimarcas"
          width={1200}
          height={800}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-[#0B0B0B]/50 to-[#0B0B0B]/20" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-3">
            <img
              src={publicAsset("mv-logo.jpg")}
              alt="MV Multimarcas"
              width={150}
              height={150}
              className="h-12 w-12 rounded-lg border border-[#DAA520]/30 object-cover"
            />
            <span className="font-heading text-sm font-extrabold uppercase tracking-[0.3em] text-white">
              MV Multimarcas
            </span>
          </div>
          <div>
            <p className="font-heading text-4xl font-black uppercase leading-tight text-white">
              Vista sua <span className="text-[#DAA520]">presença.</span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#BDBDBD]">
              Performance, atitude e acabamento premium para quem se move diferente.
            </p>
          </div>
        </div>
      </div>

      {/* forms */}
      <div className="flex items-center">
        <div className="w-full rounded-2xl border border-[#242424] bg-[#151515] p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-extrabold uppercase tracking-tight text-white">
            {tab === "login" ? "Entrar na conta" : "Criar sua conta"}
          </h1>
          <p className="mt-1 text-sm text-[#BDBDBD]">
            Acompanhe pedidos, favoritos e ofertas exclusivas.
          </p>

          <Tabs value={tab} onValueChange={(value: string) => setTab(value)}>
            <TabsList className="w-full" data-testid="login-tabs">
              <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form
                data-testid="login-form"
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  loginMutation.mutate({ email: loginEmail.trim(), password: loginPassword, ...(loginMfaCode ? { mfa_code: loginMfaCode } : {}) });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BDBDBD]" />
                    <Input
                      id="login-email"
                      data-testid="login-email-input"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="voce@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-mfa">Código MFA ou de recuperação (equipe)</Label>
                  <Input id="login-mfa" data-testid="login-mfa-input" autoComplete="one-time-code" value={loginMfaCode} onChange={(e) => setLoginMfaCode(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 text-[#BDBDBD]" />
                    <Input
                      id="login-password"
                      data-testid="login-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-9 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Mostrar senha"
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[#BDBDBD] hover:text-[#DAA520]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="forgot-password-link"
                    onClick={() => setForgotOpen(true)}
                    className="flex min-h-11 items-center text-xs font-semibold text-[#DAA520] hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <Button
                  type="submit"
                  data-testid="login-submit-button"
                  disabled={loginMutation.isPending}
                  className="w-full bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                >
                  {loginMutation.isPending ? "Entrando…" : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form
                data-testid="register-form"
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  registerMutation.mutate({ name: regName.trim(), email: regEmail.trim(), password: regPassword });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Nome completo</Label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 text-[#BDBDBD]" />
                    <Input
                      id="reg-name"
                      data-testid="register-name-input"
                      value={regName}
                      required
                      autoComplete="name"
                      onChange={(e) => setRegName(e.target.value)}
                      className="pl-9"
                      placeholder="Seu nome"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 text-[#BDBDBD]" />
                    <Input
                      id="reg-email"
                      data-testid="register-email-input"
                      type="email"
                      required
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-9"
                      placeholder="voce@email.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 text-[#BDBDBD]" />
                    <Input
                      id="reg-password"
                      data-testid="register-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={15}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-9"
                      placeholder="Mínimo 15 caracteres"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  data-testid="register-submit-button"
                  disabled={registerMutation.isPending}
                  className="w-full bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                >
                  {registerMutation.isPending ? "Criando conta…" : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-[#BDBDBD]">
            Use seus dados de acesso para acompanhar pedidos e favoritos na sua conta.
          </p>
          <div className="mt-3 text-center">
            <Link to="/" className={cn(buttonVariants({ variant: "link" }), "text-xs text-[#BDBDBD]")}>
              ← Voltar para a loja
            </Link>
          </div>
        </div>
      </div>

      {/* forgot / reset password */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="border-[#242424] bg-[#151515]" data-testid="forgot-password-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Recuperar senha</DialogTitle>
            <p className="text-sm text-[#BDBDBD]">
              Informe seu e-mail para receber as instruções de recuperação.
            </p>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              forgotMutation.mutate(forgotEmail.trim());
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">E-mail cadastrado</Label>
              <Input
                id="forgot-email"
                data-testid="forgot-email-input"
                type="email"
                required
                autoComplete="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            <Button
              type="submit"
              data-testid="forgot-submit-button"
              disabled={forgotMutation.isPending || !forgotEmail}
              variant="outline"
              className="w-full"
            >
              {forgotMutation.isPending ? "Enviando…" : "Enviar instruções"}
            </Button>
            {forgotMutation.data?.message && (
              <p data-testid="forgot-message" className="text-sm text-[#DAA520]">
                {forgotMutation.data.message}
              </p>
            )}
            {recoveryRequested && (
              <div className="space-y-3 rounded-lg border border-[#242424] bg-[#0B0B0B] p-4">
                <Label htmlFor="reset-token">Código recebido por e-mail</Label>
                <Input id="reset-token" value={resetToken} onChange={(e) => setResetToken(e.target.value)} autoComplete="one-time-code" required />
                <div className="space-y-1.5">
                  <Label htmlFor="reset-password">Nova senha</Label>
                  <Input
                    id="reset-password"
                    data-testid="reset-password-input"
                    type="password"
                    required
                    minLength={15}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Mínimo 15 caracteres"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-mfa">Código MFA ou de recuperação (equipe)</Label>
                  <Input id="reset-mfa" autoComplete="one-time-code" value={resetMfaCode} onChange={(e) => setResetMfaCode(e.target.value)} />
                </div>
                <Button
                  type="button"
                  data-testid="reset-submit-button"
                  disabled={resetMutation.isPending || !resetToken.trim() || resetPassword.length < 15}
                  onClick={() => resetMutation.mutate({ token: resetToken, new_password: resetPassword, ...(resetMfaCode ? { mfa_code: resetMfaCode } : {}) })}
                  className="w-full bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]"
                >
                  {resetMutation.isPending ? "Redefinindo…" : "Redefinir senha"}
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
