/**
 * sacService.js — Cercal Distribuidora
 * Busca ocorrências (SACs) do FusionDMS e salva em data/ocorrencias.json
 * Usa o mesmo cookie compartilhado com fusionService.js
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Configuração ──────────────────────────────────────────────
const FUSION_SAC_URL = "https://fusiondms.com.br/php/crm/sac/get_sacs_clientes.php";
const COOKIE_FILE    = path.resolve(__dirname, "fusion_cookie.txt");
const DATA_FILE      = path.resolve(__dirname, "data/ocorrencias.json");
const PAGE_SIZE      = 100;           // registros por página
const MAX_PAGES      = 200;           // limite de segurança (20.000 registros)
const HTTP_TIMEOUT   = 15_000;        // 15s por requisição

// AWSALB fixo — mesmo valor do fusionService
const AWSALB_FIXO =
  "NVrK670Kruqv5XQ7P8LWy2HLv1PbD2G47s8tGkjo6/oGReO0SNWCadN2DJYQj1aJvVXgxsq2RV58xYlw8+3ST9c4UMNUWnJd2khHksz9jg4B2dGib12qx4qPMA9T";
const PHPSESSID_FIXO = "ohhr7a1t5kfstpkc34iluupd75";
const COOKIE_FIXO    = `PHPSESSID=${PHPSESSID_FIXO}; AWSALB=${AWSALB_FIXO}; AWSALBCORS=${AWSALB_FIXO}`;

// ── Estado interno ────────────────────────────────────────────
let _emAndamento = false;
let _ultimaAtt   = null;   // Date da última atualização bem-sucedida
let _ultimoTotal = 0;

// ── Cookie ────────────────────────────────────────────────────
function lerCookie() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const c = fs.readFileSync(COOKIE_FILE, "utf8").trim();
      if (c) return c;
    }
  } catch (_) {}
  return COOKIE_FIXO;
}

// ── Garantir pasta data/ ──────────────────────────────────────
function garantirPasta() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Fetch de uma página ───────────────────────────────────────
async function fetchPagina(page, rows, cookie) {
  const url = `${FUSION_SAC_URL}?rows=${rows}&page=${page}&_=${Date.now()}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 Chrome/120 FusionPanel/1.0",
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[SAC] Página ${page} retornou HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[SAC] Erro na página ${page}:`, err.message);
    return null;
  }
}

// ── Busca completa ────────────────────────────────────────────
/**
 * Busca todos os registros do Fusion e salva em data/ocorrencias.json
 * @param {object} opts
 * @param {boolean} opts.forcar  — ignora trava _emAndamento
 * @returns {{ ok: boolean, total: number, msg: string }}
 */
async function atualizarOcorrencias(opts = {}) {
  if (_emAndamento && !opts.forcar) {
    return { ok: false, total: _ultimoTotal, msg: "Atualização já em andamento, aguarde." };
  }
  _emAndamento = true;

  try {
    const cookie = lerCookie();
    console.log(`[SAC] Iniciando busca — cookie: ${cookie.slice(0, 30)}...`);

    // Primeira página para descobrir o total
    const primeira = await fetchPagina(1, PAGE_SIZE, cookie);
    if (!primeira) {
      throw new Error("Não foi possível conectar ao FusionDMS (primeira página falhou).");
    }

    const totalReg   = parseInt(primeira.total) || 0;
    const totalPages = Math.min(Math.ceil(totalReg / PAGE_SIZE), MAX_PAGES);

    console.log(`[SAC] Total registros: ${totalReg} — ${totalPages} páginas`);

    // Coletar todas as páginas em paralelo (batches de 10 para não sobrecarregar)
    let rows = [];
    if (primeira.rows) rows.push(...primeira.rows);

    const BATCH = 10;
    for (let i = 2; i <= totalPages; i += BATCH) {
      const lote = [];
      for (let p = i; p < i + BATCH && p <= totalPages; p++) {
        lote.push(fetchPagina(p, PAGE_SIZE, cookie));
      }
      const resultados = await Promise.allSettled(lote);
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value?.rows) {
          rows.push(...r.value.rows);
        }
      }
      console.log(`[SAC] Carregados ${rows.length}/${totalReg}`);
    }

    garantirPasta();

    const payload = {
      geradoEm:    new Date().toISOString(),
      total:       totalReg,
      carregados:  rows.length,
      rows,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(payload), "utf8");

    _ultimaAtt   = new Date();
    _ultimoTotal = rows.length;

    console.log(`[SAC] ✅ Salvo ${rows.length} registros em ${DATA_FILE}`);
    return { ok: true, total: rows.length, msg: `${rows.length} ocorrências salvas.` };

  } catch (err) {
    console.error("[SAC] Erro:", err.message);
    return { ok: false, total: _ultimoTotal, msg: err.message };
  } finally {
    _emAndamento = false;
  }
}

// ── Leitura do arquivo local (para API HTTP) ──────────────────
function lerOcorrenciasLocal() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ── Status ────────────────────────────────────────────────────
function getStatus() {
  return {
    emAndamento: _emAndamento,
    ultimaAtt:   _ultimaAtt,
    ultimoTotal: _ultimoTotal,
    arquivoExiste: fs.existsSync(DATA_FILE),
  };
}

module.exports = { atualizarOcorrencias, lerOcorrenciasLocal, getStatus };
