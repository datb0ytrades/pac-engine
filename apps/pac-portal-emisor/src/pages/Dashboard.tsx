import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocumentDetailResponse } from '@pac/shared-types';
import { supabase } from '../lib/supabase';
import { getInvoices } from '../services/pac-api';

interface Props {
  session: Session;
}

export function Dashboard({ session }: Props) {
  const [documents, setDocuments] = useState<DocumentDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInvoices({ limit: 20 })
      .then((res) => setDocuments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1>PAC Emisor - Dashboard</h1>
        <div>
          <span style={{ marginRight: 16 }}>{session.user.email}</span>
          <button onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <h2>Facturas recientes</h2>

      {loading ? (
        <p>Cargando facturas...</p>
      ) : documents.length === 0 ? (
        <p>No hay facturas emitidas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>CUFE</th>
              <th style={th}>Tipo</th>
              <th style={th}>Receptor</th>
              <th style={th}>Total</th>
              <th style={th}>Estado</th>
              <th style={th}>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td style={td}>{doc.cufe?.slice(0, 12)}...</td>
                <td style={td}>{doc.docType}</td>
                <td style={td}>{doc.receiverName ?? '-'}</td>
                <td style={td}>${doc.totalAmount.toFixed(2)} {doc.currency}</td>
                <td style={td}>{doc.status}</td>
                <td style={td}>{new Date(doc.emissionDate).toLocaleDateString('es-PA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #ddd',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #eee',
};
