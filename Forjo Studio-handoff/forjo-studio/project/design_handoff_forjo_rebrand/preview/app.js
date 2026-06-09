// Forjo App rebrand preview — data + interactions

/* ---------- sample data ---------- */
const TODAY = [
  { t:'09:00', name:'Camila Ríos',     svc:'Lifting de pestañas',  pro:'Sofía',    st:'confirmed' },
  { t:'10:30', name:'Marina López',    svc:'Laminado de cejas',    pro:'Sofía',    st:'confirmed' },
  { t:'11:30', name:'Julieta Paz',     svc:'Perfilado de cejas',   pro:'Vale',     st:'pending'   },
  { t:'13:00', name:'Abril Gómez',     svc:'Lifting + tinte',      pro:'Sofía',    st:'confirmed' },
  { t:'15:00', name:'Renata Díaz',     svc:'Laminado de cejas',    pro:'Vale',     st:'completed' },
  { t:'16:30', name:'Lucía Fernández', svc:'Perfilado de cejas',   pro:'Vale',     st:'pending'   },
  { t:'18:00', name:'Pilar Sosa',      svc:'Lifting de pestañas',  pro:'Sofía',    st:'confirmed' },
];
const TURNOS = [
  { t:'Vie 6 · 09:00', name:'Camila Ríos',     svc:'Lifting de pestañas', pro:'Sofía', price:'$22.000', st:'confirmed' },
  { t:'Vie 6 · 10:30', name:'Marina López',    svc:'Laminado de cejas',   pro:'Sofía', price:'$18.000', st:'confirmed' },
  { t:'Vie 6 · 11:30', name:'Julieta Paz',     svc:'Perfilado de cejas',  pro:'Vale',  price:'$9.000',  st:'pending'   },
  { t:'Sáb 7 · 13:00', name:'Abril Gómez',     svc:'Lifting + tinte',     pro:'Sofía', price:'$26.000', st:'confirmed' },
  { t:'Sáb 7 · 15:00', name:'Renata Díaz',     svc:'Laminado de cejas',   pro:'Vale',  price:'$18.000', st:'pending'   },
  { t:'Lun 9 · 16:30', name:'Lucía Fernández', svc:'Perfilado de cejas',  pro:'Vale',  price:'$9.000',  st:'cancelled' },
];
const ST_LABEL = { pending:'Pendiente', confirmed:'Confirmado', completed:'Completado', cancelled:'Cancelado' };
const SERVICES = [
  { name:'Lifting de pestañas', meta:'45 min', price:'$22.000' },
  { name:'Laminado de cejas',   meta:'40 min', price:'$18.000' },
  { name:'Perfilado de cejas',  meta:'20 min', price:'$9.000'  },
  { name:'Lifting + tinte',     meta:'60 min', price:'$26.000' },
];
const PALETTES = [
  { id:'red',    name:'Rojo Forjo',    meta:'Principal',     sw:['#d94a2b','#1a1714','#f4c543'] },
  { id:'blue',   name:'Azul',          meta:'Constructivista',sw:['#2a5fa5','#1a1714','#f4c543'] },
  { id:'yellow', name:'Ocre',          meta:'Cálido',        sw:['#c8901a','#1a1714','#d94a2b'] },
  { id:'green',  name:'Verde',         meta:'Bosque',        sw:['#2f8a5b','#1a1714','#f4c543'] },
  { id:'ink',    name:'Tinta',         meta:'Monocromo',     sw:['#1a1714','#6b6253','#d9ceb4'] },
];

/* ---------- render lists ---------- */
function avatar(n){ return `<div class="favatar">${n.charAt(0)}</div>`; }

document.getElementById('today-list').innerHTML = TODAY.map(a=>`
  <div class="todo-row">
    <span class="todo-time">${a.t}</span>
    <div class="flex-1 min0"><div style="font-weight:600;font-size:13.5px" class="truncate">${a.name}</div>
      <div class="muted text-xs truncate">${a.svc} · ${a.pro}</div></div>
    <span class="fbadge b-${a.st}"><span class="fbadge-dot" style="background:currentColor"></span>${ST_LABEL[a.st]}</span>
  </div>`).join('');

