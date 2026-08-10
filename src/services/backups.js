const fs = require('fs');
const path = require('path');
const config = require('../config');
const { addAuditLog } = require('./audit');

function backupDatabase(user = 'Sistema') {
    try {
        if (!fs.existsSync(config.BACKUP_DIR)) {
            fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
        }
        const now = new Date();
        const dateStr = now.toISOString().replace(/:/g, '-').split('.')[0];
        const backupFile = path.join(config.BACKUP_DIR, `database_backup_${dateStr}.sqlite`);

        fs.copyFileSync(config.DB_PATH, backupFile);
        console.log(`[Backup] 💾 Backup gerado: ${path.basename(backupFile)}`);

        // Manter apenas 10 backups mais recentes
        const files = fs.readdirSync(config.BACKUP_DIR)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => ({ name: f, path: path.join(config.BACKUP_DIR, f), mtime: fs.statSync(path.join(config.BACKUP_DIR, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 10) {
            for (let i = 10; i < files.length; i++) {
                try { fs.unlinkSync(files[i].path); } catch (e) {}
            }
        }

        addAuditLog(user, 'Gerou Backup do SQLite', path.basename(backupFile), '🔵');
        return path.basename(backupFile);
    } catch (e) {
        console.error('⚠️ Erro ao criar backup do SQLite:', e.message);
        return null;
    }
}

function getBackupList() {
    try {
        if (!fs.existsSync(config.BACKUP_DIR)) return [];
        return fs.readdirSync(config.BACKUP_DIR)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => {
                const stat = fs.statSync(path.join(config.BACKUP_DIR, f));
                return {
                    name: f,
                    sizeBytes: stat.size,
                    created_at: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (e) {
        return [];
    }
}

module.exports = {
    backupDatabase,
    getBackupList
};
