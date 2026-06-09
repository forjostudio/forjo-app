// Forjo Studio site — shared theme, marks, and small bits

/* =========================================================================
   THEME — derived from the two finalist logos
   ========================================================================= */
const FORJO_THEMES = {
  bauhaus: {
    name: "bauhaus",
    font: "'Archivo', sans-serif",
    fontDisplay: "'Archivo', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    fontBody: "'Space Grotesk', sans-serif",
    light: {
      bg: "#f3ead8",
      surface: "#fbf3e3",
      ink: "#1a1714",
      muted: "#6b6253",
      border: "#d8cdb3",
      cream: "#fbf3e3",
    },
    dark: {
      bg: "#1a1714",
      surface: "#252019",
      ink: "#f3ead8",
      muted: "#a39989",
      border: "#332d24",
      cream: "#f3ead8",
    },
    accentStyle: "primary-block", // uses red+yellow+blue
    displayCase: "uppercase",
    displayWeight: 800,
    displayTracking: "-0.04em",
  },
  fblock: {
    name: "fblock",
    font: "'Space Grotesk', sans-serif",
    fontDisplay: "'Space Grotesk', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    fontBody: "'Space Grotesk', sans-serif",
    light: {
      bg: "#fbf3e3",
      surface: "#f4ecd8",
      ink: "#0f0d0c",
      muted: "#5a544a",
      border: "#e3d8be",
      cream: "#fbf3e3",
    },
    dark: {
      bg: "#0f0d0c",
      surface: "#1a1714",
      ink: "#fbf3e3",
      muted: "#9a9080",
      border: "#2a2520",
      cream: "#fbf3e3",
    },
    accentStyle: "ember",
    displayCase: "none",
    displayWeight: 600,
    displayTracking: "-0.045em",
  },
};

const ACCENT_PALETTE = {
  red:      { primary: "#d94a2b", soft: "#e8a695" },
  ember:    { primary: "#ff5b1f", soft: "#ffc4a8" },
  electric: { primary: "#5b3df5", soft: "#bcb0fb" },
  forest:   { primary: "#1d6c4f", soft: "#9bc7b8" },
};

function buildTheme({ style, mode, accentHex }) {
  const t = FORJO_THEMES[style];
  const palette = mode === "dark" ? t.dark : t.light;
  return {
    ...t,
    ...palette,
    accent: accentHex || "#d94a2b",
    isDark: mode === "dark",
  };
}

/* =========================================================================
   MARKS — the two logos as React components
   ========================================================================= */

// Bauhaus constructivist F (option D, original palette)
const BauhausF = ({ size = 40, mode = "color", invert = false }) => {
  // mode: 'color' | 'mono'
  // invert: if true, swap the spine color (for dark backgrounds)
  const spine = mode === "mono" ? "currentColor" : (invert ? "#f3ead8" : "#1a1714");
  const top = mode === "mono" ? "currentColor" : "#d94a2b";
  const mid = mode === "mono" ? "currentColor" : (invert ? "#7aa6d6" : "#2a5fa5");
  const spark = mode === "mono" ? "currentColor" : "#f4c543";
  return (
    <svg width={size} height={size * 80 / 64} viewBox="0 0 64 80" style={{ display: "block" }}>
      <rect x="6" y="6" width="14" height="68" fill={spine}/>
      <rect x="20" y="6" width="38" height="14" fill={top}/>
      <path d="M 20 34 L 50 34 L 36 48 L 20 48 Z" fill={mid}/>
      <circle cx="58" cy="13" r="5" fill={spark}/>
    </svg>
  );
};

// F Block — square with F + spark
const FBlock = ({ size = 40, bg, fg, spark }) => (
  <div style={{
    width: size, height: size, background: bg || "#0f0d0c", color: fg || "#fbf3e3",
    display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative",
    fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0,
  }}>
    <span style={{
      fontSize: size * 0.72, fontWeight: 700, letterSpacing: "-0.06em", lineHeight: 1,
    }}>F</span>
    <span style={{
      position: "absolute", top: -size*0.08, right: -size*0.08,
      width: size*0.20, height: size*0.20, background: spark || "#ff5b1f", borderRadius: "50%",
    }}/>
  </div>
);

/* =========================================================================
   LOGO LOCKUP — switches between Bauhaus/Fblock based on style
   ========================================================================= */
