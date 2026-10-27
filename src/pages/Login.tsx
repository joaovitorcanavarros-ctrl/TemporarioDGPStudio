import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
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
    setSucesso("");
    if (!email.trim() || !senha) {
      setErro("Informe o e-mail e a senha.");
      return;
    }
    loginMut.mutate({ email: email.trim(), senha });
  };

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setSucesso("");
    if (!nome.trim() || !email.trim() || !senha) {
      setErro("Preencha todos os campos.");
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
    setSucesso("");
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
    <div className="grid min-h-screen bg-[#0B111A] lg:grid-cols-[1.1fr_1fr]">
      {/* Brand & Editorial Column */}
      <section className="relative hidden overflow-hidden border-r border-[#162234] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(37,99,235,0.25),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(225,29,72,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#94A3B8_1px,transparent_1px),linear-gradient(90deg,#94A3B8_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <img src="/cbmmt-logo.png" alt="Emblema do CBMMT" className="size-16 drop-shadow-[0_6px_16px_rgba(220,38,38,0.35)]" data-testid="login-logo" />
            <div>
              <p className="font-heading text-lg font-extrabold tracking-wide text-white">CBMMT</p>
              <p className="text-xs text-slate-400">Corpo de Bombeiros Militar de Mato Grosso</p>
            </div>
          </div>
          <div className="max-w-lg animate-rise">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Diretoria de Gestão de Pessoas</p>
            <h2 className="font-heading text-4xl font-extrabold leading-tight text-white">Gerenciamento de Bombeiros Militares Temporários</h2>
            <p className="mt-4 text-slate-400">Efetivo, contratos, desligamentos e relatórios em um único sistema, com indicadores calculados a partir dos registros oficiais.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-400" /> Acesso seguro com auditoria de operações.
          </p>
        </div>
      </section>

      {/* Form Column */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise space-y-5 rounded-2xl border border-[#1E2C42] bg-[#121B28] p-8 shadow-2xl shadow-black/50" data-testid="login-form">
          <div>
            <h1 className="font-heading text-2xl font-bold text-white">
              {mode === "login" ? "Acessar Sistema" : "Criar Nova Conta"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {mode === "login" ? "Conecte-se com sua conta ou credenciais." : "Cadastre-se para acessar o sistema."}
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 rounded-lg border border-[#1E2C42] bg-[#0F1724] p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setErro(""); setSucesso(""); }}
              className={cn("py-1.5 text-xs font-semibold rounded-md transition-colors", mode === "login" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white")}
              data-testid="tab-login"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setErro(""); setSucesso(""); }}
              className={cn("py-1.5 text-xs font-semibold rounded-md transition-colors", mode === "signup" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white")}
              data-testid="tab-signup"
            >
              Criar Conta
            </button>
          </div>

          {/* Google Sign-In Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={isPending}
            className="h-11 w-full border-[#1E2C42] bg-[#162234] hover:bg-[#1E2C42] text-white flex items-center justify-center gap-3 transition-colors"
            data-testid="google-login-button"
          >
            <svg className="size-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            <span className="text-sm font-medium">
              {googleLoading || googleMut.isPending ? "Conectando ao Google..." : "Entrar com Google (Gmail)"}
            </span>
          </Button>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1E2C42]" /></div>
            <span className="relative bg-[#121B28] px-3 text-[11px] uppercase tracking-wider text-slate-500">
              ou com e-mail e senha
            </span>
          </div>

          {/* Forms */}
          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="usuario@cbmmt.mt.gov.br ou gmail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  data-testid="login-password-input"
                />
              </div>

              {erro && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300" data-testid="login-error">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{erro}</span>
                </div>
              )}

              <Button
                type="submit"
                className="h-10 w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform"
                disabled={isPending}
                data-testid="login-submit-button"
              >
                <Lock className="size-4" /> {loginMut.isPending ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="signup-nome">Nome completo</Label>
                <Input
                  id="signup-nome"
                  type="text"
                  placeholder="Ex.: João Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  data-testid="signup-name-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signup-email">E-mail</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="seu.email@cbmmt.mt.gov.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="signup-email-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signup-senha">Senha</Label>
                <Input
                  id="signup-senha"
                  type="password"
                  placeholder="Mínimo de 6 caracteres"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  data-testid="signup-password-input"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signup-confirma">Confirmar senha</Label>
                <Input
                  id="signup-confirma"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                  data-testid="signup-password-confirm"
                />
              </div>

              <p className="text-[11px] leading-relaxed text-slate-400">
                Novos cadastros recebem inicialmente perfil de <strong className="text-slate-300">Consulta</strong>. Um administrador pode atualizar suas permissões na tela de configurações.
              </p>

              {erro && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300" data-testid="login-error">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{erro}</span>
                </div>
              )}

              <Button
                type="submit"
                className="h-10 w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform"
                disabled={isPending}
                data-testid="signup-submit-button"
              >
                <UserPlus className="size-4" /> {signupMut.isPending ? "Criando conta..." : "Criar minha conta"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
