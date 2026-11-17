import "fake-indexeddb/auto";
import { onlineManager } from "@tanstack/react-query";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { clearOfflineData } from "../shared/offline";

afterEach(async () => {
  cleanup();
  // Nothing stored on the "device" leaks into the next test.
  await clearOfflineData();
  onlineManager.setOnline(true);
});
