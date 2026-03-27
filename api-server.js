/**
 * api-server.js — Servidor HTTP do Painel Cercal
 */
"use strict";
require("dotenv").config();
const http       = require("http");
const url        = require("url");
const path       = require("path");
const fs         = require("fs");
const sacService = require("./sacService");

const PORT        = parseInt(process.env.PORT)      || 8080;
const API_TOKEN   = process.env.API_TOKEN            || "cercal2024";
const ADMIN_PASS  = process.env.ADMIN_PASS           || "cercal@admin";
const INTERVALO   = parseInt(process.env.INTERVALO)  || 10;
const COOKIE_FILE = path.resolve(__dirname, "fusion_cookie.txt");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function json(res, status, obj) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function htmlRes(res, status, content) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(content);
}
function lerBody(req) {
  return new Promise(resolve => { let b = ""; req.on("data", c => b += c); req.on("end", () => resolve(b)); });
}
function parseForm(body) {
  const obj = {};
  for (const pair of body.split("&")) {
    const [k, v] = pair.split("=");
    if (k) obj[decodeURIComponent(k)] = decodeURIComponent((v||"").replace(/\+/g," "));
  }
  return obj;
}
function lerCookieAtual() {
  try { if (fs.existsSync(COOKIE_FILE)) return fs.readFileSync(COOKIE_FILE,"utf8").trim(); } catch(_) {}
  return "";
}

// Sessões admin em memória
const sessoes = new Set();
function criarSessao() {
  const t = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessoes.add(t);
  setTimeout(() => sessoes.delete(t), 4*60*60*1000);
  return t;
}
function sessaoValida(req) {
  const m = (req.headers.cookie||"").match(/admin_session=([^;]+)/);
  return m && sessoes.has(m[1]);
}

