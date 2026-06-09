// Logo components for Forjo Studio exploration
// Each is a self-contained SVG/HTML composition sized to fit a ~640x360 artboard

const LogoFrame = ({ bg, fg, children, padding = 64, font, note }) => (
  <div style={{
    width: "100%",
    height: "100%",
    background: bg,
    color: fg,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding,
    fontFamily: font,
    position: "relative",
    boxSizing: "border-box",
  }}>
    {children}
    {note && (
      <div style={{
        position: "absolute",
        bottom: 14,
        left: 16,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: 0.45,
      }}>{note}</div>
    )}
  </div>
);

// 1. Classic wordmark — Söhne-style geometric sans, cream + ink
const LogoClassic = () => (
  <LogoFrame bg="#f4efe6" fg="#15140f" font="'Space Grotesk', sans-serif" note="01 · Classic wordmark">
    <div style={{ fontSize: 88, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
      forjo<span style={{ color: "#c4634a" }}>.</span>
    </div>
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      letterSpacing: "0.42em",
      textTransform: "uppercase",
      marginTop: 18,
      opacity: 0.55,
    }}>
      studio
    </div>
  </LogoFrame>
);

// 2. Anvil mark — minimal geometric forge symbol
const LogoAnvil = () => (
  <LogoFrame bg="#1a1714" fg="#f3ead8" font="'Fraunces', serif" note="02 · Anvil mark">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <path d="M14 22 L58 22 L52 34 L20 34 Z" fill="#f3ead8"/>
        <rect x="30" y="34" width="12" height="14" fill="#f3ead8"/>
        <rect x="20" y="48" width="32" height="6" fill="#f3ead8"/>
        <circle cx="62" cy="14" r="3" fill="#e07a4a"/>
      </svg>
      <div>
        <div style={{ fontSize: 64, lineHeight: 0.95, fontWeight: 500, letterSpacing: "-0.02em" }}>Forjo</div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginTop: 6,
          opacity: 0.6,
        }}>studio</div>
      </div>
    </div>
  </LogoFrame>
);

// 3. Ember — bold display, hot orange on dark
const LogoEmber = () => (
  <LogoFrame bg="#0f0d0c" fg="#ff6a2c" font="'Archivo', sans-serif" note="03 · Ember">
    <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
      FORJO
    </div>
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      letterSpacing: "0.5em",
      textTransform: "uppercase",
      marginTop: 12,
      color: "#f3ead8",
      opacity: 0.7,
    }}>
      ── studio ──
    </div>
  </LogoFrame>
);

// 4. Bracket — code-forward, monospaced w/ brackets
const LogoBracket = () => (
  <LogoFrame bg="#0a1410" fg="#9eebc4" font="'JetBrains Mono', monospace" note="04 · Bracket / code">
    <div style={{ fontSize: 64, fontWeight: 500, letterSpacing: "-0.02em", display: "flex", alignItems: "baseline" }}>
      <span style={{ color: "#5f8a76", marginRight: 8 }}>{"{"}</span>
      <span>forjo</span>
      <span style={{ color: "#9eebc4" }}>_</span>
      <span style={{ color: "#5f8a76", marginLeft: 8 }}>{"}"}</span>
    </div>
    <div style={{
      fontSize: 11,
      letterSpacing: "0.4em",
      textTransform: "uppercase",
      marginTop: 16,
      opacity: 0.55,
    }}>
      studio · web · craft
    </div>
  </LogoFrame>
);

// 5. Serif gravitas — Fraunces, warm clay
const LogoSerif = () => (
  <LogoFrame bg="#e8dcc6" fg="#3a1f15" font="'Fraunces', serif" note="05 · Editorial serif">
    <div style={{ fontSize: 108, fontWeight: 400, lineHeight: 0.9, letterSpacing: "-0.02em", fontStyle: "italic" }}>
      Forjo
    </div>
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 14,
      letterSpacing: "0.5em",
      textTransform: "uppercase",
      marginTop: 14,
      opacity: 0.5,
      fontWeight: 500,
    }}>
      studio
    </div>
  </LogoFrame>
);

