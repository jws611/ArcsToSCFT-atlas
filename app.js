'use strict';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const orbitSymbol='<math class="orbit-symbol" aria-label="nilpotent orbit"><mi>𝒪</mi></math>';
// Reader-facing notation only: original records, identifiers and JSON stay intact.
const orbitProse=value=>esc(readerProse(value)).replace(/\bS_(?:Y|𝒪)(?![\w])/gu,`S<sub>${orbitSymbol}</sub>`).replace(/\bY\b/g,orbitSymbol);
const math=value=>esc(value).replace(/\^([0-9]+(?:\/[0-9]+)?)/g,'<sup>$1</sup>');
// Potential notation is a display projection: coefficients and stored names stay intact.
const casimirNotation=value=>String(value??'').replace(/\bI(_(?:\{(?:\d+|d)\}|\d+|d)|\d+|[₀-₉]+)(?![\p{L}\p{N}_])/gu,'C$1');
const casimirSubscripts=value=>value.replace(/\bC(?:_(?:\{(\d+|d)\}|(\d+|d))|(\d+))(?![\w])/g,(_,braced,plain,number)=>`C<sub>${braced||plain||number}</sub>`);
const potentialProse=value=>casimirSubscripts(orbitProse(casimirNotation(value)));
function potentialHTML(s){return s.potential_mathml
  ?casimirNotation(s.potential_mathml).replace(/(<msub>\s*)<mi>I<\/mi>(?=\s*<(?:mi|mn)>(?:\d+|d)<\/)/g,'$1<mi>C</mi>')
  :casimirSubscripts(math(casimirNotation(s.potential)));}
