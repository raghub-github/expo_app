import '../styles/globals.css';
import { Poppins } from 'next/font/google';

const poppins = Poppins({
  weight: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'GatiMitra — Fast food , Parcel delivery and Safe riding service',
  description: 'Fast, Safe & Reliable Deliveries. Food • Parcel • Person — One platform for all local deliveries.',
  icons: {
    icon: '/fav.png',
    apple: '/favicon-192.svg',
    shortcut: '/favicon-192.svg',
  },
};

export const viewport = {
  themeColor: '#FF4D4D',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
        />
      </head>
      <body className={poppins.className}>{children}</body>
    </html>
  );
}