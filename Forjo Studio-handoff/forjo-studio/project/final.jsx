// FINAL PACK — finalists 09 (Bauhaus) and 14 (F Block)
// Includes redesigned Bauhaus mark integrating the letter "F" built from primary shapes.

const FFrame = ({ bg, fg, children, padding = 56, font, note, align = "center" }) => (
  <div style={{
    width: "100%", height: "100%", background: bg, color: fg,
    display: "flex", flexDirection: "column",
    alignItems: align === "center" ? "center" : "flex-start",
    justifyContent: "center", padding, fontFamily: font,
    position: "relative", boxSizing: "border-box", overflow: "hidden",
  }}>
    {children}
    {note && (
      <div style={{
        position: "absolute", bottom: 12, left: 14,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
        opacity: 0.4, color: fg,
      }}>{note}</div>
    )}
  </div>
);

/* =========================================================================
   BAUHAUS F MARKS — 4 directions
   ========================================================================= */

// A. Pure-primitives F — vertical rect spine + square top arm + circle middle arm
const BauF_A = ({ size = 96, p = ["#d94a2b","#1a1714","#f4c543","#2a5fa5"] }) => {
  // viewBox 60x80
  return (
    <svg width={size} height={size*80/60} viewBox="0 0 60 80">
      {/* spine */}
      <rect x="6" y="6" width="16" height="68" fill={p[1]}/>
      {/* top arm (square) */}
      <rect x="22" y="6" width="32" height="22" fill={p[0]}/>
      {/* middle arm (circle on right end) */}
      <rect x="22" y="36" width="20" height="14" fill={p[2]}/>
      <circle cx="48" cy="43" r="7" fill={p[3]}/>
    </svg>
  );
};

// B. Grid F — 3x4 grid where the F-shaped cells each get a different primary shape
const BauF_B = ({ size = 96, p = ["#d94a2b","#1a1714","#f4c543","#2a5fa5","#f3ead8"] }) => {
  const u = 16;
  return (
    <svg width={size} height={size*4/3} viewBox={`0 0 ${u*3} ${u*4}`}>
      {/* Background grid – very faint */}
      {/* F cells: (0,0)(1,0)(2,0) top, (0,1) (0,2)(1,2) middle, (0,3) */}
      {/* Top row: red square + black square + yellow triangle */}
      <rect x={0} y={0} width={u} height={u} fill={p[0]}/>
      <rect x={u} y={0} width={u} height={u} fill={p[1]}/>
      <path d={`M ${u*2} 0 L ${u*3} 0 L ${u*3} ${u} Z`} fill={p[2]}/>
      <path d={`M ${u*2} 0 L ${u*3} ${u} L ${u*2} ${u} Z`} fill={p[3]}/>
      {/* Row 1: spine cell — blue */}
      <rect x={0} y={u} width={u} height={u} fill={p[3]}/>
      {/* Row 2: spine + middle arm */}
      <rect x={0} y={u*2} width={u} height={u} fill={p[1]}/>
      <circle cx={u*1.5} cy={u*2.5} r={u*0.5} fill={p[0]}/>
      {/* Row 3: spine bottom */}
      <rect x={0} y={u*3} width={u} height={u} fill={p[2]}/>
    </svg>
  );
};

// C. Bold blocky F — three rectangles, one accent shape
const BauF_C = ({ size = 96, p = ["#d94a2b","#1a1714","#f4c543"] }) => {
  return (
    <svg width={size} height={size*80/64} viewBox="0 0 64 80">
      <rect x="6" y="6" width="18" height="68" fill={p[1]}/>
      <rect x="24" y="6" width="34" height="18" fill={p[0]}/>
      <rect x="24" y="38" width="24" height="14" fill={p[1]}/>
      <circle cx="54" cy="14" r="4" fill={p[2]}/>
    </svg>
  );
};

// D. Constructivist F — diagonal energy
const BauF_D = ({ size = 96, p = ["#d94a2b","#1a1714","#f4c543","#2a5fa5"] }) => {
  return (
    <svg width={size} height={size*80/64} viewBox="0 0 64 80">
      <rect x="6" y="6" width="14" height="68" fill={p[1]}/>
      <rect x="20" y="6" width="38" height="14" fill={p[0]}/>
      <path d={`M 20 34 L 50 34 L 36 48 L 20 48 Z`} fill={p[3]}/>
      <circle cx="56" cy="13" r="6" fill={p[2]}/>
    </svg>
  );
};