const Logo = ({ theme, size = 32 }) => {
  if (theme.name === "bauhaus") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.32 }}>
        <BauhausF size={size} invert={theme.isDark}/>
        <span style={{
          fontFamily: theme.fontDisplay, fontSize: size * 0.62, fontWeight: 700,
          letterSpacing: "-0.03em", lineHeight: 1, color: theme.ink,
        }}>
          forjo <span style={{ fontWeight: 400, opacity: 0.55 }}>/ studio</span>
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.34 }}>
      <FBlock
        size={size * 0.85}
        bg={theme.isDark ? theme.ink : "#0f0d0c"}
        fg={theme.isDark ? theme.bg : "#fbf3e3"}
        spark={theme.accent}
      />
      <span style={{
        fontFamily: theme.fontDisplay, fontSize: size * 0.6, fontWeight: 600,
        letterSpacing: "-0.03em", lineHeight: 1, color: theme.ink,
      }}>
        forjo <span style={{ fontWeight: 400, opacity: 0.55, fontSize: size * 0.42 }}>studio</span>
      </span>
    </span>
  );
};

/* =========================================================================
   PRIMITIVES — small reusable parts
   ========================================================================= */
const Kicker = ({ children, theme, style }) => (
  <div style={{
    fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.22em",
    textTransform: "uppercase", color: theme.muted, ...style,
  }}>{children}</div>
);

const Title = ({ children, theme, size = 72, style }) => (
  <h2 style={{
    fontFamily: theme.fontDisplay, fontSize: size, fontWeight: theme.displayWeight,
    letterSpacing: theme.displayTracking, lineHeight: 0.96, margin: 0,
    textTransform: theme.displayCase, color: theme.ink, textWrap: "balance",
    ...style,
  }}>{children}</h2>
);

const Button = ({ children, primary, theme, onClick, href, large }) => {
  const styleObj = {
    display: "inline-flex", alignItems: "center", gap: 10,
    padding: large ? "16px 22px" : "12px 18px",
    fontFamily: theme.fontBody, fontSize: large ? 15 : 14, fontWeight: 600,
    letterSpacing: "-0.01em", textDecoration: "none", cursor: "pointer",
    border: `1px solid ${primary ? theme.ink : theme.border}`,
    background: primary ? theme.ink : "transparent",
    color: primary ? theme.bg : theme.ink,
    transition: "transform 0.15s ease, background 0.15s ease",
  };
  return (
    <a href={href || "#"} onClick={onClick} style={styleObj}
       onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
       onMouseLeave={e=>e.currentTarget.style.transform=""}>
      {children}
    </a>
  );
};

// A geometric Bauhaus composition used as visual accent on the hero.
// Exactly the favicon: ink ground, 2×2 grid —
// red square, cream circle, blue triangle, yellow square. No extra details.
const BauhausComposition = ({ theme }) => {
  const cream = "#ece3d0";
  const blue  = "#2f5fa3";
  const red   = "#d6452a";
  const ylw   = "#f1c33f";
  const ink   = "#1a1714"; // always dark ground, like the favicon

  // Square frame with even padding & gap.
  const P = 56;   // outer padding
  const G = 24;   // gap between cells
  const C = 130;  // cell size
  const W = P * 2 + C * 2 + G;          // total
  const xL = P,            xR = P + C + G;
  const yT = P,            yB = P + C + G;

  return (
    <svg viewBox={`0 0 ${W} ${W}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width={W} height={W} fill={ink}/>

      {/* TL — red square */}
      <rect x={xL} y={yT} width={C} height={C} fill={red}/>

      {/* TR — cream circle */}
      <circle cx={xR + C/2} cy={yT + C/2} r={C/2} fill={cream}/>

      {/* BL — blue right-triangle: right angle at bottom-left, hypotenuse TL→BR */}
      <path d={`M ${xL} ${yB} L ${xL} ${yB+C} L ${xL+C} ${yB+C} Z`} fill={blue}/>

      {/* BR — yellow square */}
      <rect x={xR} y={yB} width={C} height={C} fill={ylw}/>
    </svg>
  );
};

// Striped placeholder for "imagery goes here"
const ImagePlaceholder = ({ theme, label, height = 220 }) => (
  <div style={{
    width: "100%", height,
    background: `repeating-linear-gradient(45deg, ${theme.surface}, ${theme.surface} 8px, ${theme.bg} 8px, ${theme.bg} 16px)`,
    border: `1px solid ${theme.border}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: theme.muted, fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.18em",
    textTransform: "uppercase",
  }}>
    {label}
  </div>
);

Object.assign(window, {
  FORJO_THEMES, ACCENT_PALETTE, buildTheme,
  BauhausF, FBlock, Logo, Kicker, Title, Button,
  BauhausComposition, ImagePlaceholder,
});
