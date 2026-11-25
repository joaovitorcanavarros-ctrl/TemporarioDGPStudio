import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingOtpSignup {
  source: "signup" | "google";
  email: string;
  nome: string;
  senha?: string;
  uid?: string;
  idToken?: string;
  isSystemAdmin: boolean;
}

export interface VerifiedOtpResult {
  verifiedAt: string;
  verificationToken: string;
}

interface GlassyOtpCardProps {
  pending: PendingOtpSignup;
  onCancel: () => void;
  onContinue: (result: VerifiedOtpResult) => Promise<void> | void;
  continuing?: boolean;
}

type OtpStage =
  | "sending"
  | "idle"
  | "verifying"
  | "connecting"
  | "merging"
  | "lifting"
  | "success"
  | "config_error";

const DIGIT_SLOTS = [0, 1, 2, 3] as const;

function maskEmailClient(email: string): string {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart) return email;
  if (localPart.length <= 2) return `${localPart[0]}*@${domain}`;
  if (localPart.length <= 4) {
    return `${localPart[0]}**${localPart[localPart.length - 1]}@${domain}`;
  }
  const stars = "*".repeat(Math.min(6, Math.max(3, localPart.length - 3)));
  return `${localPart.slice(0, 2)}${stars}${localPart.slice(-1)}@${domain}`;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatVerifiedTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

