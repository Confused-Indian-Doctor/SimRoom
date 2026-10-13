import glob,zipfile,xml.etree.ElementTree as E,json,os,re
root=os.environ.get('SIMROOM_SOURCE_DIRECTORY','functions/content/source-documents')
docs={}
for p in glob.glob(root+'/*.docx')+glob.glob('attachments/**/*.docx',recursive=True):
 r=E.fromstring(zipfile.ZipFile(p).read('word/document.xml'))
 docs[os.path.basename(p)]='\n'.join(''.join(t.text or '' for t in n.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')) for n in r.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'))
json.dump(docs,open('functions/content/originals.json','w'),indent=2)
cases=[('stemi','Anterior STEMI','62-year-old man','Severe central chest discomfort for one hour, radiating to jaw and both arms, with nausea and diaphoresis.',[[18,95,96,156,88,37.2,'Room air'],[20,95,100,136,78,37.2,'Room air'],[28,84,120,116,76,37.2,'Room air'],[22,96,102,120,74,37.2,'On oxygen; flow unspecified']]),('ptx','Tension pneumothorax','23-year-old man','Abrupt left-sided pleuritic chest pain for two hours, pain 7/10 and shortness of breath.',[[20,93,100,123,80,36.2,'Room air'],[18,96,100,120,70,36.4,'Oxygen at 4 L/min'],[26,80,130,90,60,36.3,'Oxygen at 4 L/min'],[30,84,135,85,55,36.3,'Oxygen at 15 L/min']]),('pe','Pulmonary embolism','40-year-old woman','Collapse with palpitations and several days of increasing breathlessness.',[[22,92,110,120,80,37.2,'Room air'],[24,90,122,110,70,37.2,'Room air'],[32,86,135,85,55,37.2,'Room air'],[32,86,135,85,55,37.2,'Room air']])]
ptxactions=[['Introduce self and confirm patient identity','History and A-E completed','Oxygen started','Requests CXR','Requests ABG','Requests ECG'],['ABG interpreted','ECG interpreted','PTX included in differential','Analgesia/anti-emetic prescribed'],['Deterioration recognised','A-E repeated','2222 called','Need for immediate decompression recognised','CXR interpreted if available'],['Diagnosis offered','SBAR delivered','Supervised decompression completed']]
ptxfind=['Reduced left air entry and chest expansion','Temporarily stable sats on oxygen; lower sats branch if oxygen not given','Distress, right tracheal deviation and absent left breath sounds','Increasing instability and peri-arrest']
ptxcues=['Early differential and analgesia prompts','Lower sats branch requires review','Source describes possible oxygen response to 94% on 15 L/min; response unconfigured','Senior receives handover and supervises intervention. No recovery observations supplied.']
out=[]
for id,title,patient,brief,profiles in cases:
 source=next((v for k,v in docs.items() if {'stemi':'STEMI-sim-checklist','pe':'PE_SimChecklist','ptx':'PTX sim checklist'}[id] in k),'')
 history=next((v for k,v in docs.items() if {'stemi':'STEMI_PatientHx','pe':'PE_PatientHx','ptx':'PTx_PatientHx'}[id] in k),'')
 stages=[]
 for i,p in enumerate(profiles):
  if source:
   block=re.split(r'STAGE \d – ',source)[i+1]
   label=block.split('\n')[0]
   actions=block.split('Learner Actions\nFaculty Actions\n')[1].split('Sim Leader')[0].strip().split('\n')
   actions=[x.strip() for x in actions if x.strip()]
   findings=block.split('A-E: ')[1].split('\n')[0]
   cues='Sim Leader'+block.split('Sim Leader')[1].split('Transition trigger:')[0].strip()
   trigger=block.split('Transition trigger:')[1].split('\n')[0].strip()
  else:
   label=['A-E assessment','Differential and investigations','Deterioration and escalation','SBAR and intervention'][i];actions=ptxactions[i];findings=ptxfind[i];cues=ptxcues[i];trigger='Unset: original PTX checklist missing'
  stages.append({'id':str(i+1),'name':label,'observations':dict(zip(['rr','spo2','hr','sbp','dbp','temp'],p[:6])),'oxygen':p[6],'rhythm':None,'findings':findings,'cues':cues,'sourceTrigger':trigger,'transition':None,'actions':[{'id':f'{id}-{i+1}-{j}','text':a,'objective': 'assessment' if i==0 else 'interpretation' if i==1 else 'escalation' if i==2 else 'handover','response':None} for j,a in enumerate(actions)]})
 out.append({'id':id,'version':1,'title':title,'patient':patient,'briefing':brief,'history':history,'preparation':'20-minute simulation and 20-minute debrief. Prepare actor/mannequin, monitor and locally reviewed investigation assets. Equipment details need faculty review.','objectives':[{'id':'assessment','text':'Perform a structured history and A-E assessment'},{'id':'interpretation','text':'Interpret investigations and form a differential'},{'id':'escalation','text':'Recognise deterioration and escalate appropriately'},{'id':'handover','text':'Communicate diagnosis and plan using SBAR'}],'stages':stages,'investigations':[{'id':k,'name':n,'assetPath':None} for k,n in [('ecg','12-lead ECG'),('cxr','Chest X-ray'),('abg','ABG report')]],'review':['Rhythms, timers, transition combinations and treatment responses unset','No diagnostic investigation assets supplied']+(['PTX originals missing; all content from development brief'] if not source else ['Original documents preserved in private source archive']),'source': 'Development brief (originals missing)' if not source else 'Original source files: '+', '.join(k for k,v in docs.items() if v==source or v==history)})
out[1]['review']+=['Stage 3 faculty cue describes SpO2 improving to 94% on 15 L/min, while stage 4 profile is 84% on 15 L/min. Keep response and timing unset pending faculty review.','No post-decompression recovery profile is supplied. Urgent intervention is not gated by SBAR.']
out[0]['review']+=['Stage 3 labels hypotension at BP 116/76: clarify relative reduction versus intended target.','Source cue gates ECG release on complete history: preserved as source wording, not a software lock.']
json.dump(out,open('functions/content/scenarios.json','w'),indent=2)
