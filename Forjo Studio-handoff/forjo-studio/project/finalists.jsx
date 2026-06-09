// Finalists exploration — 01, 09, 12, 14
// Each finalist gets a row with: hero, color variants, mono, icon mark, and contextual mockups.

const Frame = ({ bg, fg, children, padding = 56, font, note, align = "center" }) => (
  <div style={{
    width: "100%",
    height: "100%",
    background: bg,
    color: fg,
    display: "flex",
    flexDirection: "column",
    alignItems: align === "center" ? "center" : "flex-start",
    justifyContent: "center",
    padding,
    fontFamily: font,
    position: "relative",
    boxSizing: "border-box",
    overflow: "hidden",
  }}>
    {children}
    {note && (
      <div style={{
        position: "absolute",
        bottom: 12, left: 14,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
        opacity: 0.4, color: fg,
      }}>{note}</div>
    )}
  </div>
);

/* =========================================================================
   FINALIST 01 — CLASSIC WORDMARK
   ========================================================================= */
const F01_Hero = () => (
  <Frame bg="#f4efe6" fg="#15140f" font="'Space Grotesk', sans-serif" note="hero · light">
    <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
      forjo<span style={{ color: "#c4634a" }}>.</span>
    </div>
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: "0.42em",
      textTransform: "uppercase", marginTop: 18, opacity: 0.55 }}>studio</div>
  </Frame>
);
const F01_Dark = () => (
  <Frame bg="#15140f" fg="#f4efe6" font="'Space Grotesk', sans-serif" note="hero · dark">
    <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
      forjo<span style={{ color: "#e07a4a" }}>.</span>
    </div>
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: "0.42em",
      textTransform: "uppercase", marginTop: 18, opacity: 0.55 }}>studio</div>
  </Frame>
);
const F01_ColorAlts = () => (
  <Frame bg="#fbf3e3" fg="#15140f" font="'Space Grotesk', sans-serif" padding={40} note="dot · 3 alternativas">
    <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start", width: "100%" }}>
      {[
        ["#c4634a", "clay"],
        ["#1d6c4f", "forest"],
        ["#2a5fa5", "ink blue"],
      ].map(([c, name]) => (
        <div key={name} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>
            forjo<span style={{ color: c }}>.</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.45,
            textTransform: "uppercase", letterSpacing: "0.2em" }}>{name}</div>
        </div>
      ))}
    </div>
  </Frame>
);
const F01_Mark = () => (
  <Frame bg="#15140f" fg="#f4efe6" font="'Space Grotesk', sans-serif" note="mark · 'f.' avatar 1:1">
    <div style={{ width: 220, height: 220, background: "#f4efe6", color: "#15140f",
      display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <div style={{ fontSize: 156, fontWeight: 600, letterSpacing: "-0.06em", lineHeight: 1 }}>
        f<span style={{ color: "#c4634a" }}>.</span>
      </div>
    </div>
  </Frame>
);
const F01_Header = () => (
  <Frame bg="#f4efe6" fg="#15140f" font="'Space Grotesk', sans-serif" padding={0} note="contexto · header del sitio" align="start">
    <div style={{ width: "100%", padding: "28px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #d8d0bd" }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em" }}>
        forjo<span style={{ color: "#c4634a" }}>.</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, marginLeft: 10, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.5 }}>studio</span>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 14, opacity: 0.7 }}>
        <span>Trabajo</span><span>Proceso</span><span>Contacto</span>
      </div>
    </div>
    <div style={{ padding: "32px 40px" }}>
      <div style={{ fontSize: 44, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 460 }}>
        Sitios web que <span style={{ fontStyle: "italic", fontFamily: "'Fraunces', serif" }}>convierten</span> visitas en clientes.
      </div>
    </div>
  </Frame>
);
const F01_Tab = () => (
  <Frame bg="#22252a" fg="#f4efe6" font="'Space Grotesk', sans-serif" note="contexto · favicon en tab">
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 460 }}>
      {[
        { fav: true, t: "Forjo Studio — web para emprendedores" },
        { fav: false, t: "Notion" },
        { fav: false, t: "GitHub · forjo / studio-site" },
      ].map((tab, i) => (
        <div key={i} style={{
          background: i===0 ? "#3a3f47" : "#2c3036",
          borderRadius: 8, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10, fontSize: 13,
        }}>
          {tab.fav ? (
            <div style={{ width: 18, height: 18, background: "#f4efe6", color: "#15140f",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 13, letterSpacing: "-0.05em", borderRadius: 2,
              fontFamily: "'Space Grotesk', sans-serif" }}>
              f<span style={{ color: "#c4634a" }}>.</span>
            </div>
          ) : (
            <div style={{ width: 18, height: 18, background: "#555a62", borderRadius: 3 }}/>
          )}
          <span style={{ opacity: i===0 ? 1 : 0.55 }}>{tab.t}</span>
        </div>
      ))}
    </div>
  </Frame>
);

