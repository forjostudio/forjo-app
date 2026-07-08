import type { NextConfig } from "next";

// Patrón de next/image para el bucket público de Supabase Storage donde viven las imágenes
// del landing (bucket `landing-assets`, F6). Se DERIVA en runtime de NEXT_PUBLIC_SUPABASE_URL
// (protocolo + host + puerto) para no hardcodear nada: prod (`https://<ref>.supabase.co`) y
// Supabase LOCAL de dev (`http://127.0.0.1:54321`) quedan ambos soportados con el mismo patrón.
// Antes se hardcodeaba `protocol: "https"`, lo que rechazaba las imágenes del Supabase local
// (http) y rompía el render de fotos en `npm run dev`. Si la env no está disponible en el build,
// se omite el patrón en vez de tirar (new URL(undefined) lanzaría) — fail-safe.
function supabaseImagePattern() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      // '' (puerto default del protocolo) → undefined; el local usa :54321.
      port: u.port || undefined,
      pathname: "/storage/v1/object/public/landing-assets/**",
    } as const;
  } catch {
    return null;
  }
}

const imagePattern = supabaseImagePattern();

const nextConfig: NextConfig = {
  // Pitfall 1: next/image con una URL remota rompe en runtime salvo que el host esté en
  // images.remotePatterns. Habilitamos SOLO el bucket público landing-assets de Supabase
  // (Opción A: CLS/LCP correcto, habilita SEO de la Fase 9). El `pathname` acota a ese
  // bucket como defensa extra (ningún otro host/path remoto queda permitido).
  // NO se agrega caching ni 'use cache' acá: el constraint de Phase 6 sobre caching sigue
  // vigente; esta config solo toca `images`.
  images: imagePattern ? { remotePatterns: [imagePattern] } : undefined,
};

export default nextConfig;
