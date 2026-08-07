/** Decorative bottom-left mesh glow for premium dark sidebars (queue / control dashboard). */
export function DarkSidebarMeshBackground() {
  return (
    <div className="dark-sidebar-chrome__mesh" aria-hidden>
      <div className="dark-sidebar-chrome__glow" />
      <div className="dark-sidebar-chrome__mesh-art" />
      <div className="dark-sidebar-chrome__mesh-fade" />
    </div>
  );
}
