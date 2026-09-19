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
    navExpandedByUser: true,
    dockBottom: 24,
  } satisfies Partial<FloatingDockUiState>);
}

describe("floatingDockUiStore footing", () => {
  beforeEach(() => resetStore());

  it("Track appearing keeps full nav footing (no HOME edge swap)", () => {
    const { setDockVisible } = useFloatingDockUiStore.getState();
    setDockVisible(true, "track");
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockVisible, true);
    assert.equal(s.dockKind, "track");
    assert.equal(s.footingOwner, "nav");
    assert.equal(s.navExpandedByUser, true);
  });

  it("Track disappearing clears dock and keeps nav footing", () => {
    const { setDockVisible } = useFloatingDockUiStore.getState();
    setDockVisible(true, "track");
    setDockVisible(false);
    const s = useFloatingDockUiStore.getState();
    assert.equal(s.dockVisible, false);
    assert.equal(s.dockKind, null);
    assert.equal(s.footingOwner, "nav");
    assert.equal(s.navExpandedByUser, true);
  });

  it("cart→track kind swap keeps nav footing", () => {
    const { setDockVisible } = useFloatingDockUiStore.getState();
    setDockVisible(true, "cart");
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
    assert.equal(s.footingOwner, "nav");
  });
});
