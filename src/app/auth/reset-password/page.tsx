"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LockKey, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordInput, getPasswordStrength } from "@/components/auth/PasswordInput";

type PageState =
  | { status: "loading" }
  | { status: "invalid_token" }
  | { status: "ready" }
  | { status: "submitting" }
  | { status: "success" };

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [pageState, setPageState]           = useState<PageState>({ status: "loading" });
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError]         = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token") ?? "";
    const type = params.get("type");

    if (!accessToken || type !== "recovery") {
      setPageState({ status: "invalid_token" });
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        setPageState(error ? { status: "invalid_token" } : { status: "ready" });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = useCallback((): string | null => {
    if (getPasswordStrength(password) < 3)
      return "Escolha uma senha mais forte. Use maiúsculas, números ou símbolos.";
    if (password !== confirmPassword)
      return "As senhas não coincidem.";
    return null;
  }, [password, confirmPassword]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFieldError(null);

      const err = validate();
      if (err) { setFieldError(err); return; }

      setPageState({ status: "submitting" });

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setPageState({ status: "ready" });
        setFieldError("Não foi possível redefinir a senha. O link pode ter expirado.");
        return;
      }

      setPageState({ status: "success" });
      setTimeout(() => router.replace("/dashboard"), 2000);
    },
    [password, validate, supabase, router]
  );

  if (pageState.status === "loading") {
    return (
      <AuthCard title="Verificando link..." subtitle="Aguarde um momento.">
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  if (pageState.status === "invalid_token") {
    return (
      <AuthCard
        title="Link inválido ou expirado"
        subtitle="Links de recuperação expiram em 1 hora por segurança."
        icon={<WarningCircle size={30} weight="duotone" />}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 4 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
            Solicite um novo link para continuar.
          </p>
          <a href="/auth/forgot-password" className="btn-primary"
            style={{ textDecoration: "none", width: "100%", textAlign: "center", fontSize: 14, padding: "11px 16px" }}>
            Solicitar novo link
          </a>
        </div>
      </AuthCard>
    );
  }

  if (pageState.status === "success") {
    return (
      <AuthCard
        title="Senha redefinida!"
        subtitle="Sua senha foi atualizada. Redirecionando..."
        icon={<CheckCircle size={30} weight="duotone" />}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <Spinner color="var(--success)" />
        </div>
      </AuthCard>
    );
  }

  const isSubmitting = pageState.status === "submitting";

  return (
    <AuthCard
      title="Redefinir senha"
      subtitle="Escolha uma nova senha para sua conta."
      icon={<LockKey size={28} weight="duotone" />}
    >
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <PasswordInput
          label="Nova senha"
          value={password}
          onChange={setPassword}
          showStrengthMeter
          disabled={isSubmitting}
        />

        <PasswordInput
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={isSubmitting}
          placeholder="Repita a nova senha"
        />

        {fieldError && (
          <p role="alert" style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: "10px 14px", margin: 0, lineHeight: 1.5 }}>
            {fieldError}
          </p>
        )}

        <button type="submit" disabled={isSubmitting || !password || !confirmPassword}
          className="btn-primary"
          style={{ marginTop: 4, width: "100%", padding: "11px 16px", fontSize: 14, opacity: isSubmitting || !password || !confirmPassword ? 0.5 : 1, cursor: isSubmitting || !password || !confirmPassword ? "not-allowed" : "pointer" }}>
          {isSubmitting ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
              Salvando...
            </span>
          ) : "Redefinir senha"}
        </button>
      </form>
    </AuthCard>
  );
}

function Spinner({ color = "var(--primary)" }: { color?: string }) {
  return (
    <div style={{ width: 22, height: 22, border: `2px solid color-mix(in srgb, ${color} 20%, transparent)`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
  );
}