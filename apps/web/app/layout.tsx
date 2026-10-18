import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "TFL Studio", template: "%s · TFL Studio" },
  description: "Centro de operaciones interno de TFL Studio",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const p=JSON.parse(localStorage.getItem('tfl-studio-preferences')||'{}');const theme=['light','dark','system'].includes(p.theme)?p.theme:'system';document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;if(['blue','cyan','violet'].includes(p.accent))document.documentElement.dataset.accent=p.accent;if(['comfortable','compact'].includes(p.density))document.documentElement.dataset.density=p.density;}catch{}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
