(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("worldCanvas");
  const ctx = canvas.getContext("2d");
  const API = window.IronvaleAPI;
  const MAP_W = 28, MAP_H = 22, TILE_W = 58, TILE_H = 30;
  const DAY_LENGTH = 48;
  const BUILDINGS = {
    keep:     {name:"دژ مرکزی", icon:"♜", desc:"قلب قلمرو؛ نابودی آن یعنی شکست.", hp:420, cost:{}, color:"#d2b78a"},
    farm:     {name:"مزرعه", icon:"▤", desc:"در پایان هر روز آذوقه تولید می‌کند.", hp:120, cost:{wood:55,stone:15}, color:"#9fc17d"},
    lumber:   {name:"اردوگاه چوب‌بری", icon:"⌁", desc:"در کنار جنگل چوب تولید می‌کند.", hp:130, cost:{wood:50}, color:"#c29a64"},
    quarry:   {name:"معدن سنگ", icon:"⬡", desc:"روی صخره، سنگ استخراج می‌کند.", hp:145, cost:{wood:50,stone:25}, color:"#aab8b0"},
    market:   {name:"بازارچه", icon:"⌂", desc:"بازرگانان هر روز برایت طلا می‌آورند.", hp:120, cost:{wood:70,stone:50}, color:"#e1bd77"},
    house:    {name:"خانه", icon:"⌂", desc:"ظرفیت جمعیت قلمرو را افزایش می‌دهد.", hp:110, cost:{wood:65}, color:"#d2b68c"},
    barracks: {name:"پادگان", icon:"⚑", desc:"برای آموزش و اعزام سربازان.", hp:170, cost:{wood:95,stone:55}, color:"#d28d73"},
    wall:     {name:"دیوار سنگی", icon:"▥", desc:"راه مهاجمان را می‌بندد و زمان می‌خرد.", hp:210, cost:{wood:8,stone:12}, color:"#b7b9a8"},
    tower:    {name:"برج کمانداری", icon:"♜", desc:"دشمنان نزدیک را به‌صورت خودکار هدف می‌گیرد.", hp:190, cost:{wood:70,stone:70}, color:"#ddc48e"}
  };
  const BUILD_ORDER = ["farm","lumber","quarry","market","house","barracks","wall","tower"];
  const COST_LABEL = {wood:"چوب",stone:"سنگ",food:"آذوقه",gold:"طلا"};
  let viewW = 800, viewH = 600, dpr = 1;
  let camera = {x:0,y:0,zoom:0.9};
  let state = null;
  let selectedBuilding = null;
  let selectedTile = null;
  let buildMode = null;
  let attackMode = false;
  let pointer = {x:0,y:0,tile:null};
  let drag = null;
  let keys = {};
  let lastFrame = 0, raf = 0;
  let toastTimer = 0, autosaveTimer = 0, uiTimer = 0;
  let saveBusy = false, onlineMode = false, soundEnabled = true, audioContext = null;
  let particles = [], projectiles = [];
  const dayNames = ["سپیده‌دم","صبح","ظهر","غروب","شب"];
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const fa = (n) => Math.round(n).toLocaleString("fa-IR");
  const randomSeed = (x,y) => {
    const v = Math.sin(x*127.1+y*311.7+19.19)*43758.5453;
    return v-Math.floor(v);
  };

  function terrainAt(x,y) {
    if (x<0 || y<0 || x>=MAP_W || y>=MAP_H) return "void";
    if (x<3 && y<5) return "water";
    if ((x-3)*(x-3)+(y-3)*(y-3)<5.5) return "water";
    const forestPatches = [[6,8,3.2],[8,13,2.4],[22,5,2.6],[22,16,2.2]];
    for (const p of forestPatches) {
      const d = Math.hypot(x-p[0],y-p[1]);
      if (d<p[2] && randomSeed(x,y)>.12) return "forest";
    }
    const rockPatches = [[19,7,2.7],[20,15,2.5],[4,17,2.0]];
    for (const p of rockPatches) {
      const d = Math.hypot(x-p[0],y-p[1]);
      if (d<p[2] && randomSeed(x+33,y+7)>.16) return "rock";
    }
    return "grass";
  }

  function newState() {
    return {
      version:1, day:1, daySeconds:0, paused:false, speed:1, status:"playing",
      resources:{wood:180,stone:120,food:170,gold:200},
      population:20, capacity:28, morale:85, nextId:10, wave:0, defeated:0,
      buildings:[
        {id:1,type:"keep",x:13,y:10,hp:420,maxHp:420,level:1,cooldown:0},
        {id:2,type:"farm",x:15,y:12,hp:120,maxHp:120,level:1,cooldown:0},
        {id:3,type:"house",x:11,y:11,hp:110,maxHp:110,level:1,cooldown:0}
      ],
      units:[], gameSeconds:0, lastWaveDay:0, campaign:"ash-plains"
    };
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw!=="object" || raw.version!==1) return null;
    const base = newState();
    const out = {...base,...raw};
    out.resources = {...base.resources,...(raw.resources||{})};
    for (const k of Object.keys(base.resources)) out.resources[k]=clamp(Number(out.resources[k])||0,0,999999);
    out.buildings = Array.isArray(raw.buildings) ? raw.buildings.filter(b =>
      b && BUILDINGS[b.type] && Number.isFinite(+b.x) && Number.isFinite(+b.y) &&
      +b.x>=0 && +b.x<MAP_W && +b.y>=0 && +b.y<MAP_H
    ).slice(0,500).map(b => ({
      id:Number(b.id)||Math.floor(Math.random()*1e8),type:b.type,x:Math.round(b.x),y:Math.round(b.y),
      hp:clamp(Number(b.hp)||1,0,2000),maxHp:clamp(Number(b.maxHp)||BUILDINGS[b.type].hp,1,2000),
      level:clamp(Number(b.level)||1,1,3),cooldown:clamp(Number(b.cooldown)||0,0,10)
    })) : base.buildings;
    out.units = Array.isArray(raw.units) ? raw.units.filter(u =>
      u && (u.team==="player"||u.team==="enemy") && Number.isFinite(+u.x) && Number.isFinite(+u.y)
    ).slice(0,120).map(u => ({
      id:Number(u.id)||Math.floor(Math.random()*1e8),team:u.team,x:clamp(+u.x,0,MAP_W-1),y:clamp(+u.y,0,MAP_H-1),
      hp:clamp(Number(u.hp)||1,0,200),maxHp:clamp(Number(u.maxHp)||40,1,200),
      cooldown:clamp(Number(u.cooldown)||0,0,5),speed:clamp(Number(u.speed)||1,0.2,4),
      order:u.order && Number.isFinite(+u.order.x) ? {x:clamp(+u.order.x,0,MAP_W-1),y:clamp(+u.order.y,0,MAP_H-1)} : null
    })) : [];
    out.day=clamp(Number(out.day)||1,1,40);
    out.daySeconds=clamp(Number(out.daySeconds)||0,0,DAY_LENGTH);
    out.population=clamp(Number(out.population)||1,1,200);
    out.capacity=clamp(Number(out.capacity)||28,1,300);
    out.morale=clamp(Number(out.morale)||0,0,100);
    out.nextId=Math.max(Number(out.nextId)||10,10);
    out.wave=clamp(Number(out.wave)||0,0,20);
    out.defeated=clamp(Number(out.defeated)||0,0,9999);
    out.gameSeconds=clamp(Number(out.gameSeconds)||0,0,1e8);
    out.lastWaveDay=clamp(Number(out.lastWaveDay)||0,0,40);
    out.status=["playing","won","lost"].includes(out.status)?out.status:"playing";
    out.paused=!!out.paused; out.speed=[1,2,3].includes(Number(out.speed))?Number(out.speed):1;
    return out;
  }

  function localPoint(x,y) {
    return {
      x:(x-y)*TILE_W/2-(MAP_W-MAP_H)*TILE_W/4,
      y:(x+y)*TILE_H/2-(MAP_W+MAP_H-2)*TILE_H/4
    };
  }
  function screenPoint(x,y) {
    const p=localPoint(x,y);
    return {x:viewW/2+camera.x+p.x*camera.zoom,y:viewH*.53+camera.y+p.y*camera.zoom};
  }
  function screenToTile(sx,sy) {
    const px=(sx-viewW/2-camera.x)/camera.zoom+(MAP_W-MAP_H)*TILE_W/4;
    const py=(sy-viewH*.53-camera.y)/camera.zoom+(MAP_W+MAP_H-2)*TILE_H/4;
    const a=px/(TILE_W/2), b=py/(TILE_H/2);
    return {x:Math.round((a+b)/2),y:Math.round((b-a)/2)};
  }
  function polygon(points,fill,stroke,lineWidth=1) {
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  function diamond(x,y,fill,stroke) {
    polygon([[x,y-TILE_H/2],[x+TILE_W/2,y],[x,y+TILE_H/2],[x-TILE_W/2,y]],fill,stroke,0.75);
  }

  function drawTree(p,seed) {
    const sway=Math.sin(state.gameSeconds*.8+seed)*1.5;
    ctx.fillStyle="#17251a";ctx.beginPath();ctx.ellipse(p.x+2,p.y+6,13,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#674c32";ctx.fillRect(p.x-2,p.y-19,5,22);
    polygon([[p.x-13+sway,p.y-15],[p.x,p.y-43],[p.x+14+sway,p.y-14]],"#456c43","#263d2a",1);
    polygon([[p.x-11+sway,p.y-25],[p.x,p.y-51],[p.x+12+sway,p.y-24]],"#587e4b","#385238",1);
    polygon([[p.x-7+sway,p.y-35],[p.x,p.y-57],[p.x+9+sway,p.y-35]],"#75945a","#456344",.7);
    ctx.fillStyle="#a2b87a";ctx.fillRect(p.x-5+sway,p.y-38,3,2);
  }
  function drawRock(p,seed) {
    ctx.fillStyle="#1b271f";ctx.beginPath();ctx.ellipse(p.x,p.y+5,17,7,0,0,Math.PI*2);ctx.fill();
    const shift=seed%4;
    polygon([[p.x-18,p.y+1],[p.x-10,p.y-18-shift],[p.x+2,p.y-22],[p.x+17,p.y-8],[p.x+15,p.y+4]],"#7d8c82","#48594e",1);
    polygon([[p.x-10,p.y-18-shift],[p.x+2,p.y-22],[p.x+4,p.y-7],[p.x-2,p.y-5]],"#a5b2a2","#607365",.7);
    polygon([[p.x+2,p.y-22],[p.x+17,p.y-8],[p.x+4,p.y-7]],"#687b70",null);
    ctx.fillStyle="#d1d0b6";ctx.fillRect(p.x-7,p.y-16,4,2);
  }
  function drawWater(p,x,y) {
    diamond(p.x,p.y,"#426b69","#73908a");
    const wave=randomSeed(x,y);
    ctx.strokeStyle="#8fb4a2";ctx.globalAlpha=.34;ctx.lineWidth=1;
    for(let i=0;i<2;i++){
      const yy=p.y-5+i*9;
      ctx.beginPath();ctx.moveTo(p.x-13+(wave*4),yy);ctx.lineTo(p.x-2+(wave*4),yy-2);ctx.lineTo(p.x+7+(wave*4),yy);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  function drawTerrain() {
    for(let sum=0;sum<MAP_W+MAP_H-1;sum++){
      for(let x=Math.max(0,sum-(MAP_H-1));x<=Math.min(MAP_W-1,sum);x++){
        const y=sum-x,p=localPoint(x,y),kind=terrainAt(x,y),v=randomSeed(x,y);
        if(kind==="water"){drawWater(p,x,y);continue;}
        const green=["#647d4f","#6b8253","#70865a","#63794d"][Math.floor(v*4)];
        const grass=["#6d8455","#748a5c","#687f50","#7a8d60"][Math.floor(v*4)];
        diamond(p.x,p.y,kind==="grass"?grass:kind==="forest"?"#536f49":"#737f70", "#344c39");
        if(kind==="grass" && v>.76){
          ctx.strokeStyle="#8ea66b55";ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(p.x-8,p.y+2);ctx.lineTo(p.x-5,p.y-2);ctx.moveTo(p.x+5,p.y+4);ctx.lineTo(p.x+8,p.y);ctx.stroke();
        }
        if(kind==="forest") drawTree(p,Math.floor(v*100));
        if(kind==="rock") drawRock(p,Math.floor(v*100));
      }
    }
  }

  function drawShadow(p,rx,ry) {
    ctx.fillStyle="#14201788";ctx.beginPath();ctx.ellipse(p.x,p.y+5,rx,ry,0,0,Math.PI*2);ctx.fill();
  }
  function drawBuilding(b) {
    const p=localPoint(b.x,b.y),t=b.type;
    drawShadow(p,t==="keep"?35:22,t==="keep"?13:9);
    if(t==="keep"){
      polygon([[p.x-30,p.y-13],[p.x,p.y-28],[p.x+30,p.y-13],[p.x,p.y+2]],"#a9a894","#5e6d5e",1.2);
      polygon([[p.x-30,p.y-13],[p.x,p.y+2],[p.x,p.y+19],[p.x-30,p.y+4]],"#737e72","#475849",1);
      polygon([[p.x,p.y+2],[p.x+30,p.y-13],[p.x+30,p.y+4],[p.x,p.y+19]],"#586c5a","#3b4d40",1);
      ctx.fillStyle="#7c8c76";ctx.fillRect(p.x-19,p.y-49,15,38);ctx.fillRect(p.x+5,p.y-48,15,37);
      ctx.fillStyle="#aeb59a";ctx.fillRect(p.x-23,p.y-52,23,5);ctx.fillRect(p.x+1,p.y-51,23,5);
      for(let i=0;i<4;i++){ctx.fillRect(p.x-22+i*7,p.y-57,4,7);ctx.fillRect(p.x+2+i*6,p.y-56,4,7);}
      polygon([[p.x-21,p.y-52],[p.x-11,p.y-68],[p.x-1,p.y-52]],"#9b7651","#594832",1);
      polygon([[p.x+2,p.y-51],[p.x+12,p.y-68],[p.x+22,p.y-51]],"#9b7651","#594832",1);
      ctx.fillStyle="#243b2a";ctx.fillRect(p.x-3,p.y-24,7,25);
      ctx.fillStyle="#d8bd7f";ctx.fillRect(p.x+4,p.y-62,2,20);polygon([[p.x+6,p.y-61],[p.x+20,p.y-55],[p.x+6,p.y-49]],"#c56e54",null);
    } else if(t==="farm"){
      polygon([[p.x-25,p.y-4],[p.x,p.y-17],[p.x+26,p.y-4],[p.x,p.y+9]],"#a47b4c","#624d35",1);
      for(let i=0;i<4;i++){ctx.strokeStyle=i%2?"#78945a":"#927244";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-17+i*3,p.y-4+i*2);ctx.lineTo(p.x-1+i*8,p.y+5-i*1);ctx.stroke();}
      ctx.fillStyle="#d6c48e";ctx.fillRect(p.x+5,p.y-36,23,24);
      polygon([[p.x+1,p.y-35],[p.x+17,p.y-49],[p.x+32,p.y-35]],"#9b6749","#634b35",1);
      ctx.fillStyle="#263d2a";ctx.fillRect(p.x+14,p.y-25,5,13);
    } else if(t==="lumber"){
      polygon([[p.x-22,p.y-8],[p.x,p.y-19],[p.x+22,p.y-8],[p.x,p.y+5]],"#947247","#594832",1);
      ctx.fillStyle="#8b7350";ctx.fillRect(p.x-12,p.y-32,25,23);
      polygon([[p.x-15,p.y-31],[p.x,p.y-44],[p.x+16,p.y-31]],"#72503a","#45372a",1);
      ctx.fillStyle="#d2ae6a";ctx.fillRect(p.x-7,p.y-25,7,12);
      ctx.strokeStyle="#b58b55";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(p.x+10,p.y+1);ctx.lineTo(p.x+26,p.y-7);ctx.stroke();
      ctx.strokeStyle="#dfc18b";ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x+26,p.y-7,3,0,Math.PI*2);ctx.stroke();
    } else if(t==="quarry"){
      polygon([[p.x-25,p.y-4],[p.x-12,p.y-29],[p.x+5,p.y-33],[p.x+26,p.y-9],[p.x+15,p.y+8],[p.x-15,p.y+9]],"#83918a","#4b5b53",1);
      polygon([[p.x-12,p.y-29],[p.x+5,p.y-33],[p.x+7,p.y-12],[p.x-6,p.y-7]],"#b1b9a7",null);
      polygon([[p.x+5,p.y-33],[p.x+26,p.y-9],[p.x+7,p.y-12]],"#6c8074",null);
      ctx.strokeStyle="#b18a56";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-21,p.y-25);ctx.lineTo(p.x-3,p.y-5);ctx.stroke();
      ctx.fillStyle="#d2bc8a";ctx.fillRect(p.x-24,p.y-27,8,3);
    } else if(t==="market"){
      polygon([[p.x-24,p.y-5],[p.x,p.y-18],[p.x+24,p.y-5],[p.x,p.y+8]],"#8b774e","#514934",1);
      polygon([[p.x-20,p.y-7],[p.x-12,p.y-35],[p.x+12,p.y-35],[p.x+20,p.y-7]],"#9b694e","#614a35",1);
      ctx.fillStyle="#d6b875";ctx.fillRect(p.x-12,p.y-34,24,3);
      ctx.fillStyle="#263b2c";ctx.fillRect(p.x-6,p.y-17,12,20);
      ctx.fillStyle="#e6d6ae";ctx.fillRect(p.x-2,p.y-15,4,5);
    } else if(t==="house"){
      polygon([[p.x-22,p.y-5],[p.x,p.y-16],[p.x+23,p.y-5],[p.x,p.y+7]],"#a98e65","#5c4d38",1);
      ctx.fillStyle="#d7c39b";ctx.fillRect(p.x-16,p.y-32,32,28);
      polygon([[p.x-21,p.y-31],[p.x,p.y-48],[p.x+21,p.y-31]],"#925f49","#5a4232",1);
      ctx.fillStyle="#493a2b";ctx.fillRect(p.x-3,p.y-19,8,15);
      ctx.fillStyle="#7f9774";ctx.fillRect(p.x-12,p.y-23,5,6);ctx.fillRect(p.x+7,p.y-23,5,6);
    } else if(t==="barracks"){
      polygon([[p.x-25,p.y-4],[p.x,p.y-17],[p.x+25,p.y-4],[p.x,p.y+9]],"#9a8562","#514a3b",1);
      ctx.fillStyle="#b4a080";ctx.fillRect(p.x-19,p.y-32,38,28);
      polygon([[p.x-24,p.y-31],[p.x,p.y-49],[p.x+24,p.y-31]],"#81533f","#4b352b",1);
      ctx.fillStyle="#283d2c";ctx.fillRect(p.x-5,p.y-20,10,17);
      ctx.fillStyle="#d7bd82";ctx.fillRect(p.x+16,p.y-57,2,29);
      polygon([[p.x+18,p.y-56],[p.x+29,p.y-52],[p.x+18,p.y-46]],"#b75c4e",null);
    } else if(t==="wall"){
      polygon([[p.x-27,p.y-8],[p.x,p.y-21],[p.x+27,p.y-8],[p.x,p.y+5]],"#a5aaa0","#515c51",1);
      polygon([[p.x-27,p.y-8],[p.x,p.y+5],[p.x,p.y+20],[p.x-27,p.y+7]],"#737e74","#4a584d",1);
      polygon([[p.x,p.y+5],[p.x+27,p.y-8],[p.x+27,p.y+7],[p.x,p.y+20]],"#66766a","#435346",1);
      ctx.fillStyle="#c3c5b6";ctx.fillRect(p.x-21,p.y-14,8,5);ctx.fillRect(p.x-2,p.y-13,8,5);ctx.fillRect(p.x+15,p.y-14,8,5);
    } else if(t==="tower"){
      polygon([[p.x-23,p.y-6],[p.x,p.y-18],[p.x+23,p.y-6],[p.x,p.y+7]],"#9da79a","#505e50",1);
      ctx.fillStyle="#899587";ctx.fillRect(p.x-14,p.y-55,28,50);
      polygon([[p.x-17,p.y-55],[p.x,p.y-67],[p.x+17,p.y-55]],"#aeb4a0","#566453",1);
      ctx.fillStyle="#d4d0b7";for(let i=0;i<4;i++)ctx.fillRect(p.x-16+i*9,p.y-61,5,8);
      ctx.fillStyle="#283b2d";ctx.fillRect(p.x-5,p.y-31,10,16);
      ctx.fillStyle="#c7a66f";ctx.fillRect(p.x+12,p.y-63,2,21);
    }
    if(b.hp < b.maxHp*.7){
      ctx.strokeStyle="#4a3025";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-8,p.y-30);ctx.lineTo(p.x-3,p.y-18);ctx.lineTo(p.x-8,p.y-12);ctx.stroke();
    }
    if(selectedBuilding===b.id){
      ctx.strokeStyle="#f0d08a";ctx.lineWidth=2;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.ellipse(p.x,p.y+2,31,13,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    if(b.hp < b.maxHp*.45){
      ctx.fillStyle="#d2a36a";ctx.globalAlpha=.16+Math.sin(state.gameSeconds*3)*.08;
      ctx.beginPath();ctx.arc(p.x+15,p.y-30,8,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
  }

  function drawUnit(u) {
    const p=localPoint(u.x,u.y);
    drawShadow(p,8,4);
    if(u.team==="enemy"){
      ctx.fillStyle="#733e36";ctx.fillRect(p.x-5,p.y-18,10,18);
      ctx.fillStyle="#c47762";ctx.beginPath();ctx.arc(p.x,p.y-22,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e2c8a5";ctx.fillRect(p.x-3,p.y-23,2,2);
      ctx.fillStyle="#3c2e28";ctx.fillRect(p.x-8,p.y-7,4,8);ctx.fillRect(p.x+4,p.y-7,4,8);
      ctx.strokeStyle="#8e4d43";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x+4,p.y-13);ctx.lineTo(p.x+11,p.y-22);ctx.stroke();
    } else {
      ctx.fillStyle="#455f50";ctx.fillRect(p.x-5,p.y-18,10,18);
      ctx.fillStyle="#d9c394";ctx.beginPath();ctx.arc(p.x,p.y-22,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#adba9e";ctx.fillRect(p.x-7,p.y-17,14,7);
      ctx.fillStyle="#26382d";ctx.fillRect(p.x-8,p.y-8,5,9);ctx.fillRect(p.x+3,p.y-8,5,9);
      ctx.strokeStyle="#c7b17d";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x+7,p.y-15);ctx.lineTo(p.x+10,p.y-28);ctx.stroke();
    }
    ctx.fillStyle="#121b15";ctx.fillRect(p.x-8,p.y-34,16,3);
    ctx.fillStyle=u.team==="enemy"?"#c96c5c":"#82ad78";ctx.fillRect(p.x-8,p.y-34,16*clamp(u.hp/u.maxHp,0,1),3);
  }

  function drawWorld() {
    const rect=canvas.getBoundingClientRect();
    viewW=rect.width;viewH=rect.height;
    if(!viewW||!viewH)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,viewW,viewH);
    ctx.save();
    ctx.translate(viewW/2+camera.x,viewH*.53+camera.y);
    ctx.scale(camera.zoom,camera.zoom);
    drawTerrain();
    if(pointer.tile && inMap(pointer.tile.x,pointer.tile.y)){
      const p=localPoint(pointer.tile.x,pointer.tile.y);
      const terrain=terrainAt(pointer.tile.x,pointer.tile.y);
      if(buildMode){
        const valid=canPlace(buildMode,pointer.tile.x,pointer.tile.y);
        diamond(p.x,p.y,valid?"#a5d18b66":"#d66f5a66",valid?"#d8e7a4":"#f0a18d",2);
      }else if(!attackMode){
        diamond(p.x,p.y,"#e3d3a022","#f0d08a",1.5);
      }
    }
    const buildings=[...state.buildings].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    for(const b of buildings)drawBuilding(b);
    for(const u of [...state.units].sort((a,b)=>(a.x+a.y)-(b.x+b.y)))drawUnit(u);
    for(const shot of projectiles){
      const p=localPoint(shot.x,shot.y),t=localPoint(shot.tx,shot.ty);
      const k=clamp(shot.t/shot.life,0,1);
      ctx.strokeStyle="#e6d39a";ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(p.x,p.y-32);ctx.lineTo(p.x+(t.x-p.x)*k,p.y-32+(t.y-p.y)*k);ctx.stroke();
      ctx.fillStyle="#f5dfad";ctx.beginPath();ctx.arc(p.x+(t.x-p.x)*k,p.y-32+(t.y-p.y)*k,2.5,0,Math.PI*2);ctx.fill();
    }
    for(const part of particles){
      const p=localPoint(part.x,part.y);
      ctx.globalAlpha=clamp(part.life/part.max,0,1);
      ctx.fillStyle=part.color;ctx.fillRect(p.x+part.dx,p.y-12+part.dy,3,3);
      ctx.globalAlpha=1;
    }
    if(attackMode && pointer.tile && inMap(pointer.tile.x,pointer.tile.y)){
      const p=localPoint(pointer.tile.x,pointer.tile.y);
      ctx.strokeStyle="#e8c47d";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,14,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle="#f5d99a";ctx.font="bold 14px Georgia";ctx.fillText("⚑",p.x-5,p.y-19);
    }
    ctx.restore();
    // soft light and vignette over the map
    const grad=ctx.createRadialGradient(viewW*.5,viewH*.45,viewH*.16,viewW*.5,viewH*.45,viewW*.75);
    grad.addColorStop(0,"#f4e5a00a");grad.addColorStop(1,"#0b160d44");
    ctx.fillStyle=grad;ctx.fillRect(0,0,viewW,viewH);
  }

  function inMap(x,y){return x>=0&&y>=0&&x<MAP_W&&y<MAP_H;}
  function buildingAt(x,y){return state.buildings.find(b=>b.x===x&&b.y===y);}
  function canPlace(type,x,y){
    if(!inMap(x,y)||buildingAt(x,y))return false;
    const terrain=terrainAt(x,y);
    if(terrain==="water"||terrain==="void")return false;
    if(type==="lumber"&&terrain!=="forest")return false;
    if(type==="quarry"&&terrain!=="rock")return false;
    if((type==="farm"||type==="market"||type==="house"||type==="barracks"||type==="wall"||type==="tower")&&terrain!=="grass")return false;
    const keep=state.buildings.find(b=>b.type==="keep");
    if(keep&&Math.hypot(x-keep.x,y-keep.y)>11)return false;
    return true;
  }
  function hasResources(cost){
    return Object.entries(cost).every(([key,value])=>(state.resources[key]||0)>=value);
  }
  function spend(cost){
    for(const [key,value] of Object.entries(cost))state.resources[key]-=value;
  }
  function buildingCount(type){return state.buildings.filter(b=>b.type===type).length;}
  function setBuildMode(type){
    if(state.status!=="playing"||state.paused)return;
    if(buildMode===type){buildMode=null;toast("حالت ساخت لغو شد.");}
    else{
      if(!hasResources(BUILDINGS[type].cost)){toast("منابع کافی برای ساخت این سازه نداری.",true);return;}
      buildMode=type;attackMode=false;selectedBuilding=null;
      document.querySelectorAll("[data-build]").forEach(el=>el.classList.toggle("active",el.dataset.build===type));
      toast("محل مناسب را روی نقشه انتخاب کن.");
    }
    if(!buildMode)document.querySelectorAll("[data-build]").forEach(el=>el.classList.remove("active"));
    updatePanels();
  }
  function build(type,x,y){
    if(!canPlace(type,x,y)){toast(type==="lumber"?"اردوگاه چوب‌بری فقط روی جنگل ساخته می‌شود.":type==="quarry"?"معدن را روی صخره بساز.":"این خانه برای ساخت مناسب نیست.",true);return;}
    const def=BUILDINGS[type];
    if(!hasResources(def.cost)){toast("منابع کافی نیست.",true);return;}
    spend(def.cost);
    const building={id:state.nextId++,type,x,y,hp:def.hp,maxHp:def.hp,level:1,cooldown:0};
    state.buildings.push(building);
    selectedBuilding=building.id;selectedTile={x,y};
    if(type!=="wall")buildMode=null;
    document.querySelectorAll("[data-build]").forEach(el=>el.classList.toggle("active",el.dataset.build===buildMode));
    addLog(def.name+" ساخته شد.");
    sound(420);updatePanels();updateHud();saveGame(false);
  }

  function addLog(text){
    const log=$("eventLog");
    const row=document.createElement("div");row.className="log-line";
    const dot=document.createElement("i"),span=document.createElement("span");
    span.textContent=text;row.append(dot,span);log.prepend(row);
    while(log.children.length>7)log.lastElementChild.remove();
  }
  function toast(message,bad=false){
    const el=$("toast");el.textContent=message;el.classList.toggle("bad",!!bad);el.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);
  }
  function sound(freq=520){
    if(!soundEnabled)return;
    try{
      audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==="suspended")audioContext.resume();
      const osc=audioContext.createOscillator(),gain=audioContext.createGain();
      osc.type="triangle";osc.frequency.value=freq;
      gain.gain.setValueAtTime(.035,audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.11);
      osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.12);
    }catch{}
  }
  function updateHud(){
    if(!state)return;
    $("woodValue").textContent=fa(state.resources.wood);
    $("stoneValue").textContent=fa(state.resources.stone);
    $("foodValue").textContent=fa(state.resources.food);
    $("goldValue").textContent=fa(state.resources.gold);
    $("dayValue").textContent=fa(state.day);
    const phase=state.daySeconds<10?0:state.daySeconds<22?1:state.daySeconds<34?2:state.daySeconds<42?3:4;
    $("phaseValue").textContent=dayNames[phase];
    $("populationValue").textContent="جمعیت "+fa(state.population)+" / "+fa(state.capacity);
    $("peopleValue").textContent=fa(state.population)+" نفر";
    const army=state.units.filter(u=>u.team==="player").length;
    $("armyValue").textContent=fa(army)+" سرباز";
    $("moraleValue").textContent=fa(state.morale);
    $("moraleMeter").style.width=state.morale+"%";
    $("moraleRing").style.borderColor=state.morale<30?"#bb6b5c":state.morale<60?"#c2a364":"#71926b";
    $("moraleLabel").textContent=state.morale>75?"شاداب":state.morale>45?"معمولی":state.morale>20?"ناراضی":"در آستانهٔ شورش";
    $("moraleValue").style.color=state.morale<30?"#e28b7b":"#c3d3ad";
    $("pauseButton").textContent=state.paused?"▶":"Ⅱ";
    $("speedButton").textContent=state.speed+"×";
    $("pauseBanner").classList.toggle("is-hidden",!state.paused);
    const economy=buildingCount("farm")+buildingCount("lumber")+buildingCount("quarry");
    $("objectiveProgress").style.width=Math.min(100,economy/3*100)+"%";
    $("objectiveMeta").textContent=fa(Math.min(3,economy))+" از ۳ سازهٔ اقتصادی";
    $("objectiveTitle").textContent=state.day>12?"پاک‌سازی آخرین مهاجمان":"پایه‌های یک قلمرو";
    $("objectiveText").textContent=state.day>12?"دشمنان باقی‌مانده را شکست بده و دژ را حفظ کن.":"اقتصاد خود را گسترش بده و تا روز دوازدهم از دژ محافظت کن.";
    $("worldBadge").textContent=state.day<3?"منطقهٔ امن · روزهای آغازین":state.units.some(u=>u.team==="enemy")?"هشدار · مهاجمان در قلمرو":"مرز شمالی · دیده‌بان فعال";
    $("saveText").textContent=onlineMode?"ذخیرهٔ ابری فعال":"ذخیرهٔ محلی فعال";
  }

  function updatePanels(){
    const panel=$("selectionPanel");
    const b=state.buildings.find(v=>v.id===selectedBuilding);
    if(!b){
      panel.innerHTML='<div class="empty-selection"><span>⌖</span><b>هیچ سازه‌ای انتخاب نشده</b><small>روی نقشه یک ساختمان را انتخاب کن تا آمار و فرمان‌های آن نمایش داده شود.</small></div>';
      $("selectionHint").textContent=selectedTile?"زمین خالی · "+fa(selectedTile.x)+", "+fa(selectedTile.y):"یک خانه یا سازه را برای مشاهدهٔ جزئیات انتخاب کن";
      return;
    }
    const def=BUILDINGS[b.type],pct=Math.round(b.hp/b.maxHp*100);
    $("selectionHint").textContent=def.name+" · سطح "+fa(b.level);
    panel.innerHTML=
      '<div class="building-detail">'+
      '<div class="detail-top"><div class="detail-symbol">'+def.icon+'</div><div><b>'+def.name+'</b><small>مختصات '+fa(b.x)+' / '+fa(b.y)+' · سطح '+fa(b.level)+'</small></div></div>'+
      '<div class="detail-hp"><span>استحکام سازه</span><b>'+fa(b.hp)+' / '+fa(b.maxHp)+'</b></div>'+
      '<div class="meter"><i style="width:'+pct+'%;background:'+(pct<35?"#c16d5f":"linear-gradient(90deg,#77996d,#b8c77f)")+'"></i></div>'+
      '<div class="detail-actions"><button class="small-action" data-selection-action="repair">تعمیر · ۱۵ چوب</button><button class="small-action" data-selection-action="upgrade">ارتقا</button></div>'+
      '<p style="font-size:9px;line-height:1.8;color:#9caa9d;margin:10px 0 0">'+def.desc+'</p></div>';
  }

  function selectTile(x,y){
    if(!inMap(x,y))return;
    selectedTile={x,y};
    const b=buildingAt(x,y);
    selectedBuilding=b?b.id:null;
    updatePanels();
    $("coordValue").textContent="X "+fa(x)+" · Y "+fa(y);
  }
  function handleWorldClick(tile){
    if(!inMap(tile.x,tile.y))return;
    if(attackMode){
      const soldiers=state.units.filter(u=>u.team==="player");
      if(!soldiers.length){toast("هنوز سربازی برای فرمان دادن نداری.",true);attackMode=false;return;}
      soldiers.forEach(u=>u.order={x:tile.x,y:tile.y});
      attackMode=false;$("attackButton").classList.remove("command-primary");
      addLog("فرمان حرکت نیروها به مختصات "+fa(tile.x)+", "+fa(tile.y)+" صادر شد.");
      toast("فرمان حرکت صادر شد.");sound(360);return;
    }
    if(buildMode){build(buildMode,tile.x,tile.y);return;}
    selectTile(tile.x,tile.y);
  }

  function repairSelected(){
    const b=state.buildings.find(v=>v.id===selectedBuilding);if(!b)return;
    if(b.hp>=b.maxHp){toast("این سازه آسیبی ندیده است.");return;}
    if(state.resources.wood<15){toast("برای تعمیر، ۱۵ چوب لازم است.",true);return;}
    state.resources.wood-=15;b.hp=Math.min(b.maxHp,b.hp+65);
    toast("سازه تعمیر شد.");sound(460);updatePanels();updateHud();saveGame(false);
  }
  function upgradeSelected(){
    const b=state.buildings.find(v=>v.id===selectedBuilding);if(!b)return;
    if(b.level>=3){toast("این سازه به بالاترین سطح رسیده است.");return;}
    const cost={wood:35*b.level,stone:20*b.level};
    if(!hasResources(cost)){toast("برای ارتقا چوب و سنگ کافی نداری.",true);return;}
    spend(cost);b.level++;b.maxHp+=35;b.hp=Math.min(b.maxHp,b.hp+35);
    toast("سازه به سطح "+fa(b.level)+" ارتقا یافت.");sound(680);updatePanels();updateHud();saveGame(false);
  }

  function togglePause(force){
    if(!state||state.status!=="playing")return;
    state.paused=typeof force==="boolean"?force:!state.paused;
    updateHud();sound(state.paused?250:520);
  }
  function setBuildButtons(){
    document.querySelectorAll("[data-build]").forEach(el=>el.classList.toggle("active",el.dataset.build===buildMode));
  }

  function recruit(){
    if(state.status!=="playing"||state.paused)return;
    if(!buildingCount("barracks")){toast("اول یک پادگان بساز.",true);return;}
    const soldiers=state.units.filter(u=>u.team==="player").length;
    if(soldiers>=Math.max(8,Math.floor(state.population*.55))){toast("ظرفیت ارتش تکمیل شده است.",true);return;}
    if(state.resources.gold<20||state.resources.food<8){toast("برای استخدام به ۲۰ طلا و ۸ آذوقه نیاز داری.",true);return;}
    state.resources.gold-=20;state.resources.food-=8;
    const barracks=state.buildings.find(b=>b.type==="barracks");
    state.units.push({id:state.nextId++,team:"player",x:barracks.x+.25,y:barracks.y+.2,hp:48,maxHp:48,cooldown:.7,speed:1.7,order:null});
    addLog("یک سرباز تازه به پادگان پیوست.");toast("سرباز استخدام شد.");sound(560);updateHud();saveGame(false);
  }
  function trade(){
    if(state.resources.food<40){toast("برای تجارت حداقل ۴۰ آذوقه لازم است.",true);return;}
    state.resources.food-=40;state.resources.gold+=25;
    addLog("۴۰ آذوقه با ۲۵ طلا مبادله شد.");toast("تجارت انجام شد: ۲۵ طلا دریافت کردی.");sound(620);updateHud();saveGame(false);
  }
  function startAttackMode(){
    if(state.status!=="playing"||state.paused)return;
    if(!state.units.some(u=>u.team==="player")){toast("ابتدا از پادگان سرباز استخدام کن.",true);return;}
    attackMode=!attackMode;buildMode=null;setBuildButtons();
    $("attackButton").classList.toggle("command-primary",attackMode);
    toast(attackMode?"روی نقشه مقصد نیروها را انتخاب کن.":"فرمان حمله لغو شد.");
  }

  function spawnWave(day){
    const count=2+Math.floor(day/2);
    state.wave++;
    for(let i=0;i<count;i++){
      const edge=i%4,offset=3+Math.floor(randomSeed(day,i)*15);
      let x=edge===0?0:edge===1?MAP_W-1:offset;
      let y=edge===2?0:edge===3?MAP_H-1:offset;
      const hp=34+day*3;
      state.units.push({id:state.nextId++,team:"enemy",x,y,hp,maxHp:hp,cooldown:1+randomSeed(i,day),speed:1.05+Math.min(.42,day*.025),order:null});
    }
    state.lastWaveDay=day;
    addLog("هشدار! دسته‌ای از راهزنان به مرزها رسیده‌اند.");
    toast("یورش دشمن آغاز شد · موج "+fa(state.wave),true);sound(180);
  }

  function endDay(){
    state.day++;
    const farms=buildingCount("farm"),lumber=buildingCount("lumber"),quarries=buildingCount("quarry"),markets=buildingCount("market");
    const foodGain=farms*34;
    const foodNeed=Math.ceil(state.population*1.25);
    state.resources.food=Math.max(0,state.resources.food+foodGain-foodNeed);
    state.resources.wood+=lumber*22;
    state.resources.stone+=quarries*17;
    state.resources.gold+=markets*13+Math.floor(state.population/7)*2;
    if(state.resources.food===0){
      state.morale=clamp(state.morale-13,0,100);
      if(state.population>5)state.population--;
      addLog("آذوقه کافی نیست؛ مردم ناراضی شده‌اند.");
    }else{
      state.morale=clamp(state.morale+(state.resources.food>35?4:1),0,100);
      if(state.day%3===0&&state.population<state.capacity&&state.resources.food>45)state.population++;
      addLog("محصول روزانه جمع‌آوری شد؛ خزانه به‌روز شد.");
    }
    if([3,5,7,9,11].includes(state.day))spawnWave(state.day);
    if(state.morale<=0){finishGame(false,"مردم امید خود را از دست دادند و قلمرو فروپاشید.");return;}
    if(state.day>12&&!state.units.some(u=>u.team==="enemy")){finishGame(true,"دژ پابرجا ماند و آخرین دستهٔ مهاجمان شکست خورد.");return;}
    updateHud();
  }

  function targetBuildingForEnemy(enemy){
    const keep=state.buildings.find(b=>b.type==="keep");
    if(!keep)return null;
    const wall=state.buildings.filter(b=>b.type==="wall"&&dist(enemy,b)<1.25)
      .sort((a,b)=>dist(enemy,a)-dist(enemy,b))[0];
    if(wall)return wall;
    return keep;
  }
  function addHitParticles(x,y,color){
    for(let i=0;i<7;i++)particles.push({x,y,dx:(Math.random()-.5)*23,dy:(Math.random()-.5)*17,life:.45+Math.random()*.4,max:.85,color});
  }
  function damageBuilding(b,amount){
    if(!b)return;
    b.hp-=amount;addHitParticles(b.x,b.y,"#d5a26a");
    if(b.hp<=0){
      state.buildings=state.buildings.filter(x=>x.id!==b.id);
      if(b.type==="keep"){finishGame(false,"دژ مرکزی سقوط کرد؛ قلمرو به دست مهاجمان افتاد.");return;}
      addLog(BUILDINGS[b.type].name+" ویران شد.");
      if(selectedBuilding===b.id){selectedBuilding=null;updatePanels();}
    }
  }
  function updateCombat(dt){
    const enemies=state.units.filter(u=>u.team==="enemy");
    const soldiers=state.units.filter(u=>u.team==="player");
    const keep=state.buildings.find(b=>b.type==="keep");
    if(!keep)return;
    // Soldiers defend the heart of the realm unless they have a movement order.
    for(const unit of soldiers){
      unit.cooldown=Math.max(0,unit.cooldown-dt);
      let target=null;
      if(unit.order){
        const close=enemies.filter(e=>dist(e,unit)<2.4).sort((a,b)=>dist(a,unit)-dist(b,unit));
        target=close[0]||null;
      }else if(dist(unit,keep)<7.5){
        target=enemies.filter(e=>dist(e,keep)<8).sort((a,b)=>dist(a,unit)-dist(b,unit))[0]||null;
      }
      if(target){
        const d=dist(unit,target);
        if(d>.78){
          const step=unit.speed*dt/Math.max(d,.01);
          unit.x+=(target.x-unit.x)*step;unit.y+=(target.y-unit.y)*step;
        }else if(unit.cooldown<=0){
          target.hp-=13;unit.cooldown=.85;addHitParticles(target.x,target.y,"#dfc184");
          if(target.hp<=0){state.units=state.units.filter(u=>u.id!==target.id);state.defeated++;}
        }
      }else if(unit.order){
        const d=Math.hypot(unit.order.x-unit.x,unit.order.y-unit.y);
        if(d>.35){const step=unit.speed*dt/Math.max(d,.01);unit.x+=(unit.order.x-unit.x)*step;unit.y+=(unit.order.y-unit.y)*step;}
        else unit.order=null;
      }
    }
    // Raiders seek the keep and break nearby wall segments before advancing.
    for(const enemy of enemies){
      if(!state.units.some(u=>u.id===enemy.id))continue;
      enemy.cooldown=Math.max(0,enemy.cooldown-dt);
      const target=targetBuildingForEnemy(enemy);
      if(!target)continue;
      const d=dist(enemy,target);
      if(d>.82){
        const nx=enemy.x+(target.x-enemy.x)/Math.max(d,.01)*enemy.speed*dt;
        const ny=enemy.y+(target.y-enemy.y)/Math.max(d,.01)*enemy.speed*dt;
        const blocking=state.buildings.find(b=>b.type==="wall"&&Math.round(nx)===b.x&&Math.round(ny)===b.y);
        if(blocking){
          if(enemy.cooldown<=0){damageBuilding(blocking,11);enemy.cooldown=1.15;}
        }else{enemy.x=nx;enemy.y=ny;}
      }else if(enemy.cooldown<=0){
        damageBuilding(target,9+Math.floor(state.day/4));enemy.cooldown=1.1;
      }
    }
    // Towers fire automatically at the closest raider in range.
    for(const tower of state.buildings.filter(b=>b.type==="tower")){
      tower.cooldown=Math.max(0,(tower.cooldown||0)-dt);
      if(tower.cooldown>0)continue;
      const target=state.units.filter(u=>u.team==="enemy"&&dist(u,tower)<5.8)
        .sort((a,b)=>dist(a,tower)-dist(b,tower))[0];
      if(target){
        tower.cooldown=1.55/ tower.level;
        target.hp-=17+5*(tower.level-1);
        projectiles.push({x:tower.x,y:tower.y,tx:target.x,ty:target.y,t:0,life:.28});
        addHitParticles(target.x,target.y,"#e2c98f");
        if(target.hp<=0){state.units=state.units.filter(u=>u.id!==target.id);state.defeated++;}
      }
    }
    state.units=state.units.filter(u=>u.hp>0&&u.x>=-1&&u.y>=-1&&u.x<=MAP_W&&u.y<=MAP_H);
  }

  function finishGame(won,message){
    if(!state||state.status!=="playing")return;
    state.status=won?"won":"lost";state.paused=true;updateHud();
    $("resultIcon").textContent=won?"♜":"⚔";
    $("resultTitle").textContent=won?"فرمانروای دشت خاکستر":"سقوط قلمرو";
    $("resultText").textContent=message;
    $("resultStats").innerHTML="<span>روز "+fa(state.day)+"</span><span>"+fa(state.defeated)+" دشمن شکست‌خورده</span><span>"+fa(state.population)+" شهروند باقی‌مانده</span>";
    $("resultModal").classList.remove("is-hidden");
    sound(won?720:130);saveGame(false);
  }

  function update(dt){
    if(!state)return;
    const pan=300*dt/Math.max(.6,camera.zoom);
    if(keys.ArrowLeft||keys.KeyA)camera.x+=pan;
    if(keys.ArrowRight||keys.KeyD)camera.x-=pan;
    if(keys.ArrowUp||keys.KeyW)camera.y+=pan;
    if(keys.ArrowDown||keys.KeyS)camera.y-=pan;
    if(state.paused||state.status!=="playing")return;
    dt*=state.speed;
    state.gameSeconds+=dt;state.daySeconds+=dt;
    while(state.daySeconds>=DAY_LENGTH&&state.status==="playing"){
      state.daySeconds-=DAY_LENGTH;endDay();
    }
    if(state.status!=="playing")return;
    updateCombat(dt);
    for(const p of projectiles)p.t+=dt;
    projectiles=projectiles.filter(p=>p.t<p.life);
    for(const p of particles)p.life-=dt;
    particles=particles.filter(p=>p.life>0);
    if(state.day>12&&!state.units.some(u=>u.team==="enemy"))finishGame(true,"دژ پابرجا ماند و آخرین دستهٔ مهاجمان شکست خورد.");
  }

  function frame(now){
    const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):0;lastFrame=now;
    update(dt);drawWorld();
    if(now-uiTimer>450){updateHud();uiTimer=now;}
    raf=requestAnimationFrame(frame);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
    viewW=rect.width;viewH=rect.height;
    drawWorld();
  }

  async function saveGame(showMessage=true){
    if(!state||saveBusy)return;
    const pack={version:1,nickname:API.getNickname()||$("playerName").textContent,savedAt:new Date().toISOString(),state:JSON.parse(JSON.stringify(state))};
    API.setLocalSave(pack);
    saveBusy=true;
    $("saveDot").parentElement.classList.add("saving");
    $("saveText").textContent="در حال ذخیره...";
    if(onlineMode){
      try{
        await API.save(pack);
        $("saveDot").parentElement.classList.remove("saving","error");
        $("saveText").textContent="ذخیرهٔ ابری فعال";
        if(showMessage)toast("پیشرفتت روی سرور ذخیره شد.");
      }catch(error){
        onlineMode=false;
        $("saveDot").parentElement.classList.remove("saving");
        $("saveDot").parentElement.classList.add("error");
        $("saveText").textContent="ذخیرهٔ محلی فعال";
        if(showMessage)toast("سرور در دسترس نیست؛ ذخیرهٔ محلی انجام شد.",true);
      }
    }else{
      $("saveDot").parentElement.classList.remove("saving");
      $("saveText").textContent="ذخیرهٔ محلی فعال";
      if(showMessage)toast("بازی روی همین دستگاه ذخیره شد.");
    }
    saveBusy=false;updateHud();
  }

  function setGameState(saved){
    const normalized=sanitizeState(saved);
    state=normalized||newState();
    if(!state.buildings.some(b=>b.type==="keep"))state=newState();
    state.paused=false;state.status="playing";
    selectedBuilding=null;selectedTile=null;buildMode=null;attackMode=false;
    camera={x:0,y:0,zoom:.9};particles=[];projectiles=[];
    document.querySelectorAll("[data-build]").forEach(el=>el.classList.remove("active"));
    $("attackButton").classList.remove("command-primary");
    updateHud();updatePanels();
  }

  async function enterRealm(nickname){
    const btn=$("joinButton"),status=$("loginStatus");
    btn.disabled=true;btn.querySelector("span").textContent="در حال آماده‌سازی...";
    status.textContent="در حال اتصال به قلمرو و بررسی ذخیره...";
    let remoteSave=null;
    let token=API.getToken();
    const sameGuest=token&&API.getNickname()===nickname&&!token.startsWith("offline-");
    if(sameGuest){
      try{
        const loaded=await API.load();
        remoteSave=loaded.save_data&&loaded.save_data.version===1?loaded.save_data:null;
        onlineMode=true;
      }catch{
        API.clearSession();token=null;
      }
    }
    if(!API.getToken()||API.getNickname()!==nickname||!sameGuest){
      try{
        const joined=await API.join(nickname);
        onlineMode=true;
        status.textContent="نشست مهمان ساخته شد؛ خوش آمدی، "+nickname+".";
      }catch(error){
        onlineMode=false;
        API.setSession("offline-"+Date.now()+"-"+Math.random().toString(36).slice(2),nickname);
        status.textContent="اتصال ابری در دسترس نیست؛ بازی به‌صورت محلی شروع می‌شود.";
      }
    }
    if(!remoteSave){
      const local=API.getLocalSave();
      if(local&&local.version===1&&local.nickname===nickname&&local.state)remoteSave=local;
    }
    setGameState(remoteSave&&remoteSave.state?remoteSave.state:null);
    $("playerName").textContent=nickname;
    $("loginScreen").classList.add("is-hidden");
    $("gameShell").classList.remove("is-hidden");
    $("resultModal").classList.add("is-hidden");
    resize();lastFrame=0;
    if(!remoteSave)addLog("دژ مرکزی آماده است. نخستین مزرعه و خانه در اختیار توست.");
    updateHud();updatePanels();
    clearInterval(autosaveTimer);autosaveTimer=setInterval(()=>saveGame(false),25000);
    toast(onlineMode?"به دشت خاکستر خوش آمدی، فرمانده.":"حالت آفلاین فعال شد؛ پیشرفت روی دستگاه ذخیره می‌شود.");
    if(!raf)raf=requestAnimationFrame(frame);
    btn.disabled=false;btn.querySelector("span").textContent="ورود به قلمرو";
  }

  function leaveRealm(){
    saveGame(false).finally(()=>{
      clearInterval(autosaveTimer);state=null;onlineMode=false;
      $("gameShell").classList.add("is-hidden");$("loginScreen").classList.remove("is-hidden");
      $("nickname").value=API.getNickname()||"";lastFrame=0;
    });
  }
  function exportSave(){
    if(!state)return;
    const pack={version:1,nickname:API.getNickname()||"Guest",savedAt:new Date().toISOString(),state};
    const blob=new Blob([JSON.stringify(pack,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="ironvale-save.json";a.click();URL.revokeObjectURL(url);
    toast("فایل ذخیرهٔ قلمرو دریافت شد.");
  }
  function importSave(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const pack=JSON.parse(String(reader.result));
        const normalized=sanitizeState(pack.state);
        if(pack.version!==1||!normalized)throw new Error("invalid");
        setGameState(normalized);API.setLocalSave({version:1,nickname:API.getNickname(),savedAt:new Date().toISOString(),state});
        saveGame(false);toast("ذخیره با موفقیت بارگذاری شد.");
      }catch{toast("فایل ذخیره معتبر نیست یا نسخهٔ آن پشتیبانی نمی‌شود.",true);}
      $("importInput").value="";
    };
    reader.onerror=()=>toast("خواندن فایل ناموفق بود.",true);
    reader.readAsText(file);
  }

  function bindEvents(){
    $("joinForm").addEventListener("submit",e=>{
      e.preventDefault();
      const name=$("nickname").value.trim().replace(/\s+/g," ");
      if(name.length<2||name.length>18){$("loginStatus").textContent="نام باید بین ۲ تا ۱۸ نویسه باشد.";return;}
      enterRealm(name);
    });
    $("pauseButton").addEventListener("click",()=>togglePause());
    $("speedButton").addEventListener("click",()=>{
      if(!state||state.paused)return;
      state.speed=state.speed===1?2:state.speed===2?3:1;updateHud();sound(520);
    });
    $("saveButton").addEventListener("click",()=>saveGame(true));
    $("helpButton").addEventListener("click",()=>$("helpModal").classList.remove("is-hidden"));
    document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",()=>$("helpModal").classList.add("is-hidden")));
    $("attackButton").addEventListener("click",startAttackMode);
    $("recruitButton").addEventListener("click",recruit);
    $("tradeButton").addEventListener("click",trade);
    $("soundButton").addEventListener("click",()=>{
      soundEnabled=!soundEnabled;$("soundButton").textContent=soundEnabled?"♫":"♪";
      toast(soundEnabled?"صدای بازی روشن شد.":"صدای بازی خاموش شد.");
    });
    $("exportButton").addEventListener("click",exportSave);
    $("importInput").addEventListener("change",e=>importSave(e.target.files&&e.target.files[0]));
    $("exitButton").addEventListener("click",leaveRealm);
    $("restartButton").addEventListener("click",()=>{
      $("resultModal").classList.add("is-hidden");
      setGameState(newState());addLog("قلمرو تازه‌ای ساخته شد.");saveGame(false);
      toast("قلمرو جدید آماده است.");
    });
    document.querySelectorAll("[data-build]").forEach(el=>el.addEventListener("click",()=>setBuildMode(el.dataset.build)));
    $("selectionPanel").addEventListener("click",e=>{
      const btn=e.target.closest("[data-selection-action]");if(!btn)return;
      if(btn.dataset.selectionAction==="repair")repairSelected();
      if(btn.dataset.selectionAction==="upgrade")upgradeSelected();
    });
    canvas.addEventListener("pointerdown",e=>{
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      drag={x:e.clientX,y:e.clientY,startX:camera.x,startY:camera.y,moved:false,pointerId:e.pointerId};
      canvas.setPointerCapture(e.pointerId);pointer.x=x;pointer.y=y;
    });
    canvas.addEventListener("pointermove",e=>{
      const rect=canvas.getBoundingClientRect();
      pointer.x=e.clientX-rect.left;pointer.y=e.clientY-rect.top;
      pointer.tile=screenToTile(pointer.x,pointer.y);
      if(drag&&drag.pointerId===e.pointerId){
        const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
        if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;
        if(drag.moved){camera.x=drag.startX+dx;camera.y=drag.startY+dy;}
      }
      const tile=pointer.tile;
      $("coordValue").textContent=inMap(tile.x,tile.y)?"X "+fa(tile.x)+" · Y "+fa(tile.y):"X — · Y —";
    });
    canvas.addEventListener("pointerup",e=>{
      if(!drag)return;
      const moved=drag.moved;drag=null;
      if(!moved){const rect=canvas.getBoundingClientRect();handleWorldClick(screenToTile(e.clientX-rect.left,e.clientY-rect.top));}
    });
    canvas.addEventListener("pointercancel",()=>{drag=null;});
    canvas.addEventListener("wheel",e=>{
      e.preventDefault();
      camera.zoom=clamp(camera.zoom+(e.deltaY<0?.07:-.07),.62,1.42);
    },{passive:false});
    window.addEventListener("keydown",e=>{
      if(e.target&&["INPUT","TEXTAREA"].includes(e.target.tagName))return;
      keys[e.code]=true;
      if(e.code==="Space"){e.preventDefault();if(state)togglePause();}
      if(e.code==="Escape"){
        buildMode=null;attackMode=false;setBuildButtons();$("attackButton").classList.remove("command-primary");
        if($("helpModal").classList.contains("is-hidden")){}else $("helpModal").classList.add("is-hidden");
      }
    });
    window.addEventListener("keyup",e=>{keys[e.code]=false;});
    window.addEventListener("blur",()=>{keys={};if(state&&state.status==="playing")togglePause(true);});
    document.addEventListener("visibilitychange",()=>{if(document.hidden&&state){saveGame(false);togglePause(true);}});
    window.addEventListener("resize",resize);
  }

  function boot(){
    bindEvents();
    const nick=API.getNickname();if(nick)$("nickname").value=nick;
    resize();
    if(!raf)raf=requestAnimationFrame(frame);
  }
  boot();
})();