import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/contexts/ThemeContext'

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
        {/* Favicon */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Script inline: aplica tema ANTES do render para evitar flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var saved = localStorage.getItem('sakel-theme');
              if (saved === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
              } else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
