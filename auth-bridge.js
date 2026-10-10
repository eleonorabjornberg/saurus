/* Content-script bridge. No session tokens ever leave the worker. */
(function () {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
  let userId = null;
  window.SaurusAccount = {
    request(type, payload) {
      return new Promise((resolve, reject) => chrome.runtime.sendMessage({ channel: "saurus-account", type, payload }, (reply) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!reply?.ok) return reject(new Error(reply?.error || "Saurus couldn’t connect."));
        resolve(reply.data);
      }));
    },
    async require() {
      const state = await this.request("status");
      if (!state.user || !state.profile?.onboarded) {
        await this.request("open");
        return null;
      }
      userId = state.user.id;
      return state;
    },
    memory(op, args) { return this.request("memory", { op, args, expectedUserId: userId }); },
  };
})();
