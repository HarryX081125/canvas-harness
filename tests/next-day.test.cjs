'use strict';
// "Next school day" (extension/next-day.js): everything due by the end of the next weekday, course by course, each
// piece tagged and linked to how it is handed in; tests and quizzes in the week after underneath.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const N=require('../extension/next-day.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..','extension',f),'utf8');
const NOW=Date.parse('2026-10-22T15:00:00Z');   // a Thursday afternoon
const dayOf=v=>new Date(v).toISOString().slice(0,10);
const at=(day,hour=23)=>`2026-${day}T${String(hour).padStart(2,'0')}:59:00Z`;
const a=(id,extra)=>({id:String(id),courseId:'5',name:'A'+id,url:'https://school.instructure.com/courses/5/assignments/'+id,state:'unsubmitted',submissionTypes:['online_upload'],...extra});
const E=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const action=(n,t,x='',cls='')=>`<button class="${cls}" data-rd-action="${n}" ${x}>${t}</button>`;
const fmt=(v,tz,o)=>new Intl.DateTimeFormat('en-US',{timeZone:tz,...o}).format(new Date(v));
const h={E,dayKey:v=>dayOf(v),complete:i=>i.state==='submitted',formatDate:fmt};
const courses=[{id:'9',name:'English',color:'#5f5ccc'},{id:'5',name:'Chemistry',color:'#C96442'}];
const ctx=(items,local={})=>({items,local,now:NOW,s:{timeZone:'UTC'},courses,courseMap:new Map(courses.map(x=>[x.id,x]))});

test('the next school day is the next weekday',()=>{
 assert.equal(N.nextSchoolDay('2026-10-22'),'2026-10-23','Thursday looks at Friday');
 for(const day of ['2026-10-23','2026-10-24','2026-10-25'])assert.equal(N.nextSchoolDay(day),'2026-10-26',day+' looks at Monday');
});

test('what each piece is, and how it is handed in',()=>{
 assert.equal(N.kindOf({name:'Unit 3 Test'}),'test');assert.equal(N.kindOf({name:'Unit test quiz'}),'test');
 assert.equal(N.kindOf({name:'Check-in',submissionTypes:['online_quiz']}),'quiz');assert.equal(N.kindOf({name:'Vocab quiz'}),'quiz');
 assert.equal(N.kindOf({name:'Read chapter 4'}),'reading');assert.equal(N.kindOf({name:'Chapter 2 reading'}),'reading');
 assert.equal(N.kindOf({name:'Argument essay draft'}),'writing');assert.equal(N.kindOf({name:'Lab 4'}),'');
 assert.equal(N.kindOf({name:'Contest preparation'}),'','"test" only as a word');
 const u='https://school.instructure.com/courses/5/assignments/1';
 assert.deepEqual(N.handIn({url:u,submissionTypes:['online_upload']}),{label:'Submit on Canvas',href:u+'#submit'});
 assert.deepEqual(N.handIn({url:u,submissionTypes:['online_quiz']}),{label:'Take quiz',href:u});
 assert.deepEqual(N.handIn({url:u,submissionTypes:['discussion_topic']}),{label:'Post reply',href:u});
 for(const types of [['on_paper'],['none'],['external_tool'],[]])assert.equal(N.handIn({url:u,submissionTypes:types}),null,types.join());
 assert.equal(N.handIn({url:u,submissionTypes:['online_upload'],locked:true}),null,'locked work has no way in');
});

test('due by the end of the next school day, grouped in course order; done, past and later work stay out',()=>{
 const items=[
  a(1,{dueAt:at('10-23')}),a(2,{courseId:'9',dueAt:at('10-23',8),name:'Read act 2'}),a(3,{dueAt:at('10-22',20)}),   // Friday, Friday morning, tonight
  a(4,{dueAt:at('10-23'),state:'submitted'}),a(5,{dueAt:at('10-22',9)}),a(6,{dueAt:at('10-26')}),                   // handed in; already past; Monday
  a(7,{dueAt:at('10-23')}),{id:'local-1',name:'Mine',personal:true,dueAt:at('10-23')},                              // marked done; personal
  a(8,{dueAt:at('10-28'),name:'Unit 3 Test',submissionTypes:['on_paper']}),a(9,{dueAt:at('11-02'),name:'Quiz 5'}),a(10,{dueAt:at('10-27')})];
 const p=N.plan(ctx(items,{7:{checkedOff:true}}),{dayOf,complete:h.complete});
 assert.equal(p.day,'2026-10-23');assert.equal(p.count,3);
 assert.deepEqual(p.groups.map(g=>[g.courseId,g.entries.map(e=>e.item.id)]),[['9',['2']],['5',['3','1']]]);
 assert.deepEqual(p.ahead.map(e=>[e.item.id,e.kind,e.inDays]),[['8','test',6]],'only tests and quizzes, within a week of that day');
});

test('the module: day heading, tags, a way to hand in, and an empty state',()=>{
 const html=N.render(ctx([a(1,{dueAt:at('10-23'),name:'Lab <report>'}),a(2,{courseId:'9',dueAt:at('10-23',8),name:'Read act 2',submissionTypes:['none']}),a(8,{dueAt:at('10-28'),name:'Unit 3 Test'})]),h,{action});
 assert.match(html,/<strong>Tomorrow<\/strong> <span>October 23<\/span> · 2 due/);
 assert.ok(html.indexOf('English')<html.indexOf('Chemistry'),'courses keep the student\'s order');
 assert.match(html,/Lab &lt;report&gt;/);assert.match(html,/data-rd-action="preview" data-id="1"/);
 assert.match(html,/href="https:\/\/school\.instructure\.com\/courses\/5\/assignments\/1#submit" target="_blank" rel="noopener noreferrer">Submit on Canvas</);
 assert.match(html,/data-kind="reading">Reading</);assert.doesNotMatch(html,/assignments\/2#submit/,'nothing to hand in, no link');
 assert.match(html,/Tests and quizzes after that/);assert.match(html,/data-kind="test">Test<\/span>.*Unit 3 Test.*in 6 days/s);
 const friday={...ctx([]),now:Date.parse('2026-10-23T15:00:00Z')};
 assert.match(N.render(friday,h,{action}),/<strong>Monday<\/strong>.*Nothing due by the end of Monday\./s);
});

test('wired in: a Home module in the planner feature, loaded before widgets.js, no requests of its own',()=>{
 const F=require('../extension/features.js'),planner=F.catalogue.find(f=>f.id==='planner').files.js;
 assert.ok(planner.includes('next-day.js'));assert.ok(F.order.indexOf('next-day.js')<F.order.indexOf('widgets.js'));
 assert.ok(F.resolve({preset:'full'}).js.includes('next-day.js'));
 assert.match(read('workspace-arrange.js'),/const EXTRA=\['today','nextday',/);assert.match(read('workspace-arrange.js'),/nextday:'Next school day'/);
 assert.match(read('widgets.js'),/key==='nextday'/);
 assert.doesNotMatch(read('next-day.js'),/fetch\(|XMLHttpRequest|chrome\./,'no requests of its own');
});