const potentialTeX=s=>casimirNotation(s.potential_tex);
const degree=value=>{const [a,b=1]=String(value).split('/');return Number(a)/Number(b)};
const power=(v,n)=>String(n)==='0'?'1':String(n)==='1'?v:`${v}<sup>${esc(n)}</sup>`;
let catalog=[],record=null,selected='',tab='indices',datasetId='',form='schur',cutoff=null,requestId=0;
let modelId='',representation='dimensions',historyId='',viewSettings={};
const staticSite=document.querySelector('meta[name="results-mode"]')?.content==='static';
const tabs=[['model','Potential & T-filtration'],['indices','Index results'],['evidence',staticSite?'Verification':'Verification & history']];
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2200)}
async function api(url){if(staticSite){url=url==='/api/catalog'?'./data/catalog.json':'./data/theories/'+url.slice('/api/theories/'.length)+'.json'}const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(180000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load results.');return data}
function dataset(){return record.datasets.find(d=>d.id===datasetId)||{id:'',label:'No compatible result',index_status:{}}}
function currentModel(){return record.models?.find(m=>m.id===modelId)||null}
function modelScheme(){return currentModel()?.scheme||record.datasets.find(d=>d.id==='accepted')?.scheme||record.scheme||{}}
function indexSummary(){return currentModel()?.index_summary||record.index_summary||{}}
function preferredDatasetId(index=form,style=representation){const scope=indexSummary()[index];return (style==='characters'?scope?.character_dataset_id:null)||scope?.dataset_id||(!record.models?record.default_dataset_id||record.datasets[0]?.id:'')||''}
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
// Theory search uses identity only: group, p, Higgsing orbit, title and id.
// Accepts "E7 p19", "D_5(SU(4))", "SO(8) [3,2,2,1]", "D4 p11 orbit 2,2,1,1",
// "𝒪=[4,4]_II" and stable ids. A bracketed partition is exact; a bare comma
// list may omit trailing 1s. A bare "D5" means type D5 or p = 5.
const searchNormalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s_(){}]/g,'');
const lieTypePattern=/^(?:a[1-9]|d(?:[4-9]|1\d)|e[678])$/;
function orbitRequest(text,exact){
  const value=text.replace(/\s+/g,'').toLowerCase(),branch=(value.match(/_?(ii|i)$/)||[])[1]||'';
  const digits=value.replace(/_?(?:ii|i)$/,'').replace(/[[\]]/g,'');
  return digits==='0'?{zero:true}:{parts:digits.split(',').filter(Boolean).map(Number),branch,exact};
}
function parseTheoryQuery(query){
  if(typeof query==='object'&&query)return query;
  const terms={ids:[],orbits:[],ps:[],groups:[],lies:[],higgsed:null,words:[]};
  let text=' '+String(query??'').normalize('NFKC').toLowerCase().replace(/[−–]/g,'-')+' ';
  const take=(pattern,use)=>{text=text.replace(pattern,(...m)=>{use(m);return ' '})};
  const branch='(?:[_\\s]*(?:ii|i)(?![a-z]))?';
  take(/(?<![\w-])([ade]\d+-p\d+(?:-y[\w-]*)?)(?![\w-])/g,m=>terms.ids.push(m[1]));
  take(new RegExp(`(?<![\\w])(?:orbit|y|o)\\s*=?\\s*(0(?![\\d,])|\\[\\s*\\d+(?:\\s*,\\s*\\d+)*\\s*\\]${branch}|\\d+(?:\\s*,\\s*\\d+)*${branch})`,'g'),
    m=>terms.orbits.push(orbitRequest(m[1],m[1].includes('['))));
  take(new RegExp(`\\[\\s*\\d+(?:\\s*,\\s*\\d+)*\\s*\\]${branch}`,'g'),m=>terms.orbits.push(orbitRequest(m[0],true)));
  take(/(?<![\w[])(\d+(?:\s*,\s*\d+)+)(?![\w\]])/g,m=>terms.orbits.push(orbitRequest(m[1],false)));
  take(/(?<![a-z])d_?\{?(\d+)\}?\s*\(\s*((?:su|so)\s*\(?\s*\d+\s*\)?|e\s*[678])\s*\)/g,m=>{terms.ps.push(Number(m[1]));terms.groups.push(searchNormalize(m[2]))});
  take(/(?<![a-z])d_\{?(\d+)\}?/g,m=>terms.ps.push(Number(m[1])));
  take(/(?<![a-z])p\s*=?\s*(\d+)(?![\d,])/g,m=>terms.ps.push(Number(m[1])));
  take(/(?<![a-z])(su|so)\s*\(?\s*(\d+)\s*\)?/g,m=>terms.groups.push(m[1]+m[2]));
  take(/(?<![a-z\d])([ade])(\d+)(?![\w(])/g,m=>{const name=m[1]+m[2];
    if(lieTypePattern.test(name))terms.lies.push(name);else if(m[1]==='d')terms.ps.push(Number(m[2]));else terms.lies.push(name)});
  take(/(?<![a-z])(?:orbit|nilpotent)(?![a-z])/g,()=>{});
  take(/(?<![a-z])unhiggsed(?![a-z])/g,()=>{terms.higgsed=false});
  take(/(?<![a-z])(?:higgsed|higgsing)(?![a-z])/g,()=>{if(terms.higgsed===null)terms.higgsed=true});
  terms.words=text.split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).map(searchNormalize);
  return terms;
}
function orbitMatch(request,orbit){
  const actual=orbitRequest(String(orbit),true);
  if(request.zero||actual.zero)return request.zero&&actual.zero?2:0;
  if(request.branch&&request.branch!==actual.branch)return 0;
  const n=request.parts.length;
  if(actual.parts.length<n||request.parts.some((v,i)=>v!==actual.parts[i]))return 0;
  if(actual.parts.length===n)return 2;
  return !request.exact&&actual.parts.slice(n).every(v=>v===1)?1:0;
}
// Returns a positive rank for a match and 0 otherwise.
function matchesTheorySearch(row,query){
  const terms=parseTheoryQuery(query),id=String(row.id).toLowerCase();
  let score=1;
  for(const want of terms.ids){if(!id.startsWith(want))return 0;score+=id===want?3:1}
  for(const want of terms.orbits){const s=orbitMatch(want,row.orbit);if(!s)return 0;score+=s}
  if(terms.ps.some(p=>p!==Number(row.p)))return 0;
  if(terms.groups.some(g=>g!==searchNormalize(row.group)))return 0;
  for(const lie of terms.lies){
    if(lie===String(row.lie_type).toLowerCase())score+=2;
    else if(lie[0]==='d'&&Number(lie.slice(1))===Number(row.p))score+=1;
    else return 0;
  }
  if(terms.higgsed!==null&&terms.higgsed!==(row.orbit!=='0'))return 0;
  const haystack=searchNormalize(`${row.title} ${row.id} ${row.lie_type} ${row.group} ${row.flavor?.group||''} p${row.p} p=${row.p} Y=${row.orbit} ${row.orbit==='0'?'unhiggsed':'higgsed'}`);
  return terms.words.every(word=>haystack.includes(word))?score:0;
}
function searchResults(rows,query){
  const terms=parseTheoryQuery(query);
  return rows.map((row,index)=>({row,index,score:matchesTheorySearch(row,terms)})).filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score||a.index-b.index).map(r=>r.row);
}
function filterList(){
  const query=$('#search').value,family=$('#family').value;
  const rows=searchResults(catalog.filter(r=>(!family||r.lie_type===family)&&(!$('#unhiggsed').checked||r.orbit==='0')),query);
  $('#count').textContent=`${rows.length} / ${catalog.length} entries`;
  $('#theories').innerHTML=rows.map(r=>`<a class="theory-link ${r.id===selected?'active':''}" href="#${encodeURIComponent(r.id)}" ${r.id===selected?'aria-current="page"':''}><div class="name"><span>D<sub>${r.p}</sub>(${esc(r.group)})</span><span class="theory-type">${esc(r.lie_type)}</span></div><div class="orbit"><span class="orbit-value">${orbitSymbol} = ${orbitHTML(r.orbit)}</span><span class="orbit-kind">${r.orbit==='0'?'Unhiggsed':'Higgsed'}</span></div></a>`).join('')||'<div class="no-results">No matching theories. Try a group (E7, SU(4), SO(8)), a value of p (p19) or an orbit ([3,2,2,1]).</div>';
}
// Keyboard: "/" focuses search, Enter opens the first match, arrows move
// through the list and Escape clears the query or returns to the search box.
function theoryLinks(){return [...(document.querySelectorAll('#theories .theory-link')||[])]}
function bindSearchKeys(){
  const search=$('#search'),list=$('#theories');
  search.addEventListener('keydown',event=>{
    const links=theoryLinks();
    if(event.key==='Enter'&&links[0]){event.preventDefault();location.hash=links[0].getAttribute('href');}
    else if(event.key==='ArrowDown'&&links[0]){event.preventDefault();links[0].focus();}
    else if(event.key==='Escape'&&search.value){event.preventDefault();search.value='';filterList();}
  });
  list.addEventListener('keydown',event=>{
    const links=theoryLinks(),i=links.indexOf(document.activeElement);if(i<0)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();const next=i+(event.key==='ArrowDown'?1:-1);
      if(next<0)search.focus();else links[Math.min(next,links.length-1)].focus();
    }else if(event.key==='Escape'){event.preventDefault();search.focus();}
  });
  document.addEventListener?.('keydown',event=>{
    const target=event.target,typing=target&&(/^(?:input|select|textarea)$/i.test(target.tagName||'')||target.isContentEditable);
    if(event.key==='/'&&!typing&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();search.focus();search.select?.();}
  });
  document.querySelectorAll('[data-search-example]').forEach(button=>button.onclick=()=>{search.value=button.dataset.searchExample;filterList();search.focus();});
}
async function loadCatalog(){
  const data=await api('/api/catalog');catalog=data.theories;
  $('#revision').textContent=`${catalog.length} theories · DB updated: ${data.database_updated_at_utc?new Date(data.database_updated_at_utc).toLocaleString():'not recorded'}`;
  $('#revision').title=data.database_time_scope||'';
  const prior=$('#family').value;
  const families=[...new Set(catalog.map(r=>r.lie_type))].sort();
  $('#family').innerHTML='<option value="">All groups</option>'+families.map(f=>`<option value="${esc(f)}">${esc(catalog.find(r=>r.lie_type===f).group)}${catalog.find(r=>r.lie_type===f).group===f?'':' · '+esc(f)}</option>`).join('');
  $('#family').value=prior;filterList();return data;
}
async function selectTheory(id,routeState={}){
  const serial=++requestId;selected=id;setNavigation('theory');filterList();$('#main').setAttribute('aria-busy','true');
  if(record?.id!==id)$('#main').innerHTML='<div class="empty" role="status">Loading the selected theory…</div>';
  try{
    const data=await api(`/api/theories/${encodeURIComponent(id)}`);if(serial!==requestId)return;
    record=data;modelId=routeState.model||data.current_model_id||'';
    if(routeState.model&&!data.models?.some(m=>m.id===modelId))throw new Error('This model is not present in this snapshot. Open the theory link without its model parameter.');
    form=['schur','macdonald','hl'].includes(routeState.index)?routeState.index:'schur';
    tab=tabs.some(t=>t[0]===routeState.view)?routeState.view:'indices';
    representation=routeState.representation==='characters'?'characters':'dimensions';
    datasetId=preferredDatasetId();
    cutoff=routeState.cutoff??null;historyId='';viewSettings={};render();window.AtlasLive?.refresh();
  }catch(e){if(serial===requestId)$('#main').innerHTML=`<div class="notice error">${esc(e.message)}</div>`}
  finally{if(serial===requestId)$('#main').removeAttribute('aria-busy')}
}
function datasetControls(){
  if(staticSite)return '';
  const d=dataset();
  return `<p class="small computation-current">Result record: ${esc(d.label)} · ${esc(d.arithmetic||'See original evidence')}<br><button class="text-link" data-open-evidence>View calculation record and source</button></p>`;
}
function selectComputation(id){
  if(!record.datasets.some(d=>d.id===id))return;
  historyId=id;tab='evidence';render();saveRoute();
}
function bindDatasetControls(){document.querySelectorAll('[data-open-evidence]').forEach(b=>b.onclick=()=>selectComputation(datasetId))}
const indexNames={schur:'Schur',macdonald:'Macdonald',hl:'Hall–Littlewood'};
function scopeTone(scope){return scope.display_tone||({checked:'checked',reference:'reference',mismatch:'mismatch',probe:'historical',superseded:'historical',stored:'pending'}[scope.state]||'pending')}
function readerProse(value){return String(value??'').replace(/Schur\s*\/\s*SXY/g,'Schur').replace(/SXY\s*\/\s*HL/g,'Schur / HL').replace(/\bSXY\b/g,'the closed-form Schur index')}
function flavorComparisonText(scope){
  const checks=scope?.flavor_comparisons||[];
  if(!checks.length)return 'No independent flavor-refined comparison is recorded for this result.';
  return checks.map(c=>`Flavor-refined ${indexNames[c.index]}${c.kind==='limit'?' limit':''}: agreement through ${c.index==='hl'?'t':'q'} ≤ ${c.cutoff} with ${c.index==='schur'?'the closed-form Schur index':c.index==='macdonald'?'the Macdonald formula':c.index==='hl'?'the Higgs branch Hilbert series':readerProse(c.reference)}.`).join(' ');
}
function macdonaldDirectComparison(){
  const model=currentModel();
  return record.datasets.flatMap(d=>{
    const s=d.index_status?.macdonald;
    if(!s||s.state!=='checked'||(model&&!model.result_links?.[d.id]?.macdonald))return [];
    const direct=(s.flavor_comparisons||[]).find(c=>c.index==='macdonald'&&c.kind==='direct');
    return s.exact_reference_match||direct?[{cutoff:s.exact_reference_match?s.cutoff:direct.cutoff,flavor:direct?.cutoff}]:[];
  }).sort((a,b)=>degree(b.cutoff)-degree(a.cutoff))[0];
}
function comparisonReferencesHTML(index=null){
  const schur='<a href="https://arxiv.org/abs/1706.01607" target="_blank" rel="noreferrer">Vertex operator algebras of Argyres–Douglas theories from M5-branes</a> (Song, Xie and Yan, §4.3).';
  const a1=record.lie_type==='A1';
  const macdonald=a1?`<p><strong>Macdonald formula.</strong> <a href="https://arxiv.org/abs/1612.08956" target="_blank" rel="noreferrer">Macdonald Index and Chiral Algebra</a> (Song, Appendix ${record.orbit==='0'?'A.2, Eqs. (A.9)–(A.10)':'A.1'}). ${record.orbit==='0'?`For odd p, D<sub>p</sub>(SU(2)) = (A₁,D<sub>p</sub>), with p = 2n + 1.`:''} We use t = qT to compare with the convention of this atlas. The original formula is also given in <a href="https://arxiv.org/abs/1509.06730" target="_blank" rel="noreferrer">Superconformal indices of generalized Argyres–Douglas theories from 2d TQFT</a>. The comparison orders above refer to the stored calculation.</p>`:'';
  if(index==='macdonald')return macdonald?`<details class="comparison-references"><summary>Macdonald comparison reference</summary>${macdonald}</details>`:'';
  return `<details class="comparison-references"><summary>Index comparison references</summary><p><strong>Schur formula.</strong> ${schur}</p>${macdonald}<p><strong>Hall–Littlewood.</strong> We compare the diagonal limit with the independent Higgs branch Hilbert series.${staticSite?'':' The calculation record identifies the Higgs variety and reference.'}</p></details>`;
}
function comparisonScopeText(scope){
  const base=scope?.comparison_scope==='unrefined coefficients'
    ?'Unrefined comparison (flavor fugacities = 1)'
    :scope?.comparison_scope||'See calculation record';
  return base+((scope?.flavor_comparisons||[]).length?'. '+flavorComparisonText(scope):'');
}
function indexSummaryHTML(){
  return `<nav class="index-picker" aria-label="Index selection">${Object.entries(indexNames).map(([key,name])=>`<button data-index-form="${key}" aria-pressed="${form===key}">${name}${!indexSummary()[key]?' · unavailable':''}</button>`).join('')}</nav>`;
}
function selectedIndexNotice(){
  const d=dataset(),scope=d.index_status?.[form];if(!scope)return '';
  const relation=currentModel()?.result_links?.[d.id]?.[form]||(indexSummary()[form]?.dataset_id===d.id?indexSummary()[form]?.relation:null);
  const relationText={'unfiltered-comparison':'Unfiltered comparison of this model’s algebra; it does not test its T-filtration.',
    'proved-limit-transfer':'This limit is transferred from the historical filtration by the saved proof. Its Macdonald series is not transferred.',
    'independent-reference':'Independent Higgs Hilbert reference; this is not a computed Macdonald diagonal.'}[relation];
  return `<div class="selected-scope ${scopeTone(scope)}" role="note"><strong>${esc(indexNames[form])}${form==='macdonald'&&record.completion?' model result':''}: ${form==='hl'?'t':'q'} ≤ ${esc(scope.cutoff)}</strong><span>${esc(readerProse(scope.label))}</span><span class="scope-meaning">${esc(comparisonScopeText(scope))}</span>${relationText?`<span>${relationText}</span>`:''}</div>`;
}
function showIndex(name){
  if(!Object.hasOwn(indexNames,name)||name===form)return;
  rememberView();form=name;
  const saved=viewSettings[stateKey()];cutoff=saved?.cutoff??null;representation=saved?.representation||representation;datasetId=preferredDatasetId();
  render();saveRoute();document.querySelector(`[data-index-form="${name}"]`)?.focus({preventScroll:true});
}
function bindIndexSummary(){document.querySelectorAll('[data-index-form]').forEach(b=>b.onclick=()=>showIndex(b.dataset.indexForm))}

