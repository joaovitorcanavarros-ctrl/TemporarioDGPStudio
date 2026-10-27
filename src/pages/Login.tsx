import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, HelpCircle, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { loginWithGoogle } from "@/lib/firebase";
import { errMsg } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { UserOut } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Login() {
  const me = useMe();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmaSenha, setShowConfirmaSenha] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [erro, setErro] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  // Mutation for standard email/password login
  const loginMut = useMutation({
    mutationFn: (body: { email: string; senha: string }) => apiPost<UserOut>("/auth/login", body),
    onSuccess: () => {
      beginSession();
      nav("/", { replace: true });
    },
    onError: (e) => setErro(errMsg(e, "Falha ao entrar")),
  });

  // Mutation for signup (Criar Conta)
  const signupMut = useMutation({
    mutationFn: (body: { nome: string; email: string; senha: string }) => apiPost<UserOut>("/auth/signup", body),
    onSuccess: () => {
      beginSession();
      nav("/", { replace: true });
    },
    onError: (e) => setErro(errMsg(e, "Falha ao criar conta")),
  });

  // Mutation for Google login synchronization
  const googleMut = useMutation({
    mutationFn: (body: { email: string; nome: string; uid: string }) => apiPost<UserOut>("/auth/google", body),
    onSuccess: () => {
      beginSession();
      nav("/", { replace: true });
    },
    onError: (e) => setErro(errMsg(e, "Falha ao autenticar com Google")),
  });

  if (me.data) return <Navigate to="/" replace />;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!email.trim() || !senha) {
      setErro("Informe o e-mail e a senha.");
      return;
    }
    loginMut.mutate({ email: email.trim(), senha });
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!nome.trim() || !email.trim() || !senha) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha deve conter ao menos 6 caracteres.");
      return;
    }
    if (senha !== confirmaSenha) {
      setErro("A confirmação de senha não confere.");
      return;
    }
    signupMut.mutate({ nome: nome.trim(), email: email.trim(), senha });
  };

  const handleGoogleLogin = async () => {
    setErro("");
    setGoogleLoading(true);
    try {
      const gUser = await loginWithGoogle();
      googleMut.mutate({ email: gUser.email, nome: gUser.name, uid: gUser.user.uid });
    } catch (err: any) {
      console.warn("Google sign-in exception:", err);
      if (err?.code === "auth/popup-closed-by-user") {
        setErro("Login cancelado: janela do Google fechada antes de concluir.");
      } else if (err?.code === "auth/popup-blocked") {
        setErro("O navegador bloqueou o popup de login do Google. Permita popups para este site.");
      } else {
        setErro(err?.message || "Não foi possível conectar com o Google no momento.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const isPending = loginMut.isPending || signupMut.isPending || googleMut.isPending || googleLoading;

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.15fr_1fr] bg-gradient-to-br from-[#061024] via-[#0A1322] to-[#1A0A10] overflow-hidden">
      {/* Global ambient radial gradients extending seamlessly across both sides */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.30),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(220,38,38,0.24),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(30,58,138,0.22),transparent_55%)]" />

      {/* 1. LADO ESQUERDO: Apresentação e Identidade Institucional */}
      <section className="relative hidden overflow-hidden border-r border-white/5 lg:flex lg:flex-col lg:justify-between p-12 xl:p-16">
        {/* Background photo with subtle overlay/blend (without grid lines) */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src="/assets/aistudio/plano_de_fundo.temporario_365e2cd0.jpg"
            alt="Bombeiro Militar do CBMMT em ação operacional"
            className="size-full object-cover opacity-25 mix-blend-luminosity filter contrast-125 brightness-95"
          />
          {/* Subtle vignette and dark wash to guarantee high text contrast and seamless blend */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#061024]/90 via-[#0A1322]/80 to-[#0A1322]/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061024]/90 via-transparent to-[#061024]/60" />
        </div>

        {/* Top Header: CBMMT Official Logo */}
        <div className="relative z-10 flex items-center gap-4">
          <img
            src="/cbmmt-logo.png"
            alt="Emblema do Corpo de Bombeiros Militar de Mato Grosso"
            className="size-16 shrink-0 drop-shadow-[0_4px_18px_rgba(220,38,38,0.45)]"
            data-testid="login-logo"
          />
          <div>
            <p className="font-heading text-lg font-black tracking-wider text-white">CBMMT</p>
            <p className="text-xs font-medium tracking-wide text-slate-400">
              Corpo de Bombeiros Militar de Mato Grosso
            </p>
          </div>
        </div>

        {/* Central Content: Typographic Hierarchy */}
        <div className="relative z-10 max-w-xl animate-rise py-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-blue-400">
            DIRETORIA DE GESTÃO DE PESSOAS
          </p>
          <h1 className="font-heading text-4xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-5xl">
            Gerenciamento de Bombeiros Militares Temporários
          </h1>
          <p className="mt-5 text-sm sm:text-base leading-relaxed text-slate-300/90 max-w-lg">
            Efetivo, contratos, desligamentos e relatórios em um único sistema, com indicadores calculados a partir dos registros oficiais.
          </p>
        </div>

        {/* Bottom Footer: Security and Audit Badge */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/25 bg-emerald-950/35 px-4 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur-md shadow-sm">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
            <span>Acesso seguro com auditoria de operações</span>
          </div>
        </div>
      </section>

      {/* 2. LADO DIREITO: Painel de Login com Efeito Glassmorphism */}
      <section className="relative flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div
          className="relative z-10 w-full max-w-md animate-rise space-y-6 rounded-2xl border border-white/10 bg-[#0E1726]/80 p-8 sm:p-9 shadow-[0_25px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl ring-1 ring-white/5"
          data-testid="login-form"
        >
          {/* Card Header */}
          <div>
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {mode === "login" ? "Acessar Sistema" : "Criar Nova Conta"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              {mode === "login"
                ? "Conecte-se com sua conta ou credenciais."
                : "Cadastre-se para acessar o sistema corporativo."}
            </p>
          </div>

          {/* Seletor de Abas: Duas abas de texto simples lado a lado com borda ativa */}
          <div className="flex border-b border-slate-700/60 pb-px gap-8">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErro("");
              }}
              className={cn(
                "pb-2.5 text-sm font-semibold transition-all duration-150 relative",
                mode === "login"
                  ? "text-white border-b-2 border-blue-500 font-bold"
                  : "text-slate-500 hover:text-slate-300 border-b-2 border-transparent"
              )}
              data-testid="tab-login"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErro("");
              }}
              className={cn(
                "pb-2.5 text-sm font-semibold transition-all duration-150 relative",
                mode === "signup"
                  ? "text-white border-b-2 border-blue-500 font-bold"
                  : "text-slate-500 hover:text-slate-300 border-b-2 border-transparent"
              )}
              data-testid="tab-signup"
            >
              Criar Conta
            </button>
          </div>

          {/* Botão Social Google Oficial */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={isPending}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#162032] hover:bg-[#1E2B44] hover:border-white/20 text-slate-100 flex items-center justify-center gap-3 transition-all duration-150 shadow-sm"
            data-testid="google-login-button"
          >
            <svg className="size-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span className="text-sm font-medium">
              {googleLoading || googleMut.isPending ? "Conectando ao Google..." : "Entrar com Google (Gmail)"}
            </span>
          </Button>

          {/* Divisor Fino e Centralizado */}
          <div className="relative flex items-center justify-center py-0.5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <span className="relative bg-[#0E1726] px-3 text-xs tracking-normal text-slate-400">
              ou com e-mail e senha
            </span>
          </div>

          {/* Formulários */}
          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Campo E-mail */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-200">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="usuario@cbmmt.mt.gov.br ou gmail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-[#090F1B] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                  data-testid="login-email-input"
                />
              </div>

              {/* Campo Senha com Ícone de Olho */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha" className="text-xs font-semibold text-slate-200">
                    Senha
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    id="senha"
                    type={showSenha ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="h-11 rounded-xl border-white/10 bg-[#090F1B] pl-3.5 pr-11 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                    title={showSenha ? "Ocultar senha" : "Exibir senha"}
                    aria-label={showSenha ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {/* Link Esqueceu a Senha alinhado à direita */}
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(true)}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                    data-testid="forgot-password-link"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              </div>

              {erro && (
                <div
                  className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-300 animate-rise"
                  data-testid="login-error"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{erro}</span>
                </div>
              )}

              {/* Botão de Ação Principal: Azul vibrante com cantos arredondados e cadeado */}
              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-[0.99] transition-all duration-150"
                disabled={isPending}
                data-testid="login-submit-button"
              >
                <Lock className="size-4" />
                <span>{loginMut.isPending ? "Entrando..." : "Entrar"}</span>
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="signup-nome" className="text-xs font-semibold text-slate-200">
                  Nome completo
                </Label>
                <Input
                  id="signup-nome"
                  type="text"
                  placeholder="Ex.: João Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="h-10 rounded-xl border-white/10 bg-[#090F1B] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                  data-testid="signup-name-input"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="signup-email" className="text-xs font-semibold text-slate-200">
                  E-mail
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="seu.email@cbmmt.mt.gov.br ou gmail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 rounded-xl border-white/10 bg-[#090F1B] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                  data-testid="signup-email-input"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="signup-senha" className="text-xs font-semibold text-slate-200">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="signup-senha"
                    type={showSenha ? "text" : "password"}
                    placeholder="Mínimo de 6 caracteres"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="h-10 rounded-xl border-white/10 bg-[#090F1B] pl-3.5 pr-11 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                    data-testid="signup-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                    title={showSenha ? "Ocultar senha" : "Exibir senha"}
                    aria-label={showSenha ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="signup-confirma" className="text-xs font-semibold text-slate-200">
                  Confirmar senha
                </Label>
                <div className="relative">
                  <Input
                    id="signup-confirma"
                    type={showConfirmaSenha ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={confirmaSenha}
                    onChange={(e) => setConfirmaSenha(e.target.value)}
                    className="h-10 rounded-xl border-white/10 bg-[#090F1B] pl-3.5 pr-11 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/25 transition-all"
                    data-testid="signup-password-confirm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmaSenha((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                    title={showConfirmaSenha ? "Ocultar senha" : "Exibir senha"}
                    aria-label={showConfirmaSenha ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showConfirmaSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-400 pt-1">
                Novos cadastros recebem inicialmente perfil de{" "}
                <strong className="text-slate-200">Consulta</strong>. Um administrador pode atualizar suas
                permissões após a validação.
              </p>

              {erro && (
                <div
                  className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-300 animate-rise"
                  data-testid="login-error"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{erro}</span>
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-[0.99] transition-all duration-150"
                disabled={isPending}
                data-testid="signup-submit-button"
              >
                <UserPlus className="size-4" />
                <span>{signupMut.isPending ? "Criando conta..." : "Criar minha conta"}</span>
              </Button>
            </form>
          )}
        </div>
      </section>

      {/* Modal Dialog: Esqueceu a Senha */}
      <Dialog open={forgotModalOpen} onOpenChange={setForgotModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-white/10 bg-[#0E1726] p-6 text-slate-100 shadow-2xl backdrop-blur-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 ring-1 ring-blue-500/30">
                <HelpCircle className="size-5 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Recuperação de Acesso
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Instruções para redefinição de credenciais institucionais
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-3 text-xs leading-relaxed text-slate-300">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-200">
              <strong className="block font-semibold mb-1">Acesso via Google (Gmail institucional):</strong>
              Se a sua conta foi conectada via Google, você não precisa de senha. Basta clicar em{" "}
              <strong>"Entrar com Google (Gmail)"</strong> na tela inicial.
            </div>

            <div className="rounded-xl border border-white/5 bg-[#162032] p-3 text-slate-300">
              <strong className="block font-semibold text-white mb-1">Contas locais (E-mail e Senha):</strong>
              A redefinição de senhas de operadores locais é gerenciada pela Diretoria de Gestão de Pessoas (DGP). Solicite ao administrador responsável para redefinir temporariamente o seu acesso na aba de Configurações e Usuários.
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => setForgotModalOpen(false)}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 h-9"
            >
              Compreendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
