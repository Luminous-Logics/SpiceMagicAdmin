export default function Footer() {
  return (
    <footer
      style={{
        background: '#fff',
        borderTop: '1px solid #eee',
        padding: '20px 0',
        marginTop: 'auto',
        textAlign: 'center',
      }}
    >
      <div className="container">
        <p style={{ margin: 0, fontSize: 13, color: '#999' }}>
          © {new Date().getFullYear()} SpiceMagik Admin Panel. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
