export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
      }}
    >
      <div className="logo">
        Gati<span>Mitra</span>
      </div>
      <div className="header-right">
        <div className="user-info">
          <div className="avatar">B</div>
          <div>Bhimpratap.M...</div>
        </div>
      </div>
    </header>
  );
}