function campaignProgressHTML(){
  const j=record.verification_scope?.jump;if(!j)return '';
  const b=record.verification_scope?.betti;
  return `<section class="verification-progress" aria-label="Jump verification"><h3>${math(j.label)}</h3>${j.detail?`<p>${orbitProse(j.detail)}</p>`:''}<p class="small">Unhiggsed target: (base, jet) = (p + c − 1, 1); total q order = p + c, where c is the second-smallest fundamental Casimir degree. SU(2) has no such target. Higgsed reductions can change the relevant degree or remove coefficient freedom; the parent target is not automatically imposed. Index comparisons remain independent.</p></section>${b?`<section class="verification-progress" aria-label="Minimal singlet Betti verification"><h3>${math(b.label)}</h3><p>${orbitProse(b.detail)}</p>${b.paper_comparison?`<details><summary>Paper singlet-count comparison</summary><p>${orbitProse(b.paper_comparison.summary)}</p></details>`:''}<p class="small">For unhiggsed Dp(G) with a second fundamental Casimir, the prescribed minimal flavor-singlet β₂ is 1, or 2 for SO(8). Higgsed values are measurements without a prescribed multiplicity. Lower-degree polynomial multiples are removed; universal Koszul generators are retained if minimal. A Betti value alone does not certify a jump.</p></section>`:''}`;
}

function pfaffianEulerRevisionHTML(){
  const r=record.pfaffian_euler_revision;if(!r)return '';
  const c=r.filtration_certificate,u=c.minor_grade,w=c.scalar_pfaffian_grade;
  const verified=record.pfaffian_recomputation;
  const current=verified?.cutoff??r.current_macdonald_cutoff;
  return `<div class="notice"><strong>Pfaffian filtration corrected · Euler relation</strong><p>Currents M: (1,1); ${esc(u.multiplicity)} covariants U: (${esc(u.q)},${esc(u.T)}); scalar Pfaffian: (${esc(w.q)},${esc(w.T)}).</p><p>${esc(c.euler_identity)}. The scalar is a composite of M and U; no additional scalar lowering is imposed.</p><p>Current Macdonald: q ≤ ${esc(current)}${verified?' over QQ':''}. ${verified?'Schur and independent Higgs Hilbert (HL) comparisons pass through this cutoff.':''} Historical records through q ≤ ${esc(r.historical_macdonald_cutoff)} retain their original scalar degree.</p><p class="small">Euler supplies a filtration upper bound, not uniqueness of the physical filtration. Index checks do not certify a coefficient-sensitive jump.</p></div>`;
}

