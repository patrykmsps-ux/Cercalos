# Painel Cercal — Ocorrências via API no Render

## Arquitetura

```
[FusionDMS] ←── sacService.js (Node.js no Render)
                      ↓ salva
               data/ocorrencias.json
                      ↓ serve via HTTP
               api-server.js  :3000
                      ↑ consome (fetch)
              [painel.html — qualquer browser]
```

O servidor roda no Render, busca os dados do Fusion a cada 10 minutos
(usando o mesmo `fusion_cookie.txt` do seu bot no DisCloud ou no próprio
Render), e disponibiliza via API REST. O `painel.html` é um arquivo
estático que pode ser aberto de qualquer lugar.

---

## Estrutura de arquivos

```
cercal-painel/
├── api-server.js        ← servidor HTTP (ponto de entrada)
├── sacService.js        ← busca dados do Fusion e salva JSON
├── package.json
├── .env.example         ← copie como .env
├── fusion_cookie.txt    ← cookie do Fusion (gerado pelo bot ou manual)
├── data/
│   └── ocorrencias.json ← gerado automaticamente
└── painel.html          ← painel estático (hospedar onde quiser)
```

---

## Deploy no Render

### 1. Crie um repositório Git

```bash
git init
git add .
git commit -m "Initial commit"
# Suba no GitHub/GitLab
```

### 2. Crie um Web Service no Render

- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `node api-server.js`
- **Plan**: Free (ou Starter para sem sleep)

### 3. Configure as variáveis de ambiente no Render

| Variável     | Valor                  |
|--------------|------------------------|
| `API_TOKEN`  | `cercal2024` (troque!) |
| `INTERVALO`  | `10`                   |

### 4. Suba o fusion_cookie.txt

O arquivo `fusion_cookie.txt` precisa estar presente na raiz do projeto.
Opções:

**Opção A — Commitar o cookie inicial no Git** (mais simples):
```
PHPSESSID=xxxx; AWSALB=yyyy; AWSALBCORS=yyyy
```
O cookie será atualizado automaticamente pelo mecanismo de autoLogin
quando a sessão expirar (desde que `FUSION_USER` e `FUSION_PASS`
estejam definidos nas env vars do Render).

**Opção B — Usar Render Disk** (persistência entre deploys):
- Crie um Render Disk montado em `/data`
- Aponte `COOKIE_FILE` em `sacService.js` para `/data/fusion_cookie.txt`

**Opção C — Usar o mesmo servidor do bot no DisCloud**:
Se o bot já roda no DisCloud e gera o `fusion_cookie.txt`, você pode
fazer o API server rodar junto ao bot. Adicione ao `bot.js` do DisCloud:

```js
// No final do bot.js, após os requires
const sacService = require('./services/sacService'); // <- coloque sacService.js em services/

// Inicializa o servidor de painel
require('./api-server'); // <- coloque api-server.js na raiz
```

E adicione ao `discloud.config`:
```
PORTS=3000
```

---

## Uso do painel.html

1. Abra `painel.html` em qualquer browser (arquivo local ou hospedado).
2. Na tela de login, informe:
   - **Usuário**: `admin`
   - **Senha**: `cercal@2024`
   - **URL da API**: `https://seu-app.onrender.com`
3. A URL fica salva no localStorage do browser — não precisa digitar novamente.

### Hospedar o painel.html (para link compartilhável)

**Opção mais simples — GitHub Pages**:
```bash
# No mesmo repo, crie uma pasta docs/
cp painel.html docs/index.html
git push
# Ative GitHub Pages apontando para /docs
```

**Opção Netlify Drop** (sem Git):
- Acesse https://app.netlify.com/drop
- Arraste o arquivo `painel.html`
- Receba um link permanente

**Opção Render Static Site** (junto ao backend):
Sirva o `painel.html` diretamente pela rota `/` no `api-server.js`:
```js
// Adicionar em api-server.js
if (req.method === 'GET' && pathname === '/') {
  const html = fs.readFileSync(path.join(__dirname, 'painel.html'), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
  return;
}
```
Assim um único serviço serve tanto a API quanto o painel — 1 URL pública.

---

## API Endpoints

| Método | Rota              | Descrição                                    |
|--------|-------------------|----------------------------------------------|
| GET    | `/health`         | Healthcheck (Render usa pra manter vivo)     |
| GET    | `/api/ocorrencias`| Retorna JSON com todos os registros          |
| GET    | `/api/status`     | Status da última sincronização               |
| POST   | `/api/atualizar?token=<API_TOKEN>` | Força nova busca no Fusion |

### Exemplo de resposta `/api/ocorrencias`
```json
{
  "geradoEm": "2026-03-24T14:30:00.000Z",
  "total": 1523,
  "carregados": 1523,
  "rows": [
    {
      "t20_id": "4501",
      "t20_data_abertura": "2026-03-24 09:15:00",
      "t16_fantasia": "SUPERMERCADO MODELO",
      "t05_nome": "CARLOS SILVA",
      "t20_resumo": "Entrega não realizada",
      "t42_descricao": "CLIENTE AUSENTE",
      "t20_status": "ALOCADO",
      "t32_nf": "12345",
      ...
    }
  ]
}
```

---

## Atualização automática de cookie

O `sacService.js` lê o cookie do arquivo `fusion_cookie.txt` a cada
requisição. Para manter o cookie atualizado:

1. **Via bot Telegram**: use o comando `/chave PHPSESSID=xxx; AWSALB=yyy`
   — o `fusionService.js` salva o cookie no arquivo, que é compartilhado.

2. **Manualmente**: edite `fusion_cookie.txt` no servidor.

3. **AutoLogin** (opcional): adicione ao `sacService.js` uma chamada ao
   `autoLogin()` do `fusionService.js` quando detectar erro 401/403.
