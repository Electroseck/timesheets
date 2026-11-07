/* Electroseck site calculators. Estimates from first principles – confirm with AS/NZS 3008 / AS/NZS 3000 before certifying. */
(function(){
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n=v=>{const x=parseFloat(String(v).replace(',','.'));return isFinite(x)?x:null};
const r2=(x,d=2)=>(Math.round(x*Math.pow(10,d))/Math.pow(10,d)).toLocaleString('en-AU',{maximumFractionDigits:d});

// Copper conductor resistance at 20°C, ohms per km (IEC 60228 maximums). Corrected to 75°C operating (V-75 TPS).
const R20={1.5:12.1,2.5:7.41,4:4.61,6:3.08,10:1.83,16:1.15,25:0.727,35:0.524,50:0.387};
const SIZES=[1.5,2.5,4,6,10,16,25,35,50];
const ALPHA=0.00393, TOP=75, X=0.09; // X: typical reactance mΩ/m for multicore
const rOp=s=>R20[s]*(1+ALPHA*(TOP-20)); // mΩ/m (Ω/km == mΩ/m)
const zOp=s=>Math.sqrt(rOp(s)**2+X*X);
const TPS_EARTH={1.5:1.5,2.5:2.5,4:2.5,6:2.5,10:4,16:6,25:6,35:10,50:16};

const CSS=`
.calc{display:flex;flex-direction:column;gap:12px}
.cpick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.cpick button{font:inherit;font-weight:700;font-size:14.5px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer}
.cpick button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.cbox{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}
.cbox h3{margin:0;font-size:18px}
.crow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cf{display:flex;flex-direction:column;gap:4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;min-width:0}
.cf input,.cf select{font:inherit;font-size:17px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);width:100%;min-width:0;text-transform:none;letter-spacing:0;font-weight:400}
.cf.w{grid-column:1/-1}
.res{border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;font-size:15px}
.res.ok{background:var(--ok-soft);color:var(--fg);border:1px solid var(--ok)}
.res.bad{background:var(--accent-soft);color:var(--fg);border:1px solid var(--accent)}
.res.info{background:var(--bg);border:1px solid var(--line)}
.big{font-family:var(--mono);font-size:26px;font-weight:500;line-height:1.1}
.verdict{font-weight:800;font-size:16px}
.res.ok .verdict{color:var(--ok)} .res.bad .verdict{color:var(--accent-ink)}
.small{font-size:13px;color:var(--muted);margin:0}
.mdg{display:flex;flex-direction:column;gap:4px;padding:10px 0;border-top:1px solid var(--line)}
.mdg b{font-size:15px}
.mdg .small{margin:0}
.mdg .line{display:flex;gap:8px;align-items:center}
.mdg .line input{font:inherit;font-size:16px;padding:9px 10px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--fg);flex:1;min-width:0}
.mdg .amt{font-family:var(--mono);white-space:nowrap;min-width:70px;text-align:right}
.warn{color:var(--warn)}
`;

let built=false, cur='vd', MD=null;
function build(root){
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  root.innerHTML=`<div class="calc">
  <div class="cpick" role="group" aria-label="Calculator">
    <button type="button" data-c="vd" aria-pressed="true">Voltage drop</button>
    <button type="button" data-c="md" aria-pressed="false">Max demand</button>
    <button type="button" data-c="kw" aria-pressed="false">kW ↔ amps</button>
    <button type="button" data-c="ef" aria-pressed="false">Fault loop</button>
  </div>

  <div class="cbox" id="c-vd">
    <h3>Voltage drop</h3>
    <div class="crow">
      <label class="cf">Supply<select id="vd-ph"><option value="1">Single phase 230 V</option><option value="3">Three phase 400 V</option></select></label>
      <label class="cf">Cable (copper)<select id="vd-s">${SIZES.map(s=>`<option value="${s}"${s===2.5?' selected':''}>${s} mm²${s===2.5?' TPS':''}</option>`).join('')}</select></label>
      <label class="cf">Load current (A)<input id="vd-i" inputmode="decimal" value="20"></label>
      <label class="cf">Run length, one way (m)<input id="vd-l" inputmode="decimal" placeholder="e.g. 25"></label>
      <label class="cf">Drop already used upstream (%)<input id="vd-up" inputmode="decimal" value="0"></label>
      <label class="cf">Limit (%)<input id="vd-lim" inputmode="decimal" value="5"></label>
    </div>
    <div id="vd-out"></div>
    <p class="small">Upstream = consumer mains and any submain feeding this board. The 5% is for the whole path from the point of supply (AS/NZS 3000 Clause 3.6). Worked out from copper resistance at 75°C. Site estimate. Confirm with AS/NZS 3008 or jcalc before you certify.</p>
  </div>

  <div class="cbox" id="c-md" hidden>
    <h3>Maximum demand – single domestic</h3>
    <p class="small">Fill in what's in the house. Each load group uses the figures Electroseck entered from AS/NZS 3000 Appendix C (Table C1). Single-phase only for now.</p>
    <div id="md-groups"><p class="small">Loading the load groups…</p></div>
    <div id="md-out"></div>
    <label class="cf">Supply / main switch rating (A)<input id="md-sup" inputmode="decimal" value="63"></label>
  </div>

  <div class="cbox" id="c-kw" hidden>
    <h3>kW ↔ amps</h3>
    <div class="crow">
      <label class="cf">Supply<select id="kw-ph"><option value="1">Single phase 230 V</option><option value="3">Three phase 400 V</option></select></label>
      <label class="cf">Power factor<select id="kw-pf"><option value="1">1.0 – heaters, elements</option><option value="0.95">0.95 – inverter A/C, LED drivers</option><option value="0.85">0.85 – motors, pumps</option></select></label>
      <label class="cf">kW<input id="kw-k" inputmode="decimal" placeholder="e.g. 7.2"></label>
      <label class="cf">or Amps<input id="kw-a" inputmode="decimal" placeholder="e.g. 32"></label>
    </div>
    <div id="kw-out"></div>
  </div>

  <div class="cbox" id="c-ef" hidden>
    <h3>Earth fault loop – estimate</h3>
    <div class="crow">
      <label class="cf">Breaker (A)<select id="ef-in">${[6,10,16,20,25,32,40,50,63].map(a=>`<option${a===20?' selected':''}>${a}</option>`).join('')}</select></label>
      <label class="cf">Curve<select id="ef-cv"><option value="5">B</option><option value="10" selected>C</option><option value="20">D</option></select></label>
      <label class="cf">Active (mm²)<select id="ef-a">${SIZES.map(s=>`<option value="${s}"${s===2.5?' selected':''}>${s}</option>`).join('')}</select></label>
      <label class="cf">Earth (mm²)<select id="ef-e">${SIZES.map(s=>`<option value="${s}"${s===2.5?' selected':''}>${s}</option>`).join('')}</select></label>
      <label class="cf">Run length (m)<input id="ef-l" inputmode="decimal" placeholder="e.g. 30"></label>
      <label class="cf">Loop at the board, Ze (Ω)<input id="ef-z" inputmode="decimal" placeholder="measure it, e.g. 0.35"></label>
    </div>
    <div id="ef-out"></div>
    <p class="small">Max loop = 230 V ÷ instant-trip current (B 5×, C 10×, D 20× the breaker). Check against AS/NZS 3000 Table 8.1 and always measure on site. Earth size changes when you change the active size to the usual TPS earth.</p>
  </div>
</div>`;
  root.addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;cur=b.dataset.c;root.querySelectorAll('[data-c]').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));['vd','md','kw','ef'].forEach(k=>$('c-'+k).hidden=k!==cur);if(cur==='md')loadMD()});
  ['vd-ph','vd-s','vd-i','vd-l','vd-up','vd-lim'].forEach(id=>$(id).addEventListener('input',vd));
  ['kw-ph','kw-pf'].forEach(id=>$(id).addEventListener('input',kw));
  $('kw-k').addEventListener('input',()=>{$('kw-a').value='';kw()});$('kw-a').addEventListener('input',()=>{$('kw-k').value='';kw()});
  ['ef-in','ef-cv','ef-e','ef-l','ef-z'].forEach(id=>$(id).addEventListener('input',ef));
  $('ef-a').addEventListener('input',()=>{$('ef-e').value=String(TPS_EARTH[n($('ef-a').value)]);ef()});
  $('md-sup').addEventListener('input',md);
  vd();kw();ef();
}

