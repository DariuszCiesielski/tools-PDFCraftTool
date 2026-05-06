/**
 * Web App Manifest Generation
 * Configures PWA settings for the application
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

// Required for static export
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: 'PDFCraft AIwB',
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    orientation: 'portrait-primary',
    categories: ['productivity', 'utilities'],
    lang: 'pl',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/home.png',
        sizes: '1280x720',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Scal PDF',
        short_name: 'Scal',
        description: 'Połącz wiele plików PDF w jeden',
        url: '/pl/tools/merge-pdf',
        icons: [{ src: '/icons/merge.png', sizes: '96x96' }],
      },
      {
        name: 'Podziel PDF',
        short_name: 'Podziel',
        description: 'Rozdziel PDF na kilka plików',
        url: '/pl/tools/split-pdf',
        icons: [{ src: '/icons/split.png', sizes: '96x96' }],
      },
      {
        name: 'Kompresja PDF',
        short_name: 'Kompresuj',
        description: 'Zmniejsz rozmiar pliku PDF',
        url: '/pl/tools/compress-pdf',
        icons: [{ src: '/icons/compress.png', sizes: '96x96' }],
      },
    ],
  };
}
