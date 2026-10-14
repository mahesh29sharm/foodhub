import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";

const site = (process.env.EXPO_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const shareImage = `${site}/chatako-food-deals-hero.jpg`;

export default function Html({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Chatako – Good food. Better deals.</title>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover"
        />
        <meta name="theme-color" content="#ef5a31" />
        <meta
          name="description"
          content="Discover delicious food deals around you with Chatako. Reserve now, pick up or dine in."
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Chatako" />
        <meta property="og:title" content="Good food. Better deals." />
        <meta
          property="og:description"
          content="Discover delicious deals around you. Reserve now, pick up or dine in."
        />
        <meta property="og:image" content={shareImage} />
        <meta property="og:image:alt" content="Indian street-food deals on Chatako" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Good food. Better deals." />
        <meta
          name="twitter:description"
          content="Discover delicious deals around you. Reserve now, pick up or dine in."
        />
        <meta name="twitter:image" content={shareImage} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
