import { fetchGreenhouseJobs } from './src/lib/jobs/greenhouse.js';

const jobs = await fetchGreenhouseJobs('mongodb');
const target = jobs.find(j => j.title === 'Application Engineer');
if (!target) {
  console.log('Job not found, here are first 3 titles:', jobs.slice(0,3).map(j => j.title));
} else {
  console.log('First 200 chars of cleaned description:');
  console.log(target.description?.slice(0, 200));
  console.log('---');
  console.log('Has <p> in cleaned output:', target.description?.includes('<p>'));
}
