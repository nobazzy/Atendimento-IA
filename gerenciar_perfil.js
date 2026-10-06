const readline = require('readline');
const db = require('./db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showMenu() {
    console.log("\n========================================================");
    console.log("🛠️ GERENCIADOR COMPLETO DO BANCO DE DADOS (SQLITE)");
    console.log("========================================================");
    console.log("1. Ver perfil do Administrador");
    console.log("2. Adicionar/Atualizar informação do perfil");
    console.log("3. Ver memórias de longo prazo");
    console.log("4. Adicionar nova memória/fato");
    console.log("5. Ver lista de contatos cadastrados");
    console.log("6. Cadastrar/Editar contato no SQLite");
    console.log("7. Ver automações / mensagens agendadas");
    console.log("8. Cadastrar nova automação (ex: Bom Dia às 08:00)");
    console.log("9. Gerar Backup manual do Banco SQLite");
    console.log("10. Sair");
    console.log("========================================================");
    rl.question("Escolha uma opção (1-10): ", handleMenu);
}

function handleMenu(option) {
    switch (option.trim()) {
        case '1':
            console.log("\n📋 PERFIL ATUAL DO ADMINISTRADOR:");
            const profile = db.getProfileData();
            for (const [k, v] of Object.entries(profile)) {
                console.log(`- ${k}: ${v}`);
            }
            showMenu();
            break;
        case '2':
            rl.question("\nNome da chave (ex: profissao, cidade, hobby): ", (key) => {
                if (!key) { showMenu(); return; }
                rl.question(`Valor para '${key}': `, (value) => {
                    if (value) {
                        db.setProfileValue(key.trim().toLowerCase(), value.trim());
                        console.log(`✅ '${key}' atualizado para '${value}' com sucesso!`);
                    }
                    showMenu();
                });
            });
            break;
        case '3':
            console.log("\n🧠 MEMÓRIAS SALVAS:");
            const memories = db.getMemories();
            if (memories.length === 0) {
                console.log("(Nenhuma memória cadastrada ainda)");
            } else {
                memories.forEach(m => console.log(`- [${m.category}]: ${m.fact}`));
            }
            showMenu();
            break;
        case '4':
            rl.question("\nCategoria da memória (ex: preferencia, projeto, fato): ", (cat) => {
                rl.question("Descreva a memória/fato: ", (fact) => {
                    if (fact) {
                        db.addMemory(cat.trim() || 'geral', fact.trim());
                        console.log("✅ Nova memória salva no banco de dados!");
                    }
                    showMenu();
                });
            });
            break;
        case '5':
            console.log("\n📇 CONTATOS CADASTRADOS:");
            const contacts = db.getAllContacts();
            if (contacts.length === 0) {
                console.log("(Nenhum contato cadastrado ainda)");
            } else {
                contacts.forEach(c => {
                    console.log(`- [${c.name}] (${c.relationship}) - JID: ${c.jid} | Notas: ${c.notes || 'Nenhuma'}`);
                });
            }
            showMenu();
            break;
        case '6':
            rl.question("\nNúmero/JID do Contato (ex: 5511999998888@c.us): ", (jid) => {
                if (!jid) { showMenu(); return; }
                const formattedJid = jid.includes('@') ? jid.trim() : `${jid.trim()}@c.us`;
                rl.question("Nome do Contato (ex: Lucas, Mãe, Cliente João): ", (name) => {
                    rl.question("Relação (ex: Amigo, Cliente, Família): ", (rel) => {
                        rl.question("Notas/Instruções especiais (ex: Tratar com formalidade): ", (notes) => {
                            db.saveContact(formattedJid, name.trim(), rel.trim() || 'Contato', notes.trim());
                            console.log(`✅ Contato '${name}' salvo no banco SQLite!`);
                            showMenu();
                        });
                    });
                });
            });
            break;
        case '7':
            console.log("\n⏰ AUTOMAÇÕES E DISPAROS AGENDADOS:");
            const automations = db.getAllAutomations();
            if (automations.length === 0) {
                console.log("(Nenhuma automação cadastrada ainda)");
            } else {
                automations.forEach(a => {
                    console.log(`- ID: ${a.id} | Contato: ${a.contact_jid} | Tipo: ${a.type} | Horário: ${a.time} | Ativo: ${a.active ? 'SIM' : 'NÃO'} | Último Disparo: ${a.last_run || 'Nunca'}`);
                });
            }
            showMenu();
            break;
        case '8':
            rl.question("\nNúmero/JID do Contato (ex: 5511999998888@c.us): ", (jid) => {
                if (!jid) { showMenu(); return; }
                const formattedJid = jid.includes('@') ? jid.trim() : `${jid.trim()}@c.us`;
                rl.question("Tipo de Automação (ex: bom_dia, lembrete): ", (type) => {
                    rl.question("Horário do disparo no formato HH:mm (ex: 08:00): ", (time) => {
                        rl.question("Template da mensagem (ou pressione Enter para o padrão): ", (tmpl) => {
                            db.saveAutomation(formattedJid, type.trim() || 'bom_dia', time.trim() || '08:00', tmpl.trim() || 'Bom dia! Desejo um excelente dia para você!');
                            console.log(`✅ Automação agendada para ${time} para o contato ${formattedJid}!`);
                            showMenu();
                        });
                    });
                });
            });
            break;
        case '9':
            console.log("\n💾 Gerando backup do banco de dados...");
            db.backupDatabase();
            console.log("✅ Backup salvo na pasta /backups!");
            showMenu();
            break;
        case '10':
            console.log("\n👋 Até logo!");
            rl.close();
            process.exit(0);
            break;
        default:
            console.log("Opção inválida!");
            showMenu();
            break;
    }
}

showMenu();
