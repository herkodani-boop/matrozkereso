import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { SiteNavbar } from '@/components/site-navbar'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const shareTitle = 'Matrózkereső – vitorlás csapatok és szabad helyek a Balatonon'
const siteDescription =
  'Nagyhajós vitorlázás: szervezd a csapatodat, kövesd, ki jön a következő versenyre, vagy találj szabad helyet egy hajón. Kezdőként is.'

export const metadata: Metadata = {
  // A megosztási kép abszolút címéhez kell; a getAppBaseUrl-lel azonos alapértelmezéssel.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL && !/localhost|127\.0\.0\.1/i.test(process.env.NEXT_PUBLIC_APP_URL) ? process.env.NEXT_PUBLIC_APP_URL : 'https://www.matrozkereso.com'),
  title: 'Matrózkereső – Találd meg a csapatod',
  description: siteDescription,
  // Facebook, Messenger, WhatsApp és társaik előnézete: a balatoni fotó a címmel.
  openGraph: {
    type: 'website',
    locale: 'hu_HU',
    siteName: 'Matrózkereső',
    // A kép már mondja a "Találd meg a csapatod"-ot; a link címe kiegészíti, nem ismétli.
    title: shareTitle,
    description: siteDescription,
    // A ?v= a Facebook képgyorsítótára miatt: a kép cseréjekor növelni kell.
    images: [{ url: '/og-image.jpg?v=3', width: 1200, height: 630, alt: 'Vitorlás versenyhajók a Balatonon, Tihany előtt' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: shareTitle,
    description: siteDescription,
    images: ['/og-image.jpg?v=3'],
  },
  // A ?v= a böngészők favicon-gyorsítótára miatt: a logó cseréjekor növelni kell.
  icons: {
    icon: [
      {
        url: '/logo-mark.svg?v=2',
        type: 'image/svg+xml',
      },
      {
        url: '/logo-mark.png?v=2',
        type: 'image/png',
      },
    ],
    apple: '/logo-mark.png?v=2',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="hu" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <SiteNavbar />
          {children}
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
