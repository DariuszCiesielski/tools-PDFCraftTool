/**
 * Site configuration
 */
export const siteConfig = {
  name: 'PDFCraft AIwBiznesie',
  description: 'Profesjonalne narzędzia PDF — darmowe, prywatne, działające w przeglądarce. Scalaj, dziel, kompresuj, konwertuj i edytuj pliki PDF online bez wysyłania ich na serwer.',
  url: 'https://access-manager-tools-pdfcraft.vercel.app',
  ogImage: '/images/og-image.png',
  links: {
    github: 'https://github.com/DariuszCiesielski/tools-PDFCraftTool',
    twitter: 'https://twitter.com/aiwbiznesie',
  },
  creator: 'AIwBiznesie (Dariusz Ciesielski)',
  keywords: [
    'narzędzia PDF',
    'edytor PDF',
    'scal PDF',
    'podziel PDF',
    'kompresja PDF',
    'konwersja PDF',
    'darmowe narzędzia PDF',
    'edytor PDF online',
    'PDF w przeglądarce',
    'prywatne przetwarzanie PDF',
  ],
  // SEO-related settings
  seo: {
    titleTemplate: '%s | PDFCraft AIwBiznesie',
    defaultTitle: 'PDFCraft AIwBiznesie — profesjonalne narzędzia PDF',
    twitterHandle: '@aiwbiznesie',
    locale: 'pl_PL',
  },
};

/**
 * Navigation configuration
 */
export const navConfig = {
  mainNav: [
    { title: 'Home', href: '/' },
    { title: 'Tools', href: '/tools' },
    { title: 'About', href: '/about' },
    { title: 'FAQ', href: '/faq' },
  ],
  footerNav: [
    { title: 'Privacy', href: '/privacy' },
    { title: 'Terms', href: '/terms' },
    { title: 'Contact', href: '/contact' },
  ],
};