document.getElementById('turnos-rows').innerHTML = TURNOS.map(a=>`
  <tr>
    <td style="font-weight:600;white-space:nowrap" class="mono">${a.t}</td>
    <td><div class="flex items-center gap-2">${avatar(a.name)}<span style="font-weight:600">${a.name}</span></div></td>
    <td>${a.svc}</td>
    <td class="muted">${a.pro}</td>
    <td style="font-weight:700;font-family:var(--font-heading)">${a.price}</td>
    <td><span class="fbadge b-${a.st}"><span class="fbadge-dot" style="background:currentColor"></span>${ST_LABEL[a.st]}</span></td>
    <td><button class="fbtn fbtn-ghost fbtn-icon" title="Más">⋯</button></td>
  </tr>`).join('');

document.getElementById('pub-svcs').innerHTML = SERVICES.map((s,i)=>`
  <div class="svc ${i===0?'sel':''}" data-svc="${i}">
    <div class="sname">${s.name}</div><div class="smeta">${s.meta}</div><div class="sprice">${s.price}</div>
  </div>`).join('');
const DAYS=[['Vie','6'],['Sáb','7'],['Lun','9'],['Mar','10'],['Mié','11']];
document.getElementById('pub-days').innerHTML = DAYS.map((d,i)=>`
  <div class="pill ${i===0?'sel':''}" data-day="${i}"><div class="pd">${d[0]}</div><div class="pn">${d[1]}</div></div>`).join('');
const TIMES=['10:00','11:30','13:00','15:00','16:30','18:00'];
document.getElementById('pub-times').innerHTML = TIMES.map((t,i)=>`
  <div class="pill ${i===3?'sel':''}" data-time="${i}"><div class="pn" style="font-size:16px">${t}</div></div>`).join('');

document.getElementById('svc-config').innerHTML = SERVICES.map(s=>`
  <div class="flex items-center gap-3" style="padding:12px;border-radius:var(--r-md);background:color-mix(in oklab,var(--secondary) 55%,transparent);margin-bottom:8px">
    <div class="flex-1"><div style="font-weight:600;font-size:13.5px">${s.name}</div><div class="muted text-xs">${s.meta} · ${s.price}</div></div>
    <button class="fbtn fbtn-ghost fbtn-sm">Desactivar</button>
    <button class="fbtn fbtn-ghost fbtn-icon" style="color:var(--muted-foreground)">🗑</button>
  </div>`).join('') + `
  <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
    <div class="flabel">Agregar servicio</div>
    <div class="flex gap-2 wrap"><input class="finput" style="flex:2" placeholder="Nombre"/><input class="finput" style="flex:1" placeholder="Min."/><input class="finput" style="flex:1" placeholder="Precio"/><button class="fbtn fbtn-primary fbtn-icon">+</button></div>
  </div>`;

/* ---------- palette cards (settings) ---------- */
const palWrap = document.getElementById('palette-cards');
palWrap.innerHTML = PALETTES.map(p=>`
  <button class="pcard" data-p="${p.id}">
    <div class="swatch">${p.sw.map(c=>`<i style="background:${c}"></i>`).join('')}</div>
    <div class="flex items-center"><div><div class="pname">${p.name}</div><div class="pmeta">${p.meta}</div></div><span class="check">✓</span></div>
  </button>`).join('');

/* ---------- state + switching ---------- */
const root = document.documentElement;
function flushNoTransition(){
  root.classList.add('notransition');
  // force reflow so the class takes effect, then drop it next frame
  void root.offsetWidth;
  requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.remove('notransition')));
}
function setPalette(p){
  flushNoTransition();
  root.dataset.palette = p;
  localStorage.setItem('forjo-palette', p);
  document.querySelectorAll('#pdots .pdot').forEach(d=>d.classList.toggle('active', d.dataset.p===p));
  document.querySelectorAll('#palette-cards .pcard').forEach(c=>c.classList.toggle('sel', c.dataset.p===p));
}
function setMode(m){
  flushNoTransition();
  root.classList.toggle('dark', m==='dark');
  localStorage.setItem('forjo-mode', m);
  document.getElementById('modebtn').textContent = m==='dark' ? '☀' : '☾';
  document.querySelectorAll('#mode-seg button').forEach(b=>b.classList.toggle('on', b.dataset.m===m));
}

