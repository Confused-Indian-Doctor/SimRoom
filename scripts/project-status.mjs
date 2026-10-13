import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),project=process.argv[2];if(!project)throw Error('Project ID required');
const auth=require('firebase-tools/lib/auth');const options={project,nonInteractive:true};const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw Error('Run firebase login first');auth.setActiveAccount(options,account);await require('firebase-tools/lib/requireAuth').requireAuth(options,true);
const billing=await require('firebase-tools/lib/gcp/cloudbilling').checkBillingEnabled(project);console.log(JSON.stringify({project,billingEnabled:billing}));