function vd(){
  const ph=$('vd-ph').value==='3', s=n($('vd-s').value), I=n($('vd-i').value), L=n($('vd-l').value), up=n($('vd-up').value)||0, lim=n($('vd-lim').value)||5;
  const out=$('vd-out');
  if(!I||!L){out.innerHTML='<div class="res info"><span>Enter the load current and run length.</span><span class="small">2.5 mm² single phase ≈ '+r2(2*zOp(2.5),1)+' mV/A.m</span></div>';return}
  const V=ph?400:230, k=ph?Math.sqrt(3):2;
  const mv=k*zOp(s); // mV/A.m
  const vdV=mv*I*L/1000, pct=vdV/V*100, tot=pct+up, ok=tot<=lim+1e-9;
  const budget=Math.max(0,lim-up)/100*V;
  const maxL=budget*1000/(mv*I);
  const pass=SIZES.find(x=>k*zOp(x)*I*L/1000/V*100+up<=lim);
  out.innerHTML=`<div class="res ${ok?'ok':'bad'}"><span class="verdict">${ok?'PASSES':'TOO MUCH DROP'}</span><span class="big">${r2(vdV)} V · ${r2(pct)}%</span><span>Total with upstream: <b>${r2(tot)}%</b> of ${r2(lim,1)}% allowed</span><span>Max run on ${s} mm² at ${r2(I,1)} A: <b>${r2(maxL,0)} m</b></span><span>${pass?(pass===s?'This cable is the smallest that passes.':'Smallest cable that passes: <b>'+pass+' mm²</b>'):'<span class="warn">Even 50 mm² fails – split the load or rethink the supply.</span>'}</span><span class="small">${r2(mv,1)} mV/A.m used (${ph?'three':'single'} phase, 75°C). Check the cable's current rating too – voltage drop isn't the only limit.</span></div>`;
}