document.getElementById('pdots').addEventListener('click', e=>{ const b=e.target.closest('.pdot'); if(b) setPalette(b.dataset.p); });
palWrap.addEventListener('click', e=>{ const b=e.target.closest('.pcard'); if(b) setPalette(b.dataset.p); });
document.getElementById('mode-seg').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b) setMode(b.dataset.m); });
document.getElementById('modebtn').addEventListener('click', ()=> setMode(root.classList.contains('dark')?'light':'dark'));

/* config sub-tabs */
document.getElementById('cfgtabs').addEventListener('click', e=>{
  const b=e.target.closest('.cfgtab'); if(!b) return;
  document.querySelectorAll('.cfgtab').forEach(t=>t.classList.toggle('active', t===b));
  document.querySelectorAll('.cfgpane').forEach(p=>p.classList.toggle('active', p.dataset.t===b.dataset.t));
});

/* public booking selections */
['pub-svcs','pub-days','pub-times'].forEach(id=>{
  document.getElementById(id).addEventListener('click', e=>{
    const item = e.target.closest('[data-svc],[data-day],[data-time]'); if(!item) return;
    item.parentElement.querySelectorAll('.svc,.pill').forEach(x=>x.classList.remove('sel'));
    item.classList.add('sel');
  });
});

/* ---------- clientes ---------- */
const CLIENTS = [
  { name:'Abril Gómez',     n:182, visits:4, st:'active'   },
  { name:'Camila Ríos',     n:203, visits:9, st:'frequent' },
  { name:'Carla Méndez',    n:88,  visits:1, st:'new'      },
  { name:'Delfina Soto',    n:140, visits:6, st:'frequent' },
  { name:'Florencia Ruiz',  n:57,  visits:2, st:'active'   },
  { name:'Julieta Paz',     n:199, visits:1, st:'new'      },
  { name:'Marina López',    n:120, visits:7, st:'paused'   },
  { name:'Renata Díaz',     n:165, visits:3, st:'active'   },
  { name:'Valentina Cruz',  n:44,  visits:11,st:'frequent' },
];
const ST_CL = { new:['NUEVA','d-new'], active:['ACTIVA','d-active'], frequent:['FRECUENTE','d-frequent'], paused:['PAUSA','d-paused'] };
const ST_BG = { new:'var(--bau-red)', active:'#3fa46a', frequent:'var(--bau-yellow)', paused:'#9a9183' };

