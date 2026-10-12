"use client";

import ErrorPage from "./error";
import "./globals.css";

export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr">
      <head><title>BienDecider</title></head>
      <body><ErrorPage {...props} /></body>
    </html>
  );
}