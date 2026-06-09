// Forjo Studio site — sections

const { Logo, Kicker, Title, Button, BauhausComposition, ImagePlaceholder, BauhausF, FBlock } = window;

/* =========================================================================
   NAV
   ========================================================================= */
const Nav = ({ theme }) => (
  <nav style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "22px 56px", borderBottom: `1px solid ${theme.border}`,
    position: "sticky", top: 0, zIndex: 50,
    background: `${theme.bg}ee`, backdropFilter: "blur(8px)",
  }}>
    <Logo theme={theme} size={32}/>
    <div style={{
      display: "flex", alignItems: "center", gap: 32,
      fontFamily: theme.fontBody, fontSize: 14, color: theme.ink,
    }}>
      <a href="#servicios" style={{ color: theme.ink, textDecoration: "none", opacity: 0.75 }}>Servicios</a>
      <a href="#proceso" style={{ color: theme.ink, textDecoration: "none", opacity: 0.75 }}>Proceso</a>
      <a href="#trabajo" style={{ color: theme.ink, textDecoration: "none", opacity: 0.75 }}>Trabajo</a>
      <a href="#nosotros" style={{ color: theme.ink, textDecoration: "none", opacity: 0.75 }}>Nosotros</a>
      <Button primary theme={theme} href="#contacto">Cotizar →</Button>
    </div>
  </nav>
);

/* =========================================================================
   HERO
   ========================================================================= */
