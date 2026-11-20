(() => {
"use strict";
const $=id=>document.getElementById(id), STORY=window.BORDER_STORY, SAVE=window.BorderSave;
const fa=n=>String(n).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[+d]), clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let s=null, game=null, scene=null, visitor=null, online=false, busy=false, toastTimer=0, saveTimer=0, soundOn=true, audio=null, nextStory=null, afterResult=false;
const compareDefs=[
 {key:"name",label:"نام",kind:"passport"},{key:"number",label:"شمارهٔ گذرنامه",kind:"passport"},
 {key:"birth",label:"تاریخ تولد",kind:"passport"},{key:"nationality",label:"ملیت",kind:"passport"},
 {key:"expiry",label:"اعتبار گذرنامه",kind:"expiry"},{key:"destination",label:"مقصد عبور",kind:"visa"},
 {key:"permit",label:"شمارهٔ مجوز",kind:"visa"},{key:"photo",label:"تصویر هویتی",kind:"photo"},
 {key:"guardian",label:"ثبت همراه کودک",kind:"guardian"}
];
function fresh(name){const badge="OFF-"+(1000+Math.floor(Math.random()*8999));return {version:1,officerName:name,badge,birth:"1994/07/22",caseIndex:0,shift:1,viewMode:"world",paused:false,trust:0,suspicion:0,clues:0,admitted:0,denied:0,held:0,decisions:[],foundClues:[],journal:[{title:"ابلاغ آغاز مأموریت",text:"پست مرزی سپیدار به علت بارش سنگین از مسیر اصلی جدا شده است. شیفت شب را تا اطلاع بعدی ادامه بده."}],items:[{name:"چراغ‌قوهٔ جیبی",description:"باتری نیمه‌پر؛ برای بررسی محوطه."},{name:"دفتر ثبت ورود",description:"تمام تصمیم‌ها در آن نوشته می‌شود."},{name:"کارت مأمور",description:"کد: "+badge}],power:true,radioOff:false,visited:{desk:false},marked:{},interviewed:false,interviewDecision:null,interviewChoice:null,finalDecision:null};}
function toast(msg,bad=false){const el=$("toast");el.textContent=msg;el.classList.toggle("bad",bad);el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2500);}
function beep(freq=480){if(!soundOn)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type="triangle";o.frequency.value=freq;g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.13);}catch{}}
function playerCase(){if(!s||s.caseIndex>=STORY.cases.length)return null;const c=JSON.parse(JSON.stringify(STORY.cases[s.caseIndex]));const rep=v=>typeof v==="string"?v.replaceAll("__PLAYER__",s.officerName).replaceAll("__BADGE__",s.badge).replaceAll("__DOB__",s.birth):v;for(const sec of ["passport","form","visa"])for(const k of Object.keys(c[sec]||{}))c[sec][k]=rep(c[sec][k]);return c;}
function pack(){return {version:1,nickname:s.officerName,savedAt:new Date().toISOString(),state:s};}
function saveSoon(){if(!s)return;SAVE.setLocal(pack());clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(false),1500);}
async function save(show=true){if(!s)return;SAVE.setLocal(pack());if(busy)return;busy=true;if(online){try{await SAVE.save(pack());if(show)toast("پرونده در فضای ابری ذخیره شد.");}catch{online=false;if(show)toast("اتصال ابری نیست؛ ذخیرهٔ محلی انجام شد.",true);}}else if(show)toast("پیشرفت روی همین دستگاه ذخیره شد.");busy=false;}
function sanitize(raw,name){if(!raw||raw.version!==1||!raw.state)return null;const b=fresh(name),v={...b,...raw.state};v.officerName=name;v.caseIndex=clamp(+v.caseIndex||0,0,STORY.cases.length);v.shift=clamp(+v.shift||1,1,4);for(const k of ["trust","suspicion","clues","admitted","denied","held"])v[k]=clamp(+v[k]||0,k==="trust"?-20:0,40);v.decisions=Array.isArray(v.decisions)?v.decisions.slice(0,7):[];v.foundClues=Array.isArray(v.foundClues)?v.foundClues.slice(0,30):[];v.journal=Array.isArray(v.journal)?v.journal.slice(0,60):[];v.items=Array.isArray(v.items)?v.items.slice(0,30):[];v.visited={desk:false,...(v.visited||{})};v.marked={};v.interviewed=false;v.interviewDecision=null;v.interviewChoice=null;v.viewMode="world";v.paused=false;return v;}
function addJournal(title,text){s.journal.push({title,text});if(s.journal.length>60)s.journal.shift();saveSoon();}
function addClue(id,title,text){if(s.foundClues.includes(id))return;s.foundClues.push(id);s.clues++;s.items.push({name:title,description:text});addJournal("سرنخ: "+title,text);updateHud();toast("سرنخ تازه: "+title);}
async function enter(name,restored=null){
 $("startStatus").textContent="در حال آماده‌سازی پرونده...";
 const same=SAVE.token()&&SAVE.name()===name&&!String(SAVE.token()).startsWith("offline-");
 if(!restored&&same){try{const r=await SAVE.load();if(r.save_data?.version===1)restored=r.save_data;online=true;}catch(e){online=false;if(e.status===401)SAVE.clearSession();}}
 if(!SAVE.token()||SAVE.name()!==name||(!same&&!restored)){try{await SAVE.join(name);online=true;}catch{online=false;SAVE.setSession("offline-"+Date.now(),name);}}
 const local=SAVE.local();if(!restored&&local?.nickname===name)restored=local;
 s=restored?sanitize(restored,name):fresh(name);if(!s)s=fresh(name);
 $("titleScreen").classList.add("is-hidden");$("gameScreen").classList.remove("is-hidden");$("inspectionScreen").classList.add("is-hidden");$("endScreen").classList.add("is-hidden");
 if(!game)createGame();else scene?.resetOfficer();
 updateHud();updateProgress();objective();
 clearInterval(window.__borderSave);window.__borderSave=setInterval(()=>save(false),25000);
 if(s.caseIndex===0&&!s.decisions.length&&!restored)story("پروندهٔ آغاز مأموریت","شیفت شب پست ۰۹","بارش سنگین جادهٔ کوهستانی را بسته است. سه نگهبان قبلی درخواست انتقال داده‌اند و یکی از آن‌ها هرگز از پاسگاه خارج نشده. وظیفهٔ تو ساده است: مدارک را بررسی کن، هر ورود را ثبت کن و تا صبح در پست بمان.",null,()=>toast("برای حرکت از A و D و برای تعامل از E استفاده کن."));
 else toast("پروندهٔ قبلی بازیابی شد.");
 $("startStatus").textContent=online?"ذخیرهٔ ابری فعال":"ذخیرهٔ محلی فعال";setMode("world");
}
function setMode(mode){if(!s)return;s.viewMode=mode;if(scene?.input?.keyboard)scene.input.keyboard.enabled=mode==="world"&&!s.paused;if(mode!=="world")$("interactionPrompt").classList.add("is-hidden");}
function story(kicker,title,text,choices=null,onNext=null){$("storyKicker").textContent=kicker;$("storyTitle").textContent=title;$("storyText").textContent=text;$("storyChoices").innerHTML="";$("storyContinue").classList.toggle("is-hidden",!!(choices?.length));nextStory=onNext;if(choices?.length)choices.forEach(ch=>{const b=document.createElement("button");b.className="story-choice";b.textContent=ch.label;b.onclick=()=>{$("storyModal").classList.add("is-hidden");ch.action?.();onNext&&!ch.action&&onNext();};$("storyChoices").append(b);});$("storyModal").classList.remove("is-hidden");}
function continueStory(){$("storyModal").classList.add("is-hidden");const fn=nextStory;nextStory=null;fn?.();}
function clock(){const m=[8,21,36,13,44,57,13][s?.caseIndex||0]||0;return "۰"+Math.min(2,Math.floor((s?.caseIndex||0)/2))+":"+String(m).padStart(2,"0").replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[+d]);}
function updateHud(){if(!s)return;$("shiftLabel").textContent=fa(s.shift)+" / ۴";$("dateLabel").textContent=STORY.shifts[s.shift-1]?.date||"پایان شیفت";$("trustValue").textContent=fa(Math.max(0,s.trust));$("suspicionValue").textContent=fa(s.suspicion);$("clueValue").textContent=fa(s.clues);$("radioStatus").textContent=s.radioOff?"خاموش":"فعال";$("clockValue").textContent=clock();}
function updateProgress(){if(!s)return;$("caseDots").innerHTML="";STORY.cases.forEach((c,i)=>{const el=document.createElement("i");el.className="case-dot"+(i<s.caseIndex?" done":i===s.caseIndex?" current":"");$("caseDots").append(el);});$("caseCount").textContent=fa(Math.min(s.caseIndex,7))+" از ۷";}
function objective(){const c=playerCase();$("objectiveText").textContent=c?"به پنجرهٔ بررسی برو؛ "+c.name+" منتظر بررسی مدارک است.":"آخرین پرونده را ببند و دربارهٔ حقیقت تصمیم بگیر.";$("sceneTitle").textContent=s.shift===4?"اتاقک بررسی · آخرین شب":"محوطهٔ داخلی پاسگاه";}
function setPrompt(text,visible){$("interactionText").textContent=text;$("interactionPrompt").classList.toggle("is-hidden",!visible);}
function createGame(){
 if(!window.Phaser){$("worldNarration").textContent="موتور بازی بارگذاری نشد. اتصال اینترنت را بررسی کن.";toast("Phaser بارگذاری نشد.",true);return;}
 class BorderScene extends Phaser.Scene{
  constructor(){super("BorderWorld");this.W=2050;this.x=170;this.y=428;this.vy=0;this.snow=[];this.near=null;}
  rect(g,x,y,w,h,c){g.fillStyle(typeof c==="string"?parseInt(c.replace("#",""),16):c,1);g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  create(){
   this.bg=this.add.graphics();this.fx=this.add.graphics();this.snowArt=this.add.graphics();this.drawBackground();
   this.cameras.main.setBounds(0,0,this.W,540);
   this.keys=this.input.keyboard.addKeys("A,D,LEFT,RIGHT,E,J,SPACE,ESC");
   this.input.keyboard.on("keydown-ESC",()=>{if(window.BorderApp?.state)window.BorderApp.pause();});
   for(let i=0;i<70;i++)this.snow.push({x:Math.random()*this.W,y:Math.random()*420,v:18+Math.random()*40,size:1+Math.random()*2});
   scene=this;
  }
  resetOfficer(){this.x=170;this.y=428;this.vy=0;this.cameras.main.scrollX=0;}
  drawBackground(){
   const g=this.bg;g.clear();this.rect(g,0,0,this.W,540,"#182d3c");this.rect(g,0,0,this.W,205,"#132536");
   for(let i=0;i<9;i++){const x=i*250-70,h=130+(i%3)*34;this.rect(g,x,205-h,170,h+120,i%2?"#263c4b":"#304858");this.rect(g,x+18,205-h,24,24,"#afc1c0");this.rect(g,x+47,205-h+10,18,16,"#d5dddd");}
   this.rect(g,0,438,this.W,102,"#bbc7c5");this.rect(g,0,438,this.W,5,"#e2e7de");this.rect(g,0,475,this.W,65,"#879ba2");
   for(let i=0;i<85;i++)this.rect(g,(i*79)%this.W,442+(i*37)%85,5,2,"#d4ddda");
   // checkpoint wall, window and counter
   this.rect(g,90,160,860,281,"#3b4a51");this.rect(g,90,155,860,12,"#7e8b89");this.rect(g,100,180,840,255,"#4b5b62");
   for(let r=0;r<8;r++)for(let c=0;c<19;c++)this.rect(g,110+c*43+(r%2)*20,190+r*28,34,2,"#68777a");
   this.rect(g,335,222,180,133,"#1a2b38");this.rect(g,343,230,164,117,"#718a96");this.rect(g,348,234,154,45,"#9bb4bd");this.rect(g,418,230,8,117,"#384b54");this.rect(g,343,282,164,7,"#384b54");
   this.rect(g,300,345,254,10,"#735a43");this.rect(g,309,355,14,69,"#473b35");this.rect(g,531,355,14,69,"#473b35");this.rect(g,320,340,214,8,"#b28b5d");
   this.rect(g,740,205,105,229,"#253643");this.rect(g,748,213,89,214,"#3b4e59");this.rect(g,760,229,65,92,"#172735");this.rect(g,769,239,48,72,"#7e999e");this.rect(g,791,360,4,4,"#d5b47c");
   this.rect(g,586,214,5,36,"#d4b47c");this.rect(g,572,246,34,5,"#d4b47c");this.rect(g,577,251,24,9,"#f2d497");
   // gate and wall details
   this.rect(g,0,185,85,255,"#283944");this.rect(g,10,197,65,10,"#64757b");this.rect(g,15,220,55,148,"#182731");this.rect(g,19,224,47,140,"#526c77");this.rect(g,16,378,53,9,"#c1a477");
   this.rect(g,90,427,860,12,"#777e76");this.rect(g,115,435,225,6,"#4b6067");this.rect(g,930,173,8,270,"#273b47");
   this.staticProp(970,"radio");this.staticProp(1230,"board");this.staticProp(1610,"generator");this.staticProp(1900,"locker");
   this.rect(g,90,150,860,7,"#202f3a");for(let x=120;x<930;x+=160)this.rect(g,x,150,8,22,"#293d49");
  }
  staticProp(x,type){
   const g=this.bg;
   if(type==="radio"){this.rect(g,x-48,373,96,54,"#33454e");this.rect(g,x-39,381,78,34,"#25343d");this.rect(g,x-31,390,34,12,"#b0a17d");this.rect(g,x+11,390,20,10,"#192832");this.rect(g,x-31,405,7,5,"#be6d5d");this.rect(g,x+37,340,4,32,"#b9a078");this.rect(g,x+30,336,18,4,"#d9c18d");}
   if(type==="board"){this.rect(g,x-64,239,128,112,"#9a7851");this.rect(g,x-57,246,114,98,"#c5b995");for(let i=0;i<4;i++){this.rect(g,x-45,258+i*19,38,3,"#7f857f");this.rect(g,x+1,258+i*19,43,3,"#a28e69");}this.rect(g,x+38,257,8,8,"#aa6e60");}
   if(type==="generator"){this.rect(g,x-58,359,116,68,"#596970");this.rect(g,x-49,368,98,52,"#344956");this.rect(g,x-36,378,34,28,"#1e2e39");this.rect(g,x+10,378,24,6,"#9aa99a");this.rect(g,x+15,395,7,7,"#d6ad70");this.rect(g,x+29,395,7,7,"#be6e61");}
   if(type==="locker"){this.rect(g,x-39,230,78,196,"#374954");this.rect(g,x-32,237,64,182,"#293e49");this.rect(g,x-23,248,46,76,"#536a74");this.rect(g,x-23,329,46,78,"#536a74");this.rect(g,x+24,335,3,6,"#d7b77e");}
  }
  character(g,x,y,type="officer",step=0,ghost=false){
   const px=Math.round(x),py=Math.round(y),leg=step%2?2:0,coat=ghost?"#d5dad3":type==="doctor"?"#d9e1da":type==="shepherd"?"#786957":type==="commander"?"#253747":"#233949",scarf=ghost?"#a7b6b6":type==="commander"?"#a8675c":"#bd8d63",skin=ghost?"#d9e3d9":"#c99e80";
   this.rect(g,px-11,py-19+leg,10,18-leg,"#26323a");this.rect(g,px+2,py-19-leg,10,18+leg,"#26323a");this.rect(g,px-13,py-5+leg,13,5,"#242d32");this.rect(g,px+1,py-5-leg,14,5,"#242d32");
   this.rect(g,px-15,py-59,31,40,coat);this.rect(g,px-12,py-64,24,8,ghost?"#7f8e93":"#1c2b37");this.rect(g,px-16,py-54,7,29,coat);this.rect(g,px+10,py-54,7,29,coat);this.rect(g,px-19,py-47,6,25,coat);this.rect(g,px+14,py-47,6,25,coat);
   this.rect(g,px-10,py-82,21,22,skin);this.rect(g,px-12,py-88,24,9,type==="shepherd"?"#e1e0d6":"#3d3432");this.rect(g,px-13,py-80,5,9,"#39332f");this.rect(g,px+7,py-72,4,3,"#202a30");
   if(type==="officer"||type==="commander"){this.rect(g,px-13,py-89,26,6,"#1b2a38");this.rect(g,px-7,py-95,15,8,"#263b4a");this.rect(g,px+4,py-89,13,3,"#d1b173");}
   else if(type==="mystery"||ghost){this.rect(g,px-14,py-90,28,16,"#293845");this.rect(g,px-11,py-78,22,13,"#18252f");this.rect(g,px-6,py-72,5,2,"#e8efdc");this.rect(g,px+3,py-72,5,2,"#e8efdc");}
   this.rect(g,px-14,py-59,27,6,scarf);this.rect(g,px+7,py-53,6,14,scarf);if(type==="officer")this.rect(g,px-11,py-49,5,6,"#d5b47d");
  }
  prop(x,y,type,active){
   const g=this.fx, edge=active?"#e2c58e":"#617580";
   if(type==="desk"){this.rect(g,x-75,y-70,150,14,"#aa8058");this.rect(g,x-67,y-56,13,56,"#604d3d");this.rect(g,x+55,y-56,13,56,"#604d3d");this.rect(g,x-63,y-83,48,12,"#d0c5a6");this.rect(g,x-8,y-79,32,8,"#2b3d46");this.rect(g,x+36,y-87,22,17,"#c7b998");this.rect(g,x-87,y-89,174,2,edge);}
   if(type==="radio"){this.rect(g,x-48,y-55,96,55,"#33454e");this.rect(g,x-40,y-48,80,41,"#25343d");this.rect(g,x-32,y-40,34,12,"#b0a17d");this.rect(g,x+10,y-40,20,10,"#192832");this.rect(g,x-31,y-20,7,5,"#be6d5d");this.rect(g,x-19,y-20,7,5,"#7b9c82");this.rect(g,x+37,y-80,4,25,"#b9a078");}
   if(type==="board"){this.rect(g,x-64,y-61,128,70,"#9a7851");this.rect(g,x-58,y-55,116,58,"#c5b995");for(let i=0;i<3;i++){this.rect(g,x-45,y-44+i*15,38,3,"#7f857f");this.rect(g,x+1,y-44+i*15,43,3,"#a28e69");}}
   if(type==="generator"){this.rect(g,x-58,y-69,116,69,"#596970");this.rect(g,x-49,y-60,98,54,"#344956");this.rect(g,x-36,y-47,34,28,"#1e2e39");this.rect(g,x+10,y-47,24,6,"#9aa99a");this.rect(g,x+15,y-30,7,7,"#d6ad70");}
   if(type==="locker"){this.rect(g,x-39,y-104,78,104,"#51656c");this.rect(g,x-32,y-97,64,89,"#293e49");this.rect(g,x-23,y-88,46,31,"#536a74");this.rect(g,x-23,y-48,46,32,"#536a74");this.rect(g,x+24,y-43,3,5,"#d7b77e");}
   if(active){this.rect(g,x-31,y-119,62,3,"#d8ba7b");this.rect(g,x-3,y-130,6,6,"#f2d7a2");}
  }
  update(time,delta){
   if(!window.BorderApp?.state)return;const app=window.BorderApp,active=s.viewMode==="world"&&!s.paused&&!app.uiLocked,dt=Math.min(delta/1000,.04);
   if(active){if(this.keys.A.isDown||this.keys.LEFT.isDown)this.x-=210*dt;if(this.keys.D.isDown||this.keys.RIGHT.isDown)this.x+=210*dt;this.x=clamp(this.x,30,this.W-35);if(Phaser.Input.Keyboard.JustDown(this.keys.J)&&this.y>=428)this.vy=-330;if(Phaser.Input.Keyboard.JustDown(this.keys.SPACE)&&this.y>=428)this.vy=-330;this.vy+=850*dt;this.y+=this.vy*dt;if(this.y>428){this.y=428;this.vy=0;}if(Phaser.Input.Keyboard.JustDown(this.keys.E)&&this.near)app.interact(this.near);}
   this.cameras.main.scrollX=clamp(this.x-460,0,this.W-960);this.fx.clear();
   const c=playerCase();if(c&&s.viewMode==="world"&&!s.visited.desk)this.character(this.fx,445,428,c.portrait==="doctor"?"doctor":c.portrait==="shepherd"?"shepherd":c.portrait==="commander"?"commander":["blank","double"].includes(c.portrait)?"mystery":"traveler",Math.floor(time/350)%2);
   this.character(this.fx,this.x,this.y,"officer",Math.floor(time/150)%2);
   this.prop(555,428,"desk",this.near==="desk");this.prop(970,428,"radio",this.near==="radio");this.prop(1230,428,"board",this.near==="board");this.prop(1610,428,"generator",this.near==="generator");this.prop(1900,428,"locker",this.near==="locker");
   this.near=null;
   if(active){for(const [id,x,r,label] of [["desk",555,100,"پنجرهٔ بررسی مدارک"],["radio",970,95,s.radioOff?"رادیو خاموش است":"گوش دادن به رادیو"],["board",1230,105,"تابلوی قوانین و نقشه"],["generator",1610,105,"ژنراتور برق"],["locker",1900,105,"کمد و دفترچه"]])if(Math.abs(this.x-x)<r){this.near=id;app.setPrompt(label,true);break;}if(!this.near)app.setPrompt("",false);}
   this.snowArt.clear();this.snowArt.fillStyle(0xe6eff0,.72);for(const p of this.snow){p.y+=p.v*dt;p.x-=p.v*.24*dt;if(p.y>425){p.y=185;p.x=(p.x+117)%this.W;}if(p.x<0)p.x+=this.W;this.snowArt.fillRect(p.x,p.y,p.size,p.size*1.6);}
  }
 }
 game=new Phaser.Game({type:Phaser.AUTO,parent:"phaserMount",width:960,height:540,backgroundColor:"#162b3a",pixelArt:true,antialias:false,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:960,height:540},render:{pixelArt:true,roundPixels:true,antialias:false},scene:[BorderScene]});
}
function addField(parent,label,value){const d=document.createElement("div");d.className="doc-field";const l=document.createElement("label");l.textContent=label;const b=document.createElement("b");b.textContent=value||"—";d.append(l,b);parent.append(d);}
function openInspection(){
 if(!s||s.caseIndex>=7){toast("مراجعه‌کننده‌ای باقی نمانده.");return;}visitor=playerCase();s.marked={};s.interviewed=false;s.interviewDecision=null;s.interviewChoice=null;setMode("inspect");
 $("inspectionScreen").classList.remove("is-hidden");$("visitorNameHead").textContent=visitor.name;$("visitorRoleHead").textContent=visitor.role;$("caseHeading").textContent="پروندهٔ "+fa(s.caseIndex+1)+" · "+visitor.name;$("caseTagline").textContent=visitor.tagline;$("caseCode").textContent=visitor.id;$("caseClock").textContent=clock();
 $("passportFields").innerHTML="";const p=visitor.passport;[["نام",p.name],["شماره",p.number],["تولد",p.birth],["ملیت",p.nationality],["انقضا",p.expiry],["محل صدور",p.place]].forEach(x=>addField($("passportFields"),...x));
 $("mrzText").textContent=("P<ARMAN<<"+p.name.replaceAll(" ","<").toUpperCase()+"<<"+p.number+"<").slice(0,38);
 const portrait=$("passportPortrait");portrait.className="passport-photo portrait-"+visitor.portrait;portrait.innerHTML=visitor.portrait==="blank"?'<div class="blank-noise">NO<br>IMAGE</div>':visitor.portrait==="double"?'<div class="double-silhouette"></div><div class="double-label">MATCH?</div>':'<div class="portrait-head"></div><div class="portrait-body"></div><div class="portrait-hair"></div>';
 $("formFields").innerHTML="";const f=visitor.form;[["نام",f.name],["شمارهٔ گذرنامه",f.number],["تاریخ تولد",f.birth],["ملیت",f.nationality],["هدف سفر",f.purpose],["مقصد",f.destination],["اعتبار",f.expiry],["مجوز",f.permit]].forEach(x=>addField($("formFields"),...x));
 $("formSignature").textContent=visitor.portrait==="double"?s.officerName:f.name;
 $("visaFields").innerHTML="";[["نوع مجوز",visitor.visa.type],["شماره",visitor.visa.number],["مقصد ثبت‌شده",visitor.visa.destination],["اعتبار مجوز",visitor.visa.valid]].forEach(x=>addField($("visaFields"),...x));
 $("ruleFields").innerHTML="";STORY.shifts[s.shift-1].rules.forEach((r,i)=>{const row=document.createElement("div");row.className="rule-item";const n=document.createElement("i");n.textContent=fa(i+1)+".";const t=document.createElement("span");t.textContent=r;row.append(n,t);$("ruleFields").append(row);});
 renderCompare();$("decisionHint").textContent="اطلاعات را با دقت مقایسه کن. سپس تصمیم بگیر.";$("interviewBtn").disabled=false;$("interviewBtn").textContent="◌ پرسش از مراجعه‌کننده";$("interviewBtn").style.opacity="1";beep(560);
}
function addField(parent,label,value){addFieldFn(parent,label,value);}
function addFieldFn(parent,label,value){const d=document.createElement("div");d.className="doc-field";const l=document.createElement("label");l.textContent=label;const b=document.createElement("b");b.textContent=value||"—";d.append(l,b);parent.append(d);}
function valuesFor(key){
 const p=visitor.passport,f=visitor.form,v=visitor.visa;
 return ({name:[p.name,f.name],number:[p.number,f.number],birth:[p.birth,f.birth],nationality:[p.nationality,f.nationality],expiry:[p.expiry,visitor.differences.includes("expiry")?"منقضی":"معتبر"],destination:[f.destination,v.destination],permit:[f.permit,v.number],photo:[p.photo,visitor.photoMatch?"چهرهٔ مراجعه‌کننده":"چهره مطابقت ندارد"],guardian:["همراه در فرم: ثبت نشده","برگهٔ سرپرستی: نیازمند استعلام"]})[key]||["—","—"];
}
function renderCompare(){
 $("compareRows").innerHTML="";
 compareDefs.filter(d=>d.key!=="guardian"||visitor.differences.includes("guardian")).forEach(def=>{
  const [a,b]=valuesFor(def.key),row=document.createElement("div");row.className="compare-row";const info=document.createElement("div");const small=document.createElement("small");small.textContent=def.label;const bold=document.createElement("b");bold.textContent=a+" / "+b;info.append(small,bold);
  const btn=document.createElement("button");btn.className="compare-toggle";const paint=()=>{const v=s.marked[def.key];btn.classList.toggle("marked",v===true);btn.classList.toggle("matched",v===false);btn.textContent=v===true?"مغایرت ✓":v===false?"مطابق ✓":"بررسی";};
  btn.onclick=()=>{const v=s.marked[def.key];s.marked[def.key]=v===undefined?true:v===true?false:undefined;paint();$("compareCount").textContent=fa(Object.values(s.marked).filter(Boolean).length)+" مغایرت ثبت شده";beep(s.marked[def.key]===true?300:500);};paint();row.append(info,btn);$("compareRows").append(row);
 });
 $("compareCount").textContent="۰ مغایرت ثبت شده";
}
function interview(){
 if(!visitor||s.interviewed){toast("پرسش این پرونده قبلاً انجام شده.");return;}
 $("dialogueModal").classList.remove("is-hidden");$("dialoguePerson").textContent=visitor.name;$("dialogueQuestion").textContent=visitor.interview.prompt;$("dialogueReply").classList.add("is-hidden");$("dialogueDone").classList.add("is-hidden");$("dialogueAvatar").className="dialogue-avatar portrait-"+visitor.portrait;$("dialogueChoices").innerHTML="";
 visitor.interview.choices.forEach((ch,i)=>{const b=document.createElement("button");b.className="dialogue-choice";b.textContent=ch.label;b.onclick=()=>{$("dialogueChoices").innerHTML="";$("dialogueReply").textContent=ch.reply;$("dialogueReply").classList.remove("is-hidden");$("dialogueDone").classList.remove("is-hidden");s.interviewed=true;s.interviewChoice=i;if(ch.clue)addClue(ch.clue,"گفت‌وگو با "+visitor.name,ch.reply);if(ch.trust)s.trust+=ch.trust;if(ch.suspicion)s.suspicion+=ch.suspicion;if(ch.decision)s.interviewDecision=ch.decision;updateHud();saveSoon();};$("dialogueChoices").append(b);});
}
function closeInterview(){$("dialogueModal").classList.add("is-hidden");$("interviewBtn").textContent="✓ گفت‌وگو ثبت شد";$("interviewBtn").disabled=true;$("interviewBtn").style.opacity=".6";$("decisionHint").textContent=s.interviewDecision==="admit"?"مدرک تکمیلی معتبر است؛ می‌توانی ورود را مجاز کنی.":"اطلاعات تازه ثبت شد؛ حالا تصمیم بگیر.";}
function decide(action){
 if(!visitor)return;const expected=s.interviewDecision||visitor.correct,decisionCorrect=action===expected,needed=visitor.differences||[],marked=Object.keys(s.marked).filter(k=>s.marked[k]===true),exact=needed.length===marked.length&&needed.every(k=>marked.includes(k));
 if(decisionCorrect){s.trust++;if(action==="hold")s.suspicion=Math.max(0,s.suspicion-1);}else{s.suspicion+=2;s.trust--;}
 if(exact&&needed.length){s.clues++;addJournal("تطبیق دقیق: "+visitor.name,"مغایرت‌های واقعی در پرونده ثبت شد.");}else if(needed.length)s.suspicion++;
 if(action==="admit")s.admitted++;if(action==="deny")s.denied++;if(action==="hold")s.held++;if(visitor.final)s.finalDecision=action;
 s.decisions.push({id:visitor.id,name:visitor.name,decision:action,correct:decisionCorrect,flagExact:exact,marked});
 $("resultTitle").textContent=action==="admit"?"ورود مجاز شد":action==="deny"?"ورود رد شد":"پرونده معلق شد";$("resultSeal").textContent=action==="admit"?"✓":action==="deny"?"✕":"Ⅱ";$("resultText").textContent=visitor.result[action];
 $("resultImpact").textContent=(decisionCorrect?"+ ارزیابی تصمیم":"− ارزیابی تصمیم")+"  ·  "+(exact&&needed.length?"+ تطبیق اسناد":"بازبینی پرونده");
 $("inspectionScreen").classList.add("is-hidden");$("resultModal").classList.remove("is-hidden");setMode("world");if(scene)scene.x=555;afterResult=!!visitor.final;updateHud();updateProgress();save(false);beep(decisionCorrect?650:180);
}
function next(){
 $("resultModal").classList.add("is-hidden");if(afterResult){afterResult=false;finish();return;}
 s.caseIndex++;if(s.caseIndex>=7){finish();return;}const prev=s.shift,n=STORY.cases[s.caseIndex];s.shift=n.shift;s.visited.desk=false;updateHud();updateProgress();objective();
 if(n.shift!==prev){const sh=STORY.shifts[n.shift-1];story("آغاز شیفت "+fa(n.shift),sh.title,sh.memo+"\n\n"+sh.rules.join("\n"),[{label:"قوانین را ثبت کن و ادامه بده",action:()=>{addJournal("ابلاغیهٔ شیفت "+fa(n.shift),sh.memo);objective();save(false);}}]);}else toast("مراجعه‌کنندهٔ بعدی پشت پنجره منتظر است.");
}
function interact(id){
 if(!s||s.paused||s.viewMode!=="world")return;
 if(id==="desk"){s.visited.desk=true;openInspection();}
 if(id==="board")sidePanel("rules");
 if(id==="locker")sidePanel("journal");
 if(id==="generator"){
   if(!s.power){s.power=true;s.radioOff=false;toast("ژنراتور دوباره روشن شد.");}
   else{s.power=false;s.radioOff=true;addClue("generator","نقشهٔ سیم‌کشی","پشت ژنراتور یک کابل دوم به بیرون ساختمان می‌رود؛ روی آن برچسب ایستگاه ۱۲ است.");toast("برق پاسگاه قطع شد.");}
   s.visited.generator=true;updateHud();save(false);
 }
 if(id==="radio")radio();
}
function radio(){
 const choices=[
  {label:"تغییر فرکانس و گوش دادن به موج ضعیف",action:()=>{s.radioHeard=(s.radioHeard||0)+1;s.suspicion++;addClue("radio-"+s.shift,"پیام رادیویی "+fa(s.shift),"در میان نویز، صدایی شبیه صدای خودت می‌گوید: «یک نفر بیشتر از تعداد پرونده‌ها اینجاست.»");story("رادیوی پاسگاه","موج ناشناس","صدایی آرام نام خانوادگی تو را تکرار می‌کند. بعد سه ضربه از داخل اتاق شنیده می‌شود.",null,()=>{s.visited.radio=true;save(false);});}},
  {label:"دستگاه را خاموش کن",action:()=>{s.radioOff=true;s.suspicion=Math.max(0,s.suspicion-1);addJournal("رادیو خاموش شد","برای چند دقیقه سکوت برقرار شد؛ اما چراغ قرمز دستگاه هنوز چشمک می‌زند.");updateHud();save(false);toast("رادیو خاموش شد.");}},
  {label:"پیام قبلی را در دفتر ثبت کن",action:()=>addClue("radio-note","پیام ثبت‌شده","تماس ساعت ۰۱:۱۳ از ایستگاهی ثبت شده که طبق نقشه وجود ندارد.")}
 ];
 story("ایستگاه رادیویی","خش‌خش روی موج ۹۰.۹","چراغ قرمز رادیو روشن است. از بلندگو صدای باد و چیزی شبیه نفس کشیدن می‌آید.",choices);
}
function sidePanel(type){
 $("sideContent").innerHTML="";
 if(type==="rules"){
  $("sideKicker").textContent="ابلاغیهٔ شیفت جاری";$("sideTitle").textContent=STORY.shifts[s.shift-1].title;
  const p=document.createElement("p");p.textContent=STORY.shifts[s.shift-1].memo;$("sideContent").append(p);
  STORY.shifts[s.shift-1].rules.forEach((r,i)=>{const e=document.createElement("div");e.className="journal-entry";const b=document.createElement("b");b.textContent="قانون "+fa(i+1);const t=document.createElement("p");t.textContent=r;e.append(b,t);$("sideContent").append(e);});
 }else{
  $("sideKicker").textContent="یادداشت‌ها و مدارک";$("sideTitle").textContent="دفترچهٔ مأمور";
  [...s.journal].reverse().forEach(r=>{const e=document.createElement("div");e.className="journal-entry";const b=document.createElement("b");b.textContent=r.title;const p=document.createElement("p");p.textContent=r.text;e.append(b,p);$("sideContent").append(e);});
  const h=document.createElement("div");h.className="journal-entry";const b=document.createElement("b");b.textContent="وسایل همراه";h.append(b);$("sideContent").append(h);
  s.items.forEach(item=>{const e=document.createElement("div");e.className="journal-entry";const b=document.createElement("b");b.textContent=item.name;const p=document.createElement("p");p.textContent=item.description;e.append(b,p);$("sideContent").append(e);});
 }
 $("sideModal").classList.remove("is-hidden");
}
function finish(){
 let title,text,symbol;
 if(s.finalDecision==="hold"&&s.clues>=4&&s.trust>=3){title="سپیده‌دمِ سفید";symbol="✦";text="تو پرونده را نبستی؛ آن را از نو خواندی. نام‌هایی که سال‌ها در دفتر جا مانده بودند، یکی‌یکی در برف محو شدند. صدای رادیو قطع شد و پشت پنجره فقط جاده بود. وقتی صبح رسید، برای نخستین بار هیچ‌کس از آن سوی کوه صدایت نکرد.";}
 else if(s.finalDecision==="admit"){title="دروازهٔ باز";symbol="◉";text="مهر ورود روی صفحه نشست. مسافر عبور کرد، اما صندلی تو خالی ماند. دفتر ثبت، شیفت بعدی را با نامی تازه آغاز کرد؛ نام خودت.";}
 else if(s.finalDecision==="deny"){title="مرزِ بی‌پایان";symbol="✕";text="دروازه بسته ماند. صبح هیچ مسافری نبود و هیچ‌کس در ستاد نام پست ۰۹ را به یاد نمی‌آورد. تو هنوز پشت پنجره نشسته‌ای و منتظر اولین مراجعه‌کننده‌ای.";}
 else{title="پروندهٔ ناتمام";symbol="Ⅱ";text="مسافر رفت، اما صدای او در دستگاه خاموش باقی ماند. تو زنده ماندی؛ ولی دفتر هنوز یک ردیف سفید دارد. شاید شیفت بعدی بتواند آن را کامل کند.";}
 $("endSymbol").textContent=symbol;$("endTitle").textContent=title;$("endText").textContent=text;$("endStats").textContent=fa(s.admitted)+" ورود مجاز  ·  "+fa(s.denied)+" رد  ·  "+fa(s.held)+" تعلیق  ·  "+fa(s.clues)+" سرنخ";
 $("gameScreen").classList.add("is-hidden");$("inspectionScreen").classList.add("is-hidden");$("endScreen").classList.remove("is-hidden");s.viewMode="end";save(false);
}
function pause(){if(!s||s.viewMode==="end")return;s.paused=!s.paused;$("pauseOverlay").classList.toggle("is-hidden",!s.paused);if(scene?.input?.keyboard)scene.input.keyboard.enabled=!s.paused&&s.viewMode==="world";updateHud();}
function title(){save(false);$("pauseOverlay").classList.add("is-hidden");$("gameScreen").classList.add("is-hidden");$("inspectionScreen").classList.add("is-hidden");$("titleScreen").classList.remove("is-hidden");$("officerName").value=s?.officerName||"";}
window.BorderApp={get state(){return s;},get uiLocked(){return ["storyModal","sideModal","pauseOverlay","resultModal","dialogueModal"].some(id=>!$(id).classList.contains("is-hidden"));},interact,setPrompt};
function bind(){
 $("startForm").onsubmit=e=>{e.preventDefault();const name=$("officerName").value.trim().replace(/\s+/g," ");if(name.length<2||name.length>18){$("startStatus").textContent="نام باید بین ۲ تا ۱۸ نویسه باشد.";return;}enter(name);};
 $("continueBtn").onclick=()=>{const saved=SAVE.local();if(saved?.nickname){$("officerName").value=saved.nickname;enter(saved.nickname,saved);}};
 $("storyContinue").onclick=()=>{const f=nextStory;nextStory=null;$("storyModal").classList.add("is-hidden");f?.();};
 $("journalBtn").onclick=()=>sidePanel("journal");$("rulesBtn").onclick=()=>sidePanel("rules");$("sideClose").onclick=()=>$("sideModal").classList.add("is-hidden");
 $("pauseBtn").onclick=pause;$("resumeBtn").onclick=pause;$("titleBtn").onclick=title;
 $("closeInspection").onclick=()=>{$("inspectionScreen").classList.add("is-hidden");setMode("world");};
 $("interviewBtn").onclick=interview;$("dialogueDone").onclick=()=>{$("dialogueModal").classList.add("is-hidden");$("interviewBtn").textContent="✓ گفت‌وگو ثبت شد";$("interviewBtn").disabled=true;$("interviewBtn").style.opacity=".6";$("decisionHint").textContent=s.interviewDecision==="admit"?"مدرک تکمیلی معتبر است؛ می‌توانی ورود را مجاز کنی.":"اطلاعات تازه ثبت شد؛ حالا تصمیم بگیر.";};
 document.querySelectorAll("[data-close-dialog]").forEach(b=>b.onclick=()=>$("dialogueModal").classList.add("is-hidden"));
 $("admitBtn").onclick=()=>decide("admit");$("denyBtn").onclick=()=>decide("deny");$("holdBtn").onclick=()=>decide("hold");$("nextCaseBtn").onclick=next;
 $("soundBtn").onclick=()=>{soundOn=!soundOn;$("soundBtn").textContent=soundOn?"♫":"♪";toast(soundOn?"صدا روشن شد.":"صدا خاموش شد.");};
 $("saveBtn").onclick=()=>save(true);
 $("restartBtn").onclick=()=>{const name=s?.officerName||$("officerName").value||"مأمور";s=fresh(name);SAVE.clearSession();SAVE.setLocal(pack());$("endScreen").classList.add("is-hidden");$("titleScreen").classList.remove("is-hidden");$("officerName").value=name;$("continueBtn").classList.add("is-hidden");s=null;};
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&s)save(false);});window.addEventListener("beforeunload",()=>{if(s)SAVE.setLocal(pack());});
 const local=SAVE.local();if(local?.nickname){$("officerName").value=local.nickname;$("continueBtn").classList.remove("is-hidden");$("startStatus").textContent="یک پروندهٔ ذخیره‌شده پیدا شد.";}else if(SAVE.name())$("officerName").value=SAVE.name();
}
document.addEventListener("DOMContentLoaded",bind);
})();