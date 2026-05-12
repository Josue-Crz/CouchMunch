import "./globals.css";

export const metadata = {
  title: "CouchMunch",
  description: "AI-powered nearby meal combo recommendations."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
