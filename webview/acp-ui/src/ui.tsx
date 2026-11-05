import type { RefObject } from "react";
import type { WorkspacePathOpenTarget } from "../../../src/protocol/extensionHostMessages";
import { createRoot } from "react-dom/client";
import type { ChatState, ExtensionMessageAfterInit, InitPayload } from "./chatReducer";
import { AcpUiApp } from "./AcpUiApp";

export type { InitPayload } from "./chatReducer";

export type ChatView = {
    handleMessage(message: ExtensionMessageAfterInit): void;
};

/**
 * Mounts the ACP UI into `root`. Returns a view handle whose `handleMessage`
 * must be called for every non-init message received from the host.
 */
export function mountChatView(
    root: HTMLElement,
    init: InitPayload,
    postSend: (body: string) => void,
    postCancel: () => void,
    postRenameSession: (title: string) => void,
    postResetSession: () => void,
    postSetSessionModel: (modelId: string) => void,
    postSetSessionConfigOption: (
        configId: string,
        value: string | boolean,
    ) => void,
    postSaveHistory: (entries: string[]) => void,
    postPermissionResponse: (
        payload:
            | { requestId: string; selectedOptionId: string }
            | { requestId: string; cancelled: true },
    ) => void,
    initialChatState?: ChatState,
    postOpenNewChat?: () => void,
    postOpenWorkspacePath?: (
        path: string,
        options?: { target?: WorkspacePathOpenTarget },
    ) => void,
    postSetSessionModelSelection?: (provider: string, model: string) => void,
    postOpenProviderConfig?: () => void,
): ChatView {
    root.replaceChildren();
    root.className = "root agent-root";
    const extensionDispatchRef: RefObject<
        ((message: ExtensionMessageAfterInit) => void) | null
    > = {
        current: null,
    };
    const pendingExtensionMessages: ExtensionMessageAfterInit[] = [];
    const flushPendingExtensionMessages = (): void => {
        const dispatch = extensionDispatchRef.current;
        if (dispatch === null) {
            return;
        }
        for (const message of pendingExtensionMessages) {
            dispatch(message);
        }
        pendingExtensionMessages.length = 0;
    };
    const reactRoot = createRoot(root);
    reactRoot.render(
        <AcpUiApp
            init={init}
            initialChatState={initialChatState}
            postSend={postSend}
            postCancel={postCancel}
            postRenameSession={postRenameSession}
            postResetSession={postResetSession}
            postSetSessionModel={postSetSessionModel}
            postSetSessionConfigOption={postSetSessionConfigOption}
            postSaveHistory={postSaveHistory}
            postOpenNewChat={postOpenNewChat}
            postOpenWorkspacePath={postOpenWorkspacePath}
            postSetSessionModelSelection={postSetSessionModelSelection}
            postOpenProviderConfig={postOpenProviderConfig}
            postPermissionResponse={postPermissionResponse}
            extensionDispatchRef={extensionDispatchRef}
            onExtensionDispatchReady={flushPendingExtensionMessages}
        />,
    );
    return {
        handleMessage(message: ExtensionMessageAfterInit): void {
            const dispatch = extensionDispatchRef.current;
            if (dispatch === null) {
                pendingExtensionMessages.push(message);
                return;
            }
            dispatch(message);
        },
    };
}
