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

        {/* Aplica dark mode antes do render para evitar flash
            Enquanto o Supabase não responde, assume dark (padrão do produto) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              document.documentElement.setAttribute('data-theme', 'dark');
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