/* =========================================================================
   FINALIST 09 — BAUHAUS / GEOMETRIC
   ========================================================================= */
const BauhausMark = ({ size = 72, palette = ["#d94a2b","#1a1714","#2a5fa5","#f4c543"] }) => {
  const s = size / 72;
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <rect x={6} y={6} width={28} height={28} fill={palette[0]}/>
      <circle cx={52} cy={20} r={14} fill={palette[1]}/>
      <path d={`M6 38 L34 66 L6 66 Z`} fill={palette[2]}/>
      <rect x={38} y={38} width={28} height={28} fill={palette[3]}/>
    </svg>
  );
};
const F09_Hero = () => (
  <Frame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="hero · full color">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <BauhausMark size={108}/>
      <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
        forjo<br/><span style={{ fontWeight: 400, fontSize: 32, letterSpacing: "0.04em" }}>studio</span>
      </div>
    </div>
  </Frame>
);
const F09_Dark = () => (
  <Frame bg="#1a1714" fg="#f3ead8" font="'Archivo', sans-serif" note="hero · dark · misma paleta">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <BauhausMark size={108}/>
      <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 }}>
        forjo<br/><span style={{ fontWeight: 400, fontSize: 32, letterSpacing: "0.04em" }}>studio</span>
      </div>
    </div>
  </Frame>
);
const F09_Palettes = () => (
  <Frame bg="#fbf3e3" fg="#1a1714" font="'Archivo', sans-serif" padding={36} note="paletas alternativas">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, width: "100%" }}>
      {[
        { p: ["#d94a2b","#1a1714","#2a5fa5","#f4c543"], n: "original" },
        { p: ["#e07a4a","#0f1c2e","#7aa094","#f0c9a0"], n: "tierra" },
        { p: ["#ff6a2c","#15140f","#15140f","#ff6a2c"], n: "duotono" },
        { p: ["#1a1714","#1a1714","#1a1714","#1a1714"], n: "mono" },
      ].map(({p, n}, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BauhausMark size={56} palette={p}/>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.5,
            textTransform: "uppercase", letterSpacing: "0.18em" }}>{n}</div>
        </div>
      ))}
    </div>
  </Frame>
);
const F09_Mark = () => (
  <Frame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" note="mark aislada · avatar / favicon">
    <div style={{ background: "#1a1714", padding: 24, width: 200, height: 200,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <BauhausMark size={140} palette={["#d94a2b","#f3ead8","#2a5fa5","#f4c543"]}/>
    </div>
  </Frame>
);
const F09_Header = () => (
  <Frame bg="#f3ead8" fg="#1a1714" font="'Archivo', sans-serif" padding={0} note="contexto · header del sitio" align="start">
    <div style={{ width: "100%", padding: "24px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #d8cdb3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BauhausMark size={32}/>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          forjo <span style={{ fontWeight: 400, opacity: 0.55 }}>/ studio</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, fontSize: 14, fontWeight: 500 }}>
        <span>Trabajo</span><span>Servicios</span><span style={{ background: "#1a1714", color: "#f3ead8", padding: "8px 14px" }}>Cotizar →</span>
      </div>
    </div>
    <div style={{ padding: "28px 40px" }}>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, textTransform: "uppercase", maxWidth: 480 }}>
        Construimos<br/><span style={{ color: "#d94a2b" }}>tu presencia</span><br/>en la web
      </div>
    </div>
  </Frame>
);
const F09_Card = () => (
  <Frame bg="#2a2622" fg="#f3ead8" font="'Archivo', sans-serif" note="contexto · tarjeta de presentación">
    <div style={{ width: 360, height: 200, background: "#f3ead8", color: "#1a1714",
      padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between",
      boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
      <BauhausMark size={48}/>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>forjo studio</div>
        <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4, opacity: 0.6 }}>
          forjo.studio · hola@forjo.studio
        </div>
      </div>
    </div>
  </Frame>
);

/* =========================================================================
   FINALIST 12 — MODULAR PIXEL F
   ========================================================================= */
const PixelF = ({ unit = 14, ink = "#2a1810", accent = "#d94a2b" }) => (
  <svg width={unit*6+8} height={unit*6+8} viewBox={`0 0 ${unit*6+8} ${unit*6+8}`}>
    {[[0,0],[1,0],[2,0],[3,0],[0,1],[0,2],[1,2],[2,2],[0,3],[0,4],[0,5]].map(([x,y],i)=>(
      <rect key={i} x={x*unit+4} y={y*unit+4} width={unit-2} height={unit-2} fill={ink}/>
    ))}
    <rect x={3*unit+4} y={2*unit+4} width={unit-2} height={unit-2} fill={accent}/>
  </svg>
);
const F12_Hero = () => (
  <Frame bg="#fff8ec" fg="#2a1810" font="'JetBrains Mono', monospace" note="hero · light">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <PixelF unit={16}/>
      <div>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1,
          fontFamily: "'Space Grotesk', sans-serif" }}>forjo.studio</div>
        <div style={{ fontSize: 12, letterSpacing: "0.35em", textTransform: "uppercase",
          opacity: 0.5, marginTop: 10 }}>build · ship · iterate</div>
      </div>
    </div>
  </Frame>
);
const F12_Dark = () => (
  <Frame bg="#1a1410" fg="#f3e5cb" font="'JetBrains Mono', monospace" note="hero · dark">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <PixelF unit={16} ink="#f3e5cb" accent="#ff6a2c"/>
      <div>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1,
          fontFamily: "'Space Grotesk', sans-serif" }}>forjo.studio</div>
        <div style={{ fontSize: 12, letterSpacing: "0.35em", textTransform: "uppercase",
          opacity: 0.5, marginTop: 10 }}>build · ship · iterate</div>
      </div>
    </div>
  </Frame>
);
const F12_ColorAlts = () => (
  <Frame bg="#fff8ec" fg="#2a1810" font="'JetBrains Mono', monospace" padding={36} note="acentos · 4 variantes">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, width: "100%" }}>
      {[
        ["#d94a2b","clay"],
        ["#ff6a2c","ember"],
        ["#1d6c4f","forest"],
        ["#5b3df5","electric"],
      ].map(([c, n]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <PixelF unit={9} accent={c}/>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>{n}</div>
        </div>
      ))}
    </div>
  </Frame>
);
const F12_Mark = () => (
  <Frame bg="#2a1810" fg="#fff8ec" font="'JetBrains Mono', monospace" note="mark · favicon escalas">
    <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ background: "#fff8ec", padding: 18 }}>
          <PixelF unit={20}/>
        </div>
        <span style={{ fontSize: 10, opacity: 0.5 }}>128px</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ background: "#fff8ec", padding: 10 }}>
          <PixelF unit={10}/>
        </div>
        <span style={{ fontSize: 10, opacity: 0.5 }}>64px</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ background: "#fff8ec", padding: 4 }}>
          <PixelF unit={5}/>
        </div>
        <span style={{ fontSize: 10, opacity: 0.5 }}>32px</span>
      </div>
    </div>
  </Frame>
);
const F12_Header = () => (
  <Frame bg="#fff8ec" fg="#2a1810" font="'JetBrains Mono', monospace" padding={0} note="contexto · header del sitio" align="start">
    <div style={{ width: "100%", padding: "24px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px dashed #c9b698" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <PixelF unit={5}/>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em",
          fontFamily: "'Space Grotesk', sans-serif" }}>forjo.studio</div>
      </div>
      <div style={{ display: "flex", gap: 24, fontSize: 11, letterSpacing: "0.2em",
        textTransform: "uppercase", opacity: 0.65 }}>
        <span>work</span><span>about</span><span>contact</span>
      </div>
    </div>
    <div style={{ padding: "32px 40px" }}>
      <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 14 }}>{"// proyectos / 24"}</div>
      <div style={{ fontSize: 38, lineHeight: 1.1, fontWeight: 400,
        fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", maxWidth: 500 }}>
        Software a medida para gente que <strong>está empezando algo</strong>.
      </div>
    </div>
  </Frame>
);
const F12_Tab = () => (
  <Frame bg="#22252a" fg="#fff8ec" font="'JetBrains Mono', monospace" note="contexto · social avatar">
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 72, height: 72, background: "#fff8ec",
        display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
        <PixelF unit={9}/>
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
          forjo.studio
        </div>
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>@forjostudio · 1.2k followers</div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>building the web, one block at a time.</div>
      </div>
    </div>
  </Frame>
);

/* =========================================================================
   FINALIST 14 — F BLOCK + SPARK
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
const F14_Hero = () => (
  <Frame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" note="hero · light">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <FBlock size={108}/>
      <div>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "0.06em", opacity: 0.6, marginTop: 6 }}>studio</div>
      </div>
    </div>
  </Frame>
);
const F14_Dark = () => (
  <Frame bg="#0f0d0c" fg="#fbf3e3" font="'Space Grotesk', sans-serif" note="hero · dark · inverso">
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <FBlock size={108} bg="#fbf3e3" fg="#0f0d0c" spark="#ff5b1f"/>
      <div>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>forjo</div>
        <div style={{ fontSize: 18, fontWeight: 400, letterSpacing: "0.06em", opacity: 0.6, marginTop: 6 }}>studio</div>
      </div>
    </div>
  </Frame>
);
const F14_ColorAlts = () => (
  <Frame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" padding={36} note="bloques · 4 chispas">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, width: "100%" }}>
      {[
        ["#ff5b1f","ember"],
        ["#f4c543","amber"],
        ["#5b3df5","electric"],
        ["#1d6c4f","forest"],
      ].map(([c, n]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <FBlock size={60} spark={c}/>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.18em" }}>{n}</div>
        </div>
      ))}
    </div>
  </Frame>
);
const F14_Mark = () => (
  <Frame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" note="mark · escalas">
    <div style={{ display: "flex", alignItems: "flex-end", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <FBlock size={140}/>
        <span style={{ fontSize: 10, opacity: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>140</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <FBlock size={72}/>
        <span style={{ fontSize: 10, opacity: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>72</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <FBlock size={36}/>
        <span style={{ fontSize: 10, opacity: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>36</span>
      </div>
    </div>
  </Frame>
);
const F14_Header = () => (
  <Frame bg="#fbf3e3" fg="#0f0d0c" font="'Space Grotesk', sans-serif" padding={0} note="contexto · header del sitio" align="start">
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
  </Frame>
);
const F14_Social = () => (
  <Frame bg="#22252a" fg="#fbf3e3" font="'Space Grotesk', sans-serif" note="contexto · avatar redes">
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0d0c", position: "relative" }}>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.06em", color: "#fbf3e3" }}>F</div>
        <div style={{ position: "absolute", top: 12, right: 12, width: 14, height: 14,
          background: "#ff5b1f", borderRadius: "50%" }}/>
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Forjo Studio</div>
        <div style={{ fontSize: 13, opacity: 0.55, marginTop: 2 }}>@forjostudio</div>
        <div style={{ fontSize: 13, marginTop: 10, opacity: 0.8 }}>Web para los que prenden la mecha.</div>
      </div>
    </div>
  </Frame>
);

Object.assign(window, {
  F01_Hero, F01_Dark, F01_ColorAlts, F01_Mark, F01_Header, F01_Tab,
  F09_Hero, F09_Dark, F09_Palettes, F09_Mark, F09_Header, F09_Card,
  F12_Hero, F12_Dark, F12_ColorAlts, F12_Mark, F12_Header, F12_Tab,
  F14_Hero, F14_Dark, F14_ColorAlts, F14_Mark, F14_Header, F14_Social,
});