(function renderClientes(){
  // alphabet
  const present = new Set(CLIENTS.map(c=>c.name[0].toUpperCase()));
  document.getElementById('cl-abc').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')
    .map(l=>`<b class="${present.has(l)?'has':'no'}">${l}</b>`).join('');
  // grouped list
  const byLetter = {};
  CLIENTS.forEach(c=>{ const L=c.name[0].toUpperCase(); (byLetter[L]=byLetter[L]||[]).push(c); });
  let html='';
  Object.keys(byLetter).sort().forEach(L=>{
    html += `<div class="cl-letter">${L}</div>`;
    html += byLetter[L].map(c=>{
      const sel = c.name==='Camila Ríos';
      return `<button class="cl-item ${sel?'on':''}" data-name="${c.name}">
        <span class="favatar" style="${sel?'background:var(--primary);color:var(--primary-foreground)':''}">${c.name.slice(0,2).toUpperCase()}</span>
        <span class="flex-1 min0"><span style="display:block;font-weight:600;font-size:13px" class="truncate">${c.name}</span>
        <span class="muted text-xs">#${String(c.n).padStart(3,'0')} · ${c.visits} visitas</span></span>
        <span class="cl-dot ${ST_CL[c.st][1]}"></span></button>`;
    }).join('');
  });
  document.getElementById('cl-listbody').innerHTML = html;

  // detail — Camila Ríos
  const visitChart = [2,1,3,0,2,1];
  document.getElementById('cl-detail').innerHTML = `
    <div class="flex items-center gap-2" style="margin-bottom:8px">
      <span class="st-badge" style="background:var(--bau-yellow)">FRECUENTE</span>
      <span class="muted text-xs mono">FICHA #203</span>
    </div>
    <h2 style="font-family:var(--font-heading);font-weight:900;font-size:30px;letter-spacing:-.02em;text-transform:uppercase;line-height:1">Camila Ríos</h2>
    <div class="flex items-center gap-3 muted text-sm wrap" style="margin-top:8px">
      <span class="flex items-center gap-1">📱 +54 9 348 712-0934</span><span>alta hace 14 meses</span><span class="flex items-center gap-1">✉ camila.rios@mail.com</span>
    </div>
    <div class="flex gap-2 wrap" style="margin-top:14px">
      <button class="fbtn fbtn-sm" style="background:#16a34a;color:#fff">WhatsApp</button>
      <button class="fbtn fbtn-outline fbtn-sm">Editar</button>
      <button class="fbtn fbtn-outline fbtn-sm" style="color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 40%,transparent)">Eliminar</button>
    </div>
    <div class="grid gap-3" style="grid-template-columns:repeat(4,1fr);margin:22px 0">
      ${[['VISITAS','9','en 14 meses'],['GASTO TOTAL','$184.000','histórico'],['TICKET PROM.','$20.444','por visita'],['ÚLTIMA VISITA','este mes · 28 may','']].map(c=>`
        <div class="clstat"><div class="l">${c[0]}</div><div class="v">${c[1]}</div>${c[2]?`<div class="s">${c[2]}</div>`:''}</div>`).join('')}
    </div>
    <div class="suggest" style="border-color:color-mix(in oklab,var(--bau-yellow) 40%,transparent);background:color-mix(in oklab,var(--bau-yellow) 12%,transparent);margin-bottom:22px">
      <span style="font-size:16px">💡</span>
      <div class="flex-1"><div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:#9a6f12;margin-bottom:3px">CLIENTE FRECUENTE</div>
        <div class="muted text-sm">Alta fidelidad, considerá un beneficio de cliente VIP.</div></div>
      <button class="fbtn fbtn-outline fbtn-sm">Marcar seguimiento</button>
    </div>
    <div class="sect-h">SERVICIOS REALIZADOS</div>
    ${[['Lifting de pestañas','5 veces','$22.000'],['Laminado de cejas','3 veces','$18.000'],['Perfilado de cejas','1 vez','$9.000']].map(s=>`
      <div class="row-line"><span class="flex-1 truncate">${s[0]}</span><span class="muted text-xs">${s[1]}</span><span style="font-weight:600">${s[2]}</span></div>`).join('')}
    <div class="grid gap-5" style="grid-template-columns:1fr 1fr;margin-top:22px">
      <div>
        <div class="sect-h">HISTORIAL DE VISITAS (9)</div>
        ${[['28 may','15:00','Lifting de pestañas','$22.000'],['02 may','16:30','Laminado de cejas','$18.000'],['11 abr','11:00','Lifting de pestañas','$22.000'],['20 mar','15:30','Perfilado de cejas','$9.000']].map(v=>`
          <div class="row-line" style="font-size:12px;gap:8px"><span class="muted" style="width:46px">${v[0]}</span><span class="mono" style="width:38px">${v[1]}</span><span class="flex-1 truncate">${v[2]}</span><span class="muted">${v[3]}</span></div>`).join('')}
      </div>
      <div>
        <div class="sect-h">VISITAS POR MES</div>
        <div class="fcard" style="padding:8px">
          <div class="vbars">${visitChart.map((v,i)=>`<div class="vbar"><div class="bar" style="height:${v/3*100}%"></div><div class="bl">${['dic','ene','feb','mar','abr','may'][i]}</div></div>`).join('')}</div>
        </div>
      </div>
    </div>`;

  // list interaction
  document.getElementById('cl-listbody').addEventListener('click', e=>{
    const b=e.target.closest('.cl-item'); if(!b) return;
    document.querySelectorAll('.cl-item').forEach(x=>{ x.classList.remove('on'); const av=x.querySelector('.favatar'); av.style.background=''; av.style.color=''; });
    b.classList.add('on'); const av=b.querySelector('.favatar'); av.style.background='var(--primary)'; av.style.color='var(--primary-foreground)';
  });
  document.getElementById('cl-pills').addEventListener('click', e=>{
    const b=e.target.closest('.cl-pill'); if(!b) return;
    document.querySelectorAll('.cl-pill').forEach(x=>x.classList.toggle('on', x===b));
  });
})();

