const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("ql_token") || "";
let allLinks = [];
const api = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
function showApp(loggedIn) {
  $("login-panel").classList.toggle("hidden", loggedIn);
  $("app-content").classList.toggle("hidden", !loggedIn);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function shortUrl(slug) { return `${location.origin}/${slug}`; }
async function login(password) {
  const data = await fetch("/api/login", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})}).then(async r => {const d=await r.json();if(!r.ok)throw new Error(d.error||"Login failed");return d;});
  token = data.token; sessionStorage.setItem("ql_token", token); showApp(true); await refreshAll();
}
async function refreshAll() {
  try {
    const [linksData, analytics] = await Promise.all([api("/api/links"), api("/api/analytics")]);
    allLinks = linksData.links || [];
    $("total-clicks").textContent = Number(analytics.summary?.total_clicks || 0).toLocaleString();
    $("total-links").textContent = allLinks.length.toLocaleString();
    $("total-countries").textContent = Number(analytics.summary?.countries || 0).toLocaleString();
    $("device-count").textContent = (analytics.devices || []).length;
    renderChart(analytics.daily || []);
    renderLinks(allLinks.slice(0,5));
    renderInsights(analytics);
  } catch (e) {
    if (e.message === "Unauthorized") { token = ""; sessionStorage.removeItem("ql_token"); showApp(false); }
    else console.error(e);
  }
}
function renderChart(days) {
  const map = new Map(days.map(x => [x.day, Number(x.clicks)]));
  const max = Math.max(1, ...map.values());
  const arr = [];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);arr.push({day:key,clicks:map.get(key)||0});}
  $("chart").innerHTML = arr.map(x => `<div class="bar-col" title="${x.clicks} clicks"><div class="bar" style="height:${Math.max(2,x.clicks/max*100)}%"></div><small>${new Date(x.day+"T00:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"})}</small></div>`).join("");
}

function renderInsights(data) {
  const countries = data.countries || [];
  const devices = data.devices || [];
  $("country-list").innerHTML = countries.length ? countries.map(x => `<div class="insight-row"><span>${esc(x.name)}</span><b>${Number(x.clicks).toLocaleString()}</b></div>`).join("") : `<div class="empty">No country data yet.</div>`;
  $("device-list").innerHTML = devices.length ? devices.map(x => `<div class="insight-row"><span>${esc(x.name)}</span><b>${Number(x.clicks).toLocaleString()}</b></div>`).join("") : `<div class="empty">No device data yet.</div>`;
  const recent = data.recent || [];
  $("recent-clicks").innerHTML = recent.length ? `<div class="activity-row activity-head"><span>SHORT LINK</span><span>TIME</span><span>COUNTRY</span><span>DEVICE</span></div>` + recent.map(x => `<div class="activity-row"><span>${esc(x.slug)}</span><span>${new Date(x.clicked_at).toLocaleString()}</span><span>${esc(x.country)}</span><span>${esc(x.device)}</span></div>`).join("") : `<div class="empty" style="padding:18px">No clicks recorded yet.</div>`;
}
\nfunction renderLinks(links) {
  $("link-list").innerHTML = links.length ? links.map(l => `<div class="link-row">
    <div><div class="link-name">${esc(l.title || l.slug)}</div><div class="link-meta">${esc(l.slug)} · ${new Date(l.created_at).toLocaleDateString()}</div></div>
    <div class="link-url">${esc(l.original_url)}</div><div class="link-meta">${Number(l.clicks||0).toLocaleString()} clicks</div>
    <button class="copy-btn" data-copy="${esc(l.slug)}">Copy</button>
  </div>`).join("") : `<div class="empty" style="padding:25px">No links yet. Create your first short link above.</div>`;
}
$("login-form").addEventListener("submit", async e => {e.preventDefault();$("login-error").textContent="";try{await login($("password").value);}catch(err){$("login-error").textContent=err.message;}});
$("create-form").addEventListener("submit", async e => {
  e.preventDefault(); $("create-error").textContent=""; $("create-result").classList.add("hidden");
  const btn=e.submitter;btn.disabled=true;btn.textContent="Creating…";
  try {
    const data=await api("/api/links",{method:"POST",body:JSON.stringify({url:$("url").value,title:$("title").value,slug:$("alias").value})});
    $("create-result").innerHTML=`<b>Your short link is ready</b><br><a href="${esc(data.short_url)}" target="_blank" rel="noopener">${esc(data.short_url)}</a> <button class="copy-btn" id="copy-created">Copy link</button>`;
    $("create-result").classList.remove("hidden");$("create-form").reset();await refreshAll();
    $("copy-created").addEventListener("click",()=>copyText(data.short_url));
  } catch(err){$("create-error").textContent=err.message;}
  finally{btn.disabled=false;btn.innerHTML='Shorten link <b>↗</b>';}
});
async function copyText(text){try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement("textarea");t.value=text;document.body.append(t);t.select();document.execCommand("copy");t.remove();} }
document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){await copyText(shortUrl(copy.dataset.copy));const old=copy.textContent;copy.textContent="Copied!";setTimeout(()=>copy.textContent=old,1100);}
  const goto=e.target.closest("[data-goto]");
  if(goto){document.querySelector('[data-view="links"]').click();}
});
document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  const view=btn.dataset.view;$("page-title").textContent=view[0].toUpperCase()+view.slice(1);
  if(view==="links")renderLinks(allLinks);
  if(view==="analytics")refreshAll();
}));
$("refresh").addEventListener("click",refreshAll);
$("logout").addEventListener("click",()=>{token="";sessionStorage.removeItem("ql_token");showApp(false);});
if(token){showApp(true);refreshAll();}else showApp(false);
// Refresh dashboard metrics periodically while it is open.
setInterval(()=>{if(token&&!document.hidden)refreshAll();},30000);
