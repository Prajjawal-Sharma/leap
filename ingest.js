const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const env = {};
lines.forEach(l => { const i = l.indexOf('='); if (i > 0) env[l.slice(0,i).trim()] = l.slice(i+1).trim(); });
fetch('http://localhost:3000/api/cron/ingest-jobs', {
  headers: { 'Authorization': 'Bearer ' + env.CRON_SECRET }
}).then(r => r.json()).then(d => console.log('Ingest done:', d.total_jobs_upserted, 'jobs')).catch(e => console.log('FAILED:', e.message));
