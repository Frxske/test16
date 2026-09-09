import OBR from "@owlbear-rodeo/sdk";
import { useEffect } from "react";

import {
  registerDicePlusResultListeners,
  rollWithDicePlus,
} from "../dicePlus";

export const useDice = () => {
  useEffect(() => {
    let wasJustTouchedOnMobile = false;
    let unregisterDicePlusListeners: () => void = () => undefined;
    const unregisterOnReady = OBR.isAvailable
      ? OBR.onReady(() => {
          unregisterDicePlusListeners = registerDicePlusResultListeners();
        })
      : () => undefined;

    const handleSetup = (event: Event) => {
      const eventTarget = event.target as HTMLElement;
      const diceNotation = eventTarget.dataset?.diceNotation;
      if (!diceNotation) return;

      if (event.type === "touchend") {
        event.preventDefault();
        event.stopPropagation();
      }

      // The notation on the element is already Dashboard Maker's final roll
      // expression (including modifiers/keep-highest/etc.). Forward that exact
      // string to Dice+ instead of running Dashboard Maker's internal roller.
      void rollWithDicePlus(diceNotation);
    };

    const handleClickSetup = (event: Event) => {
      if (wasJustTouchedOnMobile) {
        wasJustTouchedOnMobile = false;
        return;
      }
      handleSetup(event);
    };

    const handleTouchSetup = (event: Event) => {
      wasJustTouchedOnMobile = true;
      handleSetup(event);
    };

    document.addEventListener("mousedown", handleClickSetup);
    document.addEventListener("touchend", handleTouchSetup);

    return () => {
      document.removeEventListener("mousedown", handleClickSetup);
      document.removeEventListener("touchend", handleTouchSetup);
      unregisterOnReady();
      unregisterDicePlusListeners();
    };
  }, []);
};
