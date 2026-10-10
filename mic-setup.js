"use strict";
const status = document.getElementById("status");
async function allow() {
  status.textContent = "Waiting for your answer…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = "Done! You can close this tab and hold to talk on any site.";
  } catch (e) {
    status.textContent = e && e.name === "NotAllowedError"
      ? "Blocked. Click the icon at the left of the address bar, set Microphone to Allow, then try again."
      : `Couldn't open the microphone: ${(e && e.message) || e}`;
  }
}
document.getElementById("allow").addEventListener("click", allow);
allow();