// Página admin
function pageAdmin(msg, tipo, cookieAtual, st) {
  const cor   = tipo==="ok"?"#2d7a3a":tipo==="err"?"#dc3545":"#7d4e00";
  const bgCor = tipo==="ok"?"#e8f5eb":tipo==="err"?"#fff5f5":"#fffbe6";
  const ult   = (st&&st.ultimaAtt) ? new Date(st.ultimaAtt).toLocaleString("pt-BR") : "Nunca";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — Cercal</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f4f6f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:white;border-radius:16px;padding:36px 40px;width:100%;max-width:560px;box-shadow:0 4px 24px rgba(0,0,0,.08)}.logo{text-align:center;margin-bottom:24px}.logo img{height:56px}h1{font-size:20px;font-weight:700;color:#1b4d24;text-align:center;margin-bottom:4px}.sub{font-size:13px;color:#6b7280;text-align:center;margin-bottom:28px}.sec{margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e2e6ea}.sec:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}.sec-title{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}label{display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}input[type=password],textarea{width:100%;padding:11px 14px;border:2px solid #e2e6ea;border-radius:10px;font-family:'Courier New',monospace;font-size:13px;outline:none;resize:vertical}input:focus,textarea:focus{border-color:#2d7a3a}.hint{font-size:11px;color:#9ca3af;margin-top:6px;line-height:1.6}.btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:12px;transition:all .2s}.btn-g{background:linear-gradient(135deg,#1b4d24,#4caf62);color:white;box-shadow:0 4px 12px rgba(45,122,58,.3)}.btn-o{background:linear-gradient(135deg,#c45e10,#ffa550);color:white;box-shadow:0 4px 12px rgba(240,124,42,.3)}.btn:hover{transform:translateY(-1px)}.msg{padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:20px;background:${bgCor};color:${cor};display:${msg?"block":"none"}}.sbox{background:#f4f6f9;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151}.srow{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e2e6ea}.srow:last-child{border-bottom:none}.slabel{color:#6b7280;font-size:12px}.cbox{font-family:'Courier New',monospace;font-size:11px;color:#6b7280;word-break:break-all;background:#f4f6f9;padding:10px;border-radius:8px;margin-top:8px;max-height:60px;overflow-y:auto}.back{text-align:center;margin-top:20px;font-size:13px}.back a{color:#2d7a3a;text-decoration:none;font-weight:600}</style>
</head><body><div class="card">
<div class="logo"><img src="/logo.png" alt="Cercal" onerror="this.style.display='none'"></div>
<h1>Área Administrativa</h1><div class="sub">Painel Cercal — Gestão de Ocorrências</div>
${msg?`<div class="msg">${msg}</div>`:""}
<div class="sec"><div class="sec-title">Status da Sincronização</div>
<div class="sbox">
<div class="srow"><span class="slabel">Última atualização</span><span>${ult}</span></div>
<div class="srow"><span class="slabel">Total de registros</span><span>${((st&&st.ultimoTotal)||0).toLocaleString("pt-BR")}</span></div>
<div class="srow"><span class="slabel">Em andamento</span><span>${(st&&st.emAndamento)?"⏳ Sim":"✅ Não"}</span></div>
<div class="srow"><span class="slabel">Intervalo automático</span><span>${INTERVALO} minutos</span></div>
</div></div>
<div class="sec"><div class="sec-title">Forçar Atualização dos Dados</div>
<form method="POST" action="/admin/atualizar">
<label>Senha Admin</label><input type="password" name="senha" placeholder="Senha de administrador" required>
<button type="submit" class="btn btn-o">⚡ Forçar Atualização Agora</button>
</form></div>
<div class="sec"><div class="sec-title">Atualizar Cookie do FusionDMS</div>
<form method="POST" action="/admin/cookie">
<label>Senha Admin</label><input type="password" name="senha" placeholder="Senha de administrador" required style="margin-bottom:14px">
<label>Novo Cookie</label>
<textarea name="cookie" rows="3" placeholder="PHPSESSID=xxxx; AWSALB=yyyy; AWSALBCORS=yyyy" required></textarea>
<div class="hint">Como pegar o cookie:<br>1. Acesse fusiondms.com.br e faça login<br>2. F12 → aba "Application" → "Cookies"<br>3. Copie <strong>PHPSESSID</strong> e <strong>AWSALB</strong><br>4. Cole no formato: <code>PHPSESSID=xxx; AWSALB=yyy; AWSALBCORS=yyy</code></div>
<div class="sec-title" style="margin-top:14px">Cookie atual no servidor</div>
<div class="cbox">${cookieAtual?cookieAtual.replace(/</g,"&lt;"):"Nenhum cookie salvo"}</div>
<button type="submit" class="btn btn-g" style="margin-top:14px">💾 Salvar Cookie</button>
</form></div>
<div class="back"><a href="/">← Voltar ao Painel</a></div>
</div></body></html>`;
}

function pageAdminLogin(erro) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login — Cercal</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#1b4d24,#2d7a3a);min-height:100vh;display:flex;align-items:center;justify-content:center}.card{background:white;border-radius:16px;padding:40px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,.2)}h1{font-size:18px;font-weight:700;color:#1b4d24;text-align:center;margin-bottom:6px}.sub{font-size:13px;color:#6b7280;text-align:center;margin-bottom:28px}label{display:block;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}input{width:100%;padding:12px 14px;border:2px solid #e2e6ea;border-radius:10px;font-size:14px;outline:none}input:focus{border-color:#2d7a3a}.btn{width:100%;padding:13px;background:linear-gradient(135deg,#1b4d24,#4caf62);color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:16px}.err{color:#dc3545;font-size:13px;text-align:center;margin-top:12px;font-weight:500}.back{text-align:center;margin-top:16px;font-size:13px}.back a{color:#2d7a3a;text-decoration:none;font-weight:600}</style>
</head><body><div class="card">
<h1>🔐 Área Administrativa</h1><div class="sub">Cercal Distribuidora</div>
<form method="POST" action="/admin/login">
<label>Senha</label><input type="password" name="senha" placeholder="Senha de administrador" autofocus required>
<button type="submit" class="btn">Entrar</button>
${erro?`<div class="err">Senha incorreta.</div>`:""}
</form>
<div class="back"><a href="/">← Voltar ao Painel</a></div>
</div></body></html>`;
}

