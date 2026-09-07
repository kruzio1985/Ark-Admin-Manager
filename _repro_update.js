// Reprodukuje bug servers:update ("reading 'name'")
const path = require('path');
const fs = require('fs');

(async () => {
  const src = path.join(__dirname, '_server_db_now.db');
  const tmp = path.join(__dirname, '_repro_test.db');
  fs.copyFileSync(src, tmp);

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const Database = require('./src/backend/database.js');
  const ConfigParser = require('./src/backend/config-parser.js');
  const ServerManager = require('./src/backend/server-manager.js');
  const RCON = require('./src/backend/rcon.js');

  const db = new Database(SQL, tmp);
  await db.init();
  const configParser = new ConfigParser(db);
  const rcon = new RCON(db);
  const serverManager = new ServerManager(db, null, rcon, configParser, 'D:\\');

  console.log('=== listServers before ===');
  const before = await serverManager.listServers();
  before.forEach(s => console.log(`id=${s.id} name=${s.name} port=${s.port} query=${s.query_port} rcon=${s.rcon_port}`));

  console.log('=== updateServer(1, {port:7850,...}) ===');
  try {
    const r = await serverManager.updateServer(1, { port: 7850, query_port: 27050, rcon_port: 32400 });
    console.log('RESULT:', JSON.stringify({ id: r.id, name: r.name, port: r.port, query: r.query_port, rcon: r.rcon_port }));
  } catch (e) {
    console.log('ERROR MESSAGE:', e.message);
    console.log('STACK:\n' + e.stack);
  }

  console.log('=== listServers after ===');
  const after = await serverManager.listServers();
  after.forEach(s => console.log(`id=${s.id} name=${s.name} port=${s.port} query=${s.query_port} rcon=${s.rcon_port}`));

  // cleanup
  try { fs.unlinkSync(tmp); } catch (_) {}
  process.exit(0);
})();
