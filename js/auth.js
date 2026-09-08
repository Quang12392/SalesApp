/* Trusted-device sessions shared by the page and its service worker. No passwords persisted. */
(function(root) {
  'use strict';
  // Release gate: set only after Worker + Apps Script configuration and live verification.
  const DEFAULT_GATEWAY_ORIGIN = 'https://salesapp-device-gateway.salesapp-backend.workers.dev';
  const GATEWAY_ENABLED = false;
  function authError(code, message, notSubmitted = true) { return Object.assign(new Error(message), {code,notSubmitted}); }
  function indexedStorage() {
    let pending;
    const open=()=>pending || (pending=new Promise((resolve,reject)=>{
      const r=root.indexedDB.open('khs_auth',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('sessions');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>{pending=null;reject(r.error);};
    }));
    const change=async value=>{
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
        if(value===null)store.delete('current');else store.put(value,'current');
        tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Không lưu được phiên trên thiết bị.'));
      });
    };
    return {save:change,clear:()=>change(null),load:async()=>{
      const db=await open();return new Promise((resolve,reject)=>{
        const r=db.transaction('sessions','readonly').objectStore('sessions').get('current');
        r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
      });
    }};
  }
  function createClient({gatewayOrigin='',storage,fetcher=root.fetch?.bind(root),legacyUrl=()=>root.localStorage?.getItem('khs_api_url')||'',clock=Date.now,onRequired=()=>{}}={}) {
    let origin='',access=null,refreshJob=null,epoch=0;
    if(gatewayOrigin) {
      const url=new URL(gatewayOrigin);
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port||!['','/'].includes(url.pathname))throw new Error('Invalid gateway origin');
      origin=url.origin;
    }
    storage=storage||indexedStorage();
    const enabled=!!origin;
    const load=async()=>{
      let s;try{s=await storage.load();}catch{throw authError('AUTH_STORAGE','Không đọc được phiên trên thiết bị. Đơn chưa được gửi.');}
      return s?.origin===origin?s:null;
    };
    const notify=()=>{try{onRequired();}catch(_){}};
    async function clearIfCurrent(token) {
      if((await load())?.refreshToken===token){epoch++;access=null;await storage.clear();notify();}
    }
    async function post(path,data,token,signal) {
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),65000);
      const abort=()=>controller.abort();
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
      try {return await fetcher(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
    }
    async function json(response) {
      try{return await response.json();}catch{throw authError('AUTH_NETWORK','Không đọc được phản hồi xác thực. Giữ nguyên dữ liệu thiết bị.');}
    }
    async function login(username,password,label='Thiết bị') {
      if(!enabled)throw authError('AUTH_DISABLED','Worker chưa được kích hoạt.');
      const currentEpoch=++epoch;
      const response=await post('/v1/auth/login',{username,password,label});
      const result=await json(response);
      if(!response.ok||result.success!==true)throw authError(result.code||'LOGIN_FAILED',result.error||'Không đăng nhập được.');
      if(!/^sr1_[a-f0-9]{32}\.[a-f0-9]{64}$/.test(result.refreshToken||'')||!result.accessToken||!result.user)throw authError('AUTH_NETWORK','Phản hồi đăng nhập không hợp lệ.');
      if(currentEpoch!==epoch)throw authError('AUTH_REQUIRED','Phiên đăng nhập đã thay đổi.');
      const saved={origin,refreshToken:result.refreshToken,sessionId:result.sessionId,user:result.user,refreshExpiresAt:result.refreshExpiresAt,legacyUrl:typeof legacyUrl==='function'?legacyUrl():legacyUrl};
      await storage.save(saved);access={token:result.accessToken,expires:result.accessExpiresAt,refreshToken:saved.refreshToken};
      return result.user;
    }
    async function token(force=false) {
      const stored=await load();
      if(!stored?.refreshToken){notify();throw authError('AUTH_REQUIRED','Vui lòng đăng nhập để xác nhận thiết bị này.');}
      if(!force&&access?.refreshToken===stored.refreshToken&&access.expires>clock()+60000)return access.token;
      if(refreshJob)return refreshJob;
      const currentEpoch=epoch;
      refreshJob=(async()=>{
        let response;
        try{response=await post('/v1/auth/refresh',{refreshToken:stored.refreshToken});}
        catch{throw authError('AUTH_NETWORK','Chưa kết nối được để gia hạn phiên. Không cần đổi mật khẩu; thử lại khi có mạng.');}
        const result=await json(response);
        if(response.status===401){await clearIfCurrent(stored.refreshToken);throw authError('AUTH_REQUIRED',result.error||'Thiết bị cần đăng nhập lại.');}
        if(!response.ok||!result.success||!result.accessToken)throw authError(result.code||'AUTH_NETWORK',result.error||'Chưa gia hạn được phiên. Thử lại sau.');
        const latest=await load();
        if(epoch!==currentEpoch||latest?.refreshToken!==stored.refreshToken)throw authError('AUTH_REQUIRED','Phiên trên thiết bị vừa thay đổi.');
        await storage.save({...stored,user:result.user||stored.user,refreshExpiresAt:result.refreshExpiresAt});
        access={token:result.accessToken,expires:result.accessExpiresAt,refreshToken:stored.refreshToken};
        return access.token;
      })();
      try{return await refreshJob;}finally{refreshJob=null;}
    }
    function waitForToken(promise,signal) {
      if(!signal)return promise;
      return new Promise((resolve,reject)=>{
        const abort=()=>reject(authError('AUTH_ABORTED','Đã dừng chờ xác thực; yêu cầu chưa được gửi.'));
        if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
        promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
      });
    }
    async function authorized(path,data,signal,expectedUsername) {
      let value=await waitForToken(token(),signal);
      const checkContext=async()=>{
        if(!expectedUsername)return;
        const current=await load(), sid=/^sa1_([a-f0-9]{32})\./.exec(value||'')?.[1];
        if(current?.user?.username!==expectedUsername||sid!==current.sessionId)throw authError('AUTH_CONTEXT_CHANGED','Tài khoản đã đổi ở tab khác. Tải lại trước khi gửi; giỏ vẫn được giữ.');
      };
      await checkContext();
      let response=await post(path,data,value,signal);
      if(response.status===401){
        const error=await json(response.clone());
        if(error.code==='ACCESS_EXPIRED'){
          access=null;value=await waitForToken(token(true),signal);await checkContext();response=await post(path,data,value,signal);
        }
        if(response.status===401){const s=await load();if(s)await clearIfCurrent(s.refreshToken);}
      }
      return response;
    }
    async function fetchApi(url,options={}) {
      if(!enabled)return fetcher(url,options);
      const parsed=new URL(String(url));
      const stored=await load();
      const expected=typeof legacyUrl==='function'?legacyUrl():legacyUrl;
      const base=new URL(expected||stored?.legacyUrl||'https://invalid.example');
      if(parsed.origin!==base.origin||parsed.pathname!==base.pathname)throw authError('API_ENDPOINT_MISMATCH','Không gửi phiên đăng nhập tới API khác.');
      let data;
      if((options.method||'GET').toUpperCase()==='GET')data=Object.fromEntries(parsed.searchParams);
      else {try{data=JSON.parse(options.body);}catch{throw authError('INVALID_INPUT','Payload API không hợp lệ.');}}
      if(!data?.action||data.action==='auth')throw authError('AUTH_REQUIRED','Dùng luồng đăng nhập an toàn.');
      return authorized('/v1/api',data,options.signal,data._authUsername||options.authUsername);
    }
    async function sessions(){const res=await authorized('/v1/auth/sessions',{});const data=await json(res);if(!res.ok||!data.success)throw authError(data.code||'AUTH_NETWORK',data.error||'Không tải được thiết bị.');return data.data;}
    async function revoke(sessionId){const res=await authorized('/v1/auth/revoke',{sessionId});const data=await json(res);if(!res.ok||!data.success)throw authError(data.code||'AUTH_NETWORK',data.error||'Không thu hồi được thiết bị.');if((await load())?.sessionId===sessionId){epoch++;access=null;await storage.clear();}return data;}
    async function logout(){
      const stored=await load();let revoked=false;
      if(!stored){epoch++;access=null;return {revoked:true};}
      try{const res=await authorized('/v1/auth/logout',{});revoked=res.ok&&(await json(res)).success===true;}
      catch(_){}
      finally{epoch++;access=null;if((await load())?.refreshToken===stored?.refreshToken)await storage.clear();}
      return {revoked};
    }
    return {enabled,origin,login,fetchApi,restore:load,token,sessions,revoke,logout};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={createClient};
  root.KHS_AUTH=createClient({gatewayOrigin:GATEWAY_ENABLED?DEFAULT_GATEWAY_ORIGIN:'',onRequired:()=>{
    if(root.document&&root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new CustomEvent('khs-auth-required'));
  }});
})(globalThis);
