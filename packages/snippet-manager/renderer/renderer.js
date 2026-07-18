const api=window.snippets;let items=[],selected;
const el=id=>document.getElementById(id);
async function load(){items=await api.list();await render()}
async function render(){
  const q=el("search").value.trim();
  const filtered=q?await api.search({query:q}):items;
  el("list").innerHTML=filtered.map(x=>`<div class="item" data-id="${x.id}">${escape(x.title)}<small>${escape(x.language)}${x.category?" · "+escape(x.category):""} · ${escape(x.tags.join(", "))}</small></div>`).join("");
  document.querySelectorAll(".item").forEach(node=>node.onclick=()=>edit(items.find(x=>x.id===node.dataset.id)))
}
function escape(v){const d=document.createElement("div");d.textContent=v;return d.innerHTML}
function edit(x){selected=x?.id;el("title").value=x?.title??"";el("language").value=x?.language??"";el("category").value=x?.category??"";el("tags").value=x?.tags.join(", ")??"";el("code").value=x?.code??""}
el("new").onclick=()=>edit();el("search").oninput=render;
el("save").onclick=async()=>{await api.save({id:selected,title:el("title").value,language:el("language").value,category:el("category").value||undefined,code:el("code").value,tags:el("tags").value.split(",").map(x=>x.trim()).filter(Boolean)});edit();await load()};
el("delete").onclick=async()=>{if(selected&&confirm("Excluir este snippet?")){await api.remove(selected);edit();await load()}};
el("copy").onclick=()=>api.copy(el("code").value);

// Export / Import
el("export-json").onclick=()=>api.exportSnippets("json");
el("export-yaml").onclick=()=>api.exportSnippets("yaml");
el("import").onclick=async()=>{const count=await api.importSnippets();if(count)await load();};

// Sync
async function refreshSyncPath(){const path=await api.syncGetPath();el("sync-path").textContent=path||"Nenhuma"}
el("sync-choose").onclick=async()=>{await api.syncChoosePath();await refreshSyncPath()};
el("sync-now").onclick=async()=>{await api.syncNow();await refreshSyncPath();await load()};

// Version history
el("history").onclick=async()=>{
  if(!selected){alert("Selecione um snippet salvo primeiro.");return}
  const versions=await api.historyList(selected);
  el("history-list").innerHTML=versions.map(v=>`<li data-id="${v.id}">${new Date(v.savedAt).toLocaleString()}</li>`).join("")||"<li>Sem histórico ainda</li>";
  el("history-diff").innerHTML="";
  document.querySelectorAll("#history-list li[data-id]").forEach(node=>node.onclick=async()=>{
    document.querySelectorAll("#history-list li").forEach(n=>n.classList.remove("active"));
    node.classList.add("active");
    const diff=await api.historyDiff(node.dataset.id,selected);
    el("history-diff").innerHTML=diff.map(d=>`<span class="diff-${d.type}">${d.type==="added"?"+ ":d.type==="removed"?"- ":"  "}${escape(d.text)}</span>`).join("\n");
  });
  el("history-modal").classList.remove("hidden");
};
el("history-close").onclick=()=>el("history-modal").classList.add("hidden");

refreshSyncPath();load();