const Hero = ({ theme, headline, sub }) => {
  const isBauhaus = theme.name === "bauhaus";
  return (
    <section style={{ padding: "72px 56px 88px", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 64, alignItems: "center",
      }}>
        <div>
          <Kicker theme={theme} style={{ marginBottom: 28 }}>
            ▶ estudio web · buenos aires · est. 2025
          </Kicker>
          <Title theme={theme} size={isBauhaus ? 104 : 88}>
            {isBauhaus ? (
              <>
                Forjamos <span style={{ color: theme.accent }}>sitios</span><br/>
                que <em style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 400 }}>convierten</em>.
              </>
            ) : (
              <>
                {headline || "Sitios web con chispa para quienes están construyendo algo."}
              </>
            )}
          </Title>
          <p style={{
            fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.5,
            color: theme.muted, maxWidth: 480, marginTop: 28, marginBottom: 36,
          }}>
            {sub || "Diseño y desarrollo a medida para emprendedores, profesionales y marcas que necesitan más que un template."}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <Button primary large theme={theme} href="#contacto">Empecemos un proyecto →</Button>
            <Button large theme={theme} href="#trabajo">Ver trabajo</Button>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {isBauhaus ? (
            <BauhausComposition theme={theme}/>
          ) : (
            <div style={{
              position: "relative",
              padding: "40px 36px",
              background: theme.surface,
              border: `1px solid ${theme.border}`,
            }}>
              <FBlock size={120}
                bg={theme.isDark ? theme.cream : "#0f0d0c"}
                fg={theme.isDark ? "#0f0d0c" : theme.cream}
                spark={theme.accent}/>
              <div style={{
                marginTop: 32, fontFamily: theme.fontMono, fontSize: 11,
                color: theme.muted, letterSpacing: "0.2em", textTransform: "uppercase",
              }}>
                <div style={{ marginBottom: 8 }}>$ forjo --init</div>
                <div style={{ marginBottom: 8 }}>$ forjo design --responsive</div>
                <div style={{ color: theme.accent }}>$ forjo ship --celebrate ✦</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/* =========================================================================
   MARQUEE / TRUST STRIP
   ========================================================================= */
const Marquee = ({ theme }) => {
  const items = [
    "Sitios institucionales", "Optimizaciones SEO", "Landing pages",
    "Software a medida", "Auditoría de negocios",
    "Branding digital", "Mantenimiento", "Hosting + dominio",
  ];
  const all = [...items, ...items, ...items];
  return (
    <div style={{
      borderBottom: `1px solid ${theme.border}`,
      overflow: "hidden", padding: "20px 0",
      background: theme.surface,
    }}>
      <div style={{
        display: "flex", gap: 56, whiteSpace: "nowrap",
        animation: "marquee 35s linear infinite",
        fontFamily: theme.fontDisplay,
        fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.01em",
        color: theme.ink,
      }}>
        {all.map((it, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 56 }}>
            <span style={{ color: theme.accent, fontSize: 10 }}>◆</span>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
};

/* =========================================================================
   SERVICES
   ========================================================================= */
const Services = ({ theme }) => {
  const services = [
    {
      n: "01",
      title: "Sitios institucionales",
      desc: "Tu marca con presencia profesional. Para estudios, consultoras, agencias y profesionales independientes.",
      bullets: ["Diseño a medida", "CMS editable", "SEO básico", "Hosting incluido"],
    },
    {
      n: "02",
      title: "Optimizaciones SEO",
      desc: "Que Google te encuentre y que tus visitas se vuelvan clientes. SEO técnico, contenido y performance.",
      bullets: ["Auditoría técnica", "Core Web Vitals", "Schema + metas", "Contenido orientado"],
    },
    {
      n: "03",
      title: "Landing pages",
      desc: "Páginas pensadas para convertir: lanzamientos, campañas, captación de leads.",
      bullets: ["Copy persuasivo", "A/B testing", "Analytics", "Integración con CRM"],
    },
    {
      n: "04",
      title: "Software a medida",
      desc: "Aplicaciones web internas para gestionar tu negocio: dashboards, CRMs, herramientas operativas.",
      bullets: ["React + Node", "Base de datos", "Autenticación", "API integraciones"],
    },
    {
      n: "05",
      title: "Auditoría de negocios",
      desc: "Diagnóstico digital de tu negocio: qué funciona, qué se rompe, qué oportunidad estás dejando pasar.",
      bullets: ["Análisis web + UX", "Funnel de conversión", "Stack tecnológico", "Roadmap accionable"],
    },
  ];

  const total = String(services.length).padStart(2, "0");

  return (
    <section id="servicios" style={{ padding: "96px 56px", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 64, alignItems: "start", marginBottom: 56 }}>
        <div>
          <Kicker theme={theme} style={{ marginBottom: 16 }}>◆ servicios</Kicker>
          <Title theme={theme} size={56}>Lo que forjamos.</Title>
        </div>
        <p style={{ fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.5, color: theme.muted, margin: 0, maxWidth: 520, paddingTop: 28 }}>
          Cinco líneas de trabajo, todas a medida. Cada proyecto arranca con una conversación honesta sobre qué necesitás, qué no, y cuál es la forma más simple de llegar.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0, border: `1px solid ${theme.border}` }}>
        {services.map((s, i) => (
          <div key={s.n} style={{
            padding: 40,
            borderRight: i % 2 === 0 ? `1px solid ${theme.border}` : "none",
            borderBottom: i < services.length - 1 ? `1px solid ${theme.border}` : "none",
            background: theme.surface,
            position: "relative",
          }}>
            <div style={{
              fontFamily: theme.fontMono, fontSize: 13, color: theme.muted,
              letterSpacing: "0.18em", marginBottom: 24,
            }}>{s.n} / {total}</div>
            <Title theme={theme} size={36} style={{ marginBottom: 14 }}>{s.title}</Title>
            <p style={{
              fontFamily: theme.fontBody, fontSize: 16, lineHeight: 1.55,
              color: theme.muted, margin: "0 0 24px", maxWidth: 440,
            }}>{s.desc}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {s.bullets.map(b => (
                <span key={b} style={{
                  fontFamily: theme.fontMono, fontSize: 11,
                  padding: "6px 10px", border: `1px solid ${theme.border}`,
                  color: theme.ink, letterSpacing: "0.04em",
                }}>{b}</span>
              ))}
            </div>
          </div>
        ))}

        {/* 6th cell — soft CTA filler so the 2-col grid stays clean */}
        <a href="#contacto" style={{
          padding: 40, textDecoration: "none",
          background: theme.bg,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          minHeight: 220, color: theme.ink, cursor: "pointer",
          transition: "background 0.2s ease",
        }}
        onMouseEnter={e=>e.currentTarget.style.background = theme.accent}
        onMouseLeave={e=>e.currentTarget.style.background = theme.bg}>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 13, color: theme.muted,
            letterSpacing: "0.18em",
          }}>◇ / {total}+</div>
          <div>
            <Title theme={theme} size={36} style={{ marginBottom: 12 }}>
              ¿Algo más?
            </Title>
            <p style={{
              fontFamily: theme.fontBody, fontSize: 15, lineHeight: 1.5,
              color: theme.muted, margin: "0 0 18px", maxWidth: 360,
            }}>
              Si lo que necesitás no está acá, igual contanos. Probablemente lo podamos hacer.
            </p>
            <div style={{
              fontFamily: theme.fontMono, fontSize: 12, letterSpacing: "0.2em",
              textTransform: "uppercase", color: theme.ink,
              borderBottom: `1px solid ${theme.ink}`, paddingBottom: 2, display: "inline-block",
            }}>Hablemos →</div>
          </div>
        </a>
      </div>
    </section>
  );
};

