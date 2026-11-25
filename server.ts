import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Carrega o projectId do Firebase configurado neste app
const firebaseConfigPath = path.join(__dirname, "firebase-applet-config.json");
let FIREBASE_PROJECT_ID = "";
try {
  const rawCfg = fs.readFileSync(firebaseConfigPath, "utf8");
  const parsed = JSON.parse(rawCfg) as { projectId?: string };
  FIREBASE_PROJECT_ID = String(parsed.projectId || "").trim();
} catch (err) {
  console.warn("[server] Não foi possível ler firebase-applet-config.json:", err);
}

// Chave efêmera em memória para assinar tokens de prova de verificação OTP
const OTP_SIGNING_SECRET =
  process.env.OTP_SIGNING_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

const GMAIL_EMAIL_REGEX = /^[a-z0-9._%+-]{1,64}@(gmail|googlemail)\.com$/i;

// ============================================================================
// 1. Verificação de Origem e Token Firebase Google (quando aplicável)
// ============================================================================

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: Record<string, string> = {};
let cachedCertsExpiresAt = 0;

async function getGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && Object.keys(cachedCerts).length > 0 && now < cachedCertsExpiresAt) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Falha ao obter certificados públicos do Google (${res.status})`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  cachedCerts = certs;
  cachedCertsExpiresAt = now + Math.max(60, maxAgeSec) * 1000;
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as T;
}

interface ResolvedOtpIdentity {
  email: string;
  name: string;
  uid: string | null;
}

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<ResolvedOtpIdentity> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error("Projeto Firebase não configurado no servidor.");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Token de autenticação inválido.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(payloadB64);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Algoritmo ou identificador de chave inválido.");
  }

  let certs = await getGooglePublicCerts(false);
  let cert = certs[header.kid];
  if (!cert) {
    certs = await getGooglePublicCerts(true);
    cert = certs[header.kid];
  }
  if (!cert) {
    throw new Error("Certificado público do token não encontrado.");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const sigNormalized = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
  const sigPadded = sigNormalized + "=".repeat((4 - (sigNormalized.length % 4)) % 4);
  const signatureBuf = Buffer.from(sigPadded, "base64");

  if (!verifier.verify(cert, signatureBuf)) {
    throw new Error("Assinatura do token Google inválida.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer) {
    throw new Error("Token não pertence a este projeto.");
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Identificador do usuário ausente no token.");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error("Sessão do Google expirada. Conecte novamente.");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 300) {
    throw new Error("Horário de emissão do token inválido.");
  }
  if (!payload.email || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("A conta Google informada não possui e-mail verificado.");
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: (payload.name || payload.email.split("@")[0] || "Usuário").trim(),
  };
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 20 ? token : null;
}

function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    const expectedHosts = new Set<string>();

    const forwardedHost = String(req.headers["x-forwarded-host"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const directHost = String(req.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase();

    if (forwardedHost) expectedHosts.add(forwardedHost);
    if (directHost) expectedHosts.add(directHost);

    const appUrl = (process.env.APP_URL || "").trim();
    if (appUrl) {
      try {
        expectedHosts.add(new URL(appUrl).host.toLowerCase());
      } catch {
        // ignora APP_URL malformada
      }
    }

    if (expectedHosts.has(originHost)) return true;

    // Quando o proxy reverso do ambiente encaminha para localhost/127.0.0.1 sem X-Forwarded-Host,
    // permite a origem hospedada do próprio aplicativo (*.run.app)
    const isLocalHost =
      directHost.startsWith("localhost:") ||
      directHost.startsWith("127.0.0.1:") ||
      directHost === "localhost" ||
      directHost === "127.0.0.1";
    if (isLocalHost && originUrl.protocol === "https:" && originHost.endsWith(".run.app")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function resolveOtpIdentity(req: Request): Promise<ResolvedOtpIdentity> {
  const token = extractBearerToken(req);
  if (token) {
    return verifyFirebaseGoogleIdToken(token);
  }

  // Fluxo direto de cadastro com @gmail.com (sem popup do Google / sem confirmação no celular)
  const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!rawEmail || rawEmail.length > 120 || !GMAIL_EMAIL_REGEX.test(rawEmail)) {
    const err = new Error(
      "Informe um endereço @gmail.com válido para receber o código de verificação."
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const rawName =
    typeof req.body?.nome === "string" && req.body.nome.trim().length > 0
      ? req.body.nome.trim().slice(0, 120)
      : rawEmail.split("@")[0] || "Usuário";

  return {
    email: rawEmail,
    name: rawName,
    uid: null,
  };
}

// ============================================================================
// 2. Cofre OTP em Memória (Hash + Sal + Expiração + Limite de Tentativas)
// ============================================================================

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 segundos
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_EMAIL_HOUR = 6;
const OTP_MAX_SENDS_PER_IP_HOUR = 12;

interface OtpChallengeRecord {
  email: string;
  uid: string | null;
  salt: string;
  hashHex: string;
  createdAt: number;
  expiresAt: number;
  resendAvailableAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpChallengeRecord>();
const hourlyEmailSendLog = new Map<string, number[]>();
const hourlyIpSendLog = new Map<string, number[]>();

// Limpeza periódica de desafios expirados
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of otpStore.entries()) {
    if (rec.expiresAt <= now) {
      otpStore.delete(key);
    }
  }
  const oneHourAgo = now - 60 * 60 * 1000;
  for (const logMap of [hourlyEmailSendLog, hourlyIpSendLog]) {
    for (const [key, timestamps] of logMap.entries()) {
      const recent = timestamps.filter((t) => t > oneHourAgo);
      if (recent.length === 0) {
        logMap.delete(key);
      } else {
        logMap.set(key, recent);
      }
    }
  }
}, 60 * 1000).unref();

function hashOtpCode(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString("hex");
}

function constantTimeHexEqual(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, "hex");
  const bBuf = Buffer.from(bHex, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function maskEmailAddress(email: string): string {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart) return email;
  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  }
  if (localPart.length <= 4) {
    return `${localPart[0]}**${localPart[localPart.length - 1]}@${domain}`;
  }
  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.slice(-1);
  const stars = "*".repeat(Math.min(6, Math.max(3, localPart.length - 3)));
  return `${visibleStart}${stars}${visibleEnd}@${domain}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createVerificationProofToken(
  email: string,
  uid: string | null,
  verifiedAtIso: string
): string {
  const payload = Buffer.from(
    JSON.stringify({ email, uid, verifiedAt: verifiedAtIso, exp: Date.now() + 5 * 60 * 1000 }),
    "utf8"
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", OTP_SIGNING_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

// ============================================================================
// 3. Envio Real via Gmail SMTP (Nodemailer + Senha de App)
// ============================================================================

function cleanEnvValue(raw: string | undefined): string {
  return (raw || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

function getGmailSmtpConfig(): { user: string; pass: string; fromName: string } | null {
  const user = cleanEnvValue(
    process.env.GMAIL_SMTP_USER || process.env.GMAIL_USER || process.env.SMTP_USER
  );

  // Remove aspas acidentais e espaços (caso a Senha de App tenha sido colada como "xxxx xxxx xxxx xxxx")
  const rawPass = cleanEnvValue(
    process.env.GMAIL_SMTP_APP_PASSWORD ||
      process.env.GMAIL_APP_PASSWORD ||
      process.env.SMTP_PASS
  );
  const pass = rawPass.replace(/\s+/g, "").trim();

  const fromName =
    cleanEnvValue(process.env.GMAIL_SMTP_FROM_NAME) ||
    "CBMMT · Diretoria de Gestão de Pessoas";

  if (!user || !pass) return null;
  return { user, pass, fromName };
}

async function sendOtpEmailViaGmailSmtp(params: {
  toEmail: string;
  recipientName: string;
  code: string;
}): Promise<void> {
  const smtp = getGmailSmtpConfig();
  if (!smtp) {
    const err = new Error(
      "O envio de e-mail via Gmail SMTP ainda não foi configurado no servidor. Defina GMAIL_SMTP_USER e GMAIL_SMTP_APP_PASSWORD (Senha de App do Google) em Settings → Secrets."
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 503;
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  const safeName = escapeHtml(params.recipientName.split(" ")[0] || "Usuário");
  const digits = params.code.split("");

  const html = `
  <!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Código de verificação — CBMMT</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0B111A;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F1F5F9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B111A;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:linear-gradient(145deg,#0E1726 0%,#0C1527 65%,#1C0B12 100%);border:1px solid #1E2C42;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px 28px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#3B82F6;margin-bottom:6px;">
                  CBMMT · Diretoria de Gestão de Pessoas
                </div>
                <h1 style="margin:0;font-size:21px;line-height:1.3;font-weight:800;color:#FFFFFF;">
                  Confirme seu cadastro
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">
                  Olá, <strong style="color:#FFFFFF;">${safeName}</strong>. Recebemos uma solicitação de cadastro no sistema de Gerenciamento de Bombeiros Militares Temporários.
                </p>
                <p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#94A3B8;">
                  Digite o código de 4 dígitos abaixo na tela de acesso para liberar sua conta:
                </p>

                <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:0 auto 22px auto;">
                  <tr>
                    ${digits
                      .map(
                        (digit) => `
                      <td style="padding:0 6px;">
                        <div style="width:54px;height:62px;line-height:62px;text-align:center;font-family:'JetBrains Mono','Courier New',monospace;font-size:28px;font-weight:800;color:#FFFFFF;background-color:#090F1B;border:1px solid #3B82F6;border-radius:12px;">
                          ${escapeHtml(digit)}
                        </div>
                      </td>`
                      )
                      .join("")}
                  </tr>
                </table>

                <p style="margin:0 0 10px 0;font-size:12px;line-height:1.5;color:#94A3B8;text-align:center;">
                  Este código expira em <strong style="color:#E2E8F0;">10 minutos</strong> e é de uso único.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748B;text-align:center;">
                  Se você não solicitou este cadastro, basta ignorar esta mensagem com segurança.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:rgba(9,15,27,0.65);border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:11px;color:#64748B;">
                Corpo de Bombeiros Militar de Mato Grosso · Sistema de Gestão de Temporários
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text = [
    "CBMMT - Diretoria de Gestão de Pessoas",
    "",
    `Olá, ${params.recipientName}.`,
    `Seu código de verificação de 4 dígitos para confirmar seu cadastro é: ${params.code}`,
    "",
    "Este código expira em 10 minutos e é de uso único.",
    "Se você não solicitou este cadastro, ignore este e-mail.",
  ].join("\n");

  const mailPayload = {
    from: `"${smtp.fromName.replace(/[\r\n"]/g, "")}" <${smtp.user}>`,
    to: params.toEmail,
    subject: `${params.code} é seu código de confirmação — CBMMT`,
    text,
    html,
  };

  // Tenta SSL direto (465) e faz fallback automático para STARTTLS (587) em caso de bloqueio de porta
  const primaryTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    await primaryTransporter.sendMail(mailPayload);
  } catch (err: any) {
    if (err?.code === "EAUTH" || err?.responseCode === 535) {
      throw err;
    }
    const fallbackTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
    await fallbackTransporter.sendMail(mailPayload);
  }
}

// ============================================================================
// 4. Servidor Express + Rotas API + Vite Middleware / Build Estático
// ============================================================================

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));

  // Healthcheck
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, smtpConfigured: Boolean(getGmailSmtpConfig()) });
  });

  // POST /api/auth/otp/send — gera e envia código real de 4 dígitos para o Gmail
  app.post("/api/auth/otp/send", async (req: Request, res: Response) => {
    try {
      if (!isSameOriginRequest(req)) {
        res.status(403).json({ detail: "Origem de requisição não autorizada." });
        return;
      }

      const identity = await resolveOtpIdentity(req);
      const email = identity.email;
      const now = Date.now();

      // Verifica primeiro se as credenciais Gmail SMTP estão configuradas
      if (!getGmailSmtpConfig()) {
        res.status(503).json({
          detail:
            "O envio de e-mail via Gmail SMTP ainda não foi configurado no servidor. Defina GMAIL_SMTP_USER e GMAIL_SMTP_APP_PASSWORD (Senha de App do Google) em Settings → Secrets.",
          code: "SMTP_NOT_CONFIGURED",
          maskedEmail: maskEmailAddress(email),
        });
        return;
      }

      // Cooldown de reenvio (30s)
      const existing = otpStore.get(email);
      if (existing && existing.resendAvailableAt > now) {
        const retryAfterSeconds = Math.ceil((existing.resendAvailableAt - now) / 1000);
        res.status(429).json({
          detail: `Aguarde ${retryAfterSeconds}s antes de solicitar um novo código.`,
          code: "OTP_COOLDOWN",
          retryAfterSeconds,
          maskedEmail: maskEmailAddress(email),
        });
        return;
      }

      // Limite horário por endereço e por IP
      const oneHourAgo = now - 60 * 60 * 1000;
      const recentEmailSends = (hourlyEmailSendLog.get(email) || []).filter((t) => t > oneHourAgo);
      if (recentEmailSends.length >= OTP_MAX_SENDS_PER_EMAIL_HOUR) {
        res.status(429).json({
          detail: "Limite de envios atingido para este e-mail. Tente novamente mais tarde.",
          code: "OTP_RATE_LIMITED",
        });
        return;
      }

      const clientIp = req.ip || "unknown";
      const recentIpSends = (hourlyIpSendLog.get(clientIp) || []).filter((t) => t > oneHourAgo);
      if (recentIpSends.length >= OTP_MAX_SENDS_PER_IP_HOUR) {
        res.status(429).json({
          detail: "Muitas solicitações de código deste dispositivo. Aguarde alguns minutos.",
          code: "OTP_RATE_LIMITED",
        });
        return;
      }

      // Gera código aleatório criptograficamente seguro de 4 dígitos
      const code = crypto.randomInt(0, 10000).toString().padStart(4, "0");
      const salt = crypto.randomBytes(16).toString("hex");
      const hashHex = hashOtpCode(code, salt);

      const recipientName =
        typeof req.body?.nome === "string" && req.body.nome.trim().length > 0
          ? req.body.nome.trim().slice(0, 120)
          : identity.name;

      // Envia o e-mail real via Gmail SMTP antes de ativar o desafio
      await sendOtpEmailViaGmailSmtp({
        toEmail: email,
        recipientName,
        code,
      });

      otpStore.set(email, {
        email,
        uid: identity.uid,
        salt,
        hashHex,
        createdAt: now,
        expiresAt: now + OTP_TTL_MS,
        resendAvailableAt: now + OTP_RESEND_COOLDOWN_MS,
        attempts: 0,
      });

      hourlyEmailSendLog.set(email, [...recentEmailSends, now]);
      hourlyIpSendLog.set(clientIp, [...recentIpSends, now]);

      res.json({
        ok: true,
        maskedEmail: maskEmailAddress(email),
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
        resendCooldownSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      });
    } catch (err: any) {
      if (err?.code === "SMTP_NOT_CONFIGURED") {
        res.status(503).json({
          detail: err.message,
          code: "SMTP_NOT_CONFIGURED",
        });
        return;
      }

      if (err?.code === "EAUTH" || err?.responseCode === 535) {
        console.error("[OTP] Falha de autenticação Gmail SMTP:", err?.message || err);
        res.status(502).json({
          detail:
            "O Gmail recusou a autenticação SMTP. Verifique se GMAIL_SMTP_USER é o e-mail correto e se GMAIL_SMTP_APP_PASSWORD é uma Senha de App de 16 caracteres (não a senha comum da conta).",
          code: "SMTP_AUTH_FAILED",
        });
        return;
      }

      console.error("[OTP] Erro ao enviar código:", err?.message || err);
      const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 400;
      res.status(statusCode).json({
        detail: err?.message || "Não foi possível enviar o código de verificação agora.",
        code: err?.code || "OTP_SEND_FAILED",
      });
    }
  });

  // POST /api/auth/otp/verify — valida o código de 4 dígitos digitado
  app.post("/api/auth/otp/verify", async (req: Request, res: Response) => {
    try {
      if (!isSameOriginRequest(req)) {
        res.status(403).json({ detail: "Origem de requisição não autorizada." });
        return;
      }

      const identity = await resolveOtpIdentity(req);
      const email = identity.email;

      const rawCode = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!/^\d{4}$/.test(rawCode)) {
        res.status(400).json({
          detail: "Informe um código numérico válido de 4 dígitos.",
          code: "OTP_INVALID_FORMAT",
        });
        return;
      }

      const record = otpStore.get(email);
      const now = Date.now();

      if (!record || record.expiresAt <= now) {
        otpStore.delete(email);
        res.status(400).json({
          detail: "Código expirado ou inexistente. Solicite um novo código.",
          code: "OTP_EXPIRED",
        });
        return;
      }

      if (record.uid && identity.uid && record.uid !== identity.uid) {
        res.status(403).json({
          detail: "Sessão Google divergente. Reinicie o cadastro.",
          code: "OTP_UID_MISMATCH",
        });
        return;
      }

      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(email);
        res.status(429).json({
          detail: "Número máximo de tentativas excedido. Solicite um novo código.",
          code: "OTP_MAX_ATTEMPTS",
        });
        return;
      }

      const candidateHash = hashOtpCode(rawCode, record.salt);
      const isMatch = constantTimeHexEqual(candidateHash, record.hashHex);

      if (!isMatch) {
        record.attempts += 1;
        const remaining = Math.max(0, OTP_MAX_ATTEMPTS - record.attempts);
        if (remaining === 0) {
          otpStore.delete(email);
          res.status(429).json({
            detail: "Limite de tentativas atingido. Solicite um novo código para continuar.",
            code: "OTP_MAX_ATTEMPTS",
            remainingAttempts: 0,
          });
          return;
        }
        res.status(400).json({
          detail: `Código incorreto. Você ainda tem ${remaining} ${
            remaining === 1 ? "tentativa" : "tentativas"
          }.`,
          code: "OTP_INVALID",
          remainingAttempts: remaining,
        });
        return;
      }

      // Código confirmado: consumo único imediato
      otpStore.delete(email);
      const verifiedAt = new Date().toISOString();
      const verificationToken = createVerificationProofToken(email, identity.uid, verifiedAt);

      res.json({
        ok: true,
        verifiedAt,
        verificationToken,
        maskedEmail: maskEmailAddress(email),
      });
    } catch (err: any) {
      console.error("[OTP] Erro ao verificar código:", err?.message || err);
      const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 400;
      res.status(statusCode).json({
        detail: err?.message || "Não foi possível validar o código informado.",
        code: "OTP_VERIFY_FAILED",
      });
    }
  });

  // Montagem do Vite em dev ou arquivos estáticos em produção
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CBMMT] Servidor ativo em http://0.0.0.0:${PORT} (${IS_PROD ? "prod" : "dev"})`);
  });
}

startServer().catch((err) => {
  console.error("[CBMMT] Erro fatal ao iniciar servidor:", err);
  process.exit(1);
});
