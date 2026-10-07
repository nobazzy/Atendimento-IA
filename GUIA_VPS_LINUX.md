# 🚀 Como Rodar sua Central de Atendimento IA em uma VPS (Linux) 24 Horas por Dia

Este guia ensina como hospedar a sua IA em uma VPS (Virtual Private Server) para ela ficar funcionando **24 horas por dia, 7 dias por semana**, mesmo com o seu computador desligado.

---

## 💻 1. Requisitos Recomendados da VPS
* **Sistema:** Ubuntu 22.04 LTS ou Ubuntu 24.04 LTS (ou Debian 12).
* **Configuração Mínima:** 1 vCPU, 2 GB de Memória RAM e 20 GB SSD.
* **Provedores acessíveis:** Hetzner (~€4/mês), DigitalOcean (\$6/mês), Contabo (~€5/mês) ou AWS Lightsail.

---

## ⚡ Método 1: Instalação Automática via Script (Mais Rápido e Recomendado)

Ao se conectar na sua VPS via SSH, envie a pasta do projeto e execute:

```bash
# 1. Dê permissão de execução ao instalador
chmod +x instalar_vps.sh

# 2. Execute o instalador automático
./instalar_vps.sh
```

O script cuidará de tudo automaticamente:
1. Instala o Node.js v20 LTS;
2. Instala todas as bibliotecas necessárias para rodar o Chromium/WhatsApp no Linux;
3. Instala o gerenciador de processos PM2;
4. Inicia a aplicação e configura reinicialização automática caso a VPS seja reiniciada.

---

## 📱 2. Como Escanear o QR Code na VPS

Após a instalação, veja o QR Code diretamente no terminal digitando:

```bash
pm2 logs atendimento-ia
```

Aponte a câmera do seu celular no WhatsApp (Aparelhos Conectados ➔ Conectar um Aparelho) e faça a leitura do QR Code exibido no terminal.

---

## 🌐 3. Acessando o Painel de Controle Web

Abra o seu navegador e digite o endereço IP da sua VPS na porta 3000:

```text
http://SEU_IP_DA_VPS:3000
```

*(Exemplo: `http://198.51.100.45:3000`)*

---

## 🛠️ Comandos Úteis do PM2

| Comando | Descrição |
| :--- | :--- |
| `pm2 logs atendimento-ia` | Ver mensagens e conversas da IA em tempo real |
| `pm2 status` | Ver se a aplicação está online e quanto de memória está usando |
| `pm2 restart atendimento-ia` | Reiniciar a IA |
| `pm2 stop atendimento-ia` | Pausar a IA |

---

## 🐳 Método 2: Usando Docker (Opcional)

Se você prefere usar Docker:

```bash
docker compose up -d --build
```

O contêiner subirá e estará acessível em `http://SEU_IP_DA_VPS:3000`.