function paperAlignmentHTML(detail=false){
  const a=record.paper_alignment;
  if(!a||!modelScheme().covariant_filtration)return '';
  const ids=currentModel()?.dataset_ids||record.datasets.map(d=>d.id);
  if(!ids.some(id=>(a.dataset_ids||[]).includes(id)))return '';
  const rows=(a.coefficient_corrections||[]).map(r=>`<tr><td>q${esc(r.q)} T${esc(r.T)}</td><td>${esc(r.paper)}</td><td>${esc(r.corrected)}</td></tr>`).join('');
  return `<div class="notice"><strong>Manuscript (4.32): coefficient correction</strong><p>The auxiliary-variable presentation realizes the nilradical filtration of §4.1. All 232 filtered-image blocks through q¹² were recomputed over QQ; the stored atlas coefficients are retained. We correct five coefficients in our manuscript. Schur and HL are unchanged.</p>${detail?`<p>R = QQ[𝔢₆]/(∇P), N = (C₂, C₅, C₆, ∇C₉), FₛR_d = (N<sup>max(d−s,0)</sup>)_d. U₉ has (q,T)=(8,7). U₁₂ has (11,10) and is redundant: ∇C₁₂ ∈ (C₂,C₅,C₆) in R, proved by the exact H₆∇P identity. Adding it does not lower the filtration further.</p><p>The two generating ideals agree globally. The stored nilradical certificate and index replay cover degrees through 12; physical identification at all orders is not claimed.</p>`:''}<details><summary>Five corrected coefficients and evidence</summary><div class="table-wrap"><table><thead><tr><th>Term</th><th>Our manuscript</th><th>Exact replay / atlas</th></tr></thead><tbody>${rows}</tbody></table></div><p>Equation (4.31) and the filtration definition stay unchanged. This comparison refers to the draft accompanying this atlas, before these corrections.</p>${staticSite?'':`<p class="source">Filtration: ${esc(a.filtration_certificate_sha256)}<br>Recomputation: ${esc(a.recomputed_certificate_sha256)}<br>Alignment: ${esc(a.certificate_sha256)}</p>`}</details></div>`;
}

function covariantCorrectionHTML(){
  const c=record.filtration_correction;if(!c)return '';
  const graphs=c.candidate_graphs||[c.generator];
  const correctedMac=record.datasets.filter(d=>d.macdonald&&d.scheme?.covariant_filtration&&d.checks?.schur_matches&&d.checks?.hall_littlewood_matches&&d.fixed_coefficient_evidence).sort((a,b)=>Number(b.cutoff)-Number(a.cutoff))[0];
  return `<div class="notice"><strong>Covariant filtration · HL repair</strong><p>${graphs.map(g=>`${esc(g.name)} = ∇C<sub>${esc(g.q_degree+1)}</sub>(M): (q,T) = (${esc(g.q_degree)}, ${esc(g.T_degree)})`).join('; ')}.</p><p>Exact corrected HL comparison: t ≤ ${esc(c.hl_verified_cutoff)}. Eliminating the auxiliary variables preserves the q-graded ring and hence its Schur series. ${correctedMac?`Corrected Macdonald: q ≤ ${esc(correctedMac.cutoff)}, with both limits checked.`:'The corrected two-variable Macdonald series is unavailable.'} Historical auxiliary Casimir presentations retain their original filtration.</p><p class="small">The T assignments are candidates. HL fixes the diagonal quotient and does not uniquely determine the lower T degrees.</p></div>`;
}

function milestoneHTML(){
  const s=record.verification_scope;if(!s?.jump)return '';
  return `<div class="milestones">${[s.jump,s.betti].filter(Boolean).map(j=>`<span class="${['verified','measured','betti-satisfied'].includes(j.state)?'match':j.state==='mismatch'||j.state==='absent'?'scope-mismatch':'scope-neutral'}">${math(j.label)}</span>`).join('')}</div>`;
}

