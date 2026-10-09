import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

// Dashboard typefaces (design system: /dashboard/design-system). Self-hosted at build time like Poppins.
export const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-plex-sans' });
export const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-plex-mono' });

/** Put on the root element of an internal page: sets both font variables and the UI face. */
export const dashboardFonts = `${plexSans.variable} ${plexMono.variable} font-ui`;
