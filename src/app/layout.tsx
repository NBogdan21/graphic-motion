import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { LogoIntro } from '@/components/motion/LogoIntro';
import { MotionBackground } from '@/components/motion/MotionBackground';
import { siteMotion } from '@/config/motion';
import { bootScript, motionStyleVars } from '@/motion/boot';
import { defaultMotionConfig, mergeMotionConfig } from '@/motion/config';
import './globals.css';

const sans = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-sans',
  display: 'swap',
});

// Greek subset: the data layer uses λ, σ, Δ.
const mono = JetBrains_Mono({
  subsets: ['latin', 'greek'],
  variable: '--font-mono',
  display: 'swap',
});

const motion = mergeMotionConfig(defaultMotionConfig, siteMotion);

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'KickMath — Built on analysis, driven by discipline.',
  description: 'KickMath brand intro.',
  openGraph: {
    title: 'KickMath',
    description: 'Built on analysis, driven by discipline.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: motion.colors.background,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <style id="km-motion-vars" dangerouslySetInnerHTML={{ __html: motionStyleVars(motion) }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript(motion) }} />
      </head>
      <body>
        <MotionBackground />
        <div className="km-site">
          <main id="main">{children}</main>
        </div>
        <LogoIntro />
      </body>
    </html>
  );
}
