/**
 * CLI de Disparo e Integração: ProspectBR -> WhatsApp IA
 * Conecta diretamente ao servidor ativo da IA (http://localhost:3000)
 * para realizar envios pelo WhatsApp já autenticado.
 */
const readline = require('readline');

const SERVER_URL = 'http://localhost:3000';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    console.log(`======================================================================`);
    console.log(`   INTEGRACAO PROSPECTBR -> WHATSAPP IA (VENDA DIRETA KIWIFY)`);
    console.log(`======================================================================\n`);

    // 1. Verificar se o servidor da IA esta rodando na porta 3000
    let waStatus = null;
    try {
        const res = await fetch(`${SERVER_URL}/api/whatsapp/status`);
        if (res.ok) {
            waStatus = await res.json();
        }
    } catch (err) {
        console.error('❌ O servidor da sua IA (atendimento-ia) nao esta rodando!');
        console.log('👉 Por favor, execute primeiro o "iniciar_minha_ia.bat" e deixe a janela aberta.');
        console.log('   Depois, execute este disparador novamente.\n');
        rl.close();
        return;
    }

    if (!waStatus || !waStatus.connected) {
        console.error('⚠️ WhatsApp ainda nao esta conectado no servidor da IA!');
        console.log('👉 Abra http://localhost:3000 no navegador e escaneie o QR Code do WhatsApp.');
        console.log('   Assim que conectar, execute este disparador novamente.\n');
        rl.close();
        return;
    }

    console.log(`🟢 WhatsApp CONECTADO no numero: ${waStatus.number || 'Ativo'}!`);

    // 2. Buscar prospects da campanha Kiwify
    console.log('\n🔄 Buscando prospects da campanha Kiwify no ProspectBR...');
    let prospects = [];
    try {
        const res = await fetch(`${SERVER_URL}/api/prospectbr/prospects?campaign_id=6`);
        const data = await res.json();
        if (data.success && data.prospects) {
            prospects = data.prospects;
        } else {
            throw new Error(data.error || 'Falha ao buscar prospects');
        }
    } catch (err) {
        console.error('❌ Erro ao buscar prospects:', err.message);
        console.log('👉 Verifique se o Docker do ProspectBR esta rodando (http://localhost:8000).');
        rl.close();
        return;
    }

    console.log(`\n📋 Encontradas ${prospects.length} empresas na campanha Kiwify:\n`);
    prospects.forEach((p, idx) => {
        const statusBadge = p.status === 'CONTACTED' ? ' [JA CONTATADO]' : ' [PRONTO]';
        console.log(`  [${idx + 1}] ${p.nome_fantasia} (${p.municipio}/${p.uf}) - WhatsApp: ${p.whatsapp || 'SEM NUMERO'}${statusBadge}`);
    });

    console.log(`\nEscolha uma opcao:`);
    console.log(`[1] Disparar mensagem para 1 empresa especifica`);
    console.log(`[2] Disparar para TODAS as empresas da campanha (com intervalo seguro anti-ban)`);
    console.log(`[3] Enviar teste para um numero avulso`);
    console.log(`[4] Sair\n`);

    const option = (await ask('Digite a opcao (1, 2, 3 ou 4): ')).trim();

    if (option === '1') {
        const numStr = await ask(`Escolha o numero da empresa (1 a ${prospects.length}): `);
        const idx = parseInt(numStr) - 1;
        if (idx >= 0 && idx < prospects.length) {
            const target = prospects[idx];
            console.log(`\n🚀 Enviando abordagem comercial para ${target.nome_fantasia} (${target.whatsapp})...`);
            try {
                const res = await fetch(`${SERVER_URL}/api/prospectbr/send-single`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prospectId: target.id, variant: 'SHORT' })
                });
                const result = await res.json();
                if (result.success) {
                    console.log(`\n✅ MENSAGEM ENTREGUE COM SUCESSO!`);
                    console.log(`📱 Destinatario: ${result.company} (${result.whatsapp})`);
                    console.log(`📄 Conteudo enviado com o link da Kiwify:\n${result.content}\n`);
                    console.log(`🤖 Assim que o cliente responder no WhatsApp, a sua IA assumira a conversa automaticamente demonstrando o produto e ofertando o link!`);
                } else {
                    console.error(`❌ Erro no envio:`, result.error);
                }
            } catch (e) {
                console.error(`❌ Falha na requisicao:`, e.message);
            }
        } else {
            console.log('Opcao invalida.');
        }
    } else if (option === '2') {
        const confirm = await ask(`Deseja iniciar o envio para TODAS as empresas com intervalo seguro de 15 segundos? (S/N): `);
        if (confirm.toUpperCase() === 'S') {
            try {
                const res = await fetch(`${SERVER_URL}/api/prospectbr/batch/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignId: 6, variant: 'SHORT', delaySeconds: 15 })
                });
                const result = await res.json();
                if (result.success) {
                    console.log(`\n🚀 ${result.message}`);
                    console.log(`As mensagens estao sendo enviadas em segundo plano pelo servidor ativo.`);
                    console.log(`Acompanhe o log na janela do "iniciar_minha_ia.bat" ou no painel em http://localhost:3000.`);
                } else {
                    console.error(`❌ Erro:`, result.message || result.error);
                }
            } catch (e) {
                console.error(`❌ Erro de comunicacao:`, e.message);
            }
        }
    } else if (option === '3') {
        const customNumber = await ask(`Digite o numero com DDD (ex: 11999998888): `);
        let digits = customNumber.replace(/\D/g, '');
        if (!digits.startsWith('55') && digits.length >= 10) digits = '55' + digits;
        console.log(`Enviando mensagem de demonstracao para ${digits}...`);
        
        // Pega o primeiro prospect para usar o texto com link da Kiwify
        const sampleText = `Ola! Tudo bem? Percebi que voces usam o WhatsApp no atendimento comercial.\n\nDesenvolvemos um Atendente com Inteligencia Artificial pronto para WhatsApp que responde em 3 segundos, tira duvidas e agenda clientes 24h por dia!\n\nConfira todos os detalhes e garantia pela Kiwify no link:\n👉 https://pay.kiwify.com.br/gi1A6sQ\n\nResponda qualquer duvida por aqui que eu mesmo te respondo para voce ver na pratica!\nSe nao quiser receber mensagens, responda 'SAIR'.`;

        try {
            // Insere no banco e envia
            const res = await fetch(`${SERVER_URL}/api/prospectbr/send-single`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prospectId: prospects[0]?.id || 15, variant: 'SHORT' })
            });
            const result = await res.json();
            console.log(`✅ Disparo concluido.`);
        } catch (e) {
            console.error(`❌ Falha:`, e.message);
        }
    }

    rl.close();
}

if (require.main === module) {
    main();
}
