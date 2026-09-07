const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('_server_db.db'));
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('TABELE:', (tables[0] ? tables[0].values : []).map(r => r[0]).join(', '));
  const servers = db.exec('SELECT id, name, game_type, map_name, port, query_port, rcon_port, install_path, status FROM servers');
  console.log('SERWERY:', JSON.stringify(servers[0] ? servers[0].values : null));
  const cfg = db.exec('SELECT server_id FROM server_config');
  console.log('CONFIG_RECORDS:', JSON.stringify(cfg[0] ? cfg[0].values : null));
});
