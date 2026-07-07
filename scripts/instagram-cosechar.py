#!/usr/bin/env python3
# Origen: webs-cms-forjostudio/scripts/instagram-cosechar.py — copia intencional y self-contained
# portada a forjo-app para que la skill forjo-web-builder NO dependa del repo hermano en runtime.
# Mantener la sincronia con el original es MANUAL (fuera de scope este milestone v0.16).
"""
Consolida la descarga de instaloader de un perfil en datos usables por la skill
forjo-web-builder. Lee los .json.xz (metadata comprimida de cada post) + las imagenes
y produce, en la MISMA carpeta:

  - resumen.json : posts ordenados por fecha (desc), con likes, fecha, caption e
                   imagenes de cada uno; + un bloque "top_fotos" (mejores imagenes
                   por likes, para elegir hero/gallery/products).
  - captions.md  : todas las captions en limpio (fuente de copy real del negocio).

Uso (PowerShell, desde forjo-app):
  python scripts/instagram-cosechar.py "<dir>/<handle>"
donde <dir>/<handle> es la carpeta donde instaloader dejo la descarga
(instaloader --load-cookies firefox --no-videos --dirname-pattern "{handle}" "{handle}").

No baja nada de internet: solo procesa lo que instaloader ya dejo en disco.
"""
import sys, os, glob, json, lzma
from datetime import datetime, timezone


def load_node(path):
    with lzma.open(path) as fh:
        d = json.load(fh)
    return d.get("node", d)


def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/instagram-cosechar.py <carpeta del perfil>")
        sys.exit(1)

    folder = sys.argv[1]
    if not os.path.isdir(folder):
        print(f"No existe la carpeta: {folder}")
        sys.exit(1)

    metas = sorted(glob.glob(os.path.join(folder, "*.json.xz")))
    if not metas:
        print(f"No hay .json.xz en {folder}. Corriste instaloader ahi?")
        sys.exit(1)

    posts = []
    for meta in metas:
        node = load_node(meta)
        shortcode = node.get("shortcode")
        if not shortcode:  # metadata que no es un post (perfil, etc.)
            continue

        base = meta[: -len(".json.xz")]
        images = sorted(
            os.path.basename(p)
            for p in glob.glob(base + ".jpg") + glob.glob(base + "_*.jpg")
        )

        ts = node.get("date") or node.get("taken_at_timestamp")
        date_iso = (
            datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            if ts else None
        )

        cap = node.get("caption")
        if isinstance(cap, dict):  # por si viene anidado
            cap = cap.get("text")
        caption = (cap or "").strip()

        likes = node.get("edge_media_preview_like", {}).get("count", 0)
        comments = node.get("comments")
        comments = comments.get("count", 0) if isinstance(comments, dict) else (comments or 0)

        posts.append({
            "shortcode": shortcode,
            "url": f"https://www.instagram.com/p/{shortcode}/",
            "date": date_iso,
            "likes": likes,
            "comments": comments,
            "is_video": bool(node.get("is_video")),
            "is_carousel": len(images) > 1,
            "caption": caption,
            "images": images,
        })

    posts.sort(key=lambda p: (p["date"] or ""), reverse=True)

    # top fotos por likes: una representativa por post (la portada), para elegir
    # las mejores sin que un solo carrusel inunde el ranking.
    top_fotos = [
        {"image": p["images"][0], "likes": p["likes"], "date": p["date"]}
        for p in sorted(posts, key=lambda p: p["likes"], reverse=True)
        if p["images"]
    ][:15]

    total_imgs = sum(len(p["images"]) for p in posts)
    fechas = [p["date"] for p in posts if p["date"]]
    resumen = {
        "handle": os.path.basename(os.path.normpath(folder)),
        "generado": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d"),
        "total_posts": len(posts),
        "total_imagenes": total_imgs,
        "rango_fechas": {"desde": min(fechas) if fechas else None,
                          "hasta": max(fechas) if fechas else None},
        "top_fotos": top_fotos,
        "posts": posts,
    }

    out_json = os.path.join(folder, "resumen.json")
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(resumen, fh, ensure_ascii=False, indent=2)

    out_md = os.path.join(folder, "captions.md")
    with open(out_md, "w", encoding="utf-8") as fh:
        fh.write(f"# Captions de @{resumen['handle']}\n\n")
        fh.write(f"{len(posts)} posts · {total_imgs} imagenes · "
                 f"{resumen['rango_fechas']['desde']} a {resumen['rango_fechas']['hasta']}\n\n")
        for p in posts:
            head = f"## {p['date']} · {p['likes']} likes"
            if p["is_video"]:
                head += " · (video)"
            fh.write(head + "\n\n")
            fh.write((p["caption"] or "_(sin texto)_") + "\n\n")
            if p["images"]:
                fh.write("Fotos: " + ", ".join(p["images"]) + "\n\n")
            fh.write("---\n\n")

    print(f"OK: {len(posts)} posts, {total_imgs} imagenes")
    print(f"  -> {out_json}")
    print(f"  -> {out_md}")


if __name__ == "__main__":
    main()
