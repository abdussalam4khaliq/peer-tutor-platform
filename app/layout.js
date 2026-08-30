import "./globals.css";

export const metadata = {
  title: "Peer Tutor Platform",
  description: "Online learning & peer-tutoring platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
