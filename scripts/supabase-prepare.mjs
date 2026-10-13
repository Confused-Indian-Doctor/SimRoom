import fs from 'node:fs';
fs.copyFileSync('functions/engine.js','supabase/functions/_shared/engine.js');
fs.copyFileSync('functions/rules.js','supabase/functions/_shared/rules.js');
fs.copyFileSync('functions/rules.js','src/rules.js');
fs.copyFileSync('functions/engine.js','src/engine.js');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
let sql='begin;\n';for(const s of JSON.parse(fs.readFileSync('functions/content/scenarios.json','utf8'))){sql+=`insert into public.scenarios(id,data) values(${quote(s.id)},${quote(JSON.stringify(s))}::jsonb) on conflict(id) do nothing;\ninsert into public.scenario_versions(id,version,data) values(${quote(s.id)},${s.version},${quote(JSON.stringify(s))}::jsonb) on conflict(id,version) do nothing;\n`}
sql+=`insert into public.source_archive(id,data) values('originals',${quote(fs.readFileSync('functions/content/originals.json','utf8'))}::jsonb) on conflict(id) do nothing;\ncommit;\n`;
fs.writeFileSync('supabase/migrations/202610120002_source_cases.sql',sql);
fs.writeFileSync('supabase/setup.sql',fs.readFileSync('supabase/migrations/202610120001_core.sql','utf8')+'\n'+sql+'\n'+fs.readFileSync('supabase/migrations/202610130001_monitor_delivery.sql','utf8')+'\n'+fs.readFileSync('supabase/migrations/202610130002_pairing.sql','utf8')+'\n'+fs.readFileSync('supabase/migrations/202610130003_primary_claim.sql','utf8'));
console.log('Prepared shared engine and private clinical source migrations.');
