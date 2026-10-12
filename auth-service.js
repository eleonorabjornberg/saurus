/* Single auth owner, instantiated only in the extension service worker. */
(function (root) {
  "use strict";
  const SESSION_KEY = "saurus.auth.v1";
  function storageAdapter(storage) {
    return {
      async getItem(key) { return (await storage.get(key))[key] ?? null; },
      async setItem(key, value) { await storage.set({ [key]: value }); },
      async removeItem(key) { await storage.remove(key); },
    };
  }
  function createAuthService({ createClient, config, storage, notify = () => {} }) {
    const client = createClient(config.url, config.anonKey, { auth: {
      storage: storageAdapter(storage), storageKey: SESSION_KEY,
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    } });
    let queue = Promise.resolve();
    const serial = (fn) => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next; };
    let eventQueue = Promise.resolve();
    client.auth.onAuthStateChange((event, currentSession) => {
      // Never await Supabase operations inside this callback (auth holds a lock).
      if (!["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED"].includes(event)) return;
      eventQueue = eventQueue.then(async () => {
        const key = "saurus.account-owner";
        const previous = (await storage.get(key))[key];
        const next = currentSession?.user?.id || null;
        await storage.set({ [key]: next });
        // SDK recovery may emit SIGNED_IN when the worker wakes. That isn't an
        // account switch, and must not close a running tutor on every wake-up.
        if (event === "SIGNED_OUT" || previous !== next) notify(event);
      }).catch(() => {});
    });
    async function session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error("We couldn’t reconnect. Your saved session is still here; please try again when you’re online.");
      return data.session;
    }
    async function memory(op, args = {}) {
      const s = await session();
      if (!s) throw new Error("Please sign in to continue.");
      // Neither identity nor tokens can be chosen by the caller.
      const { data, error } = await client.rpc("saurus_account_memory", { p_op: op, p_data: args });
      if (error) {
        if (op === "memory") {
          const cached = (await storage.get("memory:" + s.user.id + ":" + args.language))["memory:" + s.user.id + ":" + args.language];
          if (cached) return cached;
        }
        throw new Error("Your learning memory couldn’t sync. Check your connection and the account migration, then try again.");
      }
      if (op === "profile" || op === "onboard" || op === "preferences") await storage.set({ ["profile:" + s.user.id]: data });
      if (op === "memory") await storage.set({ ["memory:" + s.user.id + ":" + args.language]: data });
      return data;
    }
    async function status() {
      const s = await session();
      if (!s) return { user: null, profile: null };
      const user = { id: s.user.id, email: s.user.email };
      try { return { user, profile: await memory("profile"), offline: false }; }
      catch (_) {
        const profile = (await storage.get("profile:" + user.id))["profile:" + user.id];
        if (!profile) throw new Error("You’re signed in, but we couldn’t load your profile. Please retry when your connection is back. If this is setup, apply the account migration first.");
        return { user, profile, offline: true };
      }
    }
    async function handle(type, payload = {}) {
      if (type === "status") return status();
      if (type === "signin" || type === "signup") {
        const email = String(payload.email || "").trim();
        const password = String(payload.password || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
        if (type === "signup" && password.length < 8) throw new Error("Use at least 8 characters for your password.");
        // captchaToken: only when CAPTCHA is turned on (SAURUS_SUPABASE.captchaSiteKey).
        const options = payload.captchaToken ? { captchaToken: String(payload.captchaToken) } : undefined;
        const { data, error } = type === "signup"
          ? await client.auth.signUp({ email, password, options })
          : await client.auth.signInWithPassword({ email, password, options });
        if (error) {
          const messages = {
            invalid_credentials: "That email and password don’t match. Please try again.",
            email_not_confirmed: "Please confirm your email first, then come back to log in.",
            user_already_exists: "An account already exists for this email. Try logging in.",
            weak_password: "Please choose a stronger password with at least 8 characters.",
            over_email_send_rate_limit: "Please wait a moment before requesting another email.",
            captcha_failed: "Please complete the check that you’re not a robot, then try again.",
          };
          throw new Error(messages[error.code] || "We couldn’t complete sign-in. Check your connection and try again.");
        }
        // Supabase intentionally obscures duplicate signups when confirmation is enabled.
        if (!data.session) return { verification: true };
        return status();
      }
      if (type === "reset") {
        // Sends a link to set a new password (reset.html on Saurus's site).
        // Always reports success, so nobody can find out which emails have accounts.
        const email = String(payload.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
        if (!config.site) throw new Error("Password reset isn’t set up yet.");
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("reset.html", config.site).href,
          ...(payload.captchaToken ? { captchaToken: String(payload.captchaToken) } : {}),
        });
        if (error && error.code === "over_email_send_rate_limit") throw new Error("Please wait a moment before requesting another email.");
        if (error && error.code === "captcha_failed") throw new Error("Please complete the check that you’re not a robot, then try again.");
        if (error) throw new Error("We couldn’t send the email. Check your connection and try again.");
        return { sent: true };
      }
      if (type === "delete") {
        // Deletes the account and everything Saurus stored for it. The password
        // is checked again first, so an unlocked computer isn't enough.
        const current = await session();
        if (!current) throw new Error("Please sign in to continue.");
        const check = await client.auth.signInWithPassword({ email: current.user.email, password: String(payload.password || ""),
          options: payload.captchaToken ? { captchaToken: String(payload.captchaToken) } : undefined });
        if (check.error?.code === "captcha_failed") throw new Error("Please complete the check that you’re not a robot, then try again.");
        if (check.error || check.data.user?.id !== current.user.id) throw new Error("That password isn’t right.");
        const { error } = await client.rpc("saurus_delete_account");
        if (error) throw new Error("Your account couldn’t be deleted. Check your connection and try again.");
        const id = current.user.id;
        await storage.remove(["profile:" + id, ...["fr", "de", "es", "sv", "hi", "it", "pt", "zh"].map((l) => "memory:" + id + ":" + l)]);
        await client.auth.signOut({ scope: "local" });
        return { user: null, profile: null, deleted: true };
      }
      if (type === "signout") {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw new Error("Sign out couldn’t finish. Please reconnect and try again.");
        return { user: null, profile: null };
      }
      if (type === "memory") {
        if (payload.expectedUserId !== undefined) {
          const current = await session();
          if (!current || current.user.id !== payload.expectedUserId) throw new Error("Your account changed. Open Saurus again to continue.");
        }
        const allowed = ["profile", "onboard", "preferences", "memory", "level", "answer", "summary"];
        if (!allowed.includes(payload.op)) throw new Error("Unsupported memory operation.");
        if (payload.op !== "profile" && !["fr", "de", "es", "sv", "hi", "it", "pt", "zh"].includes(payload.args?.language)) throw new Error("Choose a supported language.");
        return memory(payload.op, payload.args || {});
      }
      if (type === "ticket") {
        // A ten-minute pass for the Gemini function. It identifies the user
        // for the free-tier limits without the session token leaving the worker.
        const current = await session();
        if (!current) throw new Error("Please sign in to continue.");
        if (payload.expectedUserId !== undefined && current.user.id !== payload.expectedUserId) throw new Error("Your account changed. Open Saurus again to continue.");
        const { data, error } = await client.rpc("saurus_gemini_ticket");
        if (error || !data?.ticket) throw new Error("Saurus couldn’t check your free allowance. Check your connection and that the usage migration is applied.");
        return data;
      }
      throw new Error("Unsupported account operation.");
    }
    return { handle: (type, payload) => serial(() => handle(type, payload)), refresh: () => serial(session), dispose: () => client.auth.stopAutoRefresh() };
  }
  root.SaurusAuthService = { createAuthService, storageAdapter, SESSION_KEY };
  if (typeof module !== "undefined") module.exports = root.SaurusAuthService;
})(globalThis);