/* =========================================================================
   PROCESS — the "forging" metaphor in 4 steps
   ========================================================================= */
const Process = ({ theme }) => {
  const steps = [
    {
      n: "01",
      label: "encender",
      title: "Descubrimiento",
      desc: "Empezamos con una llamada larga. Te escuchamos: tu negocio, tu público, qué te traba hoy. Salimos con un plan claro y un presupuesto cerrado.",
    },
    {
      n: "02",
      label: "moldear",
      title: "Diseño",
      desc: "Wireframes primero, después diseño visual. Iteramos con vos en vivo — sin idas y vueltas eternas por mail. Aprobás cada pantalla antes de seguir.",
    },
    {
      n: "03",
      label: "templar",
      title: "Desarrollo",
      desc: "Código limpio, responsive, rápido. Te damos acceso a una preview desde el día uno para que veas el avance y opines.",
    },
    {
      n: "04",
      label: "entregar",
      title: "Lanzamiento",
      desc: "Hosting, dominio, certificados, capacitación. Salimos al aire juntos y te acompañamos los primeros 30 días para ajustar lo que haga falta.",
    },
  ];
  return (
    <section id="proceso" style={{
      padding: "96px 56px",
      background: theme.isDark ? "#0f0d0c" : "#1a1714",
      color: theme.cream,
      borderBottom: `1px solid ${theme.border}`,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 64, alignItems: "start", marginBottom: 56 }}>
        <div>
          <Kicker theme={{ ...theme, muted: "rgba(243,234,216,0.55)", fontMono: theme.fontMono }} style={{ marginBottom: 16 }}>
            ◆ proceso
          </Kicker>
          <Title theme={{ ...theme, ink: theme.cream, fontDisplay: theme.fontDisplay, displayCase: theme.displayCase, displayWeight: theme.displayWeight, displayTracking: theme.displayTracking }} size={56}>
            Cómo forjamos.
          </Title>
        </div>
        <p style={{
          fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.5,
          color: "rgba(243,234,216,0.7)", margin: 0, maxWidth: 520, paddingTop: 28,
        }}>
          Cuatro etapas, cada una con entregables claros. Sin sorpresas, sin "fees ocultos", sin proyectos que se eternizan.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{
            paddingTop: 28, borderTop: `2px solid ${theme.accent}`,
          }}>
            <div style={{
              fontFamily: theme.fontMono, fontSize: 12, letterSpacing: "0.18em",
              color: "rgba(243,234,216,0.55)", marginBottom: 12,
            }}>
              {s.n} · {s.label.toUpperCase()}
            </div>
            <div style={{
              fontFamily: theme.fontDisplay, fontSize: 28, fontWeight: theme.displayWeight,
              letterSpacing: theme.displayTracking, color: theme.cream,
              textTransform: theme.displayCase, marginBottom: 14, lineHeight: 1,
            }}>{s.title}</div>
            <p style={{
              fontFamily: theme.fontBody, fontSize: 14, lineHeight: 1.55,
              color: "rgba(243,234,216,0.7)", margin: 0,
            }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

/* =========================================================================
   WORK — placeholder case studies
   ========================================================================= */
const Work = ({ theme }) => {
  const projects = [
    { name: "Estudio Norte", cat: "Sitio institucional", year: "2025", color: "#d94a2b" },
    { name: "Mendoza Vinos", cat: "Auditoría + SEO", year: "2025", color: "#2a5fa5" },
    { name: "Mercado Andino", cat: "Software interno", year: "2024", color: "#1d6c4f" },
  ];
  return (
    <section id="trabajo" style={{ padding: "96px 56px", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
        <div>
          <Kicker theme={theme} style={{ marginBottom: 16 }}>◆ trabajo · selección</Kicker>
          <Title theme={theme} size={56}>Proyectos recientes.</Title>
        </div>
        <a href="#" style={{
          fontFamily: theme.fontMono, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
          color: theme.ink, textDecoration: "none", borderBottom: `1px solid ${theme.ink}`, paddingBottom: 2,
        }}>Ver todos →</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        {projects.map(p => (
          <div key={p.name} style={{ cursor: "pointer" }}>
            <div style={{
              position: "relative", height: 320, overflow: "hidden",
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              {/* abstract project visual */}
              <div style={{
                position: "absolute", inset: 0,
                background: `repeating-linear-gradient(45deg, ${theme.surface}, ${theme.surface} 12px, ${theme.bg} 12px, ${theme.bg} 24px)`,
              }}/>
              <div style={{
                position: "absolute", top: 24, left: 24,
                width: 64, height: 64, background: p.color,
              }}/>
              <div style={{
                position: "absolute", bottom: 24, right: 24,
                fontFamily: theme.fontMono, fontSize: 10,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: theme.muted,
              }}>{`<screenshot del proyecto>`}</div>
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{
                  fontFamily: theme.fontDisplay, fontSize: 22, fontWeight: theme.displayWeight,
                  letterSpacing: theme.displayTracking, color: theme.ink,
                  textTransform: theme.displayCase, lineHeight: 1,
                }}>{p.name}</div>
                <div style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.muted, marginTop: 6, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  {p.cat}
                </div>
              </div>
              <div style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.muted, letterSpacing: "0.18em" }}>
                {p.year}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/* =========================================================================
   ABOUT — statement + numbers
   ========================================================================= */
const About = ({ theme }) => {
  const stats = [
    { k: "24", v: "proyectos lanzados" },
    { k: "100%", v: "código propio · sin templates" },
    { k: "2-6", v: "semanas por proyecto" },
    { k: "1", v: "punto de contacto · sin pelota a otra área" },
  ];
  return (
    <section id="nosotros" style={{ padding: "96px 56px", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <Kicker theme={theme} style={{ marginBottom: 16 }}>◆ nosotros</Kicker>
          <Title theme={theme} size={64} style={{ marginBottom: 28 }}>
            Estudio chico,<br/>
            ambición <em style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 400, color: theme.accent }}>grande</em>.
          </Title>
          <p style={{ fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.55, color: theme.muted, margin: "0 0 18px", maxWidth: 540 }}>
            Forjo es un estudio independiente que cree en la artesanía digital: pocos proyectos por mes, máxima atención a cada uno, código que entendemos línea por línea.
          </p>
          <p style={{ fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.55, color: theme.muted, margin: 0, maxWidth: 540 }}>
            No tercerizamos diseño ni desarrollo. Hablás siempre con la persona que está construyendo tu proyecto.
          </p>
        </div>

        <div>
          {stats.map((s, i) => (
            <div key={i} style={{
              padding: "20px 0",
              borderTop: i === 0 ? `1px solid ${theme.border}` : "none",
              borderBottom: `1px solid ${theme.border}`,
              display: "flex", alignItems: "baseline", gap: 24,
            }}>
              <div style={{
                fontFamily: theme.fontDisplay, fontSize: 52, fontWeight: theme.displayWeight,
                letterSpacing: theme.displayTracking, color: theme.ink, lineHeight: 1,
                textTransform: theme.displayCase, flexShrink: 0, minWidth: 120,
              }}>{s.k}</div>
              <div style={{
                fontFamily: theme.fontBody, fontSize: 15, color: theme.muted, lineHeight: 1.4,
              }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* =========================================================================
   CONTACT — big CTA block
   ========================================================================= */
const Contact = ({ theme }) => {
  return (
    <section id="contacto" style={{
      padding: "112px 56px",
      background: theme.accent,
      color: theme.accent === "#f4c543" ? "#1a1714" : "#fbf3e3",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.22em",
            textTransform: "uppercase", opacity: 0.75, marginBottom: 24,
          }}>◆ hablemos</div>
          <h2 style={{
            fontFamily: theme.fontDisplay, fontSize: 88, fontWeight: theme.displayWeight,
            letterSpacing: theme.displayTracking, lineHeight: 0.95, margin: "0 0 24px",
            textTransform: theme.displayCase, textWrap: "balance",
          }}>
            ¿Tenés una idea?<br/>Vamos a forjarla.
          </h2>
          <p style={{ fontFamily: theme.fontBody, fontSize: 19, lineHeight: 1.55, opacity: 0.85, margin: 0, maxWidth: 480 }}>
            Contanos en un par de líneas qué tenés en mente. Te respondemos en menos de 24hs con una primera idea y un plan.
          </p>
        </div>

        <div style={{
          background: theme.accent === "#f4c543" ? "#1a1714" : "#0f0d0c",
          color: theme.accent === "#f4c543" ? "#fbf3e3" : "#fbf3e3",
          padding: 36,
        }}>
          <div style={{ fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.55, marginBottom: 18 }}>
            ◇ contacto directo
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <a href="mailto:hola@forjo.studio" style={{
              fontFamily: theme.fontDisplay, fontSize: 28, fontWeight: theme.displayWeight,
              letterSpacing: "-0.03em", color: "inherit", textDecoration: "none",
              borderBottom: "1px solid currentColor", paddingBottom: 4,
            }}>hola@forjo.studio</a>
            <a href="#" style={{
              fontFamily: theme.fontBody, fontSize: 15, color: "inherit", opacity: 0.7,
              textDecoration: "none", display: "flex", alignItems: "center", gap: 10,
            }}>WhatsApp · +54 11 4444-5555 →</a>
            <a href="#" style={{
              fontFamily: theme.fontBody, fontSize: 15, color: "inherit", opacity: 0.7,
              textDecoration: "none", display: "flex", alignItems: "center", gap: 10,
            }}>Agendar una llamada de 30min →</a>
          </div>
        </div>
      </div>
    </section>
  );
};

/* =========================================================================
   FOOTER
   ========================================================================= */
const Footer = ({ theme }) => (
  <footer style={{
    padding: "48px 56px 32px",
    background: theme.isDark ? "#0f0d0c" : "#1a1714",
    color: theme.cream,
  }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 48, marginBottom: 56 }}>
      <div>
        <Logo theme={{ ...theme, ink: theme.cream, isDark: true }} size={36}/>
        <p style={{
          fontFamily: theme.fontBody, fontSize: 14, lineHeight: 1.5,
          color: "rgba(243,234,216,0.6)", marginTop: 20, maxWidth: 320,
        }}>
          Estudio web independiente. Diseño y desarrollo a medida, hecho con cuidado en Buenos Aires.
        </p>
      </div>
      {[
        { title: "Estudio", links: ["Servicios", "Proceso", "Trabajo", "Nosotros"] },
        { title: "Recursos", links: ["Blog", "Guías", "Cotizador", "Preguntas frecuentes"] },
        { title: "Contacto", links: ["hola@forjo.studio", "WhatsApp", "Instagram", "LinkedIn"] },
      ].map(col => (
        <div key={col.title}>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "rgba(243,234,216,0.5)", marginBottom: 18,
          }}>{col.title}</div>
          {col.links.map(l => (
            <div key={l} style={{
              fontFamily: theme.fontBody, fontSize: 14, color: theme.cream,
              marginBottom: 10, opacity: 0.8, cursor: "pointer",
            }}>{l}</div>
          ))}
        </div>
      ))}
    </div>
    <div style={{
      paddingTop: 24, borderTop: "1px solid rgba(243,234,216,0.12)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontFamily: theme.fontMono, fontSize: 11, letterSpacing: "0.18em",
      textTransform: "uppercase", color: "rgba(243,234,216,0.5)",
    }}>
      <span>© 2026 Forjo Studio · todos los derechos reservados</span>
      <span>v1.0 · forjo.studio</span>
    </div>
  </footer>
);

Object.assign(window, { Nav, Hero, Marquee, Services, Process, Work, About, Contact, Footer });