// 6. Spark monogram — F inside a circle, with spark
const LogoSpark = () => (
  <LogoFrame bg="#0f1c2e" fg="#f5f0e6" font="'Space Grotesk', sans-serif" note="06 · Spark monogram">
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r="44" stroke="#f5f0e6" strokeWidth="2.5" fill="none"/>
        <text x="46" y="62" textAnchor="middle" fontSize="56" fontWeight="600" fill="#f5f0e6" fontFamily="'Space Grotesk', sans-serif" style={{letterSpacing:"-0.04em"}}>F</text>
        <circle cx="76" cy="18" r="5" fill="#ffb74a"/>
        <circle cx="76" cy="18" r="10" fill="#ffb74a" opacity="0.25"/>
      </svg>
      <div>
        <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 14, letterSpacing: "0.32em", textTransform: "uppercase", opacity: 0.5, marginTop: 4 }}>studio</div>
      </div>
    </div>
  </LogoFrame>
);

// 7. Hammered — heavy display, slab
const LogoHammered = () => (
  <LogoFrame bg="#c14a2b" fg="#fbf3e3" font="'Archivo', sans-serif" note="07 · Hammered slab">
    <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9, textTransform: "uppercase" }}>
      Forjo<br/>Studio
    </div>
  </LogoFrame>
);

// 8. Lowercase soft — friendly tech, mint
const LogoSoft = () => (
  <LogoFrame bg="#eaf3ee" fg="#143d2c" font="'Inter', sans-serif" note="08 · Soft modern">
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <path d="M14 8 Q14 4 18 4 L48 4 L48 14 L24 14 L24 24 L42 24 L42 34 L24 34 L24 52 L14 52 Z" fill="#1d6c4f"/>
        <circle cx="48" cy="48" r="5" fill="#e07a4a"/>
      </svg>
      <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
        forjo
      </div>
    </div>
    <div style={{ fontSize: 13, letterSpacing: "0.5em", textTransform: "uppercase", opacity: 0.55, marginTop: 14, fontWeight: 500 }}>
      web studio
    </div>
  </LogoFrame>
);

// 9. Bauhaus geometric — primary shapes
const LogoBauhaus = () => (
  <LogoFrame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="09 · Geometric">
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <rect x="6" y="6" width="28" height="28" fill="#d94a2b"/>
        <circle cx="52" cy="20" r="14" fill="#1a1714"/>
        <path d="M6 38 L34 66 L6 66 Z" fill="#2a5fa5"/>
        <rect x="38" y="38" width="28" height="28" fill="#f4c543"/>
      </svg>
      <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
        forjo<br/>
        <span style={{ fontWeight: 400, fontSize: 28, letterSpacing: "0.04em" }}>studio</span>
      </div>
    </div>
  </LogoFrame>
);

// 10. Stamp / seal — circular badge
const LogoStamp = () => (
  <LogoFrame bg="#1d2c24" fg="#e8d5a8" font="'Fraunces', serif" note="10 · Seal">
    <svg width="220" height="220" viewBox="0 0 220 220">
      <defs>
        <path id="circ" d="M 110,110 m -88,0 a 88,88 0 1,1 176,0 a 88,88 0 1,1 -176,0"/>
      </defs>
      <circle cx="110" cy="110" r="102" stroke="#e8d5a8" strokeWidth="1.5" fill="none"/>
      <circle cx="110" cy="110" r="92" stroke="#e8d5a8" strokeWidth="0.75" fill="none"/>
      <text fontSize="11" fill="#e8d5a8" fontFamily="'JetBrains Mono', monospace" letterSpacing="6">
        <textPath href="#circ" startOffset="0">WEB · DESIGN · CRAFT · SINCE 2025 · WEB · DESIGN · CRAFT ·</textPath>
      </text>
      <text x="110" y="100" textAnchor="middle" fontSize="42" fill="#e8d5a8" fontFamily="'Fraunces', serif" fontStyle="italic" fontWeight="400">Forjo</text>
      <text x="110" y="128" textAnchor="middle" fontSize="14" fill="#e8d5a8" fontFamily="'Space Grotesk', sans-serif" letterSpacing="6" opacity="0.75">STUDIO</text>
      <line x1="80" y1="138" x2="140" y2="138" stroke="#e8d5a8" strokeWidth="0.75"/>
      <text x="110" y="152" textAnchor="middle" fontSize="9" fill="#e8d5a8" fontFamily="'JetBrains Mono', monospace" letterSpacing="2" opacity="0.6">ESTD MMXXV</text>
    </svg>
  </LogoFrame>
);

