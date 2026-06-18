import type { NextConfig } from "next";

// Host del bucket público de Supabase Storage donde viven las imágenes del landing
// (bucket `landing-assets`, F6). Se deriva en runtime de NEXT_PUBLIC_SUPABASE_URL
// (formato `<PROJECT-REF>.supabase.co`) para no hardcodear el project-ref. Si la env no
// está disponible en el build, se omite el patrón en vez de tirar (new URL(undefined)
// lanzaría y rompería el build entero) — fail-safe.
function supabaseStorageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const storageHost = supabaseStorageHost();

const nextConfig: NextConfig = {
  // Pitfall 1: next/image con una URL remota rompe en runtime salvo que el host esté en
  // images.remotePatterns. Habilitamos SOLO el bucket público landing-assets de Supabase
  // (Opción A: CLS/LCP correcto, habilita SEO de la Fase 9). El `pathname` acota a ese
  // bucket como defensa extra (ningún otro host/path remoto queda permitido).
  // NO se agrega caching ni 'use cache' acá: el constraint de Phase 6 sobre caching sigue
  // vigente; esta config solo toca `images`.
  images: storageHost
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: storageHost,
            pathname: "/storage/v1/object/public/landing-assets/**",
          },
        ],
      }
    : undefined,
};

export default nextConfig;
