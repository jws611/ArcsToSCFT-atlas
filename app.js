'use strict';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const math=value=>esc(value).replace(/\^([0-9]+(?:\/[0-9]+)?)/g,'<sup>$1</sup>');
const degree=value=>{const [a,b=1]=String(value).split('/');return Number(a)/Number(b)};
const power=(v,n)=>String(n)==='0'?'1':String(n)==='1'?v:`${v}<sup>${esc(n)}</sup>`;
let catalog=[],record=null,selected='',tab='indices',datasetId='',form='schur',cutoff=null,requestId=0;
let modelId='',representation='dimensions',historyId='',viewSettings={};
const staticSite=document.querySelector('meta[name="results-mode"]')?.content==='static';
const tabs=[['model','KLS & T-filtration'],['indices','Index results'],['evidence','Verification & history']];
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2200)}
async function api(url){if(staticSite){url=url==='/api/catalog'?'./data/catalog.json':'./data/theories/'+url.slice('/api/theories/'.length)+'.json'}const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load results.');return data}
function dataset(){return record.datasets.find(d=>d.id===datasetId)||{id:'',label:'No compatible result',index_status:{}}}
function currentModel(){return record.models?.find(m=>m.id===modelId)||null}
function modelScheme(){return currentModel()?.scheme||record.datasets.find(d=>d.id==='accepted')?.scheme||record.scheme||{}}
function indexSummary(){return currentModel()?.index_summary||record.index_summary||{}}
function isFlavor(){return representation==='characters'}
function stateKey(){return `${modelId}/${form}`}
function rememberView(){viewSettings[stateKey()]={cutoff,representation}}
function saveRoute(){
  if(!window.history?.pushState)return;
  const query=new URLSearchParams({view:tab,index:form});
  if(modelId&&modelId!==record.current_model_id)query.set('model',modelId);
  if(representation==='characters')query.set('representation',representation);
  if(cutoff!=null)query.set('cutoff',cutoff);
  const hash='#'+encodeURIComponent(record.id)+'?'+query.toString();
  if(location.hash!==hash)window.history.pushState(null,'',hash);
}
function showSection(section){rememberView();tab=section;render();saveRoute();document.querySelector(`[data-tab="${tab}"]`)?.focus({preventScroll:true})}
function polynomial(terms,v='T'){const pieces=terms.filter(t=>t.value!=='0').map(t=>{const exp=t.T??t.q;return exp==='0'?esc(t.value):`${t.value==='1'?'':esc(t.value)+' '}${power(v,exp)}`});return pieces.join(' + ').replace(/\+ -/g,'− ')||'0'}
function orbitHTML(value){return esc(value).replace(/_(II|I)$/, ' <span class="orbit-branch">$1</span>')}
function matchesTheorySearch(row,query){
  const normalize=value=>String(value).toLowerCase().replace(/[\s_()]/g,'');
  const explicitOrbit=query.match(/\by\s*=\s*(0(?!\d)|\[[\d,\s]+\](?:[_\s]*(?:II|I)(?![a-z]))?)/i);
  if(explicitOrbit){
    const requested=normalize(explicitOrbit[1]),actual=normalize(row.orbit);
    if(requested!==actual&&requested!==actual.replace(/i{1,2}$/, ''))return false;
  }
  const remaining=explicitOrbit?query.replace(explicitOrbit[0],''):query;
  const haystack=normalize(`${row.title} ${row.id} ${row.lie_type} ${row.group} p${row.p} p=${row.p} Y=${row.orbit} ${row.orbit==='0'?'unhiggsed':'higgsed'}`);
  return remaining.trim().split(/\s+/).every(token=>haystack.includes(normalize(token)));
}
function filterList(){const query=$('#search').value;const family=$('#family').value,status=$('#status').value;const rows=catalog.filter(r=>(!family||r.lie_type===family)&&(!status||r.status===status)&&(!$('#unhiggsed').checked||r.orbit==='0')&&matchesTheorySearch(r,query));$('#count').textContent=`${rows.length} / ${catalog.length} entries`;
$('#theories').innerHTML=rows.map(r=>`<a class="theory-link ${r.id===selected?'active':''}" href="#${encodeURIComponent(r.id)}" ${r.id===selected?'aria-current="page"':''}><div class="name">D<sub>${r.p}</sub>(${esc(r.group)})</div><div class="orbit"><span class="orbit-value">Y = ${orbitHTML(r.orbit)}</span><span class="orbit-kind">${r.orbit==='0'?'Unhiggsed':'Nilpotent Higgsing'}</span></div><div class="meta"><span><i class="dot ${esc(r.status)}"></i>${esc(r.status_label)}</span><span>${r.index_cutoffs?.schur?'Schur q ≤ '+esc(r.index_cutoffs.schur):'Stored q ≤ '+esc(r.max_q)}</span></div></a>`).join('')||'<div class="no-results">No matching theories or Higgsing orbits.</div>'}

async function loadCatalog(){const data=await api('/api/catalog');catalog=data.theories;$('#revision').textContent=staticSite?`Snapshot ${data.generated_at_utc.slice(0,10)} · ${data.theories.length} theories`:`${data.source_count} sources · ${data.revision}`;const prior=$('#family').value;$('#family').innerHTML='<option value="">All types</option>'+[...new Set(catalog.map(r=>r.lie_type))].sort().map(f=>`<option>${esc(f)}</option>`).join('');$('#family').value=prior;filterList();return data}
async function selectTheory(id,routeState={}){
  const serial=++requestId;selected=id;$('#atlas-link').href='#'+encodeURIComponent(id);setNavigation('atlas');filterList();$('#main').setAttribute('aria-busy','true');
  try{
    const data=await api(`/api/theories/${encodeURIComponent(id)}`);if(serial!==requestId)return;
    record=data;modelId=routeState.model||data.current_model_id||'';
    if(routeState.model&&!data.models?.some(m=>m.id===modelId))throw new Error('This model is not present in this snapshot. Open the theory link without its model parameter.');
    form=['schur','macdonald','hl'].includes(routeState.index)?routeState.index:'schur';
    tab=tabs.some(t=>t[0]===routeState.view)?routeState.view:'indices';
    representation=routeState.representation==='characters'?'characters':'dimensions';
    datasetId=indexSummary()[form]?.dataset_id||(!data.models?data.default_dataset_id||data.datasets?.[0]?.id:'')||'';
    cutoff=routeState.cutoff??null;historyId='';viewSettings={};render();
  }catch(e){if(serial===requestId)$('#main').innerHTML=`<div class="notice error">${esc(e.message)}</div>`}
  finally{if(serial===requestId)$('#main').removeAttribute('aria-busy')}
}
function datasetControls(){
  const d=dataset();
  return `<p class="small computation-current">Result record: ${esc(d.label)} · ${esc(d.arithmetic||'See original evidence')}<br><button class="text-link" data-open-evidence>View calculation record and source</button></p>`;
}
function selectComputation(id){
  if(!record.datasets.some(d=>d.id===id))return;
  historyId=id;tab='evidence';render();saveRoute();
}
function bindDatasetControls(){document.querySelectorAll('[data-open-evidence]').forEach(b=>b.onclick=()=>selectComputation(datasetId))}
const indexNames={schur:'Schur',macdonald:'Macdonald',hl:'Hall–Littlewood'};
function indexSummaryHTML(){
  return `<nav class="index-picker" aria-label="Index selection">${Object.entries(indexNames).map(([key,name])=>`<button data-index-form="${key}" aria-pressed="${form===key}">${name}${!indexSummary()[key]?' · unavailable':''}</button>`).join('')}</nav>`;
}
function selectedIndexNotice(){
  const d=dataset(),scope=d.index_status?.[form];if(!scope)return '';
  const relation=indexSummary()[form]?.relation;
  const relationText={'unfiltered-comparison':'Unfiltered comparison of this model’s algebra; it does not test its T-filtration.',
    'proved-limit-transfer':'This limit is transferred from the historical filtration by the saved proof. Its Macdonald series is not transferred.',
    'independent-reference':'Independent Higgs Hilbert reference; this is not a computed Macdonald diagonal.'}[relation];
  return `<div class="selected-scope ${scope.state==='checked'&&scope.exact?'checked':'unverified'}" role="note"><strong>${esc(indexNames[form])}${form==='macdonald'&&record.completion?' candidate':''}: ${form==='hl'?'t':'q'} ≤ ${esc(scope.cutoff)}</strong><span>${esc(scope.label)}</span><span>${esc(scope.arithmetic)}</span>${scope.window?`<span>${esc(scope.window)}</span>`:''}${relationText?`<span>${relationText}</span>`:''}</div>`;
}
function showIndex(name){
  if(!Object.hasOwn(indexNames,name)||name===form)return;
  rememberView();form=name;datasetId=indexSummary()[name]?.dataset_id||'';
  const saved=viewSettings[stateKey()];cutoff=saved?.cutoff??null;representation=saved?.representation||'dimensions';
  render();saveRoute();document.querySelector(`[data-index-form="${name}"]`)?.focus({preventScroll:true});
}
function bindIndexSummary(){document.querySelectorAll('[data-index-form]').forEach(b=>b.onclick=()=>showIndex(b.dataset.indexForm))}

function campaignProgressHTML(){
  const c=record.completion;if(!c)return '';
  const known=c.minimum_required_cutoff!=null,target=c.required_cutoff,extra=c.additional_orders;
  const requested=record.requested_macdonald_cutoff;
  const requestedExtra=known&&requested!=null?degree(requested)-degree(c.minimum_required_cutoff):null;
  const requestedLabel=requestedExtra>0?`Requested Macdonald · jump + ${esc(requestedExtra)}`:'Requested Macdonald · through jump';
  const hl=record.index_summary?.hl;
  const hlDone=hl?.state==='checked'&&hl.exact===true&&target!=null&&degree(hl.cutoff)>=degree(target);
  const requestedDone=requested!=null&&['verified_macdonald_cutoff','schur_verified_through','hl_verified_through'].every(k=>c[k]!=null&&degree(c[k])>=degree(requested));
  const through=n=>n==null?'Not verified':`q ≤ ${esc(n)}`;
  const targetText=target==null?'Target unknown until the first jump is certified':`Target: q ≤ ${esc(target)}`;
  const schurDone=c.minimum_jump_verified===true&&target!=null&&c.schur_arc_verified_through!=null&&degree(c.schur_arc_verified_through)>=degree(target);
  const window=extra===0?'Selected Schur window':`Schur extension · jump + ${esc(extra??2)}`;
  const row=(title,done,detail)=>`<div class="verification-step"><h3>${title}</h3><span class="badge ${done?'verified':'partial'}">${done?'Complete':'Pending'}</span><p>${detail}</p></div>`;
  return `<section class="verification-progress" aria-label="Campaign verification progress"><h3>Verification progress</h3>${row('Syzygy jump · Schur',c.minimum_jump_verified===true,c.minimum_jump_verified===true?`Mandatory jump at q<sup>${esc(c.minimum_required_cutoff)}</sup> verified over QQ. Complete vacuum-through-jump Schur comparison.${record.jump_verification?.earliest_full_jump_certified?' First-jump location certified.':''}`:known?`Candidate jump: q<sup>${esc(c.minimum_required_cutoff)}</sup>. Full through-jump verification is incomplete.`:'First jump not yet certified; no meaningful jump validation yet.')}${row(window,schurDone,`Accepted QQ Schur: ${through(c.schur_arc_verified_through)}. ${targetText}.`)}${record.requested_macdonald_cutoff!=null?row(requestedLabel,requestedDone,`Target: q ≤ ${esc(requested)}. ${requestedDone?'Exact Macdonald and both limits verified through this window.':record.obstruction?'Current filtration fails the HL test; a corrected filtration is needed.':'Full two-variable calculation is not complete. The separate HL result does not certify it.'}`):''}${hl?row('HL diagonal · Higgs Hilbert comparison',hlDone,`Separate HL comparison: t ≤ ${esc(hl.cutoff)}. ${target==null?'Target unknown':`Target: t ≤ ${esc(target)}`}. Full Macdonald and its Schur limit are checked separately.`):''}${row(`Macdonald + Schur / HL limits · ${extra===0?'selected window':`jump + ${esc(extra??2)} extension`}`,c.complete===true,`Accepted Macdonald: ${through(c.verified_macdonald_cutoff)}; Schur limit: ${through(c.schur_verified_through)}; HL limit: ${c.hl_verified_through==null?'Not verified':`t ≤ ${esc(c.hl_verified_through)}`}. ${targetText}.`)}<p class="small">Each status refers to its own verification window. Pending extensions do not undo a completed syzygy jump check.</p></section>`;
}
function pfaffianEulerRevisionHTML(){
  const r=record.pfaffian_euler_revision;if(!r)return '';
  const c=r.filtration_certificate,u=c.minor_grade,w=c.scalar_pfaffian_grade;
  const verified=record.pfaffian_recomputation;
  const current=verified?.cutoff??r.current_macdonald_cutoff;
  return `<div class="notice"><strong>Pfaffian filtration corrected · Euler relation</strong><p>Currents M: (1,1); ${esc(u.multiplicity)} covariants U: (${esc(u.q)},${esc(u.T)}); scalar Pfaffian: (${esc(w.q)},${esc(w.T)}).</p><p>${esc(c.euler_identity)}. The scalar is a composite of M and U; no additional scalar lowering is imposed.</p><p>${verified?`Recomputed Macdonald: q ≤ ${esc(current)} over QQ. Every coefficient from the vacuum through the syzygy jump passes the Schur and independent Higgs Hilbert (HL) comparisons. ${record.completion?.complete?'The selected extension is verified.':`The selected jump + ${esc(record.completion?.additional_orders??2)} extension remains pending.`}`:`Current Macdonald prefix: q ≤ ${esc(current)} (preparation only). Higher two-variable coefficients require recomputation.`} Historical records through q ≤ ${esc(r.historical_macdonald_cutoff)} retain their original scalar degree and are not results of the revised filtration.</p><p class="small">Schur and HL comparisons remain valid: the unfiltered algebra and diagonal quotient are unchanged. Euler supplies a filtration upper bound, not uniqueness of the physical filtration.</p></div>`;
}
function covariantCorrectionHTML(){
  const c=record.filtration_correction;if(!c)return '';
  const graphs=c.candidate_graphs||[c.generator];
  const correctedMac=record.datasets.filter(d=>d.macdonald&&d.scheme?.covariant_filtration&&d.checks?.schur_matches&&d.checks?.hall_littlewood_matches&&d.fixed_coefficient_evidence).sort((a,b)=>Number(b.cutoff)-Number(a.cutoff))[0];
  const jump=record.completion?.minimum_required_cutoff;
  const reached=correctedMac&&jump!=null&&Number(correctedMac.cutoff)>=jump;
  return `<div class="notice"><strong>Covariant filtration · HL repair</strong><p>${graphs.map(g=>`${esc(g.name)} = ∇I<sub>${esc(g.q_degree+1)}</sub>(M): (q,T) = (${esc(g.q_degree)}, ${esc(g.T_degree)})`).join('; ')}.</p><p>Exact corrected HL comparison: t ≤ ${esc(c.hl_verified_cutoff)}. Graph elimination preserves the Schur series. ${correctedMac?`Corrected Macdonald: q ≤ ${esc(correctedMac.cutoff)}, with both limits checked; ${reached?`mandatory jump reached. ${record.completion?.complete?'The selected extension is verified.':`The selected jump + ${esc(record.completion?.additional_orders??2)} extension remains pending.`}`:'still below the mandatory jump.'}`:'The corrected two-variable Macdonald series is pending.'} Historical scalar-graph records retain their original filtration.</p><p class="small">The T assignments are candidates. HL fixes the diagonal quotient, and does not uniquely determine the lower T degrees.</p></div>`;
}
function milestoneHTML(){
  const c=record.completion;if(!c)return `<p class="small">${esc(record.status_label)} · see individual result evidence and finite windows.</p>`;
  const jump=c.minimum_required_cutoff, target=c.required_cutoff;
  return `<div class="milestones"><span class="${c.minimum_jump_verified?'match':'pending'}">${c.minimum_jump_verified?'✓ Syzygy jump':'Syzygy jump'} ${jump==null?'unknown':`q<sup>${esc(jump)}</sup>`} · ${c.minimum_jump_verified?'verified':'verification incomplete'}</span><span class="${c.complete?'match':'pending'}">Selected window ${target==null?'unknown':`q ≤ ${esc(target)}`} · ${c.complete?'complete':'pending'}</span></div>`;
}
function render(){
  const m=currentModel(),historical=m&&!m.current;
  $('#main').innerHTML=`<div class="eyebrow">${esc(record.lie_type)} / D<sub>p</sub>(G) COLLECTION</div><div class="title-row"><div><h2 class="theory-title">D<sub>${record.p}</sub>(${esc(record.group)})</h2><p class="theory-identity">Y = ${orbitHTML(record.orbit)} · ${record.orbit==='0'?'Unhiggsed':'Nilpotent Higgsing'} · Flavor: ${esc(record.flavor?.group||'See source')}</p></div><button id="download">Theory JSON ↓</button></div>
    <div class="common-model"><div><span class="eyebrow">${historical?'ALTERNATE / HISTORICAL MODEL':'CURRENT COMMON MODEL'}</span><div>${esc(m?.label||'Stored presentation')}</div></div><button id="model-definition">View definition ↗</button></div>
    ${historical?'<div class="notice">You are viewing another stored presentation. Current campaign milestones below remain attached to the current campaign. <button id="current-model">Return to current model</button></div>':''}${milestoneHTML()}
    <div class="tabs" role="tablist" aria-label="Theory information">${tabs.map(([key,label])=>`<button role="tab" aria-selected="${tab===key}" class="tab ${tab===key?'active':''}" data-tab="${key}">${label}</button>`).join('')}</div><section id="panel" role="tabpanel"></section>`;
  $('#download').onclick=()=>download(`${record.id}.json`,JSON.stringify(record,null,2),'application/json');
  $('#model-definition').onclick=()=>showSection('model');
  if(historical)$('#current-model').onclick=()=>selectModel(record.current_model_id);
  document.querySelectorAll('[data-tab]').forEach((button,index)=>{
    button.tabIndex=button.dataset.tab===tab?0:-1;button.id='tab-'+button.dataset.tab;button.setAttribute('aria-controls','panel');
    button.onclick=()=>showSection(button.dataset.tab);
    button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;showSection(tabs[i][0])};
  });
  $('#panel').setAttribute('aria-labelledby','tab-'+tab);
  if(tab==='model')renderModel();else if(tab==='evidence')renderEvidence();else renderIndices();
}
function selectModel(id){
  if(!record.models?.some(m=>m.id===id))return;
  rememberView();modelId=id;datasetId=indexSummary()[form]?.dataset_id||'';cutoff=null;representation='dimensions';historyId='';render();saveRoute();
}
function renderIndices(){
  const d=dataset(),rows=d[form]||[],options=rows.map(r=>r.q);
  if(cutoff===null||!options.includes(cutoff))cutoff=options.at(-1)||'0';
  const characterAvailable=Boolean(d.characters?.length||(form==='schur'&&record.schur_character_formula));
  if(!characterAvailable)representation='dimensions';
  const flavored=isFlavor();
  $('#panel').innerHTML=`<div class="panel-head"><h3>Index results</h3><span class="small">${currentModel()?.current===false?'Selected presentation':'Current common model'}</span></div>`+indexSummaryHTML()+
    (rows.length?(record.obstruction&&currentModel()?.current!==false?`<div class="notice error">Current model issue: ${esc(record.obstruction.conclusion)}</div>`:'')+selectedIndexNotice()+`<div class="controls"><label for="representation">Representation</label><select id="representation"><option value="dimensions" ${!flavored?'selected':''}>Unrefined dimensions</option><option value="characters" ${flavored?'selected':''} ${!characterAvailable?'disabled':''}>Flavor characters${!characterAvailable?' · unavailable':''}</option></select><label for="cutoff">Display ${form==='hl'?'t':'q'} ≤</label><select id="cutoff">${options.map(q=>`<option ${q===cutoff?'selected':''}>${esc(q)}</option>`).join('')}</select><button id="copy-series">Copy series</button><button id="tex">TeX ↓</button></div><p class="small">Display cutoff changes the truncation only. It does not change the verification window.</p><div id="series-body"></div>`+datasetControls():`<div class="empty">No compatible ${esc(indexNames[form])} result is available for this model. Other calculations and their original scope remain in Verification &amp; history.</div>`);
  bindIndexSummary();bindDatasetControls();if(!rows.length)return;
  $('#cutoff').onchange=e=>{cutoff=e.target.value;renderSeries();rememberView();saveRoute()};
  $('#representation').onchange=e=>{representation=e.target.value;renderSeries();rememberView();saveRoute()};
  $('#copy-series').onclick=async()=>{try{await navigator.clipboard.writeText(exportSeries(false));toast('Copied the selected series and scope.')}catch{toast('Use the TeX download if copying is unavailable.')}};
  $('#tex').onclick=()=>download(`${record.id}-${form}${isFlavor()?'-characters':''}.tex`,exportSeries(true),'text/plain');renderSeries();
}