// Roteador
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/,"") || "/";

  if (req.method === "OPTIONS") { setCors(res); res.writeHead(204); res.end(); return; }

  // GET / → painel
  if (req.method === "GET" && (pathname==="/"||pathname==="/painel")) {
    try {
      const content = fs.readFileSync(path.join(__dirname,"painel.html"),"utf8");
      setCors(res); res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"}); res.end(content);
    } catch(e) { json(res,500,{erro:"painel.html não encontrado."}); }
    return;
  }

  // GET /admin
  if (req.method==="GET" && pathname==="/admin") {
    if (!sessaoValida(req)) { htmlRes(res,200,pageAdminLogin(false)); return; }
    htmlRes(res,200,pageAdmin("","",lerCookieAtual(),sacService.getStatus()));
    return;
  }

  // POST /admin/login
  if (req.method==="POST" && pathname==="/admin/login") {
    const dados = parseForm(await lerBody(req));
    if (dados.senha===ADMIN_PASS) {
      const token = criarSessao();
      res.writeHead(302,{"Location":"/admin","Set-Cookie":`admin_session=${token};Path=/;HttpOnly;SameSite=Strict;Max-Age=14400`});
      res.end();
    } else { htmlRes(res,200,pageAdminLogin(true)); }
    return;
  }

  // POST /admin/cookie
  if (req.method==="POST" && pathname==="/admin/cookie") {
    const dados = parseForm(await lerBody(req));
    if (dados.senha!==ADMIN_PASS) { htmlRes(res,200,pageAdmin("❌ Senha incorreta.","err",lerCookieAtual(),sacService.getStatus())); return; }
    const novoCookie = (dados.cookie||"").trim();
    if (!novoCookie||!novoCookie.includes("PHPSESSID")) { htmlRes(res,200,pageAdmin("❌ Cookie inválido. Deve conter PHPSESSID.","err",lerCookieAtual(),sacService.getStatus())); return; }
    try {
      fs.writeFileSync(COOKIE_FILE,novoCookie,"utf8");
      console.log("[Admin] Cookie atualizado via página admin");
      htmlRes(res,200,pageAdmin("✅ Cookie salvo! A próxima sincronização usará o novo cookie.","ok",novoCookie,sacService.getStatus()));
    } catch(e) { htmlRes(res,200,pageAdmin(`❌ Erro: ${e.message}`,"err",lerCookieAtual(),sacService.getStatus())); }
    return;
  }

  // POST /admin/atualizar
  if (req.method==="POST" && pathname==="/admin/atualizar") {
    const dados = parseForm(await lerBody(req));
    if (dados.senha!==ADMIN_PASS) { htmlRes(res,200,pageAdmin("❌ Senha incorreta.","err",lerCookieAtual(),sacService.getStatus())); return; }
    sacService.atualizarOcorrencias({forcar:true}).then(r=>console.log("[Admin] Sync forçado:",r.msg));
    htmlRes(res,200,pageAdmin("⏳ Atualização iniciada! Os dados serão recarregados em breve.","warn",lerCookieAtual(),sacService.getStatus()));
    return;
  }

  // GET /health
  if (req.method==="GET" && pathname==="/health") { json(res,200,{status:"ok",ts:new Date().toISOString()}); return; }

  // GET /api/status
  if (req.method==="GET" && pathname==="/api/status") {
    const st = sacService.getStatus();
    json(res,200,{...st,proximaAtt:st.ultimaAtt?new Date(new Date(st.ultimaAtt).getTime()+INTERVALO*60000).toISOString():null,intervaloMin:INTERVALO});
    return;
  }

  // GET /api/ocorrencias
  if (req.method==="GET" && pathname==="/api/ocorrencias") {
    const dados = sacService.lerOcorrenciasLocal();
    if (!dados) { json(res,503,{erro:"Dados ainda não disponíveis. Aguarde a primeira sincronização."}); return; }
    json(res,200,dados); return;
  }

  // POST /api/atualizar
  if (req.method==="POST" && pathname==="/api/atualizar") {
    const auth = (req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
    const tok  = (parsed.query.token||"").trim();
    if (auth!==API_TOKEN&&tok!==API_TOKEN) { json(res,401,{erro:"Token inválido."}); return; }
    json(res,202,{msg:"Atualização iniciada."});
    sacService.atualizarOcorrencias({forcar:true}).then(r=>console.log("[API] Sync:",r.msg));
    return;
  }

  json(res,404,{erro:"Rota não encontrada."});
});

server.listen(PORT, async () => {
  console.log(`[Cercal] Porta ${PORT} | Painel: / | Admin: /admin | Intervalo: ${INTERVALO}min`);
  const r = await sacService.atualizarOcorrencias();
  console.log("[Cercal] Busca inicial:", r.msg);
  setInterval(async () => {
    const r = await sacService.atualizarOcorrencias();
    console.log(`[Cercal] Sync automático: ${r.msg}`);
  }, INTERVALO*60*1000);
});

server.on("error", err => { console.error("[Cercal]", err.message); process.exit(1); });
module.exports = server;
