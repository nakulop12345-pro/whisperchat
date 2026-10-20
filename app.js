(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEY_URL = "whisperchat_supabase_url";
  const KEY_PUBLIC = "whisperchat_supabase_key";
  let client = null, user = null, profile = null, signupMode = false, activePeer = null, activeConversation = null;
  let pollTimer = null, toastTimer = null, knownMessageIds = new Set(), latestMessages = [];
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const show = (id) => $(id).classList.remove("hidden");
  const hide = (id) => $(id).classList.add("hidden");
  function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3400); }
  function timeLabel(value) { return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(value)); }
  function initial(name) { return (name||"?").trim().charAt(0).toUpperCase() || "?"; }
  function canonical(a,b) { return a < b ? [a,b] : [b,a]; }
  function setView(name) { ["config-view","auth-view","chat-view"].forEach(id=>hide(id)); show(name); }
  async function connect(url,key) {
    if (!window.supabase) throw new Error("Could not load the Supabase library. Check your internet connection.");
    client = window.supabase.createClient(url,key);
    const {data,error}=await client.auth.getSession(); if(error) throw error;
    localStorage.setItem(KEY_URL,url); localStorage.setItem(KEY_PUBLIC,key);
    if(data.session) { user=data.session.user; await loadProfile(); } else setView("auth-view");
  }
  async function loadProfile() {
    let {data,error}=await client.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if(error) throw error;
    profile=data;
    // If email confirmation was enabled at signup, the browser had no authenticated
    // session to insert the profile. Create it now, after the user signs in.
    if(!profile) {
      const username=user.user_metadata?.username;
      if(username && /^[A-Za-z0-9_]{3,24}$/.test(username)) {
        const created=await client.from("profiles").insert({id:user.id,username}).select("*").single();
        if(created.error) throw created.error;
        profile=created.data;
      } else {
        setView("auth-view");
        toast("Profile missing. Please create a new account with a username.");
        return;
      }
    }
    $("my-name").textContent="@"+profile.username; $("my-avatar").textContent=initial(profile.username);
    setView("chat-view"); await loadConversations();
  }
  $("config-form").addEventListener("submit",async e=>{e.preventDefault();const url=$("project-url").value.trim().replace(/\/$/,"");const key=$("public-key").value.trim();try{await connect(url,key);toast("Connected to Supabase.");}catch(err){toast(err.message||"Could not connect.");}});
  $("switch-mode").addEventListener("click",()=>{signupMode=!signupMode;$("auth-heading").textContent=signupMode?"Create your account":"Welcome back";$("auth-subheading").textContent=signupMode?"Choose a username people can find.":"Sign in to your account.";$("auth-submit").textContent=signupMode?"Create account":"Sign in";$("switch-label").textContent=signupMode?"Already have an account?":"New to WhisperChat?";$("switch-mode").textContent=signupMode?"Sign in":"Create account";$("username-field").classList.toggle("hidden",!signupMode);$("username").required=signupMode;});
  $("auth-form").addEventListener("submit",async e=>{e.preventDefault();if(!client)return toast("Connect Supabase first.");const email=$("email").value.trim(),password=$("password").value,username=$("username").value.trim();
    if(signupMode&&!/^[A-Za-z0-9_]{3,24}$/.test(username))return toast("Username must be 3–24 letters, numbers, or underscores.");
    $("auth-submit").disabled=true;
    try { if(signupMode){const {data,error}=await client.auth.signUp({email,password,options:{data:{username}}});if(error)throw error;if(!data.user)throw new Error("Account was not created.");if(!data.session){toast("Account created. Confirm your email, then sign in with the same account.");signupMode=false;$("switch-mode").click();return;}user=data.user;const {error:profileError}=await client.from("profiles").insert({id:data.user.id,username});if(profileError)throw profileError;await loadProfile();}
    else {const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;await loadProfile();} }
    catch(err){toast(err.message||"Authentication failed.");}finally{$("auth-submit").disabled=false;}
  });
  $("sign-out").addEventListener("click",async()=>{if(client)await client.auth.signOut();user=null;profile=null;activePeer=null;activeConversation=null;clearInterval(pollTimer);setView("auth-view");});
  async function loadConversations() {
    if(!user)return;
    const {data:rows,error}=await client.from("conversations").select("id,user_a,user_b,created_at").or("user_a.eq."+user.id+",user_b.eq."+user.id).order("created_at",{ascending:false});
    if(error){toast(error.message);return;}
    const peerIds=(rows||[]).map(c=>c.user_a===user.id?c.user_b:c.user_a);
    let profilesById={};
    if(peerIds.length){const {data,error:pErr}=await client.from("profiles").select("id,username").in("id",peerIds);if(pErr){toast(pErr.message);return;}for(const p of (data||[]))profilesById[p.id]=p;}
    const list=$("conversation-list");list.innerHTML="";$("chat-count").textContent=String(rows.length);
    if(!rows.length){list.innerHTML='<p class="empty-note">No conversations yet. Search for a username to say hello.</p>';return;}
    for(const c of rows){const pid=c.user_a===user.id?c.user_b:c.user_a,p=profilesById[pid];if(!p)continue;
      const el=document.createElement("button");el.type="button";el.className="conversation-item"+(activeConversation===c.id?" selected":"");el.innerHTML='<div class="avatar">'+escapeHTML(initial(p.username))+'</div><div class="conversation-meta"><div class="conversation-top"><strong>@'+escapeHTML(p.username)+'</strong></div><div class="conversation-preview">Open conversation</div></div>';
      el.addEventListener("click",()=>openConversation(c,p));list.appendChild(el);
    }
  }
  $("filter-chats").addEventListener("input",()=>{const q=$("filter-chats").value.toLowerCase();document.querySelectorAll(".conversation-item").forEach(el=>el.classList.toggle("hidden",!el.textContent.toLowerCase().includes(q)));});
  $("find-user-form").addEventListener("submit",async e=>{e.preventDefault();const name=$("find-username").value.trim();$("find-result").textContent="Looking…";
    try{if(!/^[A-Za-z0-9_]{3,24}$/.test(name))throw new Error("Use 3–24 letters, numbers, or underscores.");const {data:peer,error}=await client.from("profiles").select("id,username").eq("username",name).maybeSingle();if(error)throw error;if(!peer)throw new Error("No account found with that exact username.");if(peer.id===user.id)throw new Error("That is your own username.");const [a,b]=canonical(user.id,peer.id);
      let {data:c,error:cErr}=await client.from("conversations").select("*").eq("user_a",a).eq("user_b",b).maybeSingle();if(cErr)throw cErr;
      if(!c){const created=await client.from("conversations").insert({user_a:a,user_b:b}).select("*").single();if(created.error){if(created.error.code==="23505"){const retry=await client.from("conversations").select("*").eq("user_a",a).eq("user_b",b).single();if(retry.error)throw retry.error;c=retry.data;}else throw created.error;}else c=created.data;}
      $("find-result").textContent="Opening @"+peer.username;await openConversation(c,peer);await loadConversations();
    }catch(err){$("find-result").textContent=err.message||"Could not find that user."; }
  });
  async function openConversation(c,p){activeConversation=c.id;activePeer=p;knownMessageIds=new Set();$("peer-name").textContent="@"+p.username;$("peer-avatar").textContent=initial(p.username);$("peer-status").textContent="WhisperChat member";hide("welcome-panel");show("active-chat");$("chat-view").classList.add("chat-open");await loadMessages();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(activeConversation)loadMessages(true);},4000);await markIncomingRead();}
  $("back-button").addEventListener("click",()=>{$("chat-view").classList.remove("chat-open");activeConversation=null;clearInterval(pollTimer);});
  $("refresh-chat").addEventListener("click",()=>loadMessages());
  async function loadMessages(quiet=false){if(!activeConversation)return;const {data,error}=await client.from("messages").select("*").eq("conversation_id",activeConversation).order("created_at",{ascending:true}).limit(250);if(error){if(!quiet)toast(error.message);return;}
    latestMessages=data||[];const box=$("messages");const oldScroll=box.scrollTop,nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;box.innerHTML="";
    if(!latestMessages.length){box.innerHTML='<p class="empty-note">Say hello and start the conversation.</p>';}
    for(const m of latestMessages){const mine=m.sender_id===user.id;const el=document.createElement("div");el.className="message"+(mine?" mine":"");const seen=mine&&m.read_at;el.innerHTML='<div class="bubble">'+escapeHTML(m.body)+'</div><div class="message-meta">'+timeLabel(m.created_at)+(mine?' · <span class="read-state">'+(seen?"Seen":"Sent")+'</span>':'')+'</div>';box.appendChild(el);
      if(!mine&&!knownMessageIds.has(m.id)){knownMessageIds.add(m.id);if(!quiet&&document.hidden&&Notification.permission==="granted")new Notification("WhisperChat · @"+activePeer.username,{body:m.body.slice(0,120)});}
    }
    if(nearBottom||!quiet)box.scrollTop=box.scrollHeight;await markIncomingRead();
  }
  async function markIncomingRead(){if(!activeConversation||!user)return;const ids=latestMessages.filter(m=>m.sender_id!==user.id&&!m.read_at).map(m=>m.id);if(!ids.length)return;const {error}=await client.from("messages").update({read_at:new Date().toISOString()}).in("id",ids);if(!error)latestMessages=latestMessages.map(m=>ids.includes(m.id)?{...m,read_at:new Date().toISOString()}:m);}
  $("message-form").addEventListener("submit",async e=>{e.preventDefault();if(!activeConversation)return;const input=$("message-text"),body=input.value.trim();if(!body)return;input.value="";input.style.height="auto";const {error}=await client.from("messages").insert({conversation_id:activeConversation,sender_id:user.id,body});if(error){input.value=body;toast(error.message);return;}await loadMessages();});
  $("message-text").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("message-form").requestSubmit();}});
  $("message-text").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,130)+"px";});
  $("notifications").addEventListener("click",async()=>{if(!("Notification"in window))return toast("This browser does not support notifications.");const result=await Notification.requestPermission();toast(result==="granted"?"Notifications enabled while this app is open.":"Notifications were not enabled.");});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activeConversation)loadMessages(true);});
  async function boot(){const url=localStorage.getItem(KEY_URL),key=localStorage.getItem(KEY_PUBLIC);if(!url||!key){setView("config-view");return;}try{await connect(url,key);}catch(err){localStorage.removeItem(KEY_URL);localStorage.removeItem(KEY_PUBLIC);setView("config-view");toast(err.message||"Please check your Supabase settings.");}}
  boot();
})();