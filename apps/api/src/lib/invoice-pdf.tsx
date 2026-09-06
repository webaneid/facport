import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// § Fase 15, ADR-0021 — generator PDF SERVER-SIDE murni (React elemen →
// PDF langsung), TANPA browser/Chromium. SATU-SATUNYA pemakai JSX di
// apps/api (§ tsconfig.json `jsx: react-jsx`). Lihat architecture-invoice.md.

export type InvoicePdfItem = { label: string; price: number };

export type InvoicePdfData = {
  invoiceNumber: string;
  createdAt: Date;
  dueDate: Date;
  billToName: string;
  billToAddress: string | null;
  items: InvoicePdfItem[];
  subtotal: number;
  total: number;
  company: {
    name: string;
    address: string | null;
    logoUrl: string | null;
    taxId: string | null;
    phone: string | null;
    email: string | null;
    bankAccount: string | null;
  };
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  headerLeft: { flexDirection: "column", gap: 4, maxWidth: 280 },
  logo: { width: 100, height: "auto", marginBottom: 6, objectFit: "contain" },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  companyDetail: { fontSize: 9, color: "#555555" },
  headerRight: { flexDirection: "column", alignItems: "flex-end", gap: 3 },
  invoiceTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  invoiceNumber: { fontSize: 10, color: "#555555" },
  invoiceDate: { fontSize: 9, color: "#555555" },
  billTo: { marginBottom: 20, gap: 2 },
  billToLabel: { fontSize: 9, color: "#888888", textTransform: "uppercase" },
  billToName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  billToDetail: { fontSize: 9, color: "#555555" },
  table: { borderTop: "1px solid #dddddd", borderBottom: "1px solid #dddddd", marginBottom: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 8, borderBottom: "1px solid #eeeeee" },
  tableHeaderRow: { backgroundColor: "#f5f5f5", borderBottom: "1px solid #dddddd" },
  tableCell: { fontSize: 10 },
  tableCellLabel: { flex: 1 },
  tableCellPrice: { width: 120, textAlign: "right" },
  totals: { alignItems: "flex-end", marginTop: 8, marginBottom: 24 },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 10, color: "#555555" },
  totalsValue: { fontSize: 10 },
  totalsRowFinal: { borderTop: "1px solid #dddddd", marginTop: 4, paddingTop: 6 },
  totalsLabelFinal: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalsValueFinal: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  footer: { borderTop: "1px solid #dddddd", paddingTop: 12, gap: 3 },
  footerTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: "#888888", marginBottom: 2 },
  footerText: { fontSize: 9, color: "#555555" },
});

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

// § timezone company (Asia/Jakarta hardcode fallback) — PDF cuma perlu
// TAMPILKAN tanggal, bukan simpan (aturan timestamptz UTC di DB tidak
// berubah, § architecture-settings.md § "Aturan Timezone").
function formatTanggal(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const hasFooter = data.company.bankAccount || data.company.phone || data.company.email || data.company.taxId;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.company.logoUrl && <Image src={data.company.logoUrl} style={styles.logo} />}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.address && <Text style={styles.companyDetail}>{data.company.address}</Text>}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>Tanggal: {formatTanggal(data.createdAt)}</Text>
            <Text style={styles.invoiceDate}>Jatuh Tempo: {formatTanggal(data.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Ditagihkan kepada</Text>
          <Text style={styles.billToName}>{data.billToName}</Text>
          {data.billToAddress && <Text style={styles.billToDetail}>{data.billToAddress}</Text>}
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableCell, styles.tableCellLabel]}>Deskripsi</Text>
            <Text style={[styles.tableCell, styles.tableCellPrice]}>Harga</Text>
          </View>
          {data.items.map((item, i) => (
            // eslint-disable-next-line react/no-array-index-key -- baris invoice immutable/snapshot, tidak pernah reorder
            <View style={styles.tableRow} key={i}>
              <Text style={[styles.tableCell, styles.tableCellLabel]}>{item.label}</Text>
              <Text style={[styles.tableCell, styles.tableCellPrice]}>{formatRupiah(item.price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatRupiah(data.subtotal)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsRowFinal]}>
            <Text style={styles.totalsLabelFinal}>Total</Text>
            <Text style={styles.totalsValueFinal}>{formatRupiah(data.total)}</Text>
          </View>
        </View>

        {hasFooter && (
          <View style={styles.footer}>
            <Text style={styles.footerTitle}>Instruksi Pembayaran</Text>
            {data.company.bankAccount && <Text style={styles.footerText}>{data.company.bankAccount}</Text>}
            {data.company.taxId && <Text style={styles.footerText}>NPWP: {data.company.taxId}</Text>}
            {data.company.phone && <Text style={styles.footerText}>Telp: {data.company.phone}</Text>}
            {data.company.email && <Text style={styles.footerText}>Email: {data.company.email}</Text>}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
