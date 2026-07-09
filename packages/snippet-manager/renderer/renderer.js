const api=window.snippets;let items=[],selected;
const el=id=>document.getElementById(id);
async function load(){items=await api.list();render()}
function render(){const q=el("search").value.toLowerCase();el("list").innerHTML=items.filter(x=>(x.title+" "+x.tags.join(" ")).toLowerCase().includes(q)).map(x=>`<div class="item" data-id="${x.id}">${escape(x.title)}<small>${escape(x.language)} · ${escape(x.tags.join(", "))}</small></div>`).join("");document.querySelectorAll(".item").forEach(node=>node.onclick=()=>edit(items.find(x=>x.id===node.dataset.id)))}
function escape(v){const d=document.createElement("div");d.textContent=v;return d.innerHTML}
function edit(x){selected=x?.id;el("title").value=x?.title??"";el("language").value=x?.language??"";el("tags").value=x?.tags.join(", ")??"";el("code").value=x?.code??""}
el("new").onclick=()=>edit();el("search").oninput=render;
el("save").onclick=async()=>{await api.save({id:selected,title:el("title").value,language:el("language").value,code:el("code").value,tags:el("tags").value.split(",").map(x=>x.trim()).filter(Boolean)});edit();await load()};
el("delete").onclick=async()=>{if(selected&&confirm("Excluir este snippet?")){await api.remove(selected);edit();await load()}};
el("copy").onclick=()=>api.copy(el("code").value);load();
