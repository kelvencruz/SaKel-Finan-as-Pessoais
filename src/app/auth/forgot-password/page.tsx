"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Envelope, ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { AuthCard } from "@/components/auth/AuthCard";

type PageState = "idle" | "submitting" | "sent";

const RATE_LIMIT_SECONDS = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail]           = useState("");
  const [pageState, setPageState]   = useState<PageState>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [cooldown, setCooldown]     = useState(0);
  const cooldownRef                 = useRef<NodeJS.Timeout | null>(null);

  const startCooldown = useCallback(() => {
    let remaining = RATE_LIMIT_SECONDS;
    setCooldown(remaining);
    cooldownRef.current = setInterval(() => {
      remaining -= 1;
      setCooldown(remaining);
      if (remaining <= 0) {
        clearInterval(cooldownRef.current!);
        setCooldown(0);
      }
    }, 1000);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFieldError(null);

      if (!EMAIL_REGEX.test(email)) {
        setFieldError("Insira um endereço de email válido.");
        return;
      }
      if (cooldown > 0) return;

      setPageState("submitting");

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`;

      await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      setPageState("sent");
      startCooldown();
    },
    [email, cooldown, supabase, startCooldown]
  );

  if (pageState === "sent") {
    return (
      <AuthCard
        title="Verifique seu email"
        subtitle="Se este endereço estiver cadastrado, você receberá as instruções em breve."
        icon={<CheckCircle size={30} weight="duotone" />}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 4 }}>
          <div style={{ width: "100%", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px", textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{email}</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
            Não encontrou? Verifique a pasta de spam ou aguarde alguns minutos.
          </p>
          <button
            type="button"
            onClick={() => setPageState("idle")}
            disabled={cooldown > 0}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: cooldown > 0 ? "var(--text-muted)" : "var(--primary)", cursor: cooldown > 0 ? "default" : "pointer", fontFamily: "var(--font-main)" }}
          >
            {cooldown > 0 ? `Reenviar disponível em ${cooldown}s` : "Não recebi — tentar novamente"}
          </button>
        </div>
      </AuthCard>
    );
  }

  const isSubmitting = pageState === "submitting";

  return (
    <AuthCard
      title="Recuperar acesso"
      subtitle="Informe seu email e enviaremos um link para redefinir a senha."
      icon={<Envelope size={28} weight="duotone" />}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Email
          </label>
          <div style={{ position: "relative" }}>
            <Envelope size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
              placeholder="seu@email.com"
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              style={{ width: "100%", paddingLeft: 40, paddingRight: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14, borderRadius: "var(--radius-md)", opacity: isSubmitting ? 0.5 : 1 }}
            />
          </div>
        </div>

        {fieldError && (
          <p role="alert" style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: "10px 14px", margin: 0 }}>
            {fieldError}
          </p>
        )}

        <button type="submit" disabled={isSubmitting || !email} className="btn-primary"
          style={{ marginTop: 4, width: "100%", padding: "11px 16px", fontSize: 14, opacity: isSubmitting || !email ? 0.5 : 1, cursor: isSubmitting || !email ? "not-allowed" : "pointer" }}>
          {isSubmitting ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
              Enviando...
            </span>
          ) : "Enviar link de recuperação"}
        </button>

        <Link href="/auth/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginTop: 4 }}>
          <ArrowLeft size={14} /> Voltar para o login
        </Link>
      </form>
    </AuthCard>
  );
}