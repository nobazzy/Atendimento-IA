# 🚀 Como Rodar sua Central de Atendimento IA em uma VPS Dedicada (Linux 24/7)

Este guia ensina como hospedar a sua IA em uma VPS (Virtual Private Server) para ela operar **24 horas por dia, 7 dias por semana**, mesmo com o seu computador desligado, com total privacidade, segurança e persistência de dados.

---

## 🏛️ Arquitetura de Isolamento: Instalação Dedicada (Single-Tenant)

O sistema foi desenhado para **isolamento por infraestrutura**: cada empresa/cliente possui sua própria VPS dedicada.
* **Isolamento de Dados:** Cada cliente tem seu próprio banco SQLite (`database.sqlite`), seus próprios documentos RAG em (`uploads/rag`), sua própria sessão do WhatsApp (`.wwebjs_auth`) e seu próprio processo Node.js.
* **Segurança:** Não existe risco de vazamento cruzado de dados entre diferentes empresas em memória ou no disco, pois os ambientes não compartilham recursos.

---

## 💻 1. Requisitos Recomendados da VPS
* **Sistema Operacional:** Ubuntu 22.04 LTS ou Ubuntu 24.04 LTS (ou Debian 12).
* **Versão do Node.js:** **Node.js v22 LTS** (necessário para o suporte nativo ao módulo `node:sqlite`).
* **Configuração Mínima:** 1 vCPU, 2 GB de Memória RAM e 20 GB SSD.
* **Provedores acessíveis:** Hetzner (~€4/mês), DigitalOcean (\$6/mês), Contabo (~€5/mês) ou AWS Lightsail.

---

## ⚡ 2. Instalação Automática via Script (Recomendado)

Ao se conectar na sua VPS via SSH, clone ou envie a pasta do projeto e execute:

```bash
# 1. Dê permissão de execução ao instalador
chmod +x instalar_vps.sh

# 2. Execute o instalador automático
./instalar_vps.sh
```

O script executará toda a configuração de segurança automaticamente (Zero-Config Security):
1. Instala o **Node.js v22 LTS** e todas as bibliotecas necessárias para o Chromium/WhatsApp no Linux;
2. Configura o arquivo `.env` gerando automaticamente:
   * **`REQUIRE_AUTH=true`** (Painel e APIs 100% protegidos por padrão);
   * **`ADMIN_PASSWORD`** (Uma senha forte e aleatória exclusiva para a instalação);
   * **`JWT_SECRET`** (Chave criptográfica estável de 64 caracteres);
   * **`DISABLE_KILL_SWITCH=true`** (Impede desligamento acidental do processo);
3. Configura pastas persistentes para banco, WhatsApp, RAG e backups;
4. Inicia a aplicação com **PM2** configurando reinicialização automática em caso de reboot do servidor;
5. **Exibe as credenciais de acesso do administrador no final da instalação!**

---

## 💾 3. Persistência de Dados e Sessão

O sistema é configurado para persistir 100% dos dados essenciais:
* **Sessão do WhatsApp:** Salva em `.wwebjs_auth` (sobrevive a reboots sem pedir QR Code novamente).
* **Banco de Dados SQLite:** Salvo em `database.sqlite` (mensagens, contatos, automações e memória).
* **Base RAG de Conhecimento:** Salva em `uploads/rag` (PDFs, planilhas e documentos indexados).
* **Backups do Sistema:** Salvos em `backups/`.
* **Pausa Global:** O estado de pausa (`globalIsPaused`) é gravado no banco e preservado após reinícios.

---

## 🛡️ 4. Segurança da VPS e HTTPS Obrigatório

Para proteger o tráfego de rede e a porta 3000 em ambiente de produção:

### A) Configurar HTTPS com Caddy (Em 2 Minutos)
Não deixe o painel em HTTP puro na internet. O **Caddy** gera certificados SSL gratuitos da Let's Encrypt de forma automática:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy -y
```

Edite `/etc/caddy/Caddyfile`:
```caddy
seu-dominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```
Reinicie o Caddy:
```bash
sudo systemctl restart caddy
```

### B) Configurar Firewall Básico (UFW)
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Caddy)
sudo ufw allow 443/tcp   # HTTPS (Caddy)
sudo ufw enable
```

---

## 📱 5. Como Escanear o QR Code na VPS

Após a instalação, visualize o QR Code diretamente no terminal digitando:

```bash
pm2 logs atendimento-ia
```

Aponte a câmera do seu celular no WhatsApp (**Aparelhos Conectados ➔ Conectar um Aparelho**) e faça a leitura do QR Code exibido no terminal.

---

## 🛠️ Comandos Úteis do PM2

| Comando | Descrição |
| :--- | :--- |
| `pm2 logs atendimento-ia` | Ver mensagens e conversas da IA em tempo real |
| `pm2 status` | Ver status da aplicação, tempo online e uso de memória |
| `pm2 restart atendimento-ia` | Reiniciar a aplicação |
| `pm2 stop atendimento-ia` | Pausar o serviço |

---

## 🐳 Método Alternativo: Docker Compose

Se preferir rodar com Docker, o `docker-compose.yml` já vem configurado com todos os volumes persistentes:

```bash
docker compose up -d --build
```

Volumes montados automaticamente:
* `./data_auth:/app/.wwebjs_auth` (WhatsApp)
* `./database.sqlite:/app/database.sqlite` (Banco)
* `./uploads:/app/uploads` (Documentos RAG)
* `./backups:/app/backups` (Backups)