function charTerm(term,tex=false){const mult=String(term.multiplicity);const factors=term.irreps.map(i=>{if(i.dynkin.every(x=>Number(x)===0))return '';return tex?`\\chi^{\\mathrm{${i.group}}}_{(${i.dynkin.join(',')})}(x)`:`χ<sub>${esc(i.group)} [${i.dynkin.join(',')}]</sub>(x)`}).filter(Boolean);(term.u1_charges||[]).forEach((charge,i)=>{if(String(charge)!=='0')factors.push(tex?`z_{${i+1}}^{${charge}}`:`z<sub>${i+1}</sub><sup>${esc(charge)}</sup>`)});return (mult==='1'&&factors.length?'':mult+(factors.length?' ':''))+factors.join(tex?' ':' · ')}
function sumCharacters(terms){const merged=new Map();for(const t of terms){const key=JSON.stringify([t.irreps,t.u1_charges]);const prev=merged.get(key);if(prev)prev.multiplicity=String(BigInt(prev.multiplicity)+BigInt(t.multiplicity));else merged.set(key,{...t,multiplicity:String(t.multiplicity)})}return [...merged.values()].filter(t=>t.multiplicity!=='0')}
function characterCoverage(){
  const d=dataset(),expected=(d[form]||[]).filter(r=>degree(r.q)<=degree(cutoff));
  const found=new Set((d.characters||[]).map(r=>r.q));
  return expected.filter(r=>!found.has(r.q)).map(r=>r.q);
}
function selectedCharacterRows(){const d=dataset();if(!d[form])return [];return (d.characters||[]).filter(r=>degree(r.q)<=degree(cutoff)).map(r=>{let cells=r.cells;if(form==='hl')cells=cells.filter(c=>degree(c.T)===degree(r.q));if(form!=='macdonald')cells=[{T:'0',terms:sumCharacters(cells.flatMap(c=>c.terms))}];return {...r,cells}})}
function renderSeries(){const d=dataset(),body=$('#series-body');if(!d[form]){body.innerHTML=`<div class="empty">This dataset has no ${esc(form)} series.</div>`;return;}if(isFlavor()){
let html='';if(form==='schur'&&record.schur_character_formula)html+=`<div class="card"><h3>Flavor-refined Schur · closed formula</h3><div class="formula">${math(record.schur_character_formula)}</div><div class="small">χ denotes a flavor character. PE[f] = exp(∑<sub>k≥1</sub> f(q<sup>k</sup>,x<sup>k</sup>)/k). <a href="${esc(record.schur_character_source.url)}" target="_blank" rel="noreferrer">Kang–Lawrie–Song, Eq. (3.7)</a></div></div>`;
if(d.characters){const missing=characterCoverage();if(missing.length)html+=`<div class="notice">Flavor coefficients are not stored at degrees ${missing.map(esc).join(', ')} within the selected window. The rows below are partial; a complete character-series export is unavailable.</div>`;html+=`<div class="small">χ<sub>G [a₁,…,aᵣ]</sub> uses Dynkin labels. z denotes a U(1) fugacity; distinct representations of equal dimension remain separate.</div><div class="table-wrap"><table><thead><tr><th>${form==='hl'?'t':'q'} degree</th><th>${esc(form)} character coefficient</th></tr></thead><tbody>${selectedCharacterRows().map(r=>`<tr><td class="degree">${esc(r.q)}</td><td class="character">${r.cells.map(c=>`<div class="character-row"><span class="t">${form==='macdonald'?power('T',c.T):''}</span><span>${c.terms.map(t=>`<span class="char-term">${charTerm(t)}</span>`).join(' + ')||'0'}</span></div>`).join('')||'0'}</td></tr>`).join('')}</tbody></table></div>`;}else{html+='<div class="empty">No complete coefficientwise flavor decomposition is stored for this computation. Representations are not inferred from unrefined dimensions.</div>';if(form==='macdonald'&&(d.first_null_character_formula||record.first_null_character_formula))html+=`<div class="card"><h3>KLS candidate through the first null · representation-ring formula</h3><div class="formula">${math(d.first_null_character_formula||record.first_null_character_formula)}</div><p class="small">Valid only below the displayed O(q…) order. ${esc(record.notes.find(n=>n.includes('character formula'))||'')}</p></div>`;if(d.ideal_characters)html+=`<details><summary>Stored ideal-image characters (not the full index characters)</summary><pre>${esc(JSON.stringify(d.ideal_characters,null,2))}</pre></details>`;}
body.innerHTML=html;return;}
const rows=d[form];if(!rows){body.innerHTML=`<div class="empty">This dataset has no ${esc(form)} series. Inspect other records in Verification &amp; history.</div>`;return;}
const filtered=rows.filter(r=>degree(r.q)<=degree(cutoff));const reference=d[`${form}_target`]||((form==='schur')?d.arc_schur:null);const refMap=new Map((reference||[]).map(r=>[r.q,r.value]));
const summary=form==='macdonald'?filtered.map(r=>({q:r.q,value:polynomial(r.terms)})):filtered;
body.innerHTML=`<details open><summary>Complete selected series</summary><div class="formula">${form==='macdonald'?'I<sub>M</sub>(q,T)':form==='schur'?'I<sub>S</sub>(q)':d.hl_kind==='independent-reference'?'H<sub>Higgs</sub>(t)':'I<sub>HL</sub>(t)'} = ${summary.map(r=>{const coefficient=form==='macdonald'?r.value:esc(r.value);if(coefficient==='0')return '';return r.q==='0'?coefficient:`${power(form==='hl'?'t':'q',r.q)} (${coefficient})`}).filter(Boolean).join(' + ')}<span class="small"> &nbsp; (degree ≤ ${esc(cutoff)})</span></div></details><div class="table-wrap"><table><thead><tr><th>Degree n</th><th>${form==='macdonald'?'Cₙ(T)':'Coefficient'}</th>${reference?'<th>Reference coefficient</th><th>Comparison</th>':''}</tr></thead><tbody>${filtered.map(r=>`<tr><td class="degree">${esc(r.q)}</td><td class="math">${form==='macdonald'?polynomial(r.terms):esc(r.value)}</td>${reference?`<td class="math">${esc(refMap.get(r.q)??'Not computed')}</td><td class="${!refMap.has(r.q)?'small':r.value===refMap.get(r.q)?'match':'mismatch'}">${!refMap.has(r.q)?'Not checked':r.value===refMap.get(r.q)?'Match':'Mismatch'}</td>`:''}</tr>`).join('')}</tbody></table></div><div class="footer-note">${form==='hl'?(d.hl_kind==='independent-reference'?'This table is the independent Higgs Hilbert reference. It is not a computed Macdonald diagonal.':d.hl_kind==='model-diagonal'?'The graph-model HL diagonal is proved separately and agrees with the Higgs Hilbert series. See the Macdonald verification window for the two-variable calculation.':'This table is the diagonal of the selected Macdonald candidate. Reference coefficients come from the stored independent Higgs-orbit calculation.'):'Coefficients beyond the displayed cutoff are unknown, not zero.'} ${reference&&form==='schur'?'The comparison column uses the stored independent Schur reference or arc series.':''}</div>`;
}
function filtrationHTML(s,filtered){
  const cert=s.filtration_certificate,rows=[];
  if(filtered&&record.orbit==='0'&&s.grading?.startsWith('Currents M:')){
    rows.push(['Currents M',1,1]);
    for(const i of s.invariants||[])if(!(cert&&/^Pf/.test(i.name)))rows.push([`Invariant graph coordinate W (${i.name})`,i.degree,i.degree-1]);
    if(cert){rows.push(['Scalar Pfaffian W',cert.scalar_pfaffian_grade.q,cert.scalar_pfaffian_grade.T]);rows.push([`Pfaffian covariants U (${cert.minor_grade.multiplicity} components)`,cert.minor_grade.q,cert.minor_grade.T]);}
    for(const g of s.covariant_filtration||[])rows.push([`${g.name} = ∇I${g.q_degree+1}`,g.q_degree,g.T_degree]);
    rows.push(['Derivative ∂ (degree increment)',1,0]);
  }
  return `<h3>T-filtration</h3>${!filtered?'<div class="notice">No filtered computation is linked to this presentation. Schur data alone do not establish a T-filtration.</div>':''}
    <p class="small">${esc(s.grading||'Generator degrees are not specified in the saved presentation.')}</p>
    ${rows.length?`<div class="table-wrap"><table><thead><tr><th>Generator / operation</th><th>q degree</th><th>T degree</th></tr></thead><tbody>${rows.map(([n,q,t])=>`<tr><td>${esc(n)}</td><td>${esc(q)}</td><td>${esc(t)}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${cert?`<div class="notice"><strong>${currentModel()?.current?'Current':'Stored'} Pfaffian assignment</strong><p>Scalar Pfaffian T degree ${esc(cert.scalar_pfaffian_grade.T)}. ${esc(cert.euler_identity||cert.scope||'')}</p><p>Euler gives a filtration upper bound, not a proof of a lower bound or unique physical filtration.</p><details><summary>Filtration assumptions and certificate</summary><ul>${(cert.assumptions||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ul><p class="source">${esc(cert.certificate_sha256)}</p></details></div>`:''}
    <details><summary>Graph relations and differential closure</summary><p>${esc(s.graph||'See source for defining relations.')}</p><p class="small">Include the differential consequences before forming the associated graded quotient. Graph coordinates represent composites.</p></details>
    <div class="kv"><strong>Specializations</strong><div>Schur: T = 1.<br>HL: keep terms q<sup>n</sup>T<sup>n</sup>, giving t<sup>n</sup>. Equivalently T = t/q and q → 0 when T degree ≤ q degree; the conventional second fugacity is t = qT.</div></div>
    <p class="small">These are the assignments of the selected algebraic model. Agreement at finite order does not establish a unique physical filtration.</p>`;
}
function renderModel(){
  const s=modelScheme(),m=currentModel();
  $('#panel').innerHTML=`<div class="panel-head"><h3>KLS &amp; T-filtration</h3><span class="small">Shared by all index views</span></div><h3>KLS scheme · Y = ${orbitHTML(record.orbit)}</h3>
    <div class="formula">${math(s.definition||'No explicit definition stored')}</div>${s.potential?`<h3>Potential${s.potential_degree!=null?' · degree '+esc(s.potential_degree):''}</h3><div class="formula">${s.potential_mathml||math(s.potential)}</div>${s.potential_tex?'<button id="potential-tex">Copy potential TeX</button>':''}`:'<p>No potential is specified. See the stored defining relations.</p>'}
    ${s.convention?`<p class="small">${esc(s.convention)}</p>`:''}${[['Slodowy slice',s.slice],['Reduced support',typeof s.support==='string'?s.support:JSON.stringify(s.support)],['Scheme structure',s.distinction]].map(([k,v])=>`<div class="kv"><strong>${k}</strong><div>${math(v||'See source')}</div></div>`).join('')}
    ${filtrationHTML(s,m?.filtered??Boolean(record.datasets.find(d=>d.id==='accepted')?.macdonald))}
    ${s.associated_orbits?`<details><summary>Associated orbits</summary><pre>${esc(JSON.stringify(s.associated_orbits,null,2))}</pre></details>`:''}${s.special_geometries?`<details><summary>Special geometries</summary><pre>${esc(JSON.stringify(s.special_geometries,null,2))}</pre></details>`:''}
    ${record.obstruction&&m?.current!==false?`<div class="notice error">${esc(record.obstruction.interpretation||record.obstruction.conclusion)}</div>`:''}`;
  if(s.potential_tex)$('#potential-tex').onclick=async()=>{try{await navigator.clipboard.writeText(s.potential_tex);toast('Copied potential TeX.')}catch{download(`${record.id}-potential.tex`,s.potential_tex,'text/plain')}};
}
function renderFiltration(){renderModel()}
function renderScheme(){renderModel()}

function sourceLinks(){const links=record.sources.map(source=>{const url=source.startsWith('https://')?source:`./source/${encodeURIComponent(source)}`;return `<a class="source" href="${esc(url)}" target="_blank" rel="noreferrer">↗ ${esc(source)}</a>`}).join('');return (staticSite?`<a class="source" href="./data/theories/${encodeURIComponent(record.id)}.json" target="_blank" rel="noreferrer">↗ Published theory data and verification metadata</a><a class="source" href="./manifest.json" target="_blank" rel="noreferrer">↗ Snapshot manifest and checksums</a>`:'')+links}
function verificationTableHTML(){
  const c=record.completion||{},summary=indexSummary();
  return `<div class="table-wrap"><table class="verification-table"><thead><tr><th>Index</th><th>Stored (all records)</th><th>Selected result / check</th><th>Campaign accepted</th><th>Selected target</th></tr></thead><tbody>${Object.entries(indexNames).map(([f,name])=>{
    const s=summary[f],global=record.index_summary?.[f],v=f==='hl'?'t':'q';
    const checked=s?.state==='checked',target=c.required_cutoff;
    const done=checked&&s.exact&&target!=null&&degree(s.cutoff)>=degree(target);
    return `<tr data-scope="${f}"><td>${name}<br><span class="small">${v} degree</span></td><td data-label="Stored">${esc(global?.stored_cutoff??'Not stored')}</td><td data-label="Selected / checked">${s?`${esc(s.cutoff)} · ${checked?'comparison matches':esc(s.state)}<br><span class="small">${esc(s.arithmetic)}</span>`:'No compatible result'}</td><td data-label="Campaign accepted">${esc(global?.campaign_accepted_cutoff??'Not separately recorded')}</td><td data-label="Target">${esc(target??'Not recorded')} ${target!=null?`<br><span class="${done?'match':'pending'}">${done?'Checked':'Pending'}</span>`:''}</td></tr>`;
  }).join('')}</tbody></table></div><p class="small">Stored includes historical, diagnostic and finite-field records. Campaign accepted values are the saved campaign ledger, not a promotion of the selected model. HL-only checks do not complete Macdonald.</p>`;
}
function renderEvidence(){
  const d=record.datasets.find(x=>x.id===historyId),models=record.models||[];
  $('#panel').innerHTML=`<div class="panel-head"><h3>Verification &amp; history</h3><span class="small">Each comparison retains its own scope</span></div>${verificationTableHTML()}${campaignProgressHTML()}
    <details><summary>Current model revisions and interpretation</summary>${pfaffianEulerRevisionHTML()}${covariantCorrectionHTML()}${record.notes.map(n=>`<p class="small">${esc(n)}</p>`).join('')}${record.historical_obstruction?`<details><summary>Historical model obstruction</summary><pre>${esc(JSON.stringify(record.historical_obstruction,null,2))}</pre></details>`:''}</details>
    <h3>Calculation records</h3><p class="small">Inspecting a record does not change the common model or the index results.</p><label for="history-record">Inspect record</label><select id="history-record" class="dataset"><option value="">Choose a calculation record</option>${record.datasets.map(x=>`<option value="${esc(x.id)}" ${x.id===historyId?'selected':''}>${esc(x.label)} · ${esc(x.id)}</option>`).join('')}</select>
    ${d?`<article class="record-detail"><h3>${esc(d.label)}</h3><p>${esc(d.arithmetic||'Original evidence')} · stored through ${esc(d.cutoff)}</p><p>${esc(d.scope||'See the original evidence below.')}</p><p class="small">${d.model_id===modelId?'Linked to the selected model':d.model_id?'Different stored presentation':'Independent reference or model mapping not recorded'}</p>${d.model_id&&d.model_id!==modelId?`<button data-model="${esc(d.model_id)}">Open this presentation explicitly</button>`:''}<pre>${esc(JSON.stringify(d.index_status||{},null,2))}</pre><details><summary>Checks and provenance</summary><pre>${esc(JSON.stringify({checks:d.checks,provenance:d.provenance},null,2))}</pre></details><details><summary>Saved series and original presentation (JSON)</summary><pre>${esc(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>['schur','macdonald','hl','characters','scheme'].includes(k))),null,2))}</pre></details></article>`:''}
    <details><summary>Stored model presentations (${models.length})</summary>${models.map(m=>`<div class="model-history"><strong>${esc(m.label)}${m.current?' · current':''}</strong><p class="small">${esc(m.scheme.potential||m.scheme.definition)}<br>${esc(m.id)} · ${m.dataset_ids.length} records</p><button data-model="${esc(m.id)}">${m.id===modelId?'Viewing this presentation':'Open presentation'}</button></div>`).join('')}</details>
    ${record.obstruction?`<details><summary>Current model obstruction</summary><pre>${esc(JSON.stringify(record.obstruction,null,2))}</pre></details>`:''}<h3>Sources &amp; provenance</h3>${sourceLinks()}<p class="footer-note">Read-only stored results. ${staticSite?'Publication snapshot; new results appear after deployment.':'Refresh to reload the cumulative data.'}</p>`;
  $('#history-record').onchange=e=>{historyId=e.target.value;renderEvidence()};
  document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{tab='model';selectModel(b.dataset.model)});
}
function exportSeries(tex){const d=dataset();if(!d[form])return `% No ${form} series stored for ${record.id}.`;let pieces=[];if(isFlavor()){if(d.characters&&characterCoverage().length)return `% Incomplete ${form} character table for ${record.id}; model ${modelId}; record ${d.id}; missing degrees ${characterCoverage().join(', ')}. No complete series exported.`;if(!d.characters)return `% No coefficientwise ${form} character table for ${record.id}; model ${modelId}; record ${d.id}.\n${form==='schur'?record.schur_character_formula||'':''}`;pieces=selectedCharacterRows().map(r=>{const cells=r.cells.map(c=>{const chars=c.terms.map(t=>charTerm(t,true)).join(' + ')||'0';return form==='macdonald'&&c.T!=='0'?`T^{${c.T}} (${chars})`:chars}).join(' + ')||'0';return r.q==='0'?`(${cells})`:`${form==='hl'?'t':'q'}^{${r.q}} (${cells})`})}else{if(!d[form])return `% No ${form} series stored for ${record.id}.`;pieces=d[form].filter(r=>degree(r.q)<=degree(cutoff)).map(r=>{const coefficient=form==='macdonald'?r.terms.map(t=>t.T==='0'?t.value:`${t.value} T^{${t.T}}`).join(' + ')||'0':r.value;return r.q==='0'?`(${coefficient})`:`${form==='hl'?'t':'q'}^{${r.q}} (${coefficient})`})}const expression=pieces.join(' + ');const scope=`${record.id}; model ${modelId||'unspecified'}; index ${form}; record ${d.id}; display <= ${cutoff}; ${d.index_status?.[form]?.label||'Original evidence'}; ${d.arithmetic||'See original evidence'}`;return tex?`% ${scope}.\n% Finite truncation; no higher coefficients asserted.\n\\[\n${expression}\n\\]\n`:expression+`\n(${scope})`}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
for(const selector of ['#search','#family','#status','#unhiggsed'])$(selector).addEventListener('input',filterList);
$('.skip-link').onclick=event=>{event.preventDefault();$('#main').focus();};
function setNavigation(active){
  for(const name of ['explore','atlas','methods']){
    const link=$('#'+name+'-link');
    if(!link)continue;
    if(name===active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  document.body.classList.toggle('exploring',active==='explore');
}

function route(){
  let id,routeState;
  try{const [identifier,query='']=location.hash.slice(1).split('?');id=decodeURIComponent(identifier);routeState=Object.fromEntries(new URLSearchParams(query));}catch{showLoadError(new Error('This link has an invalid theory identifier.'));return;}
  if(staticSite&&(!id||id==='explore'||id==='methods')){
    const fallback=catalog.find(row=>row.id===selected)||catalog.find(row=>row.id==='D5-p3-Y0')||catalog[0];
    if(!fallback){showLoadError(new Error('This snapshot contains no theory results.'));return Promise.resolve();}
    return selectTheory(fallback.id);
  }
  if(id==='methods'){
    requestId++;selected='';filterList();setNavigation('methods');$('#main').removeAttribute('aria-busy');AtlasMethods.render($('#main'));return Promise.resolve();
  }
  if(!id||id==='explore'){
    requestId++;selected='';filterList();setNavigation('explore');$('#main').removeAttribute('aria-busy');
    AtlasExplore.render($('#main'),catalog,api);return Promise.resolve();
  }
  return selectTheory(id,routeState);
}
function showLoadError(error){
  requestId++;$('#main').removeAttribute('aria-busy');
  $('#main').innerHTML=`<div class="notice error"><h2>Results are unavailable.</h2><p>${esc(error.message)}</p><p>Retry the stored catalog. No calculations will be started.</p><button id="retry-catalog">Try again</button></div>`;
  $('#retry-catalog').onclick=start;
}
async function start(){const serial=requestId;try{await loadCatalog();if(serial===requestId)await route();}catch(error){if(serial===requestId)showLoadError(error)}}
$('#refresh').onclick=async()=>{const serial=requestId;try{await loadCatalog();if(serial!==requestId)return;await route();toast('Reloaded source results.')}catch(error){if(serial===requestId)toast(error.message)}};
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
start();