function render(){
  const m=currentModel(),historical=m&&!m.current;
  $('#main').innerHTML=`<div class="eyebrow">${esc(record.lie_type)} / D<sub>p</sub>(G) COLLECTION</div><div class="title-row"><div><h2 class="theory-title">D<sub>${record.p}</sub>(${esc(record.group)})</h2><p class="theory-identity">${orbitSymbol} = ${orbitHTML(record.orbit)} · ${record.orbit==='0'?'Unhiggsed':'Nilpotent Higgsing'} · Flavor: ${esc(record.flavor?.group||'See source')}</p></div>${staticSite?'':'<button id="download">Theory JSON ↓</button>'}</div>
    ${historical?'<div class="notice">You are viewing another stored presentation. The jump status below refers to the current model. Index results and checks refer to the selected presentation. <button id="current-model">Return to current model</button></div>':''}${milestoneHTML()}${staticSite?'':'<section id="live-computation" aria-label="Local calculation activity"></section>'}
    <div class="tabs" role="tablist" aria-label="Theory information">${tabs.map(([key,label])=>`<button role="tab" aria-selected="${tab===key}" class="tab ${tab===key?'active':''}" data-tab="${key}">${label}</button>`).join('')}</div><section id="panel" role="tabpanel"></section>`;
  if(!staticSite)$('#download').onclick=()=>download(`${record.id}.json`,JSON.stringify(record,null,2),'application/json');
  if(historical)$('#current-model').onclick=()=>selectModel(record.current_model_id);
  document.querySelectorAll('[data-tab]').forEach((button,index)=>{
    button.tabIndex=button.dataset.tab===tab?0:-1;button.id='tab-'+button.dataset.tab;button.setAttribute('aria-controls','panel');
    button.onclick=()=>showSection(button.dataset.tab);
    button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;showSection(tabs[i][0])};
  });
  $('#panel').setAttribute('aria-labelledby','tab-'+tab);
  if(tab==='model')renderModel();else if(tab==='evidence')renderEvidence();else renderIndices();
  window.AtlasLive?.render();
}
function selectModel(id){
  if(!record.models?.some(m=>m.id===id))return;
  rememberView();modelId=id;cutoff=null;representation='dimensions';datasetId=preferredDatasetId();historyId='';render();saveRoute();
}
function renderIndices(){
  datasetId=preferredDatasetId();
  const d=dataset(),rows=d[form]||[],options=rows.map(r=>r.q);
  if(cutoff===null||!options.includes(cutoff))cutoff=options.at(-1)||'0';
  const characterAvailable=Boolean(d.characters?.length||indexSummary()[form]?.character_dataset_id||(form==='schur'&&record.schur_character_formula));
  if(!characterAvailable)representation='dimensions';
  const flavored=isFlavor();
  $('#panel').innerHTML=`<div class="panel-head"><h3>Index results</h3><span class="small">${currentModel()?.current===false?'Selected presentation':'Current common model'}</span></div>`+indexSummaryHTML()+
    (rows.length?(record.obstruction&&currentModel()?.current!==false?`<div class="notice error">Current model issue: ${orbitProse(record.obstruction.conclusion)}</div>`:'')+selectedIndexNotice()+(form==='macdonald'?paperAlignmentHTML():'')+`<div class="controls"><label for="representation">Representation</label><select id="representation"><option value="dimensions" ${!flavored?'selected':''}>Unrefined dimensions</option><option value="characters" ${flavored?'selected':''} ${!characterAvailable?'disabled':''}>Flavor characters${!characterAvailable?' · unavailable':''}</option></select><label for="cutoff">Display ${form==='hl'?'t':'q'} ≤</label><select id="cutoff">${options.map(q=>`<option ${q===cutoff?'selected':''}>${esc(q)}</option>`).join('')}</select><button id="copy-series">Copy series</button><button id="tex">TeX ↓</button></div><p class="small">Display cutoff changes the truncation only. It does not change the verification window.</p><div id="series-body"></div>`+(form==='macdonald'?comparisonReferencesHTML('macdonald'):'')+datasetControls():`<div class="empty">No compatible ${esc(indexNames[form])} result is available for this model. ${staticSite?'':'Other calculations and their original scope remain in Verification &amp; history.'}</div>`);
  bindIndexSummary();bindDatasetControls();if(!rows.length)return;
  $('#cutoff').onchange=e=>{cutoff=e.target.value;renderSeries();rememberView();saveRoute()};
  $('#representation').onchange=e=>{representation=e.target.value;datasetId=preferredDatasetId();renderIndices();rememberView();saveRoute()};
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
let html=`<p class="small">${esc(flavorComparisonText(d.index_status?.[form]))}${form==='macdonald'&&(d.index_status?.[form]?.flavor_comparisons||[]).length&&!(d.index_status?.[form]?.flavor_comparisons||[]).some(c=>c.index==='macdonald'&&c.kind==='direct')?' These are limit checks, not an independent two-variable Macdonald comparison.':''}</p>`;if(form==='schur'&&record.schur_character_formula)html+=`<div class="card"><h3>Flavor-refined Schur · closed formula</h3><div class="formula">${math(record.schur_character_formula)}</div><div class="small">χ denotes a flavor character. PE[f] = exp(∑<sub>k≥1</sub> f(q<sup>k</sup>,x<sup>k</sup>)/k). <a href="${esc(record.schur_character_source.url)}" target="_blank" rel="noreferrer">Kang–Lawrie–Song, Eq. (3.7)</a></div></div>`;
if(d.characters){const missing=characterCoverage();if(missing.length)html+=`<div class="notice">Flavor coefficients are not stored at degrees ${missing.map(esc).join(', ')} within the selected window. The rows below are partial; a complete character-series export is unavailable.</div>`;html+=`<div class="small">χ<sub>G [a₁,…,aᵣ]</sub> uses Dynkin labels. z denotes a U(1) fugacity; distinct representations of equal dimension remain separate.</div><div class="table-wrap"><table><thead><tr><th>${form==='hl'?'t':'q'} degree</th><th>${esc(form)} character coefficient</th></tr></thead><tbody>${selectedCharacterRows().map(r=>`<tr><td class="degree">${esc(r.q)}</td><td class="character">${r.cells.map(c=>`<div class="character-row"><span class="t">${form==='macdonald'?power('T',c.T):''}</span><span>${c.terms.map(t=>`<span class="char-term">${charTerm(t)}</span>`).join(' + ')||'0'}</span></div>`).join('')||'0'}</td></tr>`).join('')}</tbody></table></div>`;}else{html+='<div class="empty">No complete coefficientwise flavor decomposition is stored for this computation. Representations are not inferred from unrefined dimensions.</div>';if(form==='macdonald'&&(d.first_null_character_formula||record.first_null_character_formula))html+=`<div class="card"><h3>Potential candidate through the first null · representation-ring formula</h3><div class="formula">${math(d.first_null_character_formula||record.first_null_character_formula)}</div><p class="small">Valid only below the displayed O(q…) order. ${esc(record.notes.find(n=>n.includes('character formula'))||'')}</p></div>`;if(d.ideal_characters&&!staticSite)html+=`<details><summary>Stored ideal-image characters (not the full index characters)</summary><pre>${esc(JSON.stringify(d.ideal_characters,null,2))}</pre></details>`;}
body.innerHTML=html;return;}
const rows=d[form];if(!rows){body.innerHTML=`<div class="empty">This dataset has no ${esc(form)} series. Inspect other records in Verification &amp; history.</div>`;return;}
const filtered=rows.filter(r=>degree(r.q)<=degree(cutoff));const reference=d[`${form}_target`]||((form==='schur')?d.arc_schur:null);const refMap=new Map((reference||[]).map(r=>[r.q,r.value]));
const summary=form==='macdonald'?filtered.map(r=>({q:r.q,value:polynomial(r.terms)})):filtered;
body.innerHTML=`<details open><summary>Complete selected series</summary><div class="formula">${form==='macdonald'?'I<sub>M</sub>(q,T)':form==='schur'?'I<sub>S</sub>(q)':d.hl_kind==='independent-reference'?'H<sub>Higgs</sub>(t)':'I<sub>HL</sub>(t)'} = ${summary.map(r=>{const coefficient=form==='macdonald'?r.value:esc(r.value);if(coefficient==='0')return '';return r.q==='0'?coefficient:`${power(form==='hl'?'t':'q',r.q)} (${coefficient})`}).filter(Boolean).join(' + ')}<span class="small"> &nbsp; (degree ≤ ${esc(cutoff)})</span></div></details><div class="table-wrap"><table><thead><tr><th>Degree n</th><th>${form==='macdonald'?'Cₙ(T)':'Coefficient'}</th>${reference?'<th>Reference coefficient</th><th>Comparison</th>':''}</tr></thead><tbody>${filtered.map(r=>`<tr><td class="degree">${esc(r.q)}</td><td class="math">${form==='macdonald'?polynomial(r.terms):esc(r.value)}</td>${reference?`<td class="math">${esc(refMap.get(r.q)??'Not computed')}</td><td class="${!refMap.has(r.q)?'small':r.value===refMap.get(r.q)?'match':'mismatch'}">${!refMap.has(r.q)?'Not checked':r.value===refMap.get(r.q)?'Match':'Mismatch'}</td>`:''}</tr>`).join('')}</tbody></table></div><div class="footer-note">${form==='hl'?(d.hl_kind==='independent-reference'?'This table is the independent Higgs Hilbert reference. It is not a computed Macdonald diagonal.':d.hl_kind==='model-diagonal'?'The HL diagonal of the filtered ring is proved separately and agrees with the Higgs Hilbert series. See the Macdonald verification window for the two-variable calculation.':'This table is the diagonal of the selected Macdonald candidate. Reference coefficients come from the stored independent Higgs-orbit calculation.'):'Coefficients beyond the displayed cutoff are unknown, not zero.'} ${reference&&form==='schur'?'The comparison column uses the stored independent Schur reference or arc series.':''}</div>`;
}
function filtrationDefinitionHTML(){
  if(record.orbit!=='0')return `<div class="card"><h4>Filtration on the Slodowy slice</h4><p>Let P<sub>e</sub> be the restriction of P to S<sub>${orbitSymbol}</sub> = e + ker(ad f), and R<sub>Pₑ</sub> its Jacobian ring. If [h,Tᵢ] = −κᵢTᵢ, the affine coordinate nᵢ has half-Kazhdan degree qᵢ = 1 + κᵢ/2. With 𝔫<sub>e</sub> the nilradical, we propose</p><div class="formula">F<sub>s</sub>(R<sub>Pₑ</sub>)<sub>d</sub> = (𝔫<sub>e</sub><sup>max(⌈d−s⌉,0)</sup>)<sub>d</sub>, &nbsp; s ∈ ½ℤ.</div><p>Here d is half-Kazhdan degree. Jet derivatives preserve d and s and add one to jet degree, hence one to total q degree. In our second paper, §5, Eqs. (5.3)–(5.9), we restrict the nilradical generators as well as the potential.</p><details><summary>Type-A auxiliary Casimir presentation</summary><p>For D<sub>p</sub>(SU(N),${orbitSymbol}), the bifiltered presentation assigns deg(nᵢ) = (qᵢ,qᵢ) and deg(wₖ) = (k,k−1), with wₖ = Cₖ|<sub>S${orbitSymbol}</sub>(n). The quotient also imposes ∂P<sub>e</sub>/∂nᵢ = 0. These assignments induce a filtration; they need not give a bigrading of the quotient.</p><p class="small"><a href="https://arxiv.org/abs/2609.13374" target="_blank" rel="noreferrer">The index from a nonpoint and RG flows</a>, Eqs. (2.8)–(2.15).</p></details><p class="small">The selected presentation above records its actual filtration and any reductions. The proposal does not change the evidence or cutoff of a stored historical calculation.</p></div>`;
  return `<div class="card"><h4>Nilradical filtration</h4><p>Let R<sub>P</sub> = ℂ[𝔤<sub>ℂ</sub>]/J<sub>P</sub>, where J<sub>P</sub> is the Jacobian ideal of P, and let 𝔫 be the ideal of nilpotent elements in R<sub>P</sub>. We propose</p><div class="formula">F<sub>s</sub>(R<sub>P</sub>)<sub>d</sub> = (𝔫<sup>max(d−s,0)</sup>)<sub>d</sub>.</div><p>Here d is polynomial degree. Jet derivatives add one to total q degree and preserve T-filtration degree. We propose that the Hilbert series of the associated graded arc algebra gives the Macdonald index.</p><details><summary>Auxiliary Casimir presentation</summary><p>A homogeneous generator nᵢ of 𝔫 of degree dᵢ can be represented by an auxiliary variable yᵢ with assigned degrees (dᵢ,dᵢ−1), subject to yᵢ = nᵢ. Relations may lower the induced filtration degree further. When the Casimir invariants generate 𝔫, these are the auxiliary Casimir variables. At small p, additional covariants may be needed; the Casimirs alone must not be assumed to generate 𝔫.</p></details><p class="small">One ring to rule them all, §4.1, Eqs. (4.3)–(4.16), arXiv:2610.xxxxx (to appear). Identification of the nilradical and the available comparison window are recorded separately for each example.</p></div>`;
}
function filtrationHTML(s){
  const cert=s.filtration_certificate,rows=[];
  // A recorded assignment is independent of whether a filtered index is available.
  if(s.grading?.startsWith('Currents M:')){
    rows.push(record.orbit==='0'?['Currents M',1,1]:['Slice coordinates nᵢ (qᵢ = 1 + κᵢ/2)','qᵢ','qᵢ']);
    for(const i of s.invariants||[])if(!(cert&&/^Pf/.test(i.name)))rows.push([
      /^Pf/.test(i.name)?`Scalar Pfaffian ${i.name}`:`${record.orbit==='0'?'Casimir invariant':'Restricted Casimir'} ${i.name}`,
      i.degree,i.T_degree??i.degree-1]);
  }
  if(cert){rows.push(['Scalar Pfaffian Pf(M)',cert.scalar_pfaffian_grade.q,cert.scalar_pfaffian_grade.T]);rows.push([`Pfaffian covariants ∂ₐPf (${cert.minor_grade.multiplicity} components)`,cert.minor_grade.q,cert.minor_grade.T]);}
  for(const g of s.covariant_filtration||[])rows.push([`Covariant ∇C${g.q_degree+1} (${g.name})`,g.q_degree,g.T_degree]);
  if(rows.length)rows.push(['Derivative ∂ (degree increment)',1,0]);
  return `<h3>T-filtration</h3>
    <h4>Recorded filtration degrees</h4>
    ${rows.length?`<div class="table-wrap"><table class="filtration-degrees"><thead><tr><th>Element / operation</th><th>q degree</th><th>T-filtration degree</th></tr></thead><tbody>${rows.map(([n,q,t])=>`<tr><td>${potentialProse(n)}</td><td>${esc(q)}</td><td>${esc(t)}</td></tr>`).join('')}</tbody></table></div>`:''}
    <p class="small">${potentialProse(s.grading||'Generator degrees are not specified in the saved presentation.')} We write the Casimir invariants as C<sub>d</sub>, with the recorded coefficient normalizations unchanged.</p>
    ${cert?`<div class="notice"><strong>${currentModel()?.current?'Current':'Stored'} Pfaffian assignment</strong><p>Scalar Pfaffian T degree ${esc(cert.scalar_pfaffian_grade.T)}. ${potentialProse(cert.euler_identity||cert.scope||'')}</p><p>Euler gives a filtration upper bound, not a proof of a lower bound or unique physical filtration.</p><details><summary>Filtration assumptions and certificate</summary><ul>${(cert.assumptions||[]).map(a=>`<li>${potentialProse(a)}</li>`).join('')}</ul>${staticSite?'':`<p class="source">${esc(cert.certificate_sha256)}</p>`}</details></div>`:''}
    <details><summary>Auxiliary variables and defining relations</summary><p>${potentialProse(s.graph||'See source for defining relations.')}</p><p>Auxiliary variables represent the stated invariant polynomials or covariants; they are not additional independent operators. The stored symbols W and U are computational names for these representatives.</p><p class="small">Form the jet algebra with all differential consequences of the relations, then take the associated graded ring for the induced T-filtration. Eliminating auxiliary variables preserves the q-graded ring; their stated filtration degrees must also be retained.</p></details>
    <details class="filtration-background"><summary>Nilradical filtration: definition and scope</summary>${filtrationDefinitionHTML()}${record.id==='D5-p3-Y0'?'<p class="small">In our second paper, Eqs. (4.25)–(4.28), we use 𝔫′ = (C₂, ∂ₐPf) and verify (𝔫′)₍d₎ = 𝔫₍d₎ through d = 8 by the independent Higgs Hilbert series. We do not claim a complete generating set at all degrees. Later atlas calculations retain their separately stated windows.</p>':''}</details>
    ${staticSite?'':'<div class="kv"><strong>Specializations</strong><div>Schur: T = 1.<br>HL: keep terms q<sup>n</sup>T<sup>n</sup>, giving t<sup>n</sup>, including half-integer n when present. Equivalently T = t/q and q → 0 when T degree ≤ q degree; the conventional second fugacity is t = qT.</div></div>'}
    <p class="small">The table and checks belong to the selected presentation, including historical choices. Introducing auxiliary variables alone does not prove agreement with the nilradical filtration. Finite index comparisons retain their stated scope.</p>`;
}
function renderModel(){
  const s=modelScheme(),m=currentModel();
  $('#panel').innerHTML=`<div class="panel-head"><h3>Potential &amp; T-filtration</h3><span class="small">Shared by all index views</span></div><h3>Potential · ${orbitSymbol} = ${orbitHTML(record.orbit)}${s.potential_degree!=null?' · degree '+esc(s.potential_degree):''}</h3>
    ${s.potential?`<div class="formula">${potentialHTML(s)}</div>${s.potential_tex?'<button id="potential-tex">Copy potential TeX</button>':''}`:'<p>No potential is specified. See the stored defining relations.</p>'}
    ${s.convention?`<p class="small">${potentialProse(s.convention)}</p>`:''}<div class="kv"><strong>Slodowy slice</strong><div>${potentialProse(s.slice||'See source')}</div></div>
    ${filtrationHTML(s)}
    ${paperAlignmentHTML(true)}
    ${s.associated_orbits&&!staticSite?`<details><summary>Associated orbits</summary><pre>${esc(JSON.stringify(s.associated_orbits,null,2))}</pre></details>`:''}${s.special_geometries&&!staticSite?`<details><summary>Special geometries</summary><pre>${esc(JSON.stringify(s.special_geometries,null,2))}</pre></details>`:''}
    ${record.obstruction&&m?.current!==false?`<div class="notice error">${potentialProse(record.obstruction.interpretation||record.obstruction.conclusion)}</div>`:''}`;
  if(s.potential_tex)$('#potential-tex').onclick=async()=>{const tex=potentialTeX(s);try{await navigator.clipboard.writeText(tex);toast('Copied potential TeX.')}catch{download(`${record.id}-potential.tex`,tex,'text/plain')}};
}
function renderFiltration(){renderModel()}
function renderScheme(){renderModel()}