export default function GlassyOtpCard({
  pending,
  onCancel,
  onContinue,
  continuing = false,
}: GlassyOtpCardProps) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<OtpStage>("sending");
  const [digits, setDigits] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [maskedEmail, setMaskedEmail] = useState<string>(() => maskEmailClient(pending.email));
  const [cooldown, setCooldown] = useState<number>(30);
  const [resending, setResending] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>("");
  const [shakeKey, setShakeKey] = useState<number>(0);
  const [verifiedResult, setVerifiedResult] = useState<VerifiedOtpResult | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const initialSentRef = useRef(false);

  const clearScheduledTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      if (mountedRef.current) fn();
    }, delayMs);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearScheduledTimers();
    };
  }, [clearScheduledTimers]);

  // Contador regressivo de reenvio
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown]);

  const sendOtpCode = useCallback(
    async (isResend = false) => {
      if (isResend) {
        setResending(true);
      } else {
        setStage("sending");
      }
      setErrorText("");

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (pending.idToken) {
          headers.Authorization = `Bearer ${pending.idToken}`;
        }

        const res = await fetch("/api/auth/otp/send", {
          method: "POST",
          headers,
          body: JSON.stringify({ email: pending.email, nome: pending.nome }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          maskedEmail?: string;
          resendCooldownSeconds?: number;
          retryAfterSeconds?: number;
          detail?: string;
          code?: string;
        };

        if (!mountedRef.current) return;

        if (!res.ok) {
          if (data.code === "OTP_COOLDOWN" && typeof data.retryAfterSeconds === "number") {
            setCooldown(data.retryAfterSeconds);
            if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
            setStage("idle");
            setErrorText(data.detail || "Aguarde para reenviar o código.");
            return;
          }

          if (data.code === "SMTP_NOT_CONFIGURED" || data.code === "SMTP_AUTH_FAILED") {
            setStage("config_error");
            setErrorText(
              data.detail ||
                "Configuração de envio Gmail SMTP pendente no servidor. Defina GMAIL_SMTP_USER e GMAIL_SMTP_APP_PASSWORD."
            );
            return;
          }

          setStage("idle");
          setErrorText(data.detail || "Não foi possível enviar o código de verificação.");
          return;
        }

        if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
        setCooldown(data.resendCooldownSeconds ?? 30);
        setDigits(["", "", "", ""]);
        setStage("idle");
        setFocusedIndex(0);
        schedule(() => inputRefs.current[0]?.focus(), 80);
      } catch {
        if (!mountedRef.current) return;
        setStage("config_error");
        setErrorText(
          "Falha de conexão com o servidor de envio de e-mail. Tente novamente em instantes."
        );
      } finally {
        if (mountedRef.current) setResending(false);
      }
    },
    [pending.email, pending.idToken, pending.nome, schedule]
  );

  // Envia automaticamente o primeiro código ao abrir o card
  useEffect(() => {
    if (initialSentRef.current) return;
    initialSentRef.current = true;
    void sendOtpCode(false);
  }, [sendOtpCode]);

  const codeValue = useMemo(() => digits.join(""), [digits]);
  const isCodeComplete = codeValue.length === 4;

  const verifyCode = useCallback(
    async (explicitCode?: string) => {
      const targetCode = explicitCode ?? digits.join("");
      if (!/^\d{4}$/.test(targetCode)) return;
      if (stage !== "idle") return;

      clearScheduledTimers();
      setErrorText("");
      setStage("verifying");

      const startedAt = Date.now();

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (pending.idToken) {
          headers.Authorization = `Bearer ${pending.idToken}`;
        }

        const res = await fetch("/api/auth/otp/verify", {
          method: "POST",
          headers,
          body: JSON.stringify({ email: pending.email, code: targetCode }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          verifiedAt?: string;
          verificationToken?: string;
          maskedEmail?: string;
          detail?: string;
          code?: string;
        };

        // Garante tempo mínimo para o morph 1×4 → 2×2 assentar com elegância
        const elapsed = Date.now() - startedAt;
        const minMorphMs = reduceMotion ? 160 : 680;
        if (elapsed < minMorphMs) {
          await new Promise((resolve) => window.setTimeout(resolve, minMorphMs - elapsed));
        }

        if (!mountedRef.current) return;

        if (!res.ok || !data.ok || !data.verificationToken) {
          setStage("idle");
          setErrorText(data.detail || "Código inválido. Verifique e tente novamente.");
          setShakeKey((k) => k + 1);
          setDigits(["", "", "", ""]);
          setFocusedIndex(0);
          schedule(() => inputRefs.current[0]?.focus(), 120);
          return;
        }

        const proof: VerifiedOtpResult = {
          verifiedAt: data.verifiedAt || new Date().toISOString(),
          verificationToken: data.verificationToken,
        };
        setVerifiedResult(proof);
        if (data.maskedEmail) setMaskedEmail(data.maskedEmail);

        if (reduceMotion) {
          setStage("success");
          return;
        }

        // Coreografia fiel ao modelo Glassy OTP V15:
        // verifying (2×2) -> connecting (2×2 verde + X luminoso) -> merging (converge no centro)
        // -> lifting (blur suave + selo sobe para o topo) -> success (tela final nítida)
        setStage("connecting");
        schedule(() => setStage("merging"), 740);
        schedule(() => setStage("lifting"), 1380);
        schedule(() => setStage("success"), 1840);
      } catch {
        if (!mountedRef.current) return;
        setStage("idle");
        setErrorText("Erro de comunicação ao validar o código. Tente novamente.");
        setShakeKey((k) => k + 1);
      }
    },
    [clearScheduledTimers, digits, pending.email, pending.idToken, reduceMotion, schedule, stage]
  );

  const handleDigitChange = (index: number, raw: string) => {
    if (stage !== "idle") return;
    const onlyDigits = raw.replace(/\D/g, "");
    if (!onlyDigits) {
      setDigits((prev) => {
        const next: [string, string, string, string] = [...prev] as [
          string,
          string,
          string,
          string,
        ];
        next[index] = "";
        return next;
      });
      return;
    }

    setErrorText("");

    if (onlyDigits.length > 1) {
      // Colagem ou preenchimento rápido de vários dígitos
      const next: [string, string, string, string] = [...digits] as [
        string,
        string,
        string,
        string,
      ];
      for (let i = 0; i < onlyDigits.length && index + i < 4; i++) {
        next[index + i] = onlyDigits[i];
      }
      setDigits(next);
      const nextEmpty = next.findIndex((d) => !d);
      const targetFocus = nextEmpty === -1 ? 3 : nextEmpty;
      setFocusedIndex(targetFocus);
      inputRefs.current[targetFocus]?.focus();

      const joined = next.join("");
      if (joined.length === 4) {
        schedule(() => void verifyCode(joined), 110);
      }
      return;
    }

    const single = onlyDigits[0];
    const next: [string, string, string, string] = [...digits] as [
      string,
      string,
      string,
      string,
    ];
    next[index] = single;
    setDigits(next);

    if (index < 3) {
      setFocusedIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    } else {
      inputRefs.current[index]?.blur();
    }

    const joined = next.join("");
    if (joined.length === 4) {
      schedule(() => void verifyCode(joined), 130);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (stage !== "idle") return;
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next: [string, string, string, string] = [...digits] as [
          string,
          string,
          string,
          string,
        ];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        e.preventDefault();
        const next: [string, string, string, string] = [...digits] as [
          string,
          string,
          string,
          string,
        ];
        next[index - 1] = "";
        setDigits(next);
        setFocusedIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      setFocusedIndex(index - 1);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault();
      setFocusedIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Enter" && isCodeComplete) {
      e.preventDefault();
      void verifyCode();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (stage !== "idle") return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    e.preventDefault();
    const next: [string, string, string, string] = [
      pasted[0] || "",
      pasted[1] || "",
      pasted[2] || "",
      pasted[3] || "",
    ];
    setDigits(next);
    setErrorText("");
    const focusIdx = Math.min(3, pasted.length);
    setFocusedIndex(focusIdx);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === 4) {
      schedule(() => void verifyCode(pasted), 120);
    }
  };

  const isGridMode = stage === "verifying" || stage === "connecting";
  const isVerifiedPhase =
    stage === "connecting" || stage === "merging" || stage === "lifting" || stage === "success";
  const isBlurredLifting = stage === "lifting";

  // Calcula deslocamentos exatos (pista fixa de 268px com 4 blocos de 58px e 12px de espaçamento)
  // Centros iniciais relativos ao centro (134px): -105, -35, +35, +105
  const getBoxTransform = (idx: number) => {
    if (stage === "idle" || stage === "sending") {
      return { x: 0, y: 0, scale: 1, opacity: 1 };
    }
    if (stage === "verifying" || stage === "connecting") {
      // Alvos simétricos em grid 2×2: (±44px horizontal, ±40px vertical)
      // Ordem visual fiel ao vídeo: [0] [1] em cima, [2] [3] embaixo
      const gridOffsets = [
        { x: 61, y: -40 }, // índice 0 (-105 -> -44)
        { x: 79, y: -40 }, // índice 1 (-35  -> +44)
        { x: -79, y: 40 }, // índice 2 (+35  -> -44)
        { x: -61, y: 40 }, // índice 3 (+105 -> +44)
      ];
      return {
        x: gridOffsets[idx].x,
        y: gridOffsets[idx].y,
        scale: 1.03,
        opacity: 1,
      };
    }
    if (stage === "merging" || stage === "lifting") {
      // Convergência exata ao centro (0, 0)
      const centerOffsets = [
        { x: 105, y: 0 },
        { x: 35, y: 0 },
        { x: -35, y: 0 },
        { x: -105, y: 0 },
      ];
      return {
        x: centerOffsets[idx].x,
        y: centerOffsets[idx].y,
        scale: 0.42,
        opacity: 0,
      };
    }
    return { x: 0, y: 0, scale: 0.5, opacity: 0 };
  };

  const springTransition = reduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.88 };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.985 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.15] bg-gradient-to-br from-[#0E182D]/68 via-[#0A1324]/64 to-[#190911]/72 p-6 sm:p-9 shadow-[0_32px_84px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/10"
      data-testid="glassy-otp-card"
    >
      {/* Brilho atmosférico superior discreto */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: isVerifiedPhase ? 0.55 : errorText ? 0.45 : 0.4,
        }}
        transition={{ duration: 0.7 }}
        className={cn(
          "pointer-events-none absolute -top-20 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700",
          isVerifiedPhase
            ? "bg-emerald-500/14"
            : errorText
            ? "bg-red-500/14"
            : "bg-blue-500/12"
        )}
      />

      {/* Linha de reflexo vidro na borda superior */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
      />

      <AnimatePresence mode="wait">
        {stage === "success" ? (
          /* ================================================================
             ETAPA FINAL (Frame 00:05) — Tela "Cadastro confirmado"
             ================================================================ */
          <motion.div
            key="otp-success-view"
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(6px)", scale: 0.98 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center text-center"
            data-testid="otp-success-view"
          >
            {/* Selo circular verde esmeralda no topo */}
            <motion.div
              initial={reduceMotion ? false : { scale: 0.85, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={springTransition}
              className="relative mb-5 grid size-16 place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_36px_rgba(16,185,129,0.58)] ring-4 ring-emerald-400/20"
            >
              <Check className="size-8 stroke-[3]" />
            </motion.div>

            <h2 className="font-heading text-2xl sm:text-[1.7rem] font-extrabold tracking-tight text-white">
              Cadastro confirmado
            </h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-300/90">
              Seu Gmail foi verificado com sucesso. Seu acesso ao sistema CBMMT está liberado.
            </p>

            {/* Dois blocos informativos translúcidos com check verde (como no vídeo) */}
            <div className="mt-6 w-full space-y-2.5 text-left">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#040812]/65 px-4 py-3 backdrop-blur-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-200">
                    <Mail className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">E-mail confirmado</p>
                    <p className="truncate font-mono text-xs text-slate-400">{maskedEmail}</p>
                  </div>
                </div>
                <div className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/35">
                  <Check className="size-3.5 stroke-[2.75]" />
                </div>
              </motion.div>

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#040812]/65 px-4 py-3 backdrop-blur-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-200">
                    <ShieldCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">Conta ativada</p>
                    <p className="truncate text-xs text-slate-400">
                      Verificado às{" "}
                      <span className="font-mono tabular-nums text-slate-300">
                        {formatVerifiedTime(verifiedResult?.verifiedAt || new Date().toISOString())}
                      </span>{" "}
                      · Perfil {pending.isSystemAdmin ? "Administrador" : "Consulta"}
                    </p>
                  </div>
                </div>
                <div className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/35">
                  <Check className="size-3.5 stroke-[2.75]" />
                </div>
              </motion.div>
            </div>

            {/* Botão Continuar -> */}
            <motion.button
              type="button"
              disabled={continuing || !verifiedResult}
              onClick={() => {
                if (verifiedResult) void onContinue(verifiedResult);
              }}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-150 hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              data-testid="otp-continue-button"
            >
              {continuing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Liberando acesso...</span>
                </>
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </motion.button>
          </motion.div>
        ) : stage === "config_error" ? (
          /* ================================================================
             ESTADO DE CONFIGURAÇÃO SMTP PENDENTE
             ================================================================ */
          <motion.div
            key="otp-config-error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative flex flex-col items-center text-center"
            data-testid="otp-config-error"
          >
            <div className="mb-4 grid size-14 place-items-center rounded-full border border-red-400/30 bg-red-500/12 text-red-400 shadow-[0_0_28px_rgba(239,68,68,0.22)]">
              <AlertCircle className="size-6" />
            </div>

            <h2 className="font-heading text-xl font-extrabold tracking-tight text-white">
              Envio de e-mail indisponível
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{errorText}</p>

            <div className="mt-4 w-full rounded-xl border border-white/10 bg-[#090F1B]/75 p-3.5 text-left text-[11px] leading-relaxed text-slate-400">
              <p className="font-semibold text-slate-200">Para receber o código no Gmail:</p>
              <p className="mt-1">
                Configure <code className="font-mono text-blue-300">GMAIL_SMTP_USER</code> (seu
                e-mail remetente) e{" "}
                <code className="font-mono text-blue-300">GMAIL_SMTP_APP_PASSWORD</code> (Senha de
                App de 16 dígitos da Conta Google) em{" "}
                <strong className="text-slate-200">Settings → Secrets</strong>.
              </p>
            </div>

            <div className="mt-5 flex w-full flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void sendOtpCode(false)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 cursor-pointer"
              >
                <RotateCw className="size-4" />
                <span>Tentar enviar novamente</span>
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="size-3.5" />
                <span>Voltar ao login</span>
              </button>
            </div>
          </motion.div>
        ) : (
          /* ================================================================
             ETAPAS INTERATIVAS E COREOGRAFIA (Frames 00:00 → 00:04)
             ================================================================ */
          <motion.div
            key="otp-challenge-view"
            className="relative flex flex-col items-center text-center"
          >
            {/* Emblema circular no topo — sofre elevação do selo verde no estágio 'lifting' */}
            <div className="relative mb-5 flex h-14 w-14 items-center justify-center">
              <motion.div
                animate={{
                  opacity: isBlurredLifting ? 0 : 1,
                  scale: stage === "verifying" ? [1, 1.06, 1] : 1,
                }}
                transition={{
                  scale: stage === "verifying" ? { repeat: Infinity, duration: 1.4 } : { duration: 0.25 },
                  opacity: { duration: 0.25 },
                }}
                className={cn(
                  "grid size-14 place-items-center rounded-full border backdrop-blur-md transition-colors duration-400",
                  isVerifiedPhase
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.3)]"
                    : "border-white/18 bg-white/[0.07] text-blue-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),0_10px_28px_rgba(37,99,235,0.22)]"
                )}
              >
                {stage === "sending" ? (
                  <Loader2 className="size-6 animate-spin text-blue-400" />
                ) : (
                  <Mail className="size-6" />
                )}
              </motion.div>

              {/* Selo verde que sobe do centro para o topo no estágio 'lifting' (Frame 00:04) */}
              {isBlurredLifting && (
                <motion.div
                  initial={{ y: 128, scale: 0.92, opacity: 0.9 }}
                  animate={{ y: 0, scale: 1.06, opacity: 1 }}
                  transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 z-30 grid place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_40px_rgba(16,185,129,0.65)] ring-4 ring-emerald-400/25"
                >
                  <Check className="size-7 stroke-[3]" />
                </motion.div>
              )}
            </div>

            {/* Corpo do card que desfoca suavemente durante 'lifting' (Frame 00:04) */}
            <motion.div
              animate={{
                filter: isBlurredLifting ? "blur(7px)" : "blur(0px)",
                opacity: isBlurredLifting ? 0.38 : 1,
                scale: isBlurredLifting ? 0.98 : 1,
              }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full flex-col items-center"
            >
              <h2 className="font-heading text-2xl sm:text-[1.7rem] font-extrabold tracking-tight text-white">
                Verifique seu e-mail
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                {stage === "sending" ? (
                  <span>Enviando código de 4 dígitos para seu Gmail...</span>
                ) : (
                  <>
                    Digite o código de 4 dígitos enviado para{" "}
                    <span className="mt-0.5 block font-mono text-xs sm:text-[13px] font-semibold text-slate-100">
                      {maskedEmail}
                    </span>
                  </>
                )}
              </p>

              {/* Área Coreografada dos 4 Blocos OTP (altura fixa estável para morph 1×4 ↔ 2×2 ↔ centro) */}
              <motion.div
                key={shakeKey}
                animate={
                  shakeKey > 0 && !reduceMotion
                    ? { x: [0, -9, 9, -6, 6, -3, 0] }
                    : { x: 0 }
                }
                transition={{ duration: 0.42, ease: "easeInOut" }}
                className="relative my-6 flex h-[156px] w-full items-center justify-center"
              >
                {/* Linhas luminosas diagonais em formato "X" no estágio 'connecting' (Frame 00:02) */}
                <AnimatePresence>
                  {stage === "connecting" && (
                    <motion.svg
                      key="otp-x-glow"
                      viewBox="0 0 180 156"
                      className="pointer-events-none absolute inset-0 m-auto h-[156px] w-[180px] overflow-visible"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <defs>
                        <filter id="cbmmt-otp-glow" x="-40%" y="-40%" width="180%" height="180%">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        <linearGradient id="cbmmt-x-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#34D399" stopOpacity="0.25" />
                          <stop offset="50%" stopColor="#6EE7B7" stopOpacity="1" />
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.25" />
                        </linearGradient>
                      </defs>
                      {/* Diagonal 1: topo-esquerda (46,38) -> base-direita (134,118) */}
                      <motion.line
                        x1="46"
                        y1="38"
                        x2="134"
                        y2="118"
                        stroke="url(#cbmmt-x-grad-1)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        filter="url(#cbmmt-otp-glow)"
                        initial={{ pathLength: 0, opacity: 0.4 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                      />
                      {/* Diagonal 2: topo-direita (134,38) -> base-esquerda (46,118) */}
                      <motion.line
                        x1="134"
                        y1="38"
                        x2="46"
                        y2="118"
                        stroke="url(#cbmmt-x-grad-1)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        filter="url(#cbmmt-otp-glow)"
                        initial={{ pathLength: 0, opacity: 0.4 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.42, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                      />
                      {/* Ponto luminoso central na interseção do X */}
                      <motion.circle
                        cx="90"
                        cy="78"
                        r="5"
                        fill="#A7F3D0"
                        filter="url(#cbmmt-otp-glow)"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: [0, 1.35, 1], opacity: [0, 1, 0.9] }}
                        transition={{ duration: 0.45, delay: 0.16 }}
                      />
                    </motion.svg>
                  )}
                </AnimatePresence>

                {/* Emblema central verde esmeralda ao fundir os 4 blocos (Frame 00:03) */}
                <AnimatePresence>
                  {stage === "merging" && (
                    <motion.div
                      key="otp-merged-badge"
                      initial={{ scale: 0.45, opacity: 0, borderRadius: "20px" }}
                      animate={{ scale: 1, opacity: 1, borderRadius: "18px" }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      transition={springTransition}
                      className="absolute z-20 grid size-[68px] place-items-center bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_48px_rgba(16,185,129,0.68)] ring-4 ring-emerald-400/25"
                    >
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.12, type: "spring", stiffness: 320, damping: 20 }}
                      >
                        <Check className="size-8 stroke-[3]" />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Os 4 Blocos de Dígitos com Morph Suave 1×4 → 2×2 → Convergência */}
                <div className="relative flex w-[268px] items-center justify-between gap-3">
                  {DIGIT_SLOTS.map((idx) => {
                    const digit = digits[idx];
                    const isFocused = stage === "idle" && focusedIndex === idx;
                    const transform = getBoxTransform(idx);

                    return (
                      <motion.div
                        key={idx}
                        animate={transform}
                        transition={springTransition}
                        className={cn(
                          "relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-colors duration-300",
                          stage === "connecting"
                            ? "border-emerald-400/75 bg-emerald-500/20 shadow-[0_0_26px_rgba(16,185,129,0.34)]"
                            : stage === "verifying"
                            ? "border-blue-400/55 bg-[#111D32]/90 shadow-[0_0_24px_rgba(59,130,246,0.22)]"
                            : errorText
                            ? "border-red-500/70 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.2)]"
                            : isFocused
                            ? "border-blue-500 bg-[#090F1B]/95 ring-2 ring-blue-500/30 shadow-[0_0_24px_rgba(59,130,246,0.26)]"
                            : digit
                            ? "border-white/25 bg-[#0E182B]/90"
                            : "border-white/12 bg-[#090F1B]/75"
                        )}
                      >
                        <input
                          ref={(el) => {
                            inputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete={idx === 0 ? "one-time-code" : "off"}
                          maxLength={4}
                          disabled={stage !== "idle"}
                          value={digit}
                          onFocus={() => setFocusedIndex(idx)}
                          onChange={(e) => handleDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(idx, e)}
                          onPaste={handlePaste}
                          aria-label={`Dígito ${idx + 1} do código de verificação`}
                          data-testid={`otp-digit-${idx}`}
                          className={cn(
                            "h-full w-full bg-transparent text-center font-mono text-2xl font-bold tabular-nums outline-none caret-transparent selection:bg-blue-500/30",
                            stage === "connecting"
                              ? "text-emerald-100"
                              : isGridMode
                              ? "text-white"
                              : "text-white"
                          )}
                        />

                        {/* Cursor vertical animado no bloco ativo vazio (Frame 00:00) */}
                        {isFocused && !digit && (
                          <motion.span
                            aria-hidden="true"
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                            className="pointer-events-none absolute h-6 w-[2px] rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)]"
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Mensagem de erro contextual */}
              <AnimatePresence>
                {errorText && stage === "idle" && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mb-4 flex w-full items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-left text-xs text-red-300"
                    data-testid="otp-error-message"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                    <span>{errorText}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botão principal adaptativo conforme o estágio (Frame 00:00 → 00:03) */}
              <button
                type="button"
                disabled={stage !== "idle" || !isCodeComplete}
                onClick={() => void verifyCode()}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all duration-300",
                  stage === "connecting" || stage === "merging" || stage === "lifting"
                    ? "bg-emerald-500 text-white shadow-[0_12px_30px_rgba(16,185,129,0.42)]"
                    : stage === "verifying"
                    ? "bg-slate-100 text-[#0B132B] shadow-[0_12px_28px_rgba(255,255,255,0.2)]"
                    : isCodeComplete && stage === "idle"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-[0.99] cursor-pointer"
                    : "border border-white/10 bg-white/[0.06] text-slate-400 cursor-not-allowed"
                )}
                data-testid="otp-verify-button"
              >
                {stage === "sending" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Enviando código...</span>
                  </>
                ) : stage === "verifying" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : stage === "connecting" || stage === "merging" || stage === "lifting" ? (
                  <>
                    <Check className="size-4 stroke-[2.75]" />
                    <span>Verificado</span>
                  </>
                ) : (
                  <span>Verificar código</span>
                )}
              </button>

              {/* Rodapé: Reenvio com contador tabular + Voltar */}
              <div className="mt-5 flex flex-col items-center gap-2.5 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span>Não recebeu o código?</span>
                  {cooldown > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-300">
                      <RotateCw className="size-3 text-slate-400" />
                      Reenviar em{" "}
                      <span className="font-mono tabular-nums text-blue-300">
                        {formatCountdown(cooldown)}
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={resending || stage !== "idle"}
                      onClick={() => void sendOtpCode(true)}
                      className="inline-flex items-center gap-1 font-semibold text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50 cursor-pointer"
                      data-testid="otp-resend-button"
                    >
                      <RotateCw className={cn("size-3", resending && "animate-spin")} />
                      <span>{resending ? "Reenviando..." : "Reenviar código"}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={stage !== "idle" && stage !== "sending"}
                  onClick={onCancel}
                  className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                  data-testid="otp-cancel-button"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Voltar e usar outra conta</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
