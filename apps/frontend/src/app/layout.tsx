import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Brainbridge | Real-Time Mentor-Student Coding Platform",
  description:
    "A premium 1-on-1 mentor-student platform with real-time collaborative code editing, video calls, and session management powered by Supabase and Socket.IO.",
  keywords: "mentor, student, coding, collaboration, real-time, code editor, video call",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