function sourceLinks(){if(staticSite)return '';const links=record.sources.map(source=>{const url=source.startsWith('https://')?source:`./source/${encodeURIComponent(source)}`;return `<a class="source" href="${esc(url)}" target="_blank" rel="noreferrer">↗ ${esc(source)}</a>`}).join('');return (staticSite?`<a class="source" href="./data/theories/${encodeURIComponent(record.id)}.json" target="_blank" rel="noreferrer">↗ Published theory data and verification metadata</a><a class="source" href="./manifest.json" target="_blank" rel="noreferrer">↗ Snapshot manifest and checksums</a>`:'')+links}
function selectedIndexEvidence(f){
  const model=currentModel(),scopes=record.datasets.filter(d=>
    (model?model.result_links?.[d.id]?.[f]:d.index_status?.[f])&&d.index_status?.[f]&&
    (!model?.current||!['probe','mismatch','superseded'].includes(d.index_status[f].state))).map(d=>d.index_status[f]);
  const checked=scopes.filter(s=>s.state==='checked');
  const max=rows=>rows.length?rows.reduce((a,b)=>degree(a.cutoff)>=degree(b.cutoff)?a:b).cutoff:null;
  return {available:max(scopes),checked:max(checked),allOrders:Boolean(record.all_orders_point&&model?.current)};
}
function verificationTableHTML(){
  const summary=indexSummary();
  const directMacdonald=macdonaldDirectComparison();
  return `<div class="table-wrap"><table class="verification-table"><thead><tr><th>Index</th><th>Available through</th><th>Verified through</th><th>Comparison</th></tr></thead><tbody>${Object.entries(indexNames).map(([f,name])=>{
    const s=summary[f],e=selectedIndexEvidence(f),v=f==='hl'?'t':'q';
    const through=n=>n==null?'—':`${v} ≤ ${esc(n)}`;
    const comparison={schur:'Closed-form Schur index',macdonald:directMacdonald?`Macdonald formula (q ≤ ${esc(directMacdonald.cutoff)}); Schur and HL limits`:'Schur and HL limits',hl:'Higgs branch Hilbert series'}[f];
    return `<tr data-scope="${f}"><td>${name}</td><td data-label="Available through">${e.allOrders?'All orders':e.available==null?'Unavailable':through(e.available)}</td><td data-label="Verified through" class="${e.checked!=null?'match':'scope-neutral'}">${e.allOrders?'All orders proved':e.checked==null?'Not verified':through(e.checked)}</td><td data-label="Comparison">${e.checked!=null?comparison:s?.state==='reference'?'Reference only':s?.state==='mismatch'?'Mismatch':e.available==null?'—':'No completed check'}${s?`<br><span class="small">${esc(s.arithmetic)}</span>`:''}</td></tr>`;
  }).join('')}</tbody></table></div><p class="small">We report comparison orders for the selected presentation. Schur and HL limit checks are separate from a direct two-variable Macdonald comparison, which is listed when available. ${staticSite?'':'Original calculations and arithmetic are retained below.'}</p>`;
}
function renderEvidence(){
  const d=record.datasets.find(x=>x.id===historyId),models=record.models||[];
  if(staticSite){
    $('#panel').innerHTML=`<div class="panel-head"><h3>Verification</h3></div>${verificationTableHTML()}${comparisonReferencesHTML()}${campaignProgressHTML()}`;
    return;
  }
  $('#panel').innerHTML=`<div class="panel-head"><h3>Verification &amp; history</h3><span class="small">Each comparison retains its own scope</span></div>${verificationTableHTML()}${comparisonReferencesHTML()}${campaignProgressHTML()}
    <details><summary>Current model revisions and interpretation</summary>${pfaffianEulerRevisionHTML()}${covariantCorrectionHTML()}${record.notes.map(n=>`<p class="small">${orbitProse(n)}</p>`).join('')}${record.historical_obstruction?`<details><summary>Historical model obstruction</summary><pre>${esc(JSON.stringify(record.historical_obstruction,null,2))}</pre></details>`:''}</details>
    <h3>Calculation records</h3><p class="small">Inspecting a record does not change the common model or the index results.</p><label for="history-record">Inspect record</label><select id="history-record" class="dataset"><option value="">Choose a calculation record</option>${record.datasets.map(x=>`<option value="${esc(x.id)}" ${x.id===historyId?'selected':''}>${esc(x.label)} · ${esc(x.id)}</option>`).join('')}</select>
    ${d?`<article class="record-detail"><h3>${esc(d.label)}</h3><p>${esc(d.arithmetic||'Original evidence')} · stored through ${esc(d.cutoff)}</p><p>${orbitProse(d.scope||'See the original evidence below.')}</p><p class="small">${d.model_id===modelId?'Linked to the selected model':d.model_id?'Different stored presentation':'Independent reference or model mapping not recorded'}</p>${d.model_id&&d.model_id!==modelId?`<button data-model="${esc(d.model_id)}">Open this presentation explicitly</button>`:''}<pre>${esc(JSON.stringify(d.index_status||{},null,2))}</pre><details><summary>Checks and provenance</summary><pre>${esc(JSON.stringify({checks:d.checks,provenance:d.provenance},null,2))}</pre></details><details><summary>Saved series and original presentation (JSON)</summary><pre>${esc(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>['schur','macdonald','hl','characters','scheme'].includes(k))),null,2))}</pre></details></article>`:''}
    <details><summary>Stored model presentations (${models.length})</summary>${models.map(m=>`<div class="model-history"><strong>${esc(m.label)}${m.current?' · current':''}</strong><p class="small">${orbitProse(m.scheme.potential||m.scheme.definition)}<br>${esc(m.id)} · ${m.dataset_ids.length} records</p><button data-model="${esc(m.id)}">${m.id===modelId?'Viewing this presentation':'Open presentation'}</button></div>`).join('')}</details>
    ${record.obstruction?`<details><summary>Current model obstruction</summary><pre>${esc(JSON.stringify(record.obstruction,null,2))}</pre></details>`:''}<h3>Sources &amp; provenance</h3>${sourceLinks()}<p class="footer-note">Read-only stored results. ${staticSite?'Publication snapshot; new results appear after deployment.':'Refresh to reload the cumulative data.'}</p>`;
  $('#history-record').onchange=e=>{historyId=e.target.value;renderEvidence()};
  document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{tab='model';selectModel(b.dataset.model)});
}
function exportSeries(tex){const d=dataset();if(!d[form])return `% No ${form} series stored for ${record.id}.`;let pieces=[];if(isFlavor()){if(d.characters&&characterCoverage().length)return `% Incomplete ${form} character table for ${record.id}; model ${modelId}; record ${d.id}; missing degrees ${characterCoverage().join(', ')}. No complete series exported.`;if(!d.characters)return `% No coefficientwise ${form} character table for ${record.id}; model ${modelId}; record ${d.id}.\n${form==='schur'?record.schur_character_formula||'':''}`;pieces=selectedCharacterRows().map(r=>{const cells=r.cells.map(c=>{const chars=c.terms.map(t=>charTerm(t,true)).join(' + ')||'0';return form==='macdonald'&&c.T!=='0'?`T^{${c.T}} (${chars})`:chars}).join(' + ')||'0';return r.q==='0'?`(${cells})`:`${form==='hl'?'t':'q'}^{${r.q}} (${cells})`})}else{if(!d[form])return `% No ${form} series stored for ${record.id}.`;pieces=d[form].filter(r=>degree(r.q)<=degree(cutoff)).map(r=>{const coefficient=form==='macdonald'?r.terms.map(t=>t.T==='0'?t.value:`${t.value} T^{${t.T}}`).join(' + ')||'0':r.value;return r.q==='0'?`(${coefficient})`:`${form==='hl'?'t':'q'}^{${r.q}} (${coefficient})`})}const expression=pieces.join(' + ');const scope=`${record.id}; model ${modelId||'unspecified'}; index ${form}; record ${d.id}; display <= ${cutoff}; ${d.index_status?.[form]?.label||'Original evidence'}; ${d.arithmetic||'See original evidence'}; comparison scope: ${comparisonScopeText(d.index_status?.[form])}${isFlavor()&&!(d.index_status?.[form]?.flavor_comparisons||[]).length?'; '+flavorComparisonText(d.index_status?.[form]):''}`;return tex?`% ${scope}.\n% Finite truncation; no higher coefficients asserted.\n\\[\n${expression}\n\\]\n`:expression+`\n(${scope})`}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
for(const selector of ['#search','#family','#unhiggsed'])$(selector).addEventListener('input',filterList);
bindSearchKeys();
$('.skip-link').onclick=event=>{event.preventDefault();$('#main').focus();};
function setNavigation(active){
  for(const name of ['explore','atlas','methods','progress']){
    const link=$('#'+name+'-link');
    if(!link)continue;
    if(name===active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  document.body.classList.toggle('exploring',active==='explore');
  document.body.classList.toggle('atlas-home-page',active==='atlas');
  document.body.classList.toggle('progress-view',active==='progress');
}

function renderHome(){
  $('#main').innerHTML=`<article class="atlas-home">
    <header class="atlas-intro"><div class="eyebrow">A COMPANION TO THE PAPERS</div>
      <h1>From geometry to superconformal index</h1>
      <p class="home-lead">ArcsToSCFT is a companion to <a href="https://arxiv.org/abs/2609.13374">2609.13374</a> &amp; 2610.xxxxx (to appear).</p>
      <p>Browse our D<sub>p</sub>(G) examples and nilpotent Higgsings, with polynomial potentials, T-filtrations and computed indices available as downloadable results.</p>
      <button id="browse-theories" class="browse-button">Find a theory <span aria-hidden="true">↗</span></button>
    </header>
    <section class="home-papers" aria-labelledby="papers-title"><div class="home-section-head"><span class="eyebrow">THE PAPERS</span><h2 id="papers-title">Our papers</h2></div>
      <article class="paper-entry"><div class="paper-number" aria-hidden="true">01</div><div><p class="paper-reference">arXiv:2609.13374</p><h3><a href="https://arxiv.org/abs/2609.13374">The index from a nonpoint and RG flows</a></h3><p class="paper-authors">Monica Jinwoo Kang · Craig Lawrie · Jaewon Song</p><p>We develop the construction for D<sub>p</sub>(SU(N)) and theories obtained by nilpotent Higgsing. A universal potential and its restriction to Slodowy slices organize candidate Macdonald indices and Higgs-branch RG flows, including flows whose infrared Higgs branch is a point.</p><a class="paper-link" href="https://arxiv.org/abs/2609.13374">Read the paper <span aria-hidden="true">↗</span></a></div></article>
      <article class="paper-entry"><div class="paper-number" aria-hidden="true">02</div><div><p class="paper-reference">arXiv:2610.xxxxx (to appear)</p><h3>One ring to rule them all: syzygy maximization for Argyres–Douglas</h3><p class="paper-authors">Monica Jinwoo Kang · Craig Lawrie · Jaewon Song</p><p>We extend our proposal to D<sub>p</sub>(G) of ADE type with coprime p and dual Coxeter number. Polynomial twisted periods determine invariant potentials; syzygies constrain their algebraic structure. The nilradical filtration gives candidate Macdonald indices, with Schur and Hall–Littlewood comparisons in the examples studied.</p></div></article>
    </section>
    <section class="home-construction" aria-labelledby="construction-title"><h2 id="construction-title">The construction</h2>
      <p>We associate a Jacobian ring to an invariant potential and propose that its reduced spectrum is the Higgs branch. Its nilpotent structure and T-filtration retain further protected-operator information. We use jets and arcs to construct candidate Schur and Macdonald indices, and restrict to a Slodowy slice to describe nilpotent Higgsing.</p>
      <div class="construction-line" aria-label="Potential, filtered ring, arc algebra, candidate index"><span>Potential</span><span aria-hidden="true">→</span><span>Filtered ring</span><span aria-hidden="true">→</span><span>Arc algebra</span><span aria-hidden="true">→</span><span>Candidate index</span></div>
    </section>
    ${!staticSite&&window.AtlasProgress?AtlasProgress.homeHTML(catalog):''}
    <section class="home-reading" aria-labelledby="reading-title"><h2 id="reading-title">Reading an entry</h2><p>Choose a group, p and Higgsing orbit ${orbitSymbol} in the theory browser. Each entry brings its potential and T-filtration together with Schur, Macdonald and Hall–Littlewood series. The displayed order and comparison scope belong to the selected result; a finite series does not assert higher coefficients or an all-orders identification.</p><p class="small">${orbitSymbol} = 0 denotes an unhiggsed theory. Partitions label nilpotent orbits, and I / II distinguish very-even orbits. The atlas records examples; it is not an exhaustive list of the theories in our papers.</p></section>
  </article>`;
  $('#browse-theories').onclick=()=>{$('#search').scrollIntoView?.({block:'center',behavior:'smooth'});$('#search').focus()};
}

function route(){
  let id,routeState;
  try{const [identifier,query='']=location.hash.slice(1).split('?');id=decodeURIComponent(identifier);routeState=Object.fromEntries(new URLSearchParams(query));}catch{showLoadError(new Error('This link has an invalid theory identifier.'));return;}
  if(!id||id==='home'||id==='atlas'||((staticSite||!window.AtlasProgress)&&id==='progress')||(staticSite&&(id==='explore'||id==='methods'))){
    requestId++;selected='';record=null;filterList();setNavigation('atlas');$('#main').removeAttribute('aria-busy');renderHome();return Promise.resolve();
  }
  if(id==='progress'){
    requestId++;selected='';filterList();setNavigation('progress');$('#main').removeAttribute('aria-busy');
    AtlasProgress.render($('#main'),catalog,{search:searchResults});return Promise.resolve();
  }
  if(id==='methods'){
    requestId++;selected='';filterList();setNavigation('methods');$('#main').removeAttribute('aria-busy');AtlasMethods.render($('#main'));return Promise.resolve();
  }
  if(id==='explore'){
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
$('#refresh').onclick=async()=>{if(window.AtlasLive){await window.AtlasLive.refresh(true);return;}const serial=requestId;try{await loadCatalog();if(serial!==requestId)return;await route();toast('Reloaded source results.')}catch(error){if(serial===requestId)toast(error.message)}};
window.addEventListener('hashchange',route);
window.addEventListener('popstate',route);
start();
