import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  useFloatingDockUiStore,
  type FloatingDockUiState,
} from "../store/floatingDockUiStore";

function resetStore() {
  useFloatingDockUiStore.setState({
    dockVisible: false,
    dockKind: null,
    footingOwner: "nav",
    navExpandedByUser: false,
    dockBottom: 24,
  } satisfies Partial<FloatingDockUiState>);
}

describe("floatingDockUiStore footing", () => {
  beforeEach(() => resetStore());

  it("Track appearing collapses nav to dock footing immediately", () => {
    const { setDockVisible } = useFloatingDockUiStore.getState();
    setDockVisible(true, "track");
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockVisible, true);
    assert.equal(s.dockKind, "track");
    assert.equal(s.footingOwner, "dock");
    assert.equal(s.navExpandedByUser, false);
  });

  it("Track disappearing restores nav footing without sticky edge state", () => {
    const { setDockVisible, expandNav } = useFloatingDockUiStore.getState();
    setDockVisible(true, "track");
    expandNav();
    assert.equal(useFloatingDockUiStore.getState().footingOwner, "nav");
    setDockVisible(false);
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockVisible, false);
    assert.equal(s.dockKind, null);
    assert.equal(s.footingOwner, "nav");
    assert.equal(s.navExpandedByUser, false);
  });

  it("stale cart→track kind swap does not flip footing if user expanded nav", () => {
    const { setDockVisible, expandNav } = useFloatingDockUiStore.getState();
    setDockVisible(true, "cart");
    expandNav();
    setDockVisible(true, "track");
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockKind, "track");
    assert.equal(s.footingOwner, "nav");
    assert.equal(s.navExpandedByUser, true);
  });

  it("rapid visible toggles end on the latest value", () => {
    const { setDockVisible } = useFloatingDockUiStore.getState();
    setDockVisible(true, "track");
    setDockVisible(false);
    setDockVisible(true, "cart");
    setDockVisible(false);
    setDockVisible(true, "track");
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockVisible, true);
    assert.equal(s.dockKind, "track");
    assert.equal(s.footingOwner, "dock");
  });
});