// 11. Stretched — wide modern type, gradient-free, electric
const LogoStretched = () => (
  <LogoFrame bg="#ecebe6" fg="#171717" font="'Archivo', sans-serif" note="11 · Wide display">
    <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.9, transform: "scaleX(1.15)", transformOrigin: "left center" }}>
      forjo
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
      <div style={{ width: 40, height: 2, background: "#5b3df5" }}/>
      <div style={{ fontSize: 14, letterSpacing: "0.4em", textTransform: "uppercase", fontWeight: 500 }}>
        Studio · A web atelier
      </div>
    </div>
  </LogoFrame>
);

// 12. Pixel / build — small mark, modular F
const LogoPixel = () => (
  <LogoFrame bg="#fff8ec" fg="#2a1810" font="'JetBrains Mono', monospace" note="12 · Modular">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        {/* a F built from squares */}
        {[[0,0],[1,0],[2,0],[3,0],[0,1],[0,2],[1,2],[2,2],[0,3],[0,4],[0,5]].map(([x,y],i)=>(
          <rect key={i} x={x*14+4} y={y*14+4} width="12" height="12" fill="#2a1810"/>
        ))}
        <rect x={3*14+4} y={2*14+4} width="12" height="12" fill="#d94a2b"/>
      </svg>
      <div>
        <div style={{ fontSize: 54, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif" }}>forjo.studio</div>
        <div style={{ fontSize: 11, letterSpacing: "0.35em", textTransform: "uppercase", opacity: 0.5, marginTop: 8 }}>
          build · ship · iterate
        </div>
      </div>
    </div>
  </LogoFrame>
);

// 13. Italic script — elegant cursive
const LogoScript = () => (
  <LogoFrame bg="#1c1410" fg="#f0c9a0" font="'Fraunces', serif" note="13 · Italic display">
    <div style={{ fontSize: 132, fontStyle: "italic", fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 0.9 }}>
      forjo
    </div>
    <div style={{
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: 13,
      letterSpacing: "0.6em",
      textTransform: "uppercase",
      marginTop: 8,
      opacity: 0.55,
      fontWeight: 400,
    }}>
      — studio —
    </div>
  </LogoFrame>
);

// 14. Hot stamp — sparked F mark on cream
const LogoHotStamp = () => (
  <LogoFrame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" note="14 · F mark">
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{
        width: 88,
        height: 88,
        background: "#0f0d0c",
        color: "#fbf3e3",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.06em", lineHeight: 1 }}>F</div>
        <div style={{
          position: "absolute",
          top: -6, right: -6,
          width: 16, height: 16,
          background: "#ff5b1f",
          borderRadius: "50%",
        }}/>
      </div>
      <div>
        <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 16, fontWeight: 400, letterSpacing: "0.06em", opacity: 0.6, marginTop: 4 }}>studio</div>
      </div>
    </div>
  </LogoFrame>
);

// 15. Spanish-warm — clay + cream, soft serif
const LogoTerra = () => (
  <LogoFrame bg="#d8896a" fg="#fbf3e3" font="'Fraunces', serif" note="15 · Terracota">
    <div style={{ fontSize: 104, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 0.9 }}>
      forjo
    </div>
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      letterSpacing: "0.5em",
      textTransform: "uppercase",
      marginTop: 14,
      opacity: 0.75,
    }}>
      estudio web
    </div>
  </LogoFrame>
);

// 16. Stack — vertical lockup
const LogoStack = () => (
  <LogoFrame bg="#13315c" fg="#f8e3a0" font="'Space Grotesk', sans-serif" note="16 · Vertical lockup">
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, letterSpacing: "0.7em", textTransform: "uppercase", marginBottom: 18, opacity: 0.65, fontWeight: 500 }}>
        — web studio —
      </div>
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
        FORJO
      </div>
      <div style={{ fontSize: 13, letterSpacing: "0.7em", textTransform: "uppercase", marginTop: 18, opacity: 0.65, fontWeight: 500 }}>
        — buenos aires —
      </div>
    </div>
  </LogoFrame>
);

window.LogoClassic = LogoClassic;
window.LogoAnvil = LogoAnvil;
window.LogoEmber = LogoEmber;
window.LogoBracket = LogoBracket;
window.LogoSerif = LogoSerif;
window.LogoSpark = LogoSpark;
window.LogoHammered = LogoHammered;
window.LogoSoft = LogoSoft;
window.LogoBauhaus = LogoBauhaus;
window.LogoStamp = LogoStamp;
window.LogoStretched = LogoStretched;
window.LogoPixel = LogoPixel;
window.LogoScript = LogoScript;
window.LogoHotStamp = LogoHotStamp;
window.LogoTerra = LogoTerra;
window.LogoStack = LogoStack;
