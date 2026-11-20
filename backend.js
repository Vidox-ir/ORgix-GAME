(() => {
  "use strict";
  const PROJECT_URL = "https://bqrqdbienrldbozohxnc.supabase.co";
  const PUBLIC_KEY = "sb_publishable_Rwz2vELW_RXflKij2FkcyA_-IAYCT5q";
  const ENDPOINT = PROJECT_URL + "/functions/v1/ironvale-guest";
  const SESSION_KEY = "ironvale.guest.session.v1";
  const LOCAL_SAVE_KEY = "ironvale.local.save.v1";
  const NICK_KEY = "ironvale.guest.nickname.v1";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }
  async function call(payload) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": PUBLIC_KEY },
      body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد.");
    return data;
  }

  window.IronvaleAPI = {
    getToken() { return storageGet(SESSION_KEY); },
    getNickname() { return storageGet(NICK_KEY); },
    setSession(token, nickname) {
      storageSet(SESSION_KEY, token);
      storageSet(NICK_KEY, nickname);
    },
    clearSession() {
      storageRemove(SESSION_KEY);
      storageRemove(NICK_KEY);
    },
    getLocalSave() {
      try {
        const raw = storageGet(LOCAL_SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    setLocalSave(data) {
      try { return storageSet(LOCAL_SAVE_KEY, JSON.stringify(data)); }
      catch { return false; }
    },
    async join(nickname) {
      const result = await call({ action: "join", nickname });
      if (!result.token || !result.player) throw new Error("پاسخ سرور کامل نیست.");
      this.setSession(result.token, nickname);
      return result;
    },
    async load() {
      const token = this.getToken();
      if (!token) throw new Error("نشست مهمان پیدا نشد.");
      return call({ action: "load", token });
    },
    async save(saveData) {
      const token = this.getToken();
      if (!token) throw new Error("نشست مهمان پیدا نشد.");
      return call({ action: "save", token, save_data: saveData });
    }
  };
})();