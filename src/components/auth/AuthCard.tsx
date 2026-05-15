/**
 * AuthCard — layout compartilhado de auth do Sakel.
 *
 * Usa os tokens reais do globals.css:
 *  - Fonte: DM Sans via --font-main
 *  - Cores: --bg, --surface, --border, --text, --text-secondary, --primary
 *  - Raios: --radius-xl, --radius-lg
 *  - Sombras: --card-shadow-lg
 *  - Animações: animate-fade-up / animate-scale-in (já definidas no globals.css)
 *
 * Funciona nos 3 temas: light · dark · arcade
 */

import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  icon?: ReactNode;
}

export function AuthCard({ title, subtitle, children, icon }: AuthCardProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        fontFamily: "var(--font-main)",
        transition: "background-color .25s ease",
        position: "relative",
      }}
    >
      {/*
        Grid decorativo — ativo no tema arcade via globals.css (body::before),
        mas aqui adicionamos um sutil também para light/dark como fundo de auth.
        Opacity baixíssima para não poluir no light mode.
      */}
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "fixed",
          inset: 0,
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          opacity: 0.4,
          zIndex: 0,
        }}
      />

      {/* Logo wordmark */}
      <div
        className="animate-fade-up"
        style={{
          marginBottom: 32,
          display: "flex",
          alignItems: "center",
          gap: 8,
          position: "relative",
          zIndex: 1,
          animationDelay: "0ms",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          sakel
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            border: "1px solid var(--border-md)",
            borderRadius: "var(--radius-xs)",
            padding: "2px 6px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          beta
        </span>
      </div>

      {/* Card */}
      <div
        className="animate-scale-in card-elevated"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 440,
          animationDelay: "60ms",
        }}
      >
        {/* Linha de destaque no topo — sutil, usa --primary */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: 1,
            background:
              "linear-gradient(90deg, transparent, var(--primary), transparent)",
            opacity: 0.5,
            borderRadius: "var(--radius-full)",
          }}
        />

        <div style={{ padding: "36px 32px" }}>
          {/* Header */}
          <div
            style={{
              marginBottom: 28,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 8,
            }}
          >
            {icon && (
              <div
                style={{
                  marginBottom: 4,
                  color: "var(--primary)",
                  opacity: 0.8,
                }}
              >
                {icon}
              </div>
            )}
            <h1
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text)",
                letterSpacing: "-0.02em",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.6,
                maxWidth: 300,
              }}
            >
              {subtitle}
            </p>
          </div>

          {children}
        </div>
      </div>

      {/* Footer */}
      <p
        className="animate-fade-up"
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: 28,
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "center",
          animationDelay: "120ms",
        }}
      >
        © {new Date().getFullYear()} Sakel Finanças · Todos os direitos reservados
      </p>
    </main>
  );
}