/* ---------- finanzas ---------- */
(function renderFinanzas(){
  const months=['ene','feb','mar','abr','may','jun'];
  const ing=[320,410,380,520,486,486], egr=[180,210,240,260,214,214];
  const max=Math.max(...ing,...egr);
  document.getElementById('fin-gbars').innerHTML = months.map((m,i)=>`
    <div class="gbar"><div class="pair"><i class="in" style="height:${ing[i]/max*100}%"></i><i class="eg" style="height:${egr[i]/max*100}%"></i></div><div class="bl">${m}</div></div>`).join('');

  const rank=[['Lifting de pestañas',242000,11],['Laminado de cejas',144000,8],['Lifting + tinte',104000,4],['Perfilado de cejas',63000,7],['Venta productos',48000,12]];
  const rmax=rank[0][1];
  document.getElementById('fin-ranking').innerHTML = rank.map(r=>`
    <div class="hbar-row"><div class="top"><span class="truncate">${r[0]}</span><span class="mono">$${r[1].toLocaleString('es-AR')} <span class="muted text-xs">· ${r[2]}</span></span></div>
    <div class="hbar"><i style="width:${r[1]/rmax*100}%;background:var(--primary)"></i></div></div>`).join('');

  const fixed=[['Alquiler','Mensual · vence el 10',80000],['Luz','Bimestral',18000],['Internet','Mensual',12000],['Celular','Mensual',8000]];
  const fmax=fixed[0][2];
  document.getElementById('fin-fixed').innerHTML =
    `<p class="text-xs muted" style="margin-bottom:10px">Total mensual: <strong style="color:var(--destructive)">$118.000</strong></p>` +
    fixed.map(f=>`
    <div class="hbar-row"><div class="top"><div class="min0"><span style="font-weight:600;display:block">${f[0]}</span><span class="muted text-xs">${f[1]}</span></div>
    <span class="mono" style="color:var(--destructive);font-weight:600">$${f[2].toLocaleString('es-AR')}<span class="muted text-xs">/mes</span></span></div>
    <div class="hbar"><i style="width:${f[2]/fmax*100}%;background:var(--destructive);opacity:.72"></i></div></div>`).join('');

  const tx=[['4 jun 09:00','Camila Ríos','Lifting de pestañas','$22.000','paid'],['4 jun 10:30','Marina López','Laminado de cejas','$18.000','cobrar'],['3 jun 16:30','Lucía Fernández','Perfilado de cejas','$9.000','paid'],['3 jun 11:00','Abril Gómez','Lifting + tinte','$26.000','cobrar']];
  document.getElementById('fin-txrows').innerHTML = tx.map(t=>`
    <div class="row-line" style="margin-bottom:8px"><span class="muted" style="width:108px;flex-shrink:0">${t[0]}</span>
    <span class="flex-1 truncate" style="font-weight:600">${t[1]}</span>
    <span class="muted text-xs truncate" style="max-width:140px">${t[2]}</span>
    <span style="font-weight:700">${t[3]}</span>
    ${t[4]==='paid'?'<span class="fbadge b-completed" style="flex-shrink:0">Pagado</span>':'<button class="fbtn fbtn-outline fbtn-sm">Cobrar</button>'}</div>`).join('');
})();