const F09NEW_MarkA = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="opción A · primitivos puros">
    <BauF_A size={140}/>
  </FFrame>
);
const F09NEW_MarkB = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="opción B · grilla">
    <BauF_B size={120}/>
  </FFrame>
);
const F09NEW_MarkC = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="opción C · bloque sólido">
    <BauF_C size={140}/>
  </FFrame>
);
const F09NEW_MarkD = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="opción D · constructivista">
    <BauF_D size={140}/>
  </FFrame>
);

/* =========================================================================
   09 FINAL PACK — using option A as primary (cleanest, most readable as F)
   ========================================================================= */
const F09F_Hero = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="hero · light · F constructivista (D)">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <BauF_D size={132}/>
      <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
        forjo<br/><span style={{ fontWeight: 400, fontSize: 32, letterSpacing: "0.04em", opacity: 0.7 }}>studio</span>
      </div>
    </div>
  </FFrame>
);
const F09F_Dark = () => (
  <FFrame bg="#1a1714" fg="#f3ead8" font="'Archivo', sans-serif" note="hero · dark · F constructivista (D)">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <BauF_D size={132} p={["#d94a2b","#f3ead8","#f4c543","#7aa6d6"]}/>
      <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
        forjo<br/><span style={{ fontWeight: 400, fontSize: 32, letterSpacing: "0.04em", opacity: 0.7 }}>studio</span>
      </div>
    </div>
  </FFrame>
);
const F09F_Horiz = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="lockup horizontal · 1 línea · F constructivista (D)">
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <BauF_D size={64}/>
      <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
        forjo <span style={{ fontWeight: 400, opacity: 0.55 }}>studio</span>
      </div>
    </div>
  </FFrame>
);
const F09F_Favicons = () => (
  <FFrame bg="#fbf3e3" fg="#1a1714" font="'JetBrains Mono', monospace" note="favicon · 3 escalas + fondo">
    <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
      {[{ s: 96, lbl: "96px" }, { s: 48, lbl: "48px" }, { s: 24, lbl: "24px" }].map(({s, lbl}) => (
        <div key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ background: "#1a1714", padding: s*0.18,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BauF_A size={s} p={["#d94a2b","#f3ead8","#f4c543","#7aa6d6"]}/>
          </div>
          <span style={{ fontSize: 10, opacity: 0.5 }}>{lbl}</span>
        </div>
      ))}
    </div>
  </FFrame>
);
const F09F_Palettes = () => (
  <FFrame bg="#fbf3e3" fg="#1a1714" font="'Archivo', sans-serif" padding={36} note="paletas para elegir">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, width: "100%" }}>
      {[
        { p: ["#d94a2b","#1a1714","#f4c543","#2a5fa5"], n: "original Bauhaus" },
        { p: ["#e07a4a","#1a1714","#e8d5a8","#7aa094"], n: "tierra cálida" },
        { p: ["#ff6a2c","#0f0d0c","#0f0d0c","#ff6a2c"], n: "duotono ember" },
        { p: ["#1a1714","#1a1714","#1a1714","#1a1714"], n: "monocromo" },
      ].map(({p, n}, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <BauF_A size={56} p={p}/>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.18em" }}>{n}</div>
        </div>
      ))}
    </div>
  </FFrame>
);
const F09F_Header = () => (
  <FFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" padding={0} note="contexto · header" align="start">
    <div style={{ width: "100%", padding: "22px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #d8cdb3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <BauF_A size={36}/>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          forjo <span style={{ fontWeight: 400, opacity: 0.55 }}>/ studio</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 14, fontWeight: 500, alignItems: "center" }}>
        <span style={{ opacity: 0.7 }}>Trabajo</span>
        <span style={{ opacity: 0.7 }}>Servicios</span>
        <span style={{ background: "#1a1714", color: "#f3ead8", padding: "10px 16px" }}>Cotizar →</span>
      </div>
    </div>
    <div style={{ padding: "32px 40px" }}>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, textTransform: "uppercase", maxWidth: 480 }}>
        Construimos<br/><span style={{ color: "#d94a2b" }}>tu presencia</span><br/>en la web
      </div>
    </div>
  </FFrame>
);
const F09F_Card = () => (
  <FFrame bg="#2a2622" fg="#f3ead8" font="'Archivo', sans-serif" note="tarjeta personal">
    <div style={{ width: 360, height: 200, background: "#f3ead8", color: "#1a1714",
      padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
      <BauF_A size={56}/>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>forjo studio</div>
        <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4, opacity: 0.6 }}>
          forjo.studio · hola@forjo.studio
        </div>
      </div>
    </div>
  </FFrame>
);

