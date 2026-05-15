"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput, getPasswordStrength } from "@/components/auth/PasswordInput";
import { CheckCircle, WarningCircle, Lock } from "@phosphor-icons/react";

type Status = "idle" | "loading" | "success" | "error";

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const INITIAL_FORM: FormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

interface Props {
  email: string;
}

export function ChangePasswordForm({ email }: Props) {
  const supabase = createClient();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const newPasswordStrength = getPasswordStrength(form.newPassword);
  const passwordsMatch =
    form.newPassword.length > 0 && form.newPassword === form.confirmPassword;
  const passwordsMismatch =
    form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword;

  const isSubmittable =
    form.currentPassword.length > 0 &&
    newPasswordStrength >= 2 &&
    passwordsMatch &&
    status !== "loading";

  // onChange compatível com PasswordInput que recebe (value: string) => void
  function handleField(field: keyof FormState) {
    return (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (status === "error") {
        setStatus("idle");
        setErrorMsg("");
      }
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSubmittable) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      // Regra inviolável #12 — confirma identidade antes de qualquer updateUser
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: form.currentPassword,
      });

      if (signInError) {
        setStatus("error");
        setErrorMsg("Senha atual incorreta.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: form.newPassword,
      });

      if (updateError) {
        setStatus("error");
        const isSamePassword =
          updateError.message.toLowerCase().includes("same password") ||
          updateError.message.toLowerCase().includes("different from");
        setErrorMsg(
          isSamePassword
            ? "A nova senha não pode ser igual à senha atual."
            : "Erro ao atualizar a senha. Tente novamente."
        );
        return;
      }

      // Encerra sessões em outros dispositivos — mantém a sessão atual ativa
      await supabase.auth.signOut({ scope: "others" });

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch {
      setStatus("error");
      setErrorMsg("Erro inesperado. Tente novamente.");
    }
  }

  if (status === "success") {
    return (
      <div className="change-password-success">
        <CheckCircle size={32} weight="duotone" className="success-icon" />
        <div>
          <p className="success-title">Senha atualizada</p>
          <p className="success-desc">
            Outras sessões abertas foram encerradas por segurança.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => setStatus("idle")}>
          Alterar novamente
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="change-password-form" noValidate>
      <div className="field-group">
        <label className="field-label" htmlFor="currentPassword">
          Senha atual
        </label>
        <PasswordInput
          id="currentPassword"
          value={form.currentPassword}
          onChange={handleField("currentPassword")}
          placeholder="••••••••"
          autoComplete="current-password"
          showStrength={false}
          disabled={status === "loading"}
        />
      </div>

      <div className="field-divider" />

      <div className="field-group">
        <label className="field-label" htmlFor="newPassword">
          Nova senha
        </label>
        <PasswordInput
          id="newPassword"
          value={form.newPassword}
          onChange={handleField("newPassword")}
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          showStrength={true}
          disabled={status === "loading"}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="confirmPassword">
          Confirmar nova senha
        </label>
        <PasswordInput
          id="confirmPassword"
          value={form.confirmPassword}
          onChange={handleField("confirmPassword")}
          placeholder="Repita a nova senha"
          autoComplete="new-password"
          showStrength={false}
          disabled={status === "loading"}
          aria-invalid={passwordsMismatch}
          aria-describedby={passwordsMismatch ? "confirm-error" : undefined}
        />
        {passwordsMismatch && (
          <p id="confirm-error" className="field-error" role="alert">
            As senhas não coincidem.
          </p>
        )}
        {passwordsMatch && (
          <p className="field-success" aria-live="polite">
            <CheckCircle size={14} weight="fill" /> As senhas coincidem.
          </p>
        )}
      </div>

      {status === "error" && errorMsg && (
        <div className="form-error-banner" role="alert">
          <WarningCircle size={16} weight="fill" />
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={!isSubmittable}
        aria-busy={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Verificando...
          </>
        ) : (
          <>
            <Lock size={16} weight="duotone" />
            Atualizar senha
          </>
        )}
      </button>

      <p className="security-note">
        Após a troca, outras sessões abertas serão encerradas automaticamente.
      </p>
    </form>
  );
}