/* ---------- historia clínica ---------- */
(function renderHistoria(){
  const notes=[
    ['4 de junio de 2026','Control post-tratamiento. Buena evolución, sin signos de inflamación. Se indica continuar con cuidados domiciliarios por 7 días.'],
    ['12 de mayo de 2026','Primera consulta. Paciente refiere molestias leves. Se solicita estudio complementario y se pauta seguimiento en 3 semanas.'],
    ['2 de abril de 2026','Consulta inicial. Se registra antecedente de obra social OSDE 310. Sin alergias conocidas.'],
  ];
  document.getElementById('hc-notes').innerHTML = notes.map(n=>`
    <div class="hc-node"><div class="fcard" style="padding:12px 14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:5px">${n[0]}</div>
      <div class="muted text-sm" style="line-height:1.5">${n[1]}</div></div></div>`).join('');
  const files=[['estudio-laboratorio.pdf','4 jun 26'],['receta-control.pdf','12 may 26']];
  document.getElementById('hc-files').innerHTML = files.map(f=>`
    <div class="row-line" style="gap:9px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted-foreground);flex-shrink:0"><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3l7.8-7.8"/></svg>
    <span class="flex-1 truncate">${f[0]}</span><span class="muted text-xs">${f[1]}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted-foreground)"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg></div>`).join('');
})();

/* ---------- onboarding palette swatches ---------- */(function renderObPalettes(){
  document.getElementById('ob-palettes').innerHTML = PALETTES.map(p=>`
    <button class="ob-swatch ${p.id==='red'?'on':''}" data-p="${p.id}" title="${p.name}">${p.sw.map(c=>`<i style="background:${c}"></i>`).join('')}</button>`).join('');
  document.getElementById('ob-palettes').addEventListener('click', e=>{
    const b=e.target.closest('.ob-swatch'); if(!b) return;
    document.querySelectorAll('#ob-palettes .ob-swatch').forEach(x=>x.classList.toggle('on', x===b));
    setPalette(b.dataset.p);
  });
})();

/* ---------- settings: rubro derived from tipo ---------- */
(function wireRubro(){
  const SALUD = ['Consultorio médico','Odontología','Kinesiología','Psicología','Nutrición'];
  const BELLEZA = ['Cejas & Pestañas','Peluquería','Manicura / Nails','Spa / Masajes','Depilación'];
  const sel = document.getElementById('biz-type');
  const hint = document.getElementById('biz-rubro');
  if(!sel || !hint) return;
  sel.addEventListener('change', ()=>{
    const v = sel.value;
    const rubro = SALUD.includes(v) ? 'Salud' : BELLEZA.includes(v) ? 'Belleza' : 'General';
    hint.innerHTML = `Rubro: <span style="color:var(--foreground);font-weight:600">${rubro}</span> · cambiarlo ajusta el menú y los campos del panel.`;
  });
})();

/* ---------- screen routing ---------- */
const CHROME = { dashboard:1, turnos:1, config:1, clientes:1, finanzas:1, historia:1 };
const STANDALONE = ['reserva','login','onboarding'];
function showScreen(s){
  // toolbar + sidebar active state
  document.querySelectorAll('#tb-tabs .tb-tab').forEach(t=>t.classList.toggle('active', t.dataset.s===s));
  document.querySelectorAll('#side-nav .navlink').forEach(t=>t.classList.toggle('active', t.dataset.s===s));

  const inChrome = !!CHROME[s];
  document.getElementById('app').style.display = inChrome ? '' : 'none';
  STANDALONE.forEach(k=> document.getElementById('screen-'+k).classList.toggle('hidden', s!==k));

  if(inChrome){
    const map = { dashboard:'screen-dashboard', turnos:'screen-turnos', config:'screen-config', clientes:'screen-clientes', finanzas:'screen-finanzas', historia:'screen-historia' };
    document.querySelectorAll('#main .screen').forEach(sc=>sc.classList.add('hidden'));
    document.getElementById(map[s]).classList.remove('hidden');
  }
  window.scrollTo(0,0);
  localStorage.setItem('forjo-screen', s);
}
document.getElementById('tb-tabs').addEventListener('click', e=>{ const b=e.target.closest('.tb-tab'); if(b) showScreen(b.dataset.s); });
document.getElementById('side-nav').addEventListener('click', e=>{ const b=e.target.closest('.navlink'); if(b) showScreen(b.dataset.s); });
document.addEventListener('click', e=>{ const b=e.target.closest('.hc-back'); if(b) showScreen(b.dataset.s); });

/* ---------- init from storage ---------- */
setPalette(localStorage.getItem('forjo-palette') || 'red');
setMode(localStorage.getItem('forjo-mode') || 'light');
showScreen(localStorage.getItem('forjo-screen') || 'dashboard');
