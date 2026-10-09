# 🚀 Como Rodar sua Central de Atendimento IA em uma VPS (Linux) 24 Horas por Dia

Este guia ensina como hospedar a sua IA em uma VPS (Virtual Private Server) para ela ficar funcionando **24 horas por dia, 7 dias por semana**, mesmo com o seu computador desligado, com total segurança e isolamento.

---

## 💻 1. Requisitos Recomendados da VPS
* **Sistema Operacional:** Ubuntu 22.04 LTS ou Ubuntu 24.04 LTS (ou Debian 12).
* **Versão do Node.js:** **Node.js v22 LTS** (necessário para o suporte nativo ao módulo `node:sqlite`).
* **Configuração Mínima:** 1 vCPU, 2 GB de Memória RAM e 20 GB SSD.
* **Provedores acessíveis:** Hetzner (~€4/mês), DigitalOcean (\$6/mês), Contabo (~€5/mês) ou AWS Lightsail.

---

## 🛡️ 2. Segurança e Boas Práticas Antes de Publicar

Para proteger os dados dos seus clientes e impedir acessos não autorizados:

1. **Defina uma Senha de Administrador:**
   No arquivo `.env`, preencha obrigatoriamente:
   ```env
   REQUIRE_AUTH=true
   ADMIN_PASSWORD=SuaSenhaForteAqui123!
   DISABLE_KILL_SWITCH=true
   ```
2. **Utilize HTTPS com Proxy Reverso (Caddy ou Nginx):**
   Não deixe o tráfego HTTP sem criptografia na porta 3000 pública. Instale o **Caddy** para gerar certificados SSL gratuitos automaticamente:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install caddy -y
   ```
   No `/etc/caddy/Caddyfile`:
   ```caddy
   seu-dominio.com.br {
       reverse_proxy 127.0.0.1:3000
   }
   ```

---

## ⚡ 3. Método 1: Instalação Automática via Script (Mais Rápido)

Ao se conectar na sua VPS via SSH, envie a pasta do projeto e execute:

```bash
# 1. Dê permissão de execução ao instalador
chmod +x instalar_vps.sh

# 2. Execute o instalador automático
./instalar_vps.sh
```

O script cuidará de tudo automaticamente:
1. Instala o **Node.js v22 LTS**;
2. Instala todas as bibliotecas do sistema necessárias para rodar o Chromium/WhatsApp no Linux;
3. Instala o gerenciador de processos **PM2**;
4. Inicia a aplicação e configura reinicialização automática em caso de reboot da VPS.

---

## 📱 4. Como Escanear o QR Code na VPS

Após a instalação, visualize o QR Code diretamente no terminal digitando:

```bash
pm2 logs atendimento-ia
```

Aponte a câmera do seu celular no WhatsApp (**Aparelhos Conectados ➔ Conectar um Aparelho**) e faça a leitura do QR Code exibido no terminal.

---

## 🌐 5. Acessando o Painel de Controle Web

Abra o seu navegador e acesse:

```text
http://SEU_IP_DA_VPS:3000
```
*(ou pelo seu domínio HTTPS configurado)*. Se a autenticação estiver ativada, digite a sua senha de administrador para desbloquear o painel.

---

## 🛠️ Comandos Úteis do PM2

| Comando | Descrição |
| :--- | :--- |
| `pm2 logs atendimento-ia` | Ver mensagens e conversas da IA em tempo real |
| `pm2 status` | Ver status da aplicação, tempo online e uso de memória |
| `pm2 restart atendimento-ia` | Reiniciar a IA |
| `pm2 stop atendimento-ia` | Pausar a IA |

---

## 🐳 Método 2: Usando Docker (Opcional)

Se preferir usar Docker com isolamento total em contêineres:

```bash
docker compose up -d --build
```

O serviço será iniciado com Node.js 22, persistência de banco e Chromium headless integrado.
