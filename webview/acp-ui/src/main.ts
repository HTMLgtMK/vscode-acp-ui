import type {
  AcpUiHistoryReplayEvent,
  ExtensionToWebviewMessage,
} from "../../../src/protocol/extensionHostMessages";
import "./global.css";
import "./boot.css";
import type { ChatState, ExtensionMessageAfterInit, InitPayload } from "./chatReducer";
import { createVsCodeAcpUiHost } from "./host";
import type { ChatView } from "./ui";

function isInitPayload(message: ExtensionToWebviewMessage): message is InitPayload {
  return message.type === "init";
}

const mount = document.getElementById("root");
if (!mount) {
  throw new Error("Missing #root");
}

mount.classList.add("root", "agent-root");
if (mount.querySelector(".acp-ui-boot") === null) {
  const bootLine = document.createElement("div");
  bootLine.className = "acp-ui-boot";
  const bootSpinner = document.createElement("div");
  bootSpinner.className = "acp-ui-boot__spinner";
  bootSpinner.setAttribute("aria-hidden", "true");
  const bootText = document.createElement("span");
  bootText.textContent = "Connecting...";
  bootLine.append(bootSpinner, bootText);
  mount.appendChild(bootLine);
}

const host = createVsCodeAcpUiHost();
let view: ChatView | null = null;
let mountPromise: Promise<void> | null = null;
let initReceived = false;
let pendingInit: InitPayload | null = null;
let pendingHistory: AcpUiHistoryReplayEvent[] | undefined;
let pendingSessionHistoryLoading = false;
const pendingExtensionMessages: ExtensionMessageAfterInit[] = [];

function flushPendingExtensionMessages(): void {
  if (view === null) {
    return;
  }
  for (const message of pendingExtensionMessages) {
    view.handleMessage(message);
  }
  pendingExtensionMessages.length = 0;
}

function applyPendingSessionHistoryLoading(state: ChatState): ChatState {
  if (!pendingSessionHistoryLoading) {
    return state;
  }
  return {
    ...state,
    sessionHistoryLoading: true,
    viewportCacheActive: state.trace.length > 0 || state.viewportCacheActive,
  };
}

function tryMountView(): void {
  if (view !== null || pendingInit === null || mountPromise !== null) {
    return;
  }
  initReceived = true;
  clearTimeout(initRetryTimer);
  mountPromise = mountView().catch((error: unknown) => {
    mountPromise = null;
    initReceived = false;
    console.error(error);
  });
}

async function mountView(): Promise<void> {
  const init = pendingInit;
  if (init === null) {
    return;
  }
  const [{ mountChatView }, { createChatStateFromInit, replayChatState }, { setCompactToolPathHome }] =
    await Promise.all([import("./ui"), import("./chatReducer"), import("./toolCallCompactText")]);
  if (view !== null || pendingInit === null) {
    return;
  }
  if (init.homeDir !== undefined && init.homeDir.length > 0) {
    setCompactToolPathHome(init.homeDir);
  }
  const initialChatState =
    pendingHistory !== undefined && pendingHistory.length > 0
      ? applyPendingSessionHistoryLoading(replayChatState(init, pendingHistory))
      : applyPendingSessionHistoryLoading(createChatStateFromInit(init));
  view = mountChatView(
    mount as HTMLElement,
    init,
    (body) => {
      host.post({ type: "send", body });
    },
    () => {
      host.post({ type: "cancel" });
    },
    (title) => {
      host.post({ type: "renameSession", title });
    },
    () => {
      host.post({ type: "resetSession" });
    },
    (modelId) => {
      host.post({ type: "setSessionModel", modelId });
    },
    (configId, value) => {
      host.post({ type: "setSessionConfigOption", configId, value });
    },
    (entries) => {
      host.post({ type: "saveHistory", entries });
    },
    (payload) => {
      host.post({ type: "permissionResponse", ...payload });
    },
    (payload) => {
      host.post({ type: "cursorAskQuestionResponse", ...payload });
    },
    (payload) => {
      host.post({ type: "cursorCreatePlanResponse", ...payload });
    },
    initialChatState,
    () => {
      host.post({ type: "openNewChat" });
    },
    (path, options) => {
      host.post({
        type: "openWorkspacePath",
        path,
        ...(options?.target === "auto" ? { target: "auto" } : {}),
      });
    },
    (items) => {
      host.post({ type: "saveVisibleTrace", items });
    },
  );
  flushPendingExtensionMessages();
}

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
  if (message.type === "sessionHistoryLoading") {
    if (view !== null) {
      view.handleMessage(message);
      return;
    }
    pendingSessionHistoryLoading = message.loading;
    return;
  }
  if (isInitPayload(message)) {
    if (view !== null) {
      return;
    }
    pendingInit = message;
    tryMountView();
    return;
  }
  if (message.type === "historyReplay") {
    if (view !== null) {
      return;
    }
    pendingHistory = message.events;
    tryMountView();
    return;
  }
  if (view !== null) {
    view.handleMessage(message);
    return;
  }
  pendingExtensionMessages.push(message);
});

host.post({ type: "ready" });
const initRetryTimer = window.setTimeout(() => {
  if (!initReceived) {
    host.post({ type: "ready" });
  }
}, 750);
