/**
 * PasswordInput — reutilizável, usa tokens do globals.css do Sakel.
 *
 * O globals.css já define estilos base para `input`:
 *   background: var(--surface)
 *   border: 1px solid var(--border-md)
 *   focus → border: var(--primary) + box-shadow: 0 0 0 3px var(--primary-glow)
 *
 * Então NÃO overridamos essas regras — deixamos o tema agir naturalmente.
 * Funciona em light, dark e arcade sem nenhum ajuste extra.
 *
 * Strength meter: 4 segmentos, coloridos com as semânticas do design system.
 */

"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useState, useId } from "react";

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, Math.max(1, score)) as PasswordStrength;
}

// Usa as vars semânticas do design system — funciona nos 3 temas
const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { label: string; color: string; segments: number }
> = {
  0: { label: "",            color: "var(--border-md)",  segments: 0 },
  1: { label: "Muito fraca", color: "var(--danger)",     segments: 1 },
  2: { label: "Fraca",       color: "var(--warning)",    segments: 2 },
  3: { label: "Boa",         color: "var(--info)",       segments: 3 },
  4: { label: "Forte",       color: "var(--success)",    segments: 4 },
};

interface PasswordInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showStrengthMeter?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

export function PasswordInput({
  id: externalId,
  label,
  value,
  onChange,
  showStrengthMeter = false,
  disabled = false,
  autoComplete = "new-password",
  placeholder = "••••••••",
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const strengthId = `${id}-strength`;

  const strength = showStrengthMeter ? getPasswordStrength(value) : 0;
  const config = STRENGTH_CONFIG[strength];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>

      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={showStrengthMeter && value ? strengthId : undefined}
          style={{
            width: "100%",
            padding: "10px 44px 10px 14px",
            fontSize: 14,
            borderRadius: "var(--radius-md)",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "text",
            // border, bg, color, focus ring — todos herdados do globals.css
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            padding: 4,
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            borderRadius: "var(--radius-xs)",
          }}
        >
          {show ? <EyeSlash size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {/* Strength meter */}
      {showStrengthMeter && value && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          <div style={{ display: "flex", gap: 4 }} aria-hidden>
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: "var(--radius-full)",
                  backgroundColor:
                    seg <= config.segments ? config.color : "var(--border)",
                  transition: "background-color .3s ease",
                }}
              />
            ))}
          </div>
          <p
            id={strengthId}
            aria-live="polite"
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Força:{" "}
            <span style={{ color: config.color, fontWeight: 500 }}>
              {config.label}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
