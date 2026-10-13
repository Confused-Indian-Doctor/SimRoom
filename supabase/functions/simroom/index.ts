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
        if (!row || row.owner !== uid)
          return response({ message: "Session owner required" }, 403);
        const now = Number(check(await db.rpc("server_time"))),
          state = applyCommand(row.state, data.command, now);
        if (state.revision === row.revision)
          return response({ revision: state.revision });
        const accepted = check(
          await db.rpc("commit_session", {
            p_id: row.id,
            p_owner: uid,
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
        !(faculty && row.owner === uid) &&
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
