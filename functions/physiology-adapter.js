import {createSession,applyCommand,values,forkFromCheckpoint} from './engine.js';
import {resolvePatient,simTime,mechanismSpecs} from './domains.js';
/** Working authored-response adapter. External backends must provide the same explicit ownership contract. */
export class AuthoredPhysiologyAdapter {
 constructor(){this.id='authored-simulation-models';this.owns=[];this.state=null;}
 initialise({scenario,seed=1}){this.state=createSession({...structuredClone(scenario),variation:scenario.variation?{...scenario.variation,seed}:undefined},'adapter',0);this.owns=[...new Set((scenario.models||[]).flatMap(m=>Object.keys(m.targets)))];return this.read(0);}
 apply(command,wall){if(!this.state)throw Error('Initialise the adapter first');this.state=applyCommand(this.state,command,wall);return this.read(wall);}
 advance(wall,id){return this.apply({id,type:'tick'},wall);}
 read(wall){return {model:this.id,observations:values(this.state,wall),mechanisms:Object.fromEntries(Object.entries(resolvePatient(this.state,simTime(this.state,wall))).filter(([k])=>k in mechanismSpecs)),owners:structuredClone(this.state.engine.patient.owners),seed:this.state.engine.session.seed};}
 serialise(){return structuredClone(this.state);}
 restore(snapshot){this.state=structuredClone(snapshot);return this.read(this.state.updatedAt);}
 fork(checkpoint,wall=0){const adapter=new AuthoredPhysiologyAdapter();adapter.state=forkFromCheckpoint(this.state,checkpoint,wall);adapter.owns=[...this.owns];return adapter;}
 supports(action){return ['start','pause','resume','tick','startEffect','stopEffect','mechanism','override','unpin','oxygen','ventilation'].includes(action.type);}
}
