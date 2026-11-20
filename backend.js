(() => {
  "use strict";
  const PROJECT_URL = "https://bqrqdbienrldbozohxnc.supabase.co";
  const PUBLIC_KEY = "sb_publishable_Rwz2vELW_RXflKij2FkcyA_-IAYCT5q";
  const ENDPOINT = PROJECT_URL + "/functions/v1/borderwatch-guest";
  const KEYS = {token:"borderwatch.session.v1",name:"borderwatch.name.v1",save:"borderwatch.save.v1"};
  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key,value) => { try { localStorage.setItem(key,value); return true; } catch { return false; } };
  const del = key => { try { localStorage.removeItem(key); } catch {} };

  async function call(payload) {
    const response = await fetch(ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":PUBLIC_KEY},
      body:JSON.stringify(payload)
    });
    let data={}; try { data=await response.json(); } catch {}
    if(!response.ok) { const error=new Error(data.error||"ارتباط با سرور انجام نشد."); error.status=response.status; throw error; }
    return data;
  }

  window.BorderSave = {
    token(){return get(KEYS.token);},
    name(){return get(KEYS.name);},
    setSession(token,name){set(KEYS.token,token);set(KEYS.name,name);},
    clearSession(){del(KEYS.token);del(KEYS.name);},
    local(){
      try { const raw=get(KEYS.save); return raw?JSON.parse(raw):null; } catch { return null; }
    },
    setLocal(data){try{return set(KEYS.save,JSON.stringify(data));}catch{return false;}},
    async join(name){
      const result=await call({action:"join",nickname:name});
      if(!result.token)throw new Error("پاسخ سرویس مهمان نامعتبر است.");
      this.setSession(result.token,name);return result;
    },
    async load(){const token=this.token();if(!token)throw new Error("نشست مهمان وجود ندارد.");return call({action:"load",token});},
    async save(saveData){const token=this.token();if(!token)throw new Error("نشست مهمان وجود ندارد.");return call({action:"save",token,save_data:saveData});}
  };
})();