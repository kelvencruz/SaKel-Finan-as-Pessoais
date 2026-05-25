// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SaKel Finanças',
  description: 'Controle financeiro inteligente e elegante. Organize receitas, despesas, cartões e faturas em um só lugar.',
  openGraph: {
    title: 'SaKel Finanças',
    description: 'Controle financeiro inteligente e elegante.',
    siteName: 'SaKel Finanças',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Aplica tema antes do render — zero flash branco ao navegar entre rotas.
            Lê localStorage primeiro; fallback 'dark' para primeira visita. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme  = localStorage.getItem('sakel-theme')   || 'dark';
              var uiMode = localStorage.getItem('sakel-ui-mode') || 'standard';
              document.documentElement.setAttribute('data-theme',   theme);
              document.documentElement.setAttribute('data-ui-mode', uiMode);
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}