import OBR from "@owlbear-rodeo/sdk";

import randomUUID from "../uid";

export const DASHBOARD_MAKER_EXTENSION_ID = "com.roberttate.dashboard-maker";

const DICE_PLUS_READY_CHANNEL = "dice-plus/isReady";
const DICE_PLUS_ROLL_REQUEST_CHANNEL = "dice-plus/roll-request";
const DICE_PLUS_READY_TIMEOUT_MS = 800;

const pendingRollIds = new Set<string>();
let resultListenersRegistered = false;

interface DicePlusReadyMessage {
  requestId?: string;
  ready?: boolean;
}

interface DicePlusRollResultMessage {
  rollId?: string;
}

interface DicePlusRollErrorMessage {
  rollId?: string;
  error?: string;
  message?: string;
}

const showDicePlusUnavailable = async () => {
  const message =
    "Dice+ is not available. Enable Dice+ to roll from Dashboard Maker.";

  if (OBR.isAvailable) {
    await OBR.notification.show(message, "ERROR");
  } else {
    window.alert(message);
  }
};

const waitForDicePlusReady = async (): Promise<boolean> => {
  if (!OBR.isAvailable) return false;

  const requestId = randomUUID();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
      resolve(ready);
    };

    unsubscribe = OBR.broadcast.onMessage(DICE_PLUS_READY_CHANNEL, (event) => {
      const data = event.data as DicePlusReadyMessage;

      // Ignore our own request and any unrelated responses. A valid response
      // must explicitly contain `ready` and match the request ID.
      if (
        data?.requestId === requestId &&
        Object.prototype.hasOwnProperty.call(data, "ready") &&
        data.ready === true
      ) {
        finish(true);
      }
    });

    const timeoutId = window.setTimeout(
      () => finish(false),
      DICE_PLUS_READY_TIMEOUT_MS,
    );

    void OBR.broadcast
      .sendMessage(
        DICE_PLUS_READY_CHANNEL,
        { requestId, timestamp: Date.now() },
        { destination: "ALL" },
      )
      .catch(() => finish(false));
  });
};

export const registerDicePlusResultListeners = () => {
  if (!OBR.isAvailable || resultListenersRegistered) return () => undefined;

  resultListenersRegistered = true;

  const unsubscribeResult = OBR.broadcast.onMessage(
    `${DASHBOARD_MAKER_EXTENSION_ID}/roll-result`,
    (event) => {
      const data = event.data as DicePlusRollResultMessage;
      if (!data?.rollId || !pendingRollIds.has(data.rollId)) return;

      // Dice+ is responsible for displaying the result because showResults is
      // true. Dashboard Maker only tracks completion to avoid duplicate UI.
      pendingRollIds.delete(data.rollId);
    },
  );

  const unsubscribeError = OBR.broadcast.onMessage(
    `${DASHBOARD_MAKER_EXTENSION_ID}/roll-error`,
    (event) => {
      const data = event.data as DicePlusRollErrorMessage;
      if (!data?.rollId || !pendingRollIds.has(data.rollId)) return;

      pendingRollIds.delete(data.rollId);
      const errorMessage = data.error || data.message || "Dice+ could not complete the roll.";
      void OBR.notification.show(errorMessage, "ERROR");
    },
  );

  return () => {
    unsubscribeResult();
    unsubscribeError();
    resultListenersRegistered = false;
  };
};

export const rollWithDicePlus = async (diceNotation: string) => {
  const ready = await waitForDicePlusReady();
  if (!ready) {
    await showDicePlusUnavailable();
    return;
  }

  const [playerId, playerName] = await Promise.all([
    OBR.player.getId(),
    OBR.player.getName(),
  ]);
  const rollId = randomUUID();

  pendingRollIds.add(rollId);

  try {
    await OBR.broadcast.sendMessage(
      DICE_PLUS_ROLL_REQUEST_CHANNEL,
      {
        rollId,
        playerId,
        playerName,
        rollTarget: "everyone",
        diceNotation,
        showResults: true,
        timestamp: Date.now(),
        source: DASHBOARD_MAKER_EXTENSION_ID,
      },
      { destination: "ALL" },
    );
  } catch {
    pendingRollIds.delete(rollId);
    await OBR.notification.show("Dice+ could not complete the roll.", "ERROR");
  }
};
