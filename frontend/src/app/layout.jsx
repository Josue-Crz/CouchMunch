import "./globals.css";
import favicon from "./static/cuteBurgerFaviRounded.png";

export const metadata = {
  title: "CouchMunch",
  description: "AI-powered nearby meal combo recommendations.",
  icons: {
    icon: favicon.src,
    shortcut: favicon.src,
    apple: favicon.src
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
