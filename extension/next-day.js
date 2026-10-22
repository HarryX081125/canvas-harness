/* Canvas Harness "Next school day": a Home module that puts everything due by the end of the next school day (the
   next weekday) in one place, course by course, from the assignments Harness already loads. Each piece says what it
   is (Test, Quiz, Writing, Reading) and, when it is handed in on Canvas, links straight to doing that: Submit on
   Canvas (a dropbox), Take quiz or Post reply. Tests and quizzes in the week after that day are listed underneath
   with how many days are left. Work that is handed in, graded, excused or marked done stays out. No requests of its
   own; nothing here writes to Canvas. */
(function(root){
 'use strict';
 const DROPBOX=['online_upload','online_text_entry','online_url','media_recording','student_annotation'];
 const KINDS={test:'Test',quiz:'Quiz',writing:'Writing',reading:'Reading'};
 const addDay=(key,n)=>{const t=new Date(key+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
 const weekday=key=>new Date(key+'T12:00:00Z').getUTCDay();
 // The next weekday after today: Friday, Saturday and Sunday all look ahead to Monday.
 function nextSchoolDay(today){let day=addDay(today,1);while(weekday(day)===0||weekday(day)===6)day=addDay(day,1);return day;}
 const daysBetween=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/864e5);
 // What a piece of work is, from how Canvas takes it and from its name. Tests outrank quizzes ("Unit test quiz").
 function kindOf(item){
  const name=String(item?.name||''),types=Array.isArray(item?.submissionTypes)?item.submissionTypes:[];
  if(/\b(?:test|exam|midterm|final exam)\b/i.test(name))return 'test';
  if(types.includes('online_quiz')||/\bquiz(?:zes)?\b/i.test(name))return 'quiz';
  if(/^\s*read\b|\breading\b/i.test(name))return 'reading';
  if(/\b(?:essay|paper|draft|writing|write-up|reflection|response)\b/i.test(name))return 'writing';
  return '';
 }
 // The way to hand it in on Canvas, if there is one: never for paper, nothing, an external tool, or locked work.
 function handIn(item){
  const types=Array.isArray(item?.submissionTypes)?item.submissionTypes:[];
  if(!item?.url||item.locked)return null;
  if(types.includes('online_quiz'))return {label:'Take quiz',href:item.url};
  if(types.includes('discussion_topic'))return {label:'Post reply',href:item.url};
  // "#submit" opens the assignment with Canvas's own submission form showing.
  if(types.some(type=>DROPBOX.includes(type)))return {label:'Submit on Canvas',href:item.url+'#submit'};
  return null;
 }

 // c: the workspace context (items, local, now, courses); dayOf: a time to its day key in the student's time zone;
 // complete: Canvas says the work is done (submitted, graded or excused).
 function plan(c,{dayOf,complete}){
  const today=dayOf(c.now),day=nextSchoolDay(today),weekAfter=addDay(day,7),due=[],ahead=[];
  for(const item of c.items||[]){
   if(!item||item.personal||String(item.id).startsWith('local-')||complete(item)||c.local?.[item.id]?.checkedOff)continue;
   const at=Date.parse(item.dueAt||'');if(!Number.isFinite(at)||at<c.now)continue;
   const on=dayOf(at),kind=kindOf(item);
   if(on<=day)due.push({item,kind,day:on});
   else if(on<=weekAfter&&(kind==='test'||kind==='quiz'))ahead.push({item,kind,day:on,inDays:daysBetween(today,on)});
  }
  const byDue=(a,b)=>Date.parse(a.item.dueAt)-Date.parse(b.item.dueAt)||String(a.item.name).localeCompare(String(b.item.name));
  const order=new Map((c.courses||[]).map((course,i)=>[String(course.id),i]));
  const groups=new Map();
  for(const entry of due.sort(byDue)){const id=String(entry.item.courseId);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);}
  return {today,day,count:due.length,ahead:ahead.sort(byDue),
   groups:[...groups].sort(([a],[b])=>(order.get(a)??1e9)-(order.get(b)??1e9)||a.localeCompare(b)).map(([courseId,entries])=>({courseId,entries}))};
 }

 function render(c,h,{action}){
  const {E}=h,tz=c.s.timeZone,p=plan(c,{dayOf:v=>h.dayKey(v,tz),complete:h.complete});
  const course=id=>c.courseMap?.get(String(id))||{};
  const noon=key=>Date.parse(key+'T12:00:00Z');
  const title=daysBetween(p.today,p.day)===1?'Tomorrow':h.formatDate(noon(p.day),'UTC',{weekday:'long'});
  const when=entry=>entry.day<p.day?`due ${h.formatDate(entry.item.dueAt,tz,{weekday:'short',hour:'numeric',minute:'2-digit'})}`:`due ${h.formatDate(entry.item.dueAt,tz,{hour:'numeric',minute:'2-digit'})}`;
  const tag=kind=>kind?`<span class="rd-nextday-tag" data-kind="${kind}">${KINDS[kind]}</span>`:'';
  const row=entry=>{const {item}=entry,go=handIn(item);
   return `<li class="rd-nextday-row" data-rd-key="nextday-${E(item.id)}">${tag(entry.kind)}${action('preview',`<strong>${E(item.name)}</strong><small>${E(when(entry))}${item.points?` · ${E(item.points)} pts`:''}</small>`,`data-id="${E(item.id)}" aria-label="Open ${E(item.name)}"`,'rd-nextday-open')}${go?`<a class="rd-nextday-go" href="${E(go.href)}" target="_blank" rel="noopener noreferrer">${E(go.label)}</a>`:''}</li>`;};
  const groups=p.groups.map(({courseId,entries})=>{const co=course(courseId);
   return `<section class="rd-nextday-course" style="--rd-course:${E(co.color||'#7c718d')}"><p class="rd-widget-label">${E(co.shortName||co.name||'Course')} <span>${entries.length}</span></p><ul class="rd-nextday-list">${entries.map(row).join('')}</ul></section>`;}).join('');
  const ahead=p.ahead.length?`<p class="rd-widget-label">Tests and quizzes after that</p><ul class="rd-nextday-ahead">${p.ahead.map(entry=>{const co=course(entry.item.courseId);
   return `<li style="--rd-course:${E(co.color||'#7c718d')}">${tag(entry.kind)}${action('preview',`<strong>${E(entry.item.name)}</strong><small>${E(co.shortName||co.name||'')} · ${E(h.formatDate(noon(entry.day),'UTC',{weekday:'short',month:'short',day:'numeric'}))} · in ${entry.inDays} days</small>`,`data-id="${E(entry.item.id)}" aria-label="Open ${E(entry.item.name)}"`,'rd-nextday-open')}</li>`;}).join('')}</ul>`:'';
  return `<p class="rd-nextday-day"><strong>${E(title)}</strong> <span>${E(h.formatDate(noon(p.day),'UTC',{month:'long',day:'numeric'}))}</span>${p.count?` · ${p.count} due`:''}</p>`+
   (groups||`<p class="rd-widget-empty">Nothing due by the end of ${E(title==='Tomorrow'?'tomorrow':title)}.</p>`)+ahead;
 }
 const api={DROPBOX,KINDS,nextSchoolDay,kindOf,handIn,plan,render};
 root.ReserveNextDay=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
