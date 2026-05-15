/**
 * /app/auth/accept-invite/page.tsx
 *
 * Fluxo completo:
 * 1. Supabase envia email → link com #access_token=...&type=invite
 * 2. Extrai token do hash (client-only — hashes nunca vão ao server)
 * 3. setSession() temporária → usuário define senha → updateUser()
 * 4. Redirect → /dashboard
 *
 * Edge cases tratados:
 * - Token ausente, expirado ou tipo errado → estado invalid_token
 * - Senha fraca → blocked no client (sem round-trip)
 * - Mismatch confirmação → inline error
 * - Double submit → loading lock
 * - Hydration-safe: window só lido dentro de useEffect
 *
 * Design: tokens reais do globals.css — DM Sans, CSS vars, 3 temas.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, WarningCircle, Envelope } from "@phosphor-icons/react";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput, getPasswordStrength } from "@/components/auth/PasswordInput";

type PageState =
  | { status: "loading" }
  | { status: "invalid_token" }
  | { status: "ready"; email: string }
  | { status: "submitting" }
  | { status: "success" };

export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = createClient();

  const [pageState, setPageState] = useState<PageState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // ─── Extrai e valida token do hash (client-only) ──────────────────────────
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token") ?? "";
    const type = params.get("type");

    if (!accessToken || type !== "invite") {
      setPageState({ status: "invalid_token" });
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.user) {
          setPageState({ status: "invalid_token" });
        } else {
          setPageState({ status: "ready", email: data.user.email ?? "" });
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Validação client-side ────────────────────────────────────────────────
  const validate = useCallback((): string | null => {
    if (getPasswordStrength(password) < 3)
      return "A senha precisa ser mais forte. Use letras maiúsculas, números ou símbolos.";
    if (password !== confirmPassword)
      return "As senhas não coincidem.";
    return null;
  }, [password, confirmPassword]);

  // ─── Submit ───────────────────────────────────────────────────────────────
 const handleSubmit = useCallback(
  async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    const err = validate();
    if (err) { setFieldError(err); return; }

    const currentEmail = pageState.status === "ready" ? pageState.email : "";

    setPageState({ status: "submitting" });

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPageState({ status: "ready", email: currentEmail });
      setFieldError("Erro ao definir senha. O link pode ter expirado — peça um novo convite.");
      return;
    }

    setPageState({ status: "success" });
    setTimeout(() => router.replace("/dashboard"), 2000);
  },
  [password, validate, pageState, supabase, router]
);

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (pageState.status === "loading") {
    return (
      <AuthCard title="Verificando convite..." subtitle="Aguarde um momento.">
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  // ─── Token inválido ───────────────────────────────────────────────────────
  if (pageState.status === "invalid_token") {
    return (
      <AuthCard
        title="Link inválido ou expirado"
        subtitle="Este convite não é mais válido. Links expiram em 24 horas por segurança."
        icon={<WarningCircle size={30} weight="duotone" />}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 4 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
            Peça ao administrador para reenviar o convite.
          </p>
          <a
            href="mailto:suporte@sakel.app"
            className="btn-primary"
            style={{ textDecoration: "none", fontSize: 13 }}
          >
            <Envelope size={15} /> Falar com suporte
          </a>
        </div>
      </AuthCard>
    );
  }

  // ─── Sucesso ──────────────────────────────────────────────────────────────
  if (pageState.status === "success") {
    return (
      <AuthCard
        title="Conta ativada!"
        subtitle="Sua senha foi definida. Redirecionando para o dashboard..."
        icon={<CheckCircle size={30} weight="duotone" />}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <Spinner color="var(--success)" />
        </div>
      </AuthCard>
    );
  }

  // ─── Formulário principal ─────────────────────────────────────────────────
  const isSubmitting = pageState.status === "submitting";
  const email = pageState.status === "ready" ? pageState.email : "";

  return (
    <AuthCard
      title="Bem-vindo ao Sakel"
      subtitle="Você foi convidado. Defina sua senha para ativar a conta."
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Email read-only — contexto visual */}
        {email && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
            }}
          >
            <Envelope size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email}
            </span>
          </div>
        )}

        <PasswordInput
          label="Nova senha"
          value={password}
          onChange={setPassword}
          showStrengthMeter
          disabled={isSubmitting}
        />

        <PasswordInput
          label="Confirmar senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={isSubmitting}
          placeholder="Repita a senha"
        />

        {fieldError && <InlineError message={fieldError} />}

        <SubmitButton loading={isSubmitting} disabled={!password || !confirmPassword}>
          Ativar conta
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

// ─── Componentes utilitários internos ─────────────────────────────────────────

function Spinner({ color = "var(--primary)" }: { color?: string }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        border: `2px solid ${color}22`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        fontSize: 13,
        color: "var(--danger)",
        background: "var(--danger-light)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        margin: 0,
        lineHeight: 1.5,
        opacity: 0.95,
      }}
    >
      {message}
    </p>
  );
}

function SubmitButton({
  loading,
  disabled,
  children,
}: {
  loading: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="btn-primary"
      style={{
        marginTop: 4,
        width: "100%",
        padding: "11px 16px",
        fontSize: 14,
        opacity: loading || disabled ? 0.5 : 1,
        cursor: loading || disabled ? "not-allowed" : "pointer",
        transform: "none", // override btn-primary hover enquanto disabled
      }}
    >
      {loading ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <Spinner color="#fff" />
          Aguarde...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