function kw(){
  const ph=$('kw-ph').value==='3', pf=n($('kw-pf').value)||1, K=n($('kw-k').value), A=n($('kw-a').value), V=ph?400:230, f=ph?Math.sqrt(3):1;
  const out=$('kw-out');
  if(K){const amps=K*1000/(f*V*pf);out.innerHTML=`<div class="res info"><span class="big">${r2(amps,1)} A</span><span>${r2(K)} kW, ${ph?'three phase, per phase':'single phase'}, pf ${pf}</span></div>`;return}
  if(A){const kwv=A*f*V*pf/1000;out.innerHTML=`<div class="res info"><span class="big">${r2(kwv)} kW</span><span>${r2(A,1)} A ${ph?'per phase, three phase':'single phase'}, pf ${pf}</span></div>`;return}
  out.innerHTML='<div class="res info"><span>Type kW or amps.</span></div>';
}

function ef(){
  const In=n($('ef-in').value), k=n($('ef-cv').value), a=n($('ef-a').value), e=n($('ef-e').value), L=n($('ef-l').value), Ze=n($('ef-z').value);
  const zmax=230/(k*In); const out=$('ef-out');
  const rl=(rOp(a)+rOp(e))/1000; // Ω per metre of run
  if(L==null||Ze==null){out.innerHTML=`<div class="res info"><span>Max loop for a ${In} A ${({5:'B',10:'C',20:'D'})[k]}-curve breaker: <b>${r2(zmax)} Ω</b></span><span class="small">Enter the run length and the loop impedance measured at the board to check the circuit.</span></div>`;return}
  const zs=Ze+rl*L, ok=zs<=zmax, maxL=Math.max(0,(zmax-Ze)/rl);
  out.innerHTML=`<div class="res ${ok?'ok':'bad'}"><span class="verdict">${ok?'SHOULD TRIP IN TIME':'LOOP TOO HIGH'}</span><span class="big">${r2(zs)} Ω</span><span>Max allowed about <b>${r2(zmax)} Ω</b> · max run about <b>${r2(maxL,0)} m</b></span><span class="small">Circuit adds ${r2(rl*1000,1)} mΩ per metre (active ${a} + earth ${e} mm² at 75°C). Estimate only – measure it.</span></div>`;
}

