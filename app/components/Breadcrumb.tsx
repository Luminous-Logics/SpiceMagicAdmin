import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  title: string;
  items: BreadcrumbItem[];
}

//comment added to push to github for release purposes

export default function Breadcrumb({ title, items }: BreadcrumbProps) {
  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '1px solid #eee',
        padding: '10px 0',
      }}
    >
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#222' }}>{title}</h2>
          <nav aria-label="breadcrumb">
            <ol style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
              {items.map((item, index) => (
                <li key={index} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {index > 0 && (
                    <span style={{ color: '#ccc', fontSize: 12 }}>/</span>
                  )}
                  {item.href ? (
                    <Link href={item.href} style={{ color: '#E31E24', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                      {item.label}
                    </Link>
                  ) : (
                    <span style={{ color: '#666', fontSize: 13 }}>{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </div>
  );
}
