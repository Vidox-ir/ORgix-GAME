const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8"
};
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secretBag = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretBag.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publishableBag = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const allowedKeys = [...Object.values(publishableBag), Deno.env.get("SUPABASE_ANON_KEY") ?? ""]
  .filter((v) => typeof v === "string" && v.length > 0);

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}
function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "نام مأمور را وارد کن.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 18 || !/^[\p{L}\p{N} _.-]+$/u.test(name)) {
    throw new ApiError(400, "نام باید ۲ تا ۱۸ نویسه و بدون علامت خاص باشد.");
  }
  return name;
}
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
}
function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw=""; for(const b of bytes)raw+=String.fromCharCode(b);
  return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
async function db(path: string, init: RequestInit = {}): Promise<any> {
  if(!PROJECT_URL||!serviceKey)throw new ApiError(503,"تنظیمات ذخیره‌سازی کامل نیست.");
  const res=await fetch(PROJECT_URL + "/rest/v1/" + path,{
    ...init,headers:{
      apikey:serviceKey,Authorization:"Bearer " + serviceKey,"Content-Type":"application/json",
      Prefer:"return=representation",...(init.headers??{})
    }
  });
  const body=await res.text();
  if(!res.ok){console.error("Borderwatch DB error",res.status,body.slice(0,400));throw new ApiError(503,"پایگاه داده موقتاً در دسترس نیست.");}
  if(!body)return null;try{return JSON.parse(body);}catch{return body;}
}
async function rateLimit(req:Request,action:string){
  const ip=req.headers.get("cf-connecting-ip")??req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
  const key=await sha256("borderwatch:"+action+":"+ip);
  const limits:Record<string,[number,number]>={join:[8,3600],load:[45,60],save:[15,60]};
  const [maxHits,windowSeconds]=limits[action]??[30,60];
  const allowed=await db("rpc/borderwatch_rate_limit",{method:"POST",body:JSON.stringify({p_key:key,p_max_hits:maxHits,p_window_seconds:windowSeconds})});
  if(allowed!==true)throw new ApiError(429,"درخواست‌های زیادی فرستاده شد؛ کمی بعد دوباره تلاش کن.");
}
async function authenticate(token:unknown):Promise<string>{
  if(typeof token!=="string"||token.length<32||token.length>100)throw new ApiError(401,"نشست مهمان معتبر نیست.");
  const hash=await sha256(token),now=encodeURIComponent(new Date().toISOString());
  const rows=await db("borderwatch_sessions?token_hash=eq."+hash+"&expires_at=gt."+now+"&select=id,player_id",{method:"GET"});
  if(!Array.isArray(rows)||rows.length!==1)throw new ApiError(401,"نشست منقضی شده است؛ دوباره با نامت وارد شو.");
  const session=rows[0],expiry=new Date(Date.now()+90*24*60*60*1000).toISOString();
  await db("borderwatch_sessions?id=eq."+session.id,{method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString(),expires_at:expiry}),headers:{Prefer:"return=minimal"}});
  return session.player_id as string;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return reply(405,{error:"روش درخواست پشتیبانی نمی‌شود."});
  try{
    if(!allowedKeys.includes(req.headers.get("apikey")??""))throw new ApiError(401,"کلید عمومی معتبر نیست.");
    const raw=await req.text();if(raw.length>70000)throw new ApiError(413,"حجم درخواست بیش از حد مجاز است.");
    let payload:any;try{payload=JSON.parse(raw);}catch{throw new ApiError(400,"درخواست نامعتبر است.");}
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new ApiError(400,"ساختار درخواست نامعتبر است.");
    const action=payload.action;if(!["join","load","save"].includes(action))throw new ApiError(400,"عملیات ناشناخته است.");
    await rateLimit(req,action);
    if(action==="join"){
      const nickname=cleanName(payload.nickname),token=makeToken(),hash=await sha256(token);
      const players=await db("borderwatch_players?select=id,nickname",{method:"POST",body:JSON.stringify({nickname})});
      if(!Array.isArray(players)||players.length!==1)throw new ApiError(503,"ساخت پروفایل مهمان انجام نشد.");
      const player=players[0];
      try{
        await db("borderwatch_sessions",{method:"POST",body:JSON.stringify({player_id:player.id,token_hash:hash,expires_at:new Date(Date.now()+90*24*60*60*1000).toISOString()})});
      }catch(error){
        await db("borderwatch_players?id=eq."+player.id,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>null);
        throw error;
      }
      return reply(200,{ok:true,token,player:{id:player.id,nickname:player.nickname}});
    }
    const playerId=await authenticate(payload.token);
    if(action==="load"){
      const rows=await db("borderwatch_players?id=eq."+playerId+"&select=id,nickname,save_data,updated_at",{method:"GET"});
      if(!Array.isArray(rows)||rows.length!==1)throw new ApiError(404,"پروندهٔ ذخیره‌شده‌ای پیدا نشد.");
      return reply(200,{ok:true,player:{id:rows[0].id,nickname:rows[0].nickname},save_data:rows[0].save_data,updated_at:rows[0].updated_at});
    }
    const data=payload.save_data;
    if(!data||typeof data!=="object"||Array.isArray(data)||data.version!==1)throw new ApiError(400,"ساختار پروندهٔ ذخیره معتبر نیست.");
    if(JSON.stringify(data).length>55000)throw new ApiError(413,"حجم پرونده بیش از حد مجاز است.");
    const savedAt=new Date().toISOString();
    await db("borderwatch_players?id=eq."+playerId,{method:"PATCH",body:JSON.stringify({save_data:data,updated_at:savedAt}),headers:{Prefer:"return=minimal"}});
    return reply(200,{ok:true,saved_at:savedAt});
  }catch(error){
    if(error instanceof ApiError)return reply(error.status,{error:error.message});
    console.error("Borderwatch guest API failure",error);
    return reply(500,{error:"خطای داخلی سرویس مهمان رخ داد."});
  }
});