/* =========================================================================
   14 FINAL PACK — F Block + Spark
   ========================================================================= */
const FBlock = ({ size = 88, bg = "#0f0d0c", fg = "#fbf3e3", spark = "#ff5b1f" }) => (
  <div style={{ width: size, height: size, background: bg, color: fg,
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
    fontFamily: "'Space Grotesk', sans-serif" }}>
    <div style={{ fontSize: size * 0.72, fontWeight: 700, letterSpacing: "-0.06em", lineHeight: 1 }}>F</div>
    <div style={{ position: "absolute", top: -size*0.07, right: -size*0.07,
      width: size*0.18, height: size*0.18, background: spark, borderRadius: "50%" }}/>
  </div>
);

const F14F_Hero = () => (
  <FFrame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" note="hero · light">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <FBlock size={120}/>
      <div>
        <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "0.06em", opacity: 0.6, marginTop: 6 }}>studio</div>
      </div>
    </div>
  </FFrame>
);
const F14F_Dark = () => (
  <FFrame bg="#0f0d0c" fg="#fbf3e3" font="'Space Grotesk', sans-serif" note="hero · dark · inverso">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <FBlock size={120} bg="#fbf3e3" fg="#0f0d0c" spark="#ff5b1f"/>
      <div>
        <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "0.06em", opacity: 0.6, marginTop: 6 }}>studio</div>
      </div>
    </div>
  </FFrame>
);
const F14F_Horiz = () => (
  <FFrame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" note="lockup horizontal · 1 línea">
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <FBlock size={48}/>
      <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.04em" }}>
        forjo <span style={{ fontWeight: 400, opacity: 0.55, fontSize: 28 }}>studio</span>
      </div>
    </div>
  </FFrame>
);
const F14F_Favicons = () => (
  <FFrame bg="#fbf3e3" fg="#0f0d0c" font="'JetBrains Mono', monospace" note="favicon · 3 escalas">
    <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
      {[140, 64, 28].map(s => (
        <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <FBlock size={s}/>
          <span style={{ fontSize: 10, opacity: 0.5 }}>{s}px</span>
        </div>
      ))}
    </div>
  </FFrame>
);
const F14F_Sparks = () => (
  <FFrame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" padding={36} note="chispas · 4 acentos">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, width: "100%" }}>
      {[
        ["#ff5b1f","ember"],
        ["#f4c543","amber"],
        ["#5b3df5","electric"],
        ["#1d6c4f","forest"],
      ].map(([c, n]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <FBlock size={56} spark={c}/>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.18em" }}>{n}</div>
        </div>
      ))}
    </div>
  </FFrame>
);
const F14F_Header = () => (
  <FFrame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" padding={0} note="contexto · header" align="start">
    <div style={{ width: "100%", padding: "22px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e3d8be" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <FBlock size={36}/>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.03em" }}>
          forjo <span style={{ fontWeight: 400, opacity: 0.55, fontSize: 14 }}>studio</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 14, alignItems: "center" }}>
        <span style={{ opacity: 0.7 }}>Trabajo</span>
        <span style={{ opacity: 0.7 }}>Equipo</span>
        <span style={{ background: "#0f0d0c", color: "#fbf3e3", padding: "10px 16px" }}>Hablemos</span>
      </div>
    </div>
    <div style={{ padding: "32px 40px" }}>
      <div style={{ fontSize: 46, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 480 }}>
        Soluciones web<br/>con <span style={{ color: "#ff5b1f", fontWeight: 700 }}>chispa</span>.
      </div>
    </div>
  </FFrame>
);
const F14F_Card = () => (
  <FFrame bg="#22252a" fg="#fbf3e3" font="'Space Grotesk', sans-serif" note="tarjeta personal">
    <div style={{ width: 360, height: 200, background: "#fbf3e3", color: "#0f0d0c",
      padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
      <FBlock size={48}/>
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>
          forjo <span style={{ fontWeight: 400, opacity: 0.55 }}>studio</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4, opacity: 0.6 }}>
          forjo.studio · hola@forjo.studio
        </div>
      </div>
    </div>
  </FFrame>
);

Object.assign(window, {
  BauF_A, BauF_B, BauF_C, BauF_D,
  F09NEW_MarkA, F09NEW_MarkB, F09NEW_MarkC, F09NEW_MarkD,
  F09F_Hero, F09F_Dark, F09F_Horiz, F09F_Favicons, F09F_Palettes, F09F_Header, F09F_Card,
  F14F_Hero, F14F_Dark, F14F_Horiz, F14F_Favicons, F14F_Sparks, F14F_Header, F14F_Card,
});