async function loadMD(){
  if(MD)return;
  try{const r=await fetch(window.ES.BASE+'/rest/v1/rpc/rules_md_list',{method:'POST',headers:window.ES.H,body:'{}'});if(!r.ok)throw 0;MD=await r.json()}
  catch(e){$('md-groups').innerHTML='<p class="small warn">Couldn\'t load the load groups. Check your signal.</p>';return}
  $('md-groups').innerHTML=MD.map(g=>`<div class="mdg"><b>${esc(g.name)}</b><p class="small">${esc(g.hint||'')}${g.table_ref?' · '+esc(g.table_ref):''}</p><div class="line"><input id="md-${g.id}" inputmode="decimal" placeholder="${g.kind==='points'?'Number of points':'Amps, e.g. 16, 10'}" aria-label="${esc(g.name)}"><span class="amt" id="mda-${g.id}"></span></div></div>`).join('');
  MD.forEach(g=>$('md-'+g.id).addEventListener('input',md));md();
}
function groupDemand(g,raw){
  const vals=String(raw||'').split(/[,+\s]+/).map(n).filter(x=>x!=null&&x>0);
  if(!vals.length)return {a:0,empty:true};
  const ready=g.kind==='points'?(g.base_amps!=null):(g.pct!=null||g.base_amps!=null);
  if(!ready)return {a:null};
  if(g.kind==='points'){
    const pts=vals.reduce((s,x)=>s+x,0);
    let a=+g.base_amps||0;const bu=+g.base_units||0;
    if(pts>bu&&g.step_units&&g.step_amps)a+=Math.ceil((pts-bu)/+g.step_units)*+g.step_amps;
    return {a};
  }
  const tot=vals.reduce((s,x)=>s+x,0);
  if(g.pct!=null)return {a:tot*(+g.pct)/100+(+g.base_amps||0)};
  return {a:+g.base_amps||0};
}
function md(){
  if(!MD)return;let tot=0,missing=[],any=false;
  MD.forEach(g=>{const d=groupDemand(g,$('md-'+g.id).value);const el=$('mda-'+g.id);
    if(d.empty){el.textContent='';return} any=true;
    if(d.a==null){el.innerHTML='<span class="warn">no figures</span>';missing.push(g.name);return}
    el.textContent=r2(d.a,1)+' A';tot+=d.a});
  const sup=n($('md-sup').value);const out=$('md-out');
  if(!any){out.innerHTML='<div class="res info"><span>Fill in the loads above.</span></div>';return}
  const ok=sup?tot<=sup:true;
  out.innerHTML=`<div class="res ${missing.length?'info':ok?'ok':'bad'}"><span class="verdict">${missing.length?'NOT COMPLETE':ok?'WITHIN SUPPLY':'OVER THE SUPPLY'}</span><span class="big">${r2(tot,1)} A</span>${sup?`<span>Against a ${r2(sup,0)} A supply/main switch</span>`:''}${missing.length?`<span class="warn">Dayne hasn't entered the Table C1 figures for: ${esc(missing.join(', '))}. Those loads aren't counted.</span>`:''}<span class="small">Single-phase domestic estimate (AS/NZS 3000 Appendix C). Keep the calc with the job.</span></div>`;
}

window.ESCalc={show(root){if(!built){build(root);built=true}}};
})();
