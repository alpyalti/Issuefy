// Disposable CSS-only fixture. No application APIs, credentials or providers.
const http = require('node:http');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../..');
http.createServer((req,res)=>{
 if(['/app/globals.css','/app/landing.css','/app/dashboard.css'].includes(req.url)){res.setHeader('Content-Type','text/css');return res.end(readFileSync(root+req.url));}
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><html><head><link rel="stylesheet" href="/app/globals.css"><link rel="stylesheet" href="/app/landing.css"><link rel="stylesheet" href="/app/dashboard.css"></head><body class="landing"><h1>Disposable hover and pricing contrast fixture</h1><button onclick="location.reload()">Reset observations</button><div id="target" class="tier" style="position:absolute;left:100px;top:140px;width:300px;height:100px;padding:10px"><p class="tier-desc">Pricing description</p><p class="tier-bill">Billed annually</p><p class="tier-trial">Card required</p></div><pre id="result" style="position:absolute;top:270px"></pre><script>
const target=document.getElementById('target'), result=document.getElementById('result');
let enters=0,leaves=0,samples=0,minBottom=Infinity,maxBottom=-Infinity,started=Date.now();
target.addEventListener('pointerenter',()=>enters++);target.addEventListener('pointerleave',()=>leaves++);
setInterval(()=>{const r=target.getBoundingClientRect();samples++;minBottom=Math.min(minBottom,r.bottom);maxBottom=Math.max(maxBottom,r.bottom);result.textContent=JSON.stringify({elapsedMs:Date.now()-started,enters,leaves,samples,minBottom,maxBottom,hover:target.matches(':hover'),transform:getComputedStyle(target).transform},null,2);},50);
</script></body></html>`);
}).listen(4317,'127.0.0.1',()=>console.log('Disposable fixture http://127.0.0.1:4317'));
