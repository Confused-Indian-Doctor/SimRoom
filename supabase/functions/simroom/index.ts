import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyCommand,
  createSession,
  monitorState,
  validateScenario,
} from "../_shared/engine.js";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const check = (r: any) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return response({ message: "POST required" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return response({ message: "Sign in required" }, 401);
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user)
      return response({ message: "Invalid sign-in" }, 401);
    const uid = auth.data.user.id;
    const { operation, data = {} } = await req.json();
    const faculty = !!check(
      await db
        .from("instructors")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle(),
    );
    if (["create", "command", "saveScenario"].includes(operation) && !faculty)
      return response({ message: "Instructor access required" }, 403);
    const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,"0")).join("");
    if (operation === "pairRedeem") {
      if (!faculty) return response({message:"Sign in with an approved instructor account"},403);
      const result = check(await db.rpc("redeem_pair", {p_hash:await hash(String(data.token || data.code || "").toUpperCase()),p_user:uid,p_device:String(data.device || ""),p_replace:data.replace===true}));
      if (result.error) return response({message:result.error},409);
      return response(result);
    }
    if (["pairCreate","pairStatus","pairDisconnect","pairEnd"].includes(operation)) {
      const row=check(await db.from("sessions").select("id,owner,state").eq("id",data.session).maybeSingle());
      const member=check(await db.from("monitor_members").select("user_id").eq("session_id",data.session).eq("user_id",uid).maybeSingle());
      if (!row || !(member || faculty && row.owner===uid)) return response({message:"Session access required"},403);
      const link=check(await db.from("controller_links").select("user_id,device,seen_at").eq("session_id",row.id).maybeSingle());
      if(operation==="pairStatus") return response({pairingAvailable:!!check(await db.from("pair_challenges").select("session_id").eq("session_id",row.id).gt("expires_at",new Date().toISOString()).maybeSingle()),ended:row.state.status==="ended",connected:!!link && Date.now()-Date.parse(link.seen_at)<20000,paired:!!link,primary:!!link && link.user_id===uid && link.device===String(data.device||""),canEnd:faculty && (row.owner===uid || !!link && link.user_id===uid && link.device===String(data.device||"")),canDisconnect:faculty && (row.owner===uid || !!link && link.user_id===uid && link.device===String(data.device||""))});
      if(operation==="pairEnd") {
        if(!faculty || !(row.owner===uid || link?.user_id===uid && link?.device===String(data.device||"")))return response({message:"Controller or owner required"},403);
        const current=check(await db.from("sessions").select("state,revision").eq("id",row.id).single());
        const now=Number(check(await db.rpc("server_time")));const state=applyCommand(current.state,{id:crypto.randomUUID(),type:"end"},now);
        const accepted=check(await db.rpc("commit_session",{p_id:row.id,p_owner:row.owner,p_expected:current.revision,p_state:state,p_public:monitorState(state,now)}));
        if(!accepted)return response({message:"Session changed; retry ending"},409);return response({ended:true});
      }
      if(operation==="pairDisconnect") {
        if(!faculty || !(row.owner===uid || link?.user_id===uid && link?.device===String(data.device||""))) return response({message:"Controller or session owner required"},403);
        if(link)check(await db.from("revoked_controllers").upsert({session_id:row.id,user_id:link.user_id,device:link.device}));
        check(await db.from("controller_links").delete().eq("session_id",row.id));
        check(await db.from("pair_challenges").delete().eq("session_id",row.id));
        return response({disconnected:true});
      }
      if(row.state.status==="ended") return response({message:"Session ended"},409);
      const token=crypto.randomUUID().replaceAll("-","").toUpperCase();
      const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>"23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[x%31]).join("");
      const expiresAt=Date.now()+120000;
      check(await db.from("pair_challenges").upsert({session_id:row.id,token_hash:await hash(token),code_hash:await hash(code),expires_at:new Date(expiresAt).toISOString()}));
      return response({token,code,expiresAt});
    }
    if (["saveDraft","loadDraft"].includes(operation)) {
      if(!faculty) return response({message:"Instructor access required"},403);
      if(operation==="loadDraft") return response(check(await db.from("scenario_drafts").select("data").eq("user_id",uid).eq("id",String(data.id)).maybeSingle()));
      if(JSON.stringify(data.scenario).length>300000) throw Error("Draft exceeds size limit");
      check(await db.from("scenario_drafts").upsert({user_id:uid,id:String(data.scenario.id),data:data.scenario,updated_at:new Date().toISOString()}));
      return response({saved:true});
    }
    if (operation === "create") {
      const scenario = check(
        await db
          .from("scenarios")
          .select("data")
          .eq("id", data.scenario)
          .single(),
      ).data;
      const id = crypto.randomUUID(),
        code = crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 8)
          .toUpperCase(),
        now = Number(check(await db.rpc("server_time")));
      const state = { ...createSession(scenario, uid, now), code };
      check(
        await db.rpc("create_session", {
          p_id: id,
          p_owner: uid,
          p_code: code,
          p_state: state,
          p_public: monitorState(state, now),
        }),
      );
      return response({ id, code });
    }
    if (operation === "join") {
      const row = check(
        await db
          .from("sessions")
          .select("id,state")
          .eq("code", String(data.code || "").toUpperCase())
          .maybeSingle(),
      );
      if (!row) return response({ message: "Unknown session code" }, 404);
      if (row.state.status === "ended")
        return response({ message: "Session ended" }, 409);
      check(
        await db
          .from("monitor_members")
          .upsert({ session_id: row.id, user_id: uid }),
      );
      return response({ id: row.id });
    }
    if (operation === "command") {
      for (let retry = 0; retry < 8; retry++) {
        const row = check(
          await db
            .from("sessions")
            .select("*")
            .eq("id", data.session)
            .maybeSingle(),
        );
        if (!row)
          return response({ message: "Session owner required" }, 403);
        const now = Number(check(await db.rpc("server_time"))),
          state = applyCommand(row.state, data.command, now);
        const link=check(await db.from("controller_links").select("user_id,device").eq("session_id",row.id).maybeSingle());
        if(!faculty || (link ? link.user_id!==uid || link.device!==String(data.device||"") : row.owner!==uid)) return response({message:"Another device controls this session; pair or confirm takeover"},403);
        if(check(await db.from("revoked_controllers").select("device").eq("session_id",row.id).eq("user_id",uid).eq("device",String(data.device||"")).maybeSingle()))return response({message:"Controller disconnected; pair again"},403);
        if(state.revision===row.revision) return response({revision:state.revision});
        const accepted = check(
          await db.rpc("control_commit", {
            p_id: row.id,
            p_actor: uid,
            p_device: String(data.device || ""),
            p_expected: row.revision,
            p_state: state,
            p_public: monitorState(state, now),
          }),
        );
        if (accepted) return response({ revision: state.revision });
      }
      return response(
        { message: "Session busy; retry the same command identifier" },
        409,
      );
    }
    if (operation === "saveScenario") {
      const draft = validateScenario(data.scenario);
      if (!/^[a-z0-9-]+$/.test(draft.id))
        throw Error("Invalid scenario identifier");
      return response(check(await db.rpc("save_scenario", { p_draft: draft })));
    }
    if (operation === "asset") {
      const row = check(
        await db
          .from("sessions")
          .select("owner,state")
          .eq("id", data.session)
          .maybeSingle(),
      );
      if (!row) return response({ message: "Session not found" }, 404);
      const member = !!check(
        await db
          .from("monitor_members")
          .select("user_id")
          .eq("session_id", data.session)
          .eq("user_id", uid)
          .maybeSingle(),
      );
      if (
        !(faculty && (row.owner === uid || !!check(await db.from("controller_links").select("user_id").eq("session_id",data.session).eq("user_id",uid).maybeSingle()))) &&
        (!member || !row.state.investigations[data.investigation]?.released)
      )
        return response({ message: "Result not released" }, 403);
      const item = row.state.scenario.investigations.find(
        (i: any) => i.id === data.investigation,
      );
      if (item?.report) {
        const bytes = new TextEncoder().encode(item.report);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return response({
          data: btoa(binary),
          mime: "text/plain;charset=utf-8",
        });
      }
      if (!item?.assetPath) return response({ message: "Asset missing" }, 404);
      const blob = check(
        await db.storage
          .from("investigations")
          .download(item.assetPath.replace(/^investigations\//, "")),
      );
      if (blob.size > 10485760) throw Error("Asset too large");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return response({ data: btoa(binary), mime: blob.type });
    }
    return response({ message: "Unknown operation" }, 400);
  } catch (e) {
    return response({ message: (e as Error).message }, 400);
  }
